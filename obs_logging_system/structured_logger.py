"""
Structured logging module for consistent, searchable, and analyzable logs.

Provides structured logging with metadata enrichment, context tracking,
and automatic log correlation for production applications.
"""

import json
import uuid
import time
import logging
import threading
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
from dataclasses import dataclass, field, asdict
from contextlib import contextmanager
from functools import wraps

from .log_config import LogConfig


@dataclass
class LogContext:
    """Structured log context for correlation and metadata."""
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    operation: Optional[str] = None
    component: Optional[str] = None
    version: Optional[str] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StructuredLogEntry:
    """Structured log entry with all metadata."""
    timestamp: str
    level: str
    message: str
    logger_name: str
    module: str
    function: str
    line_number: int
    thread_id: int
    thread_name: str
    process_id: int
    context: LogContext
    extra_data: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert log entry to dictionary."""
        data = asdict(self)
        # Flatten context for easier searching
        if self.context:
            context_dict = asdict(self.context)
            data['context'] = context_dict
            # Add top-level context fields for easier filtering
            for key, value in context_dict.items():
                if value is not None and key != 'metadata':
                    data[f'ctx_{key}'] = value
        return data
    
    def to_json(self) -> str:
        """Convert log entry to JSON string."""
        return json.dumps(self.to_dict(), default=str, ensure_ascii=False)


class StructuredLogFormatter(logging.Formatter):
    """Custom formatter for structured logging."""
    
    def __init__(self, include_context: bool = True):
        self.include_context = include_context
        super().__init__()
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as structured JSON."""
        try:
            # Get context from thread-local storage or record
            context = getattr(record, 'context', None) or _get_thread_context()
            
            # Extract extra data
            extra_data = {}
            for key, value in record.__dict__.items():
                if key not in [
                    'name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                    'filename', 'module', 'lineno', 'funcName', 'created',
                    'msecs', 'relativeCreated', 'thread', 'threadName',
                    'processName', 'process', 'getMessage', 'exc_info',
                    'exc_text', 'stack_info', 'context'
                ]:
                    extra_data[key] = value
            
            # Create structured entry
            entry = StructuredLogEntry(
                timestamp=datetime.fromtimestamp(record.created).isoformat(),
                level=record.levelname,
                message=record.getMessage(),
                logger_name=record.name,
                module=record.module,
                function=record.funcName,
                line_number=record.lineno,
                thread_id=record.thread,
                thread_name=record.threadName,
                process_id=record.process,
                context=context or LogContext(),
                extra_data=extra_data
            )
            
            return entry.to_json()
            
        except Exception as e:
            # Fallback to simple formatting if structured logging fails
            return f"{record.levelname}:{record.name}:{record.getMessage()} [FORMATTING_ERROR: {e}]"


class ContextFilter(logging.Filter):
    """Filter to add context information to log records."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Add context to log record."""
        try:
            # Get context from thread-local storage
            context = _get_thread_context()
            if context:
                record.context = context
            
            # Try to get Flask request context
            try:
                from flask import request, session, g
                
                if not hasattr(record, 'context') or not record.context:
                    record.context = LogContext()
                
                # Add request information
                if hasattr(g, 'request_id'):
                    record.context.request_id = g.request_id
                
                # Add user information
                user_id = session.get('user_id') or session.get('username')
                if user_id:
                    record.context.user_id = str(user_id)
                
                # Add session information
                if hasattr(session, 'sid'):
                    record.context.session_id = session.sid
                
                # Add request metadata
                if request:
                    record.context.metadata.update({
                        'method': request.method,
                        'path': request.path,
                        'remote_addr': request.remote_addr,
                        'user_agent': request.headers.get('User-Agent', '')[:200]  # Truncate
                    })
                    
            except (ImportError, RuntimeError):
                # No Flask context available
                pass
            
        except Exception:
            # Don't let context enrichment break logging
            pass
        
        return True


