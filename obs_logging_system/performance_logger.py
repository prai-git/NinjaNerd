"""
Performance logging module for monitoring application performance.

Provides detailed performance tracking, bottleneck detection,
and automated performance reporting capabilities.
"""

import time
import functools
import threading
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from contextlib import contextmanager
import logging

from .log_config import LogConfig


@dataclass
class PerformanceMetric:
    """Performance metric data structure."""
    operation: str
    duration_ms: float
    timestamp: datetime
    user: Optional[str] = None
    request_id: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PerformanceStats:
    """Performance statistics for an operation."""
    operation: str
    count: int = 0
    total_time_ms: float = 0.0
    min_time_ms: float = float('inf')
    max_time_ms: float = 0.0
    avg_time_ms: float = 0.0
    p95_time_ms: float = 0.0
    p99_time_ms: float = 0.0
    slow_requests: int = 0


class PerformanceLogger:
    """
    Production-ready performance logger with statistics and alerting.
    """
    
    def __init__(self, config: LogConfig, log_manager=None):
        """Initialize the performance logger."""
        self.config = config
        self.log_manager = log_manager
        self.logger = logging.getLogger('ninjnerd.performance')
        
        # Performance tracking
        self._metrics: List[PerformanceMetric] = []
        self._stats: Dict[str, PerformanceStats] = {}
        self._lock = threading.RLock()
        
        # Thresholds
        self.slow_threshold_ms = config.performance_threshold_ms
        self.critical_threshold_ms = config.performance_threshold_ms * 3
        
        # Retention
        self.metrics_retention_hours = 24
        
        # Background processing
        self._cleanup_thread = None
        self._shutdown_event = threading.Event()
        
        if config.enable_performance_logging:
            self._start_background_processing()
    
    def _start_background_processing(self):
        """Start background processing for metrics cleanup and reporting."""
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            return
            
        self._cleanup_thread = threading.Thread(
            target=self._background_worker,
            daemon=True,
            name="PerfMetricsWorker"
        )
        self._cleanup_thread.start()
        
        self.logger.info("Performance metrics background processing started")
    
    def _background_worker(self):
        """Background worker for metrics processing."""
        report_interval = 3600  # 1 hour
        cleanup_interval = 1800  # 30 minutes
        last_report = time.time()
        last_cleanup = time.time()
        
        while not self._shutdown_event.is_set():
            try:
                current_time = time.time()
                
                # Generate performance report
                if current_time - last_report >= report_interval:
                    self._generate_performance_report()
                    last_report = current_time
                
                # Cleanup old metrics
                if current_time - last_cleanup >= cleanup_interval:
                    self._cleanup_old_metrics()
                    last_cleanup = current_time
                
                # Wait before next cycle
                self._shutdown_event.wait(60)  # Check every minute
                
            except Exception as e:
                self.logger.error(f"Performance background worker error: {e}")
                self._shutdown_event.wait(300)  # Wait 5 minutes on error
    
    def _cleanup_old_metrics(self):
        """Clean up old performance metrics."""
        with self._lock:
            cutoff_time = datetime.now() - timedelta(hours=self.metrics_retention_hours)
            
            original_count = len(self._metrics)
            self._metrics = [m for m in self._metrics if m.timestamp > cutoff_time]
            
            cleaned_count = original_count - len(self._metrics)
            if cleaned_count > 0:
                self.logger.debug(f"Cleaned up {cleaned_count} old performance metrics")
    
    def _generate_performance_report(self):
        """Generate periodic performance report."""
        try:
            with self._lock:
                if not self._metrics:
                    return
                
                # Update statistics
                self._update_statistics()
                
                # Log summary
                total_operations = len(self._metrics)
                slow_operations = sum(1 for m in self._metrics if m.duration_ms > self.slow_threshold_ms)
                critical_operations = sum(1 for m in self._metrics if m.duration_ms > self.critical_threshold_ms)
                
                self.logger.info(
                    f"Performance Report: {total_operations} operations, "
                    f"{slow_operations} slow, {critical_operations} critical"
                )
                
                # Log top slow operations
                top_slow_stats = sorted(
                    self._stats.values(),
                    key=lambda s: s.avg_time_ms,
                    reverse=True
                )[:5]
                
                for stat in top_slow_stats:
                    if stat.avg_time_ms > self.slow_threshold_ms:
                        self.logger.warning(
                            f"Slow operation: {stat.operation} - "
                            f"avg: {stat.avg_time_ms:.1f}ms, "
                            f"max: {stat.max_time_ms:.1f}ms, "
                            f"count: {stat.count}"
                        )
                
        except Exception as e:
            self.logger.error(f"Failed to generate performance report: {e}")
    
    def _update_statistics(self):
        """Update performance statistics for all operations."""
        operation_metrics = {}
        
        # Group metrics by operation
        for metric in self._metrics:
            if metric.operation not in operation_metrics:
                operation_metrics[metric.operation] = []
            operation_metrics[metric.operation].append(metric.duration_ms)
        
        # Calculate statistics for each operation
        for operation, durations in operation_metrics.items():
            durations.sort()
            count = len(durations)
            
            if count == 0:
                continue
            
            total_time = sum(durations)
            avg_time = total_time / count
            min_time = min(durations)
            max_time = max(durations)
            
            # Calculate percentiles
            p95_index = int(0.95 * count)
            p99_index = int(0.99 * count)
            p95_time = durations[min(p95_index, count - 1)]
            p99_time = durations[min(p99_index, count - 1)]
            
            slow_count = sum(1 for d in durations if d > self.slow_threshold_ms)
            
            self._stats[operation] = PerformanceStats(
                operation=operation,
                count=count,
                total_time_ms=total_time,
                min_time_ms=min_time,
                max_time_ms=max_time,
                avg_time_ms=avg_time,
                p95_time_ms=p95_time,
                p99_time_ms=p99_time,
                slow_requests=slow_count
            )
    
    def log_operation(self, operation: str, duration_ms: float, **context):
        """Log a performance metric for an operation."""
        if not self.config.enable_performance_logging:
            return
        
        try:
            # Get user context
            user = None
            request_id = None
            
            try:
                from flask import session, g
                user = session.get('username', 'anonymous')
                request_id = getattr(g, 'request_id', None)
            except (ImportError, RuntimeError):
                pass
            
            # Create metric
            metric = PerformanceMetric(
                operation=operation,
                duration_ms=duration_ms,
                timestamp=datetime.now(),
                user=user,
                request_id=request_id,
                context=context
            )
            
            # Store metric
            with self._lock:
                self._metrics.append(metric)
                
                # Prevent memory buildup
                if len(self._metrics) > 10000:
                    self._metrics = self._metrics[-8000:]  # Keep most recent 8000
                
                # Update statistics immediately for accurate stats
                self._update_statistics()
            
            # Log based on performance
            if duration_ms > self.critical_threshold_ms:
                self.logger.error(
                    f"CRITICAL SLOW: {operation} took {duration_ms:.1f}ms "
                    f"(threshold: {self.critical_threshold_ms:.1f}ms)"
                )
            elif duration_ms > self.slow_threshold_ms:
                self.logger.warning(
                    f"SLOW: {operation} took {duration_ms:.1f}ms "
                    f"(threshold: {self.slow_threshold_ms:.1f}ms)"
                )
            else:
                self.logger.debug(f"{operation}: {duration_ms:.1f}ms")
            
            # Use log manager if available
            if self.log_manager:
                self.log_manager.log_performance(operation, duration_ms, **context)
                
        except Exception as e:
            # Don't let performance logging break the application
            self.logger.error(f"Failed to log performance metric: {e}")
    
    @contextmanager
    def measure_operation(self, operation: str, **context):
        """Context manager for measuring operation performance."""
        start_time = time.time()
        try:
            yield
        finally:
            duration_ms = (time.time() - start_time) * 1000
            self.log_operation(operation, duration_ms, **context)
    
    def performance_decorator(self, operation_name: Optional[str] = None):
        """Decorator for automatic performance measurement."""
        def decorator(func: Callable) -> Callable:
            op_name = operation_name or f"{func.__module__}.{func.__name__}"
            
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                with self.measure_operation(op_name):
                    return func(*args, **kwargs)
            
            return wrapper
        return decorator
    
    def get_operation_stats(self, operation: str) -> Optional[PerformanceStats]:
        """Get performance statistics for a specific operation."""
        with self._lock:
            return self._stats.get(operation)
    
    def get_all_stats(self) -> Dict[str, PerformanceStats]:
        """Get performance statistics for all operations."""
        with self._lock:
            # Update statistics before returning
            self._update_statistics()
            return self._stats.copy()
    
    def get_slow_operations(self, threshold_ms: Optional[float] = None) -> List[PerformanceStats]:
        """Get list of operations that are consistently slow."""
        threshold = threshold_ms or self.slow_threshold_ms
        
        with self._lock:
            self._update_statistics()
            
            return [
                stat for stat in self._stats.values()
                if stat.avg_time_ms > threshold
            ]
    
    def get_recent_metrics(self, hours: int = 1) -> List[PerformanceMetric]:
        """Get recent performance metrics."""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        with self._lock:
            return [m for m in self._metrics if m.timestamp > cutoff_time]
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get comprehensive performance summary."""
        with self._lock:
            self._update_statistics()
            
            if not self._metrics:
                return {
                    'total_operations': 0,
                    'message': 'No performance data available'
                }
            
            # Recent metrics (last hour)
            recent_metrics = self.get_recent_metrics(1)
            
            # Overall statistics
            all_durations = [m.duration_ms for m in recent_metrics]
            slow_count = sum(1 for d in all_durations if d > self.slow_threshold_ms)
            critical_count = sum(1 for d in all_durations if d > self.critical_threshold_ms)
            
            # Top slow operations
            slow_operations = sorted(
                self.get_slow_operations(),
                key=lambda s: s.avg_time_ms,
                reverse=True
            )[:10]
            
            return {
                'total_operations': len(all_durations),
                'slow_operations': slow_count,
                'critical_operations': critical_count,
                'avg_response_time_ms': sum(all_durations) / len(all_durations) if all_durations else 0,
                'slow_threshold_ms': self.slow_threshold_ms,
                'critical_threshold_ms': self.critical_threshold_ms,
                'top_slow_operations': [
                    {
                        'operation': stat.operation,
                        'avg_time_ms': stat.avg_time_ms,
                        'max_time_ms': stat.max_time_ms,
                        'count': stat.count,
                        'p95_time_ms': stat.p95_time_ms
                    }
                    for stat in slow_operations
                ],
                'metrics_retention_hours': self.metrics_retention_hours,
                'last_updated': datetime.now().isoformat()
            }
    
    def reset_metrics(self):
        """Reset all performance metrics (for testing or new deployment)."""
        with self._lock:
            self._metrics.clear()
            self._stats.clear()
            
        self.logger.info("Performance metrics reset")
    
    def shutdown(self):
        """Shutdown the performance logger."""
        try:
            self._shutdown_event.set()
            
            if self._cleanup_thread and self._cleanup_thread.is_alive():
                self._cleanup_thread.join(timeout=10)
            
            # Final report
            if self.config.enable_performance_logging and self._metrics:
                self._generate_performance_report()
            
            self.logger.info("Performance logger shutdown completed")
            
        except Exception as e:
            self.logger.error(f"Error during performance logger shutdown: {e}")


# Global performance logger instance
_performance_logger: Optional[PerformanceLogger] = None


def get_performance_logger() -> Optional[PerformanceLogger]:
    """Get global performance logger instance."""
    return _performance_logger


def set_performance_logger(logger: PerformanceLogger):
    """Set global performance logger instance."""
    global _performance_logger
    _performance_logger = logger


def measure_performance(operation_name: Optional[str] = None):
    """Decorator for measuring function performance."""
    def decorator(func: Callable) -> Callable:
        op_name = operation_name or f"{func.__module__}.{func.__name__}"
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            perf_logger = get_performance_logger()
            if perf_logger:
                with perf_logger.measure_operation(op_name):
                    return func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        
        return wrapper
    return decorator


@contextmanager
def performance_context(operation: str, **context):
    """Context manager for performance measurement."""
    perf_logger = get_performance_logger()
    if perf_logger:
        with perf_logger.measure_operation(operation, **context):
            yield
    else:
        yield
