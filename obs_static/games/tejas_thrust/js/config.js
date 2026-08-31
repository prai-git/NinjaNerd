// Game configuration constants (converted from TejasThrust Python config)
const GAME_CONFIG = {
    SCREEN_WIDTH: 1200,
    SCREEN_HEIGHT: 800,
    
    // Player settings
    PLAYER_SPEED: 5,
    PLAYER_MAX_HEALTH: 100,
    PLAYER_SHOOT_COOLDOWN: 200,
    
    // Enemy settings
    ENEMY_SPAWN_INTERVAL: 1000,
    ENEMY_SPEED: 2,
    ENEMY_HEALTH: 2,
    ENEMY_SHOOT_COOLDOWN: 1500,
    ENEMY_SHOOT_CHANCE: 0.015,
    
    // Boss settings
    BOSS_SPAWN_COUNT: 50,
    BOSS_HEALTH: 5,
    BOSS_SPEED: 1.5,
    BOSS_SHOOT_COOLDOWN: 800,
    BOSS_SHOOT_CHANCE: 0.03,
    
    // Laser settings
    LASER_SPEED: 8,
    LASER_WIDTH: 4,
    LASER_HEIGHT: 10,
    ENEMY_LASER_SPEED: 10,
    BOSS_LASER_SPEED: 12,
    BOSS_LASER_DAMAGE: 5,
    
    // Plane dimensions
    PLANE_WIDTH: 60,
    PLANE_HEIGHT: 40,
    BOSS_WIDTH: 100,
    BOSS_HEIGHT: 60,
    
    // Colors
    COLORS: {
        SKY: '#87CEEB',
        PLAYER: '#0064FF',
        ENEMY: '#323232',
        BOSS: '#FF3232',
        PLAYER_LASER: '#FFFF00',
        ENEMY_LASER: '#FF0000',
        CLOUD: '#FFFFFF',
        WHITE: '#FFFFFF',
        BLACK: '#000000'
    },
    
    // Game mechanics
    FPS: 60
};