class StructuredLogger:
    """
    Production-ready structured logger with context management.
    """
    
    def __init__(self, config: LogConfig, log_manager=None):
        """Initialize the structured logger."""
        self.config = config
        self.log_manager = log_manager
        
        # Setup structured logging
        self._setup_structured_logging()
        
        # Context management
        self._context_stack = threading.local()
        
        # Logger instances
        self.app_logger = logging.getLogger('ninjnerd.app')
        self.security_logger = logging.getLogger('ninjnerd.security')
        self.audit_logger = logging.getLogger('ninjnerd.audit')
        self.error_logger = logging.getLogger('ninjnerd.error')
        self.access_logger = logging.getLogger('ninjnerd.access')
        
        # Add context filter to all loggers
        context_filter = ContextFilter()
        for logger in [
            self.app_logger, self.security_logger, self.audit_logger,
            self.error_logger, self.access_logger
        ]:
            logger.addFilter(context_filter)
    
    def _setup_structured_logging(self):
        """Setup structured logging formatters."""
        if not self.config.enable_structured_logging:
            return
        
        # Get root logger for ninjnerd
        root_logger = logging.getLogger('ninjnerd')
        
        # Add structured formatter to all handlers
        structured_formatter = StructuredLogFormatter()
        
        for handler in root_logger.handlers:
            if isinstance(handler, logging.FileHandler):
                handler.setFormatter(structured_formatter)
    
    def set_context(self, **context_data):
        """Set logging context for current thread."""
        current_context = self.get_context()
        
        # Update context with new data
        for key, value in context_data.items():
            if hasattr(current_context, key):
                setattr(current_context, key, value)
            else:
                current_context.metadata[key] = value
        
        _set_thread_context(current_context)
    
    def get_context(self) -> LogContext:
        """Get current logging context."""
        return _get_thread_context() or LogContext()
    
    def clear_context(self):
        """Clear logging context for current thread."""
        _clear_thread_context()
    
    @contextmanager
    def context(self, **context_data):
        """Context manager for temporary logging context."""
        # Save current context
        old_context = self.get_context()
        
        try:
            # Set new context
            new_context = LogContext(**{**asdict(old_context), **context_data})
            _set_thread_context(new_context)
            yield new_context
        finally:
            # Restore old context
            _set_thread_context(old_context)
    
    def with_context(self, **context_data):
        """Decorator for adding context to function calls."""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                with self.context(**context_data):
                    return func(*args, **kwargs)
            return wrapper
        return decorator
    
    def generate_request_id(self) -> str:
        """Generate unique request ID."""
        return str(uuid.uuid4())
    
    def generate_trace_id(self) -> str:
        """Generate unique trace ID."""
        return str(uuid.uuid4())
    
    def log_application_event(self, level: str, message: str, **extra):
        """Log application event with structured format."""
        logger_method = getattr(self.app_logger, level.lower())
        logger_method(message, extra=extra)
    
    def log_security_event(self, event_type: str, message: str, severity: str = 'warning', **extra):
        """Log security event with structured format."""
        extra.update({
            'event_type': event_type,
            'severity': severity,
            'timestamp': datetime.now().isoformat()
        })
        
        if severity.lower() in ['critical', 'high']:
            self.security_logger.error(message, extra=extra)
        elif severity.lower() == 'medium':
            self.security_logger.warning(message, extra=extra)
        else:
            self.security_logger.info(message, extra=extra)
    
    def log_audit_event(self, action: str, resource: str, user: Optional[str] = None, 
                       result: str = 'success', **extra):
        """Log audit event with structured format."""
        extra.update({
            'action': action,
            'resource': resource,
            'user': user or 'anonymous',
            'result': result,
            'timestamp': datetime.now().isoformat()
        })
        
        if result.lower() == 'success':
            self.audit_logger.info(f"Audit: {action} on {resource}", extra=extra)
        else:
            self.audit_logger.warning(f"Audit: {action} on {resource} - {result}", extra=extra)
    
    def log_error(self, error: Exception, context: Optional[str] = None, **extra):
        """Log error with structured format and full context."""
        extra.update({
            'error_type': type(error).__name__,
            'error_message': str(error),
            'context': context,
            'timestamp': datetime.now().isoformat()
        })
        
        # Include stack trace if available
        import traceback
        extra['stack_trace'] = traceback.format_exc()
        
        self.error_logger.error(
            f"Error in {context or 'application'}: {error}",
            extra=extra,
            exc_info=True
        )
    
    def log_access(self, method: str, path: str, status_code: int, 
                   duration_ms: float, user: Optional[str] = None, **extra):
        """Log access event with structured format."""
        extra.update({
            'method': method,
            'path': path,
            'status_code': status_code,
            'duration_ms': duration_ms,
            'user': user or 'anonymous',
            'timestamp': datetime.now().isoformat()
        })
        
        # Log level based on status code
        if status_code >= 500:
            self.access_logger.error(f"{method} {path} - {status_code} ({duration_ms:.1f}ms)", extra=extra)
        elif status_code >= 400:
            self.access_logger.warning(f"{method} {path} - {status_code} ({duration_ms:.1f}ms)", extra=extra)
        else:
            self.access_logger.info(f"{method} {path} - {status_code} ({duration_ms:.1f}ms)", extra=extra)
    
    def log_business_event(self, event: str, details: Dict[str, Any], **extra):
        """Log business event with structured format."""
        extra.update({
            'event_type': 'business',
            'event': event,
            'details': details,
            'timestamp': datetime.now().isoformat()
        })
        
        self.app_logger.info(f"Business Event: {event}", extra=extra)
    
    def log_performance_alert(self, operation: str, duration_ms: float, 
                            threshold_ms: float, **extra):
        """Log performance alert with structured format."""
        extra.update({
            'operation': operation,
            'duration_ms': duration_ms,
            'threshold_ms': threshold_ms,
            'slowdown_factor': duration_ms / threshold_ms,
            'timestamp': datetime.now().isoformat()
        })
        
        if duration_ms > threshold_ms * 3:
            self.app_logger.error(f"CRITICAL SLOW: {operation} took {duration_ms:.1f}ms", extra=extra)
        else:
            self.app_logger.warning(f"SLOW: {operation} took {duration_ms:.1f}ms", extra=extra)
    
    def search_logs(self, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        """Search structured logs (placeholder for future implementation)."""
        # This would integrate with log aggregation systems like ELK, Splunk, etc.
        # For now, return empty list
        return []
    
    def get_log_statistics(self, hours: int = 24) -> Dict[str, Any]:
        """Get log statistics for the specified time period."""
        # This would analyze log files or integrate with log aggregation systems
        # For now, return basic statistics
        return {
            'time_period_hours': hours,
            'total_logs': 0,
            'error_count': 0,
            'warning_count': 0,
            'info_count': 0,
            'debug_count': 0,
            'security_events': 0,
            'audit_events': 0,
            'performance_alerts': 0,
            'message': 'Log analysis not yet implemented'
        }


# Thread-local storage for context
_thread_local = threading.local()


def _get_thread_context() -> Optional[LogContext]:
    """Get logging context from thread-local storage."""
    return getattr(_thread_local, 'log_context', None)


def _set_thread_context(context: LogContext):
    """Set logging context in thread-local storage."""
    _thread_local.log_context = context


def _clear_thread_context():
    """Clear logging context from thread-local storage."""
    if hasattr(_thread_local, 'log_context'):
        delattr(_thread_local, 'log_context')


# Global structured logger instance
_structured_logger: Optional[StructuredLogger] = None


def get_structured_logger() -> Optional[StructuredLogger]:
    """Get global structured logger instance."""
    return _structured_logger


def set_structured_logger(logger: StructuredLogger):
    """Set global structured logger instance."""
    global _structured_logger
    _structured_logger = logger


def log_context(**context_data):
    """Decorator for adding logging context to functions."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            structured_logger = get_structured_logger()
            if structured_logger:
                with structured_logger.context(**context_data):
                    return func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        return wrapper
    return decorator


@contextmanager
def logging_context(**context_data):
    """Context manager for structured logging context."""
    structured_logger = get_structured_logger()
    if structured_logger:
        with structured_logger.context(**context_data):
            yield
    else:
        yield


def log_security_event(event_type: str, message: str, severity: str = 'warning', **extra):
    """Convenience function for logging security events."""
    structured_logger = get_structured_logger()
    if structured_logger:
        structured_logger.log_security_event(event_type, message, severity, **extra)


def log_audit_event(action: str, resource: str, user: Optional[str] = None, 
                   result: str = 'success', **extra):
    """Convenience function for logging audit events."""
    structured_logger = get_structured_logger()
    if structured_logger:
        structured_logger.log_audit_event(action, resource, user, result, **extra)


def log_error(error: Exception, context: Optional[str] = None, **extra):
    """Convenience function for logging errors."""
    structured_logger = get_structured_logger()
    if structured_logger:
        structured_logger.log_error(error, context, **extra)
