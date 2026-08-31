// Player class for Motorcycle Mayhem
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = MMH_CONFIG.PLAYER_WIDTH;
        this.height = MMH_CONFIG.PLAYER_HEIGHT;
        this.speedX = 0;
        this.speedY = 0;
        this.isAccelerating = false;
        
        // Load player image
        this.image = new Image();
        this.image.src = MMH_CONFIG.ASSETS.PLAYER;
        this.imageLoaded = false;
        this.image.onload = () => {
            this.imageLoaded = true;
        };
        
        this.roadX = (MMH_CONFIG.SCREEN_WIDTH - MMH_CONFIG.ROAD_WIDTH) / 2;
    }
    
    update(keys) {
        // Horizontal movement
        this.speedX = 0;
        if (keys['ArrowLeft']) {
            this.speedX = -MMH_CONFIG.PLAYER_SPEED;
        }
        if (keys['ArrowRight']) {
            this.speedX = MMH_CONFIG.PLAYER_SPEED;
        }
        
        // Acceleration - only if spacebar is explicitly pressed
        if (keys[' '] === true) { // Spacebar
            if (!this.isAccelerating) {
                this.isAccelerating = true;
            }
            this.speedY = Math.min(this.speedY + MMH_CONFIG.PLAYER_ACCELERATION, 
                                  MMH_CONFIG.PLAYER_MAX_SPEED);
        } else {
            this.isAccelerating = false;
            // Apply friction
            if (this.speedY > 0) {
                this.speedY = this.speedY - MMH_CONFIG.PLAYER_FRICTION;
                // Ensure speed doesn't go below 0
                if (this.speedY < 0.01) {
                    this.speedY = 0;
                }
            }
        }
        
        // Update position
        this.x += this.speedX;
        
        // Keep player on the road
        const roadLeft = this.roadX + 10;
        const roadRight = this.roadX + MMH_CONFIG.ROAD_WIDTH - 10;
        
        if (this.x < roadLeft) {
            this.x = roadLeft;
        }
        if (this.x + this.width > roadRight) {
            this.x = roadRight - this.width;
        }
    }
    
    draw(ctx) {
        if (this.imageLoaded) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            // Draw placeholder if image not loaded
            ctx.fillStyle = MMH_CONFIG.BLUE;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
    
    getSpeedMultiplier() {
        return 1 + (this.speedY / MMH_CONFIG.PLAYER_MAX_SPEED);
    }
    
    getRect() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}
