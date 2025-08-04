class Laser {
    constructor(x, y, speed, color, damage = 1, angle = 0) {
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.color = color;
        this.damage = damage;
        this.angle = angle;
        this.width = GAME_CONFIG.LASER_WIDTH;
        this.height = GAME_CONFIG.LASER_HEIGHT;
        
        // Calculate velocity components for angled shots
        this.vx = Math.sin(angle) * Math.abs(speed);
        this.vy = speed;
    }
    
    update() {
        if (this.angle !== 0) {
            this.x += this.vx;
            this.y += this.vy;
        } else {
            this.y += this.speed;
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Draw laser with glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Add bright center
        ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        ctx.fillRect(-this.width / 4, -this.height / 2, this.width / 2, this.height);
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }
    
    getRect() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
    
    isOffScreen() {
        return this.y < -20 || this.y > GAME_CONFIG.SCREEN_HEIGHT + 20 ||
               this.x < -20 || this.x > GAME_CONFIG.SCREEN_WIDTH + 20;
    }
}