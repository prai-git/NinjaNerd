"""
Unit tests for SQLite application integration.
Tests Flask app integration, message obfuscation, and compatibility layers.
"""

import pytest
import tempfile
import os
import shutil
import json
from unittest.mock import Mock, patch
from flask import Flask

from dbmgr.sqlite_app_integration import SQLiteAppIntegration, initialize_app_db, get_app_db, reset_app_db
from core.message_security import MessageObfuscator


class TestSQLiteAppIntegration:
    """Test SQLite application integration functionality."""
    
    def setup_method(self):
        """Setup test Flask app and database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test_app.db')
        
        # Create test Flask app
        self.app = Flask(__name__)
        self.app.config['SECRET_KEY'] = 'test-secret-key'
        self.app.config['TESTING'] = True
        
        # Reset global state
        reset_app_db()
        
        # Initialize SQLite integration
        self.integration = initialize_app_db(
            self.app,
            db_path=self.db_path,
            enable_message_obfuscation=True
        )
        
    def teardown_method(self):
        """Cleanup test database and reset global state."""
        if hasattr(self, 'integration') and self.integration:
            self.integration._cleanup()
        reset_app_db()
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_app_integration_initialization(self):
        """Test Flask app integration initialization."""
        assert self.integration is not None
        assert self.integration.app == self.app
        assert self.integration.sqlite_manager is not None
        assert self.integration.message_obfuscator is not None
        
        # Test global instance
        global_integration = get_app_db()
        assert global_integration == self.integration
    
    def test_credentials_compatibility(self):
        """Test credentials loading/saving compatibility with JSON format."""
        # Create test credentials data in JSON format
        test_credentials = {
            'user1@example.com': {
                'password': 'hashed_password_1',
                'school_name': 'Test School 1',
                'history': [
                    {
                        'question': 'What is 1+1?',
                        'user_answer': '2',
                        'correct': True,
                        'topic': 'math',
                        'subtopic': 'addition',
                        'grade': 1,
                        'timestamp': '2025-09-11T10:00:00'
                    }
                ]
            },
            'user2@example.com': {
                'password': 'hashed_password_2',
                'school_name': 'Test School 2',
                'history': []
            }
        }
        
        # Save credentials
        success = self.integration.save_credentials(test_credentials)
        assert success is True
        
        # Load credentials
        loaded_credentials = self.integration.load_credentials()
        
        # Verify structure matches JSON format
        assert 'user1@example.com' in loaded_credentials
        assert 'user2@example.com' in loaded_credentials
        
        user1 = loaded_credentials['user1@example.com']
        assert user1['password'] == 'hashed_password_1'
        assert user1['school_name'] == 'Test School 1'
        assert len(user1['history']) == 1
        
        history_entry = user1['history'][0]
        assert history_entry['question'] == 'What is 1+1?'
        assert history_entry['user_answer'] == '2'
        assert history_entry['correct'] is True  # Should be boolean
        assert history_entry['topic'] == 'math'
    
    def test_collaboration_compatibility(self):
        """Test collaboration data loading/saving compatibility with JSON format."""
        # First create some users
        test_credentials = {
            'alice@example.com': {
                'password': 'password1',
                'school_name': 'School A',
                'history': []
            },
            'bob@example.com': {
                'password': 'password2',
                'school_name': 'School B', 
                'history': []
            }
        }
        self.integration.save_credentials(test_credentials)
        
        # Create test collaboration data in JSON format
        test_collaboration = {
            'invites': {
                'invite-123': {
                    'from_user': 'alice@example.com',
                    'to_user': 'bob@example.com',
                    'timestamp': '2025-09-11T10:00:00',
                    'status': 'pending'
                }
            },
            'chat_sessions': {
                'session-456': {
                    'user1': 'alice@example.com',
                    'user2': 'bob@example.com',
                    'messages': [
                        {
                            'id': 1,
                            'from_user': 'alice@example.com',
                            'to_user': 'bob@example.com',
                            'message': 'Hello Bob!',
                            'timestamp': '2025-09-11T10:05:00',
                            'displayed': False
                        },
                        {
                            'id': 2,
                            'from_user': 'bob@example.com',
                            'to_user': 'alice@example.com',
                            'message': 'Hi Alice!',
                            'timestamp': '2025-09-11T10:06:00',
                            'displayed': True
                        }
                    ],
                    'active': True,
                    'created_at': '2025-09-11T10:00:00'
                }
            }
        }
        
        # Save collaboration data
        success = self.integration.save_collaboration_data(test_collaboration)
        assert success is True
        
        # Load collaboration data
        loaded_collaboration = self.integration.load_collaboration_data()
        
        # Verify structure matches JSON format
        assert 'invites' in loaded_collaboration
        assert 'chat_sessions' in loaded_collaboration
        
        # Check invite
        invites = loaded_collaboration['invites']
        assert 'invite-123' in invites
        
        invite = invites['invite-123']
        assert invite['from_user'] == 'alice@example.com'
        assert invite['to_user'] == 'bob@example.com'
        assert invite['status'] == 'pending'
        
        # Check chat session
        sessions = loaded_collaboration['chat_sessions']
        assert 'session-456' in sessions
        
        session = sessions['session-456']
        assert session['user1'] == 'alice@example.com'
        assert session['user2'] == 'bob@example.com'
        assert len(session['messages']) == 2
        assert session['active'] is True
        
        # Check messages
        message1 = session['messages'][0]
        assert message1['from_user'] == 'alice@example.com'
        assert message1['message'] == 'Hello Bob!'
        assert message1['displayed'] is False
        
        message2 = session['messages'][1]
        assert message2['from_user'] == 'bob@example.com'
        assert message2['message'] == 'Hi Alice!'
        assert message2['displayed'] is True
    
    def test_message_obfuscation(self):
        """Test message obfuscation in collaboration data."""
        # Create test users
        test_credentials = {
            'alice@example.com': {'password': 'pass1', 'school_name': 'School A', 'history': []},
            'bob@example.com': {'password': 'pass2', 'school_name': 'School B', 'history': []}
        }
        self.integration.save_credentials(test_credentials)
        
        # Create chat session and add message
        session_id = self.integration.create_chat_session('alice@example.com', 'bob@example.com')
        
        test_message = "This is a secret message that should be obfuscated!"
        message_id = self.integration.add_message(
            session_id, 'alice@example.com', 'bob@example.com', test_message
        )
        
        # Verify message was obfuscated in database
        with self.integration.sqlite_manager.connection_pool.get_connection() as conn:
            stored_message = conn.execute(
                "SELECT message_content, obfuscated_content FROM messages WHERE id = ?",
                (message_id,)
            ).fetchone()
            
            assert stored_message['message_content'] == test_message
            assert stored_message['obfuscated_content'] is not None
            assert stored_message['obfuscated_content'] != test_message
            
            # Verify obfuscated message can be deobfuscated
            deobfuscated = self.integration.message_obfuscator.deobfuscate_message(
                stored_message['obfuscated_content']
            )
            assert deobfuscated == test_message
        
        # Load collaboration data and verify message is deobfuscated for display
        collab_data = self.integration.load_collaboration_data()
        session = collab_data['chat_sessions'][session_id]
        loaded_message = session['messages'][0]
        
        assert loaded_message['message'] == test_message
    
    def test_individual_operations(self):
        """Test individual user and collaboration operations."""
        # Test user operations
        success = self.integration.create_user('test@example.com', 'password123', 'Test School')
        assert success is True
        
        user = self.integration.get_user('test@example.com')
        assert user is not None
        assert user['email'] == 'test@example.com'
        
        # Test user updates
        success = self.integration.update_user('test@example.com', {'school_name': 'Updated School'})
        assert success is True
        
        updated_user = self.integration.get_user('test@example.com')
        assert updated_user['school_name'] == 'Updated School'
        
        # Test history addition
        history_entry = {
            'question': 'Test question',
            'user_answer': 'Test answer',
            'correct': True,
            'topic': 'test',
            'subtopic': 'unit_test',
            'grade': 3,
            'timestamp': '2025-09-11T10:00:00'
        }
        
        success = self.integration.add_user_history('test@example.com', history_entry)
        assert success is True
        
        user_with_history = self.integration.get_user('test@example.com')
        assert len(user_with_history['history']) == 1
        assert user_with_history['history'][0]['question'] == 'Test question'
    
    def test_collaboration_operations(self):
        """Test collaboration operations."""
        # Create test users
        self.integration.create_user('user1@example.com', 'pass1')
        self.integration.create_user('user2@example.com', 'pass2')
        
        # Test invite creation
        invite_id = self.integration.create_invite('user1@example.com', 'user2@example.com')
        assert invite_id is not None
        
        # Test invite status update
        success = self.integration.update_invite_status(invite_id, 'accepted')
        assert success is True
        
        # Test chat session creation
        session_id = self.integration.create_chat_session('user1@example.com', 'user2@example.com')
        assert session_id is not None
        
        # Test message addition
        message_id = self.integration.add_message(
            session_id, 'user1@example.com', 'user2@example.com', 'Hello!'
        )
        assert message_id is not None
        
        # Test message display update
        success = self.integration.update_message_displayed(message_id, True)
        assert success is True
    
    def test_statistics_and_health_check(self):
        """Test statistics and health check functionality."""
        # Create some test data
        self.integration.create_user('stats1@example.com', 'pass1')
        self.integration.create_user('stats2@example.com', 'pass2')
        
        invite_id = self.integration.create_invite('stats1@example.com', 'stats2@example.com')
        session_id = self.integration.create_chat_session('stats1@example.com', 'stats2@example.com')
        self.integration.add_message(session_id, 'stats1@example.com', 'stats2@example.com', 'Test')
        
        # Test statistics
        stats = self.integration.get_statistics()
        assert 'total_users' in stats
        assert 'active_sessions' in stats
        assert 'total_messages' in stats
        assert 'pending_invites' in stats
        
        assert stats['total_users'] >= 3  # Admin + 2 test users
        assert stats['total_messages'] >= 1
        
        # Test health check
        health = self.integration.health_check()
        assert health['status'] == 'healthy'
        assert 'database_path' in health
        assert 'statistics' in health
    
    def test_cleanup_operations(self):
        """Test cleanup operations."""
        # Test cleanup with default retention
        success = self.integration.cleanup_old_data()
        assert success is True
        
        # Test cleanup with custom retention
        success = self.integration.cleanup_old_data(days=7)
        assert success is True
    
    def test_error_handling(self):
        """Test error handling scenarios."""
        # Test operations with non-existent users
        user = self.integration.get_user('nonexistent@example.com')
        assert user is None
        
        # Test duplicate user creation - should raise ConcurrencyError
        success1 = self.integration.create_user('dup@example.com', 'pass1')
        assert success1 is True
        
        from dbmgr.exceptions import ConcurrencyError
        with pytest.raises(ConcurrencyError):
            self.integration.create_user('dup@example.com', 'pass2')
    
    def test_flask_app_config_integration(self):
        """Test Flask app configuration integration."""
        # Create app with custom config using temporary directory
        custom_app = Flask(__name__)
        custom_app.config['SECRET_KEY'] = 'custom-secret'
        
        # Use a temporary directory instead of creating permanent directories
        import tempfile
        with tempfile.TemporaryDirectory() as temp_dir:
            custom_db_path = os.path.join(temp_dir, 'custom_test.db')
            custom_app.config['SQLITE_DB_PATH'] = custom_db_path
            custom_app.config['SQLITE_MAX_CONNECTIONS'] = 25
            custom_app.config['SQLITE_ENABLE_MESSAGE_OBFUSCATION'] = False
            
            reset_app_db()
            
            # Initialize with custom config
            custom_integration = SQLiteAppIntegration(custom_app)
            
            assert custom_integration.config['db_path'] == custom_db_path
            assert custom_integration.config['max_connections'] == 25
            assert custom_integration.config['enable_message_obfuscation'] is False
            
            custom_integration._cleanup()


class TestGlobalIntegrationFunctions:
    """Test global integration functions."""
    
    def teardown_method(self):
        """Reset global state after each test."""
        reset_app_db()
    
    def test_initialize_and_get_app_db(self):
        """Test global initialization and retrieval functions."""
        app = Flask(__name__)
        app.config['SECRET_KEY'] = 'test-key'
        
        # Test initialization
        integration = initialize_app_db(app)
        assert integration is not None
        
        # Test retrieval
        retrieved_integration = get_app_db()
        assert retrieved_integration == integration
        
        # Test error when not initialized
        reset_app_db()
        
        with pytest.raises(RuntimeError, match="SQLite database not initialized"):
            get_app_db()
    
    def test_reset_app_db(self):
        """Test global state reset functionality."""
        app = Flask(__name__)
        app.config['SECRET_KEY'] = 'test-key'
        
        # Initialize
        integration = initialize_app_db(app)
        assert get_app_db() == integration
        
        # Reset
        reset_app_db()
        
        # Should raise error after reset
        with pytest.raises(RuntimeError):
            get_app_db()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
