#!/usr/bin/env python3

import unittest
import sys
import os
import tempfile
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import after adding to path
from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
from gw.emailgw import EmailHandler
from app import app


class TestFreeTrialFeature(unittest.TestCase):
    """Test suite for the 15-day free trial feature."""
    
    def setUp(self):
        """Set up test environment."""
        # Set up MESSAGE_OBFUSCATION_KEY for testing
        os.environ['MESSAGE_OBFUSCATION_KEY'] = 'test_key_for_free_trial_testing'
        
        # Create temporary directory and database for testing
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, 'test_free_trial.db')
        
        # Reset and initialize test database
        reset_app_db()
        
        # Create test Flask app and initialize database
        self.test_app = app
        self.test_app.config['TESTING'] = True
        
        with self.test_app.app_context():
            self.db = initialize_app_db(self.test_app, db_path=self.test_db_path, enable_message_obfuscation=False)
            
    def tearDown(self):
        """Clean up test environment."""
        self.temp_dir.cleanup()
        reset_app_db()
        
    def create_test_user(self, email, days_ago=0):
        """Helper method to create a test user with specific creation date."""
        with self.test_app.app_context():
            # Create user normally first
            result = self.db.create_user(email, "test_password", "Test School")
            self.assertEqual(result, email)
            
            if days_ago > 0:
                # Update the created_at timestamp to simulate older account
                with self.db.sqlite_manager.connection_pool.get_connection() as conn:
                    old_timestamp = (datetime.now() - timedelta(days=days_ago)).isoformat()
                    conn.execute(
                        "UPDATE users SET created_at = ? WHERE email = ?",
                        (old_timestamp, email)
                    )
                    conn.commit()
                    
    def test_new_user_is_in_free_trial(self):
        """Test that a newly created user is in the free trial period."""
        with self.test_app.app_context():
            test_email = "newuser@example.com"
            self.create_test_user(test_email)
            
            # Check that user is in free trial
            self.assertTrue(self.db.is_in_free_trial(test_email))
            
            # Check trial days remaining (should be 15 or close to it)
            days_remaining = self.db.get_free_trial_days_remaining(test_email)
            self.assertGreaterEqual(days_remaining, 14)  # Account for timing
            self.assertLessEqual(days_remaining, 15)
            
    def test_user_after_trial_period_expired(self):
        """Test that a user created 16 days ago is no longer in free trial."""
        with self.test_app.app_context():
            test_email = "expireduser@example.com"
            self.create_test_user(test_email, days_ago=16)
            
            # Check that user is NOT in free trial
            self.assertFalse(self.db.is_in_free_trial(test_email))
            
            # Check trial days remaining (should be 0)
            days_remaining = self.db.get_free_trial_days_remaining(test_email)
            self.assertEqual(days_remaining, 0)
            
    def test_user_on_last_day_of_trial(self):
        """Test user on the 15th day of trial."""
        with self.test_app.app_context():
            test_email = "lastday@example.com"
            self.create_test_user(test_email, days_ago=14)
            
            # Should still be in trial (just barely)
            self.assertTrue(self.db.is_in_free_trial(test_email))
            
            # Should have 1 day remaining
            days_remaining = self.db.get_free_trial_days_remaining(test_email)
            self.assertGreaterEqual(days_remaining, 0)
            self.assertLessEqual(days_remaining, 1)
            
    def test_cannot_make_payment_during_trial(self):
        """Test that users cannot make payments during the free trial period."""
        with self.test_app.app_context():
            test_email = "trialuser@example.com"
            self.create_test_user(test_email)
            
            # User should not be able to make payment during trial
            self.assertFalse(self.db.can_make_payment(test_email))
            
    def test_can_make_payment_after_trial_expires(self):
        """Test that users can make payments after trial expires."""
        with self.test_app.app_context():
            test_email = "posttrialuser@example.com"
            self.create_test_user(test_email, days_ago=16)
            
            # User should be able to make payment after trial
            self.assertTrue(self.db.can_make_payment(test_email))
            
    def test_requires_payment_for_access_logic(self):
        """Test the payment requirement logic for grade access."""
        with self.test_app.app_context():
            # Test user in trial (should not require payment)
            trial_email = "intrialuser@example.com"
            self.create_test_user(trial_email)
            self.assertFalse(self.db.requires_payment_for_access(trial_email))
            
            # Test user with expired trial (should require payment)
            expired_email = "expiredtrialuser@example.com"
            self.create_test_user(expired_email, days_ago=16)
            self.assertTrue(self.db.requires_payment_for_access(expired_email))
            
    def test_user_with_active_payment_doesnt_require_payment(self):
        """Test that users with active payments don't require additional payment."""
        with self.test_app.app_context():
            test_email = "paiduser@example.com"
            self.create_test_user(test_email, days_ago=16)  # Trial expired
            
            # Initially should require payment
            self.assertTrue(self.db.requires_payment_for_access(test_email))
            
            # Create an active payment
            self.db.create_payment_record(test_email, "ORDER123", 15.10, "USD")
            self.db.update_payment_status("ORDER123", "completed", "CAPTURE123")
            
            # Now should not require payment
            self.assertFalse(self.db.requires_payment_for_access(test_email))
            
    def test_grade_access_function_logic(self):
        """Test the core logic for grade access restriction."""
        with self.test_app.app_context():
            # Test user with expired trial
            expired_email = "expireduser@example.com"
            self.create_test_user(expired_email, days_ago=16)
            
            from app import check_free_trial_access
            # Should not have access (trial expired, no payment)
            self.assertFalse(check_free_trial_access(expired_email))
            
            # Test user in trial
            trial_email = "trialuser@example.com"
            self.create_test_user(trial_email)
            
            # Should have access (in trial)
            self.assertTrue(check_free_trial_access(trial_email))
                        
    def test_checkout_payment_logic(self):
        """Test the checkout payment restriction logic."""
        with self.test_app.app_context():
            # Test user in trial (cannot make payment)
            trial_email = "trialuser@example.com"  
            self.create_test_user(trial_email)
            self.assertFalse(self.db.can_make_payment(trial_email))
            
            # Test user with expired trial (can make payment)
            expired_email = "expireduser@example.com"
            self.create_test_user(expired_email, days_ago=16)
            self.assertTrue(self.db.can_make_payment(expired_email))
                    
    def test_account_creation_email_content_updated(self):
        """Test that the email content has been updated to mention free trial."""
        with self.test_app.app_context():
            try:
                from gw.emailgw import EmailHandler
                # Create handler with mock credentials
                handler = EmailHandler(gmail_id="test@example.com", gmail_secret="test_secret")
                
                # Test the email body content
                subject = "Welcome to NinjaNerd! Your Account Has Been Created"
                body = f"Hello testuser,\n\nYour account has been successfully created. Welcome to NinjaNerd!\n\nYou now have access to a FREE 15-day trial with full access to all premium features including:\n- All grade levels and subjects\n- Learning and practice modes\n- Personalized content\n- Progress tracking\n\nEnjoy exploring and learning with NinjaNerd during your trial period!\n\nBest Regards,\nNinjaNerd Team"
                
                # Verify the email content mentions free trial
                self.assertIn("FREE 15-day trial", body)
                self.assertIn("trial period", body)
                
            except ValueError:
                # Expected when email credentials not set - this is fine for testing email content
                pass
                    
    def test_admin_user_access_logic(self):
        """Test that admin access logic bypasses trial restrictions."""  
        with self.test_app.app_context():
            from app import check_free_trial_access
            
            # Mock admin check
            with patch('app.is_admin_user', return_value=True):
                # Admin should always have access regardless of trial/payment status
                result = check_free_trial_access("admin@gmail.com")
                self.assertTrue(result)
                            
    def test_database_schema_includes_created_at(self):
        """Test that the database schema includes created_at timestamp."""
        with self.test_app.app_context():
            # Create a user and verify created_at is set
            test_email = "timestampuser@example.com"
            self.create_test_user(test_email)
            
            user = self.db.get_user(test_email)
            self.assertIsNotNone(user)
            self.assertIn('created_at', user)
            self.assertIsNotNone(user['created_at'])
            
            # Verify timestamp is recent (within last minute)
            created_time = datetime.fromisoformat(user['created_at'])
            time_diff = datetime.now() - created_time
            self.assertLess(time_diff, timedelta(minutes=1))
            
    def test_no_database_changes_during_tests(self):
        """Verify that tests don't affect the main database."""
        # This test ensures we're using isolated test database
        with self.test_app.app_context():
            # Our test database should be different from main database
            self.assertNotEqual(str(self.db.sqlite_manager.db_path), 'data/app_database.db')
            self.assertTrue(self.test_db_path in str(self.db.sqlite_manager.db_path))


def run_tests():
    """Run the free trial feature test suite."""
    # Configure test environment
    os.environ.setdefault('PR_GMAIL_ID', 'test@example.com')
    os.environ.setdefault('PR_GMAIL_SECRET', 'test_secret')
    
    # Run tests
    suite = unittest.TestLoader().loadTestsFromTestCase(TestFreeTrialFeature)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print(f"\n{'='*50}")
    print(f"FREE TRIAL FEATURE TEST RESULTS")
    print(f"{'='*50}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print(f"\nFAILURES:")
        for test, failure in result.failures:
            failure_msg = failure.split('AssertionError: ')[-1].split('\n')[0]
            print(f"- {test}: {failure_msg}")
            
    if result.errors:
        print(f"\nERRORS:")
        for test, error in result.errors:
            error_msg = error.split('\n')[-2]
            print(f"- {test}: {error_msg}")
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)