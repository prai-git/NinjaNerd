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
            result = integration.create_user(unique_user, 'test_hash', 'Test School')
            self.assertTrue(result, "User creation should succeed")
            
            # Test user retrieval
            retrieved_user = integration.get_user(unique_user)
            self.assertIsNotNone(retrieved_user, "User retrieval should return data")
            self.assertEqual(retrieved_user.get('password'), 'test_hash')
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
            print(f"   - History update: {history_result}")
            print("   - Statistics update: Skipped (method not available in integration layer)")


if __name__ == '__main__':
    unittest.main()
