"""Test fresh installation scenarios without JSON migration."""

import os
import tempfile
import shutil
import pytest
import sqlite3
from unittest.mock import patch, MagicMock

from dbmgr.sqlite_manager import SQLiteManager


class TestFreshInstallation:
    """Test database initialization on fresh installations."""
    
    def setup_method(self):
        """Set up test environment for each test."""
        # Create temporary directories
        self.temp_dir = tempfile.mkdtemp()
        self.test_data_dir = os.path.join(self.temp_dir, "data")
        os.makedirs(self.test_data_dir, exist_ok=True)
        
        # Test database path
        self.test_db_path = os.path.join(self.test_data_dir, "test_ninjanerd.db")
        
    def teardown_method(self):
        """Clean up after each test."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
            
    def test_fresh_installation_without_json_files(self):
        """Test that database initializes correctly on fresh installation."""
        # Ensure no JSON files exist (simulating fresh installation)
        json_files = ['users.json', 'collaboration_spaces.json', 'user_statistics.json']
        for json_file in json_files:
            json_path = os.path.join(self.test_data_dir, json_file)
            if os.path.exists(json_path):
                os.remove(json_path)
                
        # Initialize database manager
        db_manager = SQLiteManager(self.test_db_path)
        
        try:
            # Verify database file is created
            assert os.path.exists(self.test_db_path), "Database file should be created"
            
            # Verify database has all required tables by querying directly
            with sqlite3.connect(self.test_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [row[0] for row in cursor.fetchall()]
                
                expected_tables = [
                    'users', 'user_history', 'invites', 'chat_sessions', 
                    'messages', 'user_statistics', 'email_verification_codes', 'schema_info'
                ]
                
                for table in expected_tables:
                    assert table in tables, f"Missing table: {table}"
                    
            # Test that we can create a user (core functionality)
            success = db_manager.create_user(
                email='test_fresh@example.com',
                password='test_password_hash',
                school_name='Test School'
            )
            assert success, "Should be able to create user in fresh database"
            
            # Test that we can retrieve the user
            user = db_manager.get_user('test_fresh@example.com')
            assert user is not None, "Should be able to retrieve created user"
            assert user['email'] == 'test_fresh@example.com', "User email should match"
            
        finally:
            db_manager.close()
            
    def test_user_statistics_table_exists(self):
        """Test that user_statistics table is properly created and accessible."""
        db_manager = SQLiteManager(self.test_db_path)
        
        try:
            # Create a test user first
            user_created = db_manager.create_user(
                email="stats_test@example.com",
                password="test_hash",
                school_name="Test School"
            )
            assert user_created, "User creation should succeed"
            
            # Now test accessing user statistics table directly
            with sqlite3.connect(self.test_db_path) as conn:
                cursor = conn.cursor()
                
                # Test that the table exists and we can query it
                cursor.execute("SELECT COUNT(*) FROM user_statistics")
                count = cursor.fetchone()[0]
                assert isinstance(count, int), "Should be able to query user_statistics table"
                
                # Test that we can insert into user_statistics
                cursor.execute("""
                    INSERT OR REPLACE INTO user_statistics (user_id, last_login) 
                    SELECT id, datetime('now') FROM users WHERE email = ?
                """, ("stats_test@example.com",))
                conn.commit()
                
                # Verify the insert worked
                cursor.execute("""
                    SELECT last_login FROM user_statistics us
                    JOIN users u ON us.user_id = u.id
                    WHERE u.email = ?
                """, ("stats_test@example.com",))
                result = cursor.fetchone()
                assert result is not None, "Should find user statistics record"
                assert result[0] is not None, "last_login should be set"
                
        finally:
            db_manager.close()
            
    def test_database_schema_completeness(self):
        """Test that the database schema matches the current production schema."""
        db_manager = SQLiteManager(self.test_db_path)
        
        try:
            # Check that all expected indexes are created
            with sqlite3.connect(self.test_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
                indexes = [row[0] for row in cursor.fetchall()]
                
                # Key indexes that should exist
                expected_indexes = [
                    'idx_users_email',
                    'idx_user_history_user_id', 
                    'idx_verification_codes_email',
                    'idx_user_statistics_user_id'
                ]
                
                for index in expected_indexes:
                    assert index in indexes, f"Missing index: {index}"
                    
                # Test foreign key constraints are working
                # Note: Foreign keys need to be enabled per connection
                cursor.execute("PRAGMA foreign_keys = ON")
                cursor.execute("PRAGMA foreign_keys")
                fk_status = cursor.fetchone()[0]
                assert fk_status == 1, "Foreign keys should be enabled after setting"
                
        finally:
            db_manager.close()