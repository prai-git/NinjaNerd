class Plane {
    constructor(x, y, color, health = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.health = health;
        this.maxHealth = health;
        this.width = GAME_CONFIG.PLANE_WIDTH;
        this.height = GAME_CONFIG.PLANE_HEIGHT;
        this.lastShot = 0;
        this.shootCooldown = 500;
        this.showHealth = false;
    }
    
    getRect() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
    
    takeDamage(damage = 1) {
        this.health -= damage;
        return this.health <= 0;
    }
    
    draw(ctx) {
        ctx.save();
        
        // Draw main fuselage (rectangle body)
        const fuselageWidth = this.width / 3;
        const fuselageHeight = this.height / 1.5;
        
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - fuselageWidth / 2,
            this.y - fuselageHeight / 2,
            fuselageWidth,
            fuselageHeight
        );
        
        // Draw left wing (triangle)
        ctx.beginPath();
        ctx.moveTo(this.x - fuselageWidth / 2, this.y - fuselageHeight / 4);
        ctx.lineTo(this.x - this.width / 2, this.y);
        ctx.lineTo(this.x - fuselageWidth / 2, this.y + fuselageHeight / 4);
        ctx.closePath();
        ctx.fill();
        
        // Draw right wing (triangle)
        ctx.beginPath();
        ctx.moveTo(this.x + fuselageWidth / 2, this.y - fuselageHeight / 4);
        ctx.lineTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + fuselageWidth / 2, this.y + fuselageHeight / 4);
        ctx.closePath();
        ctx.fill();
        
        // Draw nose (triangle)
        ctx.beginPath();
        ctx.moveTo(this.x - fuselageWidth / 2, this.y - fuselageHeight / 2);
        ctx.lineTo(this.x, this.y - fuselageHeight);
        ctx.lineTo(this.x + fuselageWidth / 2, this.y - fuselageHeight / 2);
        ctx.closePath();
        ctx.fill();
        
        // Draw tail (triangle)
        ctx.beginPath();
        ctx.moveTo(this.x - fuselageWidth / 2, this.y + fuselageHeight / 2);
        ctx.lineTo(this.x, this.y + fuselageHeight);
        ctx.lineTo(this.x + fuselageWidth / 2, this.y + fuselageHeight / 2);
        ctx.closePath();
        ctx.fill();
        
        // Draw cockpit
        const cockpitColor = this.darkenColor(this.color, 50);
        ctx.fillStyle = cockpitColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y - fuselageHeight / 4, fuselageWidth / 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw health bar if needed
        if (this.showHealth && this.health < this.maxHealth) {
            this.drawHealthBar(ctx);
        }
        
        ctx.restore();
    }
    
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - amount);
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - amount);
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - amount);
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    drawHealthBar(ctx) {
        const barWidth = 40;
        const barHeight = 6;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.height / 2 - 15;
        
        // Background
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health
        const healthWidth = (this.health / this.maxHealth) * barWidth;
        if (healthWidth > 0) {
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(barX, barY, healthWidth, barHeight);
        }
    }
}

class PlayerPlane extends Plane {
    constructor(x, y) {
        super(x, y, GAME_CONFIG.COLORS.PLAYER, GAME_CONFIG.PLAYER_MAX_HEALTH);
        this.speed = GAME_CONFIG.PLAYER_SPEED;
        this.shootCooldown = GAME_CONFIG.PLAYER_SHOOT_COOLDOWN;
        this.invulnerable = false;
        this.invulnerableTime = 0;
    }
    
    update(keys) {
        let dx = 0, dy = 0;
        
        // Movement with arrow keys
        if (keys['ArrowLeft']) dx -= this.speed;
        if (keys['ArrowRight']) dx += this.speed;
        if (keys['ArrowUp']) dy -= this.speed;
        if (keys['ArrowDown']) dy += this.speed;
        
        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }
        
