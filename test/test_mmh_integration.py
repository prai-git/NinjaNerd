"""
Test for Motorcycle Mayhem (mmh) game integration in NinjaNerd platform.

This test verifies that the mmh game is properly integrated into the platform
including routes, templates, and static assets.
"""

import os
import sys
import logging
from unittest.mock import patch

# Add the project root to the path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_mmh_game_integration():
    """Test that MMH game is properly integrated into the NinjaNerd platform"""
    
    # Import Flask app
    from app import app
    
    # Configure app for testing
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['WTF_CSRF_ENABLED'] = False
    
    # Mock the validation function to always return valid
    def mock_validate_session():
        return True, "Session valid"
    
    with app.test_client() as client:
        # Create a session with authentication data
        with client.session_transaction() as sess:
            sess['username'] = 'test_user'
            sess['grade'] = 1
            sess['session_id'] = 'test-session-id'
            sess['login_time'] = '2025-01-01 12:00:00'
        
        # Mock the session validation and other functions
        with patch('app.validate_session', mock_validate_session), \
             patch('app.log_user_activity'), \
             patch('app.update_user_activity'), \
             patch('app.active_sessions', {'test_user': {'session_id': 'test-session-id', 'last_activity': '2025-01-01 12:00:00'}}):
            
            # Test 1: Check if MMH appears in games list
            logger.info("Test 1: Checking MMH in games list...")
            response = client.get('/games/1')
            assert response.status_code == 200
            assert b'Motorcycle Mayhem' in response.data
            assert b'mmh' in response.data
            assert b'motorcycle down the highway' in response.data
            logger.info("✓ MMH appears in games list")
            
            # Test 2: Check MMH game detail page
            logger.info("Test 2: Testing MMH game detail page...")
            response = client.get('/games/play/mmh')
            assert response.status_code == 200
            assert b'Motorcycle Mayhem' in response.data
            assert b'gameCanvas' in response.data
            assert b'Arrow Keys: Move Left/Right' in response.data
            assert b'Spacebar: Accelerate' in response.data
            logger.info("✓ MMH game detail page loads correctly")
            
            # Test 3: Check if MMH routes are properly handled
            logger.info("Test 3: Testing MMH route handling...")
            response = client.get('/games/play/mmh?grade=3')
            assert response.status_code == 200
            logger.info("✓ MMH routes handle grade parameters correctly")
        
        logger.info("✓ MMH properly integrated in route handling")


def test_mmh_static_assets():
    """Test that MMH static assets are properly organized and accessible"""
    
    logger.info("Testing MMH static assets...")
    
    # Check if mmh game directory structure exists
    mmh_dir = os.path.join(project_root, 'static', 'games', 'mmh')
    assert os.path.exists(mmh_dir), f"MMH directory not found at {mmh_dir}"
    
    # Check JavaScript files
    js_dir = os.path.join(mmh_dir, 'js')
    assert os.path.exists(js_dir), "MMH JS directory not found"
    
    required_js_files = ['config.js', 'player.js', 'obstacle.js', 'road.js', 'game.js']
    for js_file in required_js_files:
        js_path = os.path.join(js_dir, js_file)
        assert os.path.exists(js_path), f"Required JS file {js_file} not found"
        logger.info(f"✓ Found {js_file}")
    
    # Check CSS files
    css_dir = os.path.join(mmh_dir, 'css')
    assert os.path.exists(css_dir), "MMH CSS directory not found"
    css_path = os.path.join(css_dir, 'mmh.css')
    assert os.path.exists(css_path), "mmh.css not found"
    logger.info("✓ Found mmh.css")
    
    # Check assets
    assets_dir = os.path.join(mmh_dir, 'assets')
    assert os.path.exists(assets_dir), "MMH assets directory not found"
    
    required_assets = ['motorcycle.png', 'car1.png', 'car2.png', 'bus.png', 'backgroundmusic.wav']
    for asset in required_assets:
        asset_path = os.path.join(assets_dir, asset)
        assert os.path.exists(asset_path), f"Required asset {asset} not found"
        logger.info(f"✓ Found {asset}")
    
    logger.info("✓ All MMH static assets properly organized")


