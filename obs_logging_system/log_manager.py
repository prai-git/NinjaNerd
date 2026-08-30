"""
Production log manager with rotating file handlers and comprehensive logging.

Provides centralized logging management with automatic rotation, cleanup,
and performance monitoring capabilities.
"""

import os
import sys
import logging
import threading
import time
import gzip
import shutil
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from pathlib import Path
from contextlib import contextmanager

from .log_config import LogConfig, LogLevel, LogFormat


class ProductionFormatter(logging.Formatter):
    """Enhanced formatter with context information."""
    
    def __init__(self, fmt=None, datefmt=None, include_context=True):
        super().__init__(fmt, datefmt)
        self.include_context = include_context
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with production context."""
        # Add default values for missing fields to prevent KeyErrors
        if not hasattr(record, 'request_id'):
            record.request_id = 'no-request'
        if not hasattr(record, 'remote_addr'):
            record.remote_addr = 'unknown'
        if not hasattr(record, 'method'):
            record.method = 'unknown'
        if not hasattr(record, 'path'):
            record.path = 'unknown'
        if not hasattr(record, 'user_agent'):
            record.user_agent = 'unknown'
        if not hasattr(record, 'username'):
            record.username = 'unknown'
        if not hasattr(record, 'thread_name'):
            record.thread_name = threading.current_thread().name
        
        # Try to get Flask context if available
        if self.include_context:
            try:
                from flask import request as flask_request, session, g
                
                # Add request context
                if hasattr(g, 'request_id'):
                    record.request_id = g.request_id
                
                if flask_request:
                    record.remote_addr = flask_request.remote_addr or 'unknown'
                    record.method = flask_request.method or 'unknown'
                    record.path = flask_request.path or 'unknown'
                    record.user_agent = flask_request.headers.get('User-Agent', 'unknown')[:100]
                
                # Add user context
                if session and 'username' in session:
                    record.username = session['username']
                    
            except (ImportError, RuntimeError):
                # Outside Flask context or Flask not available
                pass
        
        try:
            return super().format(record)
        except (KeyError, ValueError) as e:
            # Fallback formatting if there are still missing fields
            fallback_format = '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
            formatter = logging.Formatter(fallback_format)
            return formatter.format(record)


class AsyncFileHandler(RotatingFileHandler):
    """Asynchronous file handler to prevent blocking main thread."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._queue = []
        self._lock = threading.Lock()
        self._worker_thread = None
        self._shutdown_event = threading.Event()
        self._start_worker()
    
    def _start_worker(self):
        """Start background worker thread."""
        if self._worker_thread and self._worker_thread.is_alive():
            return
            
        self._worker_thread = threading.Thread(
            target=self._worker_loop,
            daemon=False,  # Changed to False to allow proper shutdown
            name="LogWriter"
        )
        self._worker_thread.start()
    
    def _worker_loop(self):
        """Background worker loop for writing logs."""
        while not self._shutdown_event.is_set():
            try:
                records_to_process = []
                
                with self._lock:
                    if self._queue:
                        records_to_process = self._queue[:]
                        self._queue.clear()
                
                for record in records_to_process:
                    try:
                        super().emit(record)
                    except Exception:
                        # Avoid infinite recursion in case of logging errors
                        pass
                
                time.sleep(0.1)  # Small delay to prevent high CPU usage
                
            except Exception:
                time.sleep(1)  # Longer delay on error
    
    def emit(self, record):
        """Add record to queue for async processing."""
        try:
            with self._lock:
                self._queue.append(record)
                
                # Prevent memory buildup by limiting queue size
                if len(self._queue) > 1000:
                    self._queue.pop(0)  # Remove oldest record
                    
        except Exception:
            # Fallback to synchronous logging if async fails
            try:
                super().emit(record)
            except Exception:
                pass
    
    def shutdown(self):
        """Shutdown async handler."""
        self._shutdown_event.set()
        
        # Give the thread a short time to finish
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=2)
        
        # If still alive, force cleanup
        if self._worker_thread and self._worker_thread.is_alive():
            print(f"Warning: Force terminating logging thread {self._worker_thread.name}")
        
        # Process remaining queued records quickly
        try:
            with self._lock:
                # Limit processing to avoid hanging
                remaining = min(len(self._queue), 100)
                for i in range(remaining):
                    if self._queue:
                        record = self._queue.pop(0)
                        try:
                            super().emit(record)
                        except Exception:
                            pass
                self._queue.clear()
        except Exception:
            pass
        
        # Close the underlying handler
        try:
            super().close()
        except Exception:
            pass


