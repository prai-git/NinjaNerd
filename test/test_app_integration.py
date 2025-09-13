"""
Integration test for app.py with DBManager.

This test verifies that the DBManager integration works correctly
without breaking existing functionality.
"""

import os
import sys
import json
import tempfile
import shutil
import logging
from unittest.mock import patch, MagicMock

# Add the project root to the path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_dbmanager_integration():
    """Test DBManager integration with app.py"""
    
    # Create temporary directories for testing
    temp_dir = tempfile.mkdtemp()
    data_dir = os.path.join(temp_dir, 'data')
    backup_dir = os.path.join(temp_dir, 'backups')
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(backup_dir, exist_ok=True)
    
    try:
        # Create original data files
        credentials_file = os.path.join(data_dir, 'Credentials.json')
        collaboration_file = os.path.join(data_dir, 'Collaboration.json')
        
        # Sample credentials data
        credentials_data = {
            "test@example.com": {
                "password": "hashed_password",
                "school_name": "Test School",
                "history": [],
                "statistics": {
                    "questions_attempted": 5,
                    "topics_covered": ["math"],
                    "last_login": "2024-01-01"
                }
            },
            "user2@example.com": {
                "password": "hashed_password2",
                "school_name": "Test School 2",
                "history": [{"question": "What is 2+2?", "answer": "4"}],
                "statistics": {
                    "questions_attempted": 10,
                    "topics_covered": ["math", "science"],
                    "last_login": "2024-01-02"
                }
            }
        }
        
        # Sample collaboration data
        collaboration_data = {
            "invites": {
                "invite_123": {
                    "from_user": "test@example.com",
                    "to_user": "user2@example.com",
                    "timestamp": "2024-01-01T10:00:00",
                    "status": "pending"
                }
            },
            "chat_sessions": {
                "session_456": {
                    "user1": "test@example.com",
                    "user2": "user2@example.com",
                    "messages": [
                        {"from": "test@example.com", "message": "Hello!", "timestamp": "2024-01-01T10:05:00"}
                    ],
                    "active": True
                }
            },
            "message_counter": 1
        }
        
        # Write test data files
        with open(credentials_file, 'w') as f:
            json.dump(credentials_data, f, indent=2)
        with open(collaboration_file, 'w') as f:
            json.dump(collaboration_data, f, indent=2)
        
        # Mock Flask app and environment
        with patch.dict(os.environ, {'PYTHONPATH': project_root}):
            # Import and initialize DBManager integration
            from dbmgr.app_integration import initialize_app_db, get_app_db
            
            # Initialize with test directories
            logger.info("Initializing DBManager with test data...")
            app_db = initialize_app_db(data_dir, backup_dir)
            
            # Test 1: Load existing credentials
            logger.info("Test 1: Loading credentials...")
            loaded_credentials = app_db.load_credentials()
            assert "test@example.com" in loaded_credentials
            assert "user2@example.com" in loaded_credentials
            assert loaded_credentials["test@example.com"]["school_name"] == "Test School"
            logger.info("✅ Credentials loaded successfully")
            
            # Test 2: Load existing collaboration data
            logger.info("Test 2: Loading collaboration data...")
            loaded_collaboration = app_db.load_collaboration_data()
            assert "invites" in loaded_collaboration
            assert "chat_sessions" in loaded_collaboration
            assert "invite_123" in loaded_collaboration["invites"]
            assert "session_456" in loaded_collaboration["chat_sessions"]
            logger.info("✅ Collaboration data loaded successfully")
            
            # Test 3: Add new user
            logger.info("Test 3: Adding new user...")
            new_user_data = {
                "password": "new_password_hash",
                "school_name": "New School",
                "history": [],
                "statistics": {
                    "questions_attempted": 0,
                    "topics_covered": [],
                    "last_login": None
                }
            }
            loaded_credentials["newuser@example.com"] = new_user_data
            app_db.save_credentials(loaded_credentials)
            
            # Verify new user was added
            updated_credentials = app_db.load_credentials()
            assert "newuser@example.com" in updated_credentials
            assert updated_credentials["newuser@example.com"]["school_name"] == "New School"
            logger.info("✅ New user added successfully")
            
            # Test 4: Update user data
            logger.info("Test 4: Updating user data...")
            updated_credentials["test@example.com"]["statistics"]["questions_attempted"] = 15
            updated_credentials["test@example.com"]["statistics"]["topics_covered"].append("geography")
            app_db.save_credentials(updated_credentials)
            
            # Verify update
            final_credentials = app_db.load_credentials()
            assert final_credentials["test@example.com"]["statistics"]["questions_attempted"] == 15
            assert "geography" in final_credentials["test@example.com"]["statistics"]["topics_covered"]
            logger.info("✅ User data updated successfully")
            
            # Test 5: Update collaboration data
            logger.info("Test 5: Updating collaboration data...")
            loaded_collaboration["invites"]["invite_456"] = {
                "from_user": "newuser@example.com",
                "to_user": "test@example.com",
                "timestamp": "2024-01-02T15:00:00",
                "status": "accepted"
            }
            loaded_collaboration["message_counter"] = 2
            app_db.save_collaboration_data(loaded_collaboration)
            
            # Verify collaboration update
            final_collaboration = app_db.load_collaboration_data()
            assert "invite_456" in final_collaboration["invites"]
            assert final_collaboration["message_counter"] == 2
            assert final_collaboration["invites"]["invite_456"]["status"] == "accepted"
            logger.info("✅ Collaboration data updated successfully")
            
            # Test 6: Direct database methods
            logger.info("Test 6: Testing direct database methods...")
            
            # Test user authentication
            user_data = app_db.get_user("test@example.com")
            assert user_data is not None
            assert user_data["school_name"] == "Test School"
            
            # Test system status
            status = app_db.get_system_status()
            assert "timestamp" in status
            assert "queue_manager" in status
            assert "session_manager" in status
            
            logger.info("✅ Direct database methods working")
            
            # Test 7: Backup functionality
            logger.info("Test 7: Testing backup functionality...")
            backup_result = app_db.create_backup()
            assert "Credentials.json" in backup_result or "error" not in backup_result
            logger.info("✅ Backup functionality working")
            
            # Shutdown properly
            app_db.shutdown()
            logger.info("✅ DBManager shutdown successfully")
            
        logger.info("🎉 All integration tests passed!")
        # Test passed - no need to return value in pytest
        
    except Exception as e:
        logger.error(f"❌ Integration test failed: {e}")
        import traceback
        traceback.print_exc()
        raise  # Re-raise the exception for pytest to catch
        
    finally:
        # Clean up temporary directory
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Could not clean up temp directory: {e}")


