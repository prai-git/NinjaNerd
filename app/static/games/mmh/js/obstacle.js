// Obstacle class for Motorcycle Mayhem
class Obstacle {
    static instances = [];
    
    constructor(x, y, imageName, speed) {
        this.x = x;
        this.y = y;
        this.width = MMH_CONFIG.OBSTACLE_WIDTH;
        this.height = MMH_CONFIG.OBSTACLE_HEIGHT;
        this.baseSpeed = speed;
        this.speed = speed;
        
        // Load obstacle image
        this.image = new Image();
        this.image.src = MMH_CONFIG.ASSETS[imageName];
        this.imageLoaded = false;
        this.image.onload = () => {
            this.imageLoaded = true;
        };
        
        Obstacle.instances.push(this);
    }
    
    update(playerSpeedMultiplier) {
        // Move down with player's acceleration affecting it
        this.speed = this.baseSpeed * playerSpeedMultiplier;
        this.y += this.speed;
    }
    
    draw(ctx) {
        if (this.imageLoaded) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            // Draw placeholder if image not loaded
            ctx.fillStyle = MMH_CONFIG.RED;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
    
    isOffScreen() {
        return this.y > MMH_CONFIG.SCREEN_HEIGHT;
    }
    
    collidesWith(player) {
        const playerRect = player.getRect();
        return this.x < playerRect.x + playerRect.width &&
               this.x + this.width > playerRect.x &&
               this.y < playerRect.y + playerRect.height &&
               this.y + this.height > playerRect.y;
    }
    
    getRect() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
    
    static removeOffScreen() {
        Obstacle.instances = Obstacle.instances.filter(obs => !obs.isOffScreen());
    }
    
    static clearAll() {
        Obstacle.instances = [];
    }
}
