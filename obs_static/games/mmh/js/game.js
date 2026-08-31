// Main game class for Motorcycle Mayhem
class MotorcycleMayhem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        // Set canvas to game dimensions
        this.canvas.width = MMH_CONFIG.SCREEN_WIDTH;
        this.canvas.height = MMH_CONFIG.SCREEN_HEIGHT;
        
        // Game state
        this.running = false;
        this.paused = false;
        this.gameOver = false;
        this.score = 0;
        this.highScore = 0;
        this.restartGracePeriod = 0;
        
        // Game objects
        this.player = null;
        this.road = null;
        
        // Timing
        this.lastTime = 0;
        this.frameCount = 0;
        this.lastObstacleFrame = 0;
        
        // Input handling
        this.keys = {};
        
        // Store event listener references for cleanup
        this.keydownHandler = null;
        this.keyupHandler = null;
        this.touchstartHandler = null;
        this.touchendHandler = null;
        
        this.setupEventListeners();
        
        // Audio
        this.initAudio();
    }
    
    initAudio() {
        try {
            this.backgroundMusic = new Audio(MMH_CONFIG.ASSETS.MUSIC);
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = 0.3;
        } catch (e) {
            console.log('Audio not available:', e);
        }
    }
    
    setupEventListeners() {
        // Store handler references so we can remove them later
        this.keydownHandler = (e) => {
            this.keys[e.key] = true;
            
            // Prevent spacebar from scrolling the page
            if (e.code === 'Space') {
                e.preventDefault();
            }
            
            if (e.code === 'KeyP') {
                e.preventDefault();
                if (this.running && !this.gameOver) {
                    this.togglePause();
                }
            }
            
            if (e.code === 'KeyR') {
                e.preventDefault();
                if (this.gameOver) {
                    const gameControls = document.getElementById('gameControls');
                    if (gameControls) {
                        gameControls.style.display = 'none';
                    }
                    const restartBtn = document.getElementById('restartBtn');
                    if (restartBtn) {
                        restartBtn.style.display = 'inline-block';
                    }
                    this.restart();
                }
            }
        };
        
        this.keyupHandler = (e) => {
            this.keys[e.key] = false;
        };
        
        // Touch controls for mobile
        this.touchstartHandler = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            
            if (x < this.canvas.width / 2) {
                this.keys['ArrowLeft'] = true;
            } else {
                this.keys['ArrowRight'] = true;
            }
            this.keys[' '] = true; // Auto accelerate on mobile
        };
        
        this.touchendHandler = (e) => {
            e.preventDefault();
            this.keys['ArrowLeft'] = false;
            this.keys['ArrowRight'] = false;
            this.keys[' '] = false;
        };
        
        // Add event listeners
        document.addEventListener('keydown', this.keydownHandler);
        document.addEventListener('keyup', this.keyupHandler);
        this.canvas.addEventListener('touchstart', this.touchstartHandler);
        this.canvas.addEventListener('touchend', this.touchendHandler);
    }
    
    start() {
        if (this.running) return;
        
        // Clear all keys first to prevent any stuck inputs
        this.keys = {};
        
        // Initialize game objects
        Obstacle.clearAll();
        this.player = new Player(
            MMH_CONFIG.SCREEN_WIDTH / 2 - MMH_CONFIG.PLAYER_WIDTH / 2,
            MMH_CONFIG.PLAYER_START_Y
        );
        this.road = new Road();
        
        // Force player speed to 0 to prevent any carryover
        this.player.speedY = 0;
        this.player.speedX = 0;
        
        // Reset game state
        this.score = 0;
        this.frameCount = 0;
        this.lastObstacleFrame = 0;
        this.paused = false;
        this.gameOver = false;
        
        // Start music
        if (this.backgroundMusic) {
            this.backgroundMusic.play().catch(e => console.log('Music play failed:', e));
        }
        
        // Hide game controls overlay
        const gameControls = document.getElementById('gameControls');
        if (gameControls) {
            gameControls.style.display = 'none';
        }
        
        // Show restart button
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.style.display = 'inline-block';
        }
        
        // Clear keys one more time right before starting
        this.keys = {};
        
        // Set restart grace period (30 frames = 0.5 seconds at 60fps)
        this.restartGracePeriod = 30;
        
        // Set running flag and start game loop
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    stop() {
        this.running = false;
        this.gameOver = true;
        
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
        }
    }
    
    restart() {
        if (!this.gameOver) return; // Only allow restart when game is actually over
        
        this.score = 0;
        this.frameCount = 0;
        this.lastObstacleFrame = 0;
        
        // Clear obstacles
        Obstacle.clearAll();
        
        // Reset player
        this.player = new Player(
            MMH_CONFIG.SCREEN_WIDTH / 2 - MMH_CONFIG.PLAYER_WIDTH / 2,
            MMH_CONFIG.PLAYER_START_Y
        );
        this.road = new Road();
        
        // Clear keys
        this.keys = {};
        
        this.gameOver = false;
        this.start();
    }
    
    togglePause() {
        this.paused = !this.paused;
        if (this.backgroundMusic) {
            if (this.paused) {
                this.backgroundMusic.pause();
            } else {
                this.backgroundMusic.play().catch(e => console.log('Music play failed:', e));
            }
        }
    }
    
    spawnObstacle() {
        // Check if enough time has passed since last obstacle
        if (this.frameCount - this.lastObstacleFrame < MMH_CONFIG.OBSTACLE_SPAWN_RATE) {
            return;
        }
        
        // Check if there's enough space
        if (Obstacle.instances.length > 0) {
            const closest = Obstacle.instances.reduce((min, obs) => 
                obs.y < min.y ? obs : min
            );
            if (closest.y < MMH_CONFIG.OBSTACLE_MIN_GAP) {
                return;
            }
        }
        
        // Random position selection across entire road width
        const roadX = (MMH_CONFIG.SCREEN_WIDTH - MMH_CONFIG.ROAD_WIDTH) / 2;
        // Spawn vehicles anywhere on the road, including on lane markers
        const minX = roadX + 10;
        const maxX = roadX + MMH_CONFIG.ROAD_WIDTH - MMH_CONFIG.OBSTACLE_WIDTH - 10;
        const x = minX + Math.random() * (maxX - minX);
        const y = -150;
        
        // Random obstacle type
        const obstacleTypes = [
            { name: 'CAR1', speedMult: 1.0 },
            { name: 'CAR2', speedMult: 1.2 },
            { name: 'BUS', speedMult: 0.8 }
        ];
        
        const selected = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
        const speed = (MMH_CONFIG.OBSTACLE_MIN_SPEED + 
                      Math.random() * (MMH_CONFIG.OBSTACLE_MAX_SPEED - MMH_CONFIG.OBSTACLE_MIN_SPEED)) 
                      * selected.speedMult;
        
        new Obstacle(x, y, selected.name, speed);
        this.lastObstacleFrame = this.frameCount;
    }
    
    update(deltaTime) {
        if (this.paused || this.gameOver) return;
        
        // Decrement grace period counter
        if (this.restartGracePeriod > 0) {
            this.restartGracePeriod--;
        }
        
        // Create a copy of keys, but block spacebar during grace period
        const effectiveKeys = {...this.keys};
        if (this.restartGracePeriod > 0) {
            effectiveKeys[' '] = false;
        }
        
        // Update player with effective keys
        this.player.update(effectiveKeys);
        
        // Get player speed multiplier
        const speedMult = this.player.getSpeedMultiplier();
        
        // Update road
        this.road.update(speedMult);
        
        // Update obstacles
        for (const obstacle of Obstacle.instances) {
            obstacle.update(speedMult);
            
            // Check collision
            if (obstacle.collidesWith(this.player)) {
                this.endGame();
                return;
            }
        }
        
        // Remove off-screen obstacles
        Obstacle.removeOffScreen();
        
        // Spawn new obstacles
        this.spawnObstacle();
        
        // Update score
        this.frameCount++;
        if (this.frameCount % MMH_CONFIG.FPS === 0) { // Every second
            this.score += MMH_CONFIG.SCORE_PER_SECOND;
        }
        
        // Increase score while moving
        if (this.player.speedY > 0) {
            this.score += MMH_CONFIG.SCORE_INCREMENT;
        }
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = MMH_CONFIG.BLACK;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw road
        this.road.draw(this.ctx);
        
        // Draw obstacles
        for (const obstacle of Obstacle.instances) {
            obstacle.draw(this.ctx);
        }
        
        // Draw player
        this.player.draw(this.ctx);
        
        // Draw HUD
        this.drawHUD();
        
        // Draw pause overlay if paused
        if (this.paused) {
            this.drawPauseOverlay();
        }
        
        // Draw game over overlay if game over
        if (this.gameOver) {
            this.drawGameOverOverlay();
        }
    }
    
    drawHUD() {
        // Score
        this.ctx.fillStyle = MMH_CONFIG.WHITE;
        this.ctx.font = '32px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 20, 40);
        
        // Speed indicator
        const speedPercent = Math.floor((this.player.speedY / MMH_CONFIG.PLAYER_MAX_SPEED) * 100);
        let speedColor = MMH_CONFIG.GREEN;
        if (speedPercent >= 80) speedColor = MMH_CONFIG.RED;
        else if (speedPercent >= 50) speedColor = MMH_CONFIG.YELLOW;
        
        this.ctx.fillStyle = speedColor;
        this.ctx.fillText(`Speed: ${speedPercent}%`, this.canvas.width - 220, 40);
        
        // Speed bar
        const barWidth = 150;
        const barHeight = 20;
        const barX = this.canvas.width - 220;
        const barY = 60;
        
        // Background
        this.ctx.fillStyle = MMH_CONFIG.DARK_GRAY;
        this.ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Fill
        const fillWidth = Math.floor(barWidth * (this.player.speedY / MMH_CONFIG.PLAYER_MAX_SPEED));
        this.ctx.fillStyle = speedColor;
        this.ctx.fillRect(barX, barY, fillWidth, barHeight);
        
        // Border
        this.ctx.strokeStyle = MMH_CONFIG.WHITE;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
    
    drawPauseOverlay() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = MMH_CONFIG.WHITE;
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press P to resume', this.canvas.width / 2, this.canvas.height / 2 + 60);
        this.ctx.textAlign = 'left';
    }
    
    drawGameOverOverlay() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = MMH_CONFIG.RED;
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 60);
        
        this.ctx.fillStyle = MMH_CONFIG.WHITE;
        this.ctx.font = '32px Arial';
        this.ctx.fillText(`Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        
        this.ctx.fillStyle = MMH_CONFIG.YELLOW;
        this.ctx.fillText(`High Score: ${this.highScore}`, this.canvas.width / 2, this.canvas.height / 2 + 40);
        
        this.ctx.fillStyle = MMH_CONFIG.WHITE;
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press R to restart', this.canvas.width / 2, this.canvas.height / 2 + 100);
        this.ctx.textAlign = 'left';
    }
    
    endGame() {
        this.gameOver = true;
        if (this.score > this.highScore) {
            this.highScore = this.score;
        }
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
        }
    }
    
    gameLoop(currentTime) {
        if (!this.running) return;
        
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
}


