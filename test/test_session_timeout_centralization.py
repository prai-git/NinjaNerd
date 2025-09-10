#!/usr/bin/env python3
"""
Test suite for centralized session timeout and cleanup functionality.

Tests that session timeout logic is centralized and background cleanup works correctly.
"""

import sys
import os
import pytest
import tempfile
import time
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_session_expiry_constants():
    """Test that session timeout constants are properly defined."""
    from session_storage.session_expiry import SESSION_TIMEOUT_MINUTES, get_session_timeout_minutes
    
    # Verify constant is set
    assert SESSION_TIMEOUT_MINUTES == 30
    assert get_session_timeout_minutes() == 30


def test_is_session_expired():
    """Test the centralized session expiry logic."""
    from session_storage.session_expiry import is_session_expired
    
    now = datetime.now()
    
    # Test valid session (recent login and activity)
    valid_session = {
        'login_time': (now - timedelta(minutes=15)).isoformat(),
        'last_activity': (now - timedelta(minutes=5)).isoformat()
    }
    assert not is_session_expired(valid_session, now)
    
    # Test expired session (old login time)
    expired_login_session = {
        'login_time': (now - timedelta(minutes=35)).isoformat(),
        'last_activity': (now - timedelta(minutes=5)).isoformat()
    }
    assert is_session_expired(expired_login_session, now)
    
    # Test expired session (old last activity)
    expired_activity_session = {
        'login_time': (now - timedelta(minutes=15)).isoformat(),
        'last_activity': (now - timedelta(minutes=35)).isoformat()
    }
    assert is_session_expired(expired_activity_session, now)
    
    # Test session with missing times
    incomplete_session = {'login_time': now.isoformat()}
    assert not is_session_expired(incomplete_session, now)
    
    # Test session with invalid time format
    invalid_session = {
        'login_time': 'invalid-time-format',
        'last_activity': now.isoformat()
    }
    assert is_session_expired(invalid_session, now)


def test_validate_session_uses_centralized_logic():
    """Test that app's validate_session function uses centralized logic."""
    from app import app, validate_session
    from session_storage.session_expiry import SESSION_TIMEOUT_MINUTES
    from flask import session
    
    with app.test_client() as client:
        # Make a request to establish request context
        with app.test_request_context():
            # Test with valid session
            with patch('app.session', {
                'username': 'testuser',
                'session_id': 'test_session_123',
                'login_time': datetime.now().isoformat()
            }):
                with patch('app.active_sessions', {
                    'testuser': {
                        'session_id': 'test_session_123',
                        'last_activity': datetime.now().isoformat()
                    }
                }):
                    is_valid, message = validate_session()
                    assert is_valid is True
                    assert message == "Session is valid"
            
            # Test with expired session
            old_time = (datetime.now() - timedelta(minutes=SESSION_TIMEOUT_MINUTES + 5)).isoformat()
            with patch('app.session', {
                'username': 'testuser',
                'session_id': 'test_session_123',
                'login_time': old_time
            }):
                with patch('app.active_sessions', {
                    'testuser': {
                        'session_id': 'test_session_123',
                        'last_activity': old_time
                    }
                }):
                    is_valid, message = validate_session()
                    assert is_valid is False
                    assert "expired" in message.lower()


def test_cleanup_old_sessions_uses_centralized_logic():
    """Test that cleanup_old_sessions uses centralized expiry logic."""
    from app import cleanup_old_sessions
    from session_storage.session_expiry import SESSION_TIMEOUT_MINUTES
    
    now = datetime.now()
    valid_time = (now - timedelta(minutes=15)).isoformat()
    expired_time = (now - timedelta(minutes=SESSION_TIMEOUT_MINUTES + 5)).isoformat()
    
    # Create mock active sessions
    mock_sessions = {
        'valid_user': {
            'session_id': 'valid_session',
            'last_activity': valid_time,
            'login_time': valid_time
        },
        'expired_user1': {
            'session_id': 'expired_session1',
            'last_activity': expired_time,
            'login_time': valid_time
        },
        'expired_user2': {
            'session_id': 'expired_session2',
            'last_activity': valid_time,
            'login_time': expired_time
        }
    }
    
    with patch('app.active_sessions', mock_sessions):
        cleaned_count = cleanup_old_sessions()
        
        # Should clean 2 expired sessions
        assert cleaned_count == 2
        
        # Only valid user should remain
        assert 'valid_user' in mock_sessions
        assert 'expired_user1' not in mock_sessions
        assert 'expired_user2' not in mock_sessions


def test_session_cleanup_scheduler():
    """Test the session cleanup scheduler functionality."""
    from session_storage.session_expiry import SessionCleanupScheduler
    import threading
    import time
    
    # Create a mock cleanup function
    cleanup_calls = []
    def mock_cleanup():
        cleanup_calls.append(time.time())
        return 1  # Return count of cleaned items
    
    # Create scheduler with very short interval for testing
    scheduler = SessionCleanupScheduler(cleanup_interval_minutes=0.01)  # ~0.6 seconds
    scheduler.register_cleanup_function(mock_cleanup)
    
    try:
        # Start scheduler
        scheduler.start()
        assert scheduler.running is True
        assert scheduler.thread is not None
        assert scheduler.thread.is_alive()
        
        # Wait for at least one cleanup cycle
        time.sleep(1.5)
        
        # Stop scheduler
        scheduler.stop()
        assert scheduler.running is False
        
        # Verify cleanup was called at least once
        assert len(cleanup_calls) >= 1
        
    finally:
        # Ensure scheduler is stopped
        if scheduler.running:
            scheduler.stop()


def test_flask_session_timeout_configuration():
    """Test that Flask app uses centralized session timeout."""
    from app import app
    from session_storage.session_expiry import SESSION_TIMEOUT_MINUTES
    from datetime import timedelta
    
    expected_lifetime = timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    actual_lifetime = app.config['PERMANENT_SESSION_LIFETIME']
    
    assert actual_lifetime == expected_lifetime


def test_session_validator_creation():
    """Test the session validator factory function."""
    from session_storage.session_expiry import create_session_validator
    
    validator = create_session_validator()
    assert callable(validator)
    
    # Test with valid session
    valid_session = {
        'login_time': datetime.now().isoformat(),
        'last_activity': datetime.now().isoformat()
    }
    assert validator(valid_session) is True
    
    # Test with expired session
    old_time = (datetime.now() - timedelta(minutes=35)).isoformat()
    expired_session = {
        'login_time': old_time,
        'last_activity': old_time
    }
    assert validator(expired_session) is False


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
