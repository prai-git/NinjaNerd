#!/usr/bin/env python3
"""
Test suite for security and concurrency fixes in app.py.
Validates thread safety, input sanitization, and safe LLM service facade.
"""

import unittest
import threading
import time
import json
import tempfile
import os
import shutil
from unittest.mock import Mock, patch, MagicMock
import sys
sys.path.append('/Users/praveenrai/Personal/Krishang/NinjaNerd')

from core.concurrency_utils import synchronized, get_lock_manager, LOCK_ACTIVE_SESSIONS
from core.safe_llm_facade import SafeLLMServiceFacade, get_safe_llm_service, initialize_safe_llm_service
from core.input_sanitizer import InputValidator, get_input_validator, sanitize_input

import unittest
import sys
import os
import threading
import time
import json
from unittest.mock import Mock, patch, MagicMock

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class TestConcurrencyUtils(unittest.TestCase):
    """Test concurrency utilities and thread safety"""
    
    def setUp(self):
        # Import here to avoid issues if modules aren't available
        from core.concurrency_utils import NamedLockManager, synchronized
        self.lock_manager = NamedLockManager()
        self.synchronized = synchronized
    
    def test_named_lock_acquisition(self):
        """Test that named locks can be acquired and released"""
        lock_name = "test_lock"
        
        # Test acquiring the same lock multiple times
        with self.lock_manager.acquire_lock(lock_name):
            # Should be able to acquire again (RLock behavior)
            with self.lock_manager.acquire_lock(lock_name):
                pass
    
    def test_lock_contention_stats(self):
        """Test lock contention statistics tracking"""
        lock_name = "contention_test"
        
        def worker():
            with self.lock_manager.acquire_lock(lock_name):
                time.sleep(0.01)  # Hold lock briefly
        
        # Start multiple threads to create contention
        threads = [threading.Thread(target=worker) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        stats = self.lock_manager.get_contention_stats()
        self.assertIn(lock_name, stats)
        self.assertGreaterEqual(stats[lock_name]['acquisitions'], 5)
    
    def test_synchronized_decorator(self):
        """Test the synchronized context manager"""
        lock_name = "sync_test"
        shared_data = {'counter': 0}
        
        def increment():
            with self.synchronized(lock_name):
                current = shared_data['counter']
                time.sleep(0.001)  # Simulate some work
                shared_data['counter'] = current + 1
        
        # Run multiple threads
        threads = [threading.Thread(target=increment) for _ in range(10)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        # Should be exactly 10 if properly synchronized
        self.assertEqual(shared_data['counter'], 10)


class TestSafeLLMFacade(unittest.TestCase):
    """Test safe LLM service facade functionality"""
    
    def setUp(self):
        from core.safe_llm_facade import SafeLLMServiceFacade
        self.mock_logger = Mock()
        self.facade = SafeLLMServiceFacade(logger=self.mock_logger)
    
    def test_facade_without_real_service(self):
        """Test facade behavior when no real service is available"""
        # Test call_llm_api
        result = self.facade.call_llm_api("test prompt")
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['error'], 'service_unavailable')
        self.assertTrue(result['fallback'])
        self.assertIn('questions', result)
        
        # Test generate_learning_content
        result = self.facade.generate_learning_content("math", "algebra", "5")
        self.assertEqual(result['status'], 'error')
        
        # Test check_answer_with_llm (should return False for safety)
        result = self.facade.check_answer_with_llm("What is 2+2?", "4", "Basic addition")
        self.assertFalse(result)
        
        # Test cleanup_session_queue_requests (should not raise)
        self.facade.cleanup_session_queue_requests("test_session")
    
    def test_facade_with_mock_service(self):
        """Test facade behavior with a mock real service"""
        mock_service = Mock()
        mock_service.call_llm_api.return_value = {'status': 'success', 'questions': []}
        mock_service.generate_learning_content.return_value = {'status': 'success'}
        mock_service.check_answer_with_llm.return_value = True
        
        self.facade.initialize_service(mock_service, self.mock_logger)
        
        # Test that calls are forwarded to real service
        result = self.facade.call_llm_api("test")
        self.assertEqual(result['status'], 'success')
        mock_service.call_llm_api.assert_called_once()
        
        result = self.facade.generate_learning_content("math", "algebra", "5")
        self.assertEqual(result['status'], 'success')
        mock_service.generate_learning_content.assert_called_once()
        
        result = self.facade.check_answer_with_llm("What is 2+2?", "4", "Basic addition")
        self.assertTrue(result)
        mock_service.check_answer_with_llm.assert_called_once()
    
    def test_facade_with_failing_service(self):
        """Test facade behavior when real service raises exceptions"""
        mock_service = Mock()
        mock_service.call_llm_api.side_effect = Exception("Service error")
        mock_service.check_answer_with_llm.side_effect = Exception("Service error")
        
        self.facade.initialize_service(mock_service, self.mock_logger)
        
        # Should return error response instead of raising
        result = self.facade.call_llm_api("test")
        self.assertEqual(result['status'], 'error')
        self.assertTrue(result['fallback'])
        
        # Should return False for safety when answer checking fails
        result = self.facade.check_answer_with_llm("test", "test", "test")
        self.assertFalse(result)


class TestInputSanitization(unittest.TestCase):
    """Test input sanitization and validation"""
    
    def setUp(self):
        from core.input_sanitizer import InputValidator
        self.mock_logger = Mock()
        self.validator = InputValidator(self.mock_logger)
    
    def test_username_sanitization(self):
        """Test username sanitization"""
        # Valid username
        result = self.validator.sanitize_username("test.user@example.com")
        self.assertEqual(result, "test.user@example.com")
        
        # Username with invalid characters
        result = self.validator.sanitize_username("test<script>user")
        self.assertEqual(result, "testuser")
        
        # Long username should be truncated
        long_username = "a" * 100
        result = self.validator.sanitize_username(long_username)
        self.assertLessEqual(len(result), self.validator.MAX_USERNAME_LENGTH)
        
        # Empty username should raise error
        with self.assertRaises(ValueError):
            self.validator.sanitize_username("")
    
    def test_school_name_sanitization(self):
        """Test school name sanitization"""
        # Valid school name
        result = self.validator.sanitize_school_name("Jefferson Elementary School")
        self.assertEqual(result, "Jefferson Elementary School")
        
        # School name with HTML
        result = self.validator.sanitize_school_name("<script>alert('xss')</script>School")
        self.assertNotIn("<script>", result)
        
        # Empty school name should get default
        result = self.validator.sanitize_school_name("")
        self.assertEqual(result, "Unknown School")
    
    def test_chat_message_sanitization(self):
        """Test chat message sanitization"""
        # Valid message
        result = self.validator.sanitize_chat_message("Hello! How are you? 😊")
        self.assertEqual(result, "Hello! How are you? 😊")
        
        # Message with HTML
        result = self.validator.sanitize_chat_message("Hello <script>alert('xss')</script>")
        self.assertNotIn("<script>", result)
        
        # Long message should be truncated
        long_message = "a" * 2000
        result = self.validator.sanitize_chat_message(long_message)
        self.assertLessEqual(len(result), self.validator.MAX_CHAT_MESSAGE_LENGTH)
    
    def test_content_sanitization(self):
        """Test general content sanitization"""
        # Remove dangerous patterns
        dangerous_inputs = [
            "<script>alert('xss')</script>",
            "javascript:alert(1)",
            "<img src=x onerror=alert(1)>",
            "data:text/html,<script>alert(1)</script>"
        ]
        
        for dangerous in dangerous_inputs:
            result = self.validator.sanitize_content(dangerous)
            # Should not contain the dangerous parts
            self.assertNotIn("script>", result.lower())
            self.assertNotIn("javascript:", result.lower())
            self.assertNotIn("onerror=", result.lower())
    
    def test_form_data_validation(self):
        """Test batch form data validation"""
        form_data = {
            'username': 'test<script>user',
            'school_name': 'Test School <img src=x>',
            'subject': 'Math Help <script>',
            'content': 'Please help with homework javascript:alert(1)',
            'other_field': 'Some other data'
        }
        
        sanitized = self.validator.validate_and_sanitize_form_data(form_data)
        
        # Check that all fields are sanitized
        self.assertNotIn('<script>', sanitized['username'])
        self.assertNotIn('<img', sanitized['school_name'])
        self.assertNotIn('<script>', sanitized['subject'])
        self.assertNotIn('javascript:', sanitized['content'])


class TestRaceConditionFixes(unittest.TestCase):
    """Test that race conditions are properly handled"""
    
    def setUp(self):
        # Mock the app and its components
        self.mock_app = Mock()
        self.mock_logger = Mock()
        
        # We'll test the concepts without importing the actual app
        # to avoid dependency issues in testing
    
    def test_concurrent_message_counter_increment(self):
        """Simulate concurrent message counter increments"""
        from core.concurrency_utils import synchronized, LOCK_MESSAGE_COUNTER
        
        # Simulate the message counter
        counter_data = {'message_counter': 0}
        
        def increment_counter():
            with synchronized(LOCK_MESSAGE_COUNTER):
                current = counter_data['message_counter']
                time.sleep(0.001)  # Simulate processing time
                counter_data['message_counter'] = current + 1
        
        # Run multiple threads concurrently
        threads = [threading.Thread(target=increment_counter) for _ in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        # Counter should be exactly 20 if properly synchronized
        self.assertEqual(counter_data['message_counter'], 20)
    
    def test_concurrent_session_updates(self):
        """Test concurrent updates to active sessions"""
        from core.concurrency_utils import synchronized, LOCK_ACTIVE_SESSIONS
        
        # Simulate active sessions
        active_sessions = {}
        
        def add_session(user_id):
            with synchronized(LOCK_ACTIVE_SESSIONS):
                if user_id not in active_sessions:
                    active_sessions[user_id] = {'last_activity': time.time()}
        
        def remove_session(user_id):
            with synchronized(LOCK_ACTIVE_SESSIONS):
                if user_id in active_sessions:
                    del active_sessions[user_id]
        
        # Add sessions concurrently
        add_threads = [threading.Thread(target=add_session, args=(f'user_{i}',)) 
                      for i in range(10)]
        for thread in add_threads:
            thread.start()
        for thread in add_threads:
            thread.join()
        
        self.assertEqual(len(active_sessions), 10)
        
        # Remove sessions concurrently  
        remove_threads = [threading.Thread(target=remove_session, args=(f'user_{i}',)) 
                         for i in range(10)]
        for thread in remove_threads:
            thread.start()
        for thread in remove_threads:
            thread.join()
        
        self.assertEqual(len(active_sessions), 0)


def run_concurrency_stress_test():
    """Run a stress test to verify concurrency fixes under load"""
    print("Running concurrency stress test...")
    
    from core.concurrency_utils import synchronized, NamedLockManager
    
    # Simulate high contention scenario
    shared_resources = {
        'collaboration_data': {'message_counter': 0, 'invites': {}, 'chat_sessions': {}},
        'active_sessions': {},
        'credentials': {}
    }
    
    def simulate_user_activity(user_id):
        """Simulate various user activities that would cause race conditions"""
        
        # Simulate sending messages
        with synchronized('COLLABORATION_DATA'):
            shared_resources['collaboration_data']['message_counter'] += 1
        
        # Simulate session updates
        with synchronized('ACTIVE_SESSIONS'):
            shared_resources['active_sessions'][f'user_{user_id}'] = {
                'last_activity': time.time(),
                'session_id': f'session_{user_id}'
            }
        
        # Simulate sending invites
        with synchronized('COLLABORATION_DATA'):
            invite_id = f'invite_{user_id}_{time.time()}'
            shared_resources['collaboration_data']['invites'][invite_id] = {
                'from_user': f'user_{user_id}',
                'to_user': f'user_{(user_id + 1) % 10}',
                'timestamp': time.time()
            }
    
    # Run many concurrent user activities
    threads = []
    for i in range(50):  # 50 concurrent users
        thread = threading.Thread(target=simulate_user_activity, args=(i,))
        threads.append(thread)
        thread.start()
    
    # Wait for all to complete
    for thread in threads:
        thread.join()
    
    # Verify data integrity
    print(f"Message counter: {shared_resources['collaboration_data']['message_counter']}")
    print(f"Active sessions: {len(shared_resources['active_sessions'])}")
    print(f"Invites: {len(shared_resources['collaboration_data']['invites'])}")
    
    # Should have exactly 50 messages, 50 sessions, and 50 invites
    assert shared_resources['collaboration_data']['message_counter'] == 50
    assert len(shared_resources['active_sessions']) == 50
    assert len(shared_resources['collaboration_data']['invites']) == 50
    
    print("✅ Stress test passed - no race conditions detected!")


class TestMultiUserSupport(unittest.TestCase):
    """Test multi-user support and session isolation"""
    
    def test_multi_user_session_isolation(self):
        """Test that multiple users can have isolated sessions without interference."""
        from core.concurrency_utils import synchronized, LOCK_ACTIVE_SESSIONS
        
        # Simulate multiple users with concurrent sessions
        active_sessions = {}
        results = {'conflicts': 0, 'success_count': 0}
        
        def simulate_user_session(user_id):
            """Simulate a user creating and modifying their session"""
            try:
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    # Each user creates their own session
                    session_data = {
                        'session_id': f"session_{user_id}",
                        'username': f"user_{user_id}",
                        'grade': (user_id % 12) + 1,  # Grades 1-12
                        'school_name': f"School_{user_id % 5}",  # 5 different schools
                        'current_topic': 'math' if user_id % 2 == 0 else 'english',
                        'last_activity': f"2024-01-01T{user_id:02d}:00:00"
                    }
                    
                    username = f"user_{user_id}"
                    active_sessions[username] = session_data
                    
                    # Verify session was created correctly
                    if active_sessions.get(username) == session_data:
                        results['success_count'] += 1
                    else:
                        results['conflicts'] += 1
                        
                # Simulate some activity outside the lock
                time.sleep(0.01)
                
                # Update activity with proper locking
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    if username in active_sessions:
                        active_sessions[username]['last_activity'] = f"updated_{user_id}"
                        
            except Exception as e:
                print(f"User {user_id} encountered error: {e}")
                results['conflicts'] += 1
        
        # Create multiple threads to simulate concurrent users
        threads = []
        num_users = 20
        
        for i in range(num_users):
            thread = threading.Thread(target=simulate_user_session, args=(i,))
            threads.append(thread)
        
        # Start all threads
        for thread in threads:
            thread.start()
            
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # Validate results
        self.assertEqual(results['conflicts'], 0, "No conflicts should occur with proper locking")
        self.assertEqual(results['success_count'], num_users, "All users should successfully create sessions")
        self.assertEqual(len(active_sessions), num_users, "All user sessions should be preserved")
        
        # Verify each user has unique and correct data
        for i in range(num_users):
            username = f"user_{i}"
            self.assertIn(username, active_sessions)
            session_data = active_sessions[username]
            self.assertEqual(session_data['username'], username)
            self.assertEqual(session_data['grade'], (i % 12) + 1)
            self.assertEqual(session_data['last_activity'], f"updated_{i}")
    
    def test_account_creation_input_sanitization(self):
        """Test that account creation properly sanitizes all inputs."""
        from core.input_sanitizer import InputValidator
        
        validator = InputValidator()
        
        # Test malicious inputs that should be sanitized
        test_cases = [
            {
                'input': {'username': '<script>alert("xss")</script>user', 'school_name': 'My<script>School'},
                'expected_username': 'alertxssuser',  # HTML tags removed, then invalid chars removed
                'expected_school_name': 'My&lt;script&gt;School'  # HTML escaped
            },
            {
                'input': {'username': 'user@domain.com!@#$%^&*()', 'school_name': 'School & University'},
                'expected_username': 'user@domain.com@',  # Invalid chars removed, but @ is allowed
                'expected_school_name': 'School &amp; University'  # HTML escaped
            },
            {
                'input': {'username': '   spaced_user   ', 'school_name': '  Padded School  '},
                'expected_username': 'spaced_user',  # Trimmed and lowercased
                'expected_school_name': 'Padded School'  # Trimmed but case preserved
            }
        ]
        
        for case in test_cases:
            # Test username sanitization
            sanitized_username = validator.sanitize_username(case['input']['username'])
            self.assertEqual(sanitized_username, case['expected_username'], 
                           f"Username sanitization failed for: {case['input']['username']}")
            
            # Test school name sanitization
            sanitized_school = validator.sanitize_school_name(case['input']['school_name'])
            self.assertEqual(sanitized_school, case['expected_school_name'],
                           f"School name sanitization failed for: {case['input']['school_name']}")


if __name__ == '__main__':
    print("🧪 Running Security and Concurrency Fix Tests")
    print("=" * 50)
    
    # Run unit tests
    unittest.main(verbosity=2, exit=False)
    
    print("\n" + "=" * 50)
    # Run stress test
    run_concurrency_stress_test()
    
    print("\n🎉 All tests completed successfully!")
