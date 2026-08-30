"""
Unit tests for the production logging system.

Tests all components of the logging system including configuration,
log management, performance logging, structured logging, and Flask integration.
"""

import sys
import os

# Add the project root to the path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

import unittest
import tempfile
import shutil
import json
import time
import threading
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta

# Import Flask for testing
from flask import Flask, session, g, request

# Import logging system components
from logging_system import (
    LogConfig, LogManager, PerformanceLogger, StructuredLogger,
    FlaskLoggingIntegration, init_production_logging,
    LogContext, measure_performance, log_context
)


class TestLogConfig(unittest.TestCase):
    """Test LogConfig class."""
    
    def test_default_config(self):
        """Test default configuration values."""
        config = LogConfig()
        
        self.assertEqual(config.log_level, 'INFO')
        self.assertTrue(config.enable_async_logging)
        self.assertTrue(config.enable_performance_logging)
        self.assertTrue(config.enable_structured_logging)
        self.assertEqual(config.max_log_file_size_mb, 100)
        self.assertEqual(config.backup_count, 5)
        self.assertEqual(config.log_retention_days, 30)
    
    def test_config_validation(self):
        """Test configuration validation."""
        config = LogConfig()
        
        # Test valid config
        self.assertTrue(config.validate())
        
        # Test invalid log level
        config.log_level = 'INVALID'
        with self.assertRaises(ValueError):
            config.validate()
        
        # Test invalid file size
        config.log_level = 'INFO'
        config.max_log_file_size_mb = 0
        with self.assertRaises(ValueError):
            config.validate()
    
    def test_environment_variables(self):
        """Test environment variable configuration."""
        with patch.dict(os.environ, {
            'LOG_LEVEL': 'DEBUG',
            'ENABLE_ASYNC_LOGGING': 'false',
            'MAX_LOG_FILE_SIZE_MB': '200'
        }):
            config = LogConfig()
            
            self.assertEqual(config.log_level, 'DEBUG')
            self.assertFalse(config.enable_async_logging)
            self.assertEqual(config.max_log_file_size_mb, 200)


