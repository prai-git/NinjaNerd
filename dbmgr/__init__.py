"""
DBManager Package for NinjaNerd

Centralized JSON database operations with concurrent user support,
file integrity protection, and production-ready error handling.
"""

from .db_manager import DBManager
from .exceptions import (
    DatabaseException,
    FileIntegrityError,
    ConcurrencyError,
    QueueTimeoutError,
    SessionError,
    BackupError
)

__version__ = "1.0.0"
__all__ = [
    "DBManager",
    "DatabaseException",
    "FileIntegrityError",
    "ConcurrencyError",
    "QueueTimeoutError",
    "SessionError",
    "BackupError"
]
