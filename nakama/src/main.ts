import { RPC } from '@atlas/contracts';
import { grantXp } from './rpc/grantXp';
import { grantLoot } from './rpc/grantLoot';
import { equipItem } from './rpc/equipItem';
import { allocateStats } from './rpc/allocateStats';
import { setSkillLoadout } from './rpc/setSkillLoadout';

/**
 * healthcheck RPC — trivial liveness probe for the bundle + wiring, no auth
 * required. Returns a fixed JSON payload. Not part of contracts RPC ids
 * (contracts.RPC only lists gameplay RPCs); this is scaffold-only.
 */
const healthcheck: nkruntime.RpcFunction = function (
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _payload: string,
): string {
  return JSON.stringify({ ok: true });
};

// Nakama's registerRpc must see each id as a plain top-level identifier, not
// a property-access expression evaluated inline at the call site — passing
// `RPC.grantXp` etc. directly inside InitModule caused every call after the
// first to silently bind to the WRONG handler (verified live: grant_loot's
// RPC id ended up invoking grantXp's body). Resolving each id to its own
// global const first avoids it.
const HEALTHCHECK_RPC_ID = 'healthcheck';
const GRANT_XP_RPC_ID = RPC.grantXp;
const GRANT_LOOT_RPC_ID = RPC.grantLoot;
const EQUIP_ITEM_RPC_ID = RPC.equipItem;
const ALLOCATE_STATS_RPC_ID = RPC.allocateStats;
const SET_SKILL_LOADOUT_RPC_ID = RPC.setSkillLoadout;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerRpc(HEALTHCHECK_RPC_ID, healthcheck);
  initializer.registerRpc(GRANT_XP_RPC_ID, grantXp);
  initializer.registerRpc(GRANT_LOOT_RPC_ID, grantLoot);
  initializer.registerRpc(EQUIP_ITEM_RPC_ID, equipItem);
  initializer.registerRpc(ALLOCATE_STATS_RPC_ID, allocateStats);
  initializer.registerRpc(SET_SKILL_LOADOUT_RPC_ID, setSkillLoadout);
  logger.info('atlas-nakama TS runtime module loaded');
}

// Keep InitModule reachable so esbuild's tree-shaking never drops the
// top-level declaration Nakama's goja runtime looks up by name.
!InitModule && InitModule.bind(null);
