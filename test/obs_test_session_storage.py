"""
Unit tests for production-ready session storage.

These tests verify Redis session storage, encryption, fallback mechanisms,
and session cleanup procedures using mock connections to avoid modifying
actual data or requiring Redis server.
"""

import os
import sys
import unittest
import tempfile
import shutil
import json
import time
from unittest.mock import Mock, MagicMock, patch, call
from datetime import datetime, timedelta

# Add the project directory to the path
sys.path.insert(0, '/Users/praveenrai/Personal/Krishang/NinjaNerd')

from session_storage import (
    SessionConfig,
    RedisSessionManager,
    SessionHealthChecker,
    ProductionSessionInterface,
    init_production_sessions,
    create_production_session_config
)


class TestSessionConfig(unittest.TestCase):
    """Test session configuration functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_default_configuration(self):
        """Test default session configuration."""
        config = SessionConfig()
        
        self.assertEqual(config.redis_host, 'localhost')
        self.assertEqual(config.redis_port, 6379)
        self.assertEqual(config.redis_db, 0)
        self.assertEqual(config.session_timeout, timedelta(minutes=30))
        self.assertTrue(config.encrypt_sessions)
        self.assertTrue(config.enable_filesystem_fallback)
        self.assertEqual(config.filesystem_session_dir, 'flask_session')
    
    def test_environment_variable_configuration(self):
        """Test configuration from environment variables."""
        env_vars = {
            'REDIS_HOST': 'test-redis',
            'REDIS_PORT': '6380',
            'REDIS_DB': '1',
            'REDIS_PASSWORD': 'test-password',
            'SESSION_TIMEOUT_MINUTES': '60'
        }
        
        with patch.dict(os.environ, env_vars):
            config = SessionConfig()
            
            self.assertEqual(config.redis_host, 'test-redis')
            self.assertEqual(config.redis_port, 6380)
            self.assertEqual(config.redis_db, 1)
            self.assertEqual(config.redis_password, 'test-password')
    
    def test_redis_connection_params(self):
        """Test Redis connection parameter generation."""
        config = SessionConfig(
            redis_host='test-host',
            redis_port=6380,
            redis_password='test-pass',
            redis_db=2
        )
        
        params = config.get_redis_connection_params()
        
        self.assertEqual(params['host'], 'test-host')
        self.assertEqual(params['port'], 6380)
        self.assertEqual(params['password'], 'test-pass')
        self.assertEqual(params['db'], 2)
        self.assertIn('socket_timeout', params)
        self.assertIn('socket_connect_timeout', params)
    
    def test_redis_url_configuration(self):
        """Test Redis URL-based configuration."""
        config = SessionConfig(redis_url='redis://localhost:6379/0')
        
        params = config.get_redis_connection_params()
        
        self.assertEqual(params['url'], 'redis://localhost:6379/0')
        self.assertIn('socket_timeout', params)
    
    def test_flask_session_config(self):
        """Test Flask session configuration generation."""
        config = SessionConfig()
        
        flask_config = config.get_flask_session_config()
        
        self.assertFalse(flask_config['SESSION_PERMANENT'])
        self.assertEqual(flask_config['PERMANENT_SESSION_LIFETIME'], config.permanent_session_lifetime)
        self.assertTrue(flask_config['SESSION_USE_SIGNER'])
        self.assertEqual(flask_config['SESSION_KEY_PREFIX'], 'ninjnerd:session:')
        self.assertEqual(flask_config['SESSION_TYPE'], 'redis')
    
    def test_configuration_validation(self):
        """Test configuration validation."""
        # Valid configuration
        config = SessionConfig()
        self.assertTrue(config.validate_config())
        
        # Invalid port
        config.redis_port = 99999
        self.assertFalse(config.validate_config())
        
        # Invalid session timeout
        config.redis_port = 6379
        config.session_timeout = timedelta(seconds=-1)
        self.assertFalse(config.validate_config())
    
    def test_encryption_key_generation(self):
        """Test automatic encryption key generation."""
        config = SessionConfig(session_encryption_key=None)
        
        self.assertIsNotNone(config.session_encryption_key)
        self.assertTrue(len(config.session_encryption_key) > 0)
    
    def test_config_to_dict(self):
        """Test configuration serialization to dictionary."""
        config = SessionConfig()
        config_dict = config.to_dict()
        
        self.assertIsInstance(config_dict, dict)
        self.assertIn('redis_host', config_dict)
        self.assertIn('redis_port', config_dict)
        self.assertIn('session_timeout_minutes', config_dict)
        self.assertIn('encrypt_sessions', config_dict)
        self.assertNotIn('session_encryption_key', config_dict)  # Sensitive data excluded


class TestRedisSessionManager(unittest.TestCase):
    """Test Redis session manager with mock Redis connections."""
    
    def setUp(self):
        """Set up test environment with mock Redis."""
        self.temp_dir = tempfile.mkdtemp()
        self.config = SessionConfig(
            filesystem_session_dir=self.temp_dir,
            session_timeout=timedelta(minutes=5),
            encrypt_sessions=False  # Disable encryption for easier testing
        )
        
        # Mock Redis
        self.mock_redis = MagicMock()
        self.mock_connection_pool = MagicMock()
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @patch('session_storage.redis_session_manager.redis')
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', True)
    def test_session_manager_initialization(self, mock_redis_module):
        """Test session manager initialization with mock Redis."""
        mock_redis_module.Redis.return_value = self.mock_redis
        mock_redis_module.ConnectionPool.return_value = self.mock_connection_pool
        
        # Mock successful ping
        self.mock_redis.ping.return_value = True
        
        session_manager = RedisSessionManager(self.config)
        
        self.assertIsNotNone(session_manager)
        self.assertTrue(session_manager._redis_healthy)
        self.assertTrue(session_manager.metrics.redis_available)
    
    @patch('session_storage.redis_session_manager.redis')
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', True)
    def test_session_creation_redis(self, mock_redis_module):
        """Test session creation in Redis."""
        mock_redis_module.Redis.return_value = self.mock_redis
        mock_redis_module.ConnectionPool.return_value = self.mock_connection_pool
        
        self.mock_redis.ping.return_value = True
        self.mock_redis.setex.return_value = True
        
        session_manager = RedisSessionManager(self.config)
        
        session_data = {
            'username': 'test_user',
            'login_time': datetime.now().isoformat()
        }
        
        session_id = session_manager.create_session(session_data)
        
        self.assertIsNotNone(session_id)
        self.assertTrue(len(session_id) > 0)
        self.assertEqual(session_manager.metrics.redis_sessions, 1)
        self.assertEqual(session_manager.metrics.total_sessions, 1)
        
        # Verify Redis was called
        self.mock_redis.setex.assert_called_once()
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_session_creation_filesystem_fallback(self):
        """Test session creation with filesystem fallback."""
        session_manager = RedisSessionManager(self.config)
        
        session_data = {
            'username': 'test_user',
            'login_time': datetime.now().isoformat()
        }
        
        session_id = session_manager.create_session(session_data)
        
        self.assertIsNotNone(session_id)
        self.assertEqual(session_manager.metrics.filesystem_sessions, 1)
        self.assertEqual(session_manager.metrics.total_sessions, 1)
        
        # Verify file was created
        session_file = os.path.join(self.temp_dir, f"session_{session_id}.json")
        self.assertTrue(os.path.exists(session_file))
    
    @patch('session_storage.redis_session_manager.redis')
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', True)
    def test_session_retrieval_redis(self, mock_redis_module):
        """Test session retrieval from Redis."""
        mock_redis_module.Redis.return_value = self.mock_redis
        mock_redis_module.ConnectionPool.return_value = self.mock_connection_pool
        
        self.mock_redis.ping.return_value = True
        
        session_manager = RedisSessionManager(self.config)
        
        # Mock Redis get response
        test_data = {
            'username': 'test_user',
            '_session_id': 'test_session_id',
            '_created_at': datetime.now().isoformat(),
            '_last_accessed': datetime.now().isoformat()
        }
        
        self.mock_redis.get.return_value = json.dumps(test_data).encode('utf-8')
        
        retrieved_data = session_manager.get_session('test_session_id')
        
        self.assertIsNotNone(retrieved_data)
        self.assertEqual(retrieved_data['username'], 'test_user')
        self.mock_redis.get.assert_called_once()
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_session_retrieval_filesystem(self):
        """Test session retrieval from filesystem."""
        session_manager = RedisSessionManager(self.config)
        
        # Create test session file
        session_id = 'test_session_id'
        session_data = {
            'username': 'test_user',
            '_session_id': session_id,
            '_created_at': datetime.now().isoformat(),
            '_last_accessed': datetime.now().isoformat()
        }
        
        session_file = os.path.join(self.temp_dir, f"session_{session_id}.json")
        with open(session_file, 'w') as f:
            json.dump(session_data, f)
        
        retrieved_data = session_manager.get_session(session_id)
        
        self.assertIsNotNone(retrieved_data)
        self.assertEqual(retrieved_data['username'], 'test_user')
    
    @patch('session_storage.redis_session_manager.redis')
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', True)
    def test_session_deletion_redis(self, mock_redis_module):
        """Test session deletion from Redis."""
        mock_redis_module.Redis.return_value = self.mock_redis
        mock_redis_module.ConnectionPool.return_value = self.mock_connection_pool
        
        self.mock_redis.ping.return_value = True
        self.mock_redis.delete.return_value = 1  # Successful deletion
        
        session_manager = RedisSessionManager(self.config)
        
        result = session_manager.delete_session('test_session_id')
        
        self.assertTrue(result)
        self.mock_redis.delete.assert_called_once()
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_session_deletion_filesystem(self):
        """Test session deletion from filesystem."""
        session_manager = RedisSessionManager(self.config)
        
        # Create test session file
        session_id = 'test_session_id'
        session_file = os.path.join(self.temp_dir, f"session_{session_id}.json")
        with open(session_file, 'w') as f:
            json.dump({'test': 'data'}, f)
        
        self.assertTrue(os.path.exists(session_file))
        
        result = session_manager.delete_session(session_id)
        
        self.assertTrue(result)
        self.assertFalse(os.path.exists(session_file))
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_expired_session_cleanup(self):
        """Test cleanup of expired sessions."""
        session_manager = RedisSessionManager(self.config)
        
        # Create expired session file
        session_id = 'expired_session'
        session_file = os.path.join(self.temp_dir, f"session_{session_id}.json")
        with open(session_file, 'w') as f:
            json.dump({'test': 'data'}, f)
        
        # Set file modification time to past
        past_time = time.time() - (10 * 60)  # 10 minutes ago
        os.utime(session_file, (past_time, past_time))
        
        # Create current session file
        current_session_id = 'current_session'
        current_session_file = os.path.join(self.temp_dir, f"session_{current_session_id}.json")
        with open(current_session_file, 'w') as f:
            json.dump({'test': 'data'}, f)
        
        cleaned_count = session_manager.cleanup_expired_sessions()
        
        self.assertEqual(cleaned_count, 1)
        self.assertFalse(os.path.exists(session_file))  # Expired file removed
        self.assertTrue(os.path.exists(current_session_file))  # Current file preserved
    
    def test_session_metrics(self):
        """Test session metrics collection."""
        session_manager = RedisSessionManager(self.config)
        
        metrics = session_manager.get_session_metrics()
        
        self.assertIsNotNone(metrics)
        self.assertEqual(metrics.total_sessions, 0)
        self.assertEqual(metrics.active_sessions, 0)
        self.assertEqual(metrics.failed_operations, 0)
    
    def test_health_status(self):
        """Test health status reporting."""
        session_manager = RedisSessionManager(self.config)
        
        health_status = session_manager.get_health_status()
        
        self.assertIsInstance(health_status, dict)
        self.assertIn('redis_available', health_status)
        self.assertIn('filesystem_fallback_enabled', health_status)
        self.assertIn('total_sessions', health_status)
        self.assertIn('encryption_enabled', health_status)
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_no_redis_fallback_only(self):
        """Test operation with Redis unavailable, using only filesystem."""
        session_manager = RedisSessionManager(self.config)
        
        self.assertFalse(session_manager._redis_healthy)
        self.assertFalse(session_manager.metrics.redis_available)
        
        # Should still be able to create sessions
        session_data = {'username': 'test_user'}
        session_id = session_manager.create_session(session_data)
        
        self.assertIsNotNone(session_id)
        self.assertEqual(session_manager.metrics.filesystem_sessions, 1)


class TestSessionEncryption(unittest.TestCase):
    """Test session encryption functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        
        # Create config with encryption enabled
        self.config = SessionConfig(
            filesystem_session_dir=self.temp_dir,
            encrypt_sessions=True,
            session_encryption_key=None  # Will auto-generate
        )
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_encrypted_session_storage(self):
        """Test that sessions are encrypted when stored."""
        session_manager = RedisSessionManager(self.config)
        
        session_data = {
            'username': 'test_user',
            'sensitive_data': 'secret_information'
        }
        
        session_id = session_manager.create_session(session_data)
        
        # Read raw file content
        session_file = os.path.join(self.temp_dir, f"session_{session_id}.json")
        with open(session_file, 'r') as f:
            raw_content = f.read()
        
        # Raw content should not contain readable session data
        self.assertNotIn('test_user', raw_content)
        self.assertNotIn('secret_information', raw_content)
        
        # But retrieval should work correctly
        retrieved_data = session_manager.get_session(session_id)
        self.assertEqual(retrieved_data['username'], 'test_user')
        self.assertEqual(retrieved_data['sensitive_data'], 'secret_information')
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_encryption_key_consistency(self):
        """Test that the same encryption key can decrypt data."""
        # Save the encryption key
        encryption_key = self.config.session_encryption_key
        
        session_manager = RedisSessionManager(self.config)
        
        session_data = {'username': 'test_user'}
        session_id = session_manager.create_session(session_data)
        
        # Create new session manager with same key
        new_config = SessionConfig(
            filesystem_session_dir=self.temp_dir,
            encrypt_sessions=True,
            session_encryption_key=encryption_key
        )
        
        new_session_manager = RedisSessionManager(new_config)
        
        # Should be able to retrieve data
        retrieved_data = new_session_manager.get_session(session_id)
        self.assertIsNotNone(retrieved_data)
        self.assertEqual(retrieved_data['username'], 'test_user')