        // Update position with screen boundaries
        this.x = Math.max(this.width / 2, Math.min(GAME_CONFIG.SCREEN_WIDTH - this.width / 2, this.x + dx));
        this.y = Math.max(this.height / 2, Math.min(GAME_CONFIG.SCREEN_HEIGHT - this.height / 2, this.y + dy));
        
        // Handle invulnerability frames
        if (this.invulnerable) {
            this.invulnerableTime--;
            if (this.invulnerableTime <= 0) {
                this.invulnerable = false;
            }
        }
    }
    
    shoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShot > this.shootCooldown) {
            this.lastShot = currentTime;
            return new Laser(
                this.x, 
                this.y - this.height / 2, 
                -GAME_CONFIG.LASER_SPEED, 
                GAME_CONFIG.COLORS.PLAYER_LASER
            );
        }
        return null;
    }
    
    takeDamage(damage = 1) {
        if (!this.invulnerable) {
            this.health -= damage;
            this.invulnerable = true;
            this.invulnerableTime = 120; // 2 seconds at 60 FPS
            return this.health <= 0;
        }
        return false;
    }
    
    draw(ctx) {
        if (this.invulnerable && Math.floor(this.invulnerableTime / 5) % 2) {
            ctx.globalAlpha = 0.5;
        }
        
        super.draw(ctx);
        ctx.globalAlpha = 1.0;
        
        // Draw health bar for player
        this.drawPlayerHealthBar(ctx);
    }
    
    drawPlayerHealthBar(ctx) {
        const barWidth = 60;
        const barHeight = 8;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.height / 2 - 20;
        
        // Background
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health
        ctx.fillStyle = '#00FF00';
        const healthWidth = (this.health / this.maxHealth) * barWidth;
        ctx.fillRect(barX, barY, healthWidth, barHeight);
        
        // Border
        ctx.strokeStyle = GAME_CONFIG.COLORS.BLACK;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
}

class EnemyPlane extends Plane {
    constructor(x, y) {
        super(x, y, GAME_CONFIG.COLORS.ENEMY, GAME_CONFIG.ENEMY_HEALTH);
        this.speed = GAME_CONFIG.ENEMY_SPEED;
        this.showHealth = true;
        this.directionX = Math.random() > 0.5 ? 1 : -1;
        this.directionY = 1;
        this.changeDirectionTimer = 0;
        this.shootCooldown = GAME_CONFIG.ENEMY_SHOOT_COOLDOWN;
    }
    
    update() {
        // Change direction occasionally for evasive maneuvers
        this.changeDirectionTimer++;
        if (this.changeDirectionTimer > 60 + Math.random() * 60) {
            this.directionX = Math.random() > 0.33 ? (Math.random() > 0.5 ? 1 : -1) : 0;
            this.changeDirectionTimer = 0;
        }
        
        // Move down and sideways
        this.x += this.directionX * this.speed * 0.5;
        this.y += this.directionY * this.speed;
        
        // Keep within screen bounds (horizontally)
        if (this.x <= this.width / 2) {
            this.directionX = 1;
        } else if (this.x >= GAME_CONFIG.SCREEN_WIDTH - this.width / 2) {
            this.directionX = -1;
        }
    }
    
    shoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShot > this.shootCooldown) {
            this.lastShot = currentTime;
            return new Laser(
                this.x, 
                this.y + this.height / 2, 
                GAME_CONFIG.ENEMY_LASER_SPEED, 
                GAME_CONFIG.COLORS.ENEMY_LASER
            );
        }
        return null;
    }
    
    isOffScreen() {
        return this.y > GAME_CONFIG.SCREEN_HEIGHT + 50;
    }
}

