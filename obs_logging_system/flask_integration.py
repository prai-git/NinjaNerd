"""
Flask integration module for production logging system.

Provides seamless integration of logging system with Flask applications,
including request logging, error handling, and performance monitoring.
"""

import time
import uuid
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from functools import wraps

from flask import Flask, request, session, g, jsonify
from werkzeug.exceptions import HTTPException

from .log_config import LogConfig
from .log_manager import LogManager
from .performance_logger import PerformanceLogger, set_performance_logger
from .structured_logger import StructuredLogger, set_structured_logger, LogContext


class FlaskLoggingIntegration:
    """
    Flask integration for production logging system.
    """
    
    def __init__(self, app: Optional[Flask] = None, config: Optional[LogConfig] = None):
        """Initialize Flask logging integration."""
        self.app = app
        self.config = config or LogConfig()
        
        # Logging components
        self.log_manager: Optional[LogManager] = None
        self.performance_logger: Optional[PerformanceLogger] = None
        self.structured_logger: Optional[StructuredLogger] = None
        
        # Request tracking
        self.request_start_times: Dict[str, float] = {}
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app: Flask):
        """Initialize logging system with Flask application."""
        self.app = app
        
        # Store reference in app
        app.extensions = getattr(app, 'extensions', {})
        app.extensions['logging_system'] = self
        
        try:
            # Initialize logging components
            self._init_logging_components()
            
            # Setup Flask request handlers
            self._setup_request_handlers()
            
            # Setup error handlers
            self._setup_error_handlers()
            
            # Setup health endpoints
            self._setup_health_endpoints()
            
            # Configure Flask's built-in logger
            self._configure_flask_logger()
            
            app.logger.info("Production logging system initialized successfully")
            
        except Exception as e:
            app.logger.error(f"Failed to initialize logging system: {e}")
            # Don't break the application if logging setup fails
            
    def _init_logging_components(self):
        """Initialize all logging system components."""
        try:
            # Initialize log manager
            self.log_manager = LogManager(self.config)
            self.log_manager.setup_logging()
            
            # Initialize performance logger
            self.performance_logger = PerformanceLogger(self.config, self.log_manager)
            set_performance_logger(self.performance_logger)
            
            # Initialize structured logger
            self.structured_logger = StructuredLogger(self.config, self.log_manager)
            set_structured_logger(self.structured_logger)
            
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Failed to initialize logging components: {e}")
            raise
    
    def _setup_request_handlers(self):
        """Setup Flask request handlers for logging."""
        if not self.app:
            return
        
        @self.app.before_request
        def before_request():
            """Handle request start logging."""
            try:
                # Generate request ID
                request_id = str(uuid.uuid4())
                g.request_id = request_id
                g.request_start_time = time.time()
                
                # Set logging context
                if self.structured_logger:
                    user_id = session.get('user_id') or session.get('username')
                    session_id = session.get('session_id', 'anonymous')
                    
                    self.structured_logger.set_context(
                        request_id=request_id,
                        user_id=str(user_id) if user_id else None,
                        session_id=str(session_id),
                        operation=f"{request.method} {request.path}",
                        component='web'
                    )
                
                # Log request start
                if self.config.enable_request_logging:
                    self._log_request_start()
                
            except Exception as e:
                # Don't break requests if logging fails
                if self.app:
                    self.app.logger.error(f"Request logging setup failed: {e}")
        
        @self.app.after_request
        def after_request(response):
            """Handle request completion logging."""
            try:
                # Calculate request duration
                start_time = getattr(g, 'request_start_time', time.time())
                duration_ms = (time.time() - start_time) * 1000
                
                # Log request completion
                if self.config.enable_request_logging:
                    self._log_request_complete(response, duration_ms)
                
                # Log performance
                if self.performance_logger and self.config.enable_performance_logging:
                    operation = f"{request.method} {request.path}"
                    self.performance_logger.log_operation(
                        operation,
                        duration_ms,
                        method=request.method,
                        path=request.path,
                        status_code=response.status_code,
                        user=session.get('username', 'anonymous')
                    )
                
                # Clear logging context
                if self.structured_logger:
                    self.structured_logger.clear_context()
                
            except Exception as e:
                # Don't break responses if logging fails
                if self.app:
                    self.app.logger.error(f"Request completion logging failed: {e}")
            
            return response
    
    def _setup_error_handlers(self):
        """Setup Flask error handlers for logging."""
        if not self.app:
            return
        
        @self.app.errorhandler(Exception)
        def handle_exception(error):
            """Handle all exceptions with logging."""
            try:
                # Log the error
                if self.structured_logger:
                    self.structured_logger.log_error(
                        error,
                        context=f"{request.method} {request.path}",
                        request_id=getattr(g, 'request_id', 'unknown'),
                        user=session.get('username', 'anonymous'),
                        method=request.method,
                        path=request.path,
                        remote_addr=request.remote_addr
                    )
                
                # Log security event for suspicious errors
                if self._is_security_related_error(error):
                    self._log_security_event(error)
                
            except Exception as log_error:
                # Don't let logging errors break error handling
                if self.app:
                    self.app.logger.error(f"Error logging failed: {log_error}")
            
            # Handle HTTP exceptions
            if isinstance(error, HTTPException):
                return error
            
            # For non-HTTP exceptions, return 500
            if self.app.debug:
                raise error
            else:
                return jsonify({
                    'error': 'Internal server error',
                    'request_id': getattr(g, 'request_id', 'unknown')
                }), 500
    
    def _setup_health_endpoints(self):
        """Setup health check endpoints for logging system."""
        if not self.app:
            return
        
        @self.app.route('/health/logging')
        def logging_health():
            """Get logging system health status."""
            try:
                health_data = {
                    'status': 'healthy',
                    'timestamp': datetime.now().isoformat(),
                    'components': {}
                }
                
                # Check log manager
                if self.log_manager:
                    health_data['components']['log_manager'] = {
                        'status': 'healthy',
                        'async_logging_enabled': self.config.enable_async_logging,
                        'log_level': self.config.log_level
                    }
                
                # Check performance logger
                if self.performance_logger:
                    perf_summary = self.performance_logger.get_performance_summary()
                    health_data['components']['performance_logger'] = {
                        'status': 'healthy',
                        'metrics_count': perf_summary.get('total_operations', 0),
                        'slow_operations': perf_summary.get('slow_operations', 0)
                    }
                
                # Check structured logger
                if self.structured_logger:
                    health_data['components']['structured_logger'] = {
                        'status': 'healthy',
                        'structured_logging_enabled': self.config.enable_structured_logging
                    }
                
                return jsonify(health_data)
                
            except Exception as e:
                return jsonify({
                    'status': 'unhealthy',
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                }), 500
        
        @self.app.route('/health/logging/performance')
        def logging_performance():
            """Get logging performance metrics."""
            try:
                if not self.performance_logger:
                    return jsonify({'error': 'Performance logging not enabled'}), 404
                
                summary = self.performance_logger.get_performance_summary()
                return jsonify(summary)
                
            except Exception as e:
                return jsonify({
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                }), 500
        
        @self.app.route('/health/logging/logs')
        def logging_logs():
            """Get recent log statistics."""
            try:
                if not self.structured_logger:
                    return jsonify({'error': 'Structured logging not enabled'}), 404
                
                stats = self.structured_logger.get_log_statistics()
                return jsonify(stats)
                
            except Exception as e:
                return jsonify({
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                }), 500
    
    def _configure_flask_logger(self):
        """Configure Flask's built-in logger."""
        if not self.app:
            return
        
        try:
            # Set log level
            self.app.logger.setLevel(getattr(logging, self.config.log_level.upper()))
            
            # Remove default handlers if we're managing logging
            if self.config.enable_async_logging:
                self.app.logger.handlers.clear()
            
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Failed to configure Flask logger: {e}")
    
    def _log_request_start(self):
        """Log request start."""
        try:
            if self.structured_logger:
                self.structured_logger.log_access(
                    method=request.method,
                    path=request.path,
                    status_code=0,  # Not yet available
                    duration_ms=0,  # Not yet available
                    user=session.get('username'),
                    event='request_start',
                    request_id=getattr(g, 'request_id', 'unknown'),
                    remote_addr=request.remote_addr,
                    user_agent=request.headers.get('User-Agent', '')[:200]
                )
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Request start logging failed: {e}")
    
    def _log_request_complete(self, response, duration_ms: float):
        """Log request completion."""
        try:
            if self.structured_logger:
                # Safely get response size without causing passthrough mode issues
                response_size = 0
                try:
                    if hasattr(response, 'content_length') and response.content_length:
                        response_size = response.content_length
                    elif hasattr(response, 'headers') and 'Content-Length' in response.headers:
                        response_size = int(response.headers['Content-Length'])
                except (ValueError, TypeError):
                    response_size = 0
                
                self.structured_logger.log_access(
                    method=request.method,
                    path=request.path,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                    user=session.get('username'),
                    request_id=getattr(g, 'request_id', 'unknown'),
                    remote_addr=request.remote_addr,
                    response_size=response_size
                )
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Request completion logging failed: {e}")
    
    def _is_security_related_error(self, error: Exception) -> bool:
        """Check if error is security-related."""
        security_indicators = [
            'unauthorized', 'forbidden', 'authentication', 'permission',
            'csrf', 'xss', 'injection', 'invalid token', 'session'
        ]
        
        error_str = str(error).lower()
        return any(indicator in error_str for indicator in security_indicators)
    
    def _log_security_event(self, error: Exception):
        """Log security-related error."""
        try:
            if self.structured_logger:
                self.structured_logger.log_security_event(
                    event_type='error',
                    message=f"Security-related error: {error}",
                    severity='high',
                    request_id=getattr(g, 'request_id', 'unknown'),
                    user=session.get('username', 'anonymous'),
                    method=request.method,
                    path=request.path,
                    remote_addr=request.remote_addr,
                    error_type=type(error).__name__
                )
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Security event logging failed: {e}")
    
    def log_user_action(self, action: str, resource: str, result: str = 'success', **extra):
        """Log user action for audit purposes."""
        try:
            if self.structured_logger:
                user = session.get('username', 'anonymous')
                self.structured_logger.log_audit_event(
                    action=action,
                    resource=resource,
                    user=user,
                    result=result,
                    request_id=getattr(g, 'request_id', 'unknown'),
                    **extra
                )
        except Exception as e:
            if self.app:
                self.app.logger.error(f"User action logging failed: {e}")
    
    def log_business_event(self, event: str, details: Dict[str, Any], **extra):
        """Log business event."""
        try:
            if self.structured_logger:
                self.structured_logger.log_business_event(
                    event=event,
                    details=details,
                    request_id=getattr(g, 'request_id', 'unknown'),
                    user=session.get('username', 'anonymous'),
                    **extra
                )
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Business event logging failed: {e}")
    
    def shutdown(self):
        """Shutdown the logging system."""
        try:
            if self.performance_logger:
                self.performance_logger.shutdown()
            
            if self.log_manager:
                self.log_manager.shutdown()
            
            if self.app:
                self.app.logger.info("Logging system shutdown completed")
                
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Logging system shutdown failed: {e}")


