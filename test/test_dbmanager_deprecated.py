"""
Comprehensive unit tests for DBManager functionality.

These tests validate all DBManager operations while ensuring
no modifications are made to the actual database files.
"""

import unittest
import tempfile
import shutil
import json
import os
import threading
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import DBManager components
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dbmgr import DBManager
from dbmgr.exceptions import (
    DatabaseException,
    FileIntegrityError,
    ConcurrencyError,
    QueueTimeoutError,
    SessionError,
    ValidationError
)
from dbmgr.queue_manager import Priority


class TestDBManager(unittest.TestCase):
    """
    Comprehensive tests for DBManager functionality.
    
    ALL TESTS ARE READ-ONLY - NO DATABASE MODIFICATIONS TO ACTUAL FILES
    """
    
    def setUp(self):
        """Create temporary test environment."""
        # Create temporary directories
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir)
        os.makedirs(self.backup_dir)
        
        # Create test data files
        self.credentials_file = os.path.join(self.data_dir, 'Credentials.json')
        self.collaboration_file = os.path.join(self.data_dir, 'Collaboration.json')
        
        # Sample test data
        self.test_credentials = {
            "test_user@example.com": {
                "password": "pbkdf2:sha256:600000$test$hashedpassword",
                "school_name": "Test School",
                "history": [
                    {
                        "question": "Test question",
                        "user_answer": "Test answer",
                        "correct": True,
                        "topic": "test",
                        "subtopic": "test_sub",
                        "grade": 6,
                        "timestamp": "2025-08-10T10:00:00.000000"
                    }
                ],
                "questions_attempted": 1,
                "topics_covered": ["test"],
                "last_login": "2025-08-10T09:00:00.000000"
            }
        }
        
        self.test_collaboration = {
            "invites": {
                "test-invite-1": {
                    "from_user": "test_user@example.com",
                    "to_user": "test_user2@example.com",
                    "timestamp": "2025-08-10T10:00:00.000000",
                    "status": "pending"
                }
            },
            "chat_sessions": {
                "test-session-1": {
                    "user1": "test_user@example.com",
                    "user2": "test_user2@example.com",
                    "messages": [],
                    "active": True,
                    "created_at": "2025-08-10T10:00:00.000000"
                }
            },
            "message_counter": 0
        }
        
        # Write test data to files
        with open(self.credentials_file, 'w') as f:
            json.dump(self.test_credentials, f, indent=2)
        
        with open(self.collaboration_file, 'w') as f:
            json.dump(self.test_collaboration, f, indent=2)
        
        # Initialize DBManager with test directories
        self.db_manager = DBManager(
            data_dir=self.data_dir,
            backup_dir=self.backup_dir,
            max_workers=5,
            operation_timeout=10
        )
    
    def tearDown(self):
        """Clean up test environment."""
        # Shutdown DBManager
        self.db_manager.shutdown()
        
        # Remove temporary directory
        shutil.rmtree(self.test_dir, ignore_errors=True)
        
        # Verify no modifications to actual database files
        actual_data_dir = Path(__file__).parent.parent / 'data'
        if actual_data_dir.exists():
            # Ensure actual files are unchanged
            for file_name in ['Credentials.json', 'Collaboration.json']:
                file_path = actual_data_dir / file_name
                if file_path.exists():
                    # Files should not have been modified during tests
                    self.assertGreater(
                        time.time() - file_path.stat().st_mtime,
                        10,  # Should be older than 10 seconds
                        f"Actual database file {file_name} appears to have been modified during tests"
                    )
    
    def test_initialization(self):
        """Test DBManager initialization."""
        self.assertIsNotNone(self.db_manager)
        self.assertIsNotNone(self.db_manager.file_ops)
        self.assertIsNotNone(self.db_manager.queue_manager)
        self.assertIsNotNone(self.db_manager.session_manager)
        
        # Test configuration
        self.assertEqual(self.db_manager.config['max_workers'], 5)
        self.assertEqual(self.db_manager.config['operation_timeout'], 10)
    
    def test_get_user(self):
        """Test user retrieval."""
        # Test existing user
        user = self.db_manager.get_user("test_user@example.com")
        self.assertIsNotNone(user)
        self.assertEqual(user['school_name'], "Test School")
        self.assertEqual(len(user['history']), 1)
        
        # Test non-existing user
        user = self.db_manager.get_user("nonexistent@example.com")
        self.assertIsNone(user)
    
    def test_get_all_users(self):
        """Test retrieving all users."""
        users = self.db_manager.get_all_users()
        self.assertIsInstance(users, dict)
        self.assertIn("test_user@example.com", users)
        self.assertEqual(len(users), 1)
    
    def test_user_authentication(self):
        """Test user authentication."""
        # Mock password checking for testing
        with patch('dbmgr.db_manager.check_password_hash') as mock_check:
            mock_check.return_value = True
            
            result = self.db_manager.authenticate_user("test_user@example.com", "test_password")
            self.assertTrue(result)
            mock_check.assert_called_once()
        
        # Test non-existent user
        result = self.db_manager.authenticate_user("nonexistent@example.com", "password")
        self.assertFalse(result)
    
    def test_create_user(self):
        """Test user creation."""
        new_user_data = {
            "password": "hashed_password",
            "school_name": "New School",
            "history": [],
            "questions_attempted": 0,
            "topics_covered": [],
            "last_login": None
        }
        
        # Test creating new user
        result = self.db_manager.create_user("new_user@example.com", new_user_data)
        self.assertTrue(result)
        
        # Verify user was created
        user = self.db_manager.get_user("new_user@example.com")
        self.assertIsNotNone(user)
        self.assertEqual(user['school_name'], "New School")
        
        # Test creating duplicate user (should fail)
        with self.assertRaises(ConcurrencyError):
            self.db_manager.create_user("new_user@example.com", new_user_data)
    
    def test_update_user(self):
        """Test user update."""
        updated_data = {
            "password": "new_hashed_password",
            "school_name": "Updated School",
            "history": [],
            "questions_attempted": 5,
            "topics_covered": ["math", "science"],
            "last_login": datetime.now().isoformat()
        }
        
        # Test updating existing user
        result = self.db_manager.update_user("test_user@example.com", updated_data)
        self.assertTrue(result)
        
        # Verify update
        user = self.db_manager.get_user("test_user@example.com")
        self.assertEqual(user['school_name'], "Updated School")
        self.assertEqual(user['questions_attempted'], 5)
        
        # Test updating non-existent user
        with self.assertRaises(DatabaseException):
            self.db_manager.update_user("nonexistent@example.com", updated_data)
    
    def test_delete_user(self):
        """Test user deletion."""
        # Test deleting existing user
        result = self.db_manager.delete_user("test_user@example.com")
        self.assertTrue(result)
        
        # Verify deletion
        user = self.db_manager.get_user("test_user@example.com")
        self.assertIsNone(user)
        
        # Test deleting non-existent user
        result = self.db_manager.delete_user("nonexistent@example.com")
        self.assertFalse(result)
    
    def test_update_user_history(self):
        """Test updating user history."""
        history_entry = {
            "question": "New test question",
            "user_answer": "New test answer",
            "correct": False,
            "topic": "english",
            "subtopic": "reading",
            "grade": 7
        }
        
        # Test adding history entry
        result = self.db_manager.update_user_history("test_user@example.com", history_entry)
        self.assertTrue(result)
        
        # Verify history was updated
        user = self.db_manager.get_user("test_user@example.com")
        self.assertEqual(len(user['history']), 2)
        self.assertEqual(user['history'][-1]['question'], "New test question")
        self.assertIn('timestamp', user['history'][-1])
        
        # Test updating history for non-existent user
        with self.assertRaises(DatabaseException):
            self.db_manager.update_user_history("nonexistent@example.com", history_entry)
    
    def test_collaboration_operations(self):
        """Test collaboration data operations."""
        # Test getting collaboration data
        collab_data = self.db_manager.get_collaboration_data()
        self.assertIsInstance(collab_data, dict)
        self.assertIn('invites', collab_data)
        self.assertIn('chat_sessions', collab_data)
        self.assertIn('message_counter', collab_data)
        
        # Test saving collaboration data
        new_collab_data = {
            "invites": {},
            "chat_sessions": {},
            "message_counter": 1
        }
        result = self.db_manager.save_collaboration_data(new_collab_data)
        self.assertTrue(result)
        
        # Verify save
        collab_data = self.db_manager.get_collaboration_data()
        self.assertEqual(collab_data['message_counter'], 1)
    
    def test_create_invite(self):
        """Test creating collaboration invites."""
        invite_data = {
            "message": "Let's collaborate!",
            "subject": "Math study"
        }
        
        invite_id = self.db_manager.create_invite(
            "user1@example.com",
            "user2@example.com",
            invite_data
        )
        
        self.assertIsInstance(invite_id, str)
        self.assertTrue(len(invite_id) > 0)
        
        # Verify invite was created
        collab_data = self.db_manager.get_collaboration_data()
        self.assertIn(invite_id, collab_data['invites'])
        
        invite = collab_data['invites'][invite_id]
        self.assertEqual(invite['from_user'], "user1@example.com")
        self.assertEqual(invite['to_user'], "user2@example.com")
        self.assertEqual(invite['status'], 'pending')
    
    def test_get_user_invites(self):
        """Test getting user invites."""
        invites = self.db_manager.get_user_invites("test_user@example.com")
        self.assertIsInstance(invites, dict)
        self.assertEqual(len(invites), 1)
        
        # Test user with no invites
        invites = self.db_manager.get_user_invites("nonexistent@example.com")
        self.assertIsInstance(invites, dict)
        self.assertEqual(len(invites), 0)
    
    def test_update_invite_status(self):
        """Test updating invite status."""
        result = self.db_manager.update_invite_status("test-invite-1", "accepted")
        self.assertTrue(result)
        
        # Verify update
        collab_data = self.db_manager.get_collaboration_data()
        self.assertEqual(collab_data['invites']['test-invite-1']['status'], 'accepted')
        
        # Test updating non-existent invite
        result = self.db_manager.update_invite_status("nonexistent-invite", "rejected")
        self.assertFalse(result)
    
    def test_session_management(self):
        """Test session management operations."""
        # Test creating session
        session_id = self.db_manager.create_session("test_user@example.com", "read")
        self.assertIsInstance(session_id, str)
        self.assertTrue(len(session_id) > 0)
        
        # Test validating session
        is_valid = self.db_manager.validate_session(session_id)
        self.assertTrue(is_valid)
        
        # Test validating invalid session
        is_valid = self.db_manager.validate_session("invalid-session-id")
        self.assertFalse(is_valid)
        
        # Test session info
        session_info = self.db_manager.get_session_info()
        self.assertIsInstance(session_info, dict)
        self.assertIn('total_active_sessions', session_info)
        self.assertGreaterEqual(session_info['total_active_sessions'], 1)
    
    def test_concurrent_read_operations(self):
        """Test 100+ simultaneous reads."""
        def read_user():
            return self.db_manager.get_user("test_user@example.com")
        
        # Execute 100 concurrent read operations
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(read_user) for _ in range(100)]
            
            results = []
            for future in as_completed(futures, timeout=30):
                result = future.result()
                results.append(result)
        
        # Verify all reads completed successfully
        self.assertEqual(len(results), 100)
        
        # Verify no data corruption
        for result in results:
            self.assertIsNotNone(result)
            self.assertEqual(result['school_name'], "Test School")
    
    def test_queue_management(self):
        """Test queue management functionality."""
        # Test queue status
        status = self.db_manager.queue_manager.get_queue_status()
        self.assertIsInstance(status, dict)
        self.assertIn('read_executor', status)
        self.assertIn('write_executor', status)
        self.assertIn('queue_sizes', status)
        self.assertIn('statistics', status)
        
        # Test queue prioritization
        high_priority_ops = []
        normal_priority_ops = []
        
        def high_priority_op():
            time.sleep(0.1)
            return "high"
        
        def normal_priority_op():
            time.sleep(0.1)
            return "normal"
        
        # Submit operations with different priorities
        for _ in range(5):
            future = self.db_manager.queue_manager.submit_write_operation(
                high_priority_op, Priority.HIGH
            )
            high_priority_ops.append(future)
        
        for _ in range(5):
            future = self.db_manager.queue_manager.submit_write_operation(
                normal_priority_op, Priority.NORMAL
            )
            normal_priority_ops.append(future)
        
        # Wait for completion
        for future in high_priority_ops + normal_priority_ops:
            result = future.result(timeout=10)
            self.assertIn(result, ["high", "normal"])
    
    def test_file_integrity_protection(self):
        """Test file integrity protection."""
        # Test backup creation
        backups = self.db_manager.create_manual_backup()
        self.assertIsInstance(backups, dict)
        self.assertIn('Credentials.json', backups)
        self.assertIn('Collaboration.json', backups)
        
        # Verify backups were created
        for backup_path in backups.values():
            if not backup_path.startswith("ERROR:"):
                self.assertTrue(os.path.exists(backup_path))
        
        # Test file integrity validation
        creds_valid = self.db_manager.file_ops.validate_integrity('Credentials.json')
        collab_valid = self.db_manager.file_ops.validate_integrity('Collaboration.json')
        
        self.assertTrue(creds_valid)
        self.assertTrue(collab_valid)
    
    def test_error_handling(self):
        """Test error handling scenarios."""
        # Test validation errors
        with self.assertRaises(ValidationError):
            self.db_manager.create_user("test@example.com", "invalid_data")
        
        with self.assertRaises(ValidationError):
            self.db_manager.create_user("test@example.com", {})  # Missing password
        
        # Test database exceptions
        with self.assertRaises(DatabaseException):
            self.db_manager.update_user("nonexistent@example.com", {"password": "test"})
    
    def test_system_status(self):
        """Test system status reporting."""
        status = self.db_manager.get_system_status()
        
        self.assertIsInstance(status, dict)
        self.assertIn('timestamp', status)
        self.assertIn('queue_manager', status)
        self.assertIn('session_manager', status)
        self.assertIn('file_integrity', status)
        self.assertIn('configuration', status)
        
        # Verify file integrity checks
        file_integrity = status['file_integrity']
        self.assertIn('credentials_valid', file_integrity)
        self.assertIn('collaboration_valid', file_integrity)
    
    def test_cleanup_operations(self):
        """Test cleanup operations."""
        # Create multiple sessions
        session_ids = []
        for i in range(5):
            session_id = self.db_manager.create_session(f"user{i}@example.com", "test")
            session_ids.append(session_id)
        
        # Verify sessions were created
        session_info = self.db_manager.get_session_info()
        self.assertGreaterEqual(session_info['total_active_sessions'], 5)
        
        # Test session cleanup
        cleanup_count = self.db_manager.cleanup_sessions()
        # Newly created sessions shouldn't be cleaned up immediately
        self.assertEqual(cleanup_count, 0)
    
    def test_existing_functionality_preservation(self):
        """Test that all existing functionality is preserved."""
        # Test credentials operations match expected behavior
        user = self.db_manager.get_user("test_user@example.com")
        self.assertIsNotNone(user)
        self.assertIn('password', user)
        self.assertIn('school_name', user)
        self.assertIn('history', user)
        
        # Test collaboration operations match expected behavior
        collab_data = self.db_manager.get_collaboration_data()
        self.assertIn('invites', collab_data)
        self.assertIn('chat_sessions', collab_data)
        self.assertIn('message_counter', collab_data)
        
        # Test data structure preservation
        invite = list(collab_data['invites'].values())[0]
        self.assertIn('from_user', invite)
        self.assertIn('to_user', invite)
        self.assertIn('timestamp', invite)
        self.assertIn('status', invite)
    
    def test_concurrent_write_operations(self):
        """Test concurrent write operations are properly queued."""
        results = []
        
        def write_operation(user_id):
            user_data = {
                "password": f"password_{user_id}",
                "school_name": f"School_{user_id}",
                "history": [],
                "questions_attempted": 0,
                "topics_covered": [],
                "last_login": None
            }
            return self.db_manager.create_user(f"user_{user_id}@example.com", user_data)
        
        # Submit multiple write operations
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(write_operation, i) for i in range(10)]
            
            for future in as_completed(futures, timeout=30):
                result = future.result()
                results.append(result)
        
        # Verify all operations completed successfully
        self.assertEqual(len(results), 10)
        self.assertTrue(all(results))
        
        # Verify all users were created
        for i in range(10):
            user = self.db_manager.get_user(f"user_{i}@example.com")
            self.assertIsNotNone(user)
            self.assertEqual(user['school_name'], f"School_{i}")


