#!/usr/bin/env python3
"""
Simple test script for the logging system to verify basic functionality.
"""

import sys
import os
import tempfile
import shutil

# Add the project root to the path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

def test_basic_functionality():
    """Test basic logging system functionality."""
    temp_dir = tempfile.mkdtemp()
    
    try:
        print("Testing basic logging system functionality...")
        
        # Test LogConfig
        from logging_system.log_config import LogConfig
        config = LogConfig()
        config.log_directory = temp_dir
        config.enable_async_logging = False  # Disable async for testing to avoid hanging
        
        print("✅ LogConfig created successfully")
        
        # Test validation
        assert config.validate() == True
        print("✅ LogConfig validation passed")
        
        # Test LogManager
        from logging_system.log_manager import LogManager
        manager = LogManager(config)
        manager.setup_logging()  # This should work now
        
        print("✅ LogManager created and setup successfully")
        
        # Test PerformanceLogger
        from logging_system.performance_logger import PerformanceLogger
        perf_logger = PerformanceLogger(config)
        perf_logger.log_operation('test_operation', 100.5)
        stats = perf_logger.get_operation_stats('test_operation')
        assert stats is not None
        assert stats.count == 1
        
        print("✅ PerformanceLogger working correctly")
        
        # Test StructuredLogger
        from logging_system.structured_logger import StructuredLogger
        struct_logger = StructuredLogger(config)
        struct_logger.set_context(request_id='test-123', user_id='test-user')
        context = struct_logger.get_context()
        assert context.request_id == 'test-123'
        
        print("✅ StructuredLogger working correctly")
        
        # Cleanup
        if perf_logger:
            perf_logger.shutdown()
        if manager:
            manager.shutdown()
        
        # Force cleanup of all logging
        import logging
        logging.shutdown()
        
        print("\n🎉 All basic tests passed! Logging system is working correctly.")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        # Force final cleanup
        import logging
        logging.shutdown()

if __name__ == "__main__":
    success = test_basic_functionality()
    
    # Final cleanup before exit
    import logging
    logging.shutdown()
    
    sys.exit(0 if success else 1)
