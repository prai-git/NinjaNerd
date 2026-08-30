"""
Database Recovery Manager for automated corruption handling and recovery.

This module provides automated recovery mechanisms that integrate with
the existing SQLite manager to handle corruption scenarios gracefully.
"""

import logging
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable, List
from pathlib import Path
from contextlib import contextmanager
from threading import Lock
from dataclasses import dataclass

from .database_health import DatabaseHealthMonitor, HealthStatus, HealthCheckResult
from .exceptions import (
    DatabaseException,
    RecoveryError,
    BackupError
)


@dataclass
class RecoveryPolicy:
    """Configuration for automated recovery behavior."""
    enable_auto_repair: bool = True
    enable_auto_backup: bool = True
    enable_auto_restore: bool = False  # Conservative default
    max_repair_attempts: int = 3
    backup_before_operations: List[str] = None  # Operations that trigger backup
    health_check_interval: int = 300  # 5 minutes
    corruption_retry_delay: float = 1.0  # seconds
    
    def __post_init__(self):
        if self.backup_before_operations is None:
            self.backup_before_operations = [
                'vacuum', 'schema_change', 'bulk_update', 'user_deletion'
            ]


class DatabaseRecoveryManager:
    """
    Automated database recovery manager with corruption handling.
    
    Features:
    - Automatic corruption detection and recovery
    - Safety backups before risky operations
    - Configurable recovery policies
    - Integration with existing SQLite operations
    - Monitoring and alerting capabilities
    """
    
    def __init__(self, db_path: str, backup_dir: str = None, 
                 recovery_policy: RecoveryPolicy = None, logger: logging.Logger = None):
        """
        Initialize database recovery manager.
        
        Args:
            db_path: Path to SQLite database file
            backup_dir: Directory for storing backups
            recovery_policy: Recovery behavior configuration
            logger: Logger instance
        """
        self.db_path = Path(db_path)
        self.backup_dir = Path(backup_dir) if backup_dir else self.db_path.parent / 'backups'
        self.recovery_policy = recovery_policy or RecoveryPolicy()
        self.logger = logger or logging.getLogger(__name__)
        
        # Initialize health monitor
        self.health_monitor = DatabaseHealthMonitor(
            db_path=str(self.db_path),
            backup_dir=str(self.backup_dir),
            logger=self.logger
        )
        
        # Recovery state tracking
        self._recovery_lock = Lock()
        self._recovery_attempts = {}
        self._last_health_check = None
        self._recovery_history = []
        
        # Operation hooks for safety backups
        self._backup_hooks = {}
        self._register_default_hooks()
    
    def _register_default_hooks(self):
        """Register default backup hooks for risky operations."""
        risky_operations = self.recovery_policy.backup_before_operations
        
        for operation in risky_operations:
            self._backup_hooks[operation] = True
    
    def register_operation_hook(self, operation_name: str, require_backup: bool = True):
        """
        Register an operation that may require safety backup.
        
        Args:
            operation_name: Name of the operation
            require_backup: Whether to create backup before operation
        """
        self._backup_hooks[operation_name] = require_backup
    
    @contextmanager
    def safe_operation(self, operation_name: str, auto_recover: bool = True):
        """
        Context manager for safe database operations with automatic recovery.
        
        Args:
            operation_name: Name of operation for logging/backup
            auto_recover: Whether to attempt automatic recovery on failure
        
        Yields:
            None - use within with statement for safe operations
        """
        backup_path = None
        operation_start = time.time()
        
        try:
            # Check if backup is required for this operation
            if self._backup_hooks.get(operation_name, False) and self.recovery_policy.enable_auto_backup:
                try:
                    backup_path = self.health_monitor.create_safety_backup(operation_name)
                    self.logger.info(f"Safety backup created for {operation_name}: {backup_path}")
                except Exception as e:
                    self.logger.warning(f"Failed to create safety backup for {operation_name}: {e}")
                    # Continue without backup unless it's critical
                    if operation_name in ['schema_change', 'vacuum']:
                        raise BackupError(f"Critical operation {operation_name} requires backup: {e}")
            
            # Perform pre-operation health check for critical operations
            if operation_name in ['vacuum', 'schema_change']:
                health_result = self.health_monitor.check_database_integrity(quick_check=True)
                if health_result.status in [HealthStatus.CORRUPTED, HealthStatus.CRITICAL]:
                    raise DatabaseException(
                        f"Cannot perform {operation_name}: database health is {health_result.status.value}"
                    )
            
            # Yield control to the operation
            yield
            
            # Log successful operation
            self.logger.debug(f"Operation {operation_name} completed successfully in {time.time() - operation_start:.2f}s")
        
        except Exception as e:
            operation_failed = True
            self.logger.error(f"Operation {operation_name} failed: {e}")
            
            # Attempt automatic recovery if enabled
            if auto_recover and self.recovery_policy.enable_auto_repair:
                try:
                    recovery_result = self._attempt_automatic_recovery(operation_name, str(e), backup_path)
                    
                    if recovery_result.status == HealthStatus.HEALTHY:
                        self.logger.info(f"Automatic recovery successful for {operation_name}")
                        operation_failed = False
                    else:
                        self.logger.error(f"Automatic recovery failed: {recovery_result.message}")
                
                except Exception as recovery_error:
                    self.logger.error(f"Recovery attempt failed: {recovery_error}")
            
            # Re-raise the original exception if recovery didn't help
            if operation_failed:
                raise
    
    def _attempt_automatic_recovery(self, operation_name: str, error_message: str, 
                                  backup_path: str = None) -> HealthCheckResult:
        """
        Attempt automatic recovery from operation failure.
        
        Args:
            operation_name: Name of failed operation
            error_message: Error message from failed operation
            backup_path: Path to safety backup (if available)
            
        Returns:
            HealthCheckResult indicating recovery success/failure
        """
        with self._recovery_lock:
            recovery_key = f"{operation_name}_{int(time.time() // 300)}"  # 5-minute windows
            
            # Check recovery attempt limits
            attempts = self._recovery_attempts.get(recovery_key, 0)
            if attempts >= self.recovery_policy.max_repair_attempts:
                return HealthCheckResult(
                    status=HealthStatus.CRITICAL,
                    message=f"Maximum recovery attempts exceeded for {operation_name}",
                    timestamp=datetime.now(),
                    details={'attempts': attempts},
                    response_time_ms=0,
                    recommendations=["Manual intervention required"]
                )
            
            self._recovery_attempts[recovery_key] = attempts + 1
            
            try:
                # Step 1: Assess current database health
                health_check = self.health_monitor.check_database_integrity(quick_check=False)
                
                # Step 2: Choose recovery strategy based on health status
                if health_check.status == HealthStatus.CORRUPTED:
                    # Database is corrupted, attempt repair
                    self.logger.info(f"Attempting database repair for {operation_name}")
                    repair_result = self.health_monitor.attempt_database_repair()
                    
                    if repair_result.status == HealthStatus.HEALTHY:
                        self._log_recovery_success(operation_name, "repair", repair_result)
                        return repair_result
                    
                    # Repair failed, try restore if available and allowed
                    if backup_path and self.recovery_policy.enable_auto_restore:
                        self.logger.info(f"Repair failed, attempting restore from {backup_path}")
                        restore_result = self.health_monitor.restore_from_backup(backup_path)
                        
                        if restore_result.status == HealthStatus.HEALTHY:
                            self._log_recovery_success(operation_name, "restore", restore_result)
                            return restore_result
                
                elif health_check.status == HealthStatus.WARNING:
                    # Minor issues, try repair
                    repair_result = self.health_monitor.attempt_database_repair()
                    
                    if repair_result.status in [HealthStatus.HEALTHY, HealthStatus.WARNING]:
                        self._log_recovery_success(operation_name, "repair", repair_result)
                        return repair_result
                
                # Recovery attempts failed
                self._log_recovery_failure(operation_name, health_check, error_message)
                return HealthCheckResult(
                    status=HealthStatus.CRITICAL,
                    message=f"All recovery attempts failed for {operation_name}",
                    timestamp=datetime.now(),
                    details={
                        'original_error': error_message,
                        'health_status': health_check.status.value,
                        'attempts': attempts + 1
                    },
                    response_time_ms=0,
                    recommendations=[
                        "Manual database recovery required",
                        "Restore from external backup",
                        "Contact system administrator"
                    ]
                )
            
            except Exception as e:
                self.logger.error(f"Recovery process failed: {e}")
                return HealthCheckResult(
                    status=HealthStatus.CRITICAL,
                    message=f"Recovery process failed: {e}",
                    timestamp=datetime.now(),
                    details={'recovery_error': str(e)},
                    response_time_ms=0,
                    recommendations=["Manual intervention required"]
                )
    
    def _log_recovery_success(self, operation_name: str, recovery_method: str, 
                            recovery_result: HealthCheckResult):
        """Log successful recovery attempt."""
        self.logger.info(
            f"Recovery successful: {operation_name} recovered using {recovery_method} "
            f"in {recovery_result.response_time_ms:.2f}ms"
        )
        
        self._recovery_history.append({
            'timestamp': datetime.now(),
            'operation': operation_name,
            'recovery_method': recovery_method,
            'success': True,
            'details': recovery_result.details
        })
    
    def _log_recovery_failure(self, operation_name: str, health_check: HealthCheckResult, 
                            original_error: str):
        """Log failed recovery attempt."""
        self.logger.error(
            f"Recovery failed: {operation_name} could not be recovered "
            f"(health: {health_check.status.value})"
        )
        
        self._recovery_history.append({
            'timestamp': datetime.now(),
            'operation': operation_name,
            'recovery_method': 'failed',
            'success': False,
            'details': {
                'original_error': original_error,
                'health_status': health_check.status.value,
                'health_message': health_check.message
            }
        })
    
    def check_and_repair_if_needed(self, force_check: bool = False) -> HealthCheckResult:
        """
        Check database health and perform repairs if needed.
        
        Args:
            force_check: Force immediate check regardless of timing
            
        Returns:
            HealthCheckResult with current status
        """
        # Check if health check is needed
        if not force_check and self._last_health_check:
            time_since_check = (datetime.now() - self._last_health_check).total_seconds()
            if time_since_check < self.recovery_policy.health_check_interval:
                return HealthCheckResult(
                    status=HealthStatus.HEALTHY,
                    message="Recent health check passed, skipping",
                    timestamp=datetime.now(),
                    details={'last_check_seconds_ago': time_since_check},
                    response_time_ms=0,
                    recommendations=[]
                )
        
        # Perform health check
        health_result = self.health_monitor.check_database_integrity(quick_check=not force_check)
        self._last_health_check = datetime.now()
        
        # Attempt automatic repair if issues detected
        if health_result.status in [HealthStatus.WARNING, HealthStatus.CORRUPTED]:
            if self.recovery_policy.enable_auto_repair:
                self.logger.info(f"Health check detected issues: {health_result.message}")
                
                repair_result = self.health_monitor.attempt_database_repair()
                
                if repair_result.status == HealthStatus.HEALTHY:
                    self.logger.info("Automatic repair successful")
                    return repair_result
                else:
                    self.logger.warning(f"Automatic repair failed: {repair_result.message}")
                    return repair_result
            else:
                self.logger.warning(f"Health issues detected but auto-repair disabled: {health_result.message}")
        
        return health_result
    
    def get_recovery_status(self) -> Dict[str, Any]:
        """
        Get comprehensive recovery manager status.
        
        Returns:
            Dictionary with recovery status and history
        """
        # Get health summary
        health_summary = self.health_monitor.get_health_summary()
        
        # Add recovery-specific information
        return {
            'health_status': health_summary,
            'recovery_policy': {
                'auto_repair_enabled': self.recovery_policy.enable_auto_repair,
                'auto_backup_enabled': self.recovery_policy.enable_auto_backup,
                'auto_restore_enabled': self.recovery_policy.enable_auto_restore,
                'max_repair_attempts': self.recovery_policy.max_repair_attempts,
                'health_check_interval': self.recovery_policy.health_check_interval
            },
            'recovery_history': self._recovery_history[-10:],  # Last 10 recovery attempts
            'recovery_attempts': dict(self._recovery_attempts),
            'registered_hooks': list(self._backup_hooks.keys()),
            'last_health_check': self._last_health_check.isoformat() if self._last_health_check else None
        }
    
    def cleanup_recovery_state(self, max_age_hours: int = 24):
        """
        Clean up old recovery state data.
        
        Args:
            max_age_hours: Maximum age for recovery data in hours
        """
        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
        
        # Clean recovery attempts
        keys_to_remove = [
            key for key, timestamp in self._recovery_attempts.items()
            if datetime.fromtimestamp(timestamp) < cutoff_time
        ]
        
        for key in keys_to_remove:
            del self._recovery_attempts[key]
        
        # Clean recovery history
        self._recovery_history = [
            record for record in self._recovery_history
            if record['timestamp'] > cutoff_time
        ]
        
        # Clean old backups
        self.health_monitor.cleanup_old_backups()
    
    def force_recovery(self, method: str = "auto") -> HealthCheckResult:
        """
        Force immediate recovery attempt.
        
        Args:
            method: Recovery method ('auto', 'repair', 'restore')
            
        Returns:
            HealthCheckResult indicating recovery outcome
        """
        self.logger.info(f"Forcing recovery using method: {method}")
        
        try:
            if method == "repair":
                return self.health_monitor.attempt_database_repair()
            elif method == "restore":
                return self.health_monitor.restore_from_backup()
            else:  # auto
                # Check current health and choose appropriate method
                health_check = self.health_monitor.check_database_integrity(quick_check=False)
                
                if health_check.status in [HealthStatus.CORRUPTED, HealthStatus.CRITICAL]:
                    # Try repair first
                    repair_result = self.health_monitor.attempt_database_repair()
                    
                    if repair_result.status == HealthStatus.HEALTHY:
                        return repair_result
                    else:
                        # Repair failed, try restore
                        return self.health_monitor.restore_from_backup()
                else:
                    return health_check
        
        except Exception as e:
            self.logger.error(f"Forced recovery failed: {e}")
            return HealthCheckResult(
                status=HealthStatus.CRITICAL,
                message=f"Forced recovery failed: {e}",
                timestamp=datetime.now(),
                details={'error': str(e)},
                response_time_ms=0,
                recommendations=["Manual intervention required"]
            )
    
    def enable_monitoring(self, check_interval: int = None):
        """
        Enable periodic health monitoring.
        
        Args:
            check_interval: Check interval in seconds (uses policy default if None)
        """
        if check_interval is not None:
            self.recovery_policy.health_check_interval = check_interval
        
        self.logger.info(f"Health monitoring enabled with {self.recovery_policy.health_check_interval}s interval")
    
    def disable_auto_recovery(self):
        """Disable automatic recovery for manual control."""
        self.recovery_policy.enable_auto_repair = False
        self.recovery_policy.enable_auto_restore = False
        self.logger.info("Automatic recovery disabled")
    
    def enable_auto_recovery(self, include_restore: bool = False):
        """
        Enable automatic recovery.
        
        Args:
            include_restore: Whether to enable automatic restore from backup
        """
        self.recovery_policy.enable_auto_repair = True
        self.recovery_policy.enable_auto_restore = include_restore
        self.logger.info(f"Automatic recovery enabled (restore: {include_restore})")
