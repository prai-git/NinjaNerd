"""
Redis-based session manager with filesystem fallback.

Provides production-ready session storage with encryption,
health monitoring, and graceful degradation.
"""

import os
import json
import logging
import time
import threading
from typing import Dict, Any, Optional, Union
from datetime import datetime, timedelta
from contextlib import contextmanager
from dataclasses import dataclass

try:
    import redis
    from redis.connection import ConnectionPool
    from redis.exceptions import ConnectionError, TimeoutError, RedisError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from cryptography.fernet import Fernet
import base64
import uuid

from .session_config import SessionConfig


@dataclass
class SessionMetrics:
    """Session metrics for monitoring."""
    total_sessions: int = 0
    active_sessions: int = 0
    redis_sessions: int = 0
    filesystem_sessions: int = 0
    failed_operations: int = 0
    last_health_check: Optional[datetime] = None
    redis_available: bool = False


class RedisSessionManager:
    """
    Production-ready session manager with Redis and filesystem fallback.
    """
    
    def __init__(self, config: SessionConfig):
        """Initialize the session manager."""
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.metrics = SessionMetrics()
        
        # Thread safety
        self._lock = threading.RLock()
        self._redis_client = None
        self._connection_pool = None
        self._fernet = None
        
        # Fallback storage
        self._filesystem_sessions: Dict[str, Dict[str, Any]] = {}
        self._session_file_locks: Dict[str, threading.Lock] = {}
        
        # Health monitoring
        self._last_redis_check = None
        self._redis_healthy = False
        self._health_check_thread = None
        self._shutdown_event = threading.Event()
        
        self._initialize()
    
    def _initialize(self):
        """Initialize the session manager components."""
        try:
            # Initialize encryption if enabled
            if self.config.encrypt_sessions and self.config.session_encryption_key:
                key_bytes = base64.urlsafe_b64decode(self.config.session_encryption_key.encode('utf-8'))
                self._fernet = Fernet(key_bytes)
                self.logger.info("Session encryption initialized")
            
            # Initialize Redis connection
            self._initialize_redis()
            
            # Initialize filesystem fallback
            self._initialize_filesystem_fallback()
            
            # Start health monitoring
            self._start_health_monitoring()
            
            self.logger.info("RedisSessionManager initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize RedisSessionManager: {e}")
            raise
    
    def _initialize_redis(self):
        """Initialize Redis connection with connection pooling."""
        if not REDIS_AVAILABLE:
            self.logger.warning("Redis not available, using filesystem fallback only")
            return
            
        try:
            connection_params = self.config.get_redis_connection_params()
            
            # Create connection pool
            self._connection_pool = ConnectionPool(
                max_connections=self.config.redis_connection_pool_size,
                **connection_params
            )
            
            # Create Redis client
            self._redis_client = redis.Redis(connection_pool=self._connection_pool)
            
            # Test connection
            self._redis_client.ping()
            self._redis_healthy = True
            self.metrics.redis_available = True
            
            self.logger.info("Redis session storage initialized")
            
        except Exception as e:
            self.logger.warning(f"Redis initialization failed: {e}. Using filesystem fallback.")
            self._redis_client = None
            self._redis_healthy = False
            self.metrics.redis_available = False
    
    def _initialize_filesystem_fallback(self):
        """Initialize filesystem fallback session storage."""
        if not self.config.enable_filesystem_fallback:
            return
            
        try:
            session_dir = self.config.filesystem_session_dir
            if not os.path.exists(session_dir):
                os.makedirs(session_dir, mode=0o755)
                
            self.logger.info(f"Filesystem fallback initialized: {session_dir}")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize filesystem fallback: {e}")
            raise
    
    def _start_health_monitoring(self):
        """Start background health monitoring thread."""
        if self._health_check_thread and self._health_check_thread.is_alive():
            return
            
        self._health_check_thread = threading.Thread(
            target=self._health_check_worker,
            daemon=True,
            name="SessionHealthChecker"
        )
        self._health_check_thread.start()
        self.logger.info("Session health monitoring started")
    
    def _health_check_worker(self):
        """Background worker for health checks."""
        while not self._shutdown_event.is_set():
            try:
                self._perform_health_check()
                time.sleep(self.config.health_check_interval)
            except Exception as e:
                self.logger.error(f"Health check error: {e}")
                time.sleep(self.config.health_check_interval)
    
    def _perform_health_check(self):
        """Perform health check on Redis connection."""
        if not self._redis_client:
            return
            
        try:
            start_time = time.time()
            self._redis_client.ping()
            response_time = time.time() - start_time
            
            self._redis_healthy = True
            self.metrics.redis_available = True
            self.metrics.last_health_check = datetime.now()
            
            if response_time > 1.0:  # Warn if Redis is slow
                self.logger.warning(f"Redis response time high: {response_time:.2f}s")
                
        except Exception as e:
            self._redis_healthy = False
            self.metrics.redis_available = False
            self.logger.warning(f"Redis health check failed: {e}")
    
    def _encrypt_data(self, data: str) -> str:
        """Encrypt session data if encryption is enabled."""
        if not self._fernet:
            return data
        return self._fernet.encrypt(data.encode('utf-8')).decode('utf-8')
    
    def _decrypt_data(self, encrypted_data: str) -> str:
        """Decrypt session data if encryption is enabled."""
        if not self._fernet:
            return encrypted_data
        try:
            return self._fernet.decrypt(encrypted_data.encode('utf-8')).decode('utf-8')
        except Exception as e:
            self.logger.error(f"Failed to decrypt session data: {e}")
            raise
    
    def _get_session_key(self, session_id: str) -> str:
        """Get Redis key for session."""
        return f"ninjnerd:session:{session_id}"
    
    def create_session(self, session_data: Dict[str, Any]) -> str:
        """Create a new session."""
        session_id = str(uuid.uuid4())
        
        try:
            with self._lock:
                # Add metadata
                session_data_with_meta = {
                    **session_data,
                    '_created_at': datetime.now().isoformat(),
                    '_last_accessed': datetime.now().isoformat(),
                    '_session_id': session_id
                }
                
                # Try Redis first
                if self._store_session_redis(session_id, session_data_with_meta):
                    self.metrics.redis_sessions += 1
                    self.logger.debug(f"Session {session_id} created in Redis")
                else:
                    # Fallback to filesystem
                    self._store_session_filesystem(session_id, session_data_with_meta)
                    self.metrics.filesystem_sessions += 1
                    self.logger.debug(f"Session {session_id} created in filesystem")
                
                self.metrics.total_sessions += 1
                self.metrics.active_sessions += 1
                
                return session_id
                
        except Exception as e:
            self.logger.error(f"Failed to create session: {e}")
            self.metrics.failed_operations += 1
            raise
    
    def _store_session_redis(self, session_id: str, session_data: Dict[str, Any]) -> bool:
        """Store session in Redis."""
        if not self._redis_healthy or not self._redis_client:
            return False
            
        try:
            key = self._get_session_key(session_id)
            data_json = json.dumps(session_data)
            
            if self.config.encrypt_sessions:
                data_json = self._encrypt_data(data_json)
            
            # Set with expiration
            ttl = int(self.config.session_timeout.total_seconds())
            self._redis_client.setex(key, ttl, data_json)
            
            return True
            
        except Exception as e:
            self.logger.warning(f"Failed to store session in Redis: {e}")
            self._redis_healthy = False
            return False
    
    def _store_session_filesystem(self, session_id: str, session_data: Dict[str, Any]):
        """Store session in filesystem."""
        if not self.config.enable_filesystem_fallback:
            raise RuntimeError("Session storage failed: Redis unavailable and filesystem fallback disabled")
        
        try:
            session_file = os.path.join(
                self.config.filesystem_session_dir,
                f"session_{session_id}.json"
            )
            
            # Get or create file lock
            if session_id not in self._session_file_locks:
                self._session_file_locks[session_id] = threading.Lock()
            
            with self._session_file_locks[session_id]:
                data_json = json.dumps(session_data, indent=2)
                
                if self.config.encrypt_sessions:
                    data_json = self._encrypt_data(data_json)
                
                # Atomic write
                temp_file = f"{session_file}.tmp"
                with open(temp_file, 'w') as f:
                    f.write(data_json)
                
                os.rename(temp_file, session_file)
                
                # Store in memory for quick access
                self._filesystem_sessions[session_id] = session_data
                
        except Exception as e:
            self.logger.error(f"Failed to store session in filesystem: {e}")
            raise
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve session data."""
        try:
            with self._lock:
                # Try Redis first
                session_data = self._get_session_redis(session_id)
                
                if session_data is None:
                    # Fallback to filesystem
                    session_data = self._get_session_filesystem(session_id)
                
                if session_data:
                    # Update last accessed time
                    session_data['_last_accessed'] = datetime.now().isoformat()
                    self._update_session_access_time(session_id, session_data)
                
                return session_data
                
        except Exception as e:
            self.logger.error(f"Failed to get session {session_id}: {e}")
            self.metrics.failed_operations += 1
            return None
    
    def _get_session_redis(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from Redis."""
        if not self._redis_healthy or not self._redis_client:
            return None
            
        try:
            key = self._get_session_key(session_id)
            data = self._redis_client.get(key)
            
            if data is None:
                return None
            
            data_str = data.decode('utf-8')
            
            if self.config.encrypt_sessions:
                data_str = self._decrypt_data(data_str)
            
            return json.loads(data_str)
            
        except Exception as e:
            self.logger.warning(f"Failed to get session from Redis: {e}")
            return None
    
    def _get_session_filesystem(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from filesystem."""
        if not self.config.enable_filesystem_fallback:
            return None
        
        try:
            # Check memory cache first
            if session_id in self._filesystem_sessions:
                return self._filesystem_sessions[session_id]
            
            session_file = os.path.join(
                self.config.filesystem_session_dir,
                f"session_{session_id}.json"
            )
            
            if not os.path.exists(session_file):
                return None
            
            # Check if session has expired
            file_mtime = datetime.fromtimestamp(os.path.getmtime(session_file))
            if datetime.now() - file_mtime > self.config.session_timeout:
                self._delete_session_filesystem(session_id)
                return None
            
            with open(session_file, 'r') as f:
                data_str = f.read()
            
            if self.config.encrypt_sessions:
                data_str = self._decrypt_data(data_str)
            
            session_data = json.loads(data_str)
            
            # Cache in memory
            self._filesystem_sessions[session_id] = session_data
            
            return session_data
            
        except Exception as e:
            self.logger.warning(f"Failed to get session from filesystem: {e}")
            return None
    
    def _update_session_access_time(self, session_id: str, session_data: Dict[str, Any]):
        """Update session last access time."""
        try:
            # Try Redis first
            if not self._store_session_redis(session_id, session_data):
                # Fallback to filesystem
                self._store_session_filesystem(session_id, session_data)
                
        except Exception as e:
            self.logger.warning(f"Failed to update session access time: {e}")
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        try:
            with self._lock:
                deleted = False
                
                # Delete from Redis
                if self._delete_session_redis(session_id):
                    deleted = True
                    self.metrics.redis_sessions = max(0, self.metrics.redis_sessions - 1)
                
                # Delete from filesystem
                if self._delete_session_filesystem(session_id):
                    deleted = True
                    self.metrics.filesystem_sessions = max(0, self.metrics.filesystem_sessions - 1)
                
                if deleted:
                    self.metrics.active_sessions = max(0, self.metrics.active_sessions - 1)
                
                return deleted
                
        except Exception as e:
            self.logger.error(f"Failed to delete session {session_id}: {e}")
            self.metrics.failed_operations += 1
            return False
    
    def _delete_session_redis(self, session_id: str) -> bool:
        """Delete session from Redis."""
        if not self._redis_healthy or not self._redis_client:
            return False
            
        try:
            key = self._get_session_key(session_id)
            result = self._redis_client.delete(key)
            return result > 0
            
        except Exception as e:
            self.logger.warning(f"Failed to delete session from Redis: {e}")
            return False
    
    def _delete_session_filesystem(self, session_id: str) -> bool:
        """Delete session from filesystem."""
        try:
            # Remove from memory cache
            if session_id in self._filesystem_sessions:
                del self._filesystem_sessions[session_id]
            
            # Remove file lock
            if session_id in self._session_file_locks:
                del self._session_file_locks[session_id]
            
            # Remove file
            session_file = os.path.join(
                self.config.filesystem_session_dir,
                f"session_{session_id}.json"
            )
            
            if os.path.exists(session_file):
                os.remove(session_file)
                return True
                
            return False
            
        except Exception as e:
            self.logger.warning(f"Failed to delete session from filesystem: {e}")
            return False
    
    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions."""
        cleaned_count = 0
        
        try:
            with self._lock:
                # Cleanup Redis sessions (Redis handles TTL automatically)
                # We just need to clean up filesystem sessions
                
                if self.config.enable_filesystem_fallback:
                    cleaned_count += self._cleanup_filesystem_sessions()
                
                self.logger.info(f"Cleaned up {cleaned_count} expired sessions")
                return cleaned_count
                
        except Exception as e:
            self.logger.error(f"Failed to cleanup expired sessions: {e}")
            return 0
    
    def _cleanup_filesystem_sessions(self) -> int:
        """Clean up expired filesystem sessions."""
        cleaned_count = 0
        
        try:
            session_dir = self.config.filesystem_session_dir
            if not os.path.exists(session_dir):
                return 0
            
            current_time = datetime.now()
            
            for filename in os.listdir(session_dir):
                if not filename.startswith('session_') or not filename.endswith('.json'):
                    continue
                
                session_file = os.path.join(session_dir, filename)
                
                try:
                    file_mtime = datetime.fromtimestamp(os.path.getmtime(session_file))
                    
                    if current_time - file_mtime > self.config.session_timeout:
                        # Extract session ID from filename
                        session_id = filename[8:-5]  # Remove 'session_' prefix and '.json' suffix
                        
                        if self._delete_session_filesystem(session_id):
                            cleaned_count += 1
                            
                except Exception as e:
                    self.logger.warning(f"Failed to cleanup session file {filename}: {e}")
                    continue
            
            return cleaned_count
            
        except Exception as e:
            self.logger.error(f"Failed to cleanup filesystem sessions: {e}")
            return 0
    
    def get_session_metrics(self) -> SessionMetrics:
        """Get current session metrics."""
        return self.metrics
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get health status of session storage."""
        return {
            'redis_available': self.metrics.redis_available,
            'redis_healthy': self._redis_healthy,
            'filesystem_fallback_enabled': self.config.enable_filesystem_fallback,
            'total_sessions': self.metrics.total_sessions,
            'active_sessions': self.metrics.active_sessions,
            'redis_sessions': self.metrics.redis_sessions,
            'filesystem_sessions': self.metrics.filesystem_sessions,
            'failed_operations': self.metrics.failed_operations,
            'last_health_check': self.metrics.last_health_check.isoformat() if self.metrics.last_health_check else None,
            'session_timeout_minutes': int(self.config.session_timeout.total_seconds() / 60),
            'encryption_enabled': self.config.encrypt_sessions
        }
    
    def shutdown(self):
        """Shutdown the session manager."""
        try:
            self._shutdown_event.set()
            
            if self._health_check_thread and self._health_check_thread.is_alive():
                self._health_check_thread.join(timeout=5)
            
            if self._connection_pool:
                self._connection_pool.disconnect()
            
            self.logger.info("RedisSessionManager shutdown completed")
            
        except Exception as e:
            self.logger.error(f"Error during shutdown: {e}")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
