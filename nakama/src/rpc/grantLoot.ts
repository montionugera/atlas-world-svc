import { COLLECTIONS } from '@atlas/contracts';
import { readDoc, writeDoc } from '../storage';
import { addLoot } from './inventoryHelpers';

interface GrantLootPayload {
  userId: string;
  itemId: string;
  qty: number;
}

function parsePayload(raw: string): GrantLootPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('grant_loot: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('grant_loot: payload must be a JSON object');
  }
  const { userId, itemId, qty } = parsed as Record<string, unknown>;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('grant_loot: userId must be a non-empty string');
  }
  if (typeof itemId !== 'string' || itemId.length === 0) {
    throw new Error('grant_loot: itemId must be a non-empty string');
  }
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
    throw new Error('grant_loot: qty must be a positive integer');
  }
  return { userId, itemId, qty };
}

const MAX_WRITE_ATTEMPTS = 2;

/**
 * grant_loot — S2S only (Colyseus calls this via http_key). Adds loot to a
 * player's inventory, with one retry on an optimistic-concurrency conflict
 * (same pattern as grant_xp).
 */
export const grantLoot: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (ctx.userId) {
    throw new Error('grant_loot is server-only (S2S http_key) and cannot be called by an authenticated client');
  }
  const { userId, itemId, qty } = parsePayload(payload);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const { doc, version } = readDoc(nk, userId, COLLECTIONS.inventory);
    const updated = addLoot(doc, { itemId, qty, generateInstanceId: () => nk.uuidv4() });
    try {
      writeDoc(nk, userId, COLLECTIONS.inventory, updated, version);
      return JSON.stringify(updated);
    } catch (err) {
      lastError = err;
      logger.warn('grant_loot write conflict for user %s (attempt %d)', userId, attempt + 1);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('grant_loot: storage write failed after retry');
};