class LogManager:
    """
    Production-ready log manager with rotating handlers and cleanup.
    """
    
    def __init__(self, config: LogConfig):
        """Initialize the log manager."""
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Track handlers and loggers
        self._handlers: Dict[str, logging.Handler] = {}
        self._loggers: Dict[str, logging.Logger] = {}
        self._formatters: Dict[str, logging.Formatter] = {}
        
        # Cleanup tracking
        self._cleanup_thread = None
        self._shutdown_event = threading.Event()
        
        # Error tracking
        self._error_counts: Dict[str, int] = {}
        self._last_error_check = datetime.now()
        
        self._initialize_logging()
    
    def _initialize_logging(self):
        """Initialize the logging system."""
        try:
            # Create formatters
            self._create_formatters()
            
            # Create handlers
            self._create_handlers()
            
            # Configure loggers
            self._configure_loggers()
            
            # Start cleanup worker
            self._start_cleanup_worker()
            
            self.logger.info("Production logging system initialized successfully")
            
        except Exception as e:
            print(f"Failed to initialize logging system: {e}")
            raise
    
    def setup_logging(self):
        """Public method to setup logging - alias for _initialize_logging."""
        # This method exists for compatibility with external interfaces
        # Re-initialize to ensure everything is set up properly
        self._initialize_logging()
    
    def _create_formatters(self):
        """Create log formatters."""
        # Main formatter
        self._formatters['main'] = ProductionFormatter(
            fmt=self.config.get_log_format_string(),
            datefmt=self.config.get_date_format_string(),
            include_context=self.config.include_request_context
        )
        
        # Error formatter (more detailed)
        self._formatters['error'] = ProductionFormatter(
            fmt=(
                '%(asctime)s | %(levelname)-8s | %(name)-20s | '
                '%(filename)s:%(lineno)d:%(funcName)s | '
                'User:%(username)s | Request:%(request_id)s | '
                'Thread:%(thread_name)s | %(message)s'
            ),
            datefmt=self.config.get_date_format_string(),
            include_context=True
        )
        
        # Access formatter (simple)
        self._formatters['access'] = ProductionFormatter(
            fmt=(
                '%(asctime)s | %(remote_addr)s | %(method)s | %(path)s | '
                '%(username)s | %(message)s'
            ),
            datefmt=self.config.get_date_format_string(),
            include_context=True
        )
        
        # Performance formatter
        self._formatters['performance'] = ProductionFormatter(
            fmt=(
                '%(asctime)s | PERF | %(name)-20s | '
                'User:%(username)s | Request:%(request_id)s | %(message)s'
            ),
            datefmt=self.config.get_date_format_string(),
            include_context=True
        )
        
        # Console formatter (simplified)
        self._formatters['console'] = logging.Formatter(
            '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
            datefmt='%H:%M:%S'
        )
    
    def _create_handlers(self):
        """Create log handlers."""
        try:
            # Main rotating file handler
            if self.config.enable_async_logging:
                main_handler = AsyncFileHandler(
                    filename=self.config.get_log_file_path('main'),
                    maxBytes=self.config.max_file_size,
                    backupCount=self.config.backup_count,
                    encoding='utf-8'
                )
            else:
                main_handler = RotatingFileHandler(
                    filename=self.config.get_log_file_path('main'),
                    maxBytes=self.config.max_file_size,
                    backupCount=self.config.backup_count,
                    encoding='utf-8'
                )
            main_handler.setLevel(getattr(logging, self.config.log_level.upper()))
            main_handler.setFormatter(self._formatters['main'])
            self._handlers['main'] = main_handler
        except Exception as e:
            # Fallback to console handler for main logging
            fallback_handler = logging.StreamHandler()
            fallback_handler.setLevel(getattr(logging, self.config.log_level.upper()))
            fallback_handler.setFormatter(self._formatters['main'])
            self._handlers['main'] = fallback_handler
            self.logger.warning(f"Failed to create main file handler, using console: {e}")
        
        try:
            # Error file handler (ERROR level and above)
            if self.config.enable_async_logging:
                error_handler = AsyncFileHandler(
                    filename=self.config.get_log_file_path('error'),
                    maxBytes=self.config.max_file_size,
                    backupCount=self.config.backup_count,
                    encoding='utf-8'
                )
            else:
                error_handler = RotatingFileHandler(
                    filename=self.config.get_log_file_path('error'),
                    maxBytes=self.config.max_file_size,
                    backupCount=self.config.backup_count,
                    encoding='utf-8'
                )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(self._formatters['error'])
            self._handlers['error'] = error_handler
        except Exception as e:
            # Fallback to console handler for error logging
            fallback_handler = logging.StreamHandler()
            fallback_handler.setLevel(logging.ERROR)
            fallback_handler.setFormatter(self._formatters['error'])
            self._handlers['error'] = fallback_handler
            self.logger.warning(f"Failed to create error file handler, using console: {e}")
        
        try:
            # Access log handler
            if self.config.enable_async_logging:
                access_handler = AsyncFileHandler(
                    filename=self.config.get_log_file_path('access'),
                    maxBytes=self.config.max_file_size,
                    backupCount=self.config.backup_count,
                    encoding='utf-8'
                )
            else:
                access_handler = RotatingFileHandler(
                    filename=self.config.get_log_file_path('access'),
                    maxBytes=self.config.max_file_size,
                    backupCount=self.config.backup_count,
                    encoding='utf-8'
                )
            access_handler.setLevel(logging.INFO)
            access_handler.setFormatter(self._formatters['access'])
            self._handlers['access'] = access_handler
        except Exception as e:
            # Fallback to console handler for access logging
            fallback_handler = logging.StreamHandler()
            fallback_handler.setLevel(logging.INFO)
            fallback_handler.setFormatter(self._formatters['access'])
            self._handlers['access'] = fallback_handler
            self.logger.warning(f"Failed to create access file handler, using console: {e}")
        
        # Performance log handler
        if self.config.enable_performance_logging:
            try:
                if self.config.enable_async_logging:
                    perf_handler = AsyncFileHandler(
                        filename=self.config.get_log_file_path('performance'),
                        maxBytes=self.config.max_file_size,
                        backupCount=self.config.backup_count,
                        encoding='utf-8'
                    )
                else:
                    perf_handler = RotatingFileHandler(
                        filename=self.config.get_log_file_path('performance'),
                        maxBytes=self.config.max_file_size,
                        backupCount=self.config.backup_count,
                        encoding='utf-8'
                    )
                perf_handler.setLevel(logging.INFO)
                perf_handler.setFormatter(self._formatters['performance'])
                self._handlers['performance'] = perf_handler
            except Exception as e:
                # Fallback to console handler for performance logging
                fallback_handler = logging.StreamHandler()
                fallback_handler.setLevel(logging.INFO)
                fallback_handler.setFormatter(self._formatters['performance'])
                self._handlers['performance'] = fallback_handler
                self.logger.warning(f"Failed to create performance file handler, using console: {e}")
        
        # Console handler
        if self.config.enable_console_logging:
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(getattr(logging, self.config.console_log_level.upper()))
            console_handler.setFormatter(self._formatters['console'])
            self._handlers['console'] = console_handler
    
    def _configure_loggers(self):
        """Configure application loggers."""
        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(getattr(logging, self.config.log_level.upper()))
        
        # Clear existing handlers to avoid duplicates
        root_logger.handlers.clear()
        
        # Add main handlers to root logger
        root_logger.addHandler(self._handlers['main'])
        root_logger.addHandler(self._handlers['error'])
        
        if self.config.enable_console_logging:
            root_logger.addHandler(self._handlers['console'])
        
        # Configure specific application loggers
        logger_configs = {
            'ninjnerd': {'handlers': ['main', 'error', 'console']},  # Root app logger
            'ninjnerd.main': {'handlers': ['main', 'error', 'console']},
            'ninjnerd.auth': {'handlers': ['main', 'error', 'access']},
            'ninjnerd.sessions': {'handlers': ['main', 'error']},
            'ninjnerd.database': {'handlers': ['main', 'error']},
            'ninjnerd.llm': {'handlers': ['main', 'error']},
            'ninjnerd.security': {'handlers': ['main', 'error', 'access']},
            'ninjnerd.errors': {'handlers': ['error']},
            'ninjnerd.access': {'handlers': ['access']},
        }
        
        if self.config.enable_performance_logging:
            logger_configs['ninjnerd.performance'] = {'handlers': ['performance']}
        
        for logger_name, logger_config in logger_configs.items():
            logger = logging.getLogger(logger_name)
            logger.setLevel(getattr(logging, self.config.log_level.upper()))
            logger.propagate = False  # Prevent double logging
            
            # Add specified handlers
            for handler_name in logger_config['handlers']:
                if handler_name in self._handlers:
                    logger.addHandler(self._handlers[handler_name])
            
            self._loggers[logger_name] = logger
    
    def _start_cleanup_worker(self):
        """Start background cleanup worker."""
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            return
            
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_worker,
            daemon=True,
            name="LogCleanup"
        )
        self._cleanup_thread.start()
        
        self.logger.info("Log cleanup worker started")
    
    def _cleanup_worker(self):
        """Background worker for log cleanup and maintenance."""
        cleanup_interval = 24 * 60 * 60  # 24 hours
        
        while not self._shutdown_event.is_set():
            try:
                # Perform cleanup operations
                self._cleanup_old_logs()
                self._compress_old_logs()
                self._check_disk_space()
                self._check_error_rates()
                
                # Wait for next cleanup cycle
                self._shutdown_event.wait(cleanup_interval)
                
            except Exception as e:
                self.logger.error(f"Log cleanup worker error: {e}")
                self._shutdown_event.wait(3600)  # Wait 1 hour on error
    
    def _cleanup_old_logs(self):
        """Clean up old log files based on retention policy."""
        try:
            log_dir = Path(self.config.log_directory)
            if not log_dir.exists():
                return
            
            cutoff_date = datetime.now() - timedelta(days=self.config.log_retention_days)
            cleaned_count = 0
            
            for log_file in log_dir.glob('*.log*'):
                try:
                    file_mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                    
                    if file_mtime < cutoff_date:
                        log_file.unlink()
                        cleaned_count += 1
                        
                except Exception as e:
                    self.logger.warning(f"Failed to cleanup log file {log_file}: {e}")
            
            if cleaned_count > 0:
                self.logger.info(f"Cleaned up {cleaned_count} old log files")
                
        except Exception as e:
            self.logger.error(f"Log cleanup failed: {e}")
    
    def _compress_old_logs(self):
        """Compress old log files to save space."""
        if not self.config.enable_log_compression:
            return
            
        try:
            log_dir = Path(self.config.log_directory)
            if not log_dir.exists():
                return
            
            # Compress log files older than 7 days
            cutoff_date = datetime.now() - timedelta(days=7)
            compressed_count = 0
            
            for log_file in log_dir.glob('*.log.[1-9]*'):
                try:
                    if log_file.suffix == '.gz':
                        continue
                        
                    file_mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                    
                    if file_mtime < cutoff_date:
                        # Compress the file
                        compressed_file = log_file.with_suffix(log_file.suffix + '.gz')
                        
                        with open(log_file, 'rb') as f_in:
                            with gzip.open(compressed_file, 'wb') as f_out:
                                shutil.copyfileobj(f_in, f_out)
                        
                        log_file.unlink()
                        compressed_count += 1
                        
                except Exception as e:
                    self.logger.warning(f"Failed to compress log file {log_file}: {e}")
            
            if compressed_count > 0:
                self.logger.info(f"Compressed {compressed_count} old log files")
                
        except Exception as e:
            self.logger.error(f"Log compression failed: {e}")
    
    def _check_disk_space(self):
        """Check available disk space and warn if low."""
        try:
            log_dir = Path(self.config.log_directory)
            stat = shutil.disk_usage(log_dir)
            
            free_gb = stat.free / (1024 ** 3)
            total_gb = stat.total / (1024 ** 3)
            usage_percent = ((stat.total - stat.free) / stat.total) * 100
            
            if free_gb < 1.0:  # Less than 1GB free
                self.logger.critical(
                    f"Critical disk space warning: {free_gb:.2f}GB free "
                    f"({usage_percent:.1f}% used)"
                )
            elif free_gb < 5.0:  # Less than 5GB free
                self.logger.warning(
                    f"Low disk space warning: {free_gb:.2f}GB free "
                    f"({usage_percent:.1f}% used)"
                )
                
        except Exception as e:
            self.logger.error(f"Disk space check failed: {e}")
    
    def _check_error_rates(self):
        """Check error rates and alert if high."""
        try:
            if not self.config.enable_error_aggregation:
                return
            
            current_time = datetime.now()
            time_window = current_time - timedelta(hours=1)
            
            # Count recent errors (simplified - in production you might use more sophisticated tracking)
            error_count = sum(1 for count in self._error_counts.values() if count > 0)
            
            if error_count > self.config.error_notification_threshold:
                self.logger.critical(
                    f"High error rate detected: {error_count} errors in the last hour"
                )
            
            # Reset error counts
            self._error_counts.clear()
            self._last_error_check = current_time
            
        except Exception as e:
            self.logger.error(f"Error rate check failed: {e}")
    
    def get_logger(self, name: str) -> logging.Logger:
        """Get or create a logger with the specified name."""
        if name in self._loggers:
            return self._loggers[name]
        
        logger = logging.getLogger(name)
        logger.setLevel(getattr(logging, self.config.log_level.upper()))
        
        # Add appropriate handlers
        if name.startswith('ninjnerd.'):
            logger.addHandler(self._handlers['main'])
            logger.addHandler(self._handlers['error'])
            
            if 'auth' in name or 'security' in name:
                logger.addHandler(self._handlers['access'])
            
            if 'performance' in name and 'performance' in self._handlers:
                logger.addHandler(self._handlers['performance'])
        
        self._loggers[name] = logger
        return logger
    
    def log_performance(self, operation: str, duration_ms: float, **kwargs):
        """Log performance metrics."""
        if not self.config.enable_performance_logging:
            return
        
        if duration_ms > self.config.performance_threshold_ms:
            level = logging.WARNING
            message = f"SLOW {operation}: {duration_ms:.2f}ms"
        else:
            level = logging.INFO
            message = f"{operation}: {duration_ms:.2f}ms"
        
        perf_logger = self.get_logger('ninjnerd.performance')
        perf_logger.log(level, message, extra=kwargs)
    
    def log_security_event(self, event_type: str, details: Dict[str, Any]):
        """Log security-related events."""
        if not self.config.enable_security_logging:
            return
        
        security_logger = self.get_logger('ninjnerd.security')
        security_logger.warning(
            f"Security event: {event_type}",
            extra={'security_details': details}
        )
    
    def log_access(self, method: str, path: str, status_code: int, 
                   response_time_ms: float, user: str = 'anonymous'):
        """Log access requests."""
        access_logger = self.get_logger('ninjnerd.access')
        access_logger.info(
            f"{status_code} | {response_time_ms:.0f}ms",
            extra={
                'method': method,
                'path': path,
                'status_code': status_code,
                'response_time_ms': response_time_ms,
                'username': user
            }
        )
    
    def get_log_stats(self) -> Dict[str, Any]:
        """Get logging system statistics."""
        try:
            log_dir = Path(self.config.log_directory)
            stats = {
                'log_directory': str(log_dir),
                'handlers': list(self._handlers.keys()),
                'loggers': list(self._loggers.keys()),
                'log_files': [],
                'total_log_size_mb': 0
            }
            
            if log_dir.exists():
                for log_file in log_dir.glob('*.log*'):
                    size_mb = log_file.stat().st_size / (1024 * 1024)
                    stats['log_files'].append({
                        'name': log_file.name,
                        'size_mb': round(size_mb, 2),
                        'modified': datetime.fromtimestamp(log_file.stat().st_mtime).isoformat()
                    })
                    stats['total_log_size_mb'] += size_mb
                
                stats['total_log_size_mb'] = round(stats['total_log_size_mb'], 2)
            
            return stats
            
        except Exception as e:
            return {'error': f'Failed to get log stats: {e}'}
    
    @contextmanager
    def performance_context(self, operation: str, **kwargs):
        """Context manager for performance logging."""
        start_time = time.time()
        try:
            yield
        finally:
            duration_ms = (time.time() - start_time) * 1000
            self.log_performance(operation, duration_ms, **kwargs)
    
    def shutdown(self):
        """Shutdown the logging system."""
        try:
            self._shutdown_event.set()
            
            # Wait for cleanup thread
            if self._cleanup_thread and self._cleanup_thread.is_alive():
                self._cleanup_thread.join(timeout=10)
            
            # Shutdown async handlers
            for handler in self._handlers.values():
                if hasattr(handler, 'shutdown'):
                    handler.shutdown()
                handler.close()
            
            self.logger.info("Logging system shutdown completed")
            
        except Exception as e:
            print(f"Error during logging shutdown: {e}")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
