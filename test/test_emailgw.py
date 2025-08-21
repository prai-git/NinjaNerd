
import os
import sys
import unittest
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

if __name__ == "__main__":
    unittest.main()
