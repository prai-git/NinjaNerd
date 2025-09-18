// GeoDash Game Configuration
const GEODASH_CONFIG = {
    SCREEN_WIDTH: 1200,
    SCREEN_HEIGHT: 600,
    
    // Player settings
    PLAYER_SIZE: 75,
    PLAYER_X: 100,
    GRAVITY: 1,
    JUMP_STRENGTH: -17,
    JUMP_INCREASE: -5,
    
    // Obstacle settings
    OBSTACLE_WIDTH: 50,
    OBSTACLE_MIN_HEIGHT: 25,
    OBSTACLE_MAX_HEIGHT: 100,
    OBSTACLE_VELOCITY: 10,
    
    // Game settings
    FPS: 30,
    
    // Colors
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    RED: '#FF0000',
    
    // Asset paths
    ASSETS: {
        PLAYER: '/static/games/geodash/assets/dragon.png',
        OBSTACLE: '/static/games/geodash/assets/brick_wall.png',
        BACKGROUND: '/static/games/geodash/assets/forest_background.png',
        MUSIC: '/static/games/geodash/assets/KPOP5.0.wav'
    }
};