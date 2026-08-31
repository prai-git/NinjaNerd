class Obstacle {
    constructor() {
        this.width = GEODASH_CONFIG.OBSTACLE_WIDTH;
        this.height = Math.floor(Math.random() * 
            (GEODASH_CONFIG.OBSTACLE_MAX_HEIGHT - GEODASH_CONFIG.OBSTACLE_MIN_HEIGHT + 1)) + 
            GEODASH_CONFIG.OBSTACLE_MIN_HEIGHT;
        this.x = GEODASH_CONFIG.SCREEN_WIDTH;
        this.y = GEODASH_CONFIG.SCREEN_HEIGHT - this.height;
        this.velocity = GEODASH_CONFIG.OBSTACLE_VELOCITY;
        this.image = new Image();
        this.image.src = GEODASH_CONFIG.ASSETS.OBSTACLE;
        this.imageLoaded = false;
        
        this.image.onload = () => {
            this.imageLoaded = true;
        };
    }
    
    update() {
        this.x -= this.velocity;
    }
    
    draw(ctx) {
        if (this.imageLoaded) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            // Fallback rectangle if image isn't loaded
            ctx.fillStyle = GEODASH_CONFIG.RED;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
    
    isOffScreen() {
        return this.x + this.width < 0;
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