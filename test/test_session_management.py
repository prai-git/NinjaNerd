#!/usr/bin/env python3

"""
Test script to verify the enhanced session management functionality works correctly.
This test ensures the new @require_login decorator, session validation, and timeout features work properly.
"""

import sys
import os
import json
import time
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

# Add the project directory to the path
sys.path.insert(0, '/Users/praveenrai/Personal/Krishang/NinjaNerd')

from app import app, validate_session, active_sessions
from werkzeug.security import generate_password_hash

# Test data directory (separate from main app to avoid data corruption)
TEST_DATA_DIR = '/Users/praveenrai/Personal/Krishang/NinjaNerd/test'
TEST_CREDENTIALS_FILE = os.path.join(TEST_DATA_DIR, 'test_credentials.json')

def setup_test_credentials():
    """Setup test credentials file"""
    test_credentials = {
        "testuser@test.com": {
            "password": generate_password_hash("testpassword"),
            "school_name": "Test School",
            "history": [],
            "statistics": {
                "questions_attempted": 0,
                "topics_covered": [],
                "last_login": None
            }
        }
    }
    
    with open(TEST_CREDENTIALS_FILE, 'w') as f:
        json.dump(test_credentials, f, indent=2)

def cleanup_test_files():
    """Clean up test files"""
    if os.path.exists(TEST_CREDENTIALS_FILE):
        os.remove(TEST_CREDENTIALS_FILE)

def test_session_validation_function():
    """Test the validate_session function"""
    print("Testing session validation function...")
    
    # Test 1: No session context - should handle gracefully
    with app.test_request_context():
        is_valid, message = validate_session()
        assert not is_valid, "Should return False for no session"
        assert "No active session found" in message
    
    print("✅ Basic session validation test passed!")

def test_require_login_decorator():
    """Test the @require_login decorator"""
    print("Testing @require_login decorator...")
    
    setup_test_credentials()
    
    # Mock the database operations
    mock_credentials = {
        "testuser@test.com": {
            "password": generate_password_hash("testpassword"),
            "school_name": "Test School",
            "history": [],
            "statistics": {
                "questions_attempted": 0,
                "topics_covered": [],
                "last_login": None
            }
        }
    }
    
    # Mock the credentials file path and database operations
    with patch('app.CREDENTIALS_FILE', TEST_CREDENTIALS_FILE):
        with patch('app.load_credentials', return_value=mock_credentials):
            with patch('app.get_app_db') as mock_db:
                # Mock the database wrapper
                mock_db_instance = MagicMock()
                mock_db.return_value = mock_db_instance
                mock_db_instance.verify_user.return_value = True
                mock_db_instance.update_user_login_time.return_value = True
                
                with app.test_client() as client:
                    # Clear active sessions for clean test
                    active_sessions.clear()
                    
                    # Test 1: Access protected route without login
                    response = client.get('/about')
                    assert response.status_code == 302, "Should redirect when not logged in"
                    assert '/login' in response.headers.get('Location', ''), "Should redirect to login page"
                    
                    # Test 2: Login and access protected route
                    response = client.post('/login', data={
                        'username': 'testuser@test.com',
                        'password': 'testpassword'
                    })
                    assert response.status_code == 302, "Should redirect after successful login"
                    
                    # Test 3: Access protected route after login
                    response = client.get('/about')
                    assert response.status_code == 200, "Should allow access after login"
                    
                    # Test 4: Access other protected routes (avoiding LLM-dependent routes)
                    protected_routes = [
                        '/topics/5',
                        '/games/5',
                        '/games/play/tejas-thrust'
                    ]
                    
                    for route in protected_routes:
                        response = client.get(route)
                        # These should either return 200 or redirect to valid pages (not login)
                        assert response.status_code in [200, 302], f"Route {route} should be accessible after login"
                        if response.status_code == 302:
                            location = response.headers.get('Location', '')
                            assert '/login' not in location, f"Route {route} should not redirect to login after authentication"
    
    cleanup_test_files()
    print("✅ @require_login decorator test passed!")

def test_session_timeout_configuration():
    """Test session timeout configuration"""
    print("Testing session timeout configuration...")
    
    # Check that the configuration is set correctly
    assert app.config.get('PERMANENT_SESSION_LIFETIME') == timedelta(minutes=30), \
        "PERMANENT_SESSION_LIFETIME should be set to 30 minutes"
    
    print("✅ Session timeout configuration test passed!")

