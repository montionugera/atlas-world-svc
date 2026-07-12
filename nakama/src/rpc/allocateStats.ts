import { COLLECTIONS } from '@atlas/contracts';
import type { PrimaryStats } from '@atlas/contracts';
import { readDoc, writeDoc } from '../storage';

function parsePayload(raw: string): PrimaryStats {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('allocate_stats: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('allocate_stats: payload must be a JSON object');
  }
  const { str, agi, int, vit } = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries({ str, agi, int, vit })) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`allocate_stats: ${key} must be a non-negative integer`);
    }
  }
  return { str, agi, int, vit } as PrimaryStats;
}

/**
 * allocate_stats — client RPC. Spends the caller's unspent statPoints on
 * PrimaryStats. Rejects allocations that exceed the points on hand.
 */
export const allocateStats: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    throw new Error('allocate_stats requires an authenticated client session');
  }
  const delta = parsePayload(payload);
  const spent = delta.str + delta.agi + delta.int + delta.vit;

  const { doc, version } = readDoc(nk, ctx.userId, COLLECTIONS.profile);
  if (spent > doc.statPoints) {
    throw new Error(`allocate_stats: requested ${spent} points but only ${doc.statPoints} are available`);
  }

  const updated = {
    ...doc,
    statPoints: doc.statPoints - spent,
    allocated: {
      str: doc.allocated.str + delta.str,
      agi: doc.allocated.agi + delta.agi,
      int: doc.allocated.int + delta.int,
      vit: doc.allocated.vit + delta.vit,
    },
  };
  writeDoc(nk, ctx.userId, COLLECTIONS.profile, updated, version);
  return JSON.stringify(updated);
};
