import { LoadoutSnapshot, derivedStats } from '@atlas/contracts'
import { Player } from '../schemas/Player'
import { IMetaBackend } from './IMetaBackend'
import { clampPrimaryStat } from '../config/combatConfig'

/** Applies a loadout snapshot's derived combat stats to a joined player. */
export function applyLoadout(player: Player, snap: LoadoutSnapshot): void {
  const stats = derivedStats({
    level: snap.profile.level,
    allocated: snap.profile.allocated,
    weaponItemId: snap.equippedItemIds.weapon,
  })

  player.maxHealth = stats.maxHealth
  player.currentHealth = stats.maxHealth
  player.pAtk = stats.pAtk
  player.mAtk = stats.mAtk
  player.pDef = stats.pDef
  player.mDef = stats.mDef
  player.maxMoveSpeed = stats.maxMoveSpeed
  player.maxLinearSpeed = stats.maxMoveSpeed

  // Primary stats also drive derived combat timing (e.g. attack speed reads
  // player.stat.agi — see Player.recalculateStats/meleeAttackSpeed), so the
  // loadout's allocated points must land on player.stat, not just the
  // pre-derived combat fields above. @atlas/contracts' PrimaryStats has no
  // `dex` field — leave player.stat.dex at its config default.
  player.stat.agi = clampPrimaryStat(snap.profile.allocated.agi)
  player.stat.str = clampPrimaryStat(snap.profile.allocated.str)
  player.stat.vit = clampPrimaryStat(snap.profile.allocated.vit)
}

export interface LoadPlayerLoadoutParams {
  player: Player
  backend: IMetaBackend
  userId: string
}

/**
 * Fetches the player's loadout from the meta backend and applies it. If the
 * backend is unavailable — getLoadout resolves null (NakamaMetaBackend has
 * already retried internally) or THROWS — the player stays on its
 * ephemeral/default stats so a meta-systems outage never blocks a match from
 * starting.
 */
export async function loadPlayerLoadout({
  player,
  backend,
  userId,
}: LoadPlayerLoadoutParams): Promise<void> {
  let snapshot: LoadoutSnapshot | null
  try {
    snapshot = await backend.getLoadout(userId)
  } catch (err) {
    console.error('[meta] getLoadout threw', userId, err)
    snapshot = null
  }

  if (!snapshot) {
    player.isEphemeral = true
    console.error('[meta] ephemeral join', userId)
    return
  }
  applyLoadout(player, snapshot)
}
