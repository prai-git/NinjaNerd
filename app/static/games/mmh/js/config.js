// Motorcycle Mayhem Game Configuration
const MMH_CONFIG = {
    SCREEN_WIDTH: 1200,
    SCREEN_HEIGHT: 600,
    
    // Road settings
    ROAD_WIDTH: 400,
    LANE_WIDTH: 133.33, // 400 / 3
    LANE_MARKER_WIDTH: 10,
    LANE_MARKER_HEIGHT: 40,
    LANE_MARKER_GAP: 60,
    
    // Player settings
    PLAYER_WIDTH: 60,
    PLAYER_HEIGHT: 120,
    PLAYER_START_Y: 480, // 600 - 120 (height)
    PLAYER_SPEED: 5,
    PLAYER_ACCELERATION: 0.3,
    PLAYER_MAX_SPEED: 12,
    PLAYER_FRICTION: 0.15,
    
    // Obstacle settings
    OBSTACLE_MIN_SPEED: 3,
    OBSTACLE_MAX_SPEED: 8,
    OBSTACLE_SPAWN_RATE: 60, // frames
    OBSTACLE_MIN_GAP: 200,
    OBSTACLE_WIDTH: 60,
    OBSTACLE_HEIGHT: 120,
    
    // Scoring
    SCORE_INCREMENT: 1,
    SCORE_PER_SECOND: 10,
    
    // Game settings
    FPS: 60,
    
    // Colors
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    GRAY: '#808080',
    DARK_GRAY: '#404040',
    GREEN: '#228B22',
    YELLOW: '#FFFF00',
    RED: '#FF0000',
    BLUE: '#6495ED',
    
    // Asset paths
    ASSETS: {
        PLAYER: '/static/games/mmh/assets/motorcycle.png',
        CAR1: '/static/games/mmh/assets/car1.png',
        CAR2: '/static/games/mmh/assets/car2.png',
        BUS: '/static/games/mmh/assets/bus.png',
        MUSIC: '/static/games/mmh/assets/backgroundmusic.wav'
    }
};
