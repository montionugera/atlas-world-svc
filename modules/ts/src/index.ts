// Minimal working Nakama runtime module with RPC-based match simulation

// Match state storage using Nakama's storage system
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

function getMatchState(nk: any, matchId: string): any | null {
    try {
        const objects = nk.storageRead([{
            collection: 'match_states',
            key: matchId,
            userId: SYSTEM_USER_ID
        }]);
        if (objects && objects.length > 0) {
            return objects[0].value;
        }
        return null;
    } catch (error) {
        console.error('Storage read error:', error);
        return null;
    }
}

function saveMatchState(nk: any, matchId: string, state: any): void {
    try {
        nk.storageWrite([{
            collection: 'match_states',
            key: matchId,
            userId: SYSTEM_USER_ID,
            value: state
        }]);
    } catch (error) {
        console.error('Storage write error:', error);
        throw error;
    }
}

// Mob AI simulation
function updateMobAI(matchState: any) {
    if (!matchState.mobs || matchState.mobs.length === 0) {
        // Initialize some mobs if none exist
        matchState.mobs = [
            { id: 'mob-1', x: 100, y: 100, vx: 1, vy: 0 },
            { id: 'mob-2', x: 200, y: 200, vx: -1, vy: 1 },
            { id: 'mob-3', x: 300, y: 150, vx: 0, vy: -1 }
        ];
    }
    
    // Update mob positions
    matchState.mobs.forEach((mob: any) => {
        mob.x += mob.vx;
        mob.y += mob.vy;
        
        // Simple boundary bouncing
        if (mob.x <= 0 || mob.x >= 500) mob.vx *= -1;
        if (mob.y <= 0 || mob.y >= 500) mob.vy *= -1;
        
        // Keep within bounds
        mob.x = Math.max(0, Math.min(500, mob.x));
        mob.y = Math.max(0, Math.min(500, mob.y));
    });
}

function createMovementMatchRpc(_ctx: any, logger: any, nk: any, _payload?: string) {
    logger.info('createMovementMatchRpc called');
    try {
        // Create a simulated match with unique ID
        const matchId = 'simulated-match-' + Date.now();
        const matchState = {
            id: matchId,
            tick: 0,
            players: {},
            mobs: [],
            createdAt: Date.now()
        };
        
        logger.info(`Saving match state for: ${matchId}`);
        saveMatchState(nk, matchId, matchState);
        logger.info(`Created simulated match: ${matchId}`);
        
        // Verify the save worked
        const savedState = getMatchState(nk, matchId);
        if (savedState) {
            logger.info(`Match state verified: ${savedState.id}`);
        } else {
            logger.error(`Failed to verify match state for: ${matchId}`);
        }
        
        return JSON.stringify({ matchId, success: true, type: 'simulated' });
    } catch (error) {
        logger.error('Error in createMovementMatchRpc:', error);
        return JSON.stringify({ success: false, error: 'Failed to create match' });
    }
}

function joinMatchRpc(_ctx: any, logger: any, nk: any, payload?: string) {
    logger.info('joinMatchRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId } = data;
        
        logger.info(`Looking for matchId: ${matchId}, playerId: ${playerId}`);
        
        if (!matchId || !playerId) {
            return JSON.stringify({ success: false, error: 'Missing matchId or playerId' });
        }
        
        const matchState = getMatchState(nk, matchId);
        if (!matchState) {
            logger.error(`Match not found: ${matchId}`);
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        // Add player to match
        matchState.players[playerId] = {
            id: playerId,
            position: { x: 0, y: 0 },
            joinedAt: Date.now()
        };
        
        // Save updated state
        saveMatchState(nk, matchId, matchState);
        
        logger.info(`Player ${playerId} joined match ${matchId}`);
        return JSON.stringify({ 
            success: true, 
            matchId, 
            playerCount: Object.keys(matchState.players).length,
            snapshot: { mobs: matchState.mobs }
        });
    } catch (error) {
        logger.error('Error in joinMatchRpc:', error);
        return JSON.stringify({ success: false, error: 'Invalid payload' });
    }
}

function updatePlayerPositionRpc(_ctx: any, logger: any, nk: any, payload?: string) {
    logger.info('updatePlayerPositionRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId, position } = data;
        
        if (!matchId || !playerId || !position) {
            return JSON.stringify({ success: false, error: 'Missing required fields' });
        }
        
        const matchState = getMatchState(nk, matchId);
        if (!matchState) {
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        const player = matchState.players[playerId];
        if (!player) {
            return JSON.stringify({ success: false, error: 'Player not in match' });
        }
        
        // Update player position
        player.position = position;
        matchState.tick += 1;
        
        // Update mob AI
        updateMobAI(matchState);
        
        // Save updated state
        saveMatchState(nk, matchId, matchState);
        
        // Return updated match state
        const players = Object.values(matchState.players);
        return JSON.stringify({ 
            success: true, 
            tick: matchState.tick,
            players: players,
            mobs: matchState.mobs
        });
    } catch (error) {
        logger.error('Error in updatePlayerPositionRpc:', error);
        return JSON.stringify({ success: false, error: 'Invalid payload' });
    }
}

function getMatchStateRpc(_ctx: any, logger: any, nk: any, payload?: string) {
    logger.info('getMatchStateRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            return JSON.stringify({ success: false, error: 'Missing matchId' });
        }
        
        const matchState = getMatchState(nk, matchId);
        if (!matchState) {
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        const players = Object.values(matchState.players);
        return JSON.stringify({ 
            success: true, 
            matchId,
            tick: matchState.tick,
            players: players,
            mobs: matchState.mobs,
            playerCount: Object.keys(matchState.players).length
        });
    } catch (error) {
        logger.error('Error in getMatchStateRpc:', error);
        return JSON.stringify({ success: false, error: 'Invalid payload' });
    }
}

function updateMobsRpc(_ctx: any, logger: any, nk: any, payload?: string) {
    logger.info('updateMobsRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            return JSON.stringify({ success: false, error: 'Missing matchId' });
        }
        
        const matchState = getMatchState(nk, matchId);
        if (!matchState) {
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        // Update mob AI
        updateMobAI(matchState);
        matchState.tick += 1;
        
        // Save updated state
        saveMatchState(nk, matchId, matchState);
        
        // Return mob updates
        return JSON.stringify({ 
            success: true, 
            matchId,
            tick: matchState.tick,
            mobs: matchState.mobs
        });
    } catch (error) {
        logger.error('Error in updateMobsRpc:', error);
        return JSON.stringify({ success: false, error: 'Invalid payload' });
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