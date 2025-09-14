"""
Unit tests for individual DBManager components.

Tests for FileOperations, QueueManager, SessionManager, and exception handling.
"""

import unittest
import tempfile
import shutil
import json
import os
import time
import threading
import sys
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

# Import components
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dbmgr.file_operations import FileOperations
from dbmgr.queue_manager import QueueManager, Priority
from dbmgr.session_manager import SessionManager
from dbmgr.exceptions import *


class TestFileOperations(unittest.TestCase):
    """Test FileOperations component."""
    
    def setUp(self):
        """Set up test environment."""
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir)
        os.makedirs(self.backup_dir)
        
        self.file_ops = FileOperations(self.data_dir, self.backup_dir)
        
        # Test data
        self.test_data = {
            "user1@example.com": {
                "password": "hashed_password",
                "school_name": "Test School"
            }
        }
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_atomic_write_read(self):
        """Test atomic write and read operations."""
        # Test writing
        self.file_ops.atomic_write_json('test.json', self.test_data)
        
        # Test reading
        read_data = self.file_ops.atomic_read_json('test.json')
        self.assertEqual(read_data, self.test_data)
    
    def test_backup_creation(self):
        """Test backup creation."""
        # Write initial data
        self.file_ops.atomic_write_json('test.json', self.test_data)
        
        # Create backup
        backup_path = self.file_ops.create_backup('test.json')
        self.assertTrue(os.path.exists(backup_path))
        
        # Verify backup content
        with open(backup_path, 'r') as f:
            backup_data = json.load(f)
        self.assertEqual(backup_data, self.test_data)
    
    def test_backup_restore(self):
        """Test backup restoration."""
        # Write initial data
        self.file_ops.atomic_write_json('test.json', self.test_data)
        
        # Create backup
        backup_path = self.file_ops.create_backup('test.json')
        
        # Modify original data
        modified_data = {"modified": True}
        self.file_ops.atomic_write_json('test.json', modified_data)
        
        # Restore from backup
        self.file_ops.restore_backup('test.json', backup_path)
        
        # Verify restoration
        restored_data = self.file_ops.atomic_read_json('test.json')
        self.assertEqual(restored_data, self.test_data)
    
    def test_file_integrity_validation(self):
        """Test file integrity validation."""
        # Write valid data
        self.file_ops.atomic_write_json('test.json', self.test_data)
        
        # Test validation passes
        is_valid = self.file_ops.validate_integrity('test.json')
        self.assertTrue(is_valid)
        
        # Create invalid JSON file
        invalid_file = os.path.join(self.data_dir, 'invalid.json')
        with open(invalid_file, 'w') as f:
            f.write('invalid json content {')
        
        # Test validation fails
        is_valid = self.file_ops.validate_integrity('invalid.json')
        self.assertFalse(is_valid)
    
    def test_concurrent_file_access(self):
        """Test concurrent file access."""
        def write_operation(data_id):
            data = {"id": data_id, "timestamp": time.time()}
            self.file_ops.atomic_write_json(f'concurrent_{data_id}.json', data)
            return data_id
        
        def read_operation(data_id):
            try:
                data = self.file_ops.atomic_read_json(f'concurrent_{data_id}.json')
                return data.get('id')
            except FileNotFoundError:
                return None
        
        # Perform concurrent operations
        with ThreadPoolExecutor(max_workers=10) as executor:
            # Submit write operations
            write_futures = [executor.submit(write_operation, i) for i in range(10)]
            
            # Wait for writes to complete
            write_results = [f.result() for f in write_futures]
            
            # Submit read operations
            read_futures = [executor.submit(read_operation, i) for i in range(10)]
            read_results = [f.result() for f in read_futures]
        
        # Verify all operations completed successfully
        self.assertEqual(len(write_results), 10)
        self.assertEqual(len(read_results), 10)
        self.assertEqual(set(write_results), set(read_results))