class TestSessionHealthChecker(unittest.TestCase):
    """Test session health monitoring functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.config = SessionConfig(filesystem_session_dir=self.temp_dir)
        
        # Create mock session manager
        self.mock_session_manager = MagicMock()
        self.mock_session_manager.config = self.config
        self.mock_session_manager._redis_client = None
        self.mock_session_manager._redis_healthy = False
        
        # Mock metrics
        from session_storage.redis_session_manager import SessionMetrics
        self.mock_metrics = SessionMetrics()
        self.mock_session_manager.get_session_metrics.return_value = self.mock_metrics
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_health_checker_initialization(self):
        """Test health checker initialization."""
        health_checker = SessionHealthChecker(self.mock_session_manager, check_interval=5)
        
        self.assertIsNotNone(health_checker)
        self.assertEqual(health_checker.check_interval, 5)
        self.assertEqual(health_checker._total_checks, 0)
        self.assertEqual(health_checker._failed_checks, 0)
    
    def test_filesystem_health_check(self):
        """Test filesystem health check."""
        health_checker = SessionHealthChecker(self.mock_session_manager)
        
        result = health_checker._check_filesystem_health()
        
        self.assertIsNotNone(result)
        self.assertEqual(result.component, 'filesystem')
        # Should be healthy since temp directory is accessible
        self.assertIn(result.status.value, ['healthy', 'degraded'])
    
    def test_session_manager_health_check(self):
        """Test session manager health check."""
        health_checker = SessionHealthChecker(self.mock_session_manager)
        
        result = health_checker._check_session_manager_health()
        
        self.assertIsNotNone(result)
        self.assertEqual(result.component, 'session_manager')
        self.assertIsInstance(result.details, dict)
        self.assertIn('total_sessions', result.details)
    
    @patch('session_storage.session_health.REDIS_AVAILABLE', False)
    def test_redis_health_check_unavailable(self):
        """Test Redis health check when Redis is unavailable."""
        health_checker = SessionHealthChecker(self.mock_session_manager)
        
        result = health_checker._check_redis_health()
        
        self.assertEqual(result.component, 'redis')
        self.assertEqual(result.status.value, 'unhealthy')
        self.assertIn('not available', result.message)
    
    def test_performance_health_check(self):
        """Test performance metrics health check."""
        health_checker = SessionHealthChecker(self.mock_session_manager)
        
        result = health_checker._check_performance_metrics()
        
        self.assertEqual(result.component, 'performance')
        # Result status depends on system resources, but should not error
        self.assertIn(result.status.value, ['healthy', 'degraded', 'unhealthy', 'unknown'])
    
    def test_comprehensive_health_check(self):
        """Test comprehensive health check."""
        health_checker = SessionHealthChecker(self.mock_session_manager)
        
        health_summary = health_checker.perform_health_check()
        
        self.assertIsNotNone(health_summary)
        self.assertTrue(len(health_summary.components) > 0)
        self.assertEqual(health_summary.total_checks, 1)
        self.assertIsInstance(health_summary.uptime_seconds, float)
    
    def test_health_report_generation(self):
        """Test health report generation."""
        health_checker = SessionHealthChecker(self.mock_session_manager)
        
        # Perform a health check first
        health_checker.perform_health_check()
        
        health_report = health_checker.get_health_report()
        
        self.assertIsInstance(health_report, dict)
        self.assertIn('status', health_report)
        self.assertIn('last_check', health_report)
        self.assertIn('components', health_report)
        self.assertIn('success_rate', health_report)


class TestFlaskIntegration(unittest.TestCase):
    """Test Flask integration functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @patch('session_storage.flask_integration.RedisSessionManager')
    @patch('session_storage.flask_integration.SessionHealthChecker')
    def test_production_session_interface_creation(self, mock_health_checker, mock_session_manager):
        """Test ProductionSessionInterface creation."""
        from flask import Flask
        
        app = Flask(__name__)
        config = SessionConfig(filesystem_session_dir=self.temp_dir)
        
        # Mock successful initialization
        mock_session_manager.return_value._redis_healthy = True
        mock_session_manager.return_value._redis_client = MagicMock()
        
        interface = ProductionSessionInterface(app, config)
        
        self.assertIsNotNone(interface)
        self.assertEqual(interface.app, app)
        self.assertEqual(interface.config, config)
        
        # Verify extensions were registered
        self.assertIn('production_sessions', app.extensions)
    
    def test_create_production_session_config(self):
        """Test production session configuration creation."""
        env_vars = {
            'REDIS_HOST': 'prod-redis',
            'REDIS_PORT': '6380',
            'SESSION_TIMEOUT_MINUTES': '60',
            'ENCRYPT_SESSIONS': 'true'
        }
        
        with patch.dict(os.environ, env_vars):
            config = create_production_session_config()
            
            self.assertEqual(config.redis_host, 'prod-redis')
            self.assertEqual(config.redis_port, 6380)
            self.assertEqual(config.session_timeout, timedelta(minutes=60))
            self.assertTrue(config.encrypt_sessions)
    
    @patch('session_storage.flask_integration.ProductionSessionInterface')
    def test_init_production_sessions(self, mock_interface):
        """Test init_production_sessions helper function."""
        from flask import Flask
        
        app = Flask(__name__)
        
        result = init_production_sessions(app)
        
        self.assertIsNotNone(result)
        mock_interface.assert_called_once()


