import unittest
from unittest.mock import patch, MagicMock, Mock
import sys
import os
import json
import tempfile
import shutil
from datetime import datetime
from werkzeug.security import generate_password_hash

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestAuditFeature(unittest.TestCase):
    """Test suite for the admin audit feature"""
    
    def setUp(self):
        """Set up test environment with temporary database"""
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)
        
        # Create test credentials file with admin and regular user
        self.credentials_file = os.path.join(self.data_dir, 'Credentials.json')
        test_data = {
            "admin@gmail.com": {
                "password": generate_password_hash("adminatgmaildotcom"),
                "school_name": "NinjaNerd Academy",
                "history": [
                    {
                        "question": "Admin test question",
                        "user_answer": "Admin test answer",
                        "correct": True,
                        "topic": "math",
                        "subtopic": "algebra",
                        "grade": 8,
                        "timestamp": "2025-09-09T10:00:00.000000"
                    }
                ],
                "statistics": {
                    "questions_attempted": 5,
                    "topics_covered": ["math", "science"],
                    "last_login": "2025-09-09T09:00:00.000000"
                }
            },
            "testuser@example.com": {
                "password": generate_password_hash("testpassword"),
                "school_name": "Test School",
                "history": [
                    {
                        "question": "What is 2+2?",
                        "user_answer": "4",
                        "correct": True,
                        "topic": "math",
                        "subtopic": "arithmetic",
                        "grade": 2,
                        "timestamp": "2025-09-08T15:30:00.000000"
                    },
                    {
                        "question": "What is the capital of France?",
                        "user_answer": "Paris",
                        "correct": True,
                        "topic": "geography",
                        "subtopic": "capitals",
                        "grade": 5,
                        "timestamp": "2025-09-08T16:00:00.000000"
                    }
                ],
                "statistics": {
                    "questions_attempted": 10,
                    "topics_covered": ["math", "geography", "science"],
                    "last_login": "2025-09-08T14:00:00.000000"
                }
            }
        }
        
        with open(self.credentials_file, 'w') as f:
            json.dump(test_data, f)
        
        # Create collaboration file
        self.collaboration_file = os.path.join(self.data_dir, 'Collaboration.json')
        collaboration_data = {
            "invites": {},
            "chat_sessions": {},
            "message_counter": 0
        }
        
        with open(self.collaboration_file, 'w') as f:
            json.dump(collaboration_data, f)
    
    def tearDown(self):
        """Clean up test environment"""
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_is_admin_user_function(self):
        """Test the is_admin_user function"""
        from app import is_admin_user
        
        # Test admin user
        self.assertTrue(is_admin_user("admin@gmail.com"))
        
        # Test non-admin users
        self.assertFalse(is_admin_user("testuser@example.com"))
        self.assertFalse(is_admin_user("regular@user.com"))
        self.assertFalse(is_admin_user(""))
        self.assertFalse(is_admin_user(None))
    
    @patch('app.get_app_db')
    def test_admin_access_control(self, mock_get_db):
        """Test that only admin users can access audit page"""
        from app import app, is_admin_user
        
        # Mock database
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Test access without login (should redirect to login)
                response = client.get('/audit')
                self.assertEqual(response.status_code, 302)
                self.assertIn('login', response.location)
                
                # Test access with non-admin user (should be denied)
                with client.session_transaction() as sess:
                    sess['username'] = 'testuser@example.com'
                    sess['session_id'] = 'test-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add user to active sessions for validation
                mock_active_sessions['testuser@example.com'] = {
                    'session_id': 'test-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                response = client.get('/audit')
                self.assertEqual(response.status_code, 302)
                self.assertIn('about', response.location)
                
                # Test access with admin user (should be allowed)
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                response = client.get('/audit')
                self.assertEqual(response.status_code, 200)
                self.assertIn(b'User Audit', response.data)
    
    @patch('app.get_app_db')
    def test_audit_page_get_request(self, mock_get_db):
        """Test GET request to audit page shows search form"""
        from app import app
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Login as admin
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                response = client.get('/audit')
                self.assertEqual(response.status_code, 200)
                
                # Check for search form elements
                response_text = response.data.decode('utf-8')
                self.assertIn('Username to Audit', response_text)
                self.assertIn('Generate Audit Report', response_text)
                self.assertIn('Enter a username to generate', response_text)
    
    @patch('app.get_app_db')
    def test_audit_user_found(self, mock_get_db):
        """Test audit for existing user"""
        from app import app
        
        # Mock database to return test user data
        mock_db = MagicMock()
        mock_db.get_user.return_value = {
            "password": "hashed_password",
            "school_name": "Test School",
            "history": [
                {
                    "question": "What is 2+2?",
                    "user_answer": "4",
                    "correct": True,
                    "topic": "math",
                    "grade": 2,
                    "timestamp": "2025-09-08T15:30:00.000000"
                }
            ],
            "statistics": {
                "questions_attempted": 10,
                "topics_covered": ["math", "science"],
                "last_login": "2025-09-08T14:00:00.000000"
            }
        }
        # Mock empty payment history
        mock_db.get_user_payments.return_value = None
        mock_get_db.return_value = mock_db
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Login as admin
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                # Submit audit request
                response = client.post('/audit', data={'username': 'testuser@example.com'})
                self.assertEqual(response.status_code, 200)
                
                response_text = response.data.decode('utf-8')
                
                # Verify audit report content
                self.assertIn('Audit Report for: testuser@example.com', response_text)
                self.assertIn('Test School', response_text)
                self.assertIn('10', response_text)  # questions attempted
                self.assertIn('2025-09-08T14:00:00.000000', response_text)  # last login
                self.assertIn('What is 2+2?', response_text)  # question in history
                # Payment section should not appear when no payments exist (check for actual header, not comment)
                self.assertNotIn('<i class="fas fa-receipt me-2"></i>Payment History', response_text)
                
                # Verify database was called correctly
                mock_db.get_user.assert_called_once_with('testuser@example.com')
    
    @patch('app.get_app_db')
    def test_audit_user_not_found(self, mock_get_db):
        """Test audit for non-existent user"""
        from app import app
        
        # Mock database to return None (user not found)
        mock_db = MagicMock()
        mock_db.get_user.return_value = None
        mock_get_db.return_value = mock_db
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Login as admin
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                # Submit audit request for non-existent user
                response = client.post('/audit', data={'username': 'nonexistent@user.com'})
                self.assertEqual(response.status_code, 302)  # Should redirect back to audit page
                
                # Verify database was called
                mock_db.get_user.assert_called_once_with('nonexistent@user.com')
    
    @patch('app.get_app_db')
    def test_audit_empty_username(self, mock_get_db):
        """Test audit with empty username"""
        from app import app
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Login as admin
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                # Submit audit request with empty username
                # With our new input validation, this should return 400 error due to invalid input
                response = client.post('/audit', data={'username': ''})
                self.assertEqual(response.status_code, 400)  # Should return bad request due to input validation
                
                # Database should not be called
                mock_get_db.return_value.get_user.assert_not_called()
    
    def test_audit_data_structure(self):
        """Test the audit data structure is correct"""
        # Mock user data
        user_data = {
            "school_name": "Test School",
            "history": [
                {
                    "question": "Test question",
                    "user_answer": "Test answer",
                    "correct": True,
                    "topic": "math",
                    "grade": 3,
                    "timestamp": "2025-09-08T12:00:00.000000"
                }
            ],
            "statistics": {
                "questions_attempted": 5,
                "topics_covered": ["math", "science"],
                "last_login": "2025-09-08T10:00:00.000000"
            }
        }
        
        # Simulate audit data extraction (as done in the route)
        audit_data = {
            'username': 'testuser@example.com',
            'school_name': user_data.get('school_name', 'Not specified'),
            'history': user_data.get('history', []),
            'statistics': user_data.get('statistics', {}),
            'last_login': user_data.get('statistics', {}).get('last_login', 'Never'),
            'questions_attempted': user_data.get('statistics', {}).get('questions_attempted', 0),
            'topics_covered': user_data.get('statistics', {}).get('topics_covered', []),
            'payment_history': [],
            'payment_amount': 0.0,
            'payment_receipt_link': None
        }
        
        # Verify audit data structure
        self.assertEqual(audit_data['username'], 'testuser@example.com')
        self.assertEqual(audit_data['school_name'], 'Test School')
        self.assertEqual(len(audit_data['history']), 1)
        self.assertEqual(audit_data['questions_attempted'], 5)
        self.assertEqual(len(audit_data['topics_covered']), 2)
        self.assertEqual(audit_data['last_login'], '2025-09-08T10:00:00.000000')
        self.assertEqual(audit_data['payment_amount'], 0.0)
        self.assertIsNone(audit_data['payment_receipt_link'])
    
    def test_about_page_admin_link_visibility(self):
        """Test that audit link appears only for admin users in about page"""
        from app import app
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Test with admin user
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                response = client.get('/about')
                self.assertEqual(response.status_code, 200)
                response_text = response.data.decode('utf-8')
                self.assertIn('Audit', response_text)
                self.assertIn('fas fa-search', response_text)
                
                # Test with regular user
                with client.session_transaction() as sess:
                    sess['username'] = 'testuser@example.com'
                    sess['session_id'] = 'user-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add regular user to active sessions for validation
                mock_active_sessions['testuser@example.com'] = {
                    'session_id': 'user-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                response = client.get('/about')
                self.assertEqual(response.status_code, 200)
                response_text = response.data.decode('utf-8')
                # Should not contain audit link for regular users
                audit_link_count = response_text.count('href="/audit"')
                self.assertEqual(audit_link_count, 0)
    
    @patch('app.get_app_db')
    def test_audit_database_error_handling(self, mock_get_db):
        """Test audit handles database errors gracefully"""
        from app import app
        
        # Mock database to raise an exception
        mock_db = MagicMock()
        mock_db.get_user.side_effect = Exception("Database error")
        mock_get_db.return_value = mock_db
        
        app.config['TESTING'] = True
        
        with patch('app.active_sessions', {}) as mock_active_sessions:
            with app.test_client() as client:
                # Login as admin
                with client.session_transaction() as sess:
                    sess['username'] = 'admin@gmail.com'
                    sess['session_id'] = 'admin-session-id'
                    sess['login_time'] = datetime.now().isoformat()
                    sess.permanent = True
                
                # Add admin to active sessions for validation
                mock_active_sessions['admin@gmail.com'] = {
                    'session_id': 'admin-session-id',
                    'last_activity': datetime.now().isoformat()
                }
                
                # Submit audit request that will cause database error
                response = client.post('/audit', data={'username': 'testuser@example.com'})
                self.assertEqual(response.status_code, 302)  # Should redirect back to audit page
    
    def test_audit_login_history_extraction(self):
        """Test extraction of login history from user history"""
        history_data = [
            {
                "question": "Math question",
                "topic": "math",
                "grade": 3,
                "timestamp": "2025-09-08T10:00:00.000000"
            },
            {
                "question": "Science question", 
                "topic": "science",
                "grade": 4,
                "timestamp": "2025-09-08T11:00:00.000000"
            }
        ]
        
        # Simulate login events extraction (as done in the route)
        login_events = []
        for entry in history_data:
            if 'timestamp' in entry:
                login_events.append({
                    'timestamp': entry['timestamp'],
                    'activity': entry.get('topic', 'activity'),
                    'details': f"Grade {entry.get('grade', 'unknown')} - {entry.get('topic', 'unknown')}"
                })
        
        sorted_events = sorted(login_events, key=lambda x: x['timestamp'], reverse=True)
        
        # Verify extraction
        self.assertEqual(len(sorted_events), 2)
        self.assertEqual(sorted_events[0]['timestamp'], "2025-09-08T11:00:00.000000")  # Most recent first
        self.assertEqual(sorted_events[0]['activity'], "science")
        self.assertEqual(sorted_events[0]['details'], "Grade 4 - science")

def run_audit_tests():
    """Run the audit feature tests"""
    print("Running Audit Feature Tests...")
    unittest.main(argv=[''], exit=False, verbosity=2)

if __name__ == '__main__':
    run_audit_tests()