class TestLogManager(unittest.TestCase):
    """Test LogManager class."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.config = LogConfig()
        self.config.log_directory = self.temp_dir
        self.config.enable_async_logging = False  # Simplify testing
        # Ensure the new log directory is created
        self.config._ensure_log_directory()
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_log_manager_initialization(self):
        """Test log manager initialization."""
        manager = LogManager(self.config)
        self.assertIsNotNone(manager)
        self.assertEqual(manager.config, self.config)
    
    def test_setup_logging(self):
        """Test logging setup."""
        manager = LogManager(self.config)
        manager.setup_logging()
        
        # Check that log directory was created
        self.assertTrue(os.path.exists(self.temp_dir))
        
        # Check that loggers were configured
        import logging
        logger = logging.getLogger('ninjnerd')
        self.assertGreater(len(logger.handlers), 0)
    
    def test_log_rotation(self):
        """Test log file rotation."""
        self.config.max_log_file_size_mb = 0.001  # Very small for testing
        manager = LogManager(self.config)
        manager.setup_logging()
        
        import logging
        logger = logging.getLogger('ninjnerd.test')
        
        # Generate lots of log messages to trigger rotation
        for i in range(1000):
            logger.info(f"Test message {i}" * 100)
        
        # Check that rotation occurred
        log_files = [f for f in os.listdir(self.temp_dir) if f.startswith('ninjnerd')]
        self.assertGreater(len(log_files), 1)


class TestPerformanceLogger(unittest.TestCase):
    """Test PerformanceLogger class."""
    
    def setUp(self):
        """Set up test environment."""
        self.config = LogConfig()
        self.config.enable_performance_logging = True
        self.config.performance_threshold_ms = 100
        self.perf_logger = PerformanceLogger(self.config)
    
    def tearDown(self):
        """Clean up test environment."""
        if self.perf_logger:
            self.perf_logger.shutdown()
    
    def test_performance_logger_initialization(self):
        """Test performance logger initialization."""
        self.assertIsNotNone(self.perf_logger)
        self.assertEqual(self.perf_logger.config, self.config)
        self.assertEqual(self.perf_logger.slow_threshold_ms, 100)
    
    def test_log_operation(self):
        """Test logging a performance operation."""
        self.perf_logger.log_operation('test_operation', 150.5, test_param='value')
        
        # Check that metric was recorded
        stats = self.perf_logger.get_operation_stats('test_operation')
        self.assertIsNotNone(stats)
        self.assertEqual(stats.count, 1)
        self.assertEqual(stats.avg_time_ms, 150.5)
    
    def test_measure_operation_context(self):
        """Test performance measurement context manager."""
        with self.perf_logger.measure_operation('context_test'):
            time.sleep(0.01)  # 10ms
        
        stats = self.perf_logger.get_operation_stats('context_test')
        self.assertIsNotNone(stats)
        self.assertEqual(stats.count, 1)
        self.assertGreater(stats.avg_time_ms, 5)  # Should be > 5ms
    
    def test_performance_decorator(self):
        """Test performance measurement decorator."""
        @self.perf_logger.performance_decorator('decorated_test')
        def test_function():
            time.sleep(0.01)
            return 'result'
        
        result = test_function()
        self.assertEqual(result, 'result')
        
        stats = self.perf_logger.get_operation_stats('decorated_test')
        self.assertIsNotNone(stats)
        self.assertEqual(stats.count, 1)
    
    def test_performance_statistics(self):
        """Test performance statistics calculation."""
        # Log multiple operations
        durations = [50, 75, 100, 125, 150, 200, 300]
        for duration in durations:
            self.perf_logger.log_operation('stats_test', duration)
        
        stats = self.perf_logger.get_operation_stats('stats_test')
        self.assertEqual(stats.count, 7)
        self.assertEqual(stats.min_time_ms, 50)
        self.assertEqual(stats.max_time_ms, 300)
        self.assertAlmostEqual(stats.avg_time_ms, sum(durations) / len(durations), places=1)
    
    def test_slow_operations_detection(self):
        """Test detection of slow operations."""
        # Log fast operation
        self.perf_logger.log_operation('fast_op', 50)
        
        # Log slow operation
        self.perf_logger.log_operation('slow_op', 200)
        
        slow_ops = self.perf_logger.get_slow_operations()
        slow_op_names = [op.operation for op in slow_ops]
        
        self.assertIn('slow_op', slow_op_names)
        self.assertNotIn('fast_op', slow_op_names)


class TestStructuredLogger(unittest.TestCase):
    """Test StructuredLogger class."""
    
    def setUp(self):
        """Set up test environment."""
        self.config = LogConfig()
        self.config.enable_structured_logging = True
        self.structured_logger = StructuredLogger(self.config)
    
    def test_structured_logger_initialization(self):
        """Test structured logger initialization."""
        self.assertIsNotNone(self.structured_logger)
        self.assertEqual(self.structured_logger.config, self.config)
    
    def test_context_management(self):
        """Test logging context management."""
        # Set context
        self.structured_logger.set_context(
            request_id='test-123',
            user_id='user-456',
            operation='test_operation'
        )
        
        context = self.structured_logger.get_context()
        self.assertEqual(context.request_id, 'test-123')
        self.assertEqual(context.user_id, 'user-456')
        self.assertEqual(context.operation, 'test_operation')
        
        # Clear context
        self.structured_logger.clear_context()
        context = self.structured_logger.get_context()
        self.assertIsNone(context.request_id)
    
    def test_context_manager(self):
        """Test context manager for temporary context."""
        original_context = self.structured_logger.get_context()
        
        with self.structured_logger.context(request_id='temp-123', user_id='temp-user'):
            context = self.structured_logger.get_context()
            self.assertEqual(context.request_id, 'temp-123')
            self.assertEqual(context.user_id, 'temp-user')
        
        # Context should be restored
        final_context = self.structured_logger.get_context()
        self.assertEqual(final_context.request_id, original_context.request_id)
    
    def test_security_event_logging(self):
        """Test security event logging."""
        with patch.object(self.structured_logger.security_logger, 'warning') as mock_warning:
            self.structured_logger.log_security_event(
                'failed_login',
                'Failed login attempt detected',
                'medium',
                user='test_user'
            )
            
            mock_warning.assert_called_once()
            args, kwargs = mock_warning.call_args
            self.assertIn('Failed login attempt detected', args[0])
            self.assertEqual(kwargs['extra']['event_type'], 'failed_login')
    
    def test_audit_event_logging(self):
        """Test audit event logging."""
        with patch.object(self.structured_logger.audit_logger, 'info') as mock_info:
            self.structured_logger.log_audit_event(
                'user_login',
                'user_session',
                'test_user',
                'success'
            )
            
            mock_info.assert_called_once()
            args, kwargs = mock_info.call_args
            self.assertIn('user_login', args[0])
            self.assertEqual(kwargs['extra']['action'], 'user_login')
    
    def test_error_logging(self):
        """Test error logging with context."""
        test_error = ValueError("Test error message")
        
        with patch.object(self.structured_logger.error_logger, 'error') as mock_error:
            self.structured_logger.log_error(
                test_error,
                context='test_context',
                additional_info='extra_data'
            )
            
            mock_error.assert_called_once()
            args, kwargs = mock_error.call_args
            self.assertIn('Test error message', args[0])
            self.assertEqual(kwargs['extra']['error_type'], 'ValueError')


class TestFlaskIntegration(unittest.TestCase):
    """Test Flask integration for logging system."""
    
    def setUp(self):
        """Set up test Flask application."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.app.secret_key = 'test-secret-key'
        
        # Create test route
        @self.app.route('/test')
        def test_route():
            return 'Test response'
        
        @self.app.route('/error')
        def error_route():
            raise ValueError("Test error")
        
        self.config = LogConfig()
        self.config.enable_async_logging = False  # Simplify testing
        
    def test_flask_integration_initialization(self):
        """Test Flask integration initialization."""
        integration = init_production_logging(self.app, self.config)
        
        self.assertIsNotNone(integration)
        self.assertEqual(integration.app, self.app)
        self.assertEqual(integration.config, self.config)
        
        # Check that extension was registered
        self.assertIn('logging_system', self.app.extensions)
    
    def test_request_logging(self):
        """Test request logging functionality."""
        integration = init_production_logging(self.app, self.config)
        
        with self.app.test_client() as client:
            with patch.object(integration.structured_logger, 'log_access') as mock_log:
                response = client.get('/test')
                self.assertEqual(response.status_code, 200)
                
                # Verify that access was logged
                mock_log.assert_called()
                # Check call arguments - should be called with keyword args
                call_args = mock_log.call_args
                self.assertIsNotNone(call_args)
                # Check some of the expected keyword arguments
                kwargs = call_args.kwargs if hasattr(call_args, 'kwargs') else call_args[1]
                self.assertIn('method', kwargs)
                self.assertIn('path', kwargs)
                self.assertIn('status_code', kwargs)
    
    def test_error_handling(self):
        """Test error handling and logging."""
        integration = init_production_logging(self.app, self.config)
        
        with self.app.test_client() as client:
            with patch.object(integration.structured_logger, 'log_error') as mock_log:
                response = client.get('/error')
                
                # Should return 500 error
                self.assertEqual(response.status_code, 500)
                
                # Verify that error was logged
                mock_log.assert_called()
                args, kwargs = mock_log.call_args
                self.assertIsInstance(args[0], ValueError)
    
    def test_health_endpoints(self):
        """Test health check endpoints."""
        integration = init_production_logging(self.app, self.config)
        
        with self.app.test_client() as client:
            # Test logging health endpoint
            response = client.get('/health/logging')
            self.assertEqual(response.status_code, 200)
            
            data = json.loads(response.data)
            self.assertEqual(data['status'], 'healthy')
            self.assertIn('components', data)
            
            # Test performance health endpoint
            response = client.get('/health/logging/performance')
            self.assertEqual(response.status_code, 200)
            
            # Test logs health endpoint
            response = client.get('/health/logging/logs')
            self.assertEqual(response.status_code, 200)