class TestSessionStorageIntegration(unittest.TestCase):
    """Integration tests for complete session storage functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_complete_session_lifecycle(self):
        """Test complete session lifecycle with filesystem fallback."""
        config = SessionConfig(
            filesystem_session_dir=self.temp_dir,
            session_timeout=timedelta(minutes=1),
            encrypt_sessions=False
        )
        
        session_manager = RedisSessionManager(config)
        
        # Create session
        session_data = {
            'username': 'integration_test_user',
            'role': 'admin',
            'login_time': datetime.now().isoformat()
        }
        
        session_id = session_manager.create_session(session_data)
        self.assertIsNotNone(session_id)
        
        # Retrieve session
        retrieved_data = session_manager.get_session(session_id)
        self.assertIsNotNone(retrieved_data)
        self.assertEqual(retrieved_data['username'], 'integration_test_user')
        self.assertEqual(retrieved_data['role'], 'admin')
        
        # Check metrics
        metrics = session_manager.get_session_metrics()
        self.assertEqual(metrics.total_sessions, 1)
        self.assertEqual(metrics.filesystem_sessions, 1)
        
        # Delete session
        result = session_manager.delete_session(session_id)
        self.assertTrue(result)
        
        # Verify deletion
        retrieved_data = session_manager.get_session(session_id)
        self.assertIsNone(retrieved_data)
        
        # Final metrics check
        metrics = session_manager.get_session_metrics()
        self.assertEqual(metrics.active_sessions, 0)
    
    @patch('session_storage.redis_session_manager.REDIS_AVAILABLE', False)
    def test_concurrent_session_operations(self):
        """Test handling of multiple concurrent sessions."""
        config = SessionConfig(
            filesystem_session_dir=self.temp_dir,
            encrypt_sessions=False
        )
        
        session_manager = RedisSessionManager(config)
        
        # Create multiple sessions
        session_ids = []
        for i in range(5):
            session_data = {
                'username': f'user_{i}',
                'session_number': i
            }
            session_id = session_manager.create_session(session_data)
            session_ids.append(session_id)
        
        # Verify all sessions exist
        for i, session_id in enumerate(session_ids):
            retrieved_data = session_manager.get_session(session_id)
            self.assertIsNotNone(retrieved_data)
            self.assertEqual(retrieved_data['username'], f'user_{i}')
        
        # Check metrics
        metrics = session_manager.get_session_metrics()
        self.assertEqual(metrics.total_sessions, 5)
        self.assertEqual(metrics.active_sessions, 5)
        
        # Clean up some sessions
        for session_id in session_ids[:3]:
            session_manager.delete_session(session_id)
        
        # Verify remaining sessions
        metrics = session_manager.get_session_metrics()
        self.assertEqual(metrics.active_sessions, 2)


def run_all_session_tests():
    """Run all session storage tests."""
    print("🔒 Starting Session Storage Tests")
    print("=" * 60)
    
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add test classes
    test_classes = [
        TestSessionConfig,
        TestRedisSessionManager,
        TestSessionEncryption,
        TestSessionHealthChecker,
        TestFlaskIntegration,
        TestSessionStorageIntegration
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    print("=" * 60)
    if result.wasSuccessful():
        print("✅ ALL SESSION STORAGE TESTS PASSED!")
        print("🔒 Production-ready session storage is working correctly.")
        return True
    else:
        print("❌ SOME TESTS FAILED!")
        print(f"Failures: {len(result.failures)}")
        print(f"Errors: {len(result.errors)}")
        return False


if __name__ == "__main__":
    success = run_all_session_tests()
    sys.exit(0 if success else 1)
