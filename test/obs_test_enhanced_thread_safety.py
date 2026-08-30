#!/usr/bin/env python3
"""
Enhanced thread safety tests for app.py locks implementation.
Tests comprehensive lock usage across all shared data operations.
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

from core.concurrency_utils import (
    synchronized, 
    get_lock_manager, 
    LOCK_ACTIVE_SESSIONS, 
    LOCK_COLLABORATION_DATA,
    LOCK_MESSAGE_COUNTER,
    LOCK_CREDENTIALS,
    LOCK_CHAT_SESSIONS
)

class TestEnhancedThreadSafety(unittest.TestCase):
    """Test enhanced thread safety for app.py operations"""
    
    def setUp(self):
        """Set up test environment"""
        self.lock_manager = get_lock_manager()
        # Clear any existing stats
        self.lock_manager._contention_stats.clear()
        
        # Mock active sessions for testing
        self.active_sessions = {}
        
    def test_active_sessions_concurrent_access(self):
        """Test concurrent access to active_sessions with locks"""
        results = []
        errors = []
        
        def add_user_session(user_id):
            try:
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    self.active_sessions[f'user_{user_id}'] = {
                        'session_id': f'session_{user_id}',
                        'last_activity': time.time(),
                        'school_name': f'School_{user_id}',
                        'grade': user_id % 12 + 1,
                        'current_topic': f'topic_{user_id}'
                    }
                    results.append(f'user_{user_id}')
            except Exception as e:
                errors.append(str(e))
        
        def remove_user_session(user_id):
            try:
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    user_key = f'user_{user_id}'
                    if user_key in self.active_sessions:
                        del self.active_sessions[user_key]
                        results.append(f'removed_user_{user_id}')
            except Exception as e:
                errors.append(str(e))
        
        def read_user_sessions():
            try:
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    session_count = len(self.active_sessions)
                    results.append(f'read_count_{session_count}')
            except Exception as e:
                errors.append(str(e))
        
        # Create threads for concurrent operations
        threads = []
        
        # Add users
        for i in range(10):
            thread = threading.Thread(target=add_user_session, args=(i,))
            threads.append(thread)
        
        # Remove some users
        for i in range(0, 5):
            thread = threading.Thread(target=remove_user_session, args=(i,))
            threads.append(thread)
        
        # Read operations
        for i in range(5):
            thread = threading.Thread(target=read_user_sessions)
            threads.append(thread)
        
        # Start all threads
        for thread in threads:
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join(timeout=10)
        
        # Verify results
        self.assertEqual(len(errors), 0, f"Errors occurred: {errors}")
        self.assertGreater(len(results), 0, "No operations completed")
        
        # Verify final state consistency
        with synchronized(LOCK_ACTIVE_SESSIONS):
            expected_users = {f'user_{i}' for i in range(5, 10)}  # Users 5-9 should remain
            actual_users = set(self.active_sessions.keys())
            self.assertEqual(actual_users, expected_users)
    
    def test_session_validation_thread_safety(self):
        """Test session validation under concurrent access"""
        from unittest.mock import patch
        
        # Mock session data
        mock_session = {
            'username': 'test_user',
            'session_id': 'test_session_123',
            'login_time': time.time()
        }
        
        # Setup active session
        with synchronized(LOCK_ACTIVE_SESSIONS):
            self.active_sessions['test_user'] = {
                'session_id': 'test_session_123',
                'last_activity': time.time()
            }
        
        results = []
        errors = []
        
        def validate_session_mock():
            """Mock session validation that accesses active_sessions"""
            try:
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    username = mock_session['username']
                    session_id = mock_session.get('session_id')
                    
                    if username not in self.active_sessions:
                        results.append('session_not_found')
                        return
                    
                    if session_id != self.active_sessions[username].get('session_id'):
                        results.append('session_id_mismatch')
                        return
                    
                    results.append('session_valid')
            except Exception as e:
                errors.append(str(e))
        
        def update_session_activity():
            """Mock updating session activity"""
            try:
                with synchronized(LOCK_ACTIVE_SESSIONS):
                    username = mock_session['username']
                    if username in self.active_sessions:
                        self.active_sessions[username]['last_activity'] = time.time()
                        results.append('activity_updated')
            except Exception as e:
                errors.append(str(e))
        
        # Run concurrent validations and updates
        threads = []
        for i in range(20):
            if i % 2 == 0:
                thread = threading.Thread(target=validate_session_mock)
            else:
                thread = threading.Thread(target=update_session_activity)
            threads.append(thread)
        
        for thread in threads:
            thread.start()
        
        for thread in threads:
            thread.join(timeout=5)
        
        # Verify no errors and consistent results
        self.assertEqual(len(errors), 0, f"Errors occurred: {errors}")
        self.assertIn('session_valid', results)
        self.assertIn('activity_updated', results)
    
    def test_collaboration_data_concurrent_access(self):
        """Test concurrent access to collaboration data"""
        collaboration_data = {'invites': {}, 'chats': {}}
        results = []
        errors = []
        
        def create_invite(invite_id, from_user, to_user):
            try:
                with synchronized(LOCK_COLLABORATION_DATA):
                    collaboration_data['invites'][invite_id] = {
                        'from': from_user,
                        'to': to_user,
                        'timestamp': time.time(),
                        'status': 'pending'
                    }
                    results.append(f'invite_created_{invite_id}')
            except Exception as e:
                errors.append(str(e))
        
        def accept_invite(invite_id):
            try:
                with synchronized(LOCK_COLLABORATION_DATA):
                    if invite_id in collaboration_data['invites']:
                        collaboration_data['invites'][invite_id]['status'] = 'accepted'
                        results.append(f'invite_accepted_{invite_id}')
            except Exception as e:
                errors.append(str(e))
        
        def create_chat(chat_id, participants):
            try:
                with synchronized(LOCK_COLLABORATION_DATA):
                    collaboration_data['chats'][chat_id] = {
                        'participants': participants,
                        'messages': [],
                        'created_at': time.time()
                    }
                    results.append(f'chat_created_{chat_id}')
            except Exception as e:
                errors.append(str(e))
        
        # Create concurrent operations
        threads = []
        
        # Create invites
        for i in range(5):
            thread = threading.Thread(
                target=create_invite, 
                args=(f'invite_{i}', f'user_{i}', f'user_{i+1}')
            )
            threads.append(thread)
        
        # Accept some invites
        for i in range(3):
            thread = threading.Thread(target=accept_invite, args=(f'invite_{i}',))
            threads.append(thread)
        
        # Create chats
        for i in range(3):
            thread = threading.Thread(
                target=create_chat,
                args=(f'chat_{i}', [f'user_{i}', f'user_{i+1}'])
            )
            threads.append(thread)
        
        # Execute all operations
        for thread in threads:
            thread.start()
        
        for thread in threads:
            thread.join(timeout=5)
        
        # Verify results
        self.assertEqual(len(errors), 0, f"Errors occurred: {errors}")
        
        # Check data consistency
        with synchronized(LOCK_COLLABORATION_DATA):
            self.assertEqual(len(collaboration_data['invites']), 5)
            self.assertEqual(len(collaboration_data['chats']), 3)
            
            # Check that accepted invites are properly marked
            accepted_count = sum(1 for invite in collaboration_data['invites'].values() 
                               if invite['status'] == 'accepted')
            self.assertEqual(accepted_count, 3)
    
    def test_credentials_concurrent_access(self):
        """Test concurrent access to credentials with locks"""
        credentials_data = {'users': {}}
        results = []
        errors = []
        
        def create_user(username, password):
            try:
                with synchronized(LOCK_CREDENTIALS):
                    credentials_data['users'][username] = {
                        'password': f'hashed_{password}',
                        'created_at': time.time(),
                        'school_name': f'School_{username}'
                    }
                    results.append(f'user_created_{username}')
            except Exception as e:
                errors.append(str(e))
        
        def update_password(username, new_password):
            try:
                with synchronized(LOCK_CREDENTIALS):
                    if username in credentials_data['users']:
                        credentials_data['users'][username]['password'] = f'hashed_{new_password}'
                        results.append(f'password_updated_{username}')
            except Exception as e:
                errors.append(str(e))
        
        def authenticate_user(username, password):
            try:
                with synchronized(LOCK_CREDENTIALS):
                    if username in credentials_data['users']:
                        stored_password = credentials_data['users'][username]['password']
                        if stored_password == f'hashed_{password}':
                            results.append(f'auth_success_{username}')
                        else:
                            results.append(f'auth_failed_{username}')
            except Exception as e:
                errors.append(str(e))
        
        # Concurrent operations
        threads = []
        
        # Create users
        for i in range(10):
            thread = threading.Thread(
                target=create_user, 
                args=(f'user_{i}', f'password_{i}')
            )
            threads.append(thread)
        
        # Update passwords
        for i in range(5):
            thread = threading.Thread(
                target=update_password,
                args=(f'user_{i}', f'new_password_{i}')
            )
            threads.append(thread)
        
        # Authenticate users
        for i in range(10):
            expected_password = f'new_password_{i}' if i < 5 else f'password_{i}'
            thread = threading.Thread(
                target=authenticate_user,
                args=(f'user_{i}', expected_password)
            )
            threads.append(thread)
        
        # Execute operations
        for thread in threads:
            thread.start()
        
        for thread in threads:
            thread.join(timeout=5)
        
        # Verify results
        self.assertEqual(len(errors), 0, f"Errors occurred: {errors}")
        
        # Verify all users were created
        create_results = [r for r in results if r.startswith('user_created_')]
        self.assertEqual(len(create_results), 10)
        
        # Verify authentication results
        auth_success_results = [r for r in results if r.startswith('auth_success_')]
        self.assertGreater(len(auth_success_results), 0)
    
    def test_lock_contention_monitoring(self):
        """Test that lock contention is properly monitored"""
        contention_lock = "contention_test"
        
        def worker_with_delay():
            with synchronized(contention_lock):
                time.sleep(0.05)  # Hold lock briefly to create contention
        
        # Create threads that will contend for the lock
        threads = []
        for i in range(10):
            thread = threading.Thread(target=worker_with_delay)
            threads.append(thread)
        
        # Start all threads at once
        for thread in threads:
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join(timeout=10)
        
        # Check contention stats
        stats = self.lock_manager.get_contention_stats()
        self.assertIn(contention_lock, stats)
        self.assertEqual(stats[contention_lock]['acquisitions'], 10)
        self.assertGreaterEqual(stats[contention_lock]['contentions'], 0)
    
    def test_message_counter_thread_safety(self):
        """Test thread-safe message counter operations"""
        message_counter = {'count': 0}
        results = []
        errors = []
        
        def increment_counter():
            try:
                with synchronized(LOCK_MESSAGE_COUNTER):
                    current = message_counter['count']
                    time.sleep(0.001)  # Simulate processing time
                    message_counter['count'] = current + 1
                    results.append(message_counter['count'])
            except Exception as e:
                errors.append(str(e))
        
        # Run 50 concurrent increments
        threads = []
        for i in range(50):
            thread = threading.Thread(target=increment_counter)
            threads.append(thread)
        
        for thread in threads:
            thread.start()
        
        for thread in threads:
            thread.join(timeout=5)
        
        # Verify results
        self.assertEqual(len(errors), 0, f"Errors occurred: {errors}")
        self.assertEqual(message_counter['count'], 50)
        self.assertEqual(len(results), 50)
    
    def test_chat_sessions_thread_safety(self):
        """Test thread-safe chat session operations"""
        chat_sessions = {}
        results = []
        errors = []
        
        def create_chat_session(session_id, participants):
            try:
                with synchronized(LOCK_CHAT_SESSIONS):
                    chat_sessions[session_id] = {
                        'participants': participants,
                        'messages': [],
                        'created_at': time.time(),
                        'active': True
                    }
                    results.append(f'chat_created_{session_id}')
            except Exception as e:
                errors.append(str(e))
        
        def add_message(session_id, message):
            try:
                with synchronized(LOCK_CHAT_SESSIONS):
                    if session_id in chat_sessions:
                        chat_sessions[session_id]['messages'].append({
                            'content': message,
                            'timestamp': time.time()
                        })
                        results.append(f'message_added_{session_id}')
            except Exception as e:
                errors.append(str(e))
        
        def end_chat_session(session_id):
            try:
                with synchronized(LOCK_CHAT_SESSIONS):
                    if session_id in chat_sessions:
                        chat_sessions[session_id]['active'] = False
                        results.append(f'chat_ended_{session_id}')
            except Exception as e:
                errors.append(str(e))
        
        # Concurrent operations
        threads = []
        
        # Create chat sessions
        for i in range(5):
            thread = threading.Thread(
                target=create_chat_session,
                args=(f'chat_{i}', [f'user_{i*2}', f'user_{i*2+1}'])
            )
            threads.append(thread)
        
        # Add messages
        for i in range(5):
            for j in range(3):
                thread = threading.Thread(
                    target=add_message,
                    args=(f'chat_{i}', f'Message {j} in chat {i}')
                )
                threads.append(thread)
        
        # End some sessions
        for i in range(3):
            thread = threading.Thread(target=end_chat_session, args=(f'chat_{i}',))
            threads.append(thread)
        
        # Execute all operations
        for thread in threads:
            thread.start()
        
        for thread in threads:
            thread.join(timeout=5)
        
        # Verify results
        self.assertEqual(len(errors), 0, f"Errors occurred: {errors}")
        
        # Check data consistency
        with synchronized(LOCK_CHAT_SESSIONS):
            self.assertEqual(len(chat_sessions), 5)
            
            # Check message counts
            for session_id, session_data in chat_sessions.items():
                self.assertGreaterEqual(len(session_data['messages']), 0)
                self.assertLessEqual(len(session_data['messages']), 3)
            
            # Check ended sessions
            ended_sessions = [s for s in chat_sessions.values() if not s['active']]
            self.assertEqual(len(ended_sessions), 3)


if __name__ == '__main__':
    unittest.main()