"""
Integration tests for DBManager with existing app.py functionality.

These tests ensure that DBManager integrates seamlessly with
the existing NinjaNerd application without breaking changes.
"""

import unittest
import tempfile
import shutil
import json
import os
import sys
from unittest.mock import patch, MagicMock

# Import DBManager
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dbmgr import DBManager


class TestDBManagerIntegration(unittest.TestCase):
    """Integration tests with existing app.py functionality."""
    
    def setUp(self):
        """Set up integration test environment."""
        # Create temporary test environment
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir)
        os.makedirs(self.backup_dir)
        
        # Create realistic test data that matches app.py structure
        self.test_credentials = {
            "admin@gmail.com": {
                "password": "pbkdf2:sha256:600000$K7c4mA8g9n8lp4BW$e3c6dbb4cfd01bbe2224868c385e4ebc17fbcd4cfc190f0cc0c698ac63be0dd2",
                "school_name": "JRE",
                "history": [
                    {
                        "question": "What is the main idea of the story you just read? List two supporting details.",
                        "user_answer": "hi",
                        "correct": False,
                        "topic": "english",
                        "subtopic": "reading_fundamentals",
                        "grade": 6,
                        "timestamp": "2025-08-09T10:30:06.571143"
                    }
                ],
                "questions_attempted": 1,
                "topics_covered": ["english"],
                "last_login": "2025-08-09T10:30:00.000000"
            },
            "student@example.com": {
                "password": "pbkdf2:sha256:600000$test$hashedpassword",
                "school_name": "Test High School",
                "history": [],
                "questions_attempted": 0,
                "topics_covered": [],
                "last_login": None
            }
        }
        
        self.test_collaboration = {
            "invites": {
                "01713304-a9db-4de2-84c4-90a03e0d8848": {
                    "from_user": "admin@gmail.com",
                    "to_user": "student@example.com",
                    "timestamp": "2025-08-08T00:39:40.561830",
                    "status": "accepted"
                }
            },
            "chat_sessions": {
                "03c4540f-064d-4ec6-bb83-e700b7e69ed8": {
                    "user1": "admin@gmail.com",
                    "user2": "student@example.com",
                    "messages": [],
                    "active": False,
                    "created_at": "2025-08-02T22:11:59.390173"
                }
            },
            "message_counter": 0
        }
        
        # Write test data
        with open(os.path.join(self.data_dir, 'Credentials.json'), 'w') as f:
            json.dump(self.test_credentials, f, indent=2)
        
        with open(os.path.join(self.data_dir, 'Collaboration.json'), 'w') as f:
            json.dump(self.test_collaboration, f, indent=2)
        
        # Initialize DBManager
        self.db_manager = DBManager(
            data_dir=self.data_dir,
            backup_dir=self.backup_dir
        )
    
    def tearDown(self):
        """Clean up integration test environment."""
        self.db_manager.shutdown()
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_user_authentication_flow(self):
        """Test complete login process."""
        # Mock password verification
        with patch('dbmgr.db_manager.check_password_hash') as mock_check:
            mock_check.return_value = True
            
            # Test authentication (equivalent to app.py login)
            result = self.db_manager.authenticate_user("admin@gmail.com", "password")
            self.assertTrue(result)
            
            # Test getting user data after authentication
            user = self.db_manager.get_user("admin@gmail.com")
            self.assertIsNotNone(user)
            self.assertEqual(user['school_name'], "JRE")
            
            # Test session creation for authenticated user
            session_id = self.db_manager.create_session("admin@gmail.com", "authentication")
            self.assertIsNotNone(session_id)
            
            # Test session validation
            is_valid = self.db_manager.validate_session(session_id)
            self.assertTrue(is_valid)
    
    def test_user_registration_flow(self):
        """Test complete user registration process."""
        new_user_data = {
            "password": "pbkdf2:sha256:600000$new$hashedpassword",
            "school_name": "New User School",
            "history": [],
            "questions_attempted": 0,
            "topics_covered": [],
            "last_login": None
        }
        
        # Test user creation (equivalent to app.py register)
        result = self.db_manager.create_user("newuser@example.com", new_user_data)
        self.assertTrue(result)
        
        # Verify user can be retrieved
        user = self.db_manager.get_user("newuser@example.com")
        self.assertIsNotNone(user)
        self.assertEqual(user['school_name'], "New User School")
        
        # Test authentication for new user
        with patch('dbmgr.db_manager.check_password_hash') as mock_check:
            mock_check.return_value = True
            auth_result = self.db_manager.authenticate_user("newuser@example.com", "password")
            self.assertTrue(auth_result)
    
    def test_collaboration_features(self):
        """Test file sharing and collaboration operations."""
        # Test getting collaboration data (equivalent to app.py collaboration routes)
        collab_data = self.db_manager.get_collaboration_data()
        self.assertIsInstance(collab_data, dict)
        self.assertIn('invites', collab_data)
        self.assertIn('chat_sessions', collab_data)
        
        # Test getting user-specific invites
        admin_invites = self.db_manager.get_user_invites("admin@gmail.com")
        self.assertIsInstance(admin_invites, dict)
        self.assertEqual(len(admin_invites), 1)
        
        # Test creating new invite
        new_invite_data = {
            "message": "Let's study together!",
            "subject": "Math collaboration"
        }
        invite_id = self.db_manager.create_invite(
            "student@example.com",
            "admin@gmail.com",
            new_invite_data
        )
        self.assertIsNotNone(invite_id)
        
        # Test updating invite status
        result = self.db_manager.update_invite_status(invite_id, "accepted")
        self.assertTrue(result)
        
        # Verify invite status was updated
        updated_collab_data = self.db_manager.get_collaboration_data()
        updated_invite = updated_collab_data['invites'][invite_id]
        self.assertEqual(updated_invite['status'], 'accepted')
    
    def test_user_history_management(self):
        """Test user history operations (quiz results, etc.)."""
        # Test adding quiz result to history
        quiz_result = {
            "question": "What is 2 + 2?",
            "user_answer": "4",
            "correct": True,
            "topic": "math",
            "subtopic": "addition",
            "grade": 1,
            "difficulty": "easy"
        }
        
        result = self.db_manager.update_user_history("admin@gmail.com", quiz_result)
        self.assertTrue(result)
        
        # Verify history was updated
        user = self.db_manager.get_user("admin@gmail.com")
        self.assertEqual(len(user['history']), 2)  # Original + new entry
        
        latest_entry = user['history'][-1]
        self.assertEqual(latest_entry['question'], "What is 2 + 2?")
        self.assertEqual(latest_entry['correct'], True)
        self.assertIn('timestamp', latest_entry)
    
    def test_grade_change_workflow(self):
        """Test grade change workflow (equivalent to app.py grade change)."""
        # Get original user data
        user = self.db_manager.get_user("admin@gmail.com")
        original_history_count = len(user['history'])
        
        # Update user with new grade information
        updated_user_data = user.copy()
        updated_user_data['current_grade'] = 7
        updated_user_data['grade_changed'] = True
        
        result = self.db_manager.update_user("admin@gmail.com", updated_user_data)
        self.assertTrue(result)
        
        # Verify update
        updated_user = self.db_manager.get_user("admin@gmail.com")
        self.assertEqual(updated_user['current_grade'], 7)
        self.assertTrue(updated_user['grade_changed'])
    
    def test_data_structure_compatibility(self):
        """Test that data structures match app.py expectations."""
        # Test credentials structure
        credentials = self.db_manager.get_all_users()
        self.assertIsInstance(credentials, dict)
        
        for username, user_data in credentials.items():
            # Verify required fields exist
            self.assertIn('password', user_data)
            self.assertIn('school_name', user_data)
            self.assertIn('history', user_data)
            self.assertIsInstance(user_data['history'], list)
            
            # Verify history entry structure
            if user_data['history']:
                history_entry = user_data['history'][0]
                required_fields = ['question', 'user_answer', 'correct', 'topic', 'subtopic', 'grade', 'timestamp']
                for field in required_fields:
                    self.assertIn(field, history_entry)
        
        # Test collaboration structure
        collab_data = self.db_manager.get_collaboration_data()
        self.assertIn('invites', collab_data)
        self.assertIn('chat_sessions', collab_data)
        self.assertIn('message_counter', collab_data)
        
        # Verify invite structure
        for invite_id, invite_data in collab_data['invites'].items():
            required_fields = ['from_user', 'to_user', 'timestamp', 'status']
            for field in required_fields:
                self.assertIn(field, invite_data)
        
        # Verify chat session structure
        for session_id, session_data in collab_data['chat_sessions'].items():
            required_fields = ['user1', 'user2', 'messages', 'active', 'created_at']
            for field in required_fields:
                self.assertIn(field, session_data)
    
    def test_concurrent_user_sessions(self):
        """Test handling multiple concurrent user sessions."""
        # Create sessions for multiple users
        session_ids = []
        
        # Create sessions for different users
        for username in ["admin@gmail.com", "student@example.com"]:
            session_id = self.db_manager.create_session(username, "web_session")
            session_ids.append(session_id)
        
        # Verify all sessions are valid
        for session_id in session_ids:
            is_valid = self.db_manager.validate_session(session_id)
            self.assertTrue(is_valid)
        
        # Test operations with sessions
        for session_id in session_ids:
            user_data = self.db_manager.get_user("admin@gmail.com", session_id=session_id)
            self.assertIsNotNone(user_data)
        
        # Get session information
        session_info = self.db_manager.get_session_info()
        self.assertGreaterEqual(session_info['total_active_sessions'], 2)
    
    def test_error_handling_compatibility(self):
        """Test that error handling matches app.py expectations."""
        # Test handling of non-existent users
        user = self.db_manager.get_user("nonexistent@example.com")
        self.assertIsNone(user)  # Should return None, not raise exception
        
        # Test authentication with non-existent user
        auth_result = self.db_manager.authenticate_user("nonexistent@example.com", "password")
        self.assertFalse(auth_result)  # Should return False, not raise exception
        
        # Test getting invites for non-existent user
        invites = self.db_manager.get_user_invites("nonexistent@example.com")
        self.assertIsInstance(invites, dict)
        self.assertEqual(len(invites), 0)  # Should return empty dict
    
    def test_backup_and_recovery_integration(self):
        """Test backup and recovery operations."""
        # Create initial backup
        backups = self.db_manager.create_manual_backup()
        self.assertIn('Credentials.json', backups)
        self.assertIn('Collaboration.json', backups)
        
        # Modify data
        new_user_data = {
            "password": "test_password",
            "school_name": "Test School",
            "history": [],
            "questions_attempted": 0,
            "topics_covered": [],
            "last_login": None
        }
        self.db_manager.create_user("backup_test@example.com", new_user_data)
        
        # Verify user exists
        user = self.db_manager.get_user("backup_test@example.com")
        self.assertIsNotNone(user)
        
        # Test system status includes backup information
        status = self.db_manager.get_system_status()
        self.assertIn('file_integrity', status)
        self.assertTrue(status['file_integrity']['credentials_valid'])
        self.assertTrue(status['file_integrity']['collaboration_valid'])
    
    def test_performance_under_app_load(self):
        """Test performance under typical app.py usage patterns."""
        import time
        
        # Simulate typical app usage: authentication + data retrieval
        start_time = time.time()
        
        operations_count = 50
        for i in range(operations_count):
            # Simulate login flow
            with patch('dbmgr.db_manager.check_password_hash') as mock_check:
                mock_check.return_value = True
                auth_result = self.db_manager.authenticate_user("admin@gmail.com", "password")
                self.assertTrue(auth_result)
            
            # Simulate getting user data
            user = self.db_manager.get_user("admin@gmail.com")
            self.assertIsNotNone(user)
            
            # Simulate getting collaboration data
            collab_data = self.db_manager.get_collaboration_data("admin@gmail.com")
            self.assertIsNotNone(collab_data)
        
        end_time = time.time()
        duration = end_time - start_time
        avg_time_per_operation = duration / operations_count
        
        # Should complete operations quickly
        self.assertLess(avg_time_per_operation, 0.1, "Operations should complete within 100ms on average")
        self.assertLess(duration, 10, "All operations should complete within 10 seconds")


if __name__ == '__main__':
    unittest.main(verbosity=2)
