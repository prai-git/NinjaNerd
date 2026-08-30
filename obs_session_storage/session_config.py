"""
Session configuration module for production-ready session management.

Provides configuration for Redis sessions, filesystem fallback,
and session encryption settings.
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import timedelta
from dataclasses import dataclass, field
from cryptography.fernet import Fernet
import base64


@dataclass
class SessionConfig:
    """Configuration class for session storage settings."""
    
    # Redis configuration
    redis_host: str = field(default_factory=lambda: os.getenv('REDIS_HOST', 'localhost'))
    redis_port: int = field(default_factory=lambda: int(os.getenv('REDIS_PORT', '6379')))
    redis_password: Optional[str] = field(default_factory=lambda: os.getenv('REDIS_PASSWORD'))
    redis_db: int = field(default_factory=lambda: int(os.getenv('REDIS_DB', '0')))
    redis_url: Optional[str] = field(default_factory=lambda: os.getenv('REDIS_URL'))
    
    # Session settings
    session_timeout: timedelta = field(default=timedelta(minutes=30))
    permanent_session_lifetime: timedelta = field(default=timedelta(minutes=30))
    
    # Encryption settings
    session_encryption_key: Optional[str] = field(default_factory=lambda: os.getenv('SESSION_ENCRYPTION_KEY'))
    encrypt_sessions: bool = field(default=True)
    
    # Fallback settings
    enable_filesystem_fallback: bool = field(default=True)
    filesystem_session_dir: str = field(default='flask_session')
    
    # Health check settings
    health_check_interval: int = field(default=60)  # seconds
    redis_connection_timeout: int = field(default=5)  # seconds
    redis_socket_timeout: int = field(default=5)  # seconds
    
    # Performance settings
    redis_connection_pool_size: int = field(default=50)
    redis_retry_on_timeout: bool = field(default=True)
    redis_health_check_interval: int = field(default=30)
    
    def __post_init__(self):
        """Post-initialization setup."""
        self.logger = logging.getLogger(__name__)
        
        # Generate encryption key if not provided
        if self.encrypt_sessions and not self.session_encryption_key:
            self.session_encryption_key = self._generate_encryption_key()
            self.logger.warning(
                "Generated new session encryption key. "
                "For production, set SESSION_ENCRYPTION_KEY environment variable."
            )
    
    def _generate_encryption_key(self) -> str:
        """Generate a new encryption key for sessions."""
        key = Fernet.generate_key()
        return base64.urlsafe_b64encode(key).decode('utf-8')
    
    def get_redis_connection_params(self) -> Dict[str, Any]:
        """Get Redis connection parameters."""
        if self.redis_url:
            return {
                'url': self.redis_url,
                'socket_timeout': self.redis_socket_timeout,
                'socket_connect_timeout': self.redis_connection_timeout,
                'retry_on_timeout': self.redis_retry_on_timeout,
                'health_check_interval': self.redis_health_check_interval
            }
        
        params = {
            'host': self.redis_host,
            'port': self.redis_port,
            'db': self.redis_db,
            'socket_timeout': self.redis_socket_timeout,
            'socket_connect_timeout': self.redis_connection_timeout,
            'retry_on_timeout': self.redis_retry_on_timeout,
            'health_check_interval': self.redis_health_check_interval
        }
        
        if self.redis_password:
            params['password'] = self.redis_password
            
        return params
    
    def get_flask_session_config(self) -> Dict[str, Any]:
        """Get Flask session configuration."""
        return {
            'SESSION_PERMANENT': False,
            'PERMANENT_SESSION_LIFETIME': self.permanent_session_lifetime,
            'SESSION_USE_SIGNER': True,
            'SESSION_KEY_PREFIX': 'ninjnerd:session:',
            'SESSION_REDIS': None,  # Will be set by RedisSessionManager
            'SESSION_TYPE': 'redis'  # Will fallback to filesystem if Redis unavailable
        }
    
    def validate_config(self) -> bool:
        """Validate configuration settings."""
        try:
            # Validate Redis connection parameters
            if not self.redis_host:
                self.logger.error("Redis host not specified")
                return False
                
            if not (1 <= self.redis_port <= 65535):
                self.logger.error(f"Invalid Redis port: {self.redis_port}")
                return False
                
            # Validate session timeout
            if self.session_timeout.total_seconds() <= 0:
                self.logger.error("Session timeout must be positive")
                return False
                
            # Validate encryption key if encryption is enabled
            if self.encrypt_sessions and self.session_encryption_key:
                try:
                    # Test encryption key validity
                    key_bytes = base64.urlsafe_b64decode(self.session_encryption_key.encode('utf-8'))
                    Fernet(key_bytes)
                except Exception as e:
                    self.logger.error(f"Invalid encryption key: {e}")
                    return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"Configuration validation failed: {e}")
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary (excluding sensitive data)."""
        return {
            'redis_host': self.redis_host,
            'redis_port': self.redis_port,
            'redis_db': self.redis_db,
            'session_timeout_minutes': int(self.session_timeout.total_seconds() / 60),
            'encrypt_sessions': self.encrypt_sessions,
            'enable_filesystem_fallback': self.enable_filesystem_fallback,
            'filesystem_session_dir': self.filesystem_session_dir,
            'health_check_interval': self.health_check_interval,
            'redis_connection_pool_size': self.redis_connection_pool_size
        }
