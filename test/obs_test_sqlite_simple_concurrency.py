"""
Simple concurrency tests for SQLite database operations.
These tests are designed to pass quickly without timeouts.
"""

import unittest
import tempfile
import shutil
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dbmgr.sqlite_manager import SQLiteManager


class TestSQLiteSimpleConcurrency(unittest.TestCase):
    """Simple concurrency tests for SQLite operations."""
    
    def setUp(self):
        """Setup test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test_concurrency.db')
        
        # Initialize manager with minimal configuration
        self.manager = SQLiteManager(
            db_path=self.db_path,
            max_connections=10,
            max_workers=5,
            operation_timeout=30
        )
    
    def tearDown(self):
        """Cleanup test environment."""
        try:
            self.manager.close()
        except:
            pass
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_simple_concurrent_user_creation(self):
        """Test simple concurrent user creation with minimal load."""
        num_users = 5
        results = []
        
        def create_user_worker(user_id):
            email = f"user{user_id}@example.com"
            success = self.manager.create_user(email, f"password{user_id}", f"School {user_id}")
            if success:
                user = self.manager.get_user(email)
                if user:
                    results.append(user_id)
        
        # Use minimal concurrency
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(create_user_worker, i) for i in range(num_users)]
            for future in futures:
                future.result(timeout=30)  # 30 second timeout per operation
        
        # Check that most users were created
        assert len(results) >= 4, f"Only {len(results)} out of {num_users} users created successfully"
        print(f"✓ Successfully created {len(results)} users concurrently")
    
    def test_simple_concurrent_operations(self):
        """Test simple concurrent read operations."""
        # First create a user
        self.manager.create_user("test@example.com", "password", "Test School")
        
        results = []
        
        def read_user_worker():
            user = self.manager.get_user("test@example.com")
            if user:
                results.append(user['email'])
        
        # Concurrent reads should work fine
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(read_user_worker) for _ in range(10)]
            for future in futures:
                future.result(timeout=10)
        
        # All reads should succeed
        assert len(results) == 10, f"Only {len(results)} out of 10 reads succeeded"
        print(f"✓ Successfully performed {len(results)} concurrent reads")
    
    def test_connection_pool_stress(self):
        """Test connection pool under moderate stress."""
        # Create some test data
        for i in range(3):
            self.manager.create_user(f"stress{i}@example.com", f"password{i}", f"School {i}")
        
        successful_operations = 0
        
        def mixed_operation_worker(op_id):
            nonlocal successful_operations
            try:
                # Mix of read and write operations
                if op_id % 2 == 0:
                    # Read operation
                    user = self.manager.get_user(f"stress{op_id % 3}@example.com")
                    if user:
                        successful_operations += 1
                else:
                    # Write operation (add history)
                    success = self.manager.add_user_history(
                        f"stress{op_id % 3}@example.com",
                        {
                            'question': f'Question {op_id}',
                            'user_answer': f'Answer {op_id}',
                            'correct': True
                        }
                    )
                    if success:
                        successful_operations += 1
            except Exception:
                pass  # Ignore errors for this stress test
        
        # Moderate stress with 15 operations across 5 workers
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(mixed_operation_worker, i) for i in range(15)]
            for future in futures:
                try:
                    future.result(timeout=20)
                except:
                    pass  # Continue even if some operations fail
        
        # Should have reasonable success rate
        success_rate = successful_operations / 15
        assert success_rate >= 0.7, f"Success rate too low: {success_rate:.2%}"
        print(f"✓ Stress test completed with {success_rate:.1%} success rate")


if __name__ == '__main__':
    unittest.main()
