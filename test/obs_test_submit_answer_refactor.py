#!/usr/bin/env python3
"""
Test suite for submit_answer function refactoring.

Tests that the refactored submit_answer function maintains the same functionality
while using the new centralized DBManager approach.
"""

import sys
import os
import json
import pytest
import tempfile
import shutil
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@patch('app.save_collaboration_data')
@patch('app.load_collaboration_data')
@patch('app.active_sessions', {})
@patch('app.get_app_db')
def test_submit_answer_atomic_operation(mock_get_db, mock_load_data, mock_save_data):
    """Test that submit_answer performs atomic history and statistics updates."""
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        test_db_path = os.path.join(temp_dir, 'test_submit_answer.db')
        
        # Reset and initialize test database
        reset_app_db()
        
        # Set environment variable to avoid message obfuscation key error
        os.environ.setdefault('MESSAGE_OBFUSCATION_KEY', 'test-key-for-testing')
        
        # Initialize database integration
        db = initialize_app_db(app, db_path=test_db_path, enable_message_obfuscation=False)
        
        # Mock the collaboration data functions and database
        mock_load_data.side_effect = lambda: {'invites': {}, 'chat_sessions': {}, 'message_counter': 0}
        mock_save_data.return_value = None
        mock_get_db.return_value = db
        
        # Create a test user with SQLite integration method signature
        result = db.create_user('testuser', 'test_password_hash', 'Test School')
        assert result == 'testuser', "Failed to create test user"
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'testuser'
                sess['session_id'] = 'test_session_123'
                sess['login_time'] = datetime.now().isoformat()
                sess['current_questions'] = [
                    {
                        'question': 'What is 2+2?',
                        'explanation': 'The sum of 2 and 2 is 4.'
                    }
                ]
                sess['current_question_index'] = 0
                sess['current_topic'] = 'math'
                sess['current_subtopic'] = 'addition'
                sess['current_grade'] = 1
            
                # Mock active sessions and LLM service
                with patch('app.active_sessions', {'testuser': {'session_id': 'test_session_123', 'last_activity': datetime.now().isoformat()}}):
                    with patch('app.safe_llm_service') as mock_safe_llm:
                        mock_safe_llm.check_answer_with_llm.return_value = True
                        
                        # Mock the rate limiter and session validation
                        with patch('app.limiter') as mock_limiter:
                            mock_limiter.limit.return_value = lambda f: f  # Return function unchanged
                            
                            # Mock session validation to always pass
                            with patch('app.validate_session', return_value=(True, "Session valid")):
                                # Mock log_user_activity to avoid issues
                                with patch('app.log_user_activity'):
                                    # Submit an answer - ensure all session data is present
                                    with client.session_transaction() as sess:
                                        sess['username'] = 'testuser'
                                        sess['session_id'] = 'test_session_123'
                                        sess['login_time'] = datetime.now().isoformat()
                                        sess['current_questions'] = [
                                            {
                                                'question': 'What is 2+2?',
                                                'explanation': 'The sum of 2 and 2 is 4.'
                                            }
                                        ]
                                        sess['current_question_index'] = 0
                                        sess['current_topic'] = 'math'
                                        sess['current_subtopic'] = 'addition'
                                        sess['current_grade'] = 1
                                    response = client.post('/submit_answer',
                                                     json={'answer': '4'},
                                                     content_type='application/json')
                                
                                    assert response.status_code == 200
                                    response_data = response.get_json()
                                    assert response_data['correct'] is True
                                    assert response_data['next_available'] is False  # Only one question
                                    
                                    # Verify that both history and statistics were updated atomically
                                    user_data = db.get_user('testuser')
                                    assert user_data is not None
                                    assert len(user_data['history']) == 1
                                    assert user_data['statistics']['questions_attempted'] == 1
                                    assert 'math' in user_data['statistics']['topics_covered']
                                    
                                    # Verify the history entry contains all expected fields
                                    history_entry = user_data['history'][0]
                                    assert history_entry['question'] == 'What is 2+2?'
                                    assert history_entry['user_answer'] == '4'
                                    # SQLite integration stores boolean as integer (1 for True)
                                    assert history_entry['correct'] in [True, 1]
                                    assert history_entry['topic'] == 'math'
                                    assert history_entry['subtopic'] == 'addition'
                                    assert history_entry['grade'] == 1
                                    assert 'timestamp' in history_entry

