// Match state storage operations using Nakama's storage system

import { MatchState } from '../types/game';
import { CONFIG } from '../config/constants';
import { Logger } from '../utils/logger';

export function getMatchState(nk: any, matchId: string, logger?: Logger): MatchState | null {
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

export function saveMatchState(nk: any, matchId: string, state: MatchState, logger?: Logger): void {
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