class TestLoggingDecorators(unittest.TestCase):
    """Test logging decorators and context managers."""
    
    def setUp(self):
        """Set up test environment."""
        self.config = LogConfig()
        self.perf_logger = PerformanceLogger(self.config)
        self.structured_logger = StructuredLogger(self.config)
        
        # Set global loggers
        from logging_system.performance_logger import set_performance_logger
        from logging_system.structured_logger import set_structured_logger
        set_performance_logger(self.perf_logger)
        set_structured_logger(self.structured_logger)
    
    def tearDown(self):
        """Clean up test environment."""
        if self.perf_logger:
            self.perf_logger.shutdown()
    
    def test_measure_performance_decorator(self):
        """Test global measure_performance decorator."""
        @measure_performance('global_test')
        def test_function():
            time.sleep(0.01)
            return 'result'
        
        result = test_function()
        self.assertEqual(result, 'result')
        
        stats = self.perf_logger.get_operation_stats('global_test')
        self.assertIsNotNone(stats)
        self.assertEqual(stats.count, 1)
    
    def test_log_context_decorator(self):
        """Test log_context decorator."""
        @log_context(operation='test_op', component='test_comp')
        def test_function():
            context = self.structured_logger.get_context()
            return context
        
        context = test_function()
        self.assertEqual(context.operation, 'test_op')
        self.assertEqual(context.component, 'test_comp')


