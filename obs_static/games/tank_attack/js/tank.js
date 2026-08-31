// Tank (Enemy) class for Tank Attack game
class Tank {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = TANK_GAME_CONFIG.TANK_SIZE;
        this.height = TANK_GAME_CONFIG.TANK_SIZE;
        this.health = TANK_GAME_CONFIG.TANK_MAX_HEALTH;
        this.lasers = [];
        this.lastShoot = 0;
    }
    
    shootLaser(target) {
        const currentTime = Date.now();
        if (currentTime - this.lastShoot >= TANK_GAME_CONFIG.TANK_SHOOT_COOLDOWN) {
            const direction = this.getDirection(target);
            this.lasers.push({
                x: this.x + this.width,
                y: this.y + this.height / 2,
                width: TANK_GAME_CONFIG.LASER_SIZE,
                height: TANK_GAME_CONFIG.LASER_SIZE,
                direction: direction
            });
            this.lastShoot = currentTime;
        }
    }
    
    getDirection(target) {
        const dx = target.x + target.width / 2 - (this.x + this.width / 2);
        const dy = target.y + target.height / 2 - (this.y + this.height / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return {
            x: dx / distance,
            y: dy / distance
        };
    }
    
    update() {
        // Update lasers
        for (let i = this.lasers.length - 1; i >= 0; i--) {
            const laser = this.lasers[i];
            laser.x += TANK_GAME_CONFIG.LASER_SPEED * laser.direction.x;
            laser.y += TANK_GAME_CONFIG.LASER_SPEED * laser.direction.y;
            
            // Remove laser if it goes off screen
            if (laser.x > TANK_GAME_CONFIG.SCREEN_WIDTH || 
                laser.y < 0 || 
                laser.y > TANK_GAME_CONFIG.SCREEN_HEIGHT) {
                this.lasers.splice(i, 1);
            }
        }
    }
    
    draw(ctx) {
        // Draw tank body (main rectangle)
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.TANK;
        ctx.fillRect(this.x, this.y + 5, this.width - 10, this.height - 10);
        
        // Draw tank barrel (rectangle extending to the right)
        ctx.fillRect(this.x + this.width - 10, this.y + this.height / 2 - 3, 15, 6);
        
        // Draw tank tracks (darker rectangles at bottom)
        ctx.fillStyle = '#AA0000'; // Darker red for tracks
        ctx.fillRect(this.x - 2, this.y + this.height - 8, this.width - 6, 8);
        
        // Draw tank turret (smaller rectangle on top)
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.TANK;
        ctx.fillRect(this.x + 10, this.y, this.width - 25, this.height / 2);
        
        // Draw lasers as dashed lines
        ctx.strokeStyle = TANK_GAME_CONFIG.COLORS.LASER_RED;
        ctx.lineWidth = 2;
        for (const laser of this.lasers) {
            const endX = laser.x + 100 * laser.direction.x;
            const endY = laser.y + 100 * laser.direction.y;
            this.drawDashedLaser(ctx, laser.x, laser.y, endX, endY);
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
