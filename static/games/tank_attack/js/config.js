// Tank Attack Game Configuration
const TANK_GAME_CONFIG = {
    SCREEN_WIDTH: 1200,
    SCREEN_HEIGHT: 800,
    
    // BlueDot (Player) settings
    BLUE_DOT_SIZE: 50,
    BLUE_DOT_SPEED: 5,
    BLUE_DOT_MAX_HEALTH: 200,
    BLUE_DOT_SHOOT_COOLDOWN: 500,
    BLUE_DOT_X_POSITION: 1000, // Position on right side
    
    // Tank settings
    TANK_SIZE: 50,
    TANK_MAX_HEALTH: 100,
    TANK_SHOOT_COOLDOWN: 500,
    TANK_X_POSITION: 50, // Position on left side
    TANK_POSITIONS: [120, 250, 380, 510], // Y positions for 4 tanks - moved down to avoid text overlap
    
    // Laser settings
    LASER_SIZE: 5,
    LASER_SPEED: 5,
    LASER_DAMAGE: 1,
    
    // Power boost settings
    POWER_BOOST_SIZE: 20,
    POWER_BOOST_SPAWN_INTERVAL: 2000, // 2 seconds
    POWER_BOOSTS_FOR_FIREBALL: 10,
    
    // Fireball settings
    FIREBALL_SIZE: 20,
    FIREBALL_SPEED: 7,
    FIREBALL_DAMAGE: 20,
    
    // Dash properties for laser visualization
    DASH_LENGTH: 15,
    SPACE_LENGTH: 10,
    
    // Colors
    COLORS: {
        BACKGROUND: '#FFFFFF',
        BLUE_DOT: '#0000FF',
        TANK: '#FF0000',
        LASER_BLUE: '#0000FF',
        LASER_RED: '#FF0000',
        POWER_BOOST: '#FFFF00',
        FIREBALL: '#FFA500',
        BLACK: '#000000',
        WHITE: '#FFFFFF'
    },
    
    // Game mechanics
    FPS: 60
};