@patch('app.save_collaboration_data')
@patch('app.load_collaboration_data')
@patch('app.active_sessions', {})
@patch('app.get_app_db')
def test_submit_answer_multiple_questions(mock_get_db, mock_load_data, mock_save_data):
    """Test that submit_answer correctly handles multiple questions and increments statistics."""
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        test_db_path = os.path.join(temp_dir, 'test_submit_multiple.db')
        
        # Reset and initialize test database
        reset_app_db()
        
        # Set environment variable to avoid message obfuscation key error
        os.environ.setdefault('MESSAGE_OBFUSCATION_KEY', 'test-key-for-testing')
        
        # Initialize database integration
        db = initialize_app_db(app, db_path=test_db_path, enable_message_obfuscation=False)
        
        # Mock the collaboration data functions and database
        mock_load_data.side_effect = lambda: {'invites': {}, 'chat_sessions': {}, 'message_counter': 0}
        mock_save_data.return_value = None
        mock_get_db.return_value = db
        
        # Create a test user with SQLite integration method signature
        result = db.create_user('testuser2', 'test_password_hash', 'Test School')
        assert result == 'testuser2', "Failed to create test user"
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'testuser2'
                sess['session_id'] = 'test_session_456'
                sess['login_time'] = datetime.now().isoformat()
                sess['current_questions'] = [
                    {'question': 'What is 2+2?', 'explanation': 'The sum of 2 and 2 is 4.'},
                    {'question': 'What is 3+3?', 'explanation': 'The sum of 3 and 3 is 6.'}
                ]
                sess['current_question_index'] = 0
                sess['current_topic'] = 'math'
                sess['current_subtopic'] = 'addition'
                sess['current_grade'] = 1
            
                # Mock active sessions and LLM service  
                with patch('app.active_sessions', {'testuser2': {'session_id': 'test_session_456', 'last_activity': datetime.now().isoformat()}}):
                    with patch('app.safe_llm_service') as mock_safe_llm:
                        mock_safe_llm.check_answer_with_llm.return_value = True
                        
                        # Mock the rate limiter and session validation
                        with patch('app.limiter') as mock_limiter:
                            mock_limiter.limit.return_value = lambda f: f  # Return function unchanged
                            
                            # Mock session validation to always pass
                            with patch('app.validate_session', return_value=(True, "Session valid")):
                                # Mock log_user_activity to avoid issues
                                with patch('app.log_user_activity'):
                                    # Submit first answer
                                    with client.session_transaction() as sess:
                                        sess['username'] = 'testuser2'
                                        sess['session_id'] = 'test_session_456'
                                        sess['login_time'] = datetime.now().isoformat()
                                        sess['current_questions'] = [
                                            {'question': 'What is 2+2?', 'explanation': 'The sum of 2 and 2 is 4.'},
                                            {'question': 'What is 3+3?', 'explanation': 'The sum of 3 and 3 is 6.'}
                                        ]
                                        sess['current_question_index'] = 0
                                        sess['current_topic'] = 'math'
                                        sess['current_subtopic'] = 'addition'
                                        sess['current_grade'] = 1
                                    response = client.post('/submit_answer',
                                                         json={'answer': '4'},
                                                         content_type='application/json')
                                    
                                    assert response.status_code == 200
                                    response_data = response.get_json()
                                    assert response_data['correct'] is True
                                    assert response_data['next_available'] is True  # More questions available
                                    
                                    # Submit second answer
                                    with client.session_transaction() as sess:
                                        sess['username'] = 'testuser2'
                                        sess['session_id'] = 'test_session_456'
                                        sess['login_time'] = datetime.now().isoformat()
                                        sess['current_questions'] = [
                                            {'question': 'What is 2+2?', 'explanation': 'The sum of 2 and 2 is 4.'},
                                            {'question': 'What is 3+3?', 'explanation': 'The sum of 3 and 3 is 6.'}
                                        ]
                                        sess['current_question_index'] = 1  # Now on second question
                                        sess['current_topic'] = 'math'
                                        sess['current_subtopic'] = 'addition'
                                        sess['current_grade'] = 1
                                    response = client.post('/submit_answer',
                                                         json={'answer': '6'},
                                                         content_type='application/json')
                                    
                                    assert response.status_code == 200
                                    response_data = response.get_json()
                                    assert response_data['correct'] is True
                                    assert response_data['next_available'] is False  # No more questions
                                    
                                    # Verify final state
                                    user_data = db.get_user('testuser2')
                                    assert len(user_data['history']) == 2
                                    assert user_data['statistics']['questions_attempted'] == 2
                                    assert 'math' in user_data['statistics']['topics_covered']

@patch('app.save_collaboration_data')
@patch('app.load_collaboration_data')
@patch('app.active_sessions', {})
@patch('app.get_app_db')
def test_submit_answer_error_handling(mock_get_db, mock_load_data, mock_save_data):
    """Test error handling when database operations fail."""
    from app import app
    from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        test_db_path = os.path.join(temp_dir, 'test_submit_error.db')
        
        # Reset and initialize test database
        reset_app_db()
        
        # Set environment variable to avoid message obfuscation key error
        os.environ.setdefault('MESSAGE_OBFUSCATION_KEY', 'test-key-for-testing')
        
        # Initialize database integration
        db = initialize_app_db(app, db_path=test_db_path, enable_message_obfuscation=False)
        
        # Mock the collaboration data functions and database
        mock_load_data.side_effect = lambda: {'invites': {}, 'chat_sessions': {}, 'message_counter': 0}
        mock_save_data.return_value = None
        mock_get_db.return_value = db
        
        # Create a test user with SQLite integration method signature
        result = db.create_user('testuser3', 'test_password_hash', 'Test School')
        assert result == 'testuser3', "Failed to create test user"
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'testuser3'
                sess['session_id'] = 'test_session_789'
                sess['login_time'] = '2023-01-01T00:00:00'
                sess['current_questions'] = [
                    {'question': 'What is 2+2?', 'explanation': 'The sum of 2 and 2 is 4.'}
                ]
                sess['current_question_index'] = 0
                sess['current_topic'] = 'math'
                sess['current_subtopic'] = 'addition'
                sess['current_grade'] = 1
            
            # Mock the database to fail
            with patch.object(db, 'update_user_history_and_statistics', return_value=False):
                with patch('app.safe_llm_service') as mock_safe_llm:
                    mock_safe_llm.check_answer_with_llm.return_value = True
                    
                    with patch('app.log_user_activity'):
                        response = client.post('/submit_answer',
                                             json={'answer': '4'},
                                             content_type='application/json')
                        
                        assert response.status_code == 200
                        response_data = response.get_json()
                        assert 'error' in response_data
                        assert response_data['error'] == 'Failed to save answer'

def test_submit_answer_no_session():
    """Test that submit_answer properly handles missing session."""
    from app import app
    
    with app.test_client() as client:
        response = client.post('/submit_answer',
                             json={'answer': '4'},
                             content_type='application/json')
        
        assert response.status_code == 200
        response_data = response.get_json()
        assert 'error' in response_data
        assert response_data['error'] == 'No active session'

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
