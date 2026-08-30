"""
Flask integration module for production-ready session storage.

Provides seamless integration of Redis session storage with Flask applications,
maintaining backward compatibility while adding production features.
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import timedelta
from flask import Flask
from flask_session import Session

from .session_config import SessionConfig
from .redis_session_manager import RedisSessionManager
from .session_health import SessionHealthChecker


class ProductionSessionInterface:
    """
    Production-ready session interface for Flask applications.
    
    Provides Redis-based sessions with filesystem fallback, encryption,
    and comprehensive health monitoring.
    """
    
    def __init__(self, app: Optional[Flask] = None, config: Optional[SessionConfig] = None):
        """Initialize the production session interface."""
        self.logger = logging.getLogger(__name__)
        self.app = app
        self.config = config or SessionConfig()
        self.session_manager = None
        self.health_checker = None
        self._session_interface = None
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app: Flask):
        """Initialize the session interface with Flask app."""
        self.app = app
        
        try:
            # Validate configuration
            if not self.config.validate_config():
                raise ValueError("Invalid session configuration")
            
            # Update Flask configuration
            flask_config = self.config.get_flask_session_config()
            app.config.update(flask_config)
            
            # Initialize session manager
            self.session_manager = RedisSessionManager(self.config)
            
            # Set up Flask-Session with Redis if available
            self._setup_flask_session(app)
            
            # Initialize health checker
            self.health_checker = SessionHealthChecker(
                self.session_manager,
                check_interval=self.config.health_check_interval
            )
            self.health_checker.start_monitoring()
            
            # Register cleanup handlers
            self._register_cleanup_handlers(app)
            
            # Store reference in app
            app.extensions = getattr(app, 'extensions', {})
            app.extensions['production_sessions'] = self
            
            self.logger.info("Production session interface initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize production sessions: {e}")
            raise
    
    def _setup_flask_session(self, app: Flask):
        """Set up Flask-Session with appropriate backend."""
        try:
            # Try to use Redis if available
            if self.session_manager._redis_healthy and self.session_manager._redis_client:
                app.config['SESSION_TYPE'] = 'redis'
                app.config['SESSION_REDIS'] = self.session_manager._redis_client
                app.config['SESSION_KEY_PREFIX'] = self.config.get_flask_session_config()['SESSION_KEY_PREFIX']
                
                self.logger.info("Flask sessions configured with Redis backend")
            else:
                # Fallback to filesystem
                app.config['SESSION_TYPE'] = 'filesystem'
                app.config['SESSION_FILE_DIR'] = self.config.filesystem_session_dir
                
                self.logger.info("Flask sessions configured with filesystem backend")
            
            # Initialize Flask-Session
            self._session_interface = Session(app)
            
        except Exception as e:
            self.logger.error(f"Failed to setup Flask session: {e}")
            # Fallback to default Flask sessions
            app.config['SESSION_TYPE'] = 'filesystem'
            self._session_interface = Session(app)
    
    def _register_cleanup_handlers(self, app: Flask):
        """Register cleanup handlers for graceful shutdown."""
        
        @app.teardown_appcontext
        def cleanup_session_context(exception):
            """Clean up session context."""
            try:
                # Perform any per-request cleanup
                pass
            except Exception as e:
                self.logger.warning(f"Session context cleanup error: {e}")
        
        # Register shutdown handler
        def shutdown_handler():
            """Handle application shutdown."""
            try:
                if self.health_checker:
                    self.health_checker.stop_monitoring()
                    
                if self.session_manager:
                    self.session_manager.shutdown()
                    
                self.logger.info("Production sessions shutdown completed")
                
            except Exception as e:
                self.logger.error(f"Session shutdown error: {e}")
        
        # Store shutdown handler for manual cleanup if needed
        app.production_session_shutdown = shutdown_handler
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get current health status of session storage."""
        if not self.health_checker:
            return {
                'status': 'unknown',
                'message': 'Health checker not initialized'
            }
        
        return self.health_checker.get_health_report()
    
    def get_session_metrics(self) -> Dict[str, Any]:
        """Get session metrics."""
        if not self.session_manager:
            return {}
        
        metrics = self.session_manager.get_session_metrics()
        
        return {
            'total_sessions': metrics.total_sessions,
            'active_sessions': metrics.active_sessions,
            'redis_sessions': metrics.redis_sessions,
            'filesystem_sessions': metrics.filesystem_sessions,
            'failed_operations': metrics.failed_operations,
            'redis_available': metrics.redis_available,
            'last_health_check': metrics.last_health_check.isoformat() if metrics.last_health_check else None
        }
    
    def cleanup_expired_sessions(self) -> int:
        """Manually trigger cleanup of expired sessions."""
        if not self.session_manager:
            return 0
        
        return self.session_manager.cleanup_expired_sessions()
    
    def force_redis_reconnect(self) -> bool:
        """Force Redis reconnection (for recovery scenarios)."""
        if not self.session_manager:
            return False
        
        try:
            self.session_manager._initialize_redis()
            return self.session_manager._redis_healthy
        except Exception as e:
            self.logger.error(f"Failed to reconnect to Redis: {e}")
            return False


def create_production_session_config() -> SessionConfig:
    """Create production session configuration from environment variables."""
    return SessionConfig(
        # Redis configuration from environment
        redis_host=os.getenv('REDIS_HOST', 'localhost'),
        redis_port=int(os.getenv('REDIS_PORT', '6379')),
        redis_password=os.getenv('REDIS_PASSWORD'),
        redis_db=int(os.getenv('REDIS_DB', '0')),
        redis_url=os.getenv('REDIS_URL'),
        
        # Session configuration
        session_timeout=timedelta(minutes=int(os.getenv('SESSION_TIMEOUT_MINUTES', '30'))),
        
        # Security configuration
        session_encryption_key=os.getenv('SESSION_ENCRYPTION_KEY'),
        encrypt_sessions=os.getenv('ENCRYPT_SESSIONS', 'true').lower() == 'true',
        
        # Fallback configuration
        enable_filesystem_fallback=os.getenv('ENABLE_FILESYSTEM_FALLBACK', 'true').lower() == 'true',
        filesystem_session_dir=os.getenv('FILESYSTEM_SESSION_DIR', 'flask_session'),
        
        # Performance configuration
        redis_connection_pool_size=int(os.getenv('REDIS_CONNECTION_POOL_SIZE', '50')),
        health_check_interval=int(os.getenv('HEALTH_CHECK_INTERVAL', '60'))
    )


def init_production_sessions(app: Flask, config: Optional[SessionConfig] = None) -> ProductionSessionInterface:
    """
    Initialize production session storage for a Flask application.
    
    This function provides a simple way to upgrade existing Flask applications
    to use production-ready session storage with minimal code changes.
    
    Args:
        app: Flask application instance
        config: Optional session configuration (defaults to environment-based config)
    
    Returns:
        ProductionSessionInterface instance
    
    Example:
        ```python
        from flask import Flask
        from session_storage.flask_integration import init_production_sessions
        
        app = Flask(__name__)
        session_interface = init_production_sessions(app)
        ```
    """
    if config is None:
        config = create_production_session_config()
    
    session_interface = ProductionSessionInterface(app, config)
    return session_interface


# Backward compatibility helper
def get_session_interface(app: Flask) -> Optional[ProductionSessionInterface]:
    """Get the production session interface from Flask app."""
    return app.extensions.get('production_sessions') if hasattr(app, 'extensions') else None
