class Cloud {
    constructor(x, y, size, speed) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.speed = speed;
        this.opacity = 0.3 + Math.random() * 0.4;
        this.originalY = y;
        this.horizontalSpeed = (Math.random() - 0.5) * 0.3; // Fixed horizontal drift speed
        
        // Pre-generate cloud shape to avoid jittering
        this.cloudParts = [];
        const numCircles = 5;
        for (let i = 0; i < numCircles; i++) {
            this.cloudParts.push({
                offsetX: (Math.random() - 0.5) * this.size * 0.8,
                offsetY: (Math.random() - 0.5) * this.size * 0.4,
                radius: this.size * (0.3 + Math.random() * 0.4)
            });
        }
    }
    
    update() {
        this.y += this.speed;
        
        // Reset cloud when it goes off screen
        if (this.y > GAME_CONFIG.SCREEN_HEIGHT + this.size) {
            this.y = -this.size;
            this.x = Math.random() * GAME_CONFIG.SCREEN_WIDTH;
        }
        
        // Smooth horizontal drift
        this.x += this.horizontalSpeed;
        
        // Keep clouds on screen
        if (this.x < -this.size) this.x = GAME_CONFIG.SCREEN_WIDTH + this.size;
        if (this.x > GAME_CONFIG.SCREEN_WIDTH + this.size) this.x = -this.size;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = GAME_CONFIG.COLORS.CLOUD;
        
        // Draw cloud using pre-generated shape
        for (let part of this.cloudParts) {
            ctx.beginPath();
            ctx.arc(this.x + part.offsetX, this.y + part.offsetY, part.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}