// Application constants and configuration

export const CONFIG = {
    // World bounds
    WORLD: {
        MIN_X: 0,
        MAX_X: 500,
        MIN_Y: 0,
        MAX_Y: 500
    },
    
    // Storage
    STORAGE: {
        COLLECTION: 'match_states',
        SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000000'
    },
    
    // Match settings
    MATCH: {
        TICK_RATE: 30,
        MAX_PLAYERS: 10,
        MOB_UPDATE_INTERVAL: 200 // ms
    },
    
    // Mob configuration
    MOBS: {
        DEFAULT_COUNT: 3,
        INITIAL_POSITIONS: [
            { x: 100, y: 100, vx: 1, vy: 0 },    // Horizontal right
            { x: 200, y: 200, vx: -1, vy: 1 },   // Diagonal left-down
            { x: 300, y: 150, vx: 0, vy: -1 }    // Vertical up
        ]
    }
} as const;

export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
} as const;
