class GeoDash {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = GEODASH_CONFIG.SCREEN_WIDTH;
        this.canvas.height = GEODASH_CONFIG.SCREEN_HEIGHT;
        
        // Game state
        this.running = false;
        this.paused = false;
        this.gameOver = false;
        this.score = 0;
        this.startTime = 0;
        
        // Game objects
        this.player = new Player(
            GEODASH_CONFIG.PLAYER_X, 
            GEODASH_CONFIG.SCREEN_HEIGHT - GEODASH_CONFIG.PLAYER_SIZE
        );
        this.obstacles = [];
        
        // Timing
        this.lastTime = 0;
        this.frameCount = 0;
        this.lastObstacleSpawn = 0;
        this.obstacleSpawnInterval = 2000; // milliseconds
        
        // Input handling
        this.keys = {};
        this.setupEventListeners();
        
        // Load background
        this.backgroundImage = new Image();
        this.backgroundImage.src = GEODASH_CONFIG.ASSETS.BACKGROUND;
        this.backgroundLoaded = false;
        this.backgroundImage.onload = () => {
            this.backgroundLoaded = true;
        };
        
        // Audio
        this.backgroundMusic = null;
        this.initAudio();
    }
    
    initAudio() {
        try {
            this.backgroundMusic = new Audio(GEODASH_CONFIG.ASSETS.MUSIC);
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = 0.3;
        } catch (e) {
            console.log('Audio not supported or failed to load');
        }
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.running && !this.paused && !this.gameOver) {
                    this.player.jump();
                }
            }
            
            if (e.code === 'KeyR') {
                e.preventDefault();
                if (this.gameOver) {
                    // Hide the game controls overlay before restarting
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
            
            if (e.code === 'KeyP') {
                e.preventDefault();
                this.togglePause();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Touch support for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.running && !this.paused && !this.gameOver) {
                this.player.jump();
            }
        });
    }
    
    start() {
        if (!this.running) {
            this.running = true;
            this.gameOver = false;
            this.paused = false;
            this.startTime = Date.now();
            this.lastTime = performance.now();
            
            // Start background music
            if (this.backgroundMusic) {
                this.backgroundMusic.play().catch(e => {
                    console.log('Could not play background music:', e);
                });
            }
            
            this.gameLoop();
        }
    }
    
    stop() {
        this.running = false;
        this.gameOver = true;
        
        // Stop background music
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
        }
    }
    
    restart() {
        if (!this.gameOver) return; // Only allow restart when game is actually over
        
        this.score = 0;
        this.obstacles = [];
        this.player = new Player(
            GEODASH_CONFIG.PLAYER_X, 
            GEODASH_CONFIG.SCREEN_HEIGHT - GEODASH_CONFIG.PLAYER_SIZE
        );
        this.lastObstacleSpawn = 0;
        this.gameOver = false;
        this.start();
    }
    
    togglePause() {
        if (!this.running || this.gameOver) return;
        
        this.paused = !this.paused;
        
        if (this.backgroundMusic) {
            if (this.paused) {
                this.backgroundMusic.pause();
            } else {
                this.backgroundMusic.play().catch(e => {
                    console.log('Could not resume background music:', e);
                });
            }
        }
        
        if (!this.paused) {
            this.lastTime = performance.now();
            this.gameLoop();
        }
        
        // Dispatch event to update pause button
        const event = new CustomEvent('gamePauseToggle', { detail: { paused: this.paused } });
        document.dispatchEvent(event);
    }
    
    update(deltaTime) {
        if (this.paused || this.gameOver) return;
        
        // Update player
        this.player.update();
        
        // Spawn obstacles
        const currentTime = Date.now();
        if (currentTime - this.lastObstacleSpawn > this.obstacleSpawnInterval) {
            this.obstacles.push(new Obstacle());
            this.lastObstacleSpawn = currentTime;
            
            // Gradually increase difficulty
            if (this.obstacleSpawnInterval > 1000) {
                this.obstacleSpawnInterval -= 10;
            }
        }
        
        // Update obstacles
        this.obstacles.forEach(obstacle => {
            obstacle.update();
        });
        
        // Remove off-screen obstacles and increase score
        this.obstacles = this.obstacles.filter(obstacle => {
            if (obstacle.isOffScreen()) {
                this.score++;
                return false;
            }
            return true;
        });
        
        // Check collisions
        this.checkCollisions();
    }
    
    checkCollisions() {
        if (this.gameOver) return; // Prevent multiple collision checks when game is already over
        
        const playerBounds = this.player.getBounds();
        
        for (let obstacle of this.obstacles) {
            const obstacleBounds = obstacle.getBounds();
            
            if (this.isColliding(playerBounds, obstacleBounds)) {
                this.stop();
                return;
            }
        }
    }
    
    isColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        if (this.backgroundLoaded) {
            this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = GEODASH_CONFIG.WHITE;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Draw game objects
        this.player.draw(this.ctx);
        
        this.obstacles.forEach(obstacle => {
            obstacle.draw(this.ctx);
        });
        
        // Draw UI
        this.drawUI();
        
        // Draw pause/game over overlay
        if (this.paused) {
            this.drawPauseOverlay();
        } else if (this.gameOver) {
            this.drawGameOverOverlay();
        }
    }
    
    drawUI() {
        this.ctx.fillStyle = GEODASH_CONFIG.BLACK;
        this.ctx.font = '32px Arial';
        this.ctx.fillText(`Score: ${this.score}`, this.canvas.width - 200, 40);
    }
    
    drawPauseOverlay() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = GEODASH_CONFIG.WHITE;
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
        
        this.ctx.fillStyle = GEODASH_CONFIG.WHITE;
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '32px Arial';
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press R to restart', this.canvas.width / 2, this.canvas.height / 2 + 60);
        this.ctx.textAlign = 'left';
    }
    
    gameLoop() {
        if (!this.running) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.draw();
        
        if (!this.paused && !this.gameOver) {
            requestAnimationFrame(() => this.gameLoop());
        }
    }
}

// Global game instance
let geoDashGame = null;

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        geoDashGame = new GeoDash('gameCanvas');
    }
});

// Game control functions
function startGeoDash() {
    if (geoDashGame) {
        geoDashGame.start();
    }
}

function pauseGeoDash() {
    if (geoDashGame) {
        geoDashGame.togglePause();
    }
}

function restartGeoDash() {
    if (geoDashGame) {
        geoDashGame.restart();
    }
}