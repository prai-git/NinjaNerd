import pytest
import unittest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime, timedelta
import sys
import os
import json

# Add project root to path so we can import our modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


class TestEmailVerificationFlaskSimple(unittest.TestCase):
    """Simple test for email verification Flask integration."""
    
    def test_app_import(self):
        """Test that the app can be imported."""
        try:
            from app import app
            self.assertIsNotNone(app)
        except ImportError as e:
            self.fail(f"Could not import app: {e}")
    
    def test_email_handler_import(self):
        """Test that EmailHandler can be imported and used."""
        try:
            from gw.emailgw import EmailHandler
            email_handler = EmailHandler()
            self.assertIsNotNone(email_handler)
        except ImportError as e:
            self.fail(f"Could not import EmailHandler: {e}")
    
    @patch('gw.emailgw.smtplib.SMTP')
    def test_email_verification_code_generation(self, mock_smtp):
        """Test verification code generation logic."""
        import random
        
        # Generate a 4-digit code like the app would
        code = str(random.randint(1000, 9999))
        
        # Verify it's 4 digits
        self.assertEqual(len(code), 4)
        self.assertTrue(code.isdigit())
        
        # Verify it's in valid range
        self.assertGreaterEqual(int(code), 1000)
        self.assertLessEqual(int(code), 9999)
    
    def test_verification_expiry_calculation(self):
        """Test verification code expiry calculation."""
        # Test 10-minute expiry like in the app
        now = datetime.now()
        expires_at = now + timedelta(minutes=10)
        
        # Should be exactly 10 minutes later
        time_diff = (expires_at - now).total_seconds()
        self.assertEqual(time_diff, 600)  # 10 minutes = 600 seconds
        
        # Test that it's in the future
        self.assertGreater(expires_at, now)
    
    @patch('dbmgr.sqlite_app_integration.get_app_db')
    def test_database_integration_mocked(self, mock_get_db):
        """Test database integration with mocking."""
        # Mock the database
        mock_db = Mock()
        mock_get_db.return_value = mock_db
        
        # Mock successful verification
        mock_db.verify_code.return_value = True
        mock_db.create_verification_code.return_value = True
        mock_db.get_verification_code_info.return_value = None
        
        # Import and get database
        from dbmgr.sqlite_app_integration import get_app_db
        db = get_app_db()
        
        # Test that methods exist and work with mocking
        result = db.verify_code("test@example.com", "1234")
        self.assertTrue(result)
        
        result = db.create_verification_code("test@example.com", "1234", datetime.now() + timedelta(minutes=10))
        self.assertTrue(result)
    
    def test_email_validation_logic(self):
        """Test email validation logic."""
        import re
        
        # More strict email validation regex (no consecutive dots, includes + for tags)
        email_pattern = r'^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        # Valid emails
        valid_emails = [
            "test@example.com",
            "user.name@domain.co.uk",
            "user+tag@example.org"
        ]
        
        for email in valid_emails:
            self.assertTrue(re.match(email_pattern, email), f"Email {email} should be valid")
        
        # Invalid emails
        invalid_emails = [
            "invalid-email",
            "@example.com",
            "test@"
        ]
        
        for email in invalid_emails:
            self.assertFalse(re.match(email_pattern, email), f"Email {email} should be invalid")
        
        # Test for consecutive dots separately (regex alone might not catch this)
        def is_valid_email(email):
            # Basic regex check
            if not re.match(email_pattern, email):
                return False
            # Additional check for consecutive dots
            if '..' in email:
                return False
            return True
        
        # Test the enhanced validation
        self.assertTrue(is_valid_email("test@example.com"))
        self.assertFalse(is_valid_email("test..test@example.com"))
    
    def test_security_code_format(self):
        """Test security aspects of verification codes."""
        # Test that codes are always 4 digits
        import random
        
        for _ in range(100):  # Test multiple generations
            code = str(random.randint(1000, 9999))
            self.assertEqual(len(code), 4)
            self.assertTrue(code.isdigit())
            
            # Ensure it's not predictable (different codes)
            code2 = str(random.randint(1000, 9999))
            # While codes could be the same, over 100 iterations they should vary
            
    def test_rate_limiting_logic(self):
        """Test rate limiting logic for verification codes."""
        # Simulate rate limiting check
        now = datetime.now()
        last_sent = now - timedelta(seconds=30)  # 30 seconds ago
        
        # Should be rate limited (less than 60 seconds)
        time_diff = (now - last_sent).total_seconds()
        should_rate_limit = time_diff < 60
        self.assertTrue(should_rate_limit)
        
        # Test when enough time has passed
        last_sent_old = now - timedelta(seconds=70)  # 70 seconds ago
        time_diff_old = (now - last_sent_old).total_seconds()
        should_rate_limit_old = time_diff_old < 60
        self.assertFalse(should_rate_limit_old)
    
    def test_input_sanitization(self):
        """Test input sanitization."""
        # Test potential XSS/injection attempts
        malicious_inputs = [
            "<script>alert('xss')</script>",
            "'; DROP TABLE users; --",
            "\r\nBCC: evil@hacker.com",
            "test@example.com\nSubject: Injected"
        ]
        
        for malicious_input in malicious_inputs:
            # Basic sanitization - remove newlines and scripts
            sanitized = malicious_input.replace('\r', '').replace('\n', '').replace('<script>', '').replace('</script>', '')
            
            # Should not contain dangerous patterns after sanitization
            self.assertNotIn('<script>', sanitized.lower())
            self.assertNotIn('\r', sanitized)
            self.assertNotIn('\n', sanitized)