class TestQueueManager(unittest.TestCase):
    """Test QueueManager component."""
    
    def setUp(self):
        """Set up test environment."""
        self.queue_manager = QueueManager(max_workers=5, timeout=10)
    
    def tearDown(self):
        """Clean up test environment."""
        self.queue_manager.shutdown_gracefully()
    
    def test_read_operations(self):
        """Test read operation handling."""
        def read_op():
            time.sleep(0.1)
            return "read_result"
        
        # Submit multiple read operations
        futures = []
        for _ in range(10):
            future = self.queue_manager.submit_read_operation(read_op)
            futures.append(future)
        
        # Verify all operations complete
        results = [f.result(timeout=5) for f in futures]
        self.assertEqual(len(results), 10)
        self.assertTrue(all(r == "read_result" for r in results))
    
    def test_write_operations(self):
        """Test write operation handling."""
        def write_op(value):
            time.sleep(0.1)
            return f"write_{value}"
        
        # Submit multiple write operations
        futures = []
        for i in range(5):
            future = self.queue_manager.submit_write_operation(
                lambda v=i: write_op(v),
                Priority.NORMAL
            )
            futures.append(future)
        
        # Verify all operations complete
        results = [f.result(timeout=10) for f in futures]
        self.assertEqual(len(results), 5)
    
    def test_priority_handling(self):
        """Test priority-based operation handling."""
        results = []
        
        def high_priority_op():
            time.sleep(0.1)
            results.append("high")
            return "high"
        
        def normal_priority_op():
            time.sleep(0.1)
            results.append("normal")
            return "normal"
        
        # Submit operations with different priorities
        futures = []
        
        # Submit normal priority operations first
        for _ in range(3):
            future = self.queue_manager.submit_write_operation(
                normal_priority_op, Priority.NORMAL
            )
            futures.append(future)
        
        # Submit high priority operations
        for _ in range(2):
            future = self.queue_manager.submit_write_operation(
                high_priority_op, Priority.HIGH
            )
            futures.append(future)
        
        # Wait for all operations
        for f in futures:
            f.result(timeout=10)
        
        # Verify operations completed
        self.assertEqual(len(results), 5)
    
    def test_queue_status(self):
        """Test queue status reporting."""
        status = self.queue_manager.get_queue_status()
        
        self.assertIsInstance(status, dict)
        self.assertIn('read_executor', status)
        self.assertIn('write_executor', status)
        self.assertIn('queue_sizes', status)
        self.assertIn('statistics', status)
    
    def test_timeout_handling(self):
        """Test operation timeout handling."""
        def slow_operation():
            time.sleep(2)
            return "slow_result"
        
        # Submit operation with short timeout
        future = self.queue_manager.submit_write_operation(
            slow_operation, Priority.NORMAL, timeout=1
        )
        
        # Should complete even with timeout (timeout is for queuing, not execution)
        result = future.result(timeout=5)
        self.assertEqual(result, "slow_result")


class TestSessionManager(unittest.TestCase):
    """Test SessionManager component."""
    
    def setUp(self):
        """Set up test environment."""
        self.session_manager = SessionManager(
            session_timeout_minutes=1,  # Short timeout for testing
            cleanup_interval_minutes=0.1  # Frequent cleanup for testing
        )
    
    def tearDown(self):
        """Clean up test environment."""
        self.session_manager.shutdown()
    
    def test_session_creation(self):
        """Test session creation."""
        session_id = self.session_manager.create_db_session("user1@example.com", "read")
        
        self.assertIsInstance(session_id, str)
        self.assertTrue(len(session_id) > 0)
    
    def test_session_validation(self):
        """Test session validation."""
        # Create session
        session_id = self.session_manager.create_db_session("user1@example.com", "read")
        
        # Validate session
        is_valid = self.session_manager.validate_db_session(session_id)
        self.assertTrue(is_valid)
        
        # Test invalid session
        is_valid = self.session_manager.validate_db_session("invalid_session")
        self.assertFalse(is_valid)
    
    def test_session_expiration(self):
        """Test session expiration."""
        # Create session
        session_id = self.session_manager.create_db_session("user1@example.com", "read")
        
        # Get session object and manually expire it
        session = self.session_manager.get_session(session_id)
        self.assertIsNotNone(session)
        
        # Manually set last activity to past
        session.last_activity = datetime.now() - timedelta(minutes=2)
        
        # Validation should fail for expired session
        is_valid = self.session_manager.validate_db_session(session_id)
        self.assertFalse(is_valid)
    
    def test_session_cleanup(self):
        """Test session cleanup."""
        # Create multiple sessions
        session_ids = []
        for i in range(5):
            session_id = self.session_manager.create_db_session(f"user{i}@example.com", "test")
            session_ids.append(session_id)
        
        # Verify sessions exist
        active_sessions = self.session_manager.get_active_sessions()
        self.assertGreaterEqual(active_sessions['total_active_sessions'], 5)
        
        # Manually expire sessions
        for session_id in session_ids:
            session = self.session_manager.get_session(session_id)
            if session:
                session.last_activity = datetime.now() - timedelta(minutes=2)
        
        # Run cleanup
        cleanup_count = self.session_manager.cleanup_expired_sessions()
        self.assertGreaterEqual(cleanup_count, 5)
    
    def test_user_session_management(self):
        """Test user-specific session management."""
        user_id = "test_user@example.com"
        
        # Create multiple sessions for user
        session_ids = []
        for i in range(3):
            session_id = self.session_manager.create_db_session(user_id, f"operation_{i}")
            session_ids.append(session_id)
        
        # Get user sessions
        user_sessions = self.session_manager.get_user_sessions(user_id)
        self.assertEqual(len(user_sessions), 3)
        
        # Invalidate all user sessions
        invalidated_count = self.session_manager.invalidate_user_sessions(user_id)
        self.assertEqual(invalidated_count, 3)
        
        # Verify sessions are gone
        user_sessions = self.session_manager.get_user_sessions(user_id)
        self.assertEqual(len(user_sessions), 0)
    
    def test_concurrent_session_operations(self):
        """Test concurrent session operations."""
        def create_session(user_id):
            return self.session_manager.create_db_session(f"user_{user_id}@example.com", "test")
        
        def validate_session(session_id):
            return self.session_manager.validate_db_session(session_id)
        
        # Create sessions concurrently
        with ThreadPoolExecutor(max_workers=10) as executor:
            create_futures = [executor.submit(create_session, i) for i in range(20)]
            session_ids = [f.result() for f in create_futures]
        
        # Validate sessions concurrently
        with ThreadPoolExecutor(max_workers=10) as executor:
            validate_futures = [executor.submit(validate_session, sid) for sid in session_ids]
            validation_results = [f.result() for f in validate_futures]
        
        # All validations should succeed
        self.assertEqual(len(validation_results), 20)
        self.assertTrue(all(validation_results))


