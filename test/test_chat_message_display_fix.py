#!/usr/bin/env python3
"""
Test suite for chat message display fix.

Tests the specific scenario where chat messages are not appearing in the UI
because they were being marked as displayed immediately when retrieved.
This test ensures the fix works correctly.
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

def test_chat_messages_not_marked_displayed_on_retrieval():
    """
    Test that chat messages are NOT immediately marked as displayed when retrieved.
    This is the fix for the issue where messages weren't showing in the UI.
    """
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    from dbmgr.sqlite_app_integration import reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()
        initialize_app_db(data_dir, backup_dir)
        db = get_app_db()
        
        # Create test users (similar to admin@gmail.com and praveenrai9@gmail.com)
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
        db.db_manager.create_user('admin@gmail.com', test_user1_data)
        db.db_manager.create_user('praveenrai9@gmail.com', test_user2_data)
        
        # Create collaboration data simulating the exact scenario from the issue
        collaboration_data = {
            'invites': {
                'test-invite-123': {
                    'from_user': 'admin@gmail.com',
                    'to_user': 'praveenrai9@gmail.com',
                    'timestamp': datetime.now().isoformat(),
                    'status': 'accepted'
                }
            },
            'chat_sessions': {
                'session_123': {
                    'active': True,
                    'user1': 'admin@gmail.com',
                    'user2': 'praveenrai9@gmail.com',
                    'created_at': datetime.now().isoformat(),
                    'messages': [
                        {
                            'id': 132,
                            'from_user': 'praveenrai9@gmail.com',
                            'to_user': 'admin@gmail.com',
                            'message': 'Yo',
                            'timestamp': '2025-09-04T11:06:02.165160',
                            'displayed': False
                        },
                        {
                            'id': 133,
                            'from_user': 'admin@gmail.com',
                            'to_user': 'praveenrai9@gmail.com',
                            'message': 'hi',
                            'timestamp': '2025-09-04T11:06:49.813545',
                            'displayed': False
                        }
                    ]
                }
            },
            'message_counter': 133
        }
        db.save_collaboration_data(collaboration_data)
        
        with app.test_client() as client:
            # Test as admin@gmail.com retrieving messages
            with client.session_transaction() as sess:
                sess['username'] = 'admin@gmail.com'
                sess['session_id'] = 'test_session_admin'
            
            # Mock active sessions and database functions for both users in same grade/school
            with patch('app.active_sessions', {
                'admin@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_admin'
                },
                'praveenrai9@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_praveenrai'
                }
            }), patch('app.load_collaboration_data', db.load_collaboration_data), \
               patch('app.save_collaboration_data', db.save_collaboration_data):
                # admin@gmail.com should get the "Yo" message from praveenrai9@gmail.com
                response = client.get('/get_chat_messages?partner=praveenrai9@gmail.com')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 1
                
                # Verify it's the correct message
                message = response_data['messages'][0]
                assert message['id'] == 132
                assert message['from_user'] == 'praveenrai9@gmail.com'
                assert message['message'] == 'Yo'
                assert message['displayed'] == False  # Should still be False after retrieval
                
                # CRITICAL: Check that the message is NOT marked as displayed in database
                # after retrieval (this was the bug)
                updated_collaboration_data = db.load_collaboration_data()
                session_data = updated_collaboration_data['chat_sessions']['session_123']
                
                for msg in session_data['messages']:
                    if msg['id'] == 132:  # The message we just retrieved
                        assert msg['displayed'] == False, "Message should NOT be marked as displayed after retrieval"
                
                # Second call should return the SAME message again (not empty)
                # This proves the fix works - messages are available until explicitly marked displayed
                response2 = client.get('/get_chat_messages?partner=praveenrai9@gmail.com')
                assert response2.status_code == 200
                
                response_data2 = response2.get_json()
                assert len(response_data2['messages']) == 1  # Same message should be returned
                assert response_data2['messages'][0]['id'] == 132

def test_chat_messages_from_other_user():
    """
    Test that praveenrai9@gmail.com can retrieve messages from admin@gmail.com
    """
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    from dbmgr.sqlite_app_integration import reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()
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
        db.db_manager.create_user('admin@gmail.com', test_user1_data)
        db.db_manager.create_user('praveenrai9@gmail.com', test_user2_data)
        
        # Create collaboration data with the messages from the scenario
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'session_123': {
                    'active': True,
                    'user1': 'admin@gmail.com',
                    'user2': 'praveenrai9@gmail.com',
                    'created_at': datetime.now().isoformat(),
                    'messages': [
                        {
                            'id': 132,
                            'from_user': 'praveenrai9@gmail.com',
                            'to_user': 'admin@gmail.com',
                            'message': 'Yo',
                            'timestamp': '2025-09-04T11:06:02.165160',
                            'displayed': False
                        },
                        {
                            'id': 133,
                            'from_user': 'admin@gmail.com',
                            'to_user': 'praveenrai9@gmail.com',
                            'message': 'hi',
                            'timestamp': '2025-09-04T11:06:49.813545',
                            'displayed': False
                        }
                    ]
                }
            },
            'message_counter': 133
        }
        db.save_collaboration_data(collaboration_data)
        
        with app.test_client() as client:
            # Test as praveenrai9@gmail.com retrieving messages
            with client.session_transaction() as sess:
                sess['username'] = 'praveenrai9@gmail.com'
                sess['session_id'] = 'test_session_praveenrai'
            
            # Mock active sessions and database functions
            with patch('app.active_sessions', {
                'admin@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_admin'
                },
                'praveenrai9@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_praveenrai'
                }
            }), patch('app.load_collaboration_data', db.load_collaboration_data), \
               patch('app.save_collaboration_data', db.save_collaboration_data):
                # praveenrai9@gmail.com should get the "hi" message from admin@gmail.com
                response = client.get('/get_chat_messages?partner=admin@gmail.com')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 1
                
                # Verify it's the correct message
                message = response_data['messages'][0]
                assert message['id'] == 133
                assert message['from_user'] == 'admin@gmail.com'
                assert message['message'] == 'hi'
                assert message['displayed'] == False
                
                # Verify the message is NOT marked as displayed in database after retrieval
                updated_collaboration_data = db.load_collaboration_data()
                session_data = updated_collaboration_data['chat_sessions']['session_123']
                
                for msg in session_data['messages']:
                    if msg['id'] == 133:
                        assert msg['displayed'] == False, "Message should NOT be marked as displayed after retrieval"

@patch('app.save_collaboration_data')
@patch('app.load_collaboration_data')
@patch('app.active_sessions', {})
def test_mark_message_displayed_endpoint(mock_load_data, mock_save_data):
    """
    Test that the /mark_message_displayed endpoint works correctly
    """
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    from dbmgr.sqlite_app_integration import reset_app_db
    
    # Mock the load_collaboration_data to return test data
    mock_load_data.side_effect = lambda: db.load_collaboration_data()
    mock_save_data.side_effect = lambda data: db.save_collaboration_data(data)
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()
        initialize_app_db(data_dir, backup_dir)
        db = get_app_db()
        
        # Create test users
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {}
        }
        db.db_manager.create_user('testuser', test_user_data)
        
        # Create collaboration data
        collaboration_data = {
            'invites': {},
            'chat_sessions': {
                'session_123': {
                    'active': True,
                    'user1': 'user1',
                    'user2': 'user2',
                    'messages': [
                        {
                            'id': 1,
                            'from_user': 'user1',
                            'to_user': 'user2',
                            'message': 'Test message',
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
            with client.session_transaction() as sess:
                sess['username'] = 'testuser'
            
            # Mark message as displayed
            response = client.post('/mark_message_displayed',
                                 json={'message_id': 1},
                                 content_type='application/json')
            assert response.status_code == 200
            
            # Verify message is marked as displayed in database
            updated_collaboration_data = db.load_collaboration_data()
            session_data = updated_collaboration_data['chat_sessions']['session_123']
            message = session_data['messages'][0]
            assert message['displayed'] == True

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
