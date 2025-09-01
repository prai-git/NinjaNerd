
import os
import sys
import unittest
import time
# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from gw.emailgw import EmailHandler

class TestEmailHandler(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use environment variables for credentials
        cls.to_email = os.environ.get('PR_GMAIL_ID')  # Send to self for test
        cls.handler = EmailHandler()

    def test_send_account_creation(self):
        result = self.handler.send_account_creation(self.to_email, username="TestUser")
        self.assertTrue(result, "Account creation email failed to send.")

    def test_send_feedback(self):
        result = self.handler.send_feedback(self.to_email, user="TestUser", feedback="Great app!")
        self.assertTrue(result, "Feedback email failed to send.")

    def test_send_payment_processed(self):
        receipt_info = {"Amount": "$10.00", "Transaction ID": "1234567890", "Date": "2025-08-19"}
        result = self.handler.send_payment_processed(self.to_email, user="TestUser", receipt_info=receipt_info)
        self.assertTrue(result, "Payment processed email failed to send.")

    def test_send_account_creation_async(self):
        """Test async account creation email (should return immediately)."""
        try:
            # This should return immediately without blocking
            self.handler.send_account_creation_async(self.to_email, username="TestUserAsync")
            # Give it a moment for the background task to start
            time.sleep(0.1)
            # Test passes if no exception is raised
            self.assertTrue(True, "Async account creation email queued successfully.")
        except Exception as e:
            self.fail(f"Async account creation email failed: {e}")

    def test_send_feedback_async(self):
        """Test async feedback email (should return immediately)."""
        try:
            # This should return immediately without blocking
            self.handler.send_feedback_async(self.to_email, user="TestUserAsync", feedback="Great async app!")
            # Give it a moment for the background task to start
            time.sleep(0.1)
            # Test passes if no exception is raised
            self.assertTrue(True, "Async feedback email queued successfully.")
        except Exception as e:
            self.fail(f"Async feedback email failed: {e}")

    def test_send_payment_processed_async(self):
        """Test async payment processed email (should return immediately)."""
        try:
            receipt_info = {"Amount": "$10.00", "Transaction ID": "ASYNC123", "Date": "2025-09-01"}
            # This should return immediately without blocking
            self.handler.send_payment_processed_async(self.to_email, user="TestUserAsync", receipt_info=receipt_info)
            # Give it a moment for the background task to start
            time.sleep(0.1)
            # Test passes if no exception is raised
            self.assertTrue(True, "Async payment processed email queued successfully.")
        except Exception as e:
            self.fail(f"Async payment processed email failed: {e}")

    def test_send_email_async(self):
        """Test generic async email method."""
        try:
            # This should return immediately without blocking
            self.handler.send_email_async(
                self.to_email, 
                "Test Async Email", 
                "This is a test of the async email functionality."
            )
            # Give it a moment for the background task to start
            time.sleep(0.1)
            # Test passes if no exception is raised
            self.assertTrue(True, "Generic async email queued successfully.")
        except Exception as e:
            self.fail(f"Generic async email failed: {e}")

    def test_thread_pool_functionality(self):
        """Test that the thread pool is properly initialized."""
        self.assertIsNotNone(self.handler._executor, "Thread pool executor should be initialized")
        self.assertEqual(self.handler._executor._max_workers, 3, "Thread pool should have 3 workers")

    @classmethod
    def tearDownClass(cls):
        """Clean up the handler and wait for pending emails to complete."""
        try:
            # Give async operations time to complete
            time.sleep(2)
            cls.handler.shutdown()
        except Exception as e:
            print(f"Warning: Error during teardown: {e}")

if __name__ == "__main__":
    unittest.main()
