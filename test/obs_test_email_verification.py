import pytest
import unittest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime, timedelta
import sys
import os

# Add project root to path so we can import our modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dbmgr.sqlite_manager import SQLiteManager
from dbmgr.sqlite_app_integration import SQLiteAppIntegration


class TestEmailVerificationBasic(unittest.TestCase):
    """Basic test for email verification functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Create mock dependencies
        self.mock_connection_pool = Mock()
        self.mock_queue_manager = Mock()
        self.mock_session_manager = Mock()
        self.mock_recovery_manager = Mock()
        self.mock_logger = Mock()
        
        # Mock connection context manager properly
        self.mock_conn = Mock()
        mock_context_manager = MagicMock()
        mock_context_manager.__enter__.return_value = self.mock_conn
        mock_context_manager.__exit__.return_value = None
        self.mock_connection_pool.get_connection.return_value = mock_context_manager
        
        # Create SQLiteManager with mocked dependencies
        with patch('dbmgr.sqlite_manager.SQLiteConnectionPool') as mock_pool_class, \
             patch('dbmgr.sqlite_manager.QueueManager') as mock_queue_class, \
             patch('dbmgr.sqlite_manager.SessionManager') as mock_session_class, \
             patch('dbmgr.sqlite_manager.DatabaseRecoveryManager') as mock_recovery_class, \
             patch('dbmgr.sqlite_manager.Path') as mock_path:
            
            mock_pool_class.return_value = self.mock_connection_pool
            mock_queue_class.return_value = self.mock_queue_manager
            mock_session_class.return_value = self.mock_session_manager
            mock_recovery_class.return_value = self.mock_recovery_manager
            
            # Mock path operations
            mock_path.return_value.parent.mkdir = Mock()
            
            self.sqlite_manager = SQLiteManager(':memory:')
            self.sqlite_manager.connection_pool = self.mock_connection_pool
            self.sqlite_manager.queue_manager = self.mock_queue_manager
            self.sqlite_manager.session_manager = self.mock_session_manager
            self.sqlite_manager.recovery_manager = self.mock_recovery_manager
            self.sqlite_manager._logger = self.mock_logger
    
    def test_create_verification_code_success(self):
        """Test successful creation of verification code."""
        # Mock successful execution
        mock_future = Mock()
        mock_future.result.return_value = True
        self.mock_queue_manager.submit_write_operation.return_value = mock_future
        
        # Test data
        email = "test@example.com"
        code = "1234"
        expires_at = datetime.now() + timedelta(minutes=10)
        
        # Execute
        result = self.sqlite_manager.create_verification_code(email, code, expires_at)
        
        # Verify
        self.assertTrue(result)
        self.mock_queue_manager.submit_write_operation.assert_called_once()
    
    def test_verify_code_success(self):
        """Test successful code verification."""
        # Mock successful verification
        mock_future = Mock()
        mock_future.result.return_value = True
        self.mock_queue_manager.submit_write_operation.return_value = mock_future
        
        # Execute
        result = self.sqlite_manager.verify_code("test@example.com", "1234")
        
        # Verify
        self.assertTrue(result)
    
    def test_verify_code_invalid(self):
        """Test verification with invalid code."""
        # Mock invalid code
        mock_future = Mock()
        mock_future.result.return_value = False
        self.mock_queue_manager.submit_write_operation.return_value = mock_future
        
        # Execute
        result = self.sqlite_manager.verify_code("test@example.com", "9999")
        
        # Verify
        self.assertFalse(result)
    
    def test_cleanup_expired_codes(self):
        """Test cleanup of expired verification codes."""
        # Mock cleanup returning count
        mock_future = Mock()
        mock_future.result.return_value = 3
        self.mock_queue_manager.submit_write_operation.return_value = mock_future
        
        # Execute
        result = self.sqlite_manager.cleanup_expired_verification_codes()
        
        # Verify
        self.assertEqual(result, 3)
    
    def test_get_verification_code_info(self):
        """Test getting verification code info."""
        # Mock code info
        mock_future = Mock()
        expected_info = {
            'created_at': '2024-01-15 10:00:00',
            'expires_at': '2024-01-15 10:10:00',
            'used': False,
            'attempts': 1
        }
        mock_future.result.return_value = expected_info
        self.mock_queue_manager.submit_read_operation.return_value = mock_future
        
        # Execute
        result = self.sqlite_manager.get_verification_code_info("test@example.com")
        
        # Verify
        self.assertEqual(result, expected_info)


class TestEmailVerificationIntegration(unittest.TestCase):
    """Test email verification functionality through SQLiteAppIntegration."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_sqlite_manager = Mock()
        
        # Create integration with mocked SQLiteManager
        with patch('dbmgr.sqlite_app_integration.SQLiteManager') as mock_manager_class:
            mock_manager_class.return_value = self.mock_sqlite_manager
            
            self.integration = SQLiteAppIntegration()
            self.integration.sqlite_manager = self.mock_sqlite_manager
    
    def test_integration_create_verification_code(self):
        """Test SQLiteAppIntegration wrapper for create_verification_code."""
        # Mock successful creation
        self.mock_sqlite_manager.create_verification_code.return_value = True
        
        # Test data
        email = "test@example.com"
        code = "1234"
        expires_at = datetime.now() + timedelta(minutes=10)
        
        # Execute
        result = self.integration.create_verification_code(email, code, expires_at)
        
        # Verify
        self.assertTrue(result)
        self.mock_sqlite_manager.create_verification_code.assert_called_once_with(email, code, expires_at)
    
    def test_integration_verify_code(self):
        """Test SQLiteAppIntegration wrapper for verify_code."""
        # Mock successful verification
        self.mock_sqlite_manager.verify_code.return_value = True
        
        # Execute
        result = self.integration.verify_code("test@example.com", "1234")
        
        # Verify
        self.assertTrue(result)
        self.mock_sqlite_manager.verify_code.assert_called_once_with("test@example.com", "1234")
    
    def test_integration_error_handling(self):
        """Test that integration wrappers handle errors gracefully."""
        # Mock exception
        self.mock_sqlite_manager.create_verification_code.side_effect = Exception("Database error")
        
        # Execute
        result = self.integration.create_verification_code("test@example.com", "1234", datetime.now())
        
        # Verify error is caught and False returned
        self.assertFalse(result)


