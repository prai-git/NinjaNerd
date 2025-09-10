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
from unittest.mock import patch, MagicMock

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_submit_answer_atomic_operation():
    """Test that submit_answer performs atomic history and statistics updates."""
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
        
        # Create a test user
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {
                'questions_attempted': 0,
                'topics_covered': []
            }
        }
        db.db_manager.create_user('testuser', test_user_data)
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'testuser'
                sess['session_id'] = 'test_session_123'
                sess['login_time'] = '2023-01-01T00:00:00'
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
            
            # Mock the LLM service to return a correct answer
            with patch('app.llm_service') as mock_llm:
                mock_llm.check_answer_with_llm.return_value = True
                
                # Mock log_user_activity to avoid issues
                with patch('app.log_user_activity'):
                    # Submit an answer
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
                    assert history_entry['correct'] is True
                    assert history_entry['topic'] == 'math'
                    assert history_entry['subtopic'] == 'addition'
                    assert history_entry['grade'] == 1
                    assert 'timestamp' in history_entry

def test_submit_answer_multiple_questions():
    """Test that submit_answer correctly handles multiple questions and increments statistics."""
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
        
        # Create a test user
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {
                'questions_attempted': 0,
                'topics_covered': []
            }
        }
        db.db_manager.create_user('testuser2', test_user_data)
        
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'testuser2'
                sess['session_id'] = 'test_session_456'
                sess['login_time'] = '2023-01-01T00:00:00'
                sess['current_questions'] = [
                    {'question': 'What is 2+2?', 'explanation': 'The sum of 2 and 2 is 4.'},
                    {'question': 'What is 3+3?', 'explanation': 'The sum of 3 and 3 is 6.'}
                ]
                sess['current_question_index'] = 0
                sess['current_topic'] = 'math'
                sess['current_subtopic'] = 'addition'
                sess['current_grade'] = 1
            
            # Mock the LLM service
            with patch('app.llm_service') as mock_llm:
                mock_llm.check_answer_with_llm.return_value = True
                
                with patch('app.log_user_activity'):
                    # Submit first answer
                    response = client.post('/submit_answer',
                                         json={'answer': '4'},
                                         content_type='application/json')
                    
                    assert response.status_code == 200
                    response_data = response.get_json()
                    assert response_data['correct'] is True
                    assert response_data['next_available'] is True  # More questions available
                    
                    # Submit second answer
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

def test_submit_answer_error_handling():
    """Test error handling when database operations fail."""
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
        
        # Create a test user
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {
                'questions_attempted': 0,
                'topics_covered': []
            }
        }
        db.db_manager.create_user('testuser3', test_user_data)
        
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
                with patch('app.llm_service') as mock_llm:
                    mock_llm.check_answer_with_llm.return_value = True
                    
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
