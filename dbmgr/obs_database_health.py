"""
Database Health Monitor for SQLite corruption detection and recovery.

This module provides comprehensive database health monitoring, corruption detection,
and automated recovery mechanisms for SQLite databases.
"""

import sqlite3
import os
import shutil
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum

from .exceptions import (
    DatabaseException,
    FileIntegrityError,
    BackupError,
    RecoveryError
)


class HealthStatus(Enum):
    """Database health status levels."""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    CORRUPTED = "corrupted"


@dataclass
class HealthCheckResult:
    """Result of a database health check."""
    status: HealthStatus
    message: str
    timestamp: datetime
    details: Dict[str, Any]
    response_time_ms: float
    recommendations: List[str]


class DatabaseHealthMonitor:
    """
    Comprehensive database health monitoring and recovery system.
    
    Features:
    - Corruption detection using PRAGMA integrity_check
    - Automatic backup before risky operations
    - Recovery procedures including VACUUM and restore
    - Health status monitoring and alerting
    - Performance metrics tracking
    """
    
    def __init__(self, db_path: str, backup_dir: str = None, logger: logging.Logger = None):
        """
        Initialize database health monitor.
        
        Args:
            db_path: Path to SQLite database file
            backup_dir: Directory for storing backups
            logger: Logger instance for health monitoring
        """
        self.db_path = Path(db_path)
        self.backup_dir = Path(backup_dir) if backup_dir else self.db_path.parent / 'backups'
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger = logger or logging.getLogger(__name__)
        
        # Health monitoring configuration
        self.config = {
            'integrity_check_timeout': 30,  # seconds
            'backup_retention_days': 7,
            'max_repair_attempts': 3,
            'vacuum_threshold_mb': 100,
            'health_check_interval': 300,  # 5 minutes
        }
        
        self._last_health_check = None
        self._health_history = []
    
    def check_database_integrity(self, quick_check: bool = False) -> HealthCheckResult:
        """
        Perform comprehensive database integrity check.
        
        Args:
            quick_check: If True, perform faster but less thorough check
            
        Returns:
            HealthCheckResult with integrity status
        """
        start_time = time.time()
        details = {}
        recommendations = []
        
        try:
            # Check if database file exists and is readable
            if not self.db_path.exists():
                return HealthCheckResult(
                    status=HealthStatus.CRITICAL,
                    message="Database file does not exist",
                    timestamp=datetime.now(),
                    details={"file_path": str(self.db_path)},
                    response_time_ms=(time.time() - start_time) * 1000,
                    recommendations=["Restore from backup", "Initialize new database"]
                )
            
            # Check file size and permissions
            file_stats = self.db_path.stat()
            details['file_size_mb'] = file_stats.st_size / (1024 * 1024)
            details['last_modified'] = datetime.fromtimestamp(file_stats.st_mtime).isoformat()
            
            if file_stats.st_size == 0:
                return HealthCheckResult(
                    status=HealthStatus.CORRUPTED,
                    message="Database file is empty",
                    timestamp=datetime.now(),
                    details=details,
                    response_time_ms=(time.time() - start_time) * 1000,
                    recommendations=["Restore from backup", "Initialize new database"]
                )
            
            # Test database connection and basic operations
            with self._get_test_connection() as conn:
                # Check if we can connect and perform basic operations
                try:
                    conn.execute("SELECT 1").fetchone()
                    details['connection_test'] = 'passed'
                except Exception as e:
                    return HealthCheckResult(
                        status=HealthStatus.CORRUPTED,
                        message=f"Database connection failed: {e}",
                        timestamp=datetime.now(),
                        details=details,
                        response_time_ms=(time.time() - start_time) * 1000,
                        recommendations=["Run database repair", "Restore from backup"]
                    )
                
                # Perform integrity check
                if quick_check:
                    # Quick check - just verify main tables exist
                    integrity_result = self._quick_integrity_check(conn)
                else:
                    # Full PRAGMA integrity_check
                    integrity_result = self._full_integrity_check(conn)
                
                details.update(integrity_result['details'])
                
                # Check for warnings
                if integrity_result['warnings']:
                    recommendations.extend(integrity_result['warnings'])
                
                # Determine overall status
                if integrity_result['status'] == 'ok':
                    status = HealthStatus.HEALTHY
                    message = "Database integrity check passed"
                elif integrity_result['status'] == 'warning':
                    status = HealthStatus.WARNING
                    message = f"Database has warnings: {', '.join(integrity_result['warnings'])}"
                else:
                    status = HealthStatus.CORRUPTED
                    message = f"Database corruption detected: {integrity_result['message']}"
                    recommendations.extend(["Run VACUUM", "Restore from backup"])
        
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
            return HealthCheckResult(
                status=HealthStatus.CRITICAL,
                message=f"Health check failed: {e}",
                timestamp=datetime.now(),
                details=details,
                response_time_ms=(time.time() - start_time) * 1000,
                recommendations=["Check database file permissions", "Restore from backup"]
            )
        
        result = HealthCheckResult(
            status=status,
            message=message,
            timestamp=datetime.now(),
            details=details,
            response_time_ms=(time.time() - start_time) * 1000,
            recommendations=recommendations
        )
        
        # Store in health history
        self._health_history.append(result)
        self._last_health_check = result.timestamp
        
        # Keep only recent history
        cutoff_time = datetime.now() - timedelta(hours=24)
        self._health_history = [
            h for h in self._health_history 
            if h.timestamp > cutoff_time
        ]
        
        return result
    
    def _full_integrity_check(self, conn: sqlite3.Connection) -> Dict[str, Any]:
        """Perform full PRAGMA integrity_check."""
        try:
            cursor = conn.execute("PRAGMA integrity_check")
            results = cursor.fetchall()
            
            if not results:
                return {
                    'status': 'error',
                    'message': 'No integrity check results',
                    'details': {},
                    'warnings': []
                }
            
            # Check first result
            first_result = results[0][0] if results[0] else ""
            
            if first_result == "ok":
                return {
                    'status': 'ok',
                    'message': 'Database integrity check passed',
                    'details': {'integrity_check_result': 'ok'},
                    'warnings': []
                }
            else:
                # Corruption detected
                error_messages = [row[0] for row in results if row]
                return {
                    'status': 'corrupted',
                    'message': f"Integrity check failed: {'; '.join(error_messages[:3])}",
                    'details': {
                        'integrity_errors': error_messages,
                        'error_count': len(error_messages)
                    },
                    'warnings': []
                }
        
        except Exception as e:
            return {
                'status': 'error',
                'message': f"Integrity check failed: {e}",
                'details': {'error': str(e)},
                'warnings': []
            }
    
    def _quick_integrity_check(self, conn: sqlite3.Connection) -> Dict[str, Any]:
        """Perform quick integrity check by testing key tables."""
        warnings = []
        details = {}
        
        try:
            # Check if main tables exist and are accessible
            tables_to_check = ['users', 'user_history', 'invites', 'chat_sessions', 'messages']
            
            for table in tables_to_check:
                try:
                    count_result = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                    details[f'{table}_count'] = count_result[0] if count_result else 0
                except Exception as e:
                    warnings.append(f"Table {table} check failed: {e}")
            
            # Check for schema consistency
            try:
                schema_result = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
                details['tables_found'] = [row[0] for row in schema_result]
            except Exception as e:
                warnings.append(f"Schema check failed: {e}")
            
            # Determine status
            if not warnings:
                return {
                    'status': 'ok',
                    'message': 'Quick integrity check passed',
                    'details': details,
                    'warnings': []
                }
            elif len(warnings) < 3:
                return {
                    'status': 'warning',
                    'message': 'Some integrity issues detected',
                    'details': details,
                    'warnings': warnings
                }
            else:
                return {
                    'status': 'corrupted',
                    'message': 'Multiple integrity issues detected',
                    'details': details,
                    'warnings': warnings
                }
        
        except Exception as e:
            return {
                'status': 'error',
                'message': f"Quick check failed: {e}",
                'details': {'error': str(e)},
                'warnings': []
            }
    
    def create_safety_backup(self, operation_name: str = "operation") -> str:
        """
        Create a safety backup before risky operations.
        
        Args:
            operation_name: Name of operation for backup identification
            
        Returns:
            Path to created backup file
        """
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"safety_backup_{operation_name}_{timestamp}.db"
            backup_path = self.backup_dir / backup_filename
            
            # Create backup
            shutil.copy2(self.db_path, backup_path)
            
            # Create metadata file
            metadata = {
                'original_file': str(self.db_path),
                'backup_created': datetime.now().isoformat(),
                'operation': operation_name,
                'file_size': backup_path.stat().st_size
            }
            
            metadata_path = backup_path.with_suffix('.metadata')
            with open(metadata_path, 'w') as f:
                import json
                json.dump(metadata, f, indent=2)
            
            self.logger.info(f"Safety backup created: {backup_path}")
            return str(backup_path)
        
        except Exception as e:
            self.logger.error(f"Failed to create safety backup: {e}")
            raise BackupError(f"Failed to create safety backup: {e}")
    
    def attempt_database_repair(self) -> HealthCheckResult:
        """
        Attempt to repair database corruption using various methods.
        
        Returns:
            HealthCheckResult indicating repair success/failure
        """
        start_time = time.time()
        repair_details = {}
        
        try:
            # Create backup before repair attempt
            backup_path = self.create_safety_backup("repair_attempt")
            repair_details['backup_created'] = backup_path
            
            # Try VACUUM to rebuild database
            repair_result = self._attempt_vacuum_repair()
            repair_details.update(repair_result)
            
            if repair_result['success']:
                # Verify repair was successful
                health_check = self.check_database_integrity(quick_check=False)
                
                if health_check.status == HealthStatus.HEALTHY:
                    return HealthCheckResult(
                        status=HealthStatus.HEALTHY,
                        message="Database repair successful",
                        timestamp=datetime.now(),
                        details=repair_details,
                        response_time_ms=(time.time() - start_time) * 1000,
                        recommendations=["Monitor database health closely"]
                    )
                else:
                    # VACUUM didn't fix the issue, try other methods
                    return self._attempt_advanced_repair(backup_path, repair_details, start_time)
            else:
                # VACUUM failed, try other methods
                return self._attempt_advanced_repair(backup_path, repair_details, start_time)
        
        except Exception as e:
            self.logger.error(f"Database repair failed: {e}")
            return HealthCheckResult(
                status=HealthStatus.CRITICAL,
                message=f"Database repair failed: {e}",
                timestamp=datetime.now(),
                details=repair_details,
                response_time_ms=(time.time() - start_time) * 1000,
                recommendations=["Restore from backup", "Manual intervention required"]
            )
    
    def _attempt_vacuum_repair(self) -> Dict[str, Any]:
        """Attempt to repair database using VACUUM command."""
        try:
            with self._get_test_connection() as conn:
                # Set timeout for VACUUM operation
                conn.execute(f"PRAGMA busy_timeout = {self.config['integrity_check_timeout'] * 1000}")
                
                # Perform VACUUM
                self.logger.info("Attempting VACUUM repair...")
                conn.execute("VACUUM")
                
                return {
                    'vacuum_attempted': True,
                    'vacuum_success': True,
                    'vacuum_message': 'VACUUM completed successfully'
                }
        
        except Exception as e:
            self.logger.error(f"VACUUM repair failed: {e}")
            return {
                'vacuum_attempted': True,
                'vacuum_success': False,
                'vacuum_error': str(e)
            }
    
    def _attempt_advanced_repair(self, backup_path: str, repair_details: Dict, start_time: float) -> HealthCheckResult:
        """Attempt advanced repair methods when VACUUM fails."""
        try:
            # Try .dump and recreate approach
            dump_result = self._attempt_dump_restore()
            repair_details.update(dump_result)
            
            if dump_result.get('success'):
                # Verify the dump restore worked
                health_check = self.check_database_integrity(quick_check=False)
                
                if health_check.status == HealthStatus.HEALTHY:
                    return HealthCheckResult(
                        status=HealthStatus.HEALTHY,
                        message="Database repair successful using dump/restore",
                        timestamp=datetime.now(),
                        details=repair_details,
                        response_time_ms=(time.time() - start_time) * 1000,
                        recommendations=["Monitor database health closely"]
                    )
            
            # If all repair attempts fail, suggest backup restore
            return HealthCheckResult(
                status=HealthStatus.CRITICAL,
                message="All repair attempts failed",
                timestamp=datetime.now(),
                details=repair_details,
                response_time_ms=(time.time() - start_time) * 1000,
                recommendations=[
                    "Restore from latest backup",
                    "Manual database recovery required",
                    "Contact system administrator"
                ]
            )
        
        except Exception as e:
            return HealthCheckResult(
                status=HealthStatus.CRITICAL,
                message=f"Advanced repair failed: {e}",
                timestamp=datetime.now(),
                details=repair_details,
                response_time_ms=(time.time() - start_time) * 1000,
                recommendations=["Restore from backup", "Manual intervention required"]
            )
    
    def _attempt_dump_restore(self) -> Dict[str, Any]:
        """Attempt to repair by dumping and restoring database."""
        try:
            temp_dump_path = self.backup_dir / f"temp_dump_{int(time.time())}.sql"
            temp_db_path = self.backup_dir / f"temp_restored_{int(time.time())}.db"
            
            # Create SQL dump
            with open(temp_dump_path, 'w') as dump_file:
                with self._get_test_connection() as conn:
                    for line in conn.iterdump():
                        dump_file.write(f"{line}\n")
            
            # Create new database from dump
            new_conn = sqlite3.connect(str(temp_db_path))
            with open(temp_dump_path, 'r') as dump_file:
                new_conn.executescript(dump_file.read())
            new_conn.close()
            
            # Replace original with restored database
            shutil.move(str(temp_db_path), str(self.db_path))
            
            # Cleanup
            temp_dump_path.unlink(missing_ok=True)
            
            return {
                'dump_restore_attempted': True,
                'success': True,
                'message': 'Database restored from dump'
            }
        
        except Exception as e:
            return {
                'dump_restore_attempted': True,
                'success': False,
                'error': str(e)
            }
    
    def restore_from_backup(self, backup_path: str = None) -> HealthCheckResult:
        """
        Restore database from backup.
        
        Args:
            backup_path: Specific backup to restore from (optional)
            
        Returns:
            HealthCheckResult indicating restore success/failure
        """
        start_time = time.time()
        
        try:
            if backup_path is None:
                backup_path = self._find_latest_backup()
            
            if not backup_path or not Path(backup_path).exists():
                return HealthCheckResult(
                    status=HealthStatus.CRITICAL,
                    message="No valid backup found for restore",
                    timestamp=datetime.now(),
                    details={},
                    response_time_ms=(time.time() - start_time) * 1000,
                    recommendations=["Initialize new database", "Manual recovery required"]
                )
            
            # Create current database backup before restore
            current_backup = self.create_safety_backup("pre_restore")
            
            # Restore from backup
            shutil.copy2(backup_path, self.db_path)
            
            # Verify restored database
            health_check = self.check_database_integrity(quick_check=False)
            
            if health_check.status == HealthStatus.HEALTHY:
                return HealthCheckResult(
                    status=HealthStatus.HEALTHY,
                    message=f"Database restored successfully from {backup_path}",
                    timestamp=datetime.now(),
                    details={
                        'restored_from': backup_path,
                        'current_backup': current_backup,
                        'health_check': health_check.details
                    },
                    response_time_ms=(time.time() - start_time) * 1000,
                    recommendations=["Monitor database health", "Verify application functionality"]
                )
            else:
                return HealthCheckResult(
                    status=HealthStatus.WARNING,
                    message=f"Database restored but has health issues: {health_check.message}",
                    timestamp=datetime.now(),
                    details={
                        'restored_from': backup_path,
                        'health_issues': health_check.details
                    },
                    response_time_ms=(time.time() - start_time) * 1000,
                    recommendations=["Try different backup", "Manual intervention may be required"]
                )
        
        except Exception as e:
            self.logger.error(f"Database restore failed: {e}")
            return HealthCheckResult(
                status=HealthStatus.CRITICAL,
                message=f"Database restore failed: {e}",
                timestamp=datetime.now(),
                details={'error': str(e)},
                response_time_ms=(time.time() - start_time) * 1000,
                recommendations=["Try different backup", "Manual recovery required"]
            )
    
    def _find_latest_backup(self) -> Optional[str]:
        """Find the most recent backup file."""
        try:
            backup_files = list(self.backup_dir.glob("*.db"))
            if not backup_files:
                return None
            
            # Sort by modification time, most recent first
            backup_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            
            return str(backup_files[0])
        
        except Exception as e:
            self.logger.error(f"Failed to find latest backup: {e}")
            return None
    
    def get_health_summary(self) -> Dict[str, Any]:
        """
        Get comprehensive health summary.
        
        Returns:
            Dictionary with health status and history
        """
        current_health = self.check_database_integrity(quick_check=True)
        
        return {
            'current_status': {
                'status': current_health.status.value,
                'message': current_health.message,
                'timestamp': current_health.timestamp.isoformat(),
                'response_time_ms': current_health.response_time_ms,
                'recommendations': current_health.recommendations
            },
            'database_info': {
                'path': str(self.db_path),
                'exists': self.db_path.exists(),
                'size_mb': self.db_path.stat().st_size / (1024 * 1024) if self.db_path.exists() else 0,
                'last_modified': datetime.fromtimestamp(
                    self.db_path.stat().st_mtime
                ).isoformat() if self.db_path.exists() else None
            },
            'backup_info': {
                'backup_dir': str(self.backup_dir),
                'available_backups': len(list(self.backup_dir.glob("*.db"))),
                'latest_backup': self._find_latest_backup()
            },
            'health_history': [
                {
                    'status': h.status.value,
                    'message': h.message,
                    'timestamp': h.timestamp.isoformat(),
                    'response_time_ms': h.response_time_ms
                }
                for h in self._health_history[-10:]  # Last 10 checks
            ],
            'configuration': self.config
        }
    
    def cleanup_old_backups(self, retention_days: int = None) -> int:
        """
        Clean up old backup files.
        
        Args:
            retention_days: Days to retain backups (uses config default if None)
            
        Returns:
            Number of backups cleaned up
        """
        if retention_days is None:
            retention_days = self.config['backup_retention_days']
        
        cutoff_time = time.time() - (retention_days * 24 * 3600)
        cleaned_count = 0
        
        try:
            for backup_file in self.backup_dir.glob("*.db"):
                if backup_file.stat().st_mtime < cutoff_time:
                    # Remove backup and associated metadata
                    backup_file.unlink()
                    metadata_file = backup_file.with_suffix('.metadata')
                    metadata_file.unlink(missing_ok=True)
                    cleaned_count += 1
            
            self.logger.info(f"Cleaned up {cleaned_count} old backup files")
            return cleaned_count
        
        except Exception as e:
            self.logger.error(f"Failed to cleanup backups: {e}")
            return 0
    
    @contextmanager
    def _get_test_connection(self):
        """Get a test connection for health checks."""
        conn = None
        try:
            conn = sqlite3.connect(
                str(self.db_path),
                timeout=self.config['integrity_check_timeout'],
                isolation_level=None
            )
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                conn.close()
