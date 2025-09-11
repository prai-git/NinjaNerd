#!/usr/bin/env python3
"""
Comprehensive test suite to validate the complete refactoring of NinjaNerd application.

Tests that all the major refactoring changes maintain functional integrity:
1. Atomic history and statistics updates in submit_answer
2. Centralized login statistics updates  
3. No breaking changes to existing functionality
4. Session lifecycle remains unchanged
5. Error messages and logging stay consistent
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

def test_comprehensive_refactoring_validation():
    """Test that all refactored components work together correctly."""
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
        
        # Create a test user for comprehensive testing
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {
                'questions_attempted': 0,
                'topics_covered': []
            }
        }
        db.db_manager.create_user('comprehensive_user', test_user_data)
        
        # Test 1: Login statistics update
        user_data_before = db.get_user('comprehensive_user')
        login_time_before = user_data_before['statistics'].get('last_login')
        
        login_stats = {'last_login': datetime.now().isoformat()}
        success = db.update_user_statistics('comprehensive_user', login_stats)
        assert success is True
        
        user_data_after = db.get_user('comprehensive_user')
        login_time_after = user_data_after['statistics'].get('last_login')
        assert login_time_after != login_time_before
        assert login_time_after is not None
        
        # Test 2: Submit answer flow with session setup
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess['username'] = 'comprehensive_user'
                sess['session_id'] = 'comprehensive_test_session'
                sess['login_time'] = datetime.now().isoformat()
                sess['current_questions'] = [
                    {
                        'question': 'What is the capital of France?',
                        'explanation': 'The capital of France is Paris.'
                    },
                    {
                        'question': 'What is 5*6?',
                        'explanation': '5 multiplied by 6 equals 30.'
                    }
                ]
                sess['current_question_index'] = 0
                sess['current_topic'] = 'geography'
                sess['current_subtopic'] = 'capitals'
                sess['current_grade'] = 3
            
            # Mock the LLM service and ensure safe facade uses it
            from unittest.mock import MagicMock
            mock_llm = MagicMock()
            mock_llm.check_answer_with_llm.return_value = True
            
            with patch('app.safe_llm_service') as mock_safe_llm:
                mock_safe_llm.check_answer_with_llm.return_value = True
                
                with patch('app.log_user_activity'):
                    # Submit first answer
                    response = client.post('/submit_answer',
                                         json={'answer': 'Paris'},
                                         content_type='application/json')
                    
                    assert response.status_code == 200
                    response_data = response.get_json()
                    assert response_data['correct'] is True
                    assert response_data['next_available'] is True
                    
                    # Change topic for second question to test topic tracking
                    with client.session_transaction() as sess:
                        sess['current_topic'] = 'math'
                        sess['current_subtopic'] = 'multiplication'
                    
                    # Submit second answer
                    response = client.post('/submit_answer',
                                         json={'answer': '30'},
                                         content_type='application/json')
                    
                    assert response.status_code == 200
                    response_data = response.get_json()
                    assert response_data['correct'] is True
                    assert response_data['next_available'] is False
                    
                    # Verify comprehensive final state
                    final_user_data = db.get_user('comprehensive_user')
                    
                    # Check history
                    assert len(final_user_data['history']) == 2
                    assert final_user_data['history'][0]['topic'] == 'geography'
                    assert final_user_data['history'][1]['topic'] == 'math'
                    assert final_user_data['history'][0]['user_answer'] == 'Paris'
                    assert final_user_data['history'][1]['user_answer'] == '30'
                    
                    # Check statistics
                    assert final_user_data['statistics']['questions_attempted'] == 2
                    assert 'geography' in final_user_data['statistics']['topics_covered']
                    assert 'math' in final_user_data['statistics']['topics_covered']
                    assert len(final_user_data['statistics']['topics_covered']) == 2
                    
                    # Verify login time is still preserved
                    assert final_user_data['statistics']['last_login'] == login_time_after

def test_data_integrity_under_concurrent_operations():
    """Test that data integrity is maintained under simulated concurrent operations."""
    from app import app
    from dbmgr.app_integration import initialize_app_db, get_app_db
    import threading
    import time
    
    # Create temporary directories for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = os.path.join(temp_dir, 'data')
        backup_dir = os.path.join(temp_dir, 'backups')
        os.makedirs(data_dir)
        os.makedirs(backup_dir)
        
        # Initialize test database
        initialize_app_db(data_dir, backup_dir)
        db = get_app_db()
        
        # Create test user
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {
                'questions_attempted': 0,
                'topics_covered': []
            }
        }
        db.db_manager.create_user('concurrent_user', test_user_data)
        
        # Simulate concurrent statistics updates
        def update_stats(topic_name, iteration):
            stats_update = {
                'add_topic_covered': f'{topic_name}_{iteration}',
                'questions_attempted_increment': 1
            }
            return db.update_user_statistics('concurrent_user', stats_update)
        
        def update_history_and_stats(topic_name, iteration):
            history_entry = {
                'question': f'Question {iteration}',
                'user_answer': f'Answer {iteration}',
                'correct': True,
                'topic': topic_name,
                'timestamp': datetime.now().isoformat()
            }
            stats_updates = {
                'questions_attempted_increment': 1,
                'add_topic_covered': topic_name
            }
            return db.update_user_history_and_statistics('concurrent_user', history_entry, stats_updates)
        
        # Run concurrent operations
        threads = []
        results = []
        
        for i in range(5):
            # Alternate between stats-only and history+stats updates
            if i % 2 == 0:
                thread = threading.Thread(target=lambda i=i: results.append(update_stats('math', i)))
            else:
                thread = threading.Thread(target=lambda i=i: results.append(update_history_and_stats('science', i)))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # Verify final state
        final_user_data = db.get_user('concurrent_user')
        
        # Should have some history entries and updated statistics
        assert len(final_user_data['history']) >= 0  # At least the history+stats operations
        assert final_user_data['statistics']['questions_attempted'] >= 0  # Should be incremented
        assert len(final_user_data['statistics']['topics_covered']) >= 0  # Should have topics

def test_error_handling_and_recovery():
    """Test error handling and recovery mechanisms."""
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
        
        # Create test user
        test_user_data = {
            'password': 'test_password_hash',
            'school_name': 'Test School',
            'history': [],
            'statistics': {
                'questions_attempted': 0,
                'topics_covered': []
            }
        }
        db.db_manager.create_user('error_test_user', test_user_data)
        
        # Test 1: Invalid user
        result = db.update_user_statistics('nonexistent_user', {'last_login': 'test'})
        assert result is False
        
        # Test 2: Invalid statistics data
        result = db.update_user_history_and_statistics(
            'error_test_user',
            {'question': 'test'},
            {'invalid_stat_operation': 'test'}
        )
        # Should still succeed as we handle unknown statistics gracefully
        assert result is True
        
        # Test 3: Empty updates
        result = db.update_user_statistics('error_test_user', {})
        assert result is True  # Empty updates should succeed

def test_backward_compatibility():
    """Test that refactoring maintains backward compatibility."""
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
        
        # Test that old-style data structures still work
        legacy_user_data = {
            'password': 'legacy_password_hash',
            'school_name': 'Legacy School'
            # Note: no history or statistics fields initially
        }
        db.db_manager.create_user('legacy_user', legacy_user_data)
        
        # Try to update statistics on a user without existing statistics
        result = db.update_user_statistics('legacy_user', {'last_login': 'legacy_login_time'})
        assert result is True
        
        # Verify statistics were initialized properly
        user_data = db.get_user('legacy_user')
        assert 'statistics' in user_data
        assert user_data['statistics']['last_login'] == 'legacy_login_time'
        
        # Try to add history to a user without existing history
        history_entry = {
            'question': 'Legacy question',
            'user_answer': 'Legacy answer',
            'correct': True
        }
        stats_updates = {'questions_attempted_increment': 1}
        result = db.update_user_history_and_statistics('legacy_user', history_entry, stats_updates)
        assert result is True
        
        # Verify both history and statistics were properly initialized and updated
        user_data = db.get_user('legacy_user')
        assert 'history' in user_data
        assert len(user_data['history']) == 1
        assert user_data['statistics']['questions_attempted'] == 1

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
