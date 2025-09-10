#!/usr/bin/env python3
"""
Test suite for chat message displayed flag persistence fix.

Tests that chat messages are NOT automatically marked as displayed when retrieved,
allowing the frontend to control when messages are marked as displayed.
"""

import sys
import os
import json
import pytest
import tempfile
import shutil
from unittest.mock import patch, MagicMock
from datetime import datetime

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_chat_messages_displayed_flag_persistence():
    """Test that chat messages are NOT automatically marked as displayed when retrieved."""
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Initialize test database
        initialize_app_db(data_dir, backup_dir)
        db = get_app_db()
        
        # Create test users
        test_user1_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {}
        }
        test_user2_data = {
            'password': 'test_password_hash2',
            'school_name': 'Test School',
            'history': [],
            'statistics': {}
        }
        db.db_manager.create_user('user1', test_user1_data)
        db.db_manager.create_user('user2', test_user2_data)
        
        # Create a collaboration data with chat session and messages
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'session_123': {
                    'active': True,
                    'user1': 'user1',
                    'user2': 'user2',
                    'topic': 'math',
                    'subtopic': 'addition',
                    'grade': 1,
                    'created_at': datetime.now().isoformat(),
                    'messages': [
                        {
                            'id': 'msg_1',
                            'from_user': 'user1',
                            'to_user': 'user2',
                            'message': 'Hello user2!',
                            'timestamp': datetime.now().isoformat(),
                            'displayed': False
                        },
                        {
                            'id': 'msg_2',
                            'from_user': 'user1',
                            'to_user': 'user2',
                            'message': 'How are you?',
                            'timestamp': datetime.now().isoformat(),
                            'displayed': False
                        },
                        {
                            'id': 'msg_3',
                            'from_user': 'user2',
                            'to_user': 'user1',
                            'message': 'I am fine, thanks!',
                            'timestamp': datetime.now().isoformat(),
                            'displayed': False
                        }
                    ]
                }
            },
            'message_counter': 3
        }
        db.save_collaboration_data(collaboration_data)
        
        with app.test_client() as client:
            # Set up session for user2
            with client.session_transaction() as sess:
                sess['username'] = 'user2'
                sess['session_id'] = 'test_session_user2'
            
            # Mock active sessions to include both users with same grade/school
            with patch('app.active_sessions', {
                'user1': {
                    'grade': 1,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user1'
                },
                'user2': {
                    'grade': 1,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user2'
                }
            }):
                # First call to get_chat_messages should return 2 messages for user2
                response = client.get('/get_chat_messages?partner=user1')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 2  # 2 messages from user1 to user2
                
                # Verify the messages are the correct ones
                message_ids = [msg['id'] for msg in response_data['messages']]
                assert 'msg_1' in message_ids
                assert 'msg_2' in message_ids
                assert 'msg_3' not in message_ids  # This was from user2 to user1
                
                # Second call should return same messages (they are NOT marked as displayed automatically)
                response = client.get('/get_chat_messages?partner=user1')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 2  # Same messages returned again
                
                # Verify in the database that messages are NOT marked as displayed after retrieval
                updated_collaboration_data = db.load_collaboration_data()
                session_data = updated_collaboration_data['chat_sessions']['session_123']
                
                for msg in session_data['messages']:
                    if msg['to_user'] == 'user2':  # Messages to user2 should still be undisplayed
                        assert msg['displayed'] is False
                    else:  # Message from user2 to user1 should still be undisplayed
                        assert msg['displayed'] is False

def test_chat_messages_different_users():
    """Test that users only get their own messages."""
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Initialize test database
        initialize_app_db(data_dir, backup_dir)
        db = get_app_db()
        
        # Create test users
        for i in range(3):
            user_data = {
                'password': f'test_password_hash_{i}',
                'school_name': 'Test School',
                'history': [],
                'statistics': {}
            }
            db.db_manager.create_user(f'user{i}', user_data)
        
        # Create collaboration data with messages
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'session_123': {
                    'active': True,
                    'user1': 'user0',
                    'user2': 'user1',
                    'topic': 'math',
                    'grade': 1,
                    'messages': [
                        {
                            'id': 'msg_1',
                            'from_user': 'user0',
                            'to_user': 'user1',
                            'message': 'Hello user1!',
                            'timestamp': datetime.now().isoformat(),
                            'displayed': False
                        }
                    ]
                }
            },
            'message_counter': 1
        }
        db.save_collaboration_data(collaboration_data)
        
        with app.test_client() as client:
            # Set up session for user2 (not in the chat)
            with client.session_transaction() as sess:
                sess['username'] = 'user2'
                sess['session_id'] = 'test_session_user2'
            
            # Mock active sessions
            with patch('app.active_sessions', {
                'user0': {'grade': 1, 'school_name': 'Test School'},
                'user1': {'grade': 1, 'school_name': 'Test School'},
                'user2': {'grade': 1, 'school_name': 'Test School'}
            }):
                # User2 tries to get messages from user0, but they're not in a chat together
                response = client.get('/get_chat_messages?partner=user0')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert len(response_data['messages']) == 0  # No messages should be returned

def test_chat_messages_grade_school_validation():
    """Test that users from different grades or schools can't access each other's messages."""
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Initialize test database
        initialize_app_db(data_dir, backup_dir)
        db = get_app_db()
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'user1'
                sess['session_id'] = 'test_session'
            
            # Test different grades
            with patch('app.active_sessions', {
                'user1': {'grade': 1, 'school_name': 'Test School'},
                'user2': {'grade': 2, 'school_name': 'Test School'}  # Different grade
            }):
                response = client.get('/get_chat_messages?partner=user2')
                assert response.status_code == 200
                response_data = response.get_json()
                assert len(response_data['messages']) == 0
            
            # Test different schools
            with patch('app.active_sessions', {
                'user1': {'grade': 1, 'school_name': 'Test School'},
                'user2': {'grade': 1, 'school_name': 'Other School'}  # Different school
            }):
                response = client.get('/get_chat_messages?partner=user2')
                assert response.status_code == 200
                response_data = response.get_json()
                assert len(response_data['messages']) == 0

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
