"""
Enhanced session management for database operations.

This module provides session tracking, validation, and cleanup
for database operations across concurrent users.
"""

import threading
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional, Set, Any
from dataclasses import dataclass
import logging

from .exceptions import SessionError


@dataclass
class DBSession:
    """Represents a database session."""
    session_id: str
    user_id: str
    operation_type: str
    created_at: datetime
    last_activity: datetime
    is_active: bool = True
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
    
    def update_activity(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = datetime.now()
    
    def is_expired(self, timeout_minutes: int = 30) -> bool:
        """Check if session is expired."""
        if not self.is_active:
            return True
        
        expiry_time = self.last_activity + timedelta(minutes=timeout_minutes)
        return datetime.now() > expiry_time
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert session to dictionary."""
        return {
            'session_id': self.session_id,
            'user_id': self.user_id,
            'operation_type': self.operation_type,
            'created_at': self.created_at.isoformat(),
            'last_activity': self.last_activity.isoformat(),
            'is_active': self.is_active,
            'metadata': self.metadata
        }


class SessionManager:
    """
    Enhanced session management for database operations.
    
    Features:
    - Session tracking per database operation
    - Session validation and cleanup
    - Concurrent session handling
    """
    
    def __init__(self, session_timeout_minutes: int = 30, cleanup_interval_minutes: int = 5):
        """
        Initialize session manager.
        
        Args:
            session_timeout_minutes: Session timeout in minutes
            cleanup_interval_minutes: How often to run cleanup in minutes
        """
        self.session_timeout_minutes = session_timeout_minutes
        self.cleanup_interval_minutes = cleanup_interval_minutes
        
        # Thread-safe storage for sessions
        self._sessions: Dict[str, DBSession] = {}
        self._user_sessions: Dict[str, Set[str]] = {}  # user_id -> set of session_ids
        self._lock = threading.RLock()
        
        # Statistics
        self._stats = {
            'sessions_created': 0,
            'sessions_expired': 0,
            'sessions_invalidated': 0,
            'active_sessions': 0
        }
        
        # Cleanup thread
        self._shutdown = threading.Event()
        self._cleanup_thread = threading.Thread(
            target=self._periodic_cleanup,
            daemon=True
        )
        self._cleanup_thread.start()
        
        self._logger = logging.getLogger(__name__)
    
    def create_db_session(self, user_id: str, operation_type: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        Create a new database session.
        
        Args:
            user_id: User identifier
            operation_type: Type of operation (read/write/auth)
            metadata: Optional session metadata
            
        Returns:
            Session ID
            
        Raises:
            SessionError: If session creation fails
        """
        try:
            with self._lock:
                session_id = str(uuid.uuid4())
                now = datetime.now()
                
                session = DBSession(
                    session_id=session_id,
                    user_id=user_id,
                    operation_type=operation_type,
                    created_at=now,
                    last_activity=now,
                    metadata=metadata or {}
                )
                
                # Store session
                self._sessions[session_id] = session
                
                # Track user sessions
                if user_id not in self._user_sessions:
                    self._user_sessions[user_id] = set()
                self._user_sessions[user_id].add(session_id)
                
                # Update statistics
                self._stats['sessions_created'] += 1
                self._stats['active_sessions'] = len(self._sessions)
                
                self._logger.debug(f"Created session {session_id} for user {user_id} ({operation_type})")
                return session_id
                
        except Exception as e:
            raise SessionError(
                f"Failed to create session for user {user_id}: {str(e)}",
                user_id=user_id
            )
    
    def validate_db_session(self, session_id: str) -> bool:
        """
        Validate a database session.
        
        Args:
            session_id: Session ID to validate
            
        Returns:
            True if session is valid
            
        Raises:
            SessionError: If validation fails
        """
        try:
            with self._lock:
                if session_id not in self._sessions:
                    return False
                
                session = self._sessions[session_id]
                
                # Check if session is expired
                if session.is_expired(self.session_timeout_minutes):
                    self._invalidate_session(session_id)
                    return False
                
                # Update activity
                session.update_activity()
                return True
                
        except Exception as e:
            raise SessionError(
                f"Failed to validate session {session_id}: {str(e)}",
                session_id=session_id
            )
    
    def get_session(self, session_id: str) -> Optional[DBSession]:
        """
        Get session by ID.
        
        Args:
            session_id: Session ID
            
        Returns:
            DBSession object or None if not found
        """
        with self._lock:
            return self._sessions.get(session_id)
    
    def invalidate_session(self, session_id: str) -> None:
        """
        Manually invalidate a session.
        
        Args:
            session_id: Session ID to invalidate
        """
        with self._lock:
            self._invalidate_session(session_id)
    
    def invalidate_user_sessions(self, user_id: str) -> int:
        """
        Invalidate all sessions for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            Number of sessions invalidated
        """
        with self._lock:
            if user_id not in self._user_sessions:
                return 0
            
            session_ids = self._user_sessions[user_id].copy()
            count = 0
            
            for session_id in session_ids:
                if session_id in self._sessions:
                    self._invalidate_session(session_id)
                    count += 1
            
            return count
    
    def cleanup_expired_sessions(self) -> int:
        """
        Clean up expired sessions.
        
        Returns:
            Number of sessions cleaned up
        """
        with self._lock:
            expired_sessions = []
            
            for session_id, session in self._sessions.items():
                if session.is_expired(self.session_timeout_minutes):
                    expired_sessions.append(session_id)
            
            for session_id in expired_sessions:
                self._invalidate_session(session_id)
            
            if expired_sessions:
                self._logger.info(f"Cleaned up {len(expired_sessions)} expired sessions")
            
            return len(expired_sessions)
    
    def get_active_sessions(self) -> Dict[str, Any]:
        """
        Get information about active sessions.
        
        Returns:
            Dictionary containing session information
        """
        with self._lock:
            active_sessions = {}
            user_session_counts = {}
            
            for session_id, session in self._sessions.items():
                if session.is_active and not session.is_expired(self.session_timeout_minutes):
                    active_sessions[session_id] = session.to_dict()
                    
                    # Count sessions per user
                    if session.user_id not in user_session_counts:
                        user_session_counts[session.user_id] = 0
                    user_session_counts[session.user_id] += 1
            
            return {
                'total_active_sessions': len(active_sessions),
                'sessions': active_sessions,
                'user_session_counts': user_session_counts,
                'statistics': self._stats.copy()
            }
    
    def get_user_sessions(self, user_id: str) -> Dict[str, DBSession]:
        """
        Get all active sessions for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            Dictionary of session_id -> DBSession
        """
        with self._lock:
            user_sessions = {}
            
            if user_id in self._user_sessions:
                for session_id in self._user_sessions[user_id]:
                    if session_id in self._sessions:
                        session = self._sessions[session_id]
                        if session.is_active and not session.is_expired(self.session_timeout_minutes):
                            user_sessions[session_id] = session
            
            return user_sessions
    
    def shutdown(self) -> None:
        """Shutdown session manager."""
        self._logger.info("Shutting down session manager...")
        self._shutdown.set()
        
        if self._cleanup_thread.is_alive():
            self._cleanup_thread.join(timeout=5)
        
        with self._lock:
            # Invalidate all sessions
            for session_id in list(self._sessions.keys()):
                self._invalidate_session(session_id)
        
        self._logger.info("Session manager shutdown complete")
    
    def _invalidate_session(self, session_id: str) -> None:
        """Internal method to invalidate a session (must be called with lock held)."""
        if session_id not in self._sessions:
            return
        
        session = self._sessions[session_id]
        session.is_active = False
        
        # Remove from user sessions
        if session.user_id in self._user_sessions:
            self._user_sessions[session.user_id].discard(session_id)
            if not self._user_sessions[session.user_id]:
                del self._user_sessions[session.user_id]
        
        # Remove from sessions
        del self._sessions[session_id]
        
        # Update statistics
        self._stats['sessions_invalidated'] += 1
        self._stats['active_sessions'] = len(self._sessions)
        
        self._logger.debug(f"Invalidated session {session_id} for user {session.user_id}")
    
    def _periodic_cleanup(self) -> None:
        """Periodic cleanup of expired sessions."""
        while not self._shutdown.is_set():
            try:
                expired_count = self.cleanup_expired_sessions()
                if expired_count > 0:
                    self._stats['sessions_expired'] += expired_count
                
                # Wait for next cleanup interval
                self._shutdown.wait(timeout=self.cleanup_interval_minutes * 60)
                
            except Exception as e:
                self._logger.error(f"Error during session cleanup: {e}")
                time.sleep(60)  # Wait 1 minute before retrying
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.shutdown()