def test_check_session_endpoint():
    """Test the enhanced /check_session endpoint"""
    print("Testing /check_session endpoint...")
    
    setup_test_credentials()
    
    # Mock the database operations  
    mock_credentials = {
        "testuser@test.com": {
            "password": generate_password_hash("testpassword"),
            "school_name": "Test School",
            "history": [],
            "statistics": {
                "questions_attempted": 0,
                "topics_covered": [],
                "last_login": None
            }
        }
    }
    
    with patch('app.CREDENTIALS_FILE', TEST_CREDENTIALS_FILE):
        with patch('app.load_credentials', return_value=mock_credentials):
            with patch('app.get_app_db') as mock_db:
                # Mock the database wrapper
                mock_db_instance = MagicMock()
                mock_db.return_value = mock_db_instance
                mock_db_instance.verify_user.return_value = True
                mock_db_instance.update_user_login_time.return_value = True
                
                with app.test_client() as client:
                    # Clear active sessions for clean test
                    active_sessions.clear()
                    
                    # Test 1: Check session without login
                    response = client.get('/check_session')
                    assert response.status_code == 200
                    data = json.loads(response.data)
                    assert not data['valid'], "Should return valid=False when not logged in"
                    assert 'message' in data, "Should include message in response"
                    
                    # Test 2: Login and check session
                    client.post('/login', data={
                        'username': 'testuser@test.com',
                        'password': 'testpassword'
                    })
            
            response = client.get('/check_session')
            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['valid'], "Should return valid=True after login"
            assert data['message'] == 'Session is valid', "Should return success message"
    
    cleanup_test_files()
    print("✅ /check_session endpoint test passed!")

def test_login_session_setup():
    """Test that login properly sets up permanent sessions and login_time"""
    print("Testing login session setup...")
    
    setup_test_credentials()
    
    # Mock the database operations
    mock_credentials = {
        "testuser@test.com": {
            "password": generate_password_hash("testpassword"),
            "school_name": "Test School",
            "history": [],
            "statistics": {
                "questions_attempted": 0,
                "topics_covered": [],
                "last_login": None
            }
        }
    }
    
    with patch('app.CREDENTIALS_FILE', TEST_CREDENTIALS_FILE):
        with patch('app.load_credentials', return_value=mock_credentials):
            with patch('app.get_app_db') as mock_db:
                # Mock the database wrapper
                mock_db_instance = MagicMock()
                mock_db.return_value = mock_db_instance
                mock_db_instance.verify_user.return_value = True
                mock_db_instance.update_user_login_time.return_value = True
                
                with app.test_client() as client:
                    # Clear active sessions for clean test
                    active_sessions.clear()
                    
                    # Test login
                    response = client.post('/login', data={
                        'username': 'testuser@test.com',
                        'password': 'testpassword'
                    })
            assert response.status_code == 302, "Should redirect after login"
            
            # Check session data
            with client.session_transaction() as sess:
                assert 'username' in sess, "Username should be in session"
                assert 'session_id' in sess, "Session ID should be in session"
                assert 'login_time' in sess, "Login time should be in session"
                assert sess.permanent, "Session should be permanent"
                
                # Verify login_time is recent
                login_time = datetime.fromisoformat(sess['login_time'])
                assert datetime.now() - login_time < timedelta(minutes=1), \
                    "Login time should be recent"
    
    cleanup_test_files()
    print("✅ Login session setup test passed!")

def test_session_cleanup_on_invalid_session():
    """Test that invalid sessions are properly cleaned up"""
    print("Testing session cleanup on invalid session...")
    
    with app.test_client() as client:
        # Setup invalid session manually
        username = "testuser@test.com"
        with client.session_transaction() as sess:
            sess['username'] = username
            sess['session_id'] = "invalid-session"
            sess['login_time'] = datetime.now().isoformat()
        
        # Don't add to active_sessions to simulate mismatch
        
        # Access protected route
        response = client.get('/about')
        assert response.status_code == 302, "Should redirect for invalid session"
        
        # Check that user was redirected to login (indicating session was invalid)
        location = response.headers.get('Location', '')
        assert '/login' in location, "Should redirect to login page for invalid session"
        
        # Check that active_sessions was cleaned up
        assert username not in active_sessions, "User should be removed from active_sessions"
    
    print("✅ Session cleanup test passed!")

def run_all_tests():
    """Run all session management tests"""
    print("🔒 Starting Session Management Tests")
    print("=" * 50)
    
    try:
        test_session_validation_function()
        test_require_login_decorator()
        test_session_timeout_configuration()
        test_check_session_endpoint()
        test_login_session_setup()
        test_session_cleanup_on_invalid_session()
        
        print("=" * 50)
        print("✅ ALL SESSION MANAGEMENT TESTS PASSED!")
        print("🔒 Session management enhancements are working correctly.")
        
    except AssertionError as e:
        print(f"❌ Test failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False
    
    return True

if __name__ == "__main__":
    # Configure app for testing
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    
    success = run_all_tests()
    sys.exit(0 if success else 1)