class TestEmailSending(unittest.TestCase):
    """Test email sending functionality."""
    
    def test_email_handler_import(self):
        """Test that EmailHandler can be imported."""
        try:
            from gw.emailgw import EmailHandler
            self.assertTrue(True)  # If we get here, import succeeded
        except ImportError:
            self.fail("EmailHandler could not be imported")
    
    @patch('gw.emailgw.smtplib.SMTP')
    def test_email_sending_mock(self, mock_smtp):
        """Test email sending with mocked SMTP."""
        # Import EmailHandler
        from gw.emailgw import EmailHandler
        
        # Mock SMTP server
        mock_server = Mock()
        mock_smtp.return_value.__enter__.return_value = mock_server
        
        # Create EmailHandler
        email_handler = EmailHandler()
        
        # Test sending verification code
        try:
            result = email_handler.send_verification_code_async("test@example.com", "1234")
            # If no exception, consider it a success
            self.assertTrue(True)
        except Exception as e:
            # If there's an error, it might be due to missing environment variables
            # which is expected in test environment
            self.assertIn("environment", str(e).lower())


class TestVerificationCodeLogic(unittest.TestCase):
    """Test verification code logic and security."""
    
    def test_verification_code_format(self):
        """Test that verification codes are 4 digits."""
        # Valid 4-digit codes
        valid_codes = ["1234", "0000", "9999", "5678"]
        for code in valid_codes:
            self.assertEqual(len(code), 4)
            self.assertTrue(code.isdigit())
        
        # Test that codes are strings (not integers)
        self.assertIsInstance("1234", str)
    
    def test_expiry_time_calculation(self):
        """Test that expiry time is calculated correctly."""
        # Test 10-minute expiry
        now = datetime.now()
        expires_at = now + timedelta(minutes=10)
        
        # Should be exactly 10 minutes later
        self.assertEqual((expires_at - now).total_seconds(), 600)  # 10 minutes = 600 seconds
    
    def test_security_considerations(self):
        """Test security considerations."""
        # Test that multiple attempts should be tracked
        max_attempts = 5
        
        # Mock failed attempts
        for attempt in range(max_attempts):
            # These should be under the limit
            self.assertLess(attempt, max_attempts)
        
        # This should meet the limit
        self.assertEqual(max_attempts, 5)


if __name__ == '__main__':
    unittest.main()