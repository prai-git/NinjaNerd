#!/usr/bin/env python3
"""
Performance test to verify async email functionality doesn't block the main thread.
"""

import os
import sys
import time
import unittest
from unittest.mock import patch

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestAsyncPerformance(unittest.TestCase):
    
    def test_async_email_performance(self):
        """Test that async email operations don't block the main thread."""
        from gw.emailgw import EmailHandler
        
        # Mock the SMTP operations to avoid actual email sending
        with patch('smtplib.SMTP') as mock_smtp:
            # Configure mock to simulate a slow email operation
            mock_server = mock_smtp.return_value.__enter__.return_value
            mock_server.starttls.return_value = None
            mock_server.login.return_value = None
            mock_server.send_message.return_value = None
            
            # Add artificial delay to simulate slow email operation
            def slow_send_message(*args, **kwargs):
                time.sleep(0.5)  # Simulate 500ms email operation
                return None
            
            mock_server.send_message.side_effect = slow_send_message
            
            # Test synchronous operation (should take time)
            handler = EmailHandler(gmail_id="test@test.com", gmail_secret="test")
            
            start_time = time.time()
            result = handler._send_email("test@example.com", "Test", "Test body")
            sync_duration = time.time() - start_time
            
            self.assertTrue(result)
            self.assertGreater(sync_duration, 0.4)  # Should take at least 400ms
            
            # Test asynchronous operation (should return immediately)
            start_time = time.time()
            handler.send_email_async("test@example.com", "Test Async", "Test async body")
            async_duration = time.time() - start_time
            
            # Async operation should return immediately
            self.assertLess(async_duration, 0.1)  # Should return in less than 100ms
            
            # Give background thread time to complete
            time.sleep(0.6)
            
            # Cleanup
            handler.shutdown()
            
            print(f"Sync operation took: {sync_duration:.3f} seconds")
            print(f"Async operation returned in: {async_duration:.3f} seconds")
            print("✅ Async email implementation provides significant performance improvement!")

if __name__ == "__main__":
    unittest.main()