def test_app_compatibility():
    """Test that app.py functions work with DBManager integration"""
    
    logger.info("Testing app.py compatibility...")
    
    # Create temporary directories
    temp_dir = tempfile.mkdtemp()
    data_dir = os.path.join(temp_dir, 'data')
    backup_dir = os.path.join(temp_dir, 'backups')
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(backup_dir, exist_ok=True)
    
    try:
        # Create test credential files
        credentials_file = os.path.join(data_dir, 'Credentials.json')
        collaboration_file = os.path.join(data_dir, 'Collaboration.json')
        
        credentials_data = {
            "admin@gmail.com": {
                "password": "admin_hash",
                "school_name": "NinjaNerd Academy",
                "history": [],
                "statistics": {
                    "questions_attempted": 0,
                    "topics_covered": [],
                    "last_login": None
                }
            }
        }
        
        collaboration_data = {
            "invites": {},
            "chat_sessions": {},
            "message_counter": 0
        }
        
        with open(credentials_file, 'w') as f:
            json.dump(credentials_data, f, indent=2)
        with open(collaboration_file, 'w') as f:
            json.dump(collaboration_data, f, indent=2)
        
        # Mock Flask app components
        mock_app = MagicMock()
        mock_app.logger = logger
        
        # Patch app module components
        with patch.dict('sys.modules'):
            # Import integration after mocking
            from dbmgr.app_integration import initialize_app_db, get_app_db
            
            # Initialize DBManager
            initialize_app_db(data_dir, backup_dir)
            
            # Test that the wrapper functions work as expected
            db = get_app_db()
            
            # Test load_credentials
            creds = db.load_credentials()
            assert "admin@gmail.com" in creds
            
            # Test save_credentials
            creds["newuser@test.com"] = {
                "password": "test_hash",
                "school_name": "Test School",
                "history": [],
                "statistics": {
                    "questions_attempted": 0,
                    "topics_covered": [],
                    "last_login": None
                }
            }
            db.save_credentials(creds)
            
            # Verify save worked
            updated_creds = db.load_credentials()
            assert "newuser@test.com" in updated_creds
            
            # Test collaboration functions
            collab = db.load_collaboration_data()
            assert "invites" in collab
            
            collab["test_field"] = "test_value"
            db.save_collaboration_data(collab)
            
            # Verify collaboration save worked
            updated_collab = db.load_collaboration_data()
            assert updated_collab.get("test_field") == "test_value"
            
            db.shutdown()
                
        logger.info("✅ App compatibility test passed!")
        # Test passed - no need to return value in pytest
        
    except Exception as e:
        logger.error(f"❌ App compatibility test failed: {e}")
        import traceback
        traceback.print_exc()
        raise  # Re-raise the exception for pytest to catch
        
    finally:
        # Clean up
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Could not clean up temp directory: {e}")


if __name__ == "__main__":
    logger.info("🚀 Starting DBManager integration tests...")
    
    success1 = test_dbmanager_integration()
    success2 = test_app_compatibility()
    
    if success1 and success2:
        logger.info("🎉 All tests passed! DBManager integration is ready.")
        exit(0)
    else:
        logger.error("❌ Some tests failed. Please check the output above.")
        exit(1)