class TestExceptionHandling(unittest.TestCase):
    """Test custom exception handling."""
    
    def test_database_exception(self):
        """Test DatabaseException base class."""
        exception = DatabaseException("Test error", "TEST_CODE", {"detail": "test"})
        
        self.assertEqual(str(exception), "Test error")
        self.assertEqual(exception.error_code, "TEST_CODE")
        self.assertEqual(exception.details["detail"], "test")
        
        # Test to_dict method
        error_dict = exception.to_dict()
        self.assertIn("error", error_dict)
        self.assertIn("message", error_dict)
        self.assertIn("error_code", error_dict)
        self.assertIn("details", error_dict)
    
    def test_file_integrity_error(self):
        """Test FileIntegrityError."""
        exception = FileIntegrityError(
            "File corrupted",
            file_path="/test/file.json",
            expected_checksum="abc123",
            actual_checksum="def456"
        )
        
        self.assertEqual(exception.error_code, "FILE_INTEGRITY_ERROR")
        self.assertEqual(exception.details["file_path"], "/test/file.json")
        self.assertEqual(exception.details["expected_checksum"], "abc123")
        self.assertEqual(exception.details["actual_checksum"], "def456")
    
    def test_concurrency_error(self):
        """Test ConcurrencyError."""
        exception = ConcurrencyError(
            "Resource conflict",
            resource="database",
            operation="write"
        )
        
        self.assertEqual(exception.error_code, "CONCURRENCY_ERROR")
        self.assertEqual(exception.details["resource"], "database")
        self.assertEqual(exception.details["operation"], "write")
    
    def test_queue_timeout_error(self):
        """Test QueueTimeoutError."""
        exception = QueueTimeoutError(
            "Queue timeout",
            timeout_seconds=30,
            queue_size=100
        )
        
        self.assertEqual(exception.error_code, "QUEUE_TIMEOUT_ERROR")
        self.assertEqual(exception.details["timeout_seconds"], 30)
        self.assertEqual(exception.details["queue_size"], 100)
    
    def test_session_error(self):
        """Test SessionError."""
        exception = SessionError(
            "Session invalid",
            session_id="sess_123",
            user_id="user@example.com"
        )
        
        self.assertEqual(exception.error_code, "SESSION_ERROR")
        self.assertEqual(exception.details["session_id"], "sess_123")
        self.assertEqual(exception.details["user_id"], "user@example.com")
    
    def test_validation_error(self):
        """Test ValidationError."""
        exception = ValidationError(
            "Invalid field",
            field="password",
            value="weak"
        )
        
        self.assertEqual(exception.error_code, "VALIDATION_ERROR")
        self.assertEqual(exception.details["field"], "password")
        self.assertEqual(exception.details["value"], "weak")


if __name__ == '__main__':
    unittest.main(verbosity=2)
