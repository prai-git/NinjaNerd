"""
Production Logging System for NinjaNerd Flask Application

This module provides a comprehensive, production-ready logging system with:
- Structured logging with JSON output
- Performance monitoring and alerting
- Security event tracking
- Audit logging for compliance
- Automatic log rotation and cleanup
- Flask integration with request tracking
- Health monitoring and metrics

Usage:
    from logging_system import init_production_logging, LogConfig
    
    # Basic usage
    logging_integration = init_production_logging(app)
    
    # Advanced usage with custom configuration
    config = LogConfig(
        log_level='INFO',
        enable_async_logging=True,
        enable_performance_logging=True,
        max_log_file_size_mb=100
    )
    logging_integration = init_production_logging(app, config)

Components:
    - LogConfig: Configuration management
    - LogManager: Core logging management with async processing
    - PerformanceLogger: Performance monitoring and alerting
    - StructuredLogger: Structured logging with context tracking
    - FlaskIntegration: Seamless Flask application integration
"""

from .log_config import LogConfig
from .log_manager import LogManager
from .performance_logger import (
    PerformanceLogger, 
    get_performance_logger, 
    set_performance_logger,
    measure_performance,
    performance_context
)
from .structured_logger import (
    StructuredLogger,
    LogContext,
    get_structured_logger,
    set_structured_logger,
    log_context,
    logging_context,
    log_security_event,
    log_audit_event,
    log_error
)
from .flask_integration import (
    FlaskLoggingIntegration,
    init_production_logging,
    get_logging_integration,
    log_user_action,
    log_business_event
)

# Version information
__version__ = '1.0.0'
__author__ = 'NinjaNerd Development Team'
__description__ = 'Production-ready logging system for Flask applications'

# Export all public classes and functions
__all__ = [
    # Configuration
    'LogConfig',
    
    # Core components
    'LogManager',
    'PerformanceLogger',
    'StructuredLogger',
    'FlaskLoggingIntegration',
    
    # Context management
    'LogContext',
    
    # Performance logging
    'get_performance_logger',
    'set_performance_logger',
    'measure_performance',
    'performance_context',
    
    # Structured logging
    'get_structured_logger',
    'set_structured_logger',
    'log_context',
    'logging_context',
    'log_security_event',
    'log_audit_event',
    'log_error',
    
    # Flask integration
    'init_production_logging',
    'get_logging_integration',
    'log_user_action',
    'log_business_event',
]


def get_version():
    """Get the logging system version."""
    return __version__


def get_component_info():
    """Get information about logging system components."""
    return {
        'version': __version__,
        'components': {
            'log_config': 'Configuration management with environment variable support',
            'log_manager': 'Core logging with async processing and rotation',
            'performance_logger': 'Performance monitoring and alerting',
            'structured_logger': 'Structured logging with context tracking',
            'flask_integration': 'Seamless Flask application integration'
        },
        'features': [
            'Structured JSON logging',
            'Performance monitoring',
            'Security event tracking',
            'Audit logging',
            'Automatic log rotation',
            'Async log processing',
            'Request/response logging',
            'Health monitoring',
            'Graceful error handling'
        ]
    }


def create_default_config(**overrides):
    """Create a default logging configuration with optional overrides."""
    config = LogConfig()
    
    # Apply any overrides
    for key, value in overrides.items():
        if hasattr(config, key):
            setattr(config, key, value)
    
    return config


def quick_start(app, **config_overrides):
    """
    Quick start function for easy logging system setup.
    
    Args:
        app: Flask application instance
        **config_overrides: Configuration overrides
    
    Returns:
        FlaskLoggingIntegration instance
    
    Example:
        from logging_system import quick_start
        
        # Basic setup
        logging_system = quick_start(app)
        
        # With custom configuration
        logging_system = quick_start(
            app,
            log_level='DEBUG',
            enable_performance_logging=True,
            max_log_file_size_mb=50
        )
    """
    config = create_default_config(**config_overrides)
    return init_production_logging(app, config)
