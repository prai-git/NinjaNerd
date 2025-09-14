"""
Unit tests for SQLite database manager.
Tests core database operations, concurrency, and error handling.
"""

import pytest
import tempfile
import os
import shutil
import sqlite3
import threading
import time
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor

from dbmgr.sqlite_manager import SQLiteManager, SQLiteConnectionPool
from dbmgr.exceptions import DatabaseException, ValidationError


class TestSQLiteConnectionPool:
    """Test SQLite connection pool functionality."""
    
    def setup_method(self):
        """Setup test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        
    def teardown_method(self):
        """Cleanup test database."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_connection_pool_creation(self):
        """Test connection pool creation and basic functionality."""
        pool = SQLiteConnectionPool(self.db_path, max_connections=5)
        
        assert pool.db_path == self.db_path
        assert pool.max_connections == 5
        assert pool._total_connections > 0
        
        pool.close_all()
    
    def test_connection_context_manager(self):
        """Test connection context manager."""
        pool = SQLiteConnectionPool(self.db_path, max_connections=5)
        
        with pool.get_connection() as conn:
            result = conn.execute("SELECT 1").fetchone()
            assert result[0] == 1
        
        pool.close_all()
    
    def test_concurrent_connections(self):
        """Test concurrent connection usage."""
        pool = SQLiteConnectionPool(self.db_path, max_connections=10)
        results = []
        errors = []
        
        def worker(worker_id):
            try:
                with pool.get_connection() as conn:
                    # Create a test table if it doesn't exist
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS test_concurrent (
                            id INTEGER PRIMARY KEY,
                            worker_id INTEGER,
                            timestamp REAL
                        )
                    """)
                    
                    # Insert data
                    conn.execute(
                        "INSERT INTO test_concurrent (worker_id, timestamp) VALUES (?, ?)",
                        (worker_id, time.time())
                    )
                    conn.commit()
                    
                    # Read data
                    result = conn.execute(
                        "SELECT COUNT(*) FROM test_concurrent WHERE worker_id = ?",
                        (worker_id,)
                    ).fetchone()
                    
                    results.append((worker_id, result[0]))
                    
            except Exception as e:
                errors.append((worker_id, str(e)))
        
        # Run multiple workers concurrently
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(worker, i) for i in range(10)]
            for future in futures:
                future.result(timeout=10)
        
        # Verify results
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 10
        
        # Verify all workers inserted data
        for worker_id, count in results:
            assert count == 1
        
        pool.close_all()


class TestSQLiteManager:
    """Test SQLite manager functionality."""
    
    def setup_method(self):
        """Setup test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        self.manager = SQLiteManager(
            db_path=self.db_path,
            max_connections=10,
            max_workers=5,
            operation_timeout=10
        )
        
    def teardown_method(self):
        """Cleanup test database."""
        if hasattr(self, 'manager'):
            self.manager.close()
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_database_initialization(self):
        """Test database schema initialization."""
        # Verify tables exist
        with self.manager.connection_pool.get_connection() as conn:
            tables = conn.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            """).fetchall()
            
            table_names = [table['name'] for table in tables]
            expected_tables = ['users', 'user_history', 'invites', 'chat_sessions', 'messages', 'schema_info']
            
            for table in expected_tables:
                assert table in table_names, f"Table {table} not found"
    
    def test_admin_user_creation(self):
        """Test default admin user creation."""
        admin_user = self.manager.get_user("admin@gmail.com")
        
        assert admin_user is not None
        assert admin_user['email'] == "admin@gmail.com"
        assert admin_user['is_admin'] == 1
        assert admin_user['school_name'] == "NinjaNerd Academy"
    
    def test_user_creation_and_retrieval(self):
        """Test user creation and retrieval."""
        test_email = "test@example.com"
        test_password = "hashed_password_123"
        test_school = "Test School"
        
        # Create user
        success = self.manager.create_user(test_email, test_password, test_school)
        assert success is True
        
        # Retrieve user
        user = self.manager.get_user(test_email)
        assert user is not None
        assert user['email'] == test_email
        assert user['password'] == test_password
        assert user['school_name'] == test_school
        assert user['history'] == []
    
    def test_duplicate_user_creation(self):
        """Test duplicate user creation handling."""
        test_email = "duplicate@example.com"
        test_password = "password123"
        
        # Create user first time
        success1 = self.manager.create_user(test_email, test_password)
        assert success1 is True
        
        # Try to create same user again - should raise ConcurrencyError
        from dbmgr.exceptions import ConcurrencyError
        with pytest.raises(ConcurrencyError):
            self.manager.create_user(test_email, test_password)
    
    def test_user_history_management(self):
        """Test user history operations."""
        test_email = "history@example.com"
        test_password = "password123"
        
        # Create user
        self.manager.create_user(test_email, test_password)
        
        # Add history entry
        history_entry = {
            'question': 'What is 2+2?',
            'user_answer': '4',
            'correct': True,
            'topic': 'math',
            'subtopic': 'addition',
            'grade': 1,
            'timestamp': '2025-09-11T10:00:00'
        }
        
        success = self.manager.add_user_history(test_email, history_entry)
        assert success is True
        
        # Retrieve user with history
        user = self.manager.get_user(test_email)
        assert len(user['history']) == 1
        
        history = user['history'][0]
        assert history['question'] == 'What is 2+2?'
        assert history['user_answer'] == '4'
        assert history['correct'] == 1  # SQLite returns integer for boolean
        assert history['topic'] == 'math'
    
    def test_collaboration_operations(self):
        """Test collaboration data operations."""
        # Create test users
        user1_email = "user1@example.com"
        user2_email = "user2@example.com"
        
        self.manager.create_user(user1_email, "password1")
        self.manager.create_user(user2_email, "password2")
        
        # Create invite
        invite_id = self.manager.create_invite(user1_email, user2_email)
        assert invite_id is not None
        
        # Update invite status using invite_id signature
        success = self.manager.update_invite_status(invite_id, "accepted")
        assert success is True
        
        # Create chat session
        session_id = self.manager.create_chat_session(user1_email, user2_email)
        assert session_id is not None
        
        # Add message
        message_id = self.manager.add_message(
            session_id, user1_email, user2_email, "Hello, how are you?"
        )
        assert message_id is not None
        
        # Mark message as displayed
        success = self.manager.update_message_displayed(message_id, True)
        assert success is True
        
        # Get collaboration data
        collab_data = self.manager.get_collaboration_data()
        
        assert invite_id in collab_data['invites']
        assert session_id in collab_data['chat_sessions']
        
        invite = collab_data['invites'][invite_id]
        assert invite['from_user'] == user1_email
        assert invite['to_user'] == user2_email
        assert invite['status'] == "accepted"
        
        session = collab_data['chat_sessions'][session_id]
        assert session['user1'] == user1_email
        assert session['user2'] == user2_email
        assert len(session['messages']) == 1
        
        message = session['messages'][0]
        assert message['from_user'] == user1_email
        assert message['to_user'] == user2_email
        assert message['message'] == "Hello, how are you?"
        assert message['displayed'] is True
    
    def test_statistics(self):
        """Test database statistics."""
        # Create test data
        self.manager.create_user("stats1@example.com", "password1")
        self.manager.create_user("stats2@example.com", "password2")
        
        invite_id = self.manager.create_invite("stats1@example.com", "stats2@example.com")
        session_id = self.manager.create_chat_session("stats1@example.com", "stats2@example.com")
        self.manager.add_message(session_id, "stats1@example.com", "stats2@example.com", "Test message")
        
        # Get statistics
        stats = self.manager.get_statistics()
        
        assert stats['total_users'] >= 3  # At least admin + 2 test users
        assert stats['active_sessions'] >= 1
        assert stats['total_messages'] >= 1
        assert stats['pending_invites'] >= 1
    
    def test_cleanup_operations(self):
        """Test data cleanup operations."""
        # Create old test data
        self.manager.create_user("cleanup@example.com", "password")
        
        # Add old history entry (simulate old timestamp)
        with self.manager.connection_pool.get_connection() as conn:
            user_row = conn.execute(
                "SELECT id FROM users WHERE email = ?",
                ("cleanup@example.com",)
            ).fetchone()
            
            # Insert old history entry
            old_timestamp = '2020-01-01T00:00:00'
            conn.execute("""
                INSERT INTO user_history 
                (user_id, question, user_answer, correct, topic, subtopic, grade, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_row['id'], 'Old question', 'Old answer', True, 'test', 'test', 1, old_timestamp))
            conn.commit()
        
        # Run cleanup (30 days retention)
        success = self.manager.cleanup_old_data(days=30)
        assert success is True
    
    def test_concurrent_operations(self):
        """Test concurrent database operations."""
        results = []
        errors = []
        
        def worker(worker_id):
            try:
                # Each worker creates a user and adds history
                email = f"worker{worker_id}@example.com"
                password = f"password{worker_id}"
                
                success = self.manager.create_user(email, password, f"School {worker_id}")
                if success:
                    # Add some history
                    for i in range(3):
                        history_entry = {
                            'question': f'Question {i} from worker {worker_id}',
                            'user_answer': f'Answer {i}',
                            'correct': i % 2 == 0,
                            'topic': 'test',
                            'subtopic': 'concurrent',
                            'grade': worker_id % 5 + 1,
                            'timestamp': f'2025-09-11T10:{i:02d}:00'
                        }
                        self.manager.add_user_history(email, history_entry)
                    
                    # Retrieve user to verify
                    user = self.manager.get_user(email)
                    if user:
                        results.append((worker_id, len(user['history'])))
                    else:
                        errors.append((worker_id, "Failed to retrieve user"))
                else:
                    errors.append((worker_id, "Failed to create user"))
                    
            except Exception as e:
                errors.append((worker_id, str(e)))
        
        # Run multiple workers concurrently
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(worker, i) for i in range(10)]
            for future in futures:
                future.result(timeout=30)
        
        # Verify results
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 10
        
        # Verify all workers created users with history
        for worker_id, history_count in results:
            assert history_count == 3
    
    def test_error_handling(self):
        """Test error handling for various scenarios."""
        # Test non-existent user
        user = self.manager.get_user("nonexistent@example.com")
        assert user is None
        
        # Test adding history for non-existent user - should raise DatabaseException
        history_entry = {'question': 'Test', 'user_answer': 'Test', 'correct': True}
        from dbmgr.exceptions import DatabaseException
        with pytest.raises(DatabaseException):
            self.manager.add_user_history("nonexistent@example.com", history_entry)
        
        # Test invalid invite creation
        with pytest.raises(DatabaseException):
            self.manager.create_invite("nonexistent@example.com", "another@example.com")
    
    def test_database_corruption_recovery(self):
        """Test handling of database corruption scenarios."""
        # This test would require more complex setup to simulate actual corruption
        # For now, test basic error handling
        
        # Test with invalid database path (use temp directory to avoid permission issues)
        import tempfile
        with tempfile.TemporaryDirectory() as temp_dir:
            # Try to create database in a non-writable subdirectory
            invalid_path = os.path.join(temp_dir, "readonly", "database.db")
            os.makedirs(os.path.dirname(invalid_path))
            os.chmod(os.path.dirname(invalid_path), 0o444)  # Read-only
            
            try:
                with pytest.raises((DatabaseException, OSError, PermissionError)):
                    invalid_manager = SQLiteManager(db_path=invalid_path)
            finally:
                # Restore permissions for cleanup
                os.chmod(os.path.dirname(invalid_path), 0o755)

    def test_get_database_stats(self):
        """Test the get_database_stats method for initialization verification."""
        # Create test data
        self.manager.create_user("stats_test1@example.com", "password123")
        self.manager.create_user("stats_test2@example.com", "password456")
        
        session_id = self.manager.create_chat_session("stats_test1@example.com", "stats_test2@example.com")
        self.manager.add_message(session_id, "stats_test1@example.com", "stats_test2@example.com", "Test stats message")
        
        # Get database stats
        stats = self.manager.get_database_stats()
        
        # Verify stats structure
        expected_keys = [
            'total_users', 'total_messages', 'total_chat_sessions', 
            'active_sessions', 'pending_invites', 'database_size_bytes', 
            'database_size_mb', 'messages_last_24h'
        ]
        
        for key in expected_keys:
            assert key in stats, f"Missing key '{key}' in database stats"
        
        # Verify stats have reasonable values
        assert stats['total_users'] >= 2  # At least 2 test users
        assert stats['total_messages'] >= 1
        assert stats['total_chat_sessions'] >= 1
        assert stats['database_size_bytes'] > 0
        assert stats['database_size_mb'] >= 0
        assert isinstance(stats['active_sessions'], int)
        assert isinstance(stats['pending_invites'], int)
        assert isinstance(stats['messages_last_24h'], int)
    
    def test_get_database_stats_empty_database(self):
        """Test get_database_stats with minimal data."""
        # Get stats from fresh database
        stats = self.manager.get_database_stats()
        
        # Should still return valid structure with zero/minimal counts
        assert 'total_users' in stats
        assert stats['total_users'] >= 0  # Could be 0 users in a fresh test db
        assert stats['database_size_bytes'] >= 0  # Database file exists
        
        # Should not have errors if database is properly initialized
        if 'error' in stats:
            # If there are errors, they should be related to missing tables (acceptable for empty DB)
            assert 'table' in stats['error'].lower() or 'column' in stats['error'].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
