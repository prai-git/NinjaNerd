"""
SQLite Database Manager for NinjaNerd application.

This module provides comprehensive SQLite database operations with support for:
- Thread-safe concurrent operations (1000+ users)
- Connection pooling and queue-based operations
- Message obfuscation for collaboration data
- Migration from JSON file-based storage
- Full compatibility with existing DBManager interface
"""

import sqlite3
import threading
import queue
import time
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union, Tuple
from pathlib import Path
from werkzeug.security import check_password_hash, generate_password_hash
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, Future
import json

from .queue_manager import QueueManager, Priority
from .session_manager import SessionManager
from .database_recovery import DatabaseRecoveryManager, RecoveryPolicy
from .exceptions import (
    DatabaseException,
    FileIntegrityError,
    ConcurrencyError,
    QueueTimeoutError,
    SessionError,
    ValidationError,
    RecoveryError,
    BackupError
)


class SQLiteConnectionPool:
    """
    Thread-safe SQLite connection pool for concurrent operations.
    Manages a pool of database connections to support 1000+ concurrent users.
    """
    
    def __init__(self, db_path: str, max_connections: int = 50):
        """
        Initialize connection pool.
        
        Args:
            db_path: Path to SQLite database file
            max_connections: Maximum number of connections in pool
        """
        self.db_path = db_path
        self.max_connections = max_connections
        self._connections = queue.Queue(maxsize=max_connections)
        self._lock = threading.Lock()
        self._total_connections = 0
        
        # Initialize pool with some connections
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize the connection pool with initial connections."""
        initial_size = min(5, self.max_connections)
        for _ in range(initial_size):
            conn = self._create_connection()
            if conn:
                self._connections.put(conn)
    
    def _create_connection(self) -> Optional[sqlite3.Connection]:
        """
        Create a new SQLite connection with optimal settings.
        
        Returns:
            SQLite connection or None if creation fails
        """
        try:
            conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False,
                isolation_level=None  # Autocommit mode
            )
            
            # Configure connection for optimal performance
            conn.execute("PRAGMA journal_mode = WAL")  # Write-Ahead Logging
            conn.execute("PRAGMA synchronous = NORMAL")  # Balance safety/performance
            conn.execute("PRAGMA cache_size = 10000")  # 10MB cache
            conn.execute("PRAGMA temp_store = MEMORY")  # Store temp tables in memory
            conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
            
            # Set row factory for dict-like access
            conn.row_factory = sqlite3.Row
            
            with self._lock:
                self._total_connections += 1
            
            return conn
            
        except Exception as e:
            logging.error(f"Failed to create SQLite connection: {e}")
            return None
    
    @contextmanager
    def get_connection(self):
        """
        Get a connection from the pool with context manager.
        
        Yields:
            SQLite connection
        """
        conn = None
        try:
            # Try to get connection from pool
            try:
                conn = self._connections.get_nowait()
            except queue.Empty:
                # Create new connection if pool is empty and under limit
                with self._lock:
                    if self._total_connections < self.max_connections:
                        conn = self._create_connection()
                    else:
                        # Wait for a connection to become available
                        conn = self._connections.get(timeout=30)
            
            if conn is None:
                raise DatabaseException("Unable to obtain database connection")
            
            # Test connection
            conn.execute("SELECT 1")
            
            yield conn
            
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            raise
        finally:
            if conn:
                try:
                    # Return connection to pool
                    self._connections.put_nowait(conn)
                except queue.Full:
                    # Pool is full, close connection
                    conn.close()
                    with self._lock:
                        self._total_connections -= 1
    
    def close_all(self):
        """Close all connections in the pool."""
        with self._lock:
            while not self._connections.empty():
                try:
                    conn = self._connections.get_nowait()
                    conn.close()
                except:
                    pass
            self._total_connections = 0


class SQLiteManager:
    """
    Comprehensive SQLite database manager for NinjaNerd.
    
    Features:
    - Thread-safe operations with connection pooling
    - Queue-based operations for concurrent access
    - Message obfuscation for collaboration data
    - Full compatibility with existing JSON-based interface
    - Support for 1000+ concurrent users/sessions
    """
    
    # Database schema version
    SCHEMA_VERSION = 1
    
    # Table schemas
    SCHEMA_SQL = {
        'users': """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                school_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_admin BOOLEAN DEFAULT FALSE
            )
        """,
        
        'user_history': """
            CREATE TABLE IF NOT EXISTS user_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                question TEXT NOT NULL,
                user_answer TEXT,
                correct BOOLEAN DEFAULT FALSE,
                topic TEXT,
                subtopic TEXT,
                grade INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """,
        
        'invites': """
            CREATE TABLE IF NOT EXISTS invites (
                id TEXT PRIMARY KEY,
                from_user_id INTEGER NOT NULL,
                to_user_email TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (from_user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """,
        
        'chat_sessions': """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                user1_id INTEGER NOT NULL,
                user2_id INTEGER NOT NULL,
                active BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user1_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """,
        
        'messages': """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                from_user_id INTEGER NOT NULL,
                to_user_id INTEGER NOT NULL,
                message_content TEXT NOT NULL,
                obfuscated_content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                displayed BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE,
                FOREIGN KEY (from_user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (to_user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """,
        
        'schema_info': """
            CREATE TABLE IF NOT EXISTS schema_info (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
    }
    
    # Indexes for performance optimization
    INDEXES_SQL = [
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)",
        "CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_history_timestamp ON user_history (timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_invites_from_user ON invites (from_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_invites_to_user ON invites (to_user_email)",
        "CREATE INDEX IF NOT EXISTS idx_invites_status ON invites (status)",
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_users ON chat_sessions (user1_id, user2_id)",
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions (active)",
        "CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_messages_displayed ON messages (displayed)"
    ]
    
    def __init__(self, db_path: str = None, **kwargs):
        """
        Initialize SQLite manager.
        
        Args:
            db_path: Path to SQLite database file
            **kwargs: Additional configuration options
        """
        # Configuration
        self.config = {
            'max_connections': kwargs.get('max_connections', 50),
            'max_workers': kwargs.get('max_workers', 10),
            'operation_timeout': kwargs.get('operation_timeout', 30),
            'session_timeout_minutes': kwargs.get('session_timeout_minutes', 30),
            'cleanup_interval_minutes': kwargs.get('cleanup_interval_minutes', 5),
            'max_retry_attempts': kwargs.get('max_retry_attempts', 3),
            'retry_delay': kwargs.get('retry_delay', 0.1)
        }
        
        # Database path
        if db_path is None:
            db_path = os.path.join('data', 'ninjanerd.db')
        self.db_path = Path(db_path)
        
        # Ensure database directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize connection pool
        self.connection_pool = SQLiteConnectionPool(
            str(self.db_path),
            max_connections=self.config['max_connections']
        )
        
        # Initialize queue manager for operations
        self.queue_manager = QueueManager(
            max_workers=self.config['max_workers'],
            timeout=self.config['operation_timeout']
        )
        
        # Initialize session manager
        self.session_manager = SessionManager(
            session_timeout_minutes=self.config['session_timeout_minutes'],
            cleanup_interval_minutes=self.config['cleanup_interval_minutes']
        )
        
        # Initialize logger using production logging system
        try:
            # Try to use the production logging system
            from logging_system import get_logging_integration
            logging_integration = get_logging_integration()
            if logging_integration and logging_integration.log_manager:
                self._logger = logging_integration.log_manager.get_logger('ninjanerd.database.sqlite')
            else:
                # Fallback to basic logger if production logging not available
                self._logger = logging.getLogger(__name__)
        except (ImportError, Exception):
            # Fallback to basic logger if logging_system not available
            self._logger = logging.getLogger(__name__)
        
        # Initialize recovery manager
        backup_dir = kwargs.get('backup_dir', self.db_path.parent / 'backups')
        recovery_policy = RecoveryPolicy(
            enable_auto_repair=kwargs.get('enable_auto_repair', True),
            enable_auto_backup=kwargs.get('enable_auto_backup', True),
            enable_auto_restore=kwargs.get('enable_auto_restore', False),
            max_repair_attempts=kwargs.get('max_repair_attempts', 3)
        )
        
        self.recovery_manager = DatabaseRecoveryManager(
            db_path=str(self.db_path),
            backup_dir=str(backup_dir),
            recovery_policy=recovery_policy,
            logger=self._logger
        )
        
        # Register operation hooks for safety backups
        self.recovery_manager.register_operation_hook('vacuum', True)
        self.recovery_manager.register_operation_hook('schema_change', True)
        self.recovery_manager.register_operation_hook('bulk_delete', True)
        self.recovery_manager.register_operation_hook('user_deletion', True)
        
        # Initialize database schema
        self._initialize_database()
        
        self._logger.info(f"SQLiteManager initialized with database: {self.db_path}")
    
    def _initialize_database(self):
        """Initialize database schema and create admin user if needed."""
        try:
            with self.connection_pool.get_connection() as conn:
                # Create all tables
                for table_name, schema_sql in self.SCHEMA_SQL.items():
                    conn.execute(schema_sql)
                
                # Create indexes
                for index_sql in self.INDEXES_SQL:
                    conn.execute(index_sql)
                
                # Check schema version
                result = conn.execute(
                    "SELECT version FROM schema_info ORDER BY version DESC LIMIT 1"
                ).fetchone()
                
                if not result:
                    # First time setup
                    conn.execute(
                        "INSERT INTO schema_info (version) VALUES (?)",
                        (self.SCHEMA_VERSION,)
                    )
                    
                    # Create default admin user
                    self._create_default_admin(conn)
                
                conn.commit()
                
        except Exception as e:
            self._logger.error(f"Failed to initialize database: {e}")
            raise DatabaseException(f"Database initialization failed: {e}")
    
    def _create_default_admin(self, conn: sqlite3.Connection):
        """Create default admin user."""
        try:
            admin_email = "admin@gmail.com"
            admin_password = generate_password_hash("Admin1sD@Best")  # Default password
            
            conn.execute("""
                INSERT OR IGNORE INTO users (email, password, school_name, is_admin)
                VALUES (?, ?, ?, ?)
            """, (admin_email, admin_password, "NinjaNerd Academy", True))
            
            self._logger.info("Default admin user created")
            
        except Exception as e:
            self._logger.error(f"Failed to create default admin: {e}")
    
    # ===============================
    # User Operations
    # ===============================
    
    def get_user(self, email: str, session_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get user data by email.
        
        Args:
            email: User email to retrieve
            session_id: Optional session ID for tracking
            
        Returns:
            User data dictionary or None if not found
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                # Get user basic info
                user_row = conn.execute(
                    "SELECT * FROM users WHERE email = ?",
                    (email,)
                ).fetchone()
                
                if not user_row:
                    return None
                
                # Convert to dict
                user_data = dict(user_row)
                
                # Get user history
                history_rows = conn.execute("""
                    SELECT question, user_answer, correct, topic, subtopic, grade, timestamp
                    FROM user_history
                    WHERE user_id = ?
                    ORDER BY timestamp DESC
                """, (user_data['id'],)).fetchall()
                
                user_data['history'] = [dict(row) for row in history_rows]
                
                return user_data
        
        return self._execute_read_operation(operation, session_id, f"get_user:{email}")
    
    def authenticate_user(self, email: str, password: str, session_id: Optional[str] = None) -> bool:
        """
        Authenticate user credentials.
        
        Args:
            email: User email
            password: Plain text password
            session_id: Optional session ID for tracking
            
        Returns:
            True if authentication successful
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                user_row = conn.execute(
                    "SELECT password FROM users WHERE email = ?",
                    (email,)
                ).fetchone()
                
                if not user_row:
                    return False
                
                stored_password = user_row['password']
                if not stored_password:
                    return False
                
                return check_password_hash(stored_password, password)
        
        return self._execute_read_operation(operation, session_id, f"authenticate:{email}")
    
    def get_all_users(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all users data.
        
        Args:
            session_id: Optional session ID for tracking
            
        Returns:
            All users data indexed by email
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                # Get all users
                user_rows = conn.execute("SELECT * FROM users").fetchall()
                
                users = {}
                for user_row in user_rows:
                    user_data = dict(user_row)
                    email = user_data['email']
                    
                    # Get history for each user
                    history_rows = conn.execute("""
                        SELECT question, user_answer, correct, topic, subtopic, grade, timestamp
                        FROM user_history
                        WHERE user_id = ?
                        ORDER BY timestamp DESC
                    """, (user_data['id'],)).fetchall()
                    
                    user_data['history'] = [dict(row) for row in history_rows]
                    users[email] = user_data
                
                return users
        
        return self._execute_read_operation(operation, session_id, "get_all_users")
    
    def create_user(self, email: str, password: str, school_name: str = None, session_id: Optional[str] = None) -> bool:
        """
        Create a new user.
        
        Args:
            email: User email
            password: Hashed password
            school_name: Optional school name
            session_id: Optional session ID for tracking
            
        Returns:
            True if created successfully
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                try:
                    conn.execute("""
                        INSERT INTO users (email, password, school_name)
                        VALUES (?, ?, ?)
                    """, (email, password, school_name))
                    conn.commit()
                    return True
                except sqlite3.IntegrityError:
                    raise ConcurrencyError(
                        f"User {email} already exists",
                        resource="users",
                        operation="create_user"
                    )
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"create_user:{email}"
        )
    
    def update_user(self, email: str, updates: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Update user data.
        
        Args:
            email: User email
            updates: Dictionary of fields to update
            session_id: Optional session ID for tracking
            
        Returns:
            True if updated successfully
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                # Build dynamic update query
                set_clauses = []
                values = []
                
                for key, value in updates.items():
                    if key in ['password', 'school_name']:
                        set_clauses.append(f"{key} = ?")
                        values.append(value)
                
                if not set_clauses:
                    return False
                
                set_clauses.append("updated_at = CURRENT_TIMESTAMP")
                values.append(email)
                
                query = f"""
                    UPDATE users
                    SET {', '.join(set_clauses)}
                    WHERE email = ?
                """
                
                cursor = conn.execute(query, values)
                conn.commit()
                
                if cursor.rowcount == 0:
                    raise DatabaseException(f"User {email} does not exist")
                
                return cursor.rowcount > 0
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"update_user:{email}"
        )
    
    def delete_user(self, email: str, session_id: Optional[str] = None) -> bool:
        """
        Delete a user and all associated data.
        
        Args:
            email: User email
            session_id: Optional session ID for tracking
            
        Returns:
            True if deleted successfully
        """
        def operation():
            with self.recovery_manager.safe_operation("user_deletion"):
                with self.connection_pool.get_connection() as conn:
                    # Check if user exists
                    user_row = conn.execute(
                        "SELECT id FROM users WHERE email = ?",
                        (email,)
                    ).fetchone()
                    
                    if not user_row:
                        return False
                    
                    # Delete user (cascading deletes will handle related data)
                    cursor = conn.execute(
                        "DELETE FROM users WHERE email = ?",
                        (email,)
                    )
                    conn.commit()
                    
                    return cursor.rowcount > 0
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"delete_user:{email}"
        )
    
    def add_user_history(self, email: str, history_entry: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Add entry to user history.
        
        Args:
            email: User email
            history_entry: History entry data
            session_id: Optional session ID for tracking
            
        Returns:
            True if added successfully
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                # Get user ID
                user_row = conn.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (email,)
                ).fetchone()
                
                if not user_row:
                    raise DatabaseException(f"User {email} does not exist")
                
                # Add history entry
                conn.execute("""
                    INSERT INTO user_history 
                    (user_id, question, user_answer, correct, topic, subtopic, grade, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_row['id'],
                    history_entry.get('question'),
                    history_entry.get('user_answer'),
                    history_entry.get('correct', False),
                    history_entry.get('topic'),
                    history_entry.get('subtopic'),
                    history_entry.get('grade'),
                    history_entry.get('timestamp', datetime.now().isoformat())
                ))
                conn.commit()
                return True
        
        return self._execute_write_operation(
            operation,
            Priority.NORMAL,
            session_id,
            f"add_history:{email}"
        )
    
    def update_user_history(self, email: str, history_entry: Dict[str, Any], session_id: Optional[str] = None) -> bool:
        """
        Alias for add_user_history to match JSON manager interface.
        
        Args:
            email: User email
            history_entry: History entry data
            session_id: Optional session ID for tracking
            
        Returns:
            True if added successfully
        """
        return self.add_user_history(email, history_entry, session_id)
    
    # ===============================
    # Collaboration Operations
    # ===============================
    
    def get_collaboration_data(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all collaboration data.
        
        Args:
            session_id: Optional session ID for tracking
        
        Returns:
            Dictionary with invites and chat_sessions
        """
        def operation():
            with self.connection_pool.get_connection() as conn:
                # Get invites
                invite_rows = conn.execute("""
                    SELECT i.id, u.email as from_user, i.to_user_email as to_user,
                           i.timestamp, i.status
                    FROM invites i
                    JOIN users u ON i.from_user_id = u.id
                    ORDER BY i.timestamp DESC
                """).fetchall()
                
                invites = {row['id']: {
                    'from_user': row['from_user'],
                    'to_user': row['to_user'],
                    'timestamp': row['timestamp'],
                    'status': row['status']
                } for row in invite_rows}
                
                # Get chat sessions
                session_rows = conn.execute("""
                    SELECT cs.id, u1.email as user1, u2.email as user2,
                           cs.active, cs.created_at
                    FROM chat_sessions cs
                    JOIN users u1 ON cs.user1_id = u1.id
                    JOIN users u2 ON cs.user2_id = u2.id
                    ORDER BY cs.created_at DESC
                """).fetchall()
                
                chat_sessions = {}
                for row in session_rows:
                    session_id = row['id']
                    
                    # Get messages for this session
                    message_rows = conn.execute("""
                        SELECT m.id, uf.email as from_user, ut.email as to_user,
                               m.message_content as message, m.timestamp, m.displayed
                        FROM messages m
                        JOIN users uf ON m.from_user_id = uf.id
                        JOIN users ut ON m.to_user_id = ut.id
                        WHERE m.session_id = ?
                        ORDER BY m.timestamp
                    """, (session_id,)).fetchall()
                    
                    messages = []
                    for msg_row in message_rows:
                        messages.append({
                            'id': msg_row['id'],
                            'from_user': msg_row['from_user'],
                            'to_user': msg_row['to_user'],
                            'message': msg_row['message'],
                            'timestamp': msg_row['timestamp'],
                            'displayed': bool(msg_row['displayed'])
                        })
                    
                    chat_sessions[session_id] = {
                        'user1': row['user1'],
                        'user2': row['user2'],
                        'messages': messages,
                        'active': bool(row['active']),
                        'created_at': row['created_at']
                    }
                
                return {
                    'invites': invites,
                    'chat_sessions': chat_sessions
                }
        
        return self._execute_read_operation(operation, session_id, "get_collaboration_data")
    
    def create_invite(self, from_user: str, to_user: str, session_id: Optional[str] = None) -> str:
        """
        Create a new invite.
        
        Args:
            from_user: Email of user sending invite
            to_user: Email of user receiving invite
            session_id: Optional session ID for tracking
            
        Returns:
            Invite ID
        """
        def operation():
            invite_id = str(uuid.uuid4())
            
            with self.connection_pool.get_connection() as conn:
                # Get from_user ID
                user_row = conn.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (from_user,)
                ).fetchone()
                
                if not user_row:
                    raise ValidationError(f"User {from_user} not found")
                
                conn.execute("""
                    INSERT INTO invites (id, from_user_id, to_user_email, status)
                    VALUES (?, ?, ?, 'pending')
                """, (invite_id, user_row['id'], to_user))
                conn.commit()
                return invite_id
        
        return self._execute_write_operation(
            operation,
            Priority.HIGH,
            session_id,
            f"create_invite:{from_user}→{to_user}"
        )
    
    def update_invite_status(self, invite_id: str, status: str) -> bool:
        """
        Update invite status.
        
        Args:
            invite_id: Invite ID
            status: New status ('accepted', 'rejected', etc.)
            
        Returns:
            True if updated successfully
        """
        try:
            with self.connection_pool.get_connection() as conn:
                cursor = conn.execute("""
                    UPDATE invites
                    SET status = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (status, invite_id))
                conn.commit()
                return cursor.rowcount > 0
            
        except Exception as e:
            self._logger.error(f"Failed to update invite {invite_id}: {e}")
            raise DatabaseException(f"Failed to update invite: {e}")
    
    # ===============================
    # Chat Session Operations
    # ===============================
    
    def create_chat_session(self, user1: str, user2: str) -> str:
        """
        Create a new chat session.
        
        Args:
            user1: First user email
            user2: Second user email
            
        Returns:
            Session ID
        """
        try:
            session_id = str(uuid.uuid4())
            
            with self.connection_pool.get_connection() as conn:
                # Get user IDs
                user1_row = conn.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (user1,)
                ).fetchone()
                
                user2_row = conn.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (user2,)
                ).fetchone()
                
                if not user1_row or not user2_row:
                    raise ValidationError("One or both users not found")
                
                conn.execute("""
                    INSERT INTO chat_sessions (id, user1_id, user2_id, active)
                    VALUES (?, ?, ?, TRUE)
                """, (session_id, user1_row['id'], user2_row['id']))
                conn.commit()
                return session_id
            
        except Exception as e:
            self._logger.error(f"Failed to create chat session {user1}-{user2}: {e}")
            raise DatabaseException(f"Failed to create chat session: {e}")
    
    def add_message(self, session_id: str, from_user: str, to_user: str, 
                   message: str, obfuscated_message: str = None) -> int:
        """
        Add a message to a chat session.
        
        Args:
            session_id: Chat session ID
            from_user: Sender email
            to_user: Recipient email
            message: Plain message content
            obfuscated_message: Obfuscated message content
            
        Returns:
            Message ID
        """
        try:
            with self.connection_pool.get_connection() as conn:
                # Get user IDs
                from_user_row = conn.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (from_user,)
                ).fetchone()
                
                to_user_row = conn.execute(
                    "SELECT id FROM users WHERE email = ?",
                    (to_user,)
                ).fetchone()
                
                if not from_user_row or not to_user_row:
                    raise ValidationError("One or both users not found")
                
                cursor = conn.execute("""
                    INSERT INTO messages 
                    (session_id, from_user_id, to_user_id, message_content, obfuscated_content)
                    VALUES (?, ?, ?, ?, ?)
                """, (session_id, from_user_row['id'], to_user_row['id'], 
                      message, obfuscated_message))
                
                conn.commit()
                return cursor.lastrowid
            
        except Exception as e:
            self._logger.error(f"Failed to add message to session {session_id}: {e}")
            raise DatabaseException(f"Failed to add message: {e}")
    
    def update_message_displayed(self, message_id: int, displayed: bool = True) -> bool:
        """
        Update message displayed status.
        
        Args:
            message_id: Message ID
            displayed: Whether message was displayed
            
        Returns:
            True if updated successfully
        """
        try:
            with self.connection_pool.get_connection() as conn:
                cursor = conn.execute("""
                    UPDATE messages
                    SET displayed = ?
                    WHERE id = ?
                """, (displayed, message_id))
                conn.commit()
                return cursor.rowcount > 0
            
        except Exception as e:
            self._logger.error(f"Failed to update message {message_id} displayed status: {e}")
            return False
    
    # ===============================
    # Utility Operations
    # ===============================
    
    def cleanup_old_data(self, days: int = 30):
        """
        Cleanup old data from database.
        
        Args:
            days: Number of days to keep data
        """
        try:
            with self.connection_pool.get_connection() as conn:
                cutoff_date = datetime.now() - timedelta(days=days)
                
                # Clean old messages
                conn.execute("""
                    DELETE FROM messages 
                    WHERE timestamp < ? AND displayed = TRUE
                """, (cutoff_date.isoformat(),))
                
                # Clean old invites
                conn.execute("""
                    DELETE FROM invites 
                    WHERE timestamp < ? AND status IN ('rejected', 'expired')
                """, (cutoff_date.isoformat(),))
                
                # Clean inactive sessions
                conn.execute("""
                    DELETE FROM chat_sessions 
                    WHERE created_at < ? AND active = FALSE
                    AND id NOT IN (SELECT DISTINCT session_id FROM messages)
                """, (cutoff_date.isoformat(),))
                
                conn.commit()
                return True
            
        except Exception as e:
            self._logger.error(f"Failed to cleanup old data: {e}")
            return False
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get database statistics.
        
        Returns:
            Dictionary with database statistics
        """
        try:
            with self.connection_pool.get_connection() as conn:
                stats = {}
                
                # User statistics
                stats['total_users'] = conn.execute(
                    "SELECT COUNT(*) as count FROM users"
                ).fetchone()['count']
                
                # Active sessions
                stats['active_sessions'] = conn.execute(
                    "SELECT COUNT(*) as count FROM chat_sessions WHERE active = TRUE"
                ).fetchone()['count']
                
                # Total messages
                stats['total_messages'] = conn.execute(
                    "SELECT COUNT(*) as count FROM messages"
                ).fetchone()['count']
                
                # Pending invites
                stats['pending_invites'] = conn.execute(
                    "SELECT COUNT(*) as count FROM invites WHERE status = 'pending'"
                ).fetchone()['count']
                
                return stats
            
        except Exception as e:
            self._logger.error(f"Failed to get statistics: {e}")
            return {}
    
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
    
    # ===============================
    # Database Maintenance & Health
    # ===============================
    
    def vacuum_database(self) -> bool:
        """
        Perform VACUUM operation to optimize database.
        
        Returns:
            True if successful
        """
        try:
            with self.recovery_manager.safe_operation("vacuum"):
                with self.connection_pool.get_connection() as conn:
                    self._logger.info("Starting database VACUUM operation")
                    conn.execute("VACUUM")
                    self._logger.info("Database VACUUM completed successfully")
                    return True
        except Exception as e:
            self._logger.error(f"Database VACUUM failed: {e}")
            return False
    
    def check_database_health(self, force_check: bool = False) -> Dict[str, Any]:
        """
        Check database health and return status.
        
        Args:
            force_check: Force immediate check regardless of timing
            
        Returns:
            Database health status dictionary
        """
        try:
            health_result = self.recovery_manager.check_and_repair_if_needed(force_check)
            
            return {
                'status': health_result.status.value,
                'message': health_result.message,
                'timestamp': health_result.timestamp.isoformat(),
                'response_time_ms': health_result.response_time_ms,
                'details': health_result.details,
                'recommendations': health_result.recommendations
            }
        except Exception as e:
            self._logger.error(f"Health check failed: {e}")
            return {
                'status': 'critical',
                'message': f"Health check failed: {e}",
                'timestamp': datetime.now().isoformat(),
                'response_time_ms': 0,
                'details': {'error': str(e)},
                'recommendations': ['Manual intervention required']
            }
    
    def create_backup(self, operation_name: str = "manual") -> str:
        """
        Create database backup.
        
        Args:
            operation_name: Name for backup identification
            
        Returns:
            Path to created backup
        """
        try:
            return self.recovery_manager.health_monitor.create_safety_backup(operation_name)
        except Exception as e:
            self._logger.error(f"Backup creation failed: {e}")
            raise BackupError(f"Failed to create backup: {e}")
    
    def restore_from_backup(self, backup_path: str = None) -> bool:
        """
        Restore database from backup.
        
        Args:
            backup_path: Specific backup to restore (uses latest if None)
            
        Returns:
            True if restore successful
        """
        try:
            restore_result = self.recovery_manager.health_monitor.restore_from_backup(backup_path)
            return restore_result.status.value in ['healthy', 'warning']
        except Exception as e:
            self._logger.error(f"Database restore failed: {e}")
            return False
    
    def get_recovery_status(self) -> Dict[str, Any]:
        """
        Get comprehensive recovery and health status.
        
        Returns:
            Recovery status dictionary
        """
        try:
            return self.recovery_manager.get_recovery_status()
        except Exception as e:
            self._logger.error(f"Failed to get recovery status: {e}")
            return {
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def force_database_repair(self) -> bool:
        """
        Force immediate database repair attempt.
        
        Returns:
            True if repair successful
        """
        try:
            repair_result = self.recovery_manager.force_recovery("repair")
            return repair_result.status.value in ['healthy', 'warning']
        except Exception as e:
            self._logger.error(f"Forced repair failed: {e}")
            return False
    
    def cleanup_old_backups(self, retention_days: int = 7) -> int:
        """
        Clean up old backup files.
        
        Args:
            retention_days: Days to retain backups
            
        Returns:
            Number of backups cleaned up
        """
        try:
            return self.recovery_manager.health_monitor.cleanup_old_backups(retention_days)
        except Exception as e:
            self._logger.error(f"Backup cleanup failed: {e}")
            return 0
    
    def enable_auto_recovery(self, include_restore: bool = False):
        """
        Enable automatic recovery features.
        
        Args:
            include_restore: Whether to enable auto-restore from backup
        """
        self.recovery_manager.enable_auto_recovery(include_restore)
        self._logger.info(f"Auto-recovery enabled (restore: {include_restore})")
    
    def disable_auto_recovery(self):
        """Disable automatic recovery features."""
        self.recovery_manager.disable_auto_recovery()
        self._logger.info("Auto-recovery disabled")
    
    def close(self):
        """Close all database connections and cleanup."""
        try:
            # Cleanup recovery state
            self.recovery_manager.cleanup_recovery_state()
            
            # Close connection pool
            self.connection_pool.close_all()
            
            self._logger.info("SQLiteManager closed successfully")
        except Exception as e:
            self._logger.error(f"Error closing SQLiteManager: {e}")
    
    def __del__(self):
        """Destructor to ensure cleanup."""
        try:
            self.close()
        except:
            pass
