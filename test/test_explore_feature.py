import unittest
import sys
import os
import json
import tempfile
import shutil
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock

# Add the parent directory to sys.path to import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, SUBTOPICS, active_sessions
from ai.llm_service import LLMService


class TestExploreFeature(unittest.TestCase):
    """Test suite for the new Explore feature including Learn and Practice modes."""
    
    @classmethod
    def setUpClass(cls):
        """Set up test class with necessary configurations."""
        # Create a test directory for temporary files
        cls.test_dir = tempfile.mkdtemp()
        
        # Configure app for testing
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        app.config['SECRET_KEY'] = 'test-secret-key'
        
        # Mock the logging and session systems
        cls.original_logging = app.logger
        app.logger = Mock()
        
    @classmethod
    def tearDownClass(cls):
        """Clean up test class."""
        # Restore original logging
        app.logger = cls.original_logging
        
        # Remove test directory
        shutil.rmtree(cls.test_dir, ignore_errors=True)
    
    def setUp(self):
        """Set up each test with fresh client and session."""
        self.client = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()
        
        # Clear active sessions
        active_sessions.clear()
        
        # Mock LLM service responses
        self.mock_learning_content = {
            "questions": [
                {
                    "question": "What is addition?",
                    "explanation": "Addition is combining two or more numbers to get a total sum. For example, 2 + 3 = 5.",
                    "examples": ["2 + 3 = 5", "5 + 4 = 9"],
                    "context": "Addition is fundamental to all mathematics and everyday calculations."
                },
                {
                    "question": "How do you add larger numbers?",
                    "explanation": "When adding larger numbers, align digits by place value and add column by column from right to left.",
                    "examples": ["23 + 45 = 68", "156 + 234 = 390"],
                    "context": "Understanding place value is crucial for accurate addition of multi-digit numbers."
                }
            ]
        }
        
        # Mock the LLM service
        patcher = patch('app.llm_service')
        self.mock_llm_service = patcher.start()
        self.mock_llm_service.generate_learning_content.return_value = self.mock_learning_content
        self.addCleanup(patcher.stop)
        
        # Mock authentication
        patcher2 = patch('app.load_credentials')
        self.mock_load_credentials = patcher2.start()
        self.mock_load_credentials.return_value = {
            'testuser@example.com': {
                'password': 'hashedpassword',
                'school_name': 'Test School',
                'history': [],
                'statistics': {
                    'questions_attempted': 0,
                    'topics_covered': [],
                    'last_login': None
                }
            }
        }
        self.addCleanup(patcher2.stop)
        
        # Mock save_credentials to prevent file operations
        patcher3 = patch('app.save_credentials')
        self.mock_save_credentials = patcher3.start()
        self.addCleanup(patcher3.stop)
        
        # Mock log_user_activity
        patcher4 = patch('app.log_user_activity')
        self.mock_log_activity = patcher4.start()
        self.addCleanup(patcher4.stop)
    
    def tearDown(self):
        """Clean up after each test."""
        self.app_context.pop()
    
    def login_test_user(self):
        """Helper method to login a test user."""
        username = 'testuser@example.com'
        session_id = 'test-session-123'
        current_time = datetime.now().isoformat()
        
        # Add to active sessions
        active_sessions[username] = {
            'session_id': session_id,
            'last_activity': current_time,
            'school_name': 'Test School',
            'current_topic': None,
            'grade': None
        }
        
        with self.client.session_transaction() as sess:
            sess['username'] = username
            sess['session_id'] = session_id
            sess['login_time'] = current_time
            sess['logged_in'] = True
    
    def test_explore_page_renders(self):
        """Test that the explore page loads correctly."""
        self.login_test_user()
        
        response = self.client.get('/explore/3/math/number_sense_basic_operations')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Explore Math', response.data)
        self.assertIn(b'Number Sense &amp; Basic Operations', response.data)  # HTML entity encoded
        self.assertIn(b'Learn', response.data)
        self.assertIn(b'Practice', response.data)
        self.assertIn(b'Choose Your Learning Path', response.data)
    
    def test_explore_page_invalid_topic(self):
        """Test explore page with invalid topic redirects properly."""
        self.login_test_user()
        
        response = self.client.get('/explore/3/invalid_topic/subtopic')
        
        self.assertEqual(response.status_code, 302)  # Redirect
    
    def test_explore_page_invalid_subtopic(self):
        """Test explore page with invalid subtopic redirects properly."""
        self.login_test_user()
        
        response = self.client.get('/explore/3/math/invalid_subtopic')
        
        self.assertEqual(response.status_code, 302)  # Redirect
    
    def test_learn_page_renders(self):
        """Test that the learn page loads correctly."""
        self.login_test_user()
        
        response = self.client.get('/learn/3/math/number_sense_basic_operations')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Learn Math', response.data)
        self.assertIn(b'Number Sense &amp; Basic Operations', response.data)  # HTML entity encoded
        self.assertIn(b'Learning Progress', response.data)
        self.assertIn(b'Learning Tips', response.data)
    
    def test_learn_page_invalid_topic(self):
        """Test learn page with invalid topic redirects properly."""
        self.login_test_user()
        
        response = self.client.get('/learn/3/invalid_topic/subtopic')
        
        self.assertEqual(response.status_code, 302)  # Redirect
    
    def test_learn_page_invalid_subtopic(self):
        """Test learn page with invalid subtopic redirects properly."""
        self.login_test_user()
        
        response = self.client.get('/learn/3/math/invalid_subtopic')
        
        self.assertEqual(response.status_code, 302)  # Redirect
    
    def test_learn_mode_fetches_content(self):
        """Test that learning content generation works properly."""
        self.login_test_user()
        
        # First, visit the learn page to set up session
        self.client.get('/learn/3/math/number_sense_basic_operations')
        
        # Then test the API endpoint
        response = self.client.get('/get_learn_content')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertIn('content', data)
        self.assertIn('index', data)
        self.assertIn('total', data)
        self.assertEqual(len(data['content']), 2)  # Mock has 2 questions
        self.assertEqual(data['content'][0]['question'], 'What is addition?')
    
    def test_get_learn_content_no_session(self):
        """Test get_learn_content without active session."""
        response = self.client.get('/get_learn_content')
        
        # Should redirect to login due to @require_login decorator
        self.assertEqual(response.status_code, 302)  # Redirect to login
    
    def test_fetch_more_learn_content(self):
        """Test fetching additional learning content."""
        self.login_test_user()
        
        # Set up session with topic/subtopic
        with self.client.session_transaction() as sess:
            sess['current_topic'] = 'math'
            sess['current_subtopic'] = 'number_sense_basic_operations'
            sess['current_grade'] = 3
        
        response = self.client.post('/fetch_more_learn_content', 
                                  json={},
                                  content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertIn('content', data)
        self.assertIn('message', data)
        self.assertEqual(len(data['content']), 2)  # Mock returns 2 items
    
    def test_fetch_more_content_no_session(self):
        """Test fetch_more_learn_content without active session."""
        response = self.client.post('/fetch_more_learn_content',
                                  json={},
                                  content_type='application/json')
        
        # Should redirect to login due to @require_login decorator
        self.assertEqual(response.status_code, 302)  # Redirect to login
    
    def test_practice_mode_redirect(self):
        """Test that practice button redirects correctly to exercise page."""
        self.login_test_user()
        
        # Mock the exercise route dependencies
        with patch('app.load_prompt') as mock_load_prompt:
            mock_load_prompt.return_value = "Test prompt"
            
            # Mock LLM service call_llm_api method
            self.mock_llm_service.call_llm_api.return_value = {
                'questions': [
                    {
                        'question': 'Test question',
                        'hint': 'Test hint',
                        'explanation': 'Test explanation'
                    }
                ]
            }
            
            response = self.client.get('/exercise/3/math/number_sense_basic_operations')
            
            self.assertEqual(response.status_code, 200)
            self.assertIn(b'Exercise', response.data)
    
    def test_back_navigation_explore_to_subtopics(self):
        """Test back button navigation from explore page."""
        self.login_test_user()
        
        response = self.client.get('/explore/3/math/number_sense_basic_operations')
        
        self.assertEqual(response.status_code, 200)
        # Check that the back button URL is correct
        self.assertIn(b'/subtopics/3/math', response.data)
    
    def test_back_navigation_learn_to_explore(self):
        """Test back button navigation from learn page."""
        self.login_test_user()
        
        response = self.client.get('/learn/3/math/number_sense_basic_operations')
        
        self.assertEqual(response.status_code, 200)
        # Check that the back button URL points to explore page
        self.assertIn(b'/explore/3/math/number_sense_basic_operations', response.data)
    
    def test_session_management_learn_mode(self):
        """Test that session variables are properly managed in learn mode."""
        self.login_test_user()
        
        # Visit learn page
        self.client.get('/learn/3/math/number_sense_basic_operations')
        
        # Check that session variables are set correctly
        with self.client.session_transaction() as sess:
            self.assertEqual(sess.get('current_topic'), 'math')
            self.assertEqual(sess.get('current_subtopic'), 'number_sense_basic_operations')
            self.assertEqual(sess.get('current_grade'), 3)
            self.assertTrue(sess.get('learning_mode', False))
            self.assertEqual(sess.get('learning_content'), [])
            self.assertEqual(sess.get('current_content_index'), 0)
    
    def test_session_management_explore_mode(self):
        """Test that session variables are properly managed in explore mode."""
        self.login_test_user()
        
        # Visit explore page
        self.client.get('/explore/3/math/number_sense_basic_operations')
        
        # Check that active sessions are updated
        self.assertIn('testuser@example.com', active_sessions)
        session_data = active_sessions['testuser@example.com']
        self.assertEqual(session_data['current_topic'], 'math')
        self.assertEqual(session_data['current_subtopic'], 'number_sense_basic_operations')
        self.assertEqual(session_data['grade'], 3)
    
    def test_more_content_functionality(self):
        """Test the 'More' button functionality for additional content."""
        self.login_test_user()
        
        # Set up session
        with self.client.session_transaction() as sess:
            sess['current_topic'] = 'math'
            sess['current_subtopic'] = 'number_sense_basic_operations'
            sess['current_grade'] = 3
            sess['learning_content'] = self.mock_learning_content['questions']
        
        # Test fetching more content
        response = self.client.post('/fetch_more_learn_content',
                                  json={},
                                  content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertIn('content', data)
        self.assertIsInstance(data['content'], list)
        self.assertTrue(len(data['content']) > 0)
        
        # Verify LLM service was called
        self.mock_llm_service.generate_learning_content.assert_called()
    
    def test_grade_level_content_differentiation(self):
        """Test that content is properly differentiated by grade level."""
        self.login_test_user()
        
        # Test with grade 3 (should use grades_5_and_below)
        response = self.client.get('/explore/3/math/number_sense_basic_operations')
        self.assertEqual(response.status_code, 200)
        
        # Test with grade 7 (should use grades_above_5)
        response = self.client.get('/explore/7/math/number_sense_basic_operations')
        self.assertEqual(response.status_code, 200)
        
        # Both should work but may use different subtopic sets
        self.mock_log_activity.assert_called()
    
    def test_llm_service_error_handling(self):
        """Test error handling when LLM service fails."""
        self.login_test_user()
        
        # Mock LLM service to return error
        self.mock_llm_service.generate_learning_content.return_value = {
            'error': 'LLM service unavailable'
        }
        
        # Set up session
        with self.client.session_transaction() as sess:
            sess['current_topic'] = 'math'
            sess['current_subtopic'] = 'number_sense_basic_operations'
            sess['current_grade'] = 3
        
        response = self.client.get('/get_learn_content')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    def test_authentication_required(self):
        """Test that authentication is required for all explore routes."""
        # Test explore route without login
        response = self.client.get('/explore/3/math/number_sense_basic_operations')
        self.assertEqual(response.status_code, 302)  # Should redirect to login
        
        # Test learn route without login
        response = self.client.get('/learn/3/math/number_sense_basic_operations')
        self.assertEqual(response.status_code, 302)  # Should redirect to login
        
        # Test API endpoints without login - these now redirect due to @require_login
        response = self.client.get('/get_learn_content')
        self.assertEqual(response.status_code, 302)  # Should redirect to login
        
        response = self.client.post('/fetch_more_learn_content', json={})
        self.assertEqual(response.status_code, 302)  # Should redirect to login
    
    def test_different_subjects_support(self):
        """Test that the explore feature works with different subjects."""
        self.login_test_user()
        
        # Test with different subjects
        subjects = ['math', 'english', 'science', 'geography', 'history']
        
        for subject in subjects:
            if subject in SUBTOPICS:
                # Get first subtopic for this subject
                subtopics = SUBTOPICS[subject]['grades_5_and_below']
                if subtopics:
                    first_subtopic = subtopics[0]['id']
                    response = self.client.get(f'/explore/3/{subject}/{first_subtopic}')
                    self.assertEqual(response.status_code, 200)
                    self.assertIn(subject.title().encode(), response.data)


if __name__ == '__main__':
    unittest.main()
