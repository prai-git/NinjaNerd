"""
Logging configuration module for production-ready logging system.

Provides configuration for rotating file handlers, structured logging,
and performance monitoring with comprehensive error tracking.
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import timedelta
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class LogLevel(Enum):
    """Log level enumeration."""
    DEBUG = logging.DEBUG
    INFO = logging.INFO
    WARNING = logging.WARNING
    ERROR = logging.ERROR
    CRITICAL = logging.CRITICAL


class LogFormat(Enum):
    """Log format types."""
    SIMPLE = "simple"
    DETAILED = "detailed"
    JSON = "json"
    PRODUCTION = "production"


@dataclass
class LogConfig:
    """Configuration class for production logging system."""
    
    # Basic configuration
    log_level: str = field(default_factory=lambda: os.getenv('LOG_LEVEL', 'INFO'))
    log_format: LogFormat = field(default_factory=lambda: LogFormat(
        os.getenv('LOG_FORMAT', 'production')
    ))
    
    # File logging configuration
    log_directory: str = field(default_factory=lambda: os.getenv('LOG_DIRECTORY', 'logs'))
    log_file: str = field(default_factory=lambda: os.getenv('LOG_FILE', 'ninjnerd.log'))
    error_log_file: str = field(default_factory=lambda: os.getenv('ERROR_LOG_FILE', 'ninjnerd_errors.log'))
    access_log_file: str = field(default_factory=lambda: os.getenv('ACCESS_LOG_FILE', 'ninjnerd_access.log'))
    performance_log_file: str = field(default_factory=lambda: os.getenv('PERFORMANCE_LOG_FILE', 'ninjnerd_performance.log'))
    security_log_file: str = field(default_factory=lambda: os.getenv('SECURITY_LOG_FILE', 'ninjnerd_security.log'))
    audit_log_file: str = field(default_factory=lambda: os.getenv('AUDIT_LOG_FILE', 'ninjnerd_audit.log'))
    
    # Console logging
    enable_console_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_CONSOLE_LOGGING', 'true').lower() == 'true')
    console_log_level: str = field(default_factory=lambda: os.getenv('CONSOLE_LOG_LEVEL', 'WARNING'))
    
    # File rotation settings
    max_log_file_size_mb: int = field(default_factory=lambda: int(os.getenv('MAX_LOG_FILE_SIZE_MB', '100')))
    backup_count: int = field(default_factory=lambda: int(os.getenv('BACKUP_COUNT', '5')))
    
    # Async logging settings
    enable_async_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_ASYNC_LOGGING', 'true').lower() == 'true')
    async_queue_size: int = field(default_factory=lambda: int(os.getenv('ASYNC_QUEUE_SIZE', '1000')))
    
    # Feature flags
    enable_performance_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_PERFORMANCE_LOGGING', 'true').lower() == 'true')
    enable_security_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_SECURITY_LOGGING', 'true').lower() == 'true')
    enable_audit_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_AUDIT_LOGGING', 'true').lower() == 'true')
    enable_structured_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_STRUCTURED_LOGGING', 'true').lower() == 'true')
    enable_request_logging: bool = field(default_factory=lambda: os.getenv('ENABLE_REQUEST_LOGGING', 'true').lower() == 'true')
    
    # Performance monitoring
    performance_threshold_ms: float = field(default_factory=lambda: float(os.getenv('PERFORMANCE_THRESHOLD_MS', '1000')))
    
    # Log retention and cleanup
    log_retention_days: int = field(default_factory=lambda: int(os.getenv('LOG_RETENTION_DAYS', '30')))
    enable_log_cleanup: bool = field(default_factory=lambda: os.getenv('ENABLE_LOG_CLEANUP', 'true').lower() == 'true')
    cleanup_interval_hours: int = field(default_factory=lambda: int(os.getenv('CLEANUP_INTERVAL_HOURS', '24')))
    
    # Context enrichment
    include_request_context: bool = field(default_factory=lambda: os.getenv('INCLUDE_REQUEST_CONTEXT', 'true').lower() == 'true')
    include_user_context: bool = field(default_factory=lambda: os.getenv('INCLUDE_USER_CONTEXT', 'true').lower() == 'true')
    
    # Error handling
    max_error_logs_per_minute: int = field(default_factory=lambda: int(os.getenv('MAX_ERROR_LOGS_PER_MINUTE', '100')))
    
    # Security settings
    sanitize_sensitive_data: bool = field(default_factory=lambda: os.getenv('SANITIZE_SENSITIVE_DATA', 'true').lower() == 'true')
    
    def __post_init__(self):
        """Post-initialization validation and setup."""
        self.logger = logging.getLogger(__name__)
        self._ensure_log_directory()
    
    def validate(self) -> bool:
        """Validate the logging configuration."""
        # Validate log level
        if self.log_level not in ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']:
            raise ValueError(f"Invalid log level: {self.log_level}")
        
        # Validate file sizes
        if self.max_log_file_size_mb <= 0:
            raise ValueError(f"Invalid max log file size: {self.max_log_file_size_mb}")
        
        if self.backup_count < 0:
            raise ValueError(f"Invalid backup count: {self.backup_count}")
        
        # Validate retention days
        if self.log_retention_days <= 0:
            raise ValueError(f"Invalid log retention days: {self.log_retention_days}")
        
        # Validate performance threshold
        if self.performance_threshold_ms <= 0:
            raise ValueError(f"Invalid performance threshold: {self.performance_threshold_ms}")
        
        return True
    
    def _ensure_log_directory(self):
        """Ensure the log directory exists."""
        os.makedirs(self.log_directory, exist_ok=True)
    
    def get_log_file_path(self, log_type: str = 'main') -> str:
        """Get the full path for a log file."""
        log_files = {
            'main': self.log_file,
            'error': self.error_log_file,
            'access': self.access_log_file,
            'performance': self.performance_log_file,
            'security': self.security_log_file,
            'audit': self.audit_log_file
        }
        filename = log_files.get(log_type, self.log_file)
        return os.path.join(self.log_directory, filename)
    
    def get_log_format_string(self, format_type: Optional[LogFormat] = None) -> str:
        """Get the log format string."""
        fmt = format_type or self.log_format
        
        if fmt == LogFormat.SIMPLE:
            return '%(asctime)s | %(levelname)s | %(message)s'
        elif fmt == LogFormat.DETAILED:
            return '%(asctime)s | %(levelname)-8s | %(name)-20s | %(filename)s:%(lineno)d | %(message)s'
        elif fmt == LogFormat.JSON:
            return '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}'
        else:  # PRODUCTION
            return '%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s'
    
    def get_date_format_string(self) -> str:
        """Get the date format string."""
        return '%Y-%m-%d %H:%M:%S'
    
    @property
    def max_file_size(self) -> int:
        """Get max file size in bytes."""
        return self.max_log_file_size_mb * 1024 * 1024
    
    @property
    def log_dir(self) -> str:
        """Alias for log_directory."""
        return self.log_directory


def create_production_log_config() -> LogConfig:
    """Create production logging configuration from environment variables."""
    return LogConfig()
