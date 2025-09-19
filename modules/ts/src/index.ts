// Atlas World Server - Nakama Runtime Module
// Main entry point with clean separation of concerns

// Configuration constants
const CONFIG = {
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
               MOB_UPDATE_INTERVAL: 50 // ms - ultra fast updates for very smooth movement
           },
    
           // Mob configuration
           MOBS: {
               DEFAULT_COUNT: 3,
               INITIAL_POSITIONS: [
                   { x: 100, y: 100, vx: 6, vy: 0 },    // Horizontal right (ultra fast)
                   { x: 200, y: 200, vx: -6, vy: 6 },   // Diagonal left-down (ultra fast)
                   { x: 300, y: 150, vx: 0, vy: -6 }    // Vertical up (ultra fast)
               ]
           }
};

// Type definitions
interface Position {
    x: number;
    y: number;
}


interface Mob {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface Player {
    id: string;
    position: Position;
    joinedAt: number;
}

interface MatchState {
    id: string;
    tick: number;
    players: Record<string, Player>;
    mobs: Mob[];
    createdAt: number;
}

interface RpcResponse {
    success: boolean;
    error?: string;
}

interface CreateMatchResponse extends RpcResponse {
    matchId?: string;
    type?: string;
}

interface JoinMatchResponse extends RpcResponse {
    matchId?: string;
    playerCount?: number;
    snapshot?: { mobs: Mob[] };
}

interface UpdatePositionResponse extends RpcResponse {
    tick?: number;
    players?: Player[];
    mobs?: Mob[];
}

interface GetMatchStateResponse extends RpcResponse {
    matchId?: string;
    tick?: number;
    players?: Player[];
    mobs?: Mob[];
    playerCount?: number;
}

interface UpdateMobsResponse extends RpcResponse {
    matchId?: string;
    tick?: number;
    mobs?: Mob[];
}

// Logger utility
class Logger {
    private logger: any;
    private context: string;

    constructor(logger: any, context: string = 'AtlasWorld') {
        this.logger = logger;
        this.context = context;
    }

    info(message: string, ...args: any[]): void {
        this.logger.info(`[${this.context}] ${message}`, ...args);
    }

