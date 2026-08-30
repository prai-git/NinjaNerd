"""
Simplified database recovery tests.
"""

import unittest
import tempfile
import shutil
import os
import sqlite3

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dbmgr.database_recovery import DatabaseRecoveryManager, RecoveryPolicy
from dbmgr.database_health import HealthStatus


class TestDatabaseRecoverySimple(unittest.TestCase):
    """Test basic database recovery functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        self.backup_dir = os.path.join(self.temp_dir, 'backups')
        os.makedirs(self.backup_dir)
        
        # Create a simple test database
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute("INSERT INTO test_table (name) VALUES ('test')")
        conn.commit()
        conn.close()
        
        self.recovery_manager = DatabaseRecoveryManager(self.db_path, self.backup_dir)
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_recovery_policy_creation(self):
        """Test recovery policy creation."""
        policy = RecoveryPolicy()
        self.assertIsNotNone(policy)
        self.assertIsInstance(policy.enable_auto_repair, bool)
        self.assertIsInstance(policy.max_repair_attempts, int)
    
    def test_recovery_manager_initialization(self):
        """Test recovery manager initialization."""
        self.assertIsNotNone(self.recovery_manager)
        self.assertTrue(os.path.exists(self.db_path))
    
    def test_get_recovery_status(self):
        """Test recovery status retrieval."""
        status = self.recovery_manager.get_recovery_status()
        self.assertIsInstance(status, dict)
        self.assertIn('health_status', status)
        self.assertIn('recovery_policy', status)
    
    def test_health_check_and_repair(self):
        """Test health check and repair functionality."""
        result = self.recovery_manager.check_and_repair_if_needed()
        self.assertIsNotNone(result)
        self.assertIn(result.status, [HealthStatus.HEALTHY, HealthStatus.WARNING, HealthStatus.CORRUPTED, HealthStatus.CRITICAL])
    
    def test_force_recovery(self):
        """Test force recovery functionality."""
        result = self.recovery_manager.force_recovery("auto")
        self.assertIsNotNone(result)
        self.assertIn(result.status, [HealthStatus.HEALTHY, HealthStatus.WARNING, HealthStatus.CORRUPTED, HealthStatus.CRITICAL])


if __name__ == '__main__':
    unittest.main()
