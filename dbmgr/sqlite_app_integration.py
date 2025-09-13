"""
SQLite Application Integration for NinjaNerd Flask app.

This module provides Flask application integration for the SQLite database manager,
maintaining compatibility with the existing JSON-based interface while providing
enhanced performance and concurrent user support.
"""

import os
import logging
import atexit
from datetime import datetime
from typing import Dict, Any, Optional
from flask import Flask

from .sqlite_manager import SQLiteManager
from .exceptions import DatabaseException
from data.message_security import MessageObfuscator


class SQLiteAppIntegration:
    """
    Flask application integration for SQLite database manager.
    
    Provides a seamless interface between the Flask app and SQLite database,
    maintaining compatibility with existing JSON-based operations.
    """
    
    def __init__(self, app: Flask = None, **kwargs):
        """
        Initialize SQLite app integration.
        
        Args:
            app: Flask application instance
            **kwargs: Configuration options
        """
        self.app = app
        self.sqlite_manager = None
        self.message_obfuscator = None
        self._logger = logging.getLogger(__name__)
        
        # Configuration
        self.config = {
            'db_path': kwargs.get('db_path', os.path.join('data', 'ninjanerd.db')),
            'max_connections': kwargs.get('max_connections', 50),
            'max_workers': kwargs.get('max_workers', 10),
            'operation_timeout': kwargs.get('operation_timeout', 30),
            'enable_message_obfuscation': kwargs.get('enable_message_obfuscation', True),
            'cleanup_interval_hours': kwargs.get('cleanup_interval_hours', 24),
            'data_retention_days': kwargs.get('data_retention_days', 30)
        }
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app: Flask):
        """
        Initialize the Flask application with SQLite integration.
        
        Args:
            app: Flask application instance
        """
        self.app = app
        
        # Update config from Flask app config
        for key, value in self.config.items():
            config_key = f'SQLITE_{key.upper()}'
            if config_key in app.config:
                self.config[key] = app.config[config_key]
        
        # Initialize SQLite manager
        self.sqlite_manager = SQLiteManager(
            db_path=self.config['db_path'],
            max_connections=self.config['max_connections'],
            max_workers=self.config['max_workers'],
            operation_timeout=self.config['operation_timeout']
        )
        
        # Initialize message obfuscator if enabled
        if self.config['enable_message_obfuscation']:
            secret_key = app.config.get('SECRET_KEY', 'NinjaNerd-Chat-Security-2025')
            self.message_obfuscator = MessageObfuscator(secret_key)
        
        # Store reference in app
        app.extensions = getattr(app, 'extensions', {})
        app.extensions['sqlite_integration'] = self
        
        # Register cleanup handlers
        atexit.register(self._cleanup)
        
        self._logger.info("SQLite app integration initialized successfully")
    
    # ===============================
    # User Management Interface
    # ===============================
    
    def load_credentials(self) -> Dict[str, Any]:
        """
        Load all user credentials (compatible with JSON format).
        
        Returns:
            Dictionary with user credentials in JSON-compatible format
        """
        try:
            credentials = {}
            
            # Get all users from database
            with self.sqlite_manager.connection_pool.get_connection() as conn:
                users = conn.execute("""
                    SELECT email, password, school_name, created_at
                    FROM users
                    ORDER BY created_at
                """).fetchall()
                
                for user in users:
                    user_data = {
                        'password': user['password'],
                        'school_name': user['school_name'] or '',
                        'history': []
                    }
                    
                    # Get user history
                    history = conn.execute("""
                        SELECT question, user_answer, correct, topic, subtopic, grade, timestamp
                        FROM user_history uh
                        JOIN users u ON uh.user_id = u.id
                        WHERE u.email = ?
                        ORDER BY timestamp DESC
                    """, (user['email'],)).fetchall()
                    
                    user_data['history'] = [
                        {
                            'question': h['question'],
                            'user_answer': h['user_answer'],
                            'correct': bool(h['correct']),
                            'topic': h['topic'],
                            'subtopic': h['subtopic'],
                            'grade': h['grade'],
                            'timestamp': h['timestamp']
                        }
                        for h in history
                    ]
                    
                    credentials[user['email']] = user_data
            
            return credentials
            
        except Exception as e:
            self._logger.error(f"Failed to load credentials: {e}")
            raise DatabaseException(f"Failed to load credentials: {e}")
    
    def save_credentials(self, credentials: Dict[str, Any]) -> bool:
        """
        Save user credentials (compatible with JSON format).
        
        Args:
            credentials: User credentials dictionary
            
        Returns:
            True if saved successfully
        """
        try:
            with self.sqlite_manager.connection_pool.get_connection() as conn:
                for email, user_data in credentials.items():
                    # Check if user exists
                    existing_user = conn.execute(
                        "SELECT id FROM users WHERE email = ?",
                        (email,)
                    ).fetchone()
                    
                    if existing_user:
                        # Update existing user
                        conn.execute("""
                            UPDATE users
                            SET password = ?, school_name = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE email = ?
                        """, (user_data['password'], user_data.get('school_name'), email))
                        
                        user_id = existing_user['id']
                    else:
                        # Create new user
                        cursor = conn.execute("""
                            INSERT INTO users (email, password, school_name)
                            VALUES (?, ?, ?)
                        """, (email, user_data['password'], user_data.get('school_name')))
                        
                        user_id = cursor.lastrowid
                    
                    # Update history if provided
                    if 'history' in user_data:
                        # Clear existing history
                        conn.execute("DELETE FROM user_history WHERE user_id = ?", (user_id,))
                        
                        # Add new history entries
                        for entry in user_data['history']:
                            conn.execute("""
                                INSERT INTO user_history 
                                (user_id, question, user_answer, correct, topic, subtopic, grade, timestamp)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                user_id,
                                entry.get('question'),
                                entry.get('user_answer'),
                                entry.get('correct', False),
                                entry.get('topic'),
                                entry.get('subtopic'),
                                entry.get('grade'),
                                entry.get('timestamp')
                            ))
                    
                    # **CRITICAL FIX**: Preserve last_login from JSON statistics
                    if 'statistics' in user_data:
                        statistics = user_data['statistics']
                        last_login = statistics.get('last_login')
                        
                        if last_login:
                            # Store last_login in a separate table for SQLite implementation
                            # First, check if user_statistics table exists, if not create it
                            conn.execute("""
                                CREATE TABLE IF NOT EXISTS user_statistics (
                                    user_id INTEGER PRIMARY KEY,
                                    last_login TEXT,
                                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                                )
                            """)
                            
                            # Insert or update last_login
                            conn.execute("""
                                INSERT OR REPLACE INTO user_statistics (user_id, last_login)
                                VALUES (?, ?)
                            """, (user_id, last_login))
                
                conn.commit()
                return True
                
        except Exception as e:
            self._logger.error(f"Failed to save credentials: {e}")
            raise DatabaseException(f"Failed to save credentials: {e}")
    
    def create_user(self, email: str, password: str, school_name: str = None) -> Optional[str]:
        """
        Create a new user.
        
        Args:
            email: User email
            password: User password (will be hashed)
            school_name: User's school name
            
        Returns:
            User email if successful, None otherwise
        """
        try:
            from werkzeug.security import generate_password_hash
            hashed_password = generate_password_hash(password)
            success = self.sqlite_manager.create_user(email, hashed_password, school_name)
            return email if success else None
        except Exception as e:
            self._logger.error(f"Error creating user {email}: {e}")
            return None
    
    def get_user(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get user by email.
        
        Args:
            email: User email
            
        Returns:
            User data or None
        """
        user_data = self.sqlite_manager.get_user(email)
        if user_data:
            # Ensure user data has the expected statistics structure for app.py compatibility
            if 'statistics' not in user_data:
                # Calculate statistics from history
                history = user_data.get('history', [])
                topics_covered = list(set(entry.get('topic') for entry in history if entry.get('topic')))
                questions_attempted = len(history)
                
                # **CRITICAL FIX**: Retrieve last_login from user_statistics table
                last_login = None
                try:
                    with self.sqlite_manager.connection_pool.get_connection() as conn:
                        # Get user ID first
                        user_row = conn.execute(
                            "SELECT id FROM users WHERE email = ?",
                            (email,)
                        ).fetchone()
                        
                        if user_row:
                            # Get last_login from user_statistics table
                            stats_row = conn.execute(
                                "SELECT last_login FROM user_statistics WHERE user_id = ?",
                                (user_row['id'],)
                            ).fetchone()
                            
                            if stats_row:
                                last_login = stats_row['last_login']
                except Exception as e:
                    self._logger.error(f"Error retrieving last_login for {email}: {e}")
                
                user_data['statistics'] = {
                    'questions_attempted': questions_attempted,
                    'topics_covered': topics_covered,
                    'last_login': last_login
                }
        
        return user_data
    
    def create_user(self, email: str, password: str, school_name: str = None) -> bool:
        """
        Create a new user.
        
        Args:
            email: User email
            password: Hashed password
            school_name: School name
            
        Returns:
            True if created successfully
        """
        return self.sqlite_manager.create_user(email, password, school_name)
    
    def update_user(self, email: str, updates: Dict[str, Any]) -> bool:
        """
        Update user data.
        
        Args:
            email: User email
            updates: Fields to update
            
        Returns:
            True if updated successfully
        """
        return self.sqlite_manager.update_user(email, updates)
    
    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Authenticate user and return user data.
        
        Args:
            email: User email
            password: User password
            
        Returns:
            User data if authenticated, None otherwise
        """
        # Use existing get_user which now includes statistics
        user_data = self.get_user(email)
        if user_data and self.sqlite_manager.authenticate_user(email, password):
            return user_data
        return None
    
    def add_user_history(self, email: str, history_entry: Dict[str, Any]) -> bool:
        """
        Add entry to user history.
        
        Args:
            email: User email
            history_entry: History entry data
            
        Returns:
            True if added successfully
        """
        return self.sqlite_manager.add_user_history(email, history_entry)
    
    def update_user_history_and_statistics(self, email: str, history_entry: Dict[str, Any], 
                                          statistics_updates: Dict[str, Any]) -> bool:
        """
        Add entry to user's history and update statistics atomically.
        
        Args:
            email: User email
            history_entry: History entry to add
            statistics_updates: Dictionary of statistics updates to apply (supports both 'add_topic_covered' and 'topics_covered_add')
            
        Returns:
            True if both history and statistics were updated successfully
        """
        try:
            # Handle both naming conventions for backwards compatibility
            if 'add_topic_covered' in statistics_updates:
                statistics_updates['topics_covered_add'] = statistics_updates.pop('add_topic_covered')
            
            # Add history entry first
            history_success = self.sqlite_manager.add_user_history(email, history_entry)
            if not history_success:
                return False
            
            # Update statistics
            return self.update_user_statistics(email, statistics_updates)
        except Exception as e:
            self._logger.error(f"Error updating history and statistics for user {email}: {e}")
            return False
    
    def update_user_statistics(self, email: str, statistics_updates: Dict[str, Any]) -> bool:
        """
        Update user statistics only.
        
        Args:
            email: User email
            statistics_updates: Dictionary of statistics updates to apply
            
        Returns:
            True if statistics were updated successfully
        """
        try:
            # Handle last_login updates by storing in user_statistics table
            if 'last_login' in statistics_updates:
                last_login = statistics_updates['last_login']
                with self.sqlite_manager.connection_pool.get_connection() as conn:
                    cursor = conn.cursor()
                    
                    # First get the user_id for this email
                    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
                    user_result = cursor.fetchone()
                    
                    if user_result:
                        user_id = user_result[0]
                        cursor.execute('''
                            INSERT OR REPLACE INTO user_statistics (user_id, last_login)
                            VALUES (?, ?)
                        ''', (user_id, last_login))
                        conn.commit()
                        self._logger.info(f"Updated last_login for user {email} to {last_login}")
                    else:
                        self._logger.warning(f"User {email} not found when updating statistics")
            
            # If we need to add a topic to covered topics, we can do that by adding to history
            if 'topics_covered_add' in statistics_updates:
                topic_to_add = statistics_updates['topics_covered_add']
                # This topic should have been added via history entry already
                # So we just return True for compatibility
                self._logger.info(f"Topic {topic_to_add} marked as covered for user {email}")
            
            # For other statistics updates, they are computed from history
            # so we don't need to do anything special here
            return True
        except Exception as e:
            self._logger.error(f"Error updating statistics for user {email}: {e}")
            return False
    
    def update_user_password(self, email: str, hashed_password: str) -> bool:
        """
        Update a user's password.
        
        Args:
            email: User email
            hashed_password: The hashed password
            
        Returns:
            True if successful
        """
        try:
            return self.sqlite_manager.update_user(email, {'password': hashed_password})
        except Exception as e:
            self._logger.error(f"Error updating password for user {email}: {e}")
            return False
    
    def update_user_school(self, email: str, school_name: str) -> bool:
        """
        Update a user's school name.
        
        Args:
            email: User email
            school_name: The new school name
            
        Returns:
            True if successful
        """
        try:
            return self.sqlite_manager.update_user(email, {'school_name': school_name})
        except Exception as e:
            self._logger.error(f"Error updating school for user {email}: {e}")
            return False
    
    # ===============================
    # Collaboration Interface
    # ===============================
    
    def load_collaboration_data(self) -> Dict[str, Any]:
        """
        Load collaboration data (compatible with JSON format).
        
        Returns:
            Dictionary with collaboration data in JSON-compatible format
        """
        try:
            collaboration_data = self.sqlite_manager.get_collaboration_data()
            
            # Apply message obfuscation/deobfuscation if enabled
            if self.config['enable_message_obfuscation'] and self.message_obfuscator:
                for session_id, session_data in collaboration_data['chat_sessions'].items():
                    for message in session_data['messages']:
                        # Deobfuscate message for display
                        if 'message' in message:
                            try:
                                # Check if message is obfuscated, if so deobfuscate
                                deobfuscated = self.message_obfuscator.deobfuscate_message(message['message'])
                                message['message'] = deobfuscated
                            except:
                                # Message might not be obfuscated, keep original
                                pass
            
            return collaboration_data
            
        except Exception as e:
            self._logger.error(f"Failed to load collaboration data: {e}")
            raise DatabaseException(f"Failed to load collaboration data: {e}")
    
    def save_collaboration_data(self, collaboration_data: Dict[str, Any]) -> bool:
        """
        Save collaboration data (compatible with JSON format).
        
        Args:
            collaboration_data: Collaboration data dictionary
            
        Returns:
            True if saved successfully
        """
        try:
            with self.sqlite_manager.connection_pool.get_connection() as conn:
                # Clear existing data
                conn.execute("DELETE FROM messages")
                conn.execute("DELETE FROM chat_sessions")
                conn.execute("DELETE FROM invites")
                
                # Save invites
                invites = collaboration_data.get('invites', {})
                for invite_id, invite_data in invites.items():
                    # Get from_user ID
                    from_user_row = conn.execute(
                        "SELECT id FROM users WHERE email = ?",
                        (invite_data['from_user'],)
                    ).fetchone()
                    
                    if from_user_row:
                        conn.execute("""
                            INSERT INTO invites (id, from_user_id, to_user_email, timestamp, status)
                            VALUES (?, ?, ?, ?, ?)
                        """, (
                            invite_id,
                            from_user_row['id'],
                            invite_data['to_user'],
                            invite_data['timestamp'],
                            invite_data['status']
                        ))
                
                # Save chat sessions and messages
                chat_sessions = collaboration_data.get('chat_sessions', {})
                for session_id, session_data in chat_sessions.items():
                    # Get user IDs
                    user1_row = conn.execute(
                        "SELECT id FROM users WHERE email = ?",
                        (session_data['user1'],)
                    ).fetchone()
                    
                    user2_row = conn.execute(
                        "SELECT id FROM users WHERE email = ?",
                        (session_data['user2'],)
                    ).fetchone()
                    
                    if user1_row and user2_row:
                        # Create chat session
                        conn.execute("""
                            INSERT INTO chat_sessions (id, user1_id, user2_id, active, created_at)
                            VALUES (?, ?, ?, ?, ?)
                        """, (
                            session_id,
                            user1_row['id'],
                            user2_row['id'],
                            session_data.get('active', False),
                            session_data.get('created_at')
                        ))
                        
                        # Add messages
                        messages = session_data.get('messages', [])
                        for message in messages:
                            from_user_row = conn.execute(
                                "SELECT id FROM users WHERE email = ?",
                                (message['from_user'],)
                            ).fetchone()
                            
                            to_user_row = conn.execute(
                                "SELECT id FROM users WHERE email = ?",
                                (message['to_user'],)
                            ).fetchone()
                            
                            if from_user_row and to_user_row:
                                message_content = message['message']
                                obfuscated_content = None
                                
                                # Obfuscate message if enabled
                                if self.config['enable_message_obfuscation'] and self.message_obfuscator:
                                    obfuscated_content = self.message_obfuscator.obfuscate_message(message_content)
                                
                                conn.execute("""
                                    INSERT OR IGNORE INTO messages 
                                    (session_id, from_user_id, to_user_id, message_content, 
                                     obfuscated_content, timestamp, displayed)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                """, (
                                    session_id,
                                    from_user_row['id'],
                                    to_user_row['id'],
                                    message_content,
                                    obfuscated_content,
                                    message['timestamp'],
                                    message.get('displayed', False)
                                ))
                
                conn.commit()
                return True
                
        except Exception as e:
            self._logger.error(f"Failed to save collaboration data: {e}")
            raise DatabaseException(f"Failed to save collaboration data: {e}")
    
    def create_invite(self, from_user: str, to_user: str) -> str:
        """
        Create a new collaboration invite.
        
        Args:
            from_user: Email of user sending invite
            to_user: Email of user receiving invite
            
        Returns:
            Invite ID
        """
        return self.sqlite_manager.create_invite(from_user, to_user)
    
    def update_invite_status(self, invite_id: str, status: str) -> bool:
        """
        Update invite status.
        
        Args:
            invite_id: Invite ID
            status: New status
            
        Returns:
            True if updated successfully
        """
        return self.sqlite_manager.update_invite_status(invite_id, status)
    
    def create_chat_session(self, user1: str, user2: str) -> str:
        """
        Create a new chat session.
        
        Args:
            user1: First user email
            user2: Second user email
            
        Returns:
            Session ID
        """
        return self.sqlite_manager.create_chat_session(user1, user2)
    
    def add_message(self, session_id: str, from_user: str, to_user: str, message: str) -> int:
        """
        Add a message to a chat session.
        
        Args:
            session_id: Chat session ID
            from_user: Sender email
            to_user: Recipient email
            message: Message content
            
        Returns:
            Message ID
        """
        obfuscated_message = None
        
        # Obfuscate message if enabled
        if self.config['enable_message_obfuscation'] and self.message_obfuscator:
            obfuscated_message = self.message_obfuscator.obfuscate_message(message)
        
        return self.sqlite_manager.add_message(
            session_id, from_user, to_user, message, obfuscated_message
        )
    
    def update_message_displayed(self, message_id: int, displayed: bool = True) -> bool:
        """
        Update message displayed status.
        
        Args:
            message_id: Message ID
            displayed: Whether message was displayed
            
        Returns:
            True if updated successfully
        """
        return self.sqlite_manager.update_message_displayed(message_id, displayed)
    
    # ===============================
    # Session Management
    # ===============================
    
    def create_session(self, email: str, operation_type: str = "web_session") -> str:
        """
        Create a database session for a user.
        
        Args:
            email: User email
            operation_type: Type of operation
            
        Returns:
            Session ID or None if failed
        """
        try:
            # For SQLite integration, we'll use a simple session ID generation
            # and delegate to the underlying SQLite manager if it has session support
            if hasattr(self.sqlite_manager, 'create_session'):
                return self.sqlite_manager.create_session(email, operation_type)
            else:
                # Fallback: generate a simple session ID
                import uuid
                session_id = str(uuid.uuid4())
                self._logger.info(f"Created session {session_id} for user {email}")
                return session_id
        except Exception as e:
            self._logger.error(f"Error creating session for user {email}: {e}")
            return None
    
    # ===============================
    # System Management
    # ===============================
    
    def get_system_status(self) -> Dict[str, Any]:
        """
        Get system status information.
        
        Returns:
            Dict containing system status
        """
        try:
            health_status = self.health_check()
            stats = self.get_statistics()
            
            return {
                'timestamp': datetime.now().isoformat(),
                'database_health': health_status,
                'statistics': stats,
                'connection_pool': {
                    'total_connections': getattr(self.sqlite_manager.connection_pool, '_total_connections', 0),
                    'max_connections': self.config['max_connections']
                },
                'configuration': {
                    'db_path': str(self.sqlite_manager.db_path),
                    'max_workers': self.config['max_workers'],
                    'operation_timeout': self.config['operation_timeout']
                }
            }
        except Exception as e:
            self._logger.error(f"Error getting system status: {e}")
            return {"error": str(e), "timestamp": "unknown"}
    
    def create_backup(self) -> Dict[str, str]:
        """
        Create manual backup.
        
        Returns:
            Dict mapping filenames to backup paths
        """
        try:
            # Delegate to SQLite manager if it has backup functionality
            if hasattr(self.sqlite_manager, 'create_backup'):
                return self.sqlite_manager.create_backup()
            else:
                # Fallback: basic backup information
                import shutil
                import os
                from datetime import datetime
                
                backup_dir = os.path.join(os.path.dirname(self.sqlite_manager.db_path), 'backups')
                os.makedirs(backup_dir, exist_ok=True)
                
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                backup_file = f"ninjanerd_backup_{timestamp}.db"
                backup_path = os.path.join(backup_dir, backup_file)
                
                # Copy database file
                shutil.copy2(self.sqlite_manager.db_path, backup_path)
                
                return {
                    "ninjanerd.db": backup_path,
                    "backup_timestamp": timestamp
                }
        except Exception as e:
            self._logger.error(f"Error creating backup: {e}")
            return {"error": str(e)}
    
    def shutdown(self) -> None:
        """Shutdown the database manager."""
        try:
            self._cleanup()
            self._logger.info("SQLite app integration shutdown successfully")
        except Exception as e:
            self._logger.error(f"Error during shutdown: {e}")
    
    # ===============================
    # Utility Methods
    # ===============================
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get database statistics.
        
        Returns:
            Dictionary with database statistics
        """
        return self.sqlite_manager.get_statistics()
    
    def cleanup_old_data(self, days: int = None) -> bool:
        """
        Cleanup old data from database.
        
        Args:
            days: Number of days to keep data (uses config default if None)
            
        Returns:
            True if cleanup successful
        """
        if days is None:
            days = self.config['data_retention_days']
        
        return self.sqlite_manager.cleanup_old_data(days)
    
    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on database.
        
        Returns:
            Health check results
        """
        try:
            with self.sqlite_manager.connection_pool.get_connection() as conn:
                # Test basic query
                result = conn.execute("SELECT 1").fetchone()
                
                if result:
                    stats = self.get_statistics()
                    return {
                        'status': 'healthy',
                        'database_path': str(self.sqlite_manager.db_path),
                        'connection_pool_size': self.sqlite_manager.connection_pool._total_connections,
                        'statistics': stats
                    }
                else:
                    return {'status': 'unhealthy', 'error': 'Database query failed'}
                    
        except Exception as e:
            return {'status': 'unhealthy', 'error': str(e)}
    
    def _cleanup(self):
        """Cleanup resources on shutdown."""
        try:
            if self.sqlite_manager:
                self.sqlite_manager.close()
                self._logger.info("SQLite app integration cleaned up successfully")
        except Exception as e:
            self._logger.error(f"Error during cleanup: {e}")


# Global variable for app integration instance
_sqlite_integration = None


def initialize_app_db(app: Flask, **kwargs) -> SQLiteAppIntegration:
    """
    Initialize SQLite database integration for Flask app.
    
    Args:
        app: Flask application instance
        **kwargs: Configuration options
        
    Returns:
        SQLite app integration instance
    """
    global _sqlite_integration
    
    if _sqlite_integration is None:
        _sqlite_integration = SQLiteAppIntegration(app, **kwargs)
    
    return _sqlite_integration


def get_app_db() -> SQLiteAppIntegration:
    """
    Get the current SQLite app integration instance.
    
    Returns:
        SQLite app integration instance
        
    Raises:
        RuntimeError: If not initialized
    """
    global _sqlite_integration
    
    if _sqlite_integration is None:
        raise RuntimeError("SQLite database not initialized. Call initialize_app_db first.")
    
    return _sqlite_integration


def reset_app_db():
    """Reset the global app integration instance (for testing)."""
    global _sqlite_integration
    
    if _sqlite_integration:
        _sqlite_integration._cleanup()
        _sqlite_integration = None