    error(message: string, error?: any, ...args: any[]): void {
        this.logger.error(`[${this.context}] ${message}`, error, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.logger.warn(`[${this.context}] ${message}`, ...args);
    }

    debug(message: string, ...args: any[]): void {
        this.logger.debug(`[${this.context}] ${message}`, ...args);
    }
}

function createLogger(logger: any, context: string): Logger {
    return new Logger(logger, context);
}

// Storage functions
function getMatchState(nk: any, matchId: string, logger?: any): MatchState | null {
    try {
        const objects = nk.storageRead([{
            collection: CONFIG.STORAGE.COLLECTION,
            key: matchId,
            userId: CONFIG.STORAGE.SYSTEM_USER_ID
        }]);
        
        if (objects && objects.length > 0) {
            return objects[0].value;
        }
        
        return null;
    } catch (error) {
        const errorMsg = `Storage read error for match ${matchId}`;
        if (logger) {
            logger.error(errorMsg, error);
        } else {
            console.error(errorMsg, error);
        }
        return null;
    }
}

function saveMatchState(nk: any, matchId: string, state: MatchState, logger?: any): void {
    try {
        nk.storageWrite([{
            collection: CONFIG.STORAGE.COLLECTION,
            key: matchId,
            userId: CONFIG.STORAGE.SYSTEM_USER_ID,
            value: state
        }]);
    } catch (error) {
        const errorMsg = `Storage write error for match ${matchId}`;
        if (logger) {
            logger.error(errorMsg, error);
        } else {
            console.error(errorMsg, error);
        }
        throw error;
    }
}

// Mob AI functions
function initializeMobs() {
    return CONFIG.MOBS.INITIAL_POSITIONS.map((pos, index) => ({
        id: `mob-${index + 1}`,
        x: pos.x,
        y: pos.y,
        vx: pos.vx,
        vy: pos.vy
    }));
}

function updateMobAI(matchState: MatchState): void {
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

function updateMobPosition(mob: any): void {
    mob.x += mob.vx;
    mob.y += mob.vy;
}

function applyBoundaryPhysics(mob: any): void {
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

// RPC Functions
function createMovementMatchRpc(_ctx: any, logger: any, nk: any, _payload?: string): string {
    const log = createLogger(logger, 'CreateMatchRPC');
    log.info('Creating new movement match');
    
    try {
        // Create a simulated match with unique ID
        const matchId = `simulated-match-${Date.now()}`;
        const matchState: MatchState = {
            id: matchId,
            tick: 0,
            players: {},
            mobs: [],
            createdAt: Date.now()
        };
        
        log.info(`Saving match state for: ${matchId}`);
        saveMatchState(nk, matchId, matchState, log);
        log.info(`Created simulated match: ${matchId}`);
        
        // Verify the save worked
        const savedState = getMatchState(nk, matchId, log);
        if (savedState) {
            log.info(`Match state verified: ${savedState.id}`);
        } else {
            log.error(`Failed to verify match state for: ${matchId}`);
        }
        
        const response: CreateMatchResponse = { matchId, success: true, type: 'simulated' };
        return JSON.stringify(response);
    } catch (error) {
        log.error('Error creating movement match', error);
        const response: CreateMatchResponse = { success: false, error: 'Failed to create match' };
        return JSON.stringify(response);
    }
}

function joinMatchRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    const log = createLogger(logger, 'JoinMatchRPC');
    log.info('Player joining match');
    
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId } = data;
        
        log.info(`Looking for matchId: ${matchId}, playerId: ${playerId}`);
        
        if (!matchId || !playerId) {
            const response: JoinMatchResponse = { success: false, error: 'Missing matchId or playerId' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId, log);
        if (!matchState) {
            log.error(`Match not found: ${matchId}`);
            const response: JoinMatchResponse = { success: false, error: 'Match not found' };
            return JSON.stringify(response);
        }
        
        // Add player to match
        matchState.players[playerId] = {
            id: playerId,
            position: { x: 0, y: 0 },
            joinedAt: Date.now()
        };
        
        // Save updated state
        saveMatchState(nk, matchId, matchState, log);
        
        log.info(`Player ${playerId} joined match ${matchId}`);
        const response: JoinMatchResponse = { 
            success: true, 
            matchId, 
            playerCount: Object.keys(matchState.players).length,
            snapshot: { mobs: matchState.mobs }
        };
        return JSON.stringify(response);
    } catch (error) {
        log.error('Error joining match', error);
        const response: JoinMatchResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

function updatePlayerPositionRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    const log = createLogger(logger, 'UpdatePositionRPC');
    log.info('Updating player position');
    
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId, position } = data;
        
        if (!matchId || !playerId || !position) {
            const response: UpdatePositionResponse = { success: false, error: 'Missing required fields' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId, log);
        if (!matchState) {
            const response: UpdatePositionResponse = { success: false, error: 'Match not found' };
            return JSON.stringify(response);
        }
        
        const player = matchState.players[playerId];
        if (!player) {
            const response: UpdatePositionResponse = { success: false, error: 'Player not in match' };
            return JSON.stringify(response);
        }
        
        // Update player position
        player.position = position;
        matchState.tick += 1;
        
        // Update mob AI
        updateMobAI(matchState);
        
        // Save updated state
        saveMatchState(nk, matchId, matchState, log);
        
        // Return updated match state
        const players = Object.values(matchState.players);
        const response: UpdatePositionResponse = { 
            success: true, 
            tick: matchState.tick,
            players: players,
            mobs: matchState.mobs
        };
        return JSON.stringify(response);
    } catch (error) {
        log.error('Error updating player position', error);
        const response: UpdatePositionResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

function getMatchStateRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    const log = createLogger(logger, 'GetMatchStateRPC');
    log.info('Getting match state');
    
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            const response: GetMatchStateResponse = { success: false, error: 'Missing matchId' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId, log);
        if (!matchState) {
            const response: GetMatchStateResponse = { success: false, error: 'Match not found' };
            return JSON.stringify(response);
        }
        
        const players = Object.values(matchState.players);
        const response: GetMatchStateResponse = { 
            success: true, 
            matchId,
            tick: matchState.tick,
            players: players,
            mobs: matchState.mobs,
            playerCount: Object.keys(matchState.players).length
        };
        return JSON.stringify(response);
    } catch (error) {
        log.error('Error getting match state', error);
        const response: GetMatchStateResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

function updateMobsRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    const log = createLogger(logger, 'UpdateMobsRPC');
    log.info('Updating mobs');
    
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            const response: UpdateMobsResponse = { success: false, error: 'Missing matchId' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId, log);
        if (!matchState) {
            const response: UpdateMobsResponse = { success: false, error: 'Match not found' };
            return JSON.stringify(response);
        }
        
        // Update mob AI
        updateMobAI(matchState);
        matchState.tick += 1;
        
        // Save updated state
        saveMatchState(nk, matchId, matchState, log);
        
        // Return mob updates
        const response: UpdateMobsResponse = { 
            success: true, 
            matchId,
            tick: matchState.tick,
            mobs: matchState.mobs
        };
        return JSON.stringify(response);
    } catch (error) {
        log.error('Error updating mobs', error);
        const response: UpdateMobsResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

function InitModule(_ctx: any, logger: any, _nk: any, initializer: any) {
    logger.info('🚀 Atlas World Server - RPC-Based Match Simulation Module Loaded');
    logger.info('✅ Test module initialized successfully');
    
    // Register RPC-based match simulation (workaround for Nakama runtime issues)
    initializer.registerRpc('create_movement_match', createMovementMatchRpc);
    initializer.registerRpc('join_match', joinMatchRpc);
    initializer.registerRpc('update_player_position', updatePlayerPositionRpc);
    initializer.registerRpc('get_match_state', getMatchStateRpc);
    initializer.registerRpc('update_mobs', updateMobsRpc);
    
    logger.info('✅ All RPC-based match simulation functions registered');
    logger.info('🎯 Match functionality available via RPC calls instead of match handlers');
}