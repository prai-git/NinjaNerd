"""
Test for GeoDash game integration in NinjaNerd platform.

This test verifies that the GeoDash game is properly integrated into the platform
including routes, templates, and static assets.
"""

import os
import sys
import tempfile
import pytest
import logging
from unittest.mock import patch, MagicMock

# Add the project root to the path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_geodash_game_integration():
    """Test that GeoDash game is properly integrated into the NinjaNerd platform"""
    
    # Import Flask app
    from app import app
    
    # Configure app for testing
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['WTF_CSRF_ENABLED'] = False
    
    # Mock the validation function to always return valid
    def mock_validate_session():
        return True, "Valid session"
    
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
            
            # Test 1: Check if GeoDash appears in games list
            logger.info("Test 1: Checking GeoDash in games list...")
            response = client.get('/games/1')
            assert response.status_code == 200
            assert b'GeoDash' in response.data
            assert b'geodash' in response.data
            assert b'dragon through obstacles' in response.data
            logger.info("✓ GeoDash appears in games list")
            # Test 2: Check GeoDash game detail page
            logger.info("Test 2: Testing GeoDash game detail page...")
            response = client.get('/games/play/geodash')
            assert response.status_code == 200
            assert b'GeoDash' in response.data
            assert b'gameCanvas' in response.data
            assert b'Spacebar: Jump' in response.data
            logger.info("✓ GeoDash game detail page loads correctly")
            
            # Test 3: Check if GeoDash routes are properly handled
            logger.info("Test 3: Testing GeoDash route handling...")
            response = client.get('/games/play/geodash?grade=3')
            assert response.status_code == 200
            logger.info("✓ GeoDash routes handle grade parameters correctly")
        
        logger.info("✓ GeoDash properly integrated in route handling")

def test_geodash_static_assets():
    """Test that GeoDash static assets are properly organized and accessible"""
    
    logger.info("Testing GeoDash static assets...")
    
    # Check if geodash game directory structure exists
    geodash_dir = os.path.join(project_root, 'static', 'games', 'geodash')
    assert os.path.exists(geodash_dir), f"GeoDash directory not found at {geodash_dir}"
    
    # Check JavaScript files
    js_dir = os.path.join(geodash_dir, 'js')
    assert os.path.exists(js_dir), "GeoDash JS directory not found"
    
    required_js_files = ['config.js', 'player.js', 'obstacle.js', 'game.js']
    for js_file in required_js_files:
        js_path = os.path.join(js_dir, js_file)
        assert os.path.exists(js_path), f"Required JS file {js_file} not found"
        logger.info(f"✓ Found {js_file}")
    
    # Check CSS files
    css_dir = os.path.join(geodash_dir, 'css')
    assert os.path.exists(css_dir), "GeoDash CSS directory not found"
    
    css_path = os.path.join(css_dir, 'geodash.css')
    assert os.path.exists(css_path), "GeoDash CSS file not found"
    logger.info("✓ Found geodash.css")
    
    # Check asset files
    assets_dir = os.path.join(geodash_dir, 'assets')
    assert os.path.exists(assets_dir), "GeoDash assets directory not found"
    
    required_assets = ['dragon.png', 'brick_wall.png', 'forest_background.png', 'KPOP5.0.wav']
    for asset in required_assets:
        asset_path = os.path.join(assets_dir, asset)
        assert os.path.exists(asset_path), f"Required asset {asset} not found"
        logger.info(f"✓ Found {asset}")
    
    logger.info("✓ All GeoDash static assets are properly organized")

def test_geodash_javascript_functionality():
    """Test basic GeoDash JavaScript functionality"""
    
    logger.info("Testing GeoDash JavaScript functionality...")
    
    # Read and basic validation of JS files
    geodash_dir = os.path.join(project_root, 'static', 'games', 'geodash', 'js')
    
    # Test config.js
    config_path = os.path.join(geodash_dir, 'config.js')
    with open(config_path, 'r') as f:
        config_content = f.read()
        assert 'GEODASH_CONFIG' in config_content
        assert 'SCREEN_WIDTH' in config_content
        assert 'SCREEN_HEIGHT' in config_content
        assert 'ASSETS' in config_content
        logger.info("✓ config.js contains required configuration")
    
    # Test player.js
    player_path = os.path.join(geodash_dir, 'player.js')
    with open(player_path, 'r') as f:
        player_content = f.read()
        assert 'class Player' in player_content
        assert 'jump()' in player_content
        assert 'update()' in player_content
        assert 'draw(ctx)' in player_content
        logger.info("✓ player.js contains Player class with required methods")
    
    # Test obstacle.js
    obstacle_path = os.path.join(geodash_dir, 'obstacle.js')
    with open(obstacle_path, 'r') as f:
        obstacle_content = f.read()
        assert 'class Obstacle' in obstacle_content
        assert 'update()' in obstacle_content
        assert 'draw(ctx)' in obstacle_content
        assert 'isOffScreen()' in obstacle_content
        logger.info("✓ obstacle.js contains Obstacle class with required methods")
    
    # Test game.js
    game_path = os.path.join(geodash_dir, 'game.js')
    with open(game_path, 'r') as f:
        game_content = f.read()
        assert 'class GeoDash' in game_content
        assert 'start()' in game_content
        assert 'stop()' in game_content
        assert 'restart()' in game_content
        assert 'gameLoop()' in game_content
        logger.info("✓ game.js contains GeoDash class with required methods")
    
    logger.info("✓ GeoDash JavaScript files have proper structure")

def test_geodash_error_handling():
    """Test error handling for GeoDash game"""
    
    from app import app
    
    # Configure app for testing
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.config['WTF_CSRF_ENABLED'] = False
    
    # Mock the validation function to always return valid
    def mock_validate_session():
        return True, "Valid session"
    
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
            
            # Test 1: Invalid game slug should redirect
            logger.info("Testing invalid game slug handling...")
            response = client.get('/games/play/invalid_game')
            assert response.status_code == 302  # Redirect
            logger.info("✓ Invalid game slug properly redirects")
        
        # Test 2: Test access without login (should redirect to login)
        logger.info("Testing access without login...")
        with app.test_client() as no_auth_client:
            response = no_auth_client.get('/games/play/geodash')
            # This should redirect to login page or show error
            assert response.status_code in [302, 401, 403]
            logger.info("✓ Unauthorized access properly handled")

def run_all_tests():
    """Run all GeoDash integration tests"""
    
    logger.info("Starting GeoDash integration tests...")
    
    try:
        test_geodash_game_integration()
        logger.info("✓ Game integration test passed")
        
        test_geodash_static_assets()
        logger.info("✓ Static assets test passed")
        
        test_geodash_javascript_functionality()
        logger.info("✓ JavaScript functionality test passed")
        
        test_geodash_error_handling()
        logger.info("✓ Error handling test passed")
        
        logger.info("🎉 All GeoDash integration tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)