class TestLoggingSystemIntegration(unittest.TestCase):
    """Test complete logging system integration."""
    
    def setUp(self):
        """Set up complete test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.app.secret_key = 'test-secret-key'
        
        # Configure logging to use temp directory
        self.config = LogConfig()
        self.config.log_directory = self.temp_dir
        self.config.enable_async_logging = False
        # Ensure the new log directory is created
        self.config._ensure_log_directory()
        
        @self.app.route('/test')
        def test_route():
            return 'Test response'
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_complete_integration(self):
        """Test complete logging system integration."""
        # Initialize production logging
        integration = init_production_logging(self.app, self.config)
        
        # Verify all components are initialized
        self.assertIsNotNone(integration.log_manager)
        self.assertIsNotNone(integration.performance_logger)
        self.assertIsNotNone(integration.structured_logger)
        
        # Test request handling
        with self.app.test_client() as client:
            response = client.get('/test')
            self.assertEqual(response.status_code, 200)
        
        # Verify log files were created
        log_files = os.listdir(self.temp_dir)
        self.assertGreater(len(log_files), 0)
        
        # Verify performance metrics
        summary = integration.performance_logger.get_performance_summary()
        self.assertIsInstance(summary, dict)
        
        # Cleanup
        integration.shutdown()


if __name__ == '__main__':
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add all test classes
    test_classes = [
        TestLogConfig,
        TestLogManager,
        TestPerformanceLogger,
        TestStructuredLogger,
        TestFlaskIntegration,
        TestLoggingDecorators,
        TestLoggingSystemIntegration
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"LOGGING SYSTEM TEST SUMMARY")
    print(f"{'='*60}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print(f"\nFAILURES:")
        for test, traceback in result.failures:
            print(f"- {test}: {traceback.split('AssertionError:')[-1].strip()}")
    
    if result.errors:
        print(f"\nERRORS:")
        for test, traceback in result.errors:
            print(f"- {test}: {traceback.split('Exception:')[-1].strip()}")
    
    print(f"{'='*60}")
    
    # Cleanup any remaining logging resources
    import logging
    logging.shutdown()
    
    # Force garbage collection to help with cleanup
    import gc
    gc.collect()
