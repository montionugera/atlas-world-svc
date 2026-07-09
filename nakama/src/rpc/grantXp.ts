import { COLLECTIONS } from '@atlas/contracts';
import { applyXp } from '../leveling';
import { readDoc, writeDoc } from '../storage';

interface GrantXpPayload {
  userId: string;
  amount: number;
}

function parsePayload(raw: string): GrantXpPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('grant_xp: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('grant_xp: payload must be a JSON object');
  }
  const { userId, amount } = parsed as Record<string, unknown>;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('grant_xp: userId must be a non-empty string');
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('grant_xp: amount must be a positive finite number');
  }
  return { userId, amount };
}

const MAX_WRITE_ATTEMPTS = 2;

/**
 * grant_xp — S2S only (Colyseus calls this via http_key, never a client
 * session). Rejects any call carrying an authenticated ctx.userId. Reads
 * the profile, applies XP/level-ups, and writes back with one retry on an
 * optimistic-concurrency conflict.
 */
export const grantXp: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (ctx.userId) {
    throw new Error('grant_xp is server-only (S2S http_key) and cannot be called by an authenticated client');
  }
  const { userId, amount } = parsePayload(payload);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const { doc, version } = readDoc(nk, userId, COLLECTIONS.profile);
    const updated = applyXp(doc, amount);
    try {
      writeDoc(nk, userId, COLLECTIONS.profile, updated, version);
      return JSON.stringify(updated);
    } catch (err) {
      lastError = err;
      logger.warn('grant_xp write conflict for user %s (attempt %d)', userId, attempt + 1);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('grant_xp: storage write failed after retry');
};
