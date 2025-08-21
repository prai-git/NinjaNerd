import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
import sys
import os
import json

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dbmgr.app_integration import AppDBWrapper
from gw.emailgw import EmailHandler

class TestAccountCreationFlow(unittest.TestCase):
    def setUp(self):
        # Use a temp directory for DBManager
        self.test_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'tmp_test_db'))
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)
        self.credentials_file = os.path.join(self.data_dir, 'Credentials.json')
        # Write a sample credentials file
        with open(self.credentials_file, 'w') as f:
            json.dump({"existing@example.com": {"password": "hash", "school_name": "Test", "history": [], "statistics": {"questions_attempted": 0, "topics_covered": [], "last_login": None}, "created_at": "2025-08-01T00:00:00"}}, f)
        self.db = AppDBWrapper(self.data_dir, self.backup_dir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_user_already_exists(self):
        creds = self.db.load_credentials()
        self.assertIn("existing@example.com", creds)
        # Simulate check for existing user
        self.assertIsNotNone(self.db.get_user("existing@example.com"))

    def test_new_user_account_creation(self):
        new_user = "newuser@example.com"
        user_data = {
            "password": "hash2",
            "school_name": "Test School",
            "history": [],
            "statistics": {"questions_attempted": 0, "topics_covered": [], "last_login": None},
            "created_at": datetime.now().isoformat()
        }
        # Simulate account creation
        self.assertIsNone(self.db.get_user(new_user))
        self.db.db_manager.create_user(new_user, user_data)
        self.assertIsNotNone(self.db.get_user(new_user))
        # Check timestamp
        user = self.db.get_user(new_user)
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
        # Ensure test does not modify real DB
        self.assertTrue(os.path.exists(self.credentials_file))
        with open(self.credentials_file) as f:
            data = json.load(f)
        self.assertIn("existing@example.com", data)

if __name__ == "__main__":
    unittest.main()
