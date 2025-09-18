class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = GEODASH_CONFIG.PLAYER_SIZE;
        this.yVelocity = 0;
        this.isJumping = false;
        this.image = new Image();
        this.image.src = GEODASH_CONFIG.ASSETS.PLAYER;
        this.imageLoaded = false;
        
        this.image.onload = () => {
            this.imageLoaded = true;
        };
    }
    
    update() {
        // Apply gravity
        this.yVelocity += GEODASH_CONFIG.GRAVITY;
        this.y += this.yVelocity;
        
        // Ground collision
        const groundY = GEODASH_CONFIG.SCREEN_HEIGHT - this.size;
        if (this.y > groundY) {
            this.y = groundY;
            this.isJumping = false;
            this.yVelocity = 0;
        }
    }
    
    jump() {
        if (!this.isJumping) {
            this.yVelocity = GEODASH_CONFIG.JUMP_STRENGTH;
            this.isJumping = true;
        }
    }
    
    draw(ctx) {
        if (this.imageLoaded) {
            ctx.drawImage(this.image, this.x, this.y, this.size, this.size);
        } else {
            // Fallback rectangle if image isn't loaded
            ctx.fillStyle = GEODASH_CONFIG.BLACK;
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }
    }
    
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.size,
            height: this.size
        };
    }
}