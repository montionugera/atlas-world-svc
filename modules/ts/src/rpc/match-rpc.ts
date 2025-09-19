// Match-related RPC functions

import { getMatchState, saveMatchState } from '../storage/match-storage';
import { updateMobAI } from '../mobs/mob-ai';
import { createLogger } from '../utils/logger';
// Validation imports will be used in future RPC functions
// import { 
//     isValidMatchId, 
//     isValidPlayerId, 
//     isValidPosition, 
//     isValidPayload 
// } from '../utils/validation';
import { 
    MatchState, 
    CreateMatchResponse, 
    JoinMatchResponse, 
    UpdatePositionResponse, 
    GetMatchStateResponse, 
    UpdateMobsResponse 
} from '../types/game';

export function createMovementMatchRpc(_ctx: any, logger: any, nk: any, _payload?: string): string {
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

export function joinMatchRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    logger.info('joinMatchRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId } = data;
        
        logger.info(`Looking for matchId: ${matchId}, playerId: ${playerId}`);
        
        if (!matchId || !playerId) {
            const response: JoinMatchResponse = { success: false, error: 'Missing matchId or playerId' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId);
        if (!matchState) {
            logger.error(`Match not found: ${matchId}`);
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
        saveMatchState(nk, matchId, matchState);
        
        logger.info(`Player ${playerId} joined match ${matchId}`);
        const response: JoinMatchResponse = { 
            success: true, 
            matchId, 
            playerCount: Object.keys(matchState.players).length,
            snapshot: { mobs: matchState.mobs }
        };
        return JSON.stringify(response);
    } catch (error) {
        logger.error('Error in joinMatchRpc:', error);
        const response: JoinMatchResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

export function updatePlayerPositionRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    logger.info('updatePlayerPositionRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId, playerId, position } = data;
        
        if (!matchId || !playerId || !position) {
            const response: UpdatePositionResponse = { success: false, error: 'Missing required fields' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId);
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
        saveMatchState(nk, matchId, matchState);
        
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
        logger.error('Error in updatePlayerPositionRpc:', error);
        const response: UpdatePositionResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

export function getMatchStateRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    logger.info('getMatchStateRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            const response: GetMatchStateResponse = { success: false, error: 'Missing matchId' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId);
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
        logger.error('Error in getMatchStateRpc:', error);
        const response: GetMatchStateResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}

export function updateMobsRpc(_ctx: any, logger: any, nk: any, payload?: string): string {
    logger.info('updateMobsRpc called');
    try {
        const data = JSON.parse(payload || '{}');
        const { matchId } = data;
        
        if (!matchId) {
            const response: UpdateMobsResponse = { success: false, error: 'Missing matchId' };
            return JSON.stringify(response);
        }
        
        const matchState = getMatchState(nk, matchId);
        if (!matchState) {
            const response: UpdateMobsResponse = { success: false, error: 'Match not found' };
            return JSON.stringify(response);
        }
        
        // Update mob AI
        updateMobAI(matchState);
        matchState.tick += 1;
        
        // Save updated state
        saveMatchState(nk, matchId, matchState);
        
        // Return mob updates
        const response: UpdateMobsResponse = { 
            success: true, 
            matchId,
            tick: matchState.tick,
            mobs: matchState.mobs
        };
        return JSON.stringify(response);
    } catch (error) {
        logger.error('Error in updateMobsRpc:', error);
        const response: UpdateMobsResponse = { success: false, error: 'Invalid payload' };
        return JSON.stringify(response);
    }
}
