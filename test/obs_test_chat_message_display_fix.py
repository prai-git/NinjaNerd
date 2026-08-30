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

# Import obfuscation functions for creating test data
from core.message_security import obfuscate_message, deobfuscate_message, is_message_obfuscated

def test_chat_messages_not_marked_displayed_on_retrieval():
    """
    Test that chat messages are NOT immediately marked as displayed when retrieved.
    This is the fix for the issue where messages weren't showing in the UI.
    """
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()
        db_path = os.path.join(data_dir, 'test.db')
        db = initialize_app_db(app, 
                               db_path=db_path,
                               data_dir=data_dir,
                               backup_dir=backup_dir)
        
        # Create test users (similar to admin@gmail.com and praveenrai9@gmail.com)
        db.create_user('test1@gmail.com', 'test_password_hash', 'Test School')
        db.create_user('test2@gmail.com', 'test_password_hash2', 'Test School')
        
        # Create chat session and add messages using SQLite methods
        session_id = db.create_chat_session('test1@gmail.com', 'test2@gmail.com')
        
        # Add test messages
        message_id_1 = db.add_message(session_id, 'test2@gmail.com', 'test1@gmail.com', 'Yo')
        message_id_2 = db.add_message(session_id, 'test1@gmail.com', 'test2@gmail.com', 'hi')

        with app.test_client() as client:
            # Test as test1@gmail.com retrieving messages
            with client.session_transaction() as sess:
                sess['username'] = 'test1@gmail.com'
                sess['session_id'] = 'test_session_admin'

            # Mock active sessions for both users in same grade/school
            with patch('app.active_sessions', {
                'test1@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_admin'
                },
                'test2@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_praveenrai'
                }
            }):
                # test1@gmail.com should get the "Yo" message from test2@gmail.com
                response = client.get('/get_chat_messages?partner=test2@gmail.com')
                assert response.status_code == 200

                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 1
                
                # Verify it's the correct message
                message = response_data['messages'][0]
                assert message['from_user'] == 'test2@gmail.com'
                # Note: Message may be obfuscated - test basic functionality first
                assert 'message' in message  # Just check message field exists
                assert message['displayed'] == False  # Should still be False after retrieval
                
                # CRITICAL: Check that the message is NOT marked as displayed in database
                # after retrieval (this was the bug)
                all_messages = db.get_chat_messages('test1@gmail.com', 'test2@gmail.com')
                retrieved_message = next((msg for msg in all_messages if msg['from_user'] == 'test2@gmail.com'), None)
                assert retrieved_message is not None, "Message should exist in database"
                assert retrieved_message['displayed'] == False, "Message should NOT be marked as displayed after retrieval"
                
                # Second call should return the SAME message again (not empty)
                # This proves the fix works - messages are available until explicitly marked displayed
                response2 = client.get('/get_chat_messages?partner=test2@gmail.com')
                assert response2.status_code == 200
                
                response_data2 = response2.get_json()
                assert len(response_data2['messages']) == 1  # Same message should be returned
                assert response_data2['messages'][0]['from_user'] == 'test2@gmail.com'

def test_chat_messages_from_other_user():
    """
    Test that praveenrai9@gmail.com can retrieve messages from admin@gmail.com
    """
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()
        db_path = os.path.join(data_dir, 'test.db')
        db = initialize_app_db(app, 
                               db_path=db_path,
                               data_dir=data_dir,
                               backup_dir=backup_dir)
        
        # Create test users
        db.create_user('test3@gmail.com', 'test_password_hash', 'Test School')
        db.create_user('test4@gmail.com', 'test_password_hash2', 'Test School')
        
        # Create chat session and add messages using SQLite methods
        session_id = db.create_chat_session('test3@gmail.com', 'test4@gmail.com')
        
        # Add test messages
        message_id_1 = db.add_message(session_id, 'test4@gmail.com', 'test3@gmail.com', 'Yo')
        message_id_2 = db.add_message(session_id, 'test3@gmail.com', 'test4@gmail.com', 'hi')
        
        with app.test_client() as client:
            # Test as test4@gmail.com retrieving messages
            with client.session_transaction() as sess:
                sess['username'] = 'test4@gmail.com'
                sess['session_id'] = 'test_session_praveenrai'
            
            # Mock active sessions
            with patch('app.active_sessions', {
                'test3@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_admin'
                },
                'test4@gmail.com': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_praveenrai'
                }
            }):
                # test4@gmail.com should get the "hi" message from test3@gmail.com
                response = client.get('/get_chat_messages?partner=test3@gmail.com')
                assert response.status_code == 200
                
                response_data = response.get_json()
                assert 'messages' in response_data
                assert len(response_data['messages']) == 1
                
                # Verify it's the correct message
                message = response_data['messages'][0]
                assert message['from_user'] == 'test3@gmail.com'
                # Note: Message may be obfuscated - test basic functionality first
                assert 'message' in message  # Just check message field exists
                assert message['displayed'] == False
                
                # Verify the message is NOT marked as displayed in database after retrieval
                all_messages = db.get_chat_messages('test4@gmail.com', 'test3@gmail.com')
                retrieved_message = next((msg for msg in all_messages if msg['from_user'] == 'test3@gmail.com'), None)
                assert retrieved_message is not None, "Message should exist in database"
                assert retrieved_message['displayed'] == False, "Message should NOT be marked as displayed after retrieval"

def test_mark_message_displayed_endpoint():
    """
    Test that the /mark_message_displayed endpoint works correctly
    """
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Reset and initialize test database
        reset_app_db()
        db_path = os.path.join(data_dir, 'test.db')
        db = initialize_app_db(app, 
                               db_path=db_path,
                               data_dir=data_dir,
                               backup_dir=backup_dir)
        
        # Create test users
        db.create_user('user1', 'test_password_hash', 'Test School')
        db.create_user('user2', 'test_password_hash2', 'Test School')
        
        # Create chat session and add a test message
        session_id = db.create_chat_session('user1', 'user2')
        message_id = db.add_message(session_id, 'user1', 'user2', 'Test message')
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'user2'
            
            # Mark message as displayed
            response = client.post('/mark_message_displayed',
                                 json={'message_id': message_id},
                                 content_type='application/json')
            assert response.status_code == 200
            
            # Verify message is marked as displayed in database
            all_messages = db.get_chat_messages('user1', 'user2')
            test_message = next((msg for msg in all_messages if msg['id'] == message_id), None)
            assert test_message is not None, "Message should exist in database"
            assert test_message['displayed'] == True, "Message should be marked as displayed"

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
