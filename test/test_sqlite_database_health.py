"""
Simplified database health monitor tests.
"""

import unittest
import tempfile
import shutil
import os
import sqlite3

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dbmgr.database_health import DatabaseHealthMonitor, HealthStatus


class TestDatabaseHealthSimple(unittest.TestCase):
    """Test basic database health functionality."""
    
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
        
        self.health_monitor = DatabaseHealthMonitor(self.db_path, self.backup_dir)
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_database_integrity_check(self):
        """Test basic integrity check."""
        result = self.health_monitor.check_database_integrity()
        self.assertIsNotNone(result)
        self.assertIn(result.status, [HealthStatus.HEALTHY, HealthStatus.WARNING, HealthStatus.CORRUPTED])
    
    def test_create_backup(self):
        """Test backup creation."""
        backup_path = self.health_monitor.create_safety_backup("test_operation")
        self.assertIsNotNone(backup_path)
        self.assertTrue(os.path.exists(backup_path))
    
    def test_health_summary(self):
        """Test health summary generation."""
        summary = self.health_monitor.get_health_summary()
        self.assertIsInstance(summary, dict)
        self.assertIn('current_status', summary)
        self.assertIn('database_info', summary)
    
    def test_cleanup_backups(self):
        """Test backup cleanup."""
        # Create a backup first
        self.health_monitor.create_safety_backup("test")
        
        # Clean up with retention
        cleaned = self.health_monitor.cleanup_old_backups(retention_days=0)
        self.assertIsInstance(cleaned, int)


if __name__ == '__main__':
    unittest.main()