def test_mmh_javascript_functionality():
    """Test basic MMH JavaScript functionality"""
    
    logger.info("Testing MMH JavaScript functionality...")
    
    # Read and basic validation of JS files
    mmh_dir = os.path.join(project_root, 'static', 'games', 'mmh', 'js')
    
    # Test config.js
    config_path = os.path.join(mmh_dir, 'config.js')
    with open(config_path, 'r') as f:
        config_content = f.read()
        assert 'MMH_CONFIG' in config_content
        assert 'SCREEN_WIDTH' in config_content
        assert 'SCREEN_HEIGHT' in config_content
        assert 'ASSETS' in config_content
        logger.info("✓ config.js contains required configuration")
    
    # Test player.js
    player_path = os.path.join(mmh_dir, 'player.js')
    with open(player_path, 'r') as f:
        player_content = f.read()
        assert 'class Player' in player_content
        assert 'update' in player_content
        assert 'draw' in player_content
        assert 'getSpeedMultiplier' in player_content
        logger.info("✓ player.js contains Player class with required methods")
    
    # Test obstacle.js
    obstacle_path = os.path.join(mmh_dir, 'obstacle.js')
    with open(obstacle_path, 'r') as f:
        obstacle_content = f.read()
        assert 'class Obstacle' in obstacle_content
        assert 'update' in obstacle_content
        assert 'draw' in obstacle_content
        assert 'isOffScreen' in obstacle_content
        logger.info("✓ obstacle.js contains Obstacle class with required methods")
    
    # Test road.js
    road_path = os.path.join(mmh_dir, 'road.js')
    with open(road_path, 'r') as f:
        road_content = f.read()
        assert 'class Road' in road_content
        assert 'update' in road_content
        assert 'draw' in road_content
        logger.info("✓ road.js contains Road class with required methods")
    
    # Test game.js
    game_path = os.path.join(mmh_dir, 'game.js')
    with open(game_path, 'r') as f:
        game_content = f.read()
        assert 'class MotorcycleMayhem' in game_content
        assert 'start()' in game_content
        assert 'stop()' in game_content
        assert 'restart()' in game_content
        assert 'togglePause()' in game_content
        assert 'spawnObstacle()' in game_content
        logger.info("✓ game.js contains MotorcycleMayhem class with required methods")
    
    logger.info("✓ All MMH JavaScript files have correct structure")


def test_mmh_error_handling():
    """Test error handling for MMH game"""
    
    logger.info("Testing MMH error handling...")
    
    from app import app
    app.config['TESTING'] = True
    
    with app.test_client() as client:
        # Create a session with authentication data
        with client.session_transaction() as sess:
            sess['username'] = 'test_user'
            sess['grade'] = 1
            sess['session_id'] = 'test-session-id'
            sess['login_time'] = '2025-01-01 12:00:00'
        
        with patch('app.validate_session', lambda: (True, "Session valid")), \
             patch('app.log_user_activity'), \
             patch('app.update_user_activity'), \
             patch('app.active_sessions', {'test_user': {'session_id': 'test-session-id', 'last_activity': '2025-01-01 12:00:00'}}):
            
            # Test 1: Valid game slug should work
            logger.info("Testing valid game slug handling...")
            response = client.get('/games/play/mmh')
            assert response.status_code == 200
            logger.info("✓ Valid game slug works correctly")
        
        # Test 2: Test access without login (should redirect to login)
        logger.info("Testing access without login...")
        with app.test_client() as no_auth_client:
            response = no_auth_client.get('/games/play/mmh')
            # This should redirect to login page or show error
            assert response.status_code in [302, 401, 403]
            logger.info("✓ Unauthorized access properly handled")
    
    logger.info("✓ MMH error handling works correctly")


def run_all_tests():
    """Run all MMH integration tests"""
    
    logger.info("Starting MMH integration tests...")
    
    try:
        test_mmh_game_integration()
        logger.info("✓ Game integration test passed")
        
        test_mmh_static_assets()
        logger.info("✓ Static assets test passed")
        
        test_mmh_javascript_functionality()
        logger.info("✓ JavaScript functionality test passed")
        
        test_mmh_error_handling()
        logger.info("✓ Error handling test passed")
        
        logger.info("🎉 All MMH integration tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
