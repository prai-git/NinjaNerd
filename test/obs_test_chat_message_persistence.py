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

def test_chat_messages_displayed_flag_persistence_old_interface():
    """Test that chat messages are NOT automatically marked as displayed when retrieved (compatibility test)."""
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()  # Clear any existing global database
        db_path = os.path.join(data_dir, 'test.db')
        db = initialize_app_db(app, 
                               db_path=db_path,
                               data_dir=data_dir,
                               backup_dir=backup_dir)
        
        # Create test users
        db.create_user('user1', 'test_password_hash', 'Test School')
        db.create_user('user2', 'test_password_hash2', 'Test School')
        
        # Create chat session and add messages using SQLite methods
        session_id = db.create_chat_session('user1', 'user2')
        
        # Add test messages
        message_id_1 = db.add_message(session_id, 'user1', 'user2', 'Hello user2!')
        message_id_2 = db.add_message(session_id, 'user1', 'user2', 'How are you?')
        message_id_3 = db.add_message(session_id, 'user2', 'user1', 'I am fine, thanks!')
        
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
                
                # Verify the messages are from user1 to user2
                for message in response_data['messages']:
                    assert message['from_user'] == 'user1'
                    assert message['displayed'] == False  # Should not be automatically marked as displayed
                
                # Second call should return same messages (they are NOT marked as displayed automatically)
                response = client.get('/get_chat_messages?partner=user1')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 2  # Same messages returned again
                
                # Verify in the database that messages are NOT marked as displayed after retrieval
                all_messages = db.get_chat_messages('user1', 'user2')
                for msg in all_messages:
                    assert msg['displayed'] == False, "Messages should NOT be marked as displayed after retrieval"

def test_chat_messages_different_users():
    """Test that users only get their own messages."""
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()  # Clear any existing global database
        db = initialize_app_db(app, 
                             db_path=os.path.join(data_dir, 'test_persistence.db'),
                             max_connections=5)
        
        # Create test users
        for i in range(3):
            user_created = db.create_user(f'user{i}@test.com', f'test_password_hash_{i}', 'Test School')
            assert user_created
        
        # Create a chat session and add test messages
        session_id = db.create_chat_session('user0@test.com', 'user1@test.com')
        message_id = db.add_message(session_id, 'user0@test.com', 'user1@test.com', 'Hello user1!')
        
        with app.test_client() as client:
            # Set up session for user2 (not in the chat)
            with client.session_transaction() as sess:
                sess['username'] = 'user2@test.com'
                sess['session_id'] = 'test_session_user2'
            
            # Mock active sessions and database access
            with patch('app.active_sessions', {
                     'user0@test.com': {'grade': 1, 'school_name': 'Test School', 'session_id': 'test_session_user0'},
                     'user1@test.com': {'grade': 1, 'school_name': 'Test School', 'session_id': 'test_session_user1'},
                     'user2@test.com': {'grade': 1, 'school_name': 'Test School', 'session_id': 'test_session_user2'}
                 }), patch('app.get_app_db', return_value=db):
                # User2 tries to get messages from user0, but they're not in a chat together
                response = client.get('/get_chat_messages?partner=user0@test.com')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert len(response_data['messages']) == 0  # No messages should be returned

def test_chat_messages_grade_school_validation():
    """Test that users from different grades or schools can't access each other's messages."""
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()  # Clear any existing global database
        db = initialize_app_db(app, 
                             db_path=os.path.join(data_dir, 'test_grade_school.db'),
                             max_connections=5)
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'user1'
                sess['session_id'] = 'test_session'
            
            # Mock database access
            with patch('app.get_app_db', return_value=db):
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