def init_production_logging(app: Flask, config: Optional[LogConfig] = None) -> FlaskLoggingIntegration:
    """
    Initialize production logging system for Flask application.
    
    Args:
        app: Flask application instance
        config: Optional logging configuration
    
    Returns:
        FlaskLoggingIntegration instance
    """
    try:
        # Create or get config
        if config is None:
            config = LogConfig()
        
        # Initialize logging integration
        logging_integration = FlaskLoggingIntegration(app, config)
        
        return logging_integration
        
    except Exception as e:
        app.logger.error(f"Failed to initialize production logging: {e}")
        # Return a minimal integration to prevent application failure
        return FlaskLoggingIntegration(app, LogConfig())


def get_logging_integration(app: Optional[Flask] = None) -> Optional[FlaskLoggingIntegration]:
    """Get logging integration from Flask application."""
    if app is None:
        from flask import current_app
        app = current_app
    
    return app.extensions.get('logging_system')


def log_user_action(action: str, resource: str, result: str = 'success', **extra):
    """Convenience function for logging user actions."""
    integration = get_logging_integration()
    if integration:
        integration.log_user_action(action, resource, result, **extra)


def log_business_event(event: str, details: Dict[str, Any], **extra):
    """Convenience function for logging business events."""
    integration = get_logging_integration()
    if integration:
        integration.log_business_event(event, details, **extra)
