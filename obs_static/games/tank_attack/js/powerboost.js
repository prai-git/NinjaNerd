// PowerBoost class for Tank Attack game
class PowerBoost {
    constructor() {
        this.width = TANK_GAME_CONFIG.POWER_BOOST_SIZE;
        this.height = TANK_GAME_CONFIG.POWER_BOOST_SIZE;
        // Spawn power boosts only between enemy tanks (left side) and user tank (right side)
        // Enemy tanks are at x=50, user tank is at x=1000, so spawn between x=150 and x=900
        this.x = Math.random() * (900 - 150) + 150; // Random X between enemy and user tanks
        
        // Restrict vertical spawning to be within the tank battle area
        // Tank positions are [120, 250, 380, 510] with size 50, so valid area is Y=120 to Y=560
        // Add some padding to avoid spawning too close to tanks
        const minY = 120 + 20; // Top tank Y + padding
        const maxY = 510 + 50 - 20; // Bottom tank Y + tank size - padding = 540
        this.y = Math.random() * (maxY - minY) + minY; // Random Y between 140 and 540
    }
    
    draw(ctx) {
        // Draw power boost as yellow rectangle
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.POWER_BOOST;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Add a border for better visibility
        ctx.strokeStyle = TANK_GAME_CONFIG.COLORS.BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
    
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}
