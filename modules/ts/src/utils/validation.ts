// Input validation utilities

import { Position } from '../types/game';

export function isValidMatchId(matchId: any): matchId is string {
    return typeof matchId === 'string' && matchId.length > 0;
}

export function isValidPlayerId(playerId: any): playerId is string {
    return typeof playerId === 'string' && playerId.length > 0;
}

export function isValidPosition(position: any): position is Position {
    return (
        position &&
        typeof position === 'object' &&
        typeof position.x === 'number' &&
        typeof position.y === 'number' &&
        !isNaN(position.x) &&
        !isNaN(position.y)
    );
}

export function isValidPayload(payload: any): boolean {
    try {
        if (typeof payload === 'string') {
            JSON.parse(payload);
        }
        return true;
    } catch {
        return false;
    }
}

export function sanitizeString(input: any): string {
    if (typeof input !== 'string') {
        return '';
    }
    return input.trim();
}

export function sanitizeNumber(input: any, defaultValue: number = 0): number {
    const num = Number(input);
    return isNaN(num) ? defaultValue : num;
}
