"""
Centralized session timeout and expiry management for NinjaNerd application.

This module provides a single source of truth for session timeout values
and expiry logic, plus background cleanup scheduling.
"""

import threading
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable

# Single source of truth for session timeout
SESSION_TIMEOUT_MINUTES = 30

logger = logging.getLogger(__name__)


def is_session_expired(session_dict: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    """
    Check if a session is expired based on both login time and last activity.
    
    Args:
        session_dict: Session data containing 'login_time' and 'last_activity'
        now: Current datetime (optional, defaults to datetime.now())
        
    Returns:
        True if session is expired, False otherwise
    """
    if now is None:
        now = datetime.now()
    
    timeout_delta = timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    
    # Check login time expiry
    login_time = session_dict.get('login_time')
    if login_time:
        try:
            login_datetime = datetime.fromisoformat(login_time)
            if now - login_datetime > timeout_delta:
                return True
        except (ValueError, TypeError):
            logger.warning(f"Invalid login time format: {login_time}")
            return True
    
    # Check last activity expiry
    last_activity = session_dict.get('last_activity')
    if last_activity:
        try:
            last_activity_datetime = datetime.fromisoformat(last_activity)
            if now - last_activity_datetime > timeout_delta:
                return True
        except (ValueError, TypeError):
            logger.warning(f"Invalid last activity time format: {last_activity}")
            return True
    
    return False


class SessionCleanupScheduler:
    """
    Background scheduler for automatic session cleanup.
    
    Runs cleanup operations at regular intervals to remove expired sessions.
    """
    
    def __init__(self, cleanup_interval_minutes: int = 5):
        """
        Initialize the scheduler.
        
        Args:
            cleanup_interval_minutes: How often to run cleanup (default: 5 minutes)
        """
        self.cleanup_interval_minutes = cleanup_interval_minutes
        self.cleanup_functions = []
        self.running = False
        self.thread = None
        self._stop_event = threading.Event()
        
    def register_cleanup_function(self, cleanup_func: Callable[[], int]) -> None:
        """
        Register a cleanup function to be called periodically.
        
        Args:
            cleanup_func: Function that performs cleanup and returns count of cleaned items
        """
        self.cleanup_functions.append(cleanup_func)
        
    def start(self) -> None:
        """Start the background cleanup scheduler."""
        if self.running:
            logger.warning("Session cleanup scheduler is already running")
            return
            
        self.running = True
        self._stop_event.clear()
        self.thread = threading.Thread(target=self._run_cleanup_loop, daemon=True)
        self.thread.start()
        logger.info(f"Session cleanup scheduler started (interval: {self.cleanup_interval_minutes} minutes)")
        
    def stop(self) -> None:
        """Stop the background cleanup scheduler."""
        if not self.running:
            return
            
        self.running = False
        self._stop_event.set()
        
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5.0)
            
        logger.info("Session cleanup scheduler stopped")
        
    def _run_cleanup_loop(self) -> None:
        """Main loop for the cleanup scheduler (runs in background thread)."""
        interval_seconds = self.cleanup_interval_minutes * 60
        
        while self.running and not self._stop_event.is_set():
            try:
                # Wait for interval or stop signal
                if self._stop_event.wait(timeout=interval_seconds):
                    break  # Stop event was set
                    
                # Run all registered cleanup functions
                total_cleaned = 0
                for cleanup_func in self.cleanup_functions:
                    try:
                        cleaned_count = cleanup_func()
                        total_cleaned += cleaned_count
                        logger.debug(f"Cleanup function cleaned {cleaned_count} items")
                    except Exception as e:
                        logger.error(f"Error in cleanup function: {e}")
                        
                if total_cleaned > 0:
                    logger.info(f"Session cleanup completed: {total_cleaned} items cleaned")
                    
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
                # Continue running even if there's an error


def get_session_timeout_minutes() -> int:
    """
    Get the configured session timeout in minutes.
    
    Returns:
        Session timeout in minutes
    """
    return SESSION_TIMEOUT_MINUTES


def create_session_validator() -> Callable[[Dict[str, Any]], bool]:
    """
    Create a session validator function using the centralized timeout.
    
    Returns:
        Function that takes session data and returns True if valid
    """
    def validate_session(session_data: Dict[str, Any]) -> bool:
        """Validate that a session is not expired."""
        return not is_session_expired(session_data)
    
    return validate_session
