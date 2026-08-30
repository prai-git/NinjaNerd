#!/usr/bin/env python3
"""
Isolated SQLite App Integration Test

Tests the SQLite integration without affecting the main database or code.
Uses completely isolated temporary databases and directories.
"""

import unittest
import tempfile
import os
import uuid
from flask import Flask
from werkzeug.security import check_password_hash
from dbmgr.sqlite_app_integration import SQLiteAppIntegration


class TestSQLiteAppIntegrationIsolated(unittest.TestCase):
    
    def test_isolated_sqlite_integration(self):
        """Test SQLite integration in complete isolation"""
        
        # Use completely isolated temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create Flask app for testing
            app = Flask(__name__)
            
            # Initialize integration with isolated paths
            integration = SQLiteAppIntegration(
                app, 
                data_dir=temp_dir, 
                backup_dir=temp_dir,
                db_name=f'test_{uuid.uuid4().hex[:8]}.db'
            )
            
            # Test user creation with proper parameters
            unique_user = f'test_user_{uuid.uuid4().hex[:8]}'
            plain_password = 'test_password_123'
            result = integration.create_user(unique_user, plain_password, 'Test School')
            self.assertTrue(result, "User creation should succeed")
            
            # Test user retrieval
            retrieved_user = integration.get_user(unique_user)
            self.assertIsNotNone(retrieved_user, "User retrieval should return data")
            
            # Verify password is properly hashed (not plain text)
            stored_password = retrieved_user.get('password')
            self.assertIsNotNone(stored_password, "Password should be stored")
            self.assertNotEqual(stored_password, plain_password, "Password should be hashed, not plain text")
            self.assertTrue(stored_password.startswith('pbkdf2:'), "Password should use pbkdf2 hashing")
            
            # Verify password can be checked correctly
            self.assertTrue(check_password_hash(stored_password, plain_password), "Password hash should verify correctly")
            self.assertFalse(check_password_hash(stored_password, 'wrong_password'), "Wrong password should not verify")
            
            # Verify other user data
            self.assertEqual(retrieved_user.get('school_name'), 'Test School')
            
            # Test user history update
            history_entry = {
                'question': 'Test question',
                'answer': 'Test answer',
                'correct': True,
                'topic': 'math',
                'timestamp': '2025-09-11T10:00:00'
            }
            
            history_result = integration.add_user_history(unique_user, history_entry)
            self.assertTrue(history_result, "History update should succeed")
            
            # Verify history was added
            updated_user = integration.get_user(unique_user)
            self.assertIsNotNone(updated_user)
            user_history = updated_user.get('history', [])
            self.assertEqual(len(user_history), 1)
            self.assertEqual(user_history[0]['question'], 'Test question')
            
            print(f"✅ Isolated SQLite integration test passed for user: {unique_user}")
            print(f"   - User creation: {result}")
            print(f"   - User retrieval: {retrieved_user is not None}")
            print(f"   - Password hashing: ✅ (pbkdf2 format)")
            print(f"   - Password verification: ✅")
            print(f"   - History update: {history_result}")
            print("   - Database isolation: ✅ (temporary directory used)")


if __name__ == '__main__':
    unittest.main()
