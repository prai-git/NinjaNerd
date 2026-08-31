// Main Tank Attack Game class
class TankAttack {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = TANK_GAME_CONFIG.SCREEN_WIDTH;
        this.canvas.height = TANK_GAME_CONFIG.SCREEN_HEIGHT;
        
        // Game state
        this.running = false;
        this.paused = false;
        this.gameOver = false;
        
        // Game objects
        this.blueDot = new BlueDot(TANK_GAME_CONFIG.BLUE_DOT_X_POSITION, TANK_GAME_CONFIG.SCREEN_HEIGHT / 2);
        this.tanks = [];
        this.powerBoosts = [];
        
        // Initialize tanks
        this.initTanks();
        
        // Timing
        this.lastPowerBoostSpawn = 0;
        this.frameCount = 0;
        
        // Input handling
        this.keys = {};
        this.setupEventListeners();
        
        // Game loop
        this.gameLoop = this.gameLoop.bind(this);
        
        // Audio for background music
        this.backgroundMusic = null;
        this.initAudio();
    }
    
    initAudio() {
        try {
            // Initialize background music
            this.backgroundMusic = new Audio('static/games/tank_attack/assets/KKing_Remix.wav');
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = 0.3; // Set volume to 30%
        } catch (e) {
            console.log('Audio initialization failed:', e);
        }
    }
    
    initTanks() {
        for (const yPos of TANK_GAME_CONFIG.TANK_POSITIONS) {
            this.tanks.push(new Tank(TANK_GAME_CONFIG.TANK_X_POSITION, yPos));
        }
    }
    
    setupEventListeners() {
        // Keyboard event listeners
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Prevent default behavior for game keys
            if (['ArrowUp', 'ArrowDown', 'Space', 'KeyF', 'KeyP'].includes(e.code)) {
                e.preventDefault();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Additional safeguards for input handling
        window.addEventListener('blur', () => {
            // Clear all keys when window loses focus to prevent stuck keys
            this.keys = {};
        });
        
        window.addEventListener('focus', () => {
            // Clear all keys when window gains focus to prevent stuck keys
            this.keys = {};
        });
    }
    
    start() {
        if (!this.running) {
            this.running = true;
            this.gameOver = false;
            this.paused = false;
            this.frameCount = 0;
            this.lastPowerBoostSpawn = Date.now();
            
            // Clear any stuck keys from previous session
            this.keys = {};
            
            // Reset game objects
            this.blueDot = new BlueDot(TANK_GAME_CONFIG.BLUE_DOT_X_POSITION, TANK_GAME_CONFIG.SCREEN_HEIGHT / 2);
            this.tanks = [];
            this.powerBoosts = [];
            this.initTanks();
            
            // Start background music
            if (this.backgroundMusic) {
                this.backgroundMusic.currentTime = 0;
                this.backgroundMusic.play().catch(e => console.log('Music play failed:', e));
            }
            
            requestAnimationFrame(this.gameLoop);
        }
    }
    
    stop() {
        this.running = false;
        this.gameOver = true;
        
        // Stop background music
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
        }
    }
    
    pause() {
        this.paused = !this.paused;
        
        // Pause/resume background music
        if (this.backgroundMusic) {
            if (this.paused) {
                this.backgroundMusic.pause();
            } else {
                this.backgroundMusic.play().catch(e => console.log('Music resume failed:', e));
            }
        }
        
        // Dispatch event to update pause button
        const event = new CustomEvent('gamePauseToggle', { detail: { paused: this.paused } });
        document.dispatchEvent(event);
    }
    
    handleInput() {
        // Validate keys object exists and has valid state
        if (!this.keys || typeof this.keys !== 'object') {
            this.keys = {};
            return;
        }
        
        // Safeguard: Only handle other inputs if game is running and not paused
        if (!this.running || this.paused || this.gameOver) {
            return;
        }
        
        if (this.keys['ArrowUp'] === true) {
            this.blueDot.move('up');
        }
        if (this.keys['ArrowDown'] === true) {
            this.blueDot.move('down');
        }
        if (this.keys['Space'] === true) {
            this.blueDot.shootLaser();
        }
        if (this.keys['KeyF'] === true) {
            this.blueDot.shootFireball();
        }
    }
    
    update() {
        if (this.paused || this.gameOver) return;
        
        // Handle input
        this.handleInput();
        
        // Update game objects
        this.blueDot.update();
        
        // Update tanks and make them shoot
        for (const tank of this.tanks) {
            if (tank.health > 0) {
                tank.shootLaser(this.blueDot);
                tank.update();
            }
        }
        
        // Spawn power boosts every 2 seconds
        const currentTime = Date.now();
        if (currentTime - this.lastPowerBoostSpawn >= TANK_GAME_CONFIG.POWER_BOOST_SPAWN_INTERVAL) {
            this.powerBoosts.push(new PowerBoost());
            this.lastPowerBoostSpawn = currentTime;
        }
        
        // Check collisions
        this.checkCollisions();
        
        // Check game over conditions
        if (this.blueDot.health <= 0) {
            this.gameOver = true;
            this.running = false;
        }
        
        // Check if all tanks are destroyed
        const aliveTanks = this.tanks.filter(tank => tank.health > 0);
        if (aliveTanks.length === 0) {
            this.gameOver = true;
            this.running = false;
        }
        
        this.frameCount++;
    }
    
    checkCollisions() {
        // BlueDot lasers vs Tanks
        for (let i = this.blueDot.lasers.length - 1; i >= 0; i--) {
            const laser = this.blueDot.lasers[i];
            for (const tank of this.tanks) {
                if (tank.health > 0 && this.checkCollision(laser, tank.getBounds())) {
                    tank.health -= TANK_GAME_CONFIG.LASER_DAMAGE;
                    this.blueDot.lasers.splice(i, 1);
                    break;
                }
            }
        }
        
        // BlueDot lasers vs PowerBoosts
        for (let i = this.blueDot.lasers.length - 1; i >= 0; i--) {
            const laser = this.blueDot.lasers[i];
            for (let j = this.powerBoosts.length - 1; j >= 0; j--) {
                const powerBoost = this.powerBoosts[j];
                if (this.checkCollision(laser, powerBoost.getBounds())) {
                    this.blueDot.powerBoostsHit++;
                    this.powerBoosts.splice(j, 1);
                    this.blueDot.lasers.splice(i, 1);
                    break;
                }
            }
        }
        
        // Fireball vs Tanks
        if (this.blueDot.fireball) {
            for (const tank of this.tanks) {
                if (tank.health > 0 && this.checkCollision(this.blueDot.fireball, tank.getBounds())) {
                    tank.health -= TANK_GAME_CONFIG.FIREBALL_DAMAGE;
                    this.blueDot.fireball = null;
                    break;
                }
            }
        }
        
        // Tank lasers vs BlueDot
        for (const tank of this.tanks) {
            for (let i = tank.lasers.length - 1; i >= 0; i--) {
                const laser = tank.lasers[i];
                if (this.checkCollision(laser, this.blueDot.getBounds())) {
                    this.blueDot.health -= TANK_GAME_CONFIG.LASER_DAMAGE;
                    tank.lasers.splice(i, 1);
                }
            }
        }
    }
    
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = TANK_GAME_CONFIG.COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw game objects
        this.blueDot.draw(this.ctx);
        
        for (const tank of this.tanks) {
            if (tank.health > 0) {
                tank.draw(this.ctx);
            }
        }
        
        for (const powerBoost of this.powerBoosts) {
            powerBoost.draw(this.ctx);
        }
        
        // Draw UI
        this.drawUI();
        
        // Draw pause overlay
        if (this.paused) {
            this.drawPauseOverlay();
        }
        
        // Draw game over overlay
        if (this.gameOver) {
            this.drawGameOverOverlay();
        }
    }
    
    drawUI() {
        const ctx = this.ctx;
        
        // Draw power boosts counter
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.BLACK;
        ctx.font = '24px Arial';
        ctx.fillText(`Power Boosts Hit: ${this.blueDot.powerBoostsHit}`, 20, 40);
        
        // Draw tanks remaining
        const aliveTanks = this.tanks.filter(tank => tank.health > 0).length;
        ctx.fillText(`Tanks Remaining: ${aliveTanks}`, 20, 80);
    }
    
    drawPauseOverlay() {
        const ctx = this.ctx;
        
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Pause text
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.WHITE;
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        ctx.font = '24px Arial';
        ctx.fillText('Press P to resume', this.canvas.width / 2, this.canvas.height / 2 + 50);
        ctx.textAlign = 'start';
    }
    
    drawGameOverOverlay() {
        const ctx = this.ctx;
        
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Game over text
        ctx.fillStyle = TANK_GAME_CONFIG.COLORS.WHITE;
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        
        if (this.blueDot.health <= 0) {
            ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2);
            ctx.font = '24px Arial';
            ctx.fillText('You were defeated!', this.canvas.width / 2, this.canvas.height / 2 + 50);
        } else {
            ctx.fillText('VICTORY!', this.canvas.width / 2, this.canvas.height / 2);
            ctx.font = '24px Arial';
            ctx.fillText('All tanks destroyed!', this.canvas.width / 2, this.canvas.height / 2 + 50);
        }
        
        ctx.fillText('Click Restart to play again', this.canvas.width / 2, this.canvas.height / 2 + 100);
        ctx.textAlign = 'start';
    }
    
    gameLoop() {
        if (this.running) {
            // Always check for pause key, even when paused
            this.handlePauseInput();
            
            this.update();
            this.draw();
            requestAnimationFrame(this.gameLoop);
        }
    }
    
    handlePauseInput() {
        // Validate keys object exists and has valid state
        if (!this.keys || typeof this.keys !== 'object') {
            return;
        }
        
        // Handle pause key regardless of game state
        if (this.keys['KeyP'] === true) {
            this.pause();
            this.keys['KeyP'] = false; // Prevent multiple toggles
        }
    }
}