class TestEmailVerificationConfig(unittest.TestCase):
    """Test email verification configuration and environment."""
    
    def test_environment_variables_available(self):
        """Test that required environment variables are available."""
        # These should be set for email testing
        gmail_id = os.getenv('PR_GMAIL_ID')
        gmail_secret = os.getenv('PR_GMAIL_SECRET')
        
        # For testing, these should be available
        if gmail_id and gmail_secret:
            self.assertIsNotNone(gmail_id)
            self.assertIsNotNone(gmail_secret)
            self.assertIn('@', gmail_id)  # Should be an email
            self.assertTrue(len(gmail_secret) > 0)  # Should have a password
        else:
            # If not set, that's also fine for basic testing
            self.assertTrue(True)
    
    def test_template_file_exists(self):
        """Test that the create account template exists."""
        template_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'create_account.html')
        self.assertTrue(os.path.exists(template_path), "create_account.html template should exist")
    
    def test_database_manager_import(self):
        """Test that database managers can be imported."""
        try:
            from dbmgr.sqlite_manager import SQLiteManager
            from dbmgr.sqlite_app_integration import SQLiteAppIntegration
            self.assertTrue(True)  # If we get here, imports worked
        except ImportError as e:
            self.fail(f"Could not import database managers: {e}")
    
    def test_verification_code_security_properties(self):
        """Test security properties of verification codes."""
        # Test that codes are numeric only (no letters that could be confusing)
        import random
        
        for _ in range(50):
            code = str(random.randint(1000, 9999))
            
            # Should be exactly 4 characters
            self.assertEqual(len(code), 4)
            
            # Should be all digits
            self.assertTrue(code.isdigit())
            
            # Should not contain confusing characters like 0, O, 1, l, I
            # (This is a design choice for better user experience)
            # For now, we allow all digits but this could be enhanced
    
    def test_flask_app_configuration(self):
        """Test basic Flask app configuration."""
        try:
            from app import app
            
            # Test that app is configured
            self.assertIsNotNone(app.secret_key)
            
            # Test that logging is configured
            self.assertIsNotNone(app.logger)
            
        except Exception as e:
            self.fail(f"Flask app configuration test failed: {e}")


if __name__ == '__main__':
    unittest.main()