class TestDBManagerPerformance(unittest.TestCase):
    """Performance and load testing for DBManager."""
    
    def setUp(self):
        """Set up performance test environment."""
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir)
        os.makedirs(self.backup_dir)
        
        # Create minimal test data
        credentials_file = os.path.join(self.data_dir, 'Credentials.json')
        collaboration_file = os.path.join(self.data_dir, 'Collaboration.json')
        
        with open(credentials_file, 'w') as f:
            json.dump({"test@example.com": {"password": "test"}}, f)
        
        with open(collaboration_file, 'w') as f:
            json.dump({"invites": {}, "chat_sessions": {}, "message_counter": 0}, f)
        
        self.db_manager = DBManager(
            data_dir=self.data_dir,
            backup_dir=self.backup_dir,
            max_workers=20
        )
    
    def tearDown(self):
        """Clean up performance test environment."""
        self.db_manager.shutdown()
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_1000_concurrent_reads(self):
        """Test 1000 concurrent read operations."""
        start_time = time.time()
        
        def read_operation():
            return self.db_manager.get_user("test@example.com")
        
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = [executor.submit(read_operation) for _ in range(1000)]
            
            results = []
            for future in as_completed(futures, timeout=60):
                result = future.result()
                results.append(result)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Verify performance
        self.assertEqual(len(results), 1000)
        self.assertLess(duration, 30, "1000 concurrent reads should complete within 30 seconds")
        
        # Calculate average response time
        avg_response_time = duration / 1000
        self.assertLess(avg_response_time, 0.1, "Average response time should be under 100ms")
    
    def test_queue_performance(self):
        """Test queue performance under load."""
        start_time = time.time()
        
        def quick_operation():
            time.sleep(0.001)  # 1ms operation
            return True
        
        # Submit 100 write operations
        futures = []
        for i in range(100):
            future = self.db_manager.queue_manager.submit_write_operation(quick_operation)
            futures.append(future)
        
        # Wait for all operations to complete
        for future in futures:
            result = future.result(timeout=30)
            self.assertTrue(result)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should complete reasonably quickly
        self.assertLess(duration, 10, "100 queued operations should complete within 10 seconds")


if __name__ == '__main__':
    # Configure logging for tests
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    unittest.main(verbosity=2)
