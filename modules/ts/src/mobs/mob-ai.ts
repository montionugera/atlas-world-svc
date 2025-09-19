// Mob AI simulation and physics

import { MatchState, Mob } from '../types/game';
import { CONFIG } from '../config/constants';

export function initializeMobs(): Mob[] {
    return CONFIG.MOBS.INITIAL_POSITIONS.map((pos, index) => ({
        id: `mob-${index + 1}`,
        x: pos.x,
        y: pos.y,
        vx: pos.vx,
        vy: pos.vy
    }));
}

export function updateMobAI(matchState: MatchState): void {
    // Initialize mobs if none exist
    if (!matchState.mobs || matchState.mobs.length === 0) {
        matchState.mobs = initializeMobs();
    }
    
    // Update each mob's position and physics
    matchState.mobs.forEach(mob => {
        updateMobPosition(mob);
        applyBoundaryPhysics(mob);
    });
}

function updateMobPosition(mob: Mob): void {
    mob.x += mob.vx;
    mob.y += mob.vy;
}

function applyBoundaryPhysics(mob: Mob): void {
    // Bounce off horizontal boundaries
    if (mob.x <= CONFIG.WORLD.MIN_X || mob.x >= CONFIG.WORLD.MAX_X) {
        mob.vx *= -1;
    }
    
    // Bounce off vertical boundaries
    if (mob.y <= CONFIG.WORLD.MIN_Y || mob.y >= CONFIG.WORLD.MAX_Y) {
        mob.vy *= -1;
    }
    
    // Clamp position to world bounds
    mob.x = Math.max(CONFIG.WORLD.MIN_X, Math.min(CONFIG.WORLD.MAX_X, mob.x));
    mob.y = Math.max(CONFIG.WORLD.MIN_Y, Math.min(CONFIG.WORLD.MAX_Y, mob.y));
}
