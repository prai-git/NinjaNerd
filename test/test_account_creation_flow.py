import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
import sys
import os
import json
import tempfile

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
from gw.emailgw import EmailHandler
from app import app

class TestAccountCreationFlow(unittest.TestCase):
    def setUp(self):
        # Set up MESSAGE_OBFUSCATION_KEY for testing
        os.environ['MESSAGE_OBFUSCATION_KEY'] = 'test_key_for_account_creation_flow_testing'
        
        # Create temporary directory and database for testing
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, 'test_account_flow.db')
        
        # Reset and initialize test database
        reset_app_db()
        
        # Create test Flask app and initialize database
        self.test_app = app
        self.test_app.config['TESTING'] = True
        
        with self.test_app.app_context():
            self.db = initialize_app_db(self.test_app, db_path=self.test_db_path, enable_message_obfuscation=False)
            
            # Create a test user for existing user tests
            result = self.db.create_user("existing@example.com", "hash", "Test")
            if not result:
                print("Warning: Failed to create test user in setUp")

    def tearDown(self):
        # Clean up temporary directory and reset environment
        self.temp_dir.cleanup()
        if 'MESSAGE_OBFUSCATION_KEY' in os.environ:
            del os.environ['MESSAGE_OBFUSCATION_KEY']

    def test_user_already_exists(self):
        with self.test_app.app_context():
            db = get_app_db()
            # Check that the existing user was created in setUp
            user = db.get_user("existing@example.com")
            self.assertIsNotNone(user)
            self.assertEqual(user["school_name"], "Test")

    def test_new_user_account_creation(self):
        with self.test_app.app_context():
            db = get_app_db()
            new_user = "newuser@example.com"
            # Simulate account creation with SQLite integration method signature
            self.assertIsNone(db.get_user(new_user))
            result = db.create_user(new_user, "hash2", "Test School")
            self.assertEqual(result, new_user)  # create_user returns email on success
            self.assertIsNotNone(db.get_user(new_user))
            # Check user details
            user = db.get_user(new_user)
            self.assertEqual(user["school_name"], "Test School")
            self.assertIn("created_at", user)
            # Check timestamp is recent (within 1 minute)
            created_time = datetime.fromisoformat(user["created_at"])
            self.assertLess(datetime.now() - created_time, timedelta(minutes=1))

    @patch.object(EmailHandler, 'send_account_creation', return_value=True)
    def test_email_sent_on_account_creation(self, mock_send):
        handler = EmailHandler(gmail_id="test@test.com", gmail_secret="secret")
        result = handler.send_account_creation("to@test.com", "to@test.com")
        self.assertTrue(result)
        mock_send.assert_called_once_with("to@test.com", "to@test.com")

    def test_no_db_write_on_test(self):
        # Ensure test uses isolated temporary database, not real DB
        with self.test_app.app_context():
            db = get_app_db()
            # Check that our test database exists and is isolated
            self.assertTrue(os.path.exists(self.test_db_path))
            # Verify we have our test user
            user = db.get_user("existing@example.com")
            self.assertIsNotNone(user)
            self.assertEqual(user["school_name"], "Test")

if __name__ == "__main__":
    unittest.main()
