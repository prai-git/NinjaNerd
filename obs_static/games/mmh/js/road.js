// Road class for Motorcycle Mayhem
class Road {
    constructor() {
        this.laneMarkerOffset = 0;
        this.speed = 5;
        this.roadX = (MMH_CONFIG.SCREEN_WIDTH - MMH_CONFIG.ROAD_WIDTH) / 2;
    }
    
    update(playerSpeedMultiplier) {
        this.speed = 5 * playerSpeedMultiplier;
        this.laneMarkerOffset += this.speed;
        
        // Reset offset for seamless loop
        const markerCycle = MMH_CONFIG.LANE_MARKER_HEIGHT + MMH_CONFIG.LANE_MARKER_GAP;
        if (this.laneMarkerOffset >= markerCycle) {
            this.laneMarkerOffset -= markerCycle;
        }
    }
    
    draw(ctx) {
        // Draw background on sides (soft sage green for roadside)
        ctx.fillStyle = '#87A96B';
        ctx.fillRect(0, 0, this.roadX, MMH_CONFIG.SCREEN_HEIGHT);
        ctx.fillRect(this.roadX + MMH_CONFIG.ROAD_WIDTH, 0, 
                    MMH_CONFIG.SCREEN_WIDTH - this.roadX - MMH_CONFIG.ROAD_WIDTH, 
                    MMH_CONFIG.SCREEN_HEIGHT);
        
        // Draw road with rounded corners
        ctx.fillStyle = MMH_CONFIG.DARK_GRAY;
        this.drawRoundedRect(ctx, this.roadX, 0, MMH_CONFIG.ROAD_WIDTH, MMH_CONFIG.SCREEN_HEIGHT, 15);
        
        // Draw road edges with rounded corners
        ctx.fillStyle = MMH_CONFIG.WHITE;
        this.drawRoundedRect(ctx, this.roadX - 5, 0, 5, MMH_CONFIG.SCREEN_HEIGHT, 5);
        this.drawRoundedRect(ctx, this.roadX + MMH_CONFIG.ROAD_WIDTH, 0, 5, MMH_CONFIG.SCREEN_HEIGHT, 5);
        
        // Draw lane markers
        const markerCycle = MMH_CONFIG.LANE_MARKER_HEIGHT + MMH_CONFIG.LANE_MARKER_GAP;
        
        for (let lane = 1; lane < 3; lane++) { // 2 lane dividers
            const laneX = this.roadX + (lane * MMH_CONFIG.LANE_WIDTH) - MMH_CONFIG.LANE_MARKER_WIDTH / 2;
            
            let y = -MMH_CONFIG.LANE_MARKER_HEIGHT + this.laneMarkerOffset;
            
            while (y < MMH_CONFIG.SCREEN_HEIGHT) {
                if (y + MMH_CONFIG.LANE_MARKER_HEIGHT > 0) { // Only draw if visible
                    ctx.fillStyle = MMH_CONFIG.YELLOW;
                    ctx.fillRect(laneX, Math.floor(y), MMH_CONFIG.LANE_MARKER_WIDTH, 
                               MMH_CONFIG.LANE_MARKER_HEIGHT);
                }
                y += markerCycle;
            }
        }
    }
    
    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    }
}
