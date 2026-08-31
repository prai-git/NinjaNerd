class TejasThrust {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = GAME_CONFIG.SCREEN_WIDTH;
        this.canvas.height = GAME_CONFIG.SCREEN_HEIGHT;
        
        // Game state
        this.running = false;
        this.paused = false;
        this.gameOver = false;
        this.score = 0;
        this.playerHealth = GAME_CONFIG.PLAYER_MAX_HEALTH;
        this.enemiesKilled = 0;
        this.bossActive = false;
        this.startTime = 0;
        
        // Game objects
        this.player = new PlayerPlane(GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT - 100);
        this.enemies = [];
        this.boss = null;
        this.playerLasers = [];
        this.enemyLasers = [];
        this.clouds = [];
        
        // Timing
        this.lastEnemySpawn = 0;
        this.lastTime = 0;
        this.frameCount = 0;
        
        // Input handling
        this.keys = {};
        this.setupEventListeners();
        
        // Initialize clouds
        this.initClouds();
        
        // Audio context for sound effects
        this.audioContext = null;
        this.initAudio();
    }
    
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }
    
    playSound(frequency, duration, type = 'sine') {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP'].includes(e.code)) {
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.paused && !this.gameOver) {
                this.shoot();
            }
            if (e.code === 'KeyP') {
                this.togglePause();
            }
        });
        
        // Auto-pause when tab loses focus
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.running && !this.gameOver) {
                this.paused = true;
                this.dispatchPauseEvent();
            }
        });
    }
    
    initClouds() {
        this.clouds = [];
        for (let i = 0; i < 8; i++) {
            this.clouds.push(new Cloud(
                Math.random() * GAME_CONFIG.SCREEN_WIDTH,
                Math.random() * GAME_CONFIG.SCREEN_HEIGHT / 2,
                50 + Math.random() * 100,
                0.2 + Math.random() * 0.6
            ));
        }
    }
    
    start() {
        this.running = true;
        this.startTime = Date.now();
        this.gameLoop();
    }
    
    stop() {
        this.running = false;
    }
    
    restart() {
        this.gameOver = false;
        this.paused = false;
        this.score = 0;
        this.playerHealth = GAME_CONFIG.PLAYER_MAX_HEALTH;
        this.enemiesKilled = 0;
        this.bossActive = false;
        
        this.player = new PlayerPlane(GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT - 100);
        this.enemies = [];
        this.boss = null;
        this.playerLasers = [];
        this.enemyLasers = [];
        
        this.lastEnemySpawn = 0;
        this.frameCount = 0;
        
        this.initClouds();
        this.start();
    }
    
    togglePause() {
        if (!this.gameOver) {
            this.paused = !this.paused;
            this.dispatchPauseEvent();
        }
    }
    
    dispatchPauseEvent() {
        const event = new CustomEvent('gamePauseToggle', { detail: { paused: this.paused } });
        document.dispatchEvent(event);
    }
    
    shoot() {
        const laser = this.player.shoot();
        if (laser) {
            this.playerLasers.push(laser);
            this.playSound(800, 0.1, 'square');
        }
    }
    
    spawnEnemy(currentTime) {
        // Boss spawning logic
        if (this.enemiesKilled > 0 && this.enemiesKilled % GAME_CONFIG.BOSS_SPAWN_COUNT === 0 && !this.bossActive) {
            this.boss = new BossPlane(GAME_CONFIG.SCREEN_WIDTH / 2, 100);
            this.bossActive = true;
            this.playSound(200, 1.0, 'sawtooth');
            return;
        }
        
        // Regular enemy spawning
        if (currentTime - this.lastEnemySpawn > GAME_CONFIG.ENEMY_SPAWN_INTERVAL && !this.bossActive) {
            const x = 50 + Math.random() * (GAME_CONFIG.SCREEN_WIDTH - 100);
            const y = -100 - Math.random() * 50;
            this.enemies.push(new EnemyPlane(x, y));
            this.lastEnemySpawn = currentTime;
        }
    }
    
    update(deltaTime) {
        if (this.paused || this.gameOver) return;
        
        this.frameCount++;
        
        // Update player
        this.player.update(this.keys);
        
        // Spawn enemies
        this.spawnEnemy(Date.now());
        
        // Update enemies
        this.enemies = this.enemies.filter(enemy => {
            enemy.update();
            
            // Enemy shooting
            if (Math.random() < GAME_CONFIG.ENEMY_SHOOT_CHANCE) {
                const laser = enemy.shoot();
                if (laser) this.enemyLasers.push(laser);
            }
            
            return !enemy.isOffScreen();
        });
        
        // Update boss
        if (this.bossActive && this.boss) {
            this.boss.update();
            if (Math.random() < GAME_CONFIG.BOSS_SHOOT_CHANCE) {
                const lasers = this.boss.shoot();
                if (lasers) {
                    if (Array.isArray(lasers)) {
                        this.enemyLasers.push(...lasers);
                    } else {
                        this.enemyLasers.push(lasers);
                    }
                }
            }
        }
        
        // Update lasers
        this.playerLasers = this.playerLasers.filter(laser => {
            laser.update();
            return !laser.isOffScreen();
        });
        
        this.enemyLasers = this.enemyLasers.filter(laser => {
            laser.update();
            return !laser.isOffScreen();
        });
        
        // Update clouds
        this.clouds.forEach(cloud => cloud.update());
        
        // Check collisions
        this.checkCollisions();
        
        // Update player health
        this.playerHealth = this.player.health;
        
        // Check game over
        if (this.playerHealth <= 0 && !this.gameOver) {
            this.gameOver = true;
            this.playSound(150, 2.0, 'sawtooth');
            this.dispatchGameOverEvent();
        }
    }
    
    checkCollisions() {
        // Player lasers hit enemies
        for (let i = this.playerLasers.length - 1; i >= 0; i--) {
            const laser = this.playerLasers[i];
            const laserRect = laser.getRect();
            
            // Check regular enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const enemyRect = enemy.getRect();
                
                if (this.checkRectCollision(laserRect, enemyRect)) {
                    this.playerLasers.splice(i, 1);
                    
                    if (enemy.takeDamage()) {
                        this.enemies.splice(j, 1);
                        this.score += 10;
                        this.enemiesKilled += 1;
                        this.playSound(600, 0.2, 'triangle');
                    }
                    break;
                }
            }
            
            // Check boss
            if (this.bossActive && this.boss && i < this.playerLasers.length) {
                const bossRect = this.boss.getRect();
                
                if (this.checkRectCollision(laserRect, bossRect)) {
                    this.playerLasers.splice(i, 1);
                    
                    if (this.boss.takeDamage()) {
                        this.boss = null;
                        this.bossActive = false;
                        this.score += 100;
                        this.enemiesKilled += 1;
                        this.playSound(300, 1.5, 'triangle');
                    } else {
                        this.playSound(500, 0.1, 'triangle');
                    }
                }
            }
        }
        
        // Enemy lasers hit player
        for (let i = this.enemyLasers.length - 1; i >= 0; i--) {
            const laser = this.enemyLasers[i];
            const laserRect = laser.getRect();
            const playerRect = this.player.getRect();
            
            if (this.checkRectCollision(laserRect, playerRect)) {
                this.enemyLasers.splice(i, 1);
                
                if (this.player.takeDamage(laser.damage)) {
                    this.playSound(200, 0.5, 'sawtooth');
                }
            }
        }
        
        // Enemy planes hit player
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const enemyRect = enemy.getRect();
            const playerRect = this.player.getRect();
            
            if (this.checkRectCollision(enemyRect, playerRect)) {
                this.enemies.splice(i, 1);
                
                if (this.player.takeDamage(3)) {
                    this.playSound(200, 0.5, 'sawtooth');
                }
                break;
            }
        }
    }
    
    checkRectCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    draw() {
        // Clear canvas with sky gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, GAME_CONFIG.SCREEN_HEIGHT);
        gradient.addColorStop(0, GAME_CONFIG.COLORS.SKY);
        gradient.addColorStop(1, '#B0E0E6');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, GAME_CONFIG.SCREEN_WIDTH, GAME_CONFIG.SCREEN_HEIGHT);
        
        // Draw clouds
        this.clouds.forEach(cloud => cloud.draw(this.ctx));
        
        // Draw player
        this.player.draw(this.ctx);
        
        // Draw enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        
        // Draw boss
        if (this.bossActive && this.boss) {
            this.boss.draw(this.ctx);
        }
        
        // Draw lasers
        this.playerLasers.forEach(laser => laser.draw(this.ctx));
        this.enemyLasers.forEach(laser => laser.draw(this.ctx));
        
        // Draw UI
        this.drawUI();
        
        // Draw overlays
        if (this.paused) {
            this.drawPauseOverlay();
        }
        
        if (this.gameOver) {
            this.drawGameOverOverlay();
        }
    }
    
    drawUI() {
        // UI background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, GAME_CONFIG.SCREEN_WIDTH, 60);
        
        // Score
        this.ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 20, 35);
        
        // Health
        this.ctx.fillText(`Health: ${this.playerHealth}`, 200, 35);
        
        // Enemies killed
        this.ctx.fillText(`Enemies: ${this.enemiesKilled}`, 400, 35);
        
        // Time played
        const timeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(timeSeconds / 60);
        const seconds = timeSeconds % 60;
        this.ctx.fillText(`Time: ${minutes}:${seconds.toString().padStart(2, '0')}`, 600, 35);
        
        // Boss warning
        if (this.bossActive) {
            this.ctx.fillStyle = '#FF0000';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            const warningAlpha = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
            this.ctx.globalAlpha = warningAlpha;
            this.ctx.fillText('⚠️ BOSS ACTIVE ⚠️', GAME_CONFIG.SCREEN_WIDTH / 2, 100);
            this.ctx.globalAlpha = 1.0;
            this.ctx.textAlign = 'left';
        }
    }
    
    drawPauseOverlay() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, GAME_CONFIG.SCREEN_WIDTH, GAME_CONFIG.SCREEN_HEIGHT);
        
        this.ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PAUSED', GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 - 50);
        
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press P to resume', GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 + 20);
        
        this.ctx.textAlign = 'left';
    }
    
    drawGameOverOverlay() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        this.ctx.fillRect(0, 0, GAME_CONFIG.SCREEN_WIDTH, GAME_CONFIG.SCREEN_HEIGHT);
        
        this.ctx.fillStyle = '#FF4444';
        this.ctx.font = 'bold 64px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 - 100);
        
        this.ctx.fillStyle = GAME_CONFIG.COLORS.WHITE;
        this.ctx.font = '32px Arial';
        this.ctx.fillText(`Final Score: ${this.score}`, GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 - 20);
        this.ctx.fillText(`Enemies Defeated: ${this.enemiesKilled}`, GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 + 20);
        
        const timeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(timeSeconds / 60);
        const seconds = timeSeconds % 60;
        this.ctx.fillText(`Time Survived: ${minutes}:${seconds.toString().padStart(2, '0')}`, GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 + 60);
        
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Click Restart button to play again', GAME_CONFIG.SCREEN_WIDTH / 2, GAME_CONFIG.SCREEN_HEIGHT / 2 + 120);
        
        this.ctx.textAlign = 'left';
    }
    
    dispatchGameOverEvent() {
        const event = new CustomEvent('gameOver', { 
            detail: { score: this.score, enemiesKilled: this.enemiesKilled } 
        });
        document.dispatchEvent(event);
    }
    
    gameLoop() {
        if (!this.running) return;
        
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame(() => this.gameLoop());
    }
}