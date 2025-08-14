"""
Main DBManager class for centralized JSON database operations.

This module provides the primary interface for all database operations
in the NinjaNerd application, with support for concurrent users,
file integrity protection, and comprehensive error handling.
"""

import os
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
from werkzeug.security import check_password_hash, generate_password_hash

from .file_operations import FileOperations
from .queue_manager import QueueManager, Priority
from .session_manager import SessionManager
from .exceptions import (
    DatabaseException,
    FileIntegrityError,
    ConcurrencyError,
    QueueTimeoutError,
    SessionError,
    ValidationError,
    RecoveryError
)


class DBManager:
    """
    Centralized JSON database manager for NinjaNerd.
    
    Features:
    - Thread-safe operations
    - Queue-based write operations
    - File integrity protection
    - Session management
    - Error handling and recovery
    - Support for 1000+ concurrent users
    """
    
    def __init__(self, data_dir: str = 'data', backup_dir: str = 'backups', **kwargs):
        """
        Initialize DBManager.
        
        Args:
            data_dir: Directory containing JSON data files
            backup_dir: Directory for backup files
            **kwargs: Additional configuration options
        """
        self.data_dir = Path(data_dir)
        self.backup_dir = Path(backup_dir)
        
        # Configuration
        self.config = {
            'max_workers': kwargs.get('max_workers', 10),
            'operation_timeout': kwargs.get('operation_timeout', 30),
            'session_timeout_minutes': kwargs.get('session_timeout_minutes', 30),
            'cleanup_interval_minutes': kwargs.get('cleanup_interval_minutes', 5),
            'max_retry_attempts': kwargs.get('max_retry_attempts', 3),
            'retry_delay': kwargs.get('retry_delay', 0.1)
        }
        
        # Initialize components
        self.file_ops = FileOperations(str(self.data_dir), str(self.backup_dir))
        self.queue_manager = QueueManager(
            max_workers=self.config['max_workers'],
            timeout=self.config['operation_timeout']
        )
        self.session_manager = SessionManager(
            session_timeout_minutes=self.config['session_timeout_minutes'],
            cleanup_interval_minutes=self.config['cleanup_interval_minutes']
        )
        
        # File paths
        self.credentials_file = 'Credentials.json'
        self.collaboration_file = 'Collaboration.json'
        
        # Initialize logger
        self._logger = logging.getLogger(__name__)
        
        # Initialize databases if they don't exist
        self._initialize_databases()
        
        self._logger.info("DBManager initialized successfully")
    
    # ===============================
    # Credentials Operations
    # ===============================
    
    def get_user(self, username: str, session_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get user data by username.
        
        Args:
            username: Username to retrieve
            session_id: Optional session ID for tracking
            
        Returns:
            User data dictionary or None if not found
        """
        def operation():
            credentials = self.file_ops.atomic_read_json(self.credentials_file)
            return credentials.get(username)
        
        return self._execute_read_operation(operation, session_id, f"get_user:{username}")
    
    def get_all_users(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all users data.
        
        Args:
            session_id: Optional session ID for tracking
            
        Returns:
            All users data
        """
        def operation():
            return self.file_ops.atomic_read_json(self.credentials_file)
        
        return self._execute_read_operation(operation, session_id, "get_all_users")
    
    def create_user(self, username: str, user_data: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Create a new user.
        
        Args:
            username: Username for the new user
            user_data: User data dictionary
            session_id: Optional session ID for tracking
            
        Returns:
            True if user was created successfully
            
        Raises:
            ValidationError: If user data is invalid
            ConcurrencyError: If user already exists
        """
        # Validate user data
        self._validate_user_data(user_data, is_new_user=True)
        
        def operation():
            credentials = self.file_ops.atomic_read_json(self.credentials_file)
            
            if username in credentials:
                raise ConcurrencyError(
                    f"User {username} already exists",
                    resource="credentials",
                    operation="create_user"
                )
            
            credentials[username] = user_data
            self.file_ops.atomic_write_json(self.credentials_file, credentials)
            return True
        
        return self._execute_write_operation(
            operation, 
            Priority.HIGH, 
            session_id, 
            f"create_user:{username}"
        )
    
    def update_user(self, username: str, user_data: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Update existing user data.
        
        Args:
            username: Username to update
            user_data: Updated user data
            session_id: Optional session ID for tracking
            
        Returns:
            True if user was updated successfully
            
        Raises:
            ValidationError: If user data is invalid
            DatabaseException: If user doesn't exist
        """
        # Validate user data
        self._validate_user_data(user_data, is_new_user=False)
        
        def operation():
            credentials = self.file_ops.atomic_read_json(self.credentials_file)
            
            if username not in credentials:
                raise DatabaseException(f"User {username} does not exist")
            
            credentials[username] = user_data
            self.file_ops.atomic_write_json(self.credentials_file, credentials)
            return True
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"update_user:{username}"
        )
    
    def delete_user(self, username: str, session_id: Optional[str] = None) -> bool:
        """
        Delete a user.
        
        Args:
            username: Username to delete
            session_id: Optional session ID for tracking
            
        Returns:
            True if user was deleted successfully
        """
        def operation():
            credentials = self.file_ops.atomic_read_json(self.credentials_file)
            
            if username not in credentials:
                return False
            
            del credentials[username]
            self.file_ops.atomic_write_json(self.credentials_file, credentials)
            
            # Also clean up collaboration data
            self._cleanup_user_collaboration_data(username)
            
            return True
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"delete_user:{username}"
        )
    
    def authenticate_user(self, username: str, password: str, session_id: Optional[str] = None) -> bool:
        """
        Authenticate user credentials.
        
        Args:
            username: Username
            password: Plain text password
            session_id: Optional session ID for tracking
            
        Returns:
            True if authentication successful
        """
        def operation():
            credentials = self.file_ops.atomic_read_json(self.credentials_file)
            
            if username not in credentials:
                return False
            
            user_data = credentials[username]
            stored_password = user_data.get('password')
            
            if not stored_password:
                return False
            
            return check_password_hash(stored_password, password)
        
        return self._execute_read_operation(operation, session_id, f"authenticate:{username}")
    
    def update_user_history(self, username: str, history_entry: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Add entry to user's history.
        
        Args:
            username: Username
            history_entry: History entry to add
            session_id: Optional session ID for tracking
            
        Returns:
            True if history was updated successfully
        """
        def operation():
            credentials = self.file_ops.atomic_read_json(self.credentials_file)
            
            if username not in credentials:
                raise DatabaseException(f"User {username} does not exist")
            
            if 'history' not in credentials[username]:
                credentials[username]['history'] = []
            
            # Add timestamp if not present
            if 'timestamp' not in history_entry:
                history_entry['timestamp'] = datetime.now().isoformat()
            
            credentials[username]['history'].append(history_entry)
            
            # Limit history size (keep last 1000 entries)
            if len(credentials[username]['history']) > 1000:
                credentials[username]['history'] = credentials[username]['history'][-1000:]
            
            self.file_ops.atomic_write_json(self.credentials_file, credentials)
            return True
        
        return self._execute_write_operation(
            operation,
            Priority.NORMAL,
            session_id,
            f"update_history:{username}"
        )
    
    # ===============================
    # Collaboration Operations
    # ===============================
    
    def get_collaboration_data(self, user_id: Optional[str] = None, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get collaboration data.
        
        Args:
            user_id: Optional user ID for filtering
            session_id: Optional session ID for tracking
            
        Returns:
            Collaboration data dictionary
        """
        def operation():
            return self.file_ops.atomic_read_json(self.collaboration_file)
        
        return self._execute_read_operation(operation, session_id, f"get_collaboration:{user_id or 'all'}")
    
    def save_collaboration_data(self, data: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Save collaboration data.
        
        Args:
            data: Collaboration data to save
            session_id: Optional session ID for tracking
            
        Returns:
            True if data was saved successfully
        """
        # Validate collaboration data structure
        self._validate_collaboration_data(data)
        
        def operation():
            self.file_ops.atomic_write_json(self.collaboration_file, data)
            return True
        
        return self._execute_write_operation(
            operation,
            Priority.NORMAL,
            session_id,
            "save_collaboration"
        )
    
    def create_invite(self, from_user: str, to_user: str, invite_data: Dict[str, Any], session_id: Optional[str] = None) -> str:
        """
        Create a collaboration invite.
        
        Args:
            from_user: User sending the invite
            to_user: User receiving the invite
            invite_data: Invite data
            session_id: Optional session ID for tracking
            
        Returns:
            Invite ID
        """
        import uuid
        
        def operation():
            collaboration_data = self.file_ops.atomic_read_json(self.collaboration_file)
            
            invite_id = str(uuid.uuid4())
            invite_data.update({
                'from_user': from_user,
                'to_user': to_user,
                'timestamp': datetime.now().isoformat(),
                'status': 'pending'
            })
            
            collaboration_data['invites'][invite_id] = invite_data
            self.file_ops.atomic_write_json(self.collaboration_file, collaboration_data)
            
            return invite_id
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"create_invite:{from_user}:{to_user}"
        )
    
    def get_user_invites(self, user_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all invites for a user.
        
        Args:
            user_id: User ID
            session_id: Optional session ID for tracking
            
        Returns:
            Dictionary of invites
        """
        def operation():
            collaboration_data = self.file_ops.atomic_read_json(self.collaboration_file)
            
            user_invites = {}
            for invite_id, invite_data in collaboration_data['invites'].items():
                if invite_data['to_user'] == user_id or invite_data['from_user'] == user_id:
                    user_invites[invite_id] = invite_data
            
            return user_invites
        
        return self._execute_read_operation(operation, session_id, f"get_invites:{user_id}")
    
    def update_invite_status(self, invite_id: str, status: str, session_id: Optional[str] = None) -> bool:
        """
        Update invite status.
        
        Args:
            invite_id: Invite ID
            status: New status (accepted, rejected, etc.)
            session_id: Optional session ID for tracking
            
        Returns:
            True if status was updated successfully
        """
        def operation():
            collaboration_data = self.file_ops.atomic_read_json(self.collaboration_file)
            
            if invite_id not in collaboration_data['invites']:
                return False
            
            collaboration_data['invites'][invite_id]['status'] = status
            self.file_ops.atomic_write_json(self.collaboration_file, collaboration_data)
            
            return True
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"update_invite:{invite_id}:{status}"
        )
    
    # ===============================
    # Session Management
    # ===============================
    
    def create_session(self, user_id: str, operation_type: str = "general") -> str:
        """
        Create a new database session.
        
        Args:
            user_id: User ID
            operation_type: Type of operation
            
        Returns:
            Session ID
        """
        return self.session_manager.create_db_session(user_id, operation_type)
    
    def validate_session(self, session_id: str) -> bool:
        """
        Validate a session.
        
        Args:
            session_id: Session ID to validate
            
        Returns:
            True if session is valid
        """
        return self.session_manager.validate_db_session(session_id)
    
    def cleanup_sessions(self) -> int:
        """
        Clean up expired sessions.
        
        Returns:
            Number of sessions cleaned up
        """
        return self.session_manager.cleanup_expired_sessions()
    
    def get_session_info(self) -> Dict[str, Any]:
        """
        Get session information.
        
        Returns:
            Dictionary containing session information
        """
        return self.session_manager.get_active_sessions()
    
    # ===============================
    # System Operations
    # ===============================
    
    def get_system_status(self) -> Dict[str, Any]:
        """
        Get comprehensive system status.
        
        Returns:
            Dictionary containing system status information
        """
        queue_status = self.queue_manager.get_queue_status()
        session_status = self.session_manager.get_active_sessions()
        
        return {
            'timestamp': datetime.now().isoformat(),
            'queue_manager': queue_status,
            'session_manager': session_status,
            'file_integrity': {
                'credentials_valid': self.file_ops.validate_integrity(self.credentials_file),
                'collaboration_valid': self.file_ops.validate_integrity(self.collaboration_file)
            },
            'configuration': self.config
        }
    
    def create_manual_backup(self) -> Dict[str, str]:
        """
        Create manual backups of all data files.
        
        Returns:
            Dictionary mapping file names to backup paths
        """
        backups = {}
        
        for file_name in [self.credentials_file, self.collaboration_file]:
            try:
                backup_path = self.file_ops.create_backup(file_name)
                backups[file_name] = backup_path
                self._logger.info(f"Created backup for {file_name}: {backup_path}")
            except Exception as e:
                self._logger.error(f"Failed to backup {file_name}: {e}")
                backups[file_name] = f"ERROR: {str(e)}"
        
        return backups
    
    def restore_from_backup(self, file_name: str, backup_path: Optional[str] = None) -> bool:
        """
        Restore file from backup.
        
        Args:
            file_name: Name of file to restore
            backup_path: Specific backup path (optional)
            
        Returns:
            True if restore was successful
        """
        try:
            self.file_ops.restore_backup(file_name, backup_path)
            self._logger.info(f"Restored {file_name} from backup")
            return True
        except Exception as e:
            self._logger.error(f"Failed to restore {file_name}: {e}")
            return False
    
    def shutdown(self) -> None:
        """Shutdown DBManager gracefully."""
        self._logger.info("Shutting down DBManager...")
        
        # Shutdown components
        self.queue_manager.shutdown_gracefully()
        self.session_manager.shutdown()
        
        self._logger.info("DBManager shutdown complete")
    
    # ===============================
    # Private Methods
    # ===============================
    
    def _initialize_databases(self) -> None:
        """Initialize database files if they don't exist."""
        # Initialize credentials database
        credentials_path = self.data_dir / self.credentials_file
        if not credentials_path.exists():
            self._create_default_credentials()
        
        # Initialize collaboration database
        collaboration_path = self.data_dir / self.collaboration_file
        if not collaboration_path.exists():
            self._create_default_collaboration()
    
    def _create_default_credentials(self) -> None:
        """Create default credentials file."""
        default_data = {}
        self.file_ops.atomic_write_json(self.credentials_file, default_data)
        self._logger.info("Created default credentials database")
    
    def _create_default_collaboration(self) -> None:
        """Create default collaboration file."""
        default_data = {
            "invites": {},
            "chat_sessions": {},
            "message_counter": 0
        }
        self.file_ops.atomic_write_json(self.collaboration_file, default_data)
        self._logger.info("Created default collaboration database")
    
    def _execute_read_operation(self, operation_func, session_id: Optional[str], operation_name: str):
        """Execute a read operation with error handling."""
        try:
            if session_id:
                self.session_manager.validate_db_session(session_id)
            
            future = self.queue_manager.submit_read_operation(operation_func)
            return future.result(timeout=self.config['operation_timeout'])
            
        except Exception as e:
            self._logger.error(f"Read operation failed ({operation_name}): {e}")
            if isinstance(e, (DatabaseException, QueueTimeoutError, SessionError)):
                raise
            raise DatabaseException(f"Read operation failed: {str(e)}")
    
    def _execute_write_operation(self, operation_func, priority: Priority, session_id: Optional[str], operation_name: str):
        """Execute a write operation with error handling."""
        try:
            if session_id:
                self.session_manager.validate_db_session(session_id)
            
            future = self.queue_manager.submit_write_operation(
                operation_func,
                priority=priority,
                timeout=self.config['operation_timeout']
            )
            return future.result(timeout=self.config['operation_timeout'])
            
        except Exception as e:
            self._logger.error(f"Write operation failed ({operation_name}): {e}")
            if isinstance(e, (DatabaseException, QueueTimeoutError, SessionError)):
                raise
            raise DatabaseException(f"Write operation failed: {str(e)}")
    
    def _validate_user_data(self, user_data: Dict[str, Any], is_new_user: bool = True) -> None:
        """Validate user data structure."""
        if not isinstance(user_data, dict):
            raise ValidationError("User data must be a dictionary")
        
        if is_new_user:
            required_fields = ['password']
            for field in required_fields:
                if field not in user_data:
                    raise ValidationError(f"Missing required field: {field}", field=field)
    
    def _validate_collaboration_data(self, data: Dict[str, Any]) -> None:
        """Validate collaboration data structure."""
        if not isinstance(data, dict):
            raise ValidationError("Collaboration data must be a dictionary")
        
        required_keys = ['invites', 'chat_sessions', 'message_counter']
        for key in required_keys:
            if key not in data:
                raise ValidationError(f"Missing required key: {key}", field=key)
    
    def _cleanup_user_collaboration_data(self, username: str) -> None:
        """Clean up collaboration data when user is deleted."""
        try:
            collaboration_data = self.file_ops.atomic_read_json(self.collaboration_file)
            
            # Remove invites involving this user
            invites_to_remove = []
            for invite_id, invite_data in collaboration_data['invites'].items():
                if invite_data['from_user'] == username or invite_data['to_user'] == username:
                    invites_to_remove.append(invite_id)
            
            for invite_id in invites_to_remove:
                del collaboration_data['invites'][invite_id]
            
            # Deactivate chat sessions involving this user
            for session_id, session_data in collaboration_data['chat_sessions'].items():
                if session_data['user1'] == username or session_data['user2'] == username:
                    session_data['active'] = False
            
            self.file_ops.atomic_write_json(self.collaboration_file, collaboration_data)
            
        except Exception as e:
            self._logger.warning(f"Failed to cleanup collaboration data for {username}: {e}")
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.shutdown()
