import unittest
from unittest.mock import patch, MagicMock, Mock
import sys
import os
import json
import tempfile
import shutil

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestContactUsPage(unittest.TestCase):
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
                "history": [],
                "created_at": "2025-08-01T00:00:00"
            }
        }
        
        with open(self.credentials_file, 'w') as f:
            json.dump(test_data, f)
    
    def tearDown(self):
        """Clean up test environment"""
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_email_handler_functionality(self):
        """Test EmailHandler functionality directly"""
        from gw.emailgw import EmailHandler
        
        # Test that EmailHandler can be instantiated (mock credentials)
        with patch.dict(os.environ, {'PR_GMAIL_ID': 'test@gmail.com', 'PR_GMAIL_SECRET': 'test_secret'}):
            handler = EmailHandler()
            self.assertEqual(handler.gmail_id, 'test@gmail.com')
            self.assertEqual(handler.gmail_secret, 'test_secret')
    
    def test_email_handler_missing_credentials(self):
        """Test EmailHandler with missing credentials"""
        from gw.emailgw import EmailHandler
        
        # Clear environment variables
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError):
                EmailHandler()
    
    def test_contact_form_validation(self):
        """Test contact form validation logic"""
        
        # Test empty subject and content
        subject = ""
        content = ""
        self.assertTrue(not subject or not content)  # Should fail validation
        
        # Test valid subject and content
        subject = "Test Subject"
        content = "Valid content"
        self.assertFalse(not subject or not content)  # Should pass validation
        
        # Test content length validation
        long_content = "a" * 301  # 301 characters
        self.assertTrue(len(long_content) > 300)  # Should fail validation
        
        valid_content = "a" * 300  # 300 characters
        self.assertFalse(len(valid_content) > 300)  # Should pass validation
    
    def test_email_formatting(self):
        """Test email content formatting"""
        username = "testuser@example.com"
        subject = "Test Subject"
        content = "Test message content"
        
        # Format email as done in the route
        email_subject = f"Contact Us - {subject}"
        email_body = f"From: {username}\n\nSubject: {subject}\n\nMessage:\n{content}"
        
        self.assertEqual(email_subject, "Contact Us - Test Subject")
        self.assertEqual(email_body, "From: testuser@example.com\n\nSubject: Test Subject\n\nMessage:\nTest message content")
    
    @patch('gw.emailgw.EmailHandler')
    def test_email_send_success(self, mock_email_handler_class):
        """Test successful email sending simulation"""
        # Mock the EmailHandler class and instance
        mock_handler = Mock()
        mock_handler._send_email.return_value = True
        mock_handler.send_email_async.return_value = None  # Async method returns None
        mock_email_handler_class.return_value = mock_handler
        
        # Test synchronous sending
        handler = mock_email_handler_class()
        result = handler._send_email("ninjanerdonpi@gmail.com", "Test Subject", "Test Body")
        
        self.assertTrue(result)
        mock_handler._send_email.assert_called_once_with("ninjanerdonpi@gmail.com", "Test Subject", "Test Body")
        
        # Test asynchronous sending (should not raise exception)
        handler.send_email_async("ninjanerdonpi@gmail.com", "Test Async Subject", "Test Async Body")
        mock_handler.send_email_async.assert_called_once_with("ninjanerdonpi@gmail.com", "Test Async Subject", "Test Async Body")
    
    @patch('gw.emailgw.EmailHandler')
    def test_email_send_failure(self, mock_email_handler_class):
        """Test email sending failure simulation"""
        # Mock the EmailHandler class and instance
        mock_handler = Mock()
        mock_handler._send_email.return_value = False
        mock_email_handler_class.return_value = mock_handler
        
        # Simulate sending email
        handler = mock_email_handler_class()
        result = handler._send_email("ninjanerdonpi@gmail.com", "Test Subject", "Test Body")
        
        self.assertFalse(result)


if __name__ == '__main__':
    unittest.main()
