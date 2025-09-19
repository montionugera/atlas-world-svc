// Minimal working Nakama runtime module with RPC-based match simulation
function testRpc(_ctx: any, logger: any, _nk: any, _payload?: string) {
    logger.info('Test RPC called');
    return JSON.stringify({ status: 'ok', message: 'Hello from Atlas World!' });
}

// Global match state storage (in-memory simulation)
const matchStates = new Map<string, any>();

function createMovementMatchRpc(_ctx: any, logger: any, _nk: any, _payload?: string) {
    logger.info('createMovementMatchRpc called');
    // Create a simulated match with unique ID
    const matchId = 'simulated-match-' + Date.now();
    const matchState = {
        id: matchId,
        tick: 0,
        players: new Map(),
        mobs: [],
        createdAt: Date.now()
    };
    matchStates.set(matchId, matchState);
    logger.info(`Created simulated match: ${matchId}`);
    return JSON.stringify({ matchId, success: true, type: 'simulated' });
}

function joinMatchRpc(_ctx: any, logger: any, _nk: any, payload?: string) {
    logger.info('joinMatchRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId } = data;
        
        if (!matchId || !playerId) {
            return JSON.stringify({ success: false, error: 'Missing matchId or playerId' });
        }
        
        const matchState = matchStates.get(matchId);
        if (!matchState) {
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        // Add player to match
        matchState.players.set(playerId, {
            id: playerId,
            position: { x: 0, y: 0 },
            joinedAt: Date.now()
        });
        
        logger.info(`Player ${playerId} joined match ${matchId}`);
        return JSON.stringify({ 
            success: true, 
            matchId, 
            playerCount: matchState.players.size,
            snapshot: { mobs: matchState.mobs }
        });
    } catch (error) {
        logger.error('Error in joinMatchRpc:', error);
        return JSON.stringify({ success: false, error: 'Invalid payload' });
    }
}

function updatePlayerPositionRpc(_ctx: any, logger: any, _nk: any, payload?: string) {
    logger.info('updatePlayerPositionRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId, position } = data;
        
        if (!matchId || !playerId || !position) {
            return JSON.stringify({ success: false, error: 'Missing required fields' });
        }
        
        const matchState = matchStates.get(matchId);
        if (!matchState) {
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        const player = matchState.players.get(playerId);
        if (!player) {
            return JSON.stringify({ success: false, error: 'Player not in match' });
        }
        
        // Update player position
        player.position = position;
        matchState.tick += 1;
        
        // Return updated match state
        const players = Array.from(matchState.players.values());
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

function getMatchStateRpc(_ctx: any, logger: any, _nk: any, payload?: string) {
    logger.info('getMatchStateRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            return JSON.stringify({ success: false, error: 'Missing matchId' });
        }
        
        const matchState = matchStates.get(matchId);
        if (!matchState) {
            return JSON.stringify({ success: false, error: 'Match not found' });
        }
        
        const players = Array.from(matchState.players.values());
        return JSON.stringify({ 
            success: true, 
            matchId,
            tick: matchState.tick,
            players: players,
            mobs: matchState.mobs,
            playerCount: matchState.players.size
        });
    } catch (error) {
        logger.error('Error in getMatchStateRpc:', error);
        return JSON.stringify({ success: false, error: 'Invalid payload' });
    }
}

// ---- Minimal Match Handler ----

function atlasMovementMatchInit(_ctx: any, logger: any, _nk: any, _params: any) {
    logger.info('🎮 Atlas Movement Match - Initializing...');
    const state = { tick: 0 };
    const tickRate = 30;
    return { state, tickRate };
}

function atlasMovementMatchJoinAttempt(_ctx: any, _logger: any, _nk: any, _dispatcher: any, _tick: number, state: any, _presence: any, _metadata: any) {
    return { state, accept: true };
}

function atlasMovementMatchJoin(_ctx: any, logger: any, _nk: any, dispatcher: any, _tick: number, state: any, presences: any[]) {
    logger.info('Player(s) joined movement match');
    const snapshot = JSON.stringify({ mobs: [] });
    dispatcher.broadcastMessage(11, snapshot, presences);
    return { state };
}

function atlasMovementMatchLeave(_ctx: any, _logger: any, _nk: any, _dispatcher: any, _tick: number, state: any, _presences: any[]) {
    return { state };
}

function atlasMovementMatchLoop(_ctx: any, _logger: any, _nk: any, dispatcher: any, _tick: number, state: any, _messages: any[]) {
    state.tick += 1;
    const update = JSON.stringify({ mobs: [] });
    dispatcher.broadcastMessage(10, update);
    return { state };
}

function atlasMovementMatchTerminate(_ctx: any, _logger: any, _nk: any, _dispatcher: any, _tick: number, state: any, _graceSeconds: number) {
    return { state };
}

function atlasMovementMatchSignal(_ctx: any, _logger: any, _nk: any, _dispatcher: any, _tick: number, state: any, _data: string) {
    return { state };
}

function InitModule(_ctx: any, logger: any, _nk: any, initializer: any) {
    logger.info('🚀 Atlas World Server - RPC-Based Match Simulation Module Loaded');
    logger.info('✅ Test module initialized successfully');

    // Register RPC-based match simulation (workaround for Nakama runtime issues)
    initializer.registerRpc('test_rpc', testRpc);
    initializer.registerRpc('create_movement_match', createMovementMatchRpc);
    initializer.registerRpc('join_match', joinMatchRpc);
    initializer.registerRpc('update_player_position', updatePlayerPositionRpc);
    initializer.registerRpc('get_match_state', getMatchStateRpc);
    
    logger.info('✅ All RPC-based match simulation functions registered');
    logger.info('🎯 Match functionality available via RPC calls instead of match handlers');
}