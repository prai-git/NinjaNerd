// BlueDot (Player) class for Tank Attack game
class BlueDot {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = TANK_GAME_CONFIG.BLUE_DOT_SIZE;
        this.height = TANK_GAME_CONFIG.BLUE_DOT_SIZE;
        this.health = TANK_GAME_CONFIG.BLUE_DOT_MAX_HEALTH;
        this.lasers = [];
        this.fireball = null;
        this.lastShoot = 0;
        this.powerBoostsHit = 0;
    }
    
    move(direction) {
        const speed = TANK_GAME_CONFIG.BLUE_DOT_SPEED;
        
        if (direction === 'up' && this.y > 0) {
            this.y -= speed;
        } else if (direction === 'down' && this.y + this.height < TANK_GAME_CONFIG.SCREEN_HEIGHT) {
            this.y += speed;
        }
    }
    
    shootLaser() {
        const currentTime = Date.now();
        if (currentTime - this.lastShoot >= TANK_GAME_CONFIG.BLUE_DOT_SHOOT_COOLDOWN) {
            this.lasers.push({
                x: this.x,
                y: this.y + this.height / 2,
                width: TANK_GAME_CONFIG.LASER_SIZE,
                height: TANK_GAME_CONFIG.LASER_SIZE,
                direction: { x: -1, y: 0 } // Moving left
            });
            this.lastShoot = currentTime;
        }
    }
    
    shootFireball() {
        if (this.powerBoostsHit >= TANK_GAME_CONFIG.POWER_BOOSTS_FOR_FIREBALL && !this.fireball) {
            this.fireball = {
                x: this.x,
                y: this.y + this.height / 2,
                width: TANK_GAME_CONFIG.FIREBALL_SIZE,
                height: TANK_GAME_CONFIG.FIREBALL_SIZE
            };
            this.powerBoostsHit = 0; // Reset power boost count
        }
    }
    
    update() {
        // Update lasers
        for (let i = this.lasers.length - 1; i >= 0; i--) {
            const laser = this.lasers[i];
            laser.x -= TANK_GAME_CONFIG.LASER_SPEED;
            
            // Remove laser if it goes off screen
            if (laser.x < 0) {
                this.lasers.splice(i, 1);
            }
        }
        
        // Update fireball
        if (this.fireball) {
            this.fireball.x -= TANK_GAME_CONFIG.FIREBALL_SPEED;
            
            // Remove fireball if it goes off screen
            if (this.fireball.x < 0) {
                this.fireball = null;
            }
        }
    }
    
    draw(ctx) {
        // Draw tank body (main rectangle)
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.BLUE_DOT;
        ctx.fillRect(this.x + 10, this.y + 5, this.width - 10, this.height - 10);
        
        // Draw tank barrel (rectangle extending to the left)
        ctx.fillRect(this.x - 5, this.y + this.height / 2 - 3, 15, 6);
        
        // Draw tank tracks (darker rectangles at bottom)
        ctx.fillStyle = '#0000AA'; // Darker blue for tracks
        ctx.fillRect(this.x + 12, this.y + this.height - 8, this.width - 14, 8);
        
        // Draw tank turret (smaller rectangle on top)
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.BLUE_DOT;
        ctx.fillRect(this.x + 20, this.y, this.width - 25, this.height / 2);
        
        // Draw lasers as dashed lines
        ctx.strokeStyle = TANK_GAME_CONFIG.COLORS.LASER_BLUE;
        ctx.lineWidth = 2;
        for (const laser of this.lasers) {
            this.drawDashedLaser(ctx, laser.x, laser.y, laser.x - 100, laser.y);
        }
        
        // Draw fireball
        if (this.fireball) {
            ctx.fillStyle = TANK_GAME_CONFIG.COLORS.FIREBALL;
            ctx.beginPath();
            ctx.arc(this.fireball.x + this.fireball.width / 2, this.fireball.y + this.fireball.height / 2, 
                   this.fireball.width / 2, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw health
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.BLACK;
        ctx.font = '24px Arial';
        ctx.fillText(this.health.toString(), this.x + this.width / 2 - 10, this.y - 10);
    }
    
    drawDashedLaser(ctx, x1, y1, x2, y2) {
        const totalLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const dashCount = Math.floor(totalLength / (TANK_GAME_CONFIG.DASH_LENGTH + TANK_GAME_CONFIG.SPACE_LENGTH));
        
        for (let i = 0; i < dashCount; i++) {
            const startRatio = (i * (TANK_GAME_CONFIG.DASH_LENGTH + TANK_GAME_CONFIG.SPACE_LENGTH)) / totalLength;
            const endRatio = ((i * (TANK_GAME_CONFIG.DASH_LENGTH + TANK_GAME_CONFIG.SPACE_LENGTH)) + TANK_GAME_CONFIG.DASH_LENGTH) / totalLength;
            
            const startX = x1 + (x2 - x1) * startRatio;
            const startY = y1 + (y2 - y1) * startRatio;
            const endX = x1 + (x2 - x1) * endRatio;
            const endY = y1 + (y2 - y1) * endRatio;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
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
