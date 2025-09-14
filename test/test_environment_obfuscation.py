#!/usr/bin/env python3
"""
Test suite for environment variable based obfuscation key setup.

This test ensures that the MESSAGE_OBFUSCATION_KEY environment variable
is properly used and falls back gracefully when not set.
"""

import sys
import os
import pytest
from unittest.mock import patch

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestEnvironmentBasedObfuscation:
    """Test the environment variable based obfuscation setup."""
    
    def test_environment_key_usage(self):
        """Test that MESSAGE_OBFUSCATION_KEY from environment is used."""
        test_key = "test-obfuscation-key-123"
        
        with patch.dict(os.environ, {'MESSAGE_OBFUSCATION_KEY': test_key}):
            # Import after setting environment variable
            import importlib
            import core.message_security
            importlib.reload(core.message_security)
            
            from core.message_security import obfuscate_message, deobfuscate_message
            
            # Test that obfuscation works with the environment key
            test_message = "test message"
            obfuscated = obfuscate_message(test_message)
            deobfuscated = deobfuscate_message(obfuscated)
            
            assert deobfuscated == test_message
            assert obfuscated.startswith("obf1:")
    
    def test_fallback_when_env_key_missing(self):
        """Test fallback behavior when MESSAGE_OBFUSCATION_KEY is not set."""
        # Remove the environment variable if it exists
        env_backup = os.environ.copy()
        if 'MESSAGE_OBFUSCATION_KEY' in os.environ:
            del os.environ['MESSAGE_OBFUSCATION_KEY']
        
        try:
            # Import after removing environment variable
            import importlib
            import core.message_security
            importlib.reload(core.message_security)
            
            from core.message_security import obfuscate_message, deobfuscate_message
            
            # Should still work with fallback key
            test_message = "test message"
            obfuscated = obfuscate_message(test_message)
            deobfuscated = deobfuscate_message(obfuscated)
            
            assert deobfuscated == test_message
            assert obfuscated.startswith("obf1:")
            
        finally:
            # Restore environment
            os.environ.clear()
            os.environ.update(env_backup)
    
    def test_consistent_keys_across_imports(self):
        """Test that the same key is used across multiple imports."""
        test_key = "consistent-test-key-456"
        
        with patch.dict(os.environ, {'MESSAGE_OBFUSCATION_KEY': test_key}):
            # Import and reload to use new key
            import importlib
            import core.message_security
            importlib.reload(core.message_security)
            
            from core.message_security import obfuscate_message as obf1, deobfuscate_message as deobf1
            
            # Import again (should use same key)
            from core.message_security import obfuscate_message as obf2, deobfuscate_message as deobf2
            
            test_message = "consistency test"
            
            # Both should produce the same result
            obfuscated1 = obf1(test_message)
            obfuscated2 = obf2(test_message)
            
            # Should be able to deobfuscate cross-function
            assert deobf1(obfuscated2) == test_message
            assert deobf2(obfuscated1) == test_message
            assert deobf1(obfuscated1) == test_message
            assert deobf2(obfuscated2) == test_message


if __name__ == '__main__':
    pytest.main([__file__])