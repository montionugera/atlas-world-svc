import { COLLECTIONS } from '@atlas/contracts';
import { readDoc, writeDoc } from '../storage';

const MAX_LOADOUT_SIZE = 4;

function parsePayload(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('set_skill_loadout: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('set_skill_loadout: payload must be a JSON object');
  }
  const { loadout } = parsed as Record<string, unknown>;
  if (!Array.isArray(loadout) || !loadout.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('set_skill_loadout: loadout must be an array of non-empty strings');
  }
  if (loadout.length > MAX_LOADOUT_SIZE) {
    throw new Error(`set_skill_loadout: loadout may not exceed ${MAX_LOADOUT_SIZE} skills`);
  }
  return loadout as string[];
}

/**
 * set_skill_loadout — client RPC. Replaces the caller's equipped skill
 * loadout (max 4 slots), rejecting any skillId not already unlocked.
 */
export const setSkillLoadout: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    throw new Error('set_skill_loadout requires an authenticated client session');
  }
  const loadout = parsePayload(payload);

  const { doc, version } = readDoc(nk, ctx.userId, COLLECTIONS.skills);
  const unlockedIds = new Set(doc.unlocked.map((u) => u.skillId));
  const notUnlocked = loadout.filter((id) => !unlockedIds.has(id));
  if (notUnlocked.length > 0) {
    throw new Error(`set_skill_loadout: not unlocked: ${notUnlocked.join(', ')}`);
  }

  const updated = { ...doc, loadout };
  writeDoc(nk, ctx.userId, COLLECTIONS.skills, updated, version);
  return JSON.stringify(updated);
};
