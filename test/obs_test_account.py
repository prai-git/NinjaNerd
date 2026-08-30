import unittest
from unittest.mock import patch, MagicMock, Mock
import sys
import os
import json
import tempfile
import shutil
from datetime import datetime
from werkzeug.security import check_password_hash

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestAccountPage(unittest.TestCase):
    def setUp(self):
        """Set up test environment with temporary database"""
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)
        
        # Create test credentials file
        self.credentials_file = os.path.join(self.data_dir, 'Credentials.json')
        test_data = {
            "testuser@example.com": {
                "password": "hashed_password",
                "school_name": "Test School",
                "history": [
                    {
                        "question": "What is 2+2?",
                        "user_answer": "4",
                        "correct": True,
                        "topic": "math",
                        "subtopic": "arithmetic",
                        "grade": 3,
                        "timestamp": "2025-08-01T10:00:00"
                    }
                ],
                "created_at": "2025-08-01T00:00:00"
            }
        }
        
        with open(self.credentials_file, 'w') as f:
            json.dump(test_data, f)
    
    def tearDown(self):
        """Clean up test environment"""
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    @patch.dict(os.environ, {'MESSAGE_OBFUSCATION_KEY': 'test_key'})
    def test_account_password_update(self):
        """Test password update functionality"""
        from app import app
        from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
        
        # Reset and initialize test database
        reset_app_db()
        db = initialize_app_db(app,
                             db_path=os.path.join(self.data_dir, 'test_account.db'),
                             max_connections=5)
        db = get_app_db()
        
        # Create a test user first
        db.create_user('testuser@example.com', 'hashed_password', 'Test School')
        
        # Test password update directly
        original_user = db.get_user('testuser@example.com')
        self.assertIsNotNone(original_user)
        self.assertEqual(original_user['school_name'], 'Test School')
        
        # Update password
        success = db.update_user_password('testuser@example.com', 'new_hashed_password')
        self.assertTrue(success)
        
        # Verify password was updated
        updated_user = db.get_user('testuser@example.com')
        self.assertEqual(updated_user['password'], 'new_hashed_password')
        self.assertEqual(updated_user['school_name'], 'Test School')  # Should remain unchanged
    
    @patch.dict(os.environ, {'MESSAGE_OBFUSCATION_KEY': 'test_key'})
    def test_account_school_update(self):
        """Test school name update functionality"""
        from app import app
        from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
        
        # Reset and initialize test database
        reset_app_db()
        db = initialize_app_db(app,
                             db_path=os.path.join(self.data_dir, 'test_account.db'),
                             max_connections=5)
        db = get_app_db()
        
        # Create a test user first
        plain_password = 'test_password_123'
        db.create_user('testuser@example.com', plain_password, 'Test School')
        
        # Test school name update directly
        original_user = db.get_user('testuser@example.com')
        self.assertIsNotNone(original_user)
        self.assertEqual(original_user['school_name'], 'Test School')
        
        # Store original password hash for comparison
        original_password_hash = original_user['password']
        self.assertTrue(original_password_hash.startswith('pbkdf2:'), "Password should be hashed")
        self.assertTrue(check_password_hash(original_password_hash, plain_password), "Password hash should verify")
        
        # Update school name
        success = db.update_user_school('testuser@example.com', 'New School')
        self.assertTrue(success)
        
        # Verify school name was updated
        updated_user = db.get_user('testuser@example.com')
        self.assertEqual(updated_user['school_name'], 'New School')
        self.assertEqual(updated_user['password'], original_password_hash)  # Password should remain unchanged
    
    @patch.dict(os.environ, {'MESSAGE_OBFUSCATION_KEY': 'test_key'})
    def test_account_both_update(self):
        """Test updating both password and school name"""
        from app import app
        from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
        
        # Reset and initialize test database
        reset_app_db()
        db = initialize_app_db(app,
                             db_path=os.path.join(self.data_dir, 'test_account.db'),
                             max_connections=5)
        db = get_app_db()
        
        # Create a test user first
        db.create_user('testuser@example.com', 'hashed_password', 'Test School')
        
        # Test both updates
        original_user = db.get_user('testuser@example.com')
        self.assertIsNotNone(original_user)
        
        # Update password
        success1 = db.update_user_password('testuser@example.com', 'new_hashed_password')
        self.assertTrue(success1)
        
        # Update school name
        success2 = db.update_user_school('testuser@example.com', 'New School')
        self.assertTrue(success2)
        
        # Verify both were updated
        updated_user = db.get_user('testuser@example.com')
        self.assertEqual(updated_user['password'], 'new_hashed_password')
        self.assertEqual(updated_user['school_name'], 'New School')
    
    @patch.dict(os.environ, {'MESSAGE_OBFUSCATION_KEY': 'test_key'})
    def test_account_nonexistent_user(self):
        """Test updating nonexistent user"""
        from app import app
        from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
        
        # Reset and initialize test database
        reset_app_db()
        db = initialize_app_db(app,
                             db_path=os.path.join(self.data_dir, 'test_account.db'),
                             max_connections=5)
        db = get_app_db()
        
        # Test updating nonexistent user
        success1 = db.update_user_password('nonexistent@example.com', 'new_password')
        self.assertFalse(success1)
        
        success2 = db.update_user_school('nonexistent@example.com', 'New School')
        self.assertFalse(success2)

    @patch('app.get_app_db')
    @patch('gw.emailgw.EmailHandler')
    def test_account_form_masked_password_issue(self, mock_email_handler, mock_get_app_db):
        """Test that masked password '*****' doesn't accidentally update the actual password"""
        from app import app
        from werkzeug.security import generate_password_hash
        from datetime import datetime
        
        # Mock database
        mock_db = Mock()
        mock_get_app_db.return_value = mock_db
        
        # Mock user data
        original_password_hash = generate_password_hash('original_password')
        mock_user_data = {
            'password': original_password_hash,
            'school_name': 'Original School'
        }
        mock_db.get_user.return_value = mock_user_data
        mock_db.update_user_password.return_value = True
        mock_db.update_user_school.return_value = True
        
        # Mock email handler
        mock_handler = Mock()
        mock_email_handler.return_value = mock_handler
        
        # Get current time for valid session
        current_time = datetime.now().isoformat()
        
        with app.test_client() as client:
            with app.app_context():
                # Set up session to bypass authentication
                with client.session_transaction() as sess:
                    sess['username'] = 'testuser@example.com'
                    sess['session_id'] = 'test_session_id'
                    sess['login_time'] = current_time
                
                # Mock active_sessions to bypass session validation
                with patch('app.active_sessions', {'testuser@example.com': {
                    'session_id': 'test_session_id',
                    'last_activity': current_time
                }}):
                    # Simulate form submission with masked password and new school name
                    response = client.post('/account', data={
                        'password': '*****',  # This is the masked password that should NOT trigger update
                        'school_name': 'New School Name'
                    })
                    
                    # Verify redirect (successful form submission)
                    self.assertEqual(response.status_code, 302)
                    
                    # Verify that update_user_password was NOT called with masked password
                    mock_db.update_user_password.assert_not_called()
                    
                    # Verify that only school name update was called
                    mock_db.update_user_school.assert_called_once_with('testuser@example.com', 'New School Name')

    @patch('app.get_app_db')
    @patch('gw.emailgw.EmailHandler')
    def test_account_form_real_password_update(self, mock_email_handler, mock_get_app_db):
        """Test that real password updates still work correctly"""
        from app import app
        from werkzeug.security import generate_password_hash, check_password_hash
        from datetime import datetime
        
        # Mock database
        mock_db = Mock()
        mock_get_app_db.return_value = mock_db
        
        # Mock user data
        original_password_hash = generate_password_hash('original_password')
        mock_user_data = {
            'password': original_password_hash,
            'school_name': 'Original School'
        }
        mock_db.get_user.return_value = mock_user_data
        mock_db.update_user_password.return_value = True
        mock_db.update_user_school.return_value = True
        
        # Mock email handler
        mock_handler = Mock()
        mock_email_handler.return_value = mock_handler
        
        # Get current time for valid session
        current_time = datetime.now().isoformat()
        
        with app.test_client() as client:
            with app.app_context():
                # Set up session to bypass authentication
                with client.session_transaction() as sess:
                    sess['username'] = 'testuser@example.com'
                    sess['session_id'] = 'test_session_id'
                    sess['login_time'] = current_time
                
                # Mock active_sessions to bypass session validation
                with patch('app.active_sessions', {'testuser@example.com': {
                    'session_id': 'test_session_id',
                    'last_activity': current_time
                }}):
                    # Simulate form submission with real new password
                    response = client.post('/account', data={
                        'password': 'new_real_password',  # This should trigger password update
                        'school_name': 'Original School'  # Unchanged
                    })
                    
                    # Verify redirect (successful form submission)
                    self.assertEqual(response.status_code, 302)
                    
                    # Verify that update_user_password was called
                    mock_db.update_user_password.assert_called_once()
                    
                    # Get the arguments passed to update_user_password
                    call_args = mock_db.update_user_password.call_args
                    username_arg = call_args[0][0]
                    password_hash_arg = call_args[0][1]
                    
                    self.assertEqual(username_arg, 'testuser@example.com')
                    # Verify that the hashed password is NOT the masked value
                    self.assertFalse(check_password_hash(password_hash_arg, '*****'))
                    # Verify that the hashed password IS the new password
                    self.assertTrue(check_password_hash(password_hash_arg, 'new_real_password'))
                    
                    # School name should not be updated since it's the same
                    mock_db.update_user_school.assert_not_called()

    @patch('app.get_app_db')
    @patch('gw.emailgw.EmailHandler')
    def test_account_form_empty_password_field(self, mock_email_handler, mock_get_app_db):
        """Test that empty password field doesn't trigger password update"""
        from app import app
        from datetime import datetime
        
        # Mock database
        mock_db = Mock()
        mock_get_app_db.return_value = mock_db
        
        # Mock user data
        mock_user_data = {
            'password': 'original_hash',
            'school_name': 'Original School'
        }
        mock_db.get_user.return_value = mock_user_data
        mock_db.update_user_school.return_value = True
        
        # Mock email handler
        mock_handler = Mock()
        mock_email_handler.return_value = mock_handler
        
        # Get current time for valid session
        current_time = datetime.now().isoformat()
        
        with app.test_client() as client:
            with app.app_context():
                # Set up session to bypass authentication
                with client.session_transaction() as sess:
                    sess['username'] = 'testuser@example.com'
                    sess['session_id'] = 'test_session_id'
                    sess['login_time'] = current_time
                
                # Mock active_sessions to bypass session validation
                with patch('app.active_sessions', {'testuser@example.com': {
                    'session_id': 'test_session_id',
                    'last_activity': current_time
                }}):
                    # Simulate form submission with empty password field
                    response = client.post('/account', data={
                        'password': '',  # Empty password should not trigger update
                        'school_name': 'New School Name'
                    })
                    
                    # Verify redirect (successful form submission)
                    self.assertEqual(response.status_code, 302)
                    
                    # Verify that update_user_password was NOT called
                    mock_db.update_user_password.assert_not_called()
                    
                    # Verify that only school name update was called
                    mock_db.update_user_school.assert_called_once_with('testuser@example.com', 'New School Name')


if __name__ == '__main__':
    unittest.main()
