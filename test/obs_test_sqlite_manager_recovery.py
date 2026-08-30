"""
Simple SQLite manager recovery integration tests.
"""

import unittest
import tempfile
import shutil
import os

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dbmgr.sqlite_manager import SQLiteManager


class TestSQLiteManagerRecovery(unittest.TestCase):
    """Test SQLite manager core functionality with recovery."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test_recovery.db')
        self.db_manager = SQLiteManager(self.db_path)
    
    def tearDown(self):
        """Clean up test environment."""
        if hasattr(self, 'db_manager'):
            self.db_manager.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_user_operations_with_recovery(self):
        """Test basic user operations work with recovery enabled."""
        # Test user creation
        result = self.db_manager.create_user('test@example.com', 'password123')
        self.assertTrue(result)
        
        # Test user retrieval
        user = self.db_manager.get_user('test@example.com')
        self.assertIsNotNone(user)
        self.assertEqual(user['email'], 'test@example.com')
    
    def test_recovery_manager_exists(self):
        """Test that recovery manager is properly integrated."""
        self.assertTrue(hasattr(self.db_manager, 'recovery_manager'))
        self.assertIsNotNone(self.db_manager.recovery_manager)


if __name__ == '__main__':
    unittest.main()
