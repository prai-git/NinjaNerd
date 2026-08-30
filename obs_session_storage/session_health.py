"""
Session health monitoring module.

Provides comprehensive health checks for session storage systems
including Redis connectivity, filesystem access, and performance metrics.
"""

import os
import time
import logging
import threading
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class HealthStatus(Enum):
    """Health status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result of a health check operation."""
    component: str
    status: HealthStatus
    message: str
    response_time_ms: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SystemHealthSummary:
    """Overall system health summary."""
    overall_status: HealthStatus
    components: List[HealthCheckResult]
    last_check: datetime
    uptime_seconds: float
    total_checks: int
    failed_checks: int


class SessionHealthChecker:
    """
    Comprehensive health checker for session storage systems.
    """
    
    def __init__(self, session_manager, check_interval: int = 60):
        """Initialize the health checker."""
        self.session_manager = session_manager
        self.check_interval = check_interval
        self.logger = logging.getLogger(__name__)
        
        # Health tracking
        self._health_history: List[SystemHealthSummary] = []
        self._start_time = datetime.now()
        self._total_checks = 0
        self._failed_checks = 0
        self._last_check_time = None
        
        # Thread management
        self._health_thread = None
        self._shutdown_event = threading.Event()
        self._lock = threading.RLock()
        
        # Component health status
        self._component_status: Dict[str, HealthCheckResult] = {}
        
    def start_monitoring(self):
        """Start background health monitoring."""
        if self._health_thread and self._health_thread.is_alive():
            self.logger.warning("Health monitoring already running")
            return
            
        self._health_thread = threading.Thread(
            target=self._monitoring_worker,
            daemon=True,
            name="SessionHealthMonitor"
        )
        self._health_thread.start()
        self.logger.info("Session health monitoring started")
    
    def stop_monitoring(self):
        """Stop health monitoring."""
        self._shutdown_event.set()
        
        if self._health_thread and self._health_thread.is_alive():
            self._health_thread.join(timeout=10)
            
        self.logger.info("Session health monitoring stopped")
    
    def _monitoring_worker(self):
        """Background worker for continuous health monitoring."""
        while not self._shutdown_event.is_set():
            try:
                self.perform_health_check()
                self._shutdown_event.wait(self.check_interval)
            except Exception as e:
                self.logger.error(f"Health monitoring error: {e}")
                self._shutdown_event.wait(self.check_interval)
    
    def perform_health_check(self) -> SystemHealthSummary:
        """Perform comprehensive health check."""
        with self._lock:
            start_time = time.time()
            check_results = []
            
            try:
                # Check Redis connectivity
                redis_result = self._check_redis_health()
                check_results.append(redis_result)
                
                # Check filesystem storage
                filesystem_result = self._check_filesystem_health()
                check_results.append(filesystem_result)
                
                # Check session manager health
                session_manager_result = self._check_session_manager_health()
                check_results.append(session_manager_result)
                
                # Check performance metrics
                performance_result = self._check_performance_metrics()
                check_results.append(performance_result)
                
                # Determine overall health
                overall_status = self._determine_overall_health(check_results)
                
                # Update statistics
                self._total_checks += 1
                if overall_status in [HealthStatus.DEGRADED, HealthStatus.UNHEALTHY]:
                    self._failed_checks += 1
                
                # Create summary
                health_summary = SystemHealthSummary(
                    overall_status=overall_status,
                    components=check_results,
                    last_check=datetime.now(),
                    uptime_seconds=time.time() - self._start_time.timestamp(),
                    total_checks=self._total_checks,
                    failed_checks=self._failed_checks
                )
                
                # Store in history (keep last 100 checks)
                self._health_history.append(health_summary)
                if len(self._health_history) > 100:
                    self._health_history.pop(0)
                
                self._last_check_time = datetime.now()
                
                # Update component status
                for result in check_results:
                    self._component_status[result.component] = result
                
                # Log health status
                check_duration = (time.time() - start_time) * 1000
                self.logger.debug(
                    f"Health check completed in {check_duration:.2f}ms. "
                    f"Status: {overall_status.value}"
                )
                
                return health_summary
                
            except Exception as e:
                self.logger.error(f"Health check failed: {e}")
                self._failed_checks += 1
                
                error_result = HealthCheckResult(
                    component="health_checker",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Health check system error: {str(e)}",
                    response_time_ms=(time.time() - start_time) * 1000
                )
                
                return SystemHealthSummary(
                    overall_status=HealthStatus.UNHEALTHY,
                    components=[error_result],
                    last_check=datetime.now(),
                    uptime_seconds=time.time() - self._start_time.timestamp(),
                    total_checks=self._total_checks,
                    failed_checks=self._failed_checks
                )
    
    def _check_redis_health(self) -> HealthCheckResult:
        """Check Redis connectivity and performance."""
        start_time = time.time()
        
        try:
            if not REDIS_AVAILABLE:
                return HealthCheckResult(
                    component="redis",
                    status=HealthStatus.UNHEALTHY,
                    message="Redis library not available",
                    response_time_ms=(time.time() - start_time) * 1000
                )
            
            if not hasattr(self.session_manager, '_redis_client') or not self.session_manager._redis_client:
                return HealthCheckResult(
                    component="redis",
                    status=HealthStatus.DEGRADED,
                    message="Redis client not initialized",
                    response_time_ms=(time.time() - start_time) * 1000
                )
            
            # Test basic connectivity
            redis_client = self.session_manager._redis_client
            redis_client.ping()
            
            # Test write/read operations
            test_key = "ninjnerd:health:test"
            test_value = f"health_check_{int(time.time())}"
            
            redis_client.setex(test_key, 60, test_value)
            retrieved_value = redis_client.get(test_key)
            
            if retrieved_value and retrieved_value.decode('utf-8') == test_value:
                redis_client.delete(test_key)
                
                response_time = (time.time() - start_time) * 1000
                
                # Check response time thresholds
                if response_time > 1000:  # > 1 second
                    status = HealthStatus.DEGRADED
                    message = f"Redis responding slowly ({response_time:.0f}ms)"
                elif response_time > 500:  # > 500ms
                    status = HealthStatus.DEGRADED
                    message = f"Redis response time elevated ({response_time:.0f}ms)"
                else:
                    status = HealthStatus.HEALTHY
                    message = "Redis operating normally"
                
                # Get Redis info
                redis_info = redis_client.info()
                details = {
                    'connected_clients': redis_info.get('connected_clients', 0),
                    'used_memory': redis_info.get('used_memory', 0),
                    'used_memory_human': redis_info.get('used_memory_human', 'unknown'),
                    'redis_version': redis_info.get('redis_version', 'unknown'),
                    'uptime_in_seconds': redis_info.get('uptime_in_seconds', 0)
                }
                
                return HealthCheckResult(
                    component="redis",
                    status=status,
                    message=message,
                    response_time_ms=response_time,
                    details=details
                )
            else:
                return HealthCheckResult(
                    component="redis",
                    status=HealthStatus.UNHEALTHY,
                    message="Redis read/write test failed",
                    response_time_ms=(time.time() - start_time) * 1000
                )
                
        except redis.ConnectionError as e:
            return HealthCheckResult(
                component="redis",
                status=HealthStatus.UNHEALTHY,
                message=f"Redis connection failed: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
        except redis.TimeoutError as e:
            return HealthCheckResult(
                component="redis",
                status=HealthStatus.DEGRADED,
                message=f"Redis timeout: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
        except Exception as e:
            return HealthCheckResult(
                component="redis",
                status=HealthStatus.UNHEALTHY,
                message=f"Redis error: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
    
    def _check_filesystem_health(self) -> HealthCheckResult:
        """Check filesystem storage health."""
        start_time = time.time()
        
        try:
            config = self.session_manager.config
            
            if not config.enable_filesystem_fallback:
                return HealthCheckResult(
                    component="filesystem",
                    status=HealthStatus.HEALTHY,
                    message="Filesystem fallback disabled",
                    response_time_ms=(time.time() - start_time) * 1000
                )
            
            session_dir = config.filesystem_session_dir
            
            # Check directory exists and is writable
            if not os.path.exists(session_dir):
                try:
                    os.makedirs(session_dir, mode=0o755)
                except Exception as e:
                    return HealthCheckResult(
                        component="filesystem",
                        status=HealthStatus.UNHEALTHY,
                        message=f"Cannot create session directory: {str(e)}",
                        response_time_ms=(time.time() - start_time) * 1000
                    )
            
            # Test write/read operations
            test_file = os.path.join(session_dir, f"health_test_{int(time.time())}.tmp")
            test_data = f"health_check_{int(time.time())}"
            
            try:
                # Write test
                with open(test_file, 'w') as f:
                    f.write(test_data)
                
                # Read test
                with open(test_file, 'r') as f:
                    read_data = f.read()
                
                # Cleanup
                os.remove(test_file)
                
                if read_data == test_data:
                    response_time = (time.time() - start_time) * 1000
                    
                    # Get filesystem stats
                    stat_info = os.statvfs(session_dir)
                    free_space = stat_info.f_bavail * stat_info.f_frsize
                    total_space = stat_info.f_blocks * stat_info.f_frsize
                    
                    details = {
                        'session_directory': session_dir,
                        'free_space_bytes': free_space,
                        'total_space_bytes': total_space,
                        'free_space_mb': free_space // (1024 * 1024),
                        'disk_usage_percent': ((total_space - free_space) / total_space) * 100
                    }
                    
                    # Check disk space
                    if free_space < 100 * 1024 * 1024:  # Less than 100MB
                        status = HealthStatus.UNHEALTHY
                        message = f"Low disk space: {free_space // (1024 * 1024)}MB remaining"
                    elif free_space < 500 * 1024 * 1024:  # Less than 500MB
                        status = HealthStatus.DEGRADED
                        message = f"Disk space low: {free_space // (1024 * 1024)}MB remaining"
                    else:
                        status = HealthStatus.HEALTHY
                        message = "Filesystem storage healthy"
                    
                    return HealthCheckResult(
                        component="filesystem",
                        status=status,
                        message=message,
                        response_time_ms=response_time,
                        details=details
                    )
                else:
                    return HealthCheckResult(
                        component="filesystem",
                        status=HealthStatus.UNHEALTHY,
                        message="Filesystem read/write test failed",
                        response_time_ms=(time.time() - start_time) * 1000
                    )
                    
            except PermissionError:
                return HealthCheckResult(
                    component="filesystem",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Permission denied accessing {session_dir}",
                    response_time_ms=(time.time() - start_time) * 1000
                )
            except OSError as e:
                return HealthCheckResult(
                    component="filesystem",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Filesystem error: {str(e)}",
                    response_time_ms=(time.time() - start_time) * 1000
                )
                
        except Exception as e:
            return HealthCheckResult(
                component="filesystem",
                status=HealthStatus.UNHEALTHY,
                message=f"Filesystem check failed: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
    
    def _check_session_manager_health(self) -> HealthCheckResult:
        """Check session manager health."""
        start_time = time.time()
        
        try:
            metrics = self.session_manager.get_session_metrics()
            
            details = {
                'total_sessions': metrics.total_sessions,
                'active_sessions': metrics.active_sessions,
                'redis_sessions': metrics.redis_sessions,
                'filesystem_sessions': metrics.filesystem_sessions,
                'failed_operations': metrics.failed_operations,
                'redis_available': metrics.redis_available
            }
            
            response_time = (time.time() - start_time) * 1000
            
            # Determine status based on metrics
            if metrics.failed_operations > metrics.total_sessions * 0.1:  # > 10% failure rate
                status = HealthStatus.UNHEALTHY
                message = f"High failure rate: {metrics.failed_operations} failed operations"
            elif metrics.failed_operations > 0:
                status = HealthStatus.DEGRADED
                message = f"Some failures detected: {metrics.failed_operations} failed operations"
            elif not metrics.redis_available and self.session_manager.config.enable_filesystem_fallback:
                status = HealthStatus.DEGRADED
                message = "Running on filesystem fallback (Redis unavailable)"
            elif not metrics.redis_available:
                status = HealthStatus.UNHEALTHY
                message = "Redis unavailable and no fallback enabled"
            else:
                status = HealthStatus.HEALTHY
                message = f"Session manager healthy ({metrics.active_sessions} active sessions)"
            
            return HealthCheckResult(
                component="session_manager",
                status=status,
                message=message,
                response_time_ms=response_time,
                details=details
            )
            
        except Exception as e:
            return HealthCheckResult(
                component="session_manager",
                status=HealthStatus.UNHEALTHY,
                message=f"Session manager check failed: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
    
    def _check_performance_metrics(self) -> HealthCheckResult:
        """Check performance metrics."""
        start_time = time.time()
        
        try:
            import psutil
            
            # Get system metrics
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            details = {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_available_mb': memory.available // (1024 * 1024),
                'disk_percent': disk.percent,
                'disk_free_gb': disk.free // (1024 * 1024 * 1024),
                'process_count': len(psutil.pids())
            }
            
            response_time = (time.time() - start_time) * 1000
            
            # Determine status based on system resources
            if cpu_percent > 90 or memory.percent > 95 or disk.percent > 95:
                status = HealthStatus.UNHEALTHY
                message = "Critical system resource usage"
            elif cpu_percent > 70 or memory.percent > 80 or disk.percent > 85:
                status = HealthStatus.DEGRADED
                message = "High system resource usage"
            else:
                status = HealthStatus.HEALTHY
                message = "System resources healthy"
            
            return HealthCheckResult(
                component="performance",
                status=status,
                message=message,
                response_time_ms=response_time,
                details=details
            )
            
        except ImportError:
            return HealthCheckResult(
                component="performance",
                status=HealthStatus.UNKNOWN,
                message="psutil not available for performance monitoring",
                response_time_ms=(time.time() - start_time) * 1000
            )
        except Exception as e:
            return HealthCheckResult(
                component="performance",
                status=HealthStatus.UNKNOWN,
                message=f"Performance check failed: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
    
    def _determine_overall_health(self, results: List[HealthCheckResult]) -> HealthStatus:
        """Determine overall health status from component results."""
        if not results:
            return HealthStatus.UNKNOWN
        
        unhealthy_count = sum(1 for r in results if r.status == HealthStatus.UNHEALTHY)
        degraded_count = sum(1 for r in results if r.status == HealthStatus.DEGRADED)
        
        if unhealthy_count > 0:
            return HealthStatus.UNHEALTHY
        elif degraded_count > 0:
            return HealthStatus.DEGRADED
        else:
            return HealthStatus.HEALTHY
    
    def get_current_health(self) -> Optional[SystemHealthSummary]:
        """Get the most recent health summary."""
        with self._lock:
            return self._health_history[-1] if self._health_history else None
    
    def get_health_history(self, limit: int = 10) -> List[SystemHealthSummary]:
        """Get recent health history."""
        with self._lock:
            return self._health_history[-limit:] if self._health_history else []
    
    def get_component_status(self, component: str) -> Optional[HealthCheckResult]:
        """Get status for a specific component."""
        with self._lock:
            return self._component_status.get(component)
    
    def get_health_report(self) -> Dict[str, Any]:
        """Get comprehensive health report."""
        with self._lock:
            current_health = self.get_current_health()
            
            if not current_health:
                return {
                    'status': 'unknown',
                    'message': 'No health data available',
                    'last_check': None
                }
            
            return {
                'status': current_health.overall_status.value,
                'last_check': current_health.last_check.isoformat(),
                'uptime_seconds': current_health.uptime_seconds,
                'total_checks': current_health.total_checks,
                'failed_checks': current_health.failed_checks,
                'success_rate': ((current_health.total_checks - current_health.failed_checks) / 
                               max(current_health.total_checks, 1)) * 100,
                'components': {
                    result.component: {
                        'status': result.status.value,
                        'message': result.message,
                        'response_time_ms': result.response_time_ms,
                        'last_check': result.timestamp.isoformat(),
                        'details': result.details
                    }
                    for result in current_health.components
                }
            }
    
    def __enter__(self):
        self.start_monitoring()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_monitoring()
