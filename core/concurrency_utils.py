"""
Concurrency utilities for thread-safe operations on shared mutable state.
Provides lightweight named locks for fine-grained concurrency control.
"""

import threading
import time
import logging
from contextlib import contextmanager
from typing import Dict, Any, Optional
from functools import wraps

class NamedLockManager:
    """
    Manager for named locks to provide fine-grained concurrency control.
    Supports performance monitoring and contention tracking.
    """
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        self._locks: Dict[str, threading.RLock] = {}
        self._locks_access_lock = threading.RLock()
        self._contention_stats: Dict[str, Dict[str, Any]] = {}
        self.logger = logger or logging.getLogger(__name__)
        
    def get_lock(self, lock_name: str) -> threading.RLock:
        """Get or create a named lock."""
        with self._locks_access_lock:
            if lock_name not in self._locks:
                self._locks[lock_name] = threading.RLock()
                self._contention_stats[lock_name] = {
                    'acquisitions': 0,
                    'contentions': 0,
                    'max_wait_time': 0.0,
                    'total_wait_time': 0.0
                }
            return self._locks[lock_name]
    
    @contextmanager
    def acquire_lock(self, lock_name: str, timeout: float = 30.0):
        """
        Context manager for acquiring named locks with timeout and monitoring.
        
        Args:
            lock_name: Name of the lock to acquire
            timeout: Maximum time to wait for lock acquisition
            
        Yields:
            bool: True if lock was acquired successfully
        """
        lock = self.get_lock(lock_name)
        start_time = time.time()
        acquired = False
        
        try:
            # Attempt to acquire lock with timeout
            acquired = lock.acquire(timeout=timeout)
            wait_time = time.time() - start_time
            
            # Update statistics
            with self._locks_access_lock:
                # Ensure stats exist (should be created by get_lock, but safety check)
                if lock_name not in self._contention_stats:
                    self._contention_stats[lock_name] = {
                        'acquisitions': 0,
                        'contentions': 0,
                        'max_wait_time': 0.0,
                        'total_wait_time': 0.0
                    }
                
                stats = self._contention_stats[lock_name]
                stats['acquisitions'] += 1
                stats['total_wait_time'] += wait_time
                stats['max_wait_time'] = max(stats['max_wait_time'], wait_time)
                
                if wait_time > 0.1:  # Consider it contention if waited > 100ms
                    stats['contentions'] += 1
                    
                # Log contention hotspots
                if wait_time > 1.0:  # Log if waited > 1 second
                    self.logger.warning(
                        f"Lock contention detected: '{lock_name}' "
                        f"wait_time={wait_time:.3f}s, "
                        f"contentions={stats['contentions']}, "
                        f"acquisitions={stats['acquisitions']}"
                    )
            
            if not acquired:
                self.logger.error(f"Failed to acquire lock '{lock_name}' within {timeout}s timeout")
                raise TimeoutError(f"Could not acquire lock '{lock_name}' within {timeout}s")
                
            yield acquired
            
        finally:
            if acquired:
                lock.release()
    
    def get_contention_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get contention statistics for monitoring."""
        with self._locks_access_lock:
            return self._contention_stats.copy()
    
    def log_performance_stats(self):
        """Log performance statistics for all locks."""
        stats = self.get_contention_stats()
        for lock_name, lock_stats in stats.items():
            if lock_stats['acquisitions'] > 0:
                avg_wait = lock_stats['total_wait_time'] / lock_stats['acquisitions']
                contention_rate = (lock_stats['contentions'] / lock_stats['acquisitions']) * 100
                
                self.logger.info(
                    f"Lock '{lock_name}' stats: "
                    f"acquisitions={lock_stats['acquisitions']}, "
                    f"contentions={lock_stats['contentions']} ({contention_rate:.1f}%), "
                    f"avg_wait={avg_wait:.3f}s, "
                    f"max_wait={lock_stats['max_wait_time']:.3f}s"
                )


# Global lock manager instance
_lock_manager: Optional[NamedLockManager] = None

def initialize_concurrency_manager(logger: Optional[logging.Logger] = None):
    """Initialize the global lock manager."""
    global _lock_manager
    _lock_manager = NamedLockManager(logger)
    return _lock_manager

def get_lock_manager() -> NamedLockManager:
    """Get the global lock manager instance."""
    global _lock_manager
    if _lock_manager is None:
        _lock_manager = NamedLockManager()
    return _lock_manager

@contextmanager
def synchronized(lock_name: str, timeout: float = 30.0):
    """
    Convenient context manager for synchronized access to shared resources.
    
    Args:
        lock_name: Name of the lock for the resource
        timeout: Maximum time to wait for lock acquisition
    """
    manager = get_lock_manager()
    with manager.acquire_lock(lock_name, timeout):
        yield

def thread_safe_operation(lock_name: str, timeout: float = 30.0):
    """
    Decorator for making functions thread-safe using named locks.
    
    Args:
        lock_name: Name of the lock to use
        timeout: Maximum time to wait for lock acquisition
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with synchronized(lock_name, timeout):
                return func(*args, **kwargs)
        return wrapper
    return decorator

# Predefined lock names for common shared resources
LOCK_ACTIVE_SESSIONS = "active_sessions"
LOCK_COLLABORATION_INVITES = "collaboration_invites" 
LOCK_CHAT_SESSIONS = "chat_sessions"
LOCK_COLLABORATION_DATA = "collaboration_data"
LOCK_MESSAGE_COUNTER = "message_counter"
LOCK_CREDENTIALS = "credentials"
