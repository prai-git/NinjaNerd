"""
Custom exceptions for DBManager operations.

This module defines all custom exceptions used throughout the DBManager
system for handling various error scenarios in production environments.
"""


class DatabaseException(Exception):
    """Base exception for all database-related errors."""
    
    def __init__(self, message: str, error_code: str = None, details: dict = None):
        super().__init__(message)
        self.error_code = error_code
        self.details = details or {}
        
    def to_dict(self):
        """Convert exception to dictionary for JSON responses."""
        return {
            "error": self.__class__.__name__,
            "message": str(self),
            "error_code": self.error_code,
            "details": self.details
        }


class FileIntegrityError(DatabaseException):
    """Raised when file integrity checks fail."""
    
    def __init__(self, message: str, file_path: str = None, expected_checksum: str = None, actual_checksum: str = None):
        super().__init__(message, "FILE_INTEGRITY_ERROR")
        self.details = {
            "file_path": file_path,
            "expected_checksum": expected_checksum,
            "actual_checksum": actual_checksum
        }


class ConcurrencyError(DatabaseException):
    """Raised when concurrent access conflicts occur."""
    
    def __init__(self, message: str, resource: str = None, operation: str = None):
        super().__init__(message, "CONCURRENCY_ERROR")
        self.details = {
            "resource": resource,
            "operation": operation
        }


class QueueTimeoutError(DatabaseException):
    """Raised when queue operations timeout."""
    
    def __init__(self, message: str, timeout_seconds: int = None, queue_size: int = None):
        super().__init__(message, "QUEUE_TIMEOUT_ERROR")
        self.details = {
            "timeout_seconds": timeout_seconds,
            "queue_size": queue_size
        }


class SessionError(DatabaseException):
    """Raised when session management operations fail."""
    
    def __init__(self, message: str, session_id: str = None, user_id: str = None):
        super().__init__(message, "SESSION_ERROR")
        self.details = {
            "session_id": session_id,
            "user_id": user_id
        }


class BackupError(DatabaseException):
    """Raised when backup operations fail."""
    
    def __init__(self, message: str, backup_path: str = None, original_path: str = None):
        super().__init__(message, "BACKUP_ERROR")
        self.details = {
            "backup_path": backup_path,
            "original_path": original_path
        }


class ValidationError(DatabaseException):
    """Raised when data validation fails."""
    
    def __init__(self, message: str, field: str = None, value: str = None):
        super().__init__(message, "VALIDATION_ERROR")
        self.details = {
            "field": field,
            "value": value
        }


class LockError(DatabaseException):
    """Raised when file locking operations fail."""
    
    def __init__(self, message: str, file_path: str = None, lock_type: str = None):
        super().__init__(message, "LOCK_ERROR")
        self.details = {
            "file_path": file_path,
            "lock_type": lock_type
        }


class RecoveryError(DatabaseException):
    """Raised when automatic recovery operations fail."""
    
    def __init__(self, message: str, recovery_action: str = None, error_details: str = None):
        super().__init__(message, "RECOVERY_ERROR")
        self.details = {
            "recovery_action": recovery_action,
            "error_details": error_details
        }
