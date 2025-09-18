// Minimal working Nakama runtime module
function testRpc(_ctx: any, logger: any, _nk: any, _payload?: string) {
    logger.info('Test RPC called');
    return JSON.stringify({ status: 'ok', message: 'Hello from Atlas World!' });
}

function createMovementMatchRpc(_ctx: any, logger: any, _nk: any, _payload?: string) {
    logger.info('createMovementMatchRpc called');
    // Return a dummy match ID for now
    return JSON.stringify({ matchId: 'dummy-match-id', success: true });
}

function InitModule(_ctx: any, logger: any, _nk: any, initializer: any) {
    logger.info('🚀 Atlas World Server - Minimal Test Module Loaded');
    logger.info('✅ Test module initialized successfully');
    
    // Register RPCs only
    initializer.registerRpc('test_rpc', testRpc);
    initializer.registerRpc('create_movement_match', createMovementMatchRpc);
}