class BossPlane extends Plane {
    constructor(x, y) {
        super(x, y, GAME_CONFIG.COLORS.BOSS, GAME_CONFIG.BOSS_HEALTH);
        this.width = GAME_CONFIG.BOSS_WIDTH;
        this.height = GAME_CONFIG.BOSS_HEIGHT;
        this.speed = GAME_CONFIG.BOSS_SPEED;
        this.showHealth = true;
        this.directionX = Math.random() > 0.5 ? 1 : -1;
        this.directionY = 0;
        this.changeDirectionTimer = 0;
        this.shootCooldown = GAME_CONFIG.BOSS_SHOOT_COOLDOWN;
        this.shootPattern = 0;
    }
    
    update() {
        // Change direction occasionally for evasive maneuvers
        this.changeDirectionTimer++;
        if (this.changeDirectionTimer > 30 + Math.random() * 60) {
            this.directionX = Math.random() > 0.33 ? (Math.random() > 0.5 ? 1 : -1) : 0;
            this.directionY = Math.random() > 0.66 ? (Math.random() > 0.5 ? 0.5 : -0.5) : 0;
            this.changeDirectionTimer = 0;
        }
        
        // Move sideways and occasionally up/down
        this.x += this.directionX * this.speed;
        this.y += this.directionY * this.speed;
        
        // Keep within screen bounds (horizontally)
        if (this.x <= this.width / 2) {
            this.directionX = 1;
        } else if (this.x >= GAME_CONFIG.SCREEN_WIDTH - this.width / 2) {
            this.directionX = -1;
        }
        
        // Keep within the top portion of the screen (vertically)
        if (this.y <= this.height) {
            this.directionY = 0.5;
        } else if (this.y >= GAME_CONFIG.SCREEN_HEIGHT / 3) {
            this.directionY = -0.5;
        }
    }
    
    shoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShot > this.shootCooldown) {
            this.lastShot = currentTime;
            
            const lasers = [];
            this.shootPattern = (this.shootPattern + 1) % 3;
            
            if (this.shootPattern === 0) {
                // Single shot
                lasers.push(new Laser(
                    this.x, 
                    this.y + this.height / 2, 
                    GAME_CONFIG.BOSS_LASER_SPEED, 
                    GAME_CONFIG.COLORS.ENEMY_LASER,
                    GAME_CONFIG.BOSS_LASER_DAMAGE
                ));
            } else if (this.shootPattern === 1) {
                // Triple shot
                for (let i = -1; i <= 1; i++) {
                    lasers.push(new Laser(
                        this.x + i * 30, 
                        this.y + this.height / 2, 
                        GAME_CONFIG.BOSS_LASER_SPEED, 
                        GAME_CONFIG.COLORS.ENEMY_LASER,
                        GAME_CONFIG.BOSS_LASER_DAMAGE
                    ));
                }
            } else {
                // Spread shot
                for (let i = -2; i <= 2; i++) {
                    const angle = i * 0.2;
                    lasers.push(new Laser(
                        this.x, 
                        this.y + this.height / 2, 
                        GAME_CONFIG.BOSS_LASER_SPEED, 
                        GAME_CONFIG.COLORS.ENEMY_LASER,
                        GAME_CONFIG.BOSS_LASER_DAMAGE,
                        angle
                    ));
                }
            }
            
            return lasers;
        }
        return null;
    }
    
    draw(ctx) {
        super.draw(ctx);
        
        // Add extra details for boss plane
        ctx.fillStyle = GAME_CONFIG.COLORS.BLACK;
        ctx.beginPath();
        ctx.arc(this.x - this.width / 2, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw enhanced health bar for boss
        this.drawBossHealthBar(ctx);
    }
    
    drawBossHealthBar(ctx) {
        const barWidth = 80;
        const barHeight = 10;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.height / 2 - 25;
        
        // Background
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health
        ctx.fillStyle = '#00FF00';
        const healthWidth = (this.health / this.maxHealth) * barWidth;
        ctx.fillRect(barX, barY, healthWidth, barHeight);
        
        // Border
        ctx.strokeStyle = GAME_CONFIG.COLORS.BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Boss label
        ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', this.x, barY - 5);
        ctx.textAlign = 'left';
    }
}