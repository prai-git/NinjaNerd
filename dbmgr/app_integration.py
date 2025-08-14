"""
Integration wrapper for seamless DBManager integration with app.py.

This module provides drop-in replacements for existing JSON operations
while maintaining backward compatibility.
"""

from typing import Dict, Any, Optional
from dbmgr import DBManager
from dbmgr.exceptions import DatabaseException
import logging


class AppDBWrapper:
    """
    Wrapper class to seamlessly integrate DBManager with existing app.py code.
    
    Provides drop-in replacements for load_credentials(), save_credentials(),
    load_collaboration_data(), and save_collaboration_data() functions.
    """
    
    def __init__(self, data_dir: str = 'data', backup_dir: str = 'backups'):
        """Initialize the database wrapper."""
        self.logger = logging.getLogger(__name__)
        
        try:
            self.db_manager = DBManager(
                data_dir=data_dir,
                backup_dir=backup_dir,
                max_workers=10,
                operation_timeout=30,
                session_timeout_minutes=30
            )
            self.logger.info("AppDBWrapper initialized successfully")
        except Exception as e:
            self.logger.error(f"Failed to initialize DBManager: {e}")
            raise
    
    def load_credentials(self) -> Dict[str, Any]:
        """
        Load credentials data. Drop-in replacement for the original function.
        
        Returns:
            Dict containing all user credentials
        """
        try:
            return self.db_manager.get_all_users()
        except Exception as e:
            self.logger.error(f"Error loading credentials: {e}")
            # Return empty dict to maintain compatibility
            return {}
    
    def save_credentials(self, data: Dict[str, Any]) -> None:
        """
        Save credentials data. Drop-in replacement for the original function.
        
        Args:
            data: Complete credentials dictionary to save
        """
        try:
            # Get current users to detect changes
            current_users = self.db_manager.get_all_users()
            
            # Handle deletions (users that existed but are no longer in data)
            for username in current_users:
                if username not in data:
                    self.db_manager.delete_user(username)
            
            # Handle additions and updates
            for username, user_data in data.items():
                if username in current_users:
                    # Update existing user
                    self.db_manager.update_user(username, user_data)
                else:
                    # Create new user
                    self.db_manager.create_user(username, user_data)
                    
        except Exception as e:
            self.logger.error(f"Error saving credentials: {e}")
            raise
    
    def load_collaboration_data(self) -> Dict[str, Any]:
        """
        Load collaboration data. Drop-in replacement for the original function.
        
        Returns:
            Dict containing collaboration data
        """
        try:
            return self.db_manager.get_collaboration_data()
        except Exception as e:
            self.logger.error(f"Error loading collaboration data: {e}")
            # Return default structure to maintain compatibility
            return {
                "invites": {},
                "chat_sessions": {},
                "message_counter": 0
            }
    
    def save_collaboration_data(self, data: Dict[str, Any]) -> None:
        """
        Save collaboration data. Drop-in replacement for the original function.
        
        Args:
            data: Complete collaboration dictionary to save
        """
        try:
            self.db_manager.save_collaboration_data(data)
        except Exception as e:
            self.logger.error(f"Error saving collaboration data: {e}")
            raise
    
    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific user's data.
        
        Args:
            username: Username to retrieve
            
        Returns:
            User data dict or None if not found
        """
        try:
            return self.db_manager.get_user(username)
        except Exception as e:
            self.logger.error(f"Error getting user {username}: {e}")
            return None
    
    def authenticate_user(self, username: str, password: str) -> bool:
        """
        Authenticate a user.
        
        Args:
            username: Username
            password: Plain text password
            
        Returns:
            True if authentication successful
        """
        try:
            return self.db_manager.authenticate_user(username, password)
        except Exception as e:
            self.logger.error(f"Error authenticating user {username}: {e}")
            return False
    
    def add_user_history(self, username: str, history_entry: Dict[str, Any]) -> bool:
        """
        Add an entry to user's history.
        
        Args:
            username: Username
            history_entry: History entry to add
            
        Returns:
            True if successful
        """
        try:
            return self.db_manager.update_user_history(username, history_entry)
        except Exception as e:
            self.logger.error(f"Error adding history for user {username}: {e}")
            return False
    
    def create_session(self, username: str, operation_type: str = "web_session") -> str:
        """
        Create a database session for a user.
        
        Args:
            username: Username
            operation_type: Type of operation
            
        Returns:
            Session ID or None if failed
        """
        try:
            return self.db_manager.create_session(username, operation_type)
        except Exception as e:
            self.logger.error(f"Error creating session for user {username}: {e}")
            return None
    
    def get_system_status(self) -> Dict[str, Any]:
        """
        Get system status information.
        
        Returns:
            Dict containing system status
        """
        try:
            return self.db_manager.get_system_status()
        except Exception as e:
            self.logger.error(f"Error getting system status: {e}")
            return {"error": str(e)}
    
    def create_backup(self) -> Dict[str, str]:
        """
        Create manual backup.
        
        Returns:
            Dict mapping filenames to backup paths
        """
        try:
            return self.db_manager.create_manual_backup()
        except Exception as e:
            self.logger.error(f"Error creating backup: {e}")
            return {"error": str(e)}
    
    def shutdown(self) -> None:
        """Shutdown the database manager."""
        try:
            self.db_manager.shutdown()
            self.logger.info("AppDBWrapper shutdown successfully")
        except Exception as e:
            self.logger.error(f"Error during shutdown: {e}")


# Global instance that will be initialized in app.py
app_db = None


def initialize_app_db(data_dir: str = 'data', backup_dir: str = 'backups') -> AppDBWrapper:
    """
    Initialize the global app database wrapper.
    
    Args:
        data_dir: Directory containing data files
        backup_dir: Directory for backup files
        
    Returns:
        AppDBWrapper instance
    """
    global app_db
    app_db = AppDBWrapper(data_dir, backup_dir)
    return app_db


def get_app_db() -> AppDBWrapper:
    """
    Get the global app database wrapper.
    
    Returns:
        AppDBWrapper instance
        
    Raises:
        RuntimeError: If app_db hasn't been initialized
    """
    global app_db
    if app_db is None:
        raise RuntimeError("AppDBWrapper not initialized. Call initialize_app_db() first.")
    return app_db
