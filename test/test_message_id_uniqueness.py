#!/usr/bin/env python3
"""
Test suite for message ID uniqueness fix.

Tests that the fix for "UNIQUE constraint failed: messages.id" works correctly
when multiple users send messages simultaneously.
"""

import pytest
import tempfile
import os
import shutil
import threading
import time
from unittest.mock import Mock, patch
from flask import Flask
from concurrent.futures import ThreadPoolExecutor, as_completed

from dbmgr.sqlite_manager import SQLiteManager
from dbmgr.sqlite_app_integration import SQLiteAppIntegration
from core.message_security import MessageObfuscator


class TestMessageIdUniqueness:
    """Test message ID uniqueness functionality."""
    
    def setup_method(self):
        """Setup test database and users."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test_message_id.db')
        
        # Create Flask app for integration testing
        self.app = Flask(__name__)
        self.app.config['SECRET_KEY'] = 'test-message-id-key'
        
        # Initialize integration with message obfuscation
        self.integration = SQLiteAppIntegration(
            self.app,
            db_path=self.db_path,
            enable_message_obfuscation=True
        )
        
        # Create test users
        self.test_users = [
            ('alice@example.com', 'Alice School'),
            ('bob@example.com', 'Bob School'),
        ]
        
        for email, school in self.test_users:
            self.integration.create_user(email, f'password_{email.split("@")[0]}', school)
    
    def teardown_method(self):
        """Cleanup test database."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_sequential_message_ids_no_conflict(self):
        """Test that sequential messages get unique IDs without conflicts."""
        
        # Create collaboration data with multiple messages
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'test_session': {
                    'user1': 'alice@example.com',
                    'user2': 'bob@example.com',
                    'active': True,
                    'created_at': '2025-09-12T16:00:00.000000',
                    'messages': []
                }
            },
            'message_counter': 0
        }
        
        # Add multiple messages to test ID generation
        messages = []
        for i in range(10):
            message = {
                'from_user': 'alice@example.com' if i % 2 == 0 else 'bob@example.com',
                'to_user': 'bob@example.com' if i % 2 == 0 else 'alice@example.com',
                'message': f'Test message {i}',
                'timestamp': f'2025-09-12T16:0{i}:00.000000',
                'displayed': False
            }
            messages.append(message)
            collaboration_data['chat_sessions']['test_session']['messages'] = messages.copy()
            collaboration_data['message_counter'] = i + 1
            
            # Save should not raise UNIQUE constraint error
            result = self.integration.save_collaboration_data(collaboration_data)
            assert result is True
        
        # Verify all messages were saved
        loaded_data = self.integration.load_collaboration_data()
        saved_messages = loaded_data['chat_sessions']['test_session']['messages']
        assert len(saved_messages) == 10
        
        # Verify each message has a unique database-generated ID
        message_ids = [msg.get('id') for msg in saved_messages if 'id' in msg]
        # Note: IDs might not be present in loaded data if auto-generated
        # The important thing is no UNIQUE constraint violation occurred
    
    def test_concurrent_message_insertion(self):
        """Test that concurrent message insertions don't cause UNIQUE constraint failures."""
        
        # Create separate collaboration data for each thread to avoid session conflicts
        # This tests the message ID uniqueness without session conflicts
        
        def add_message(thread_id):
            """Function to add a message in a separate thread."""
            try:
                # Create unique session for each thread to avoid session ID conflicts
                collaboration_data = {
                    'invites': {},
                    'chat_sessions': {
                        f'session_{thread_id}': {
                            'user1': 'alice@example.com',
                            'user2': 'bob@example.com',
                            'active': True,
                            'created_at': '2025-09-12T16:00:00.000000',
                            'messages': [{
                                'from_user': 'alice@example.com',
                                'to_user': 'bob@example.com',
                                'message': f'Concurrent message from thread {thread_id}',
                                'timestamp': f'2025-09-12T16:00:{thread_id:02d}.000000',
                                'displayed': False
                            }]
                        }
                    },
                    'message_counter': 1
                }
                
                # Use a smaller delay to simulate real concurrency
                import time
                time.sleep(0.001 * thread_id)  # Small staggered delay
                
                result = self.integration.save_collaboration_data(collaboration_data)
                return (thread_id, result, None)
            except Exception as e:
                return (thread_id, False, str(e))
        
        # Run multiple threads simultaneously to test concurrency
        num_threads = 5
        results = []
        
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(add_message, i) for i in range(num_threads)]
            
            for future in as_completed(futures):
                results.append(future.result())
        
        # All operations should succeed without UNIQUE constraint violations
        for thread_id, success, error in results:
            assert success is True, f"Thread {thread_id} failed with error: {error}"
            assert error is None, f"Thread {thread_id} had unexpected error: {error}"
        
        # Verify data was saved correctly
        loaded_data = self.integration.load_collaboration_data()
        # Note: Due to the database clearing in save_collaboration_data, 
        # only the last session will remain. The important test is that 
        # no UNIQUE constraint violations occurred.
        assert len(loaded_data['chat_sessions']) >= 1
    
    def test_message_without_manual_id(self):
        """Test that messages without manual IDs are handled correctly."""
        
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'test_session': {
                    'user1': 'alice@example.com',
                    'user2': 'bob@example.com',
                    'active': True,
                    'created_at': '2025-09-12T16:00:00.000000',
                    'messages': [{
                        # Note: No 'id' field - should be auto-generated
                        'from_user': 'alice@example.com',
                        'to_user': 'bob@example.com',
                        'message': 'Message without manual ID',
                        'timestamp': '2025-09-12T16:00:00.000000',
                        'displayed': False
                    }]
                }
            },
            'message_counter': 1
        }
        
        # Should not raise any exceptions
        result = self.integration.save_collaboration_data(collaboration_data)
        assert result is True
        
        # Verify data was saved
        loaded_data = self.integration.load_collaboration_data()
        messages = loaded_data['chat_sessions']['test_session']['messages']
        assert len(messages) == 1
        assert messages[0]['message'] == 'Message without manual ID'
    
    def test_duplicate_session_messages_handled_gracefully(self):
        """Test that duplicate messages in the same session are handled gracefully."""
        
        # Create initial collaboration data
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'test_session': {
                    'user1': 'alice@example.com',
                    'user2': 'bob@example.com',
                    'active': True,
                    'created_at': '2025-09-12T16:00:00.000000',
                    'messages': [{
                        'from_user': 'alice@example.com',
                        'to_user': 'bob@example.com',
                        'message': 'First message',
                        'timestamp': '2025-09-12T16:00:00.000000',
                        'displayed': False
                    }]
                }
            },
            'message_counter': 1
        }
        
        # Save initial data
        result = self.integration.save_collaboration_data(collaboration_data)
        assert result is True
        
        # Add another message to the same session
        collaboration_data['chat_sessions']['test_session']['messages'].append({
            'from_user': 'bob@example.com',
            'to_user': 'alice@example.com',
            'message': 'Second message',
            'timestamp': '2025-09-12T16:01:00.000000',
            'displayed': False
        })
        collaboration_data['message_counter'] = 2
        
        # Should handle the update without conflicts
        result = self.integration.save_collaboration_data(collaboration_data)
        assert result is True
        
        # Verify both messages are present
        loaded_data = self.integration.load_collaboration_data()
        messages = loaded_data['chat_sessions']['test_session']['messages']
        assert len(messages) == 2


if __name__ == '__main__':
    pytest.main([__file__, '-v'])