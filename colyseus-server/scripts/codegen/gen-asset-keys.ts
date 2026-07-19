/**
 * Emits generated/asset-keys.json — the set of renderable/audible server type
 * ids the client asset pipeline must be able to resolve. This is the single
 * source of truth (D3) shared by the client content manifest and the CI
 * drift-gate: every key here must have a manifest entry, and no manifest entry
 * may reference a key that isn't here.
 *
 * Reads the REAL server configs (MOB_TYPES, WEAPON_TYPES, SKILLS) directly, so
 * the key set can never drift from a hand-copied list. Output is deterministic
 * (dedup + stable id sort) so a git-diff drift check is meaningful.
 *
 * Key form mirrors the client registry lookup:
 *   mob:<mobTypeId> | projectile:<ProjectileType> | player | npc | zone:<effectType>
 *
 * Lives under colyseus-server/scripts/ (not src/) by design, alongside the
 * other codegen entrypoints. Run via ts-node --transpile-only.
 */
import { MOB_TYPES } from '../../src/config/mobs'
import { WEAPON_TYPES } from '../../src/config/combat/projectileInteractions'
import { SKILLS } from '../../src/config/skills'

export type AssetKind = 'character' | 'prop' | 'vfx' | 'audio'

export interface AssetKey {
  id: string
  kind: AssetKind
}

export interface AssetKeySet {
  version: number
  keys: AssetKey[]
}

const VERSION = 1

/** Build the renderable/audible key set from the live server configs. */
export function genAssetKeys(): AssetKeySet {
  const keys: AssetKey[] = []

  // Mobs → character. mob:<mobTypeId> (Mob.mobTypeId is the synced type id).
  for (const mob of MOB_TYPES) {
    keys.push({ id: `mob:${mob.id}`, kind: 'character' })
  }

  // Projectiles → vfx. projectile:<ProjectileType> (Projectile.type is synced).
  for (const type of Object.values(WEAPON_TYPES)) {
    keys.push({ id: `projectile:${type}`, kind: 'vfx' })
  }

  // Fixed actor kinds with no per-type field on the synced entity.
  keys.push({ id: 'player', kind: 'character' })
  keys.push({ id: 'npc', kind: 'character' })

  // Zones → vfx. zone:<effectType>, enumerated from the effect types actually
  // used across skill definitions (populates ZoneEffectEffect.type at runtime).
  const zoneTypes = new Set<string>()
  for (const skill of Object.values(SKILLS)) {
    for (const effect of skill.effects) zoneTypes.add(effect.type)
  }
  for (const t of zoneTypes) keys.push({ id: `zone:${t}`, kind: 'vfx' })

  // Dedup by id (first wins) then stable lexicographic sort for deterministic output.
  const byId = new Map<string, AssetKey>()
  for (const k of keys) if (!byId.has(k.id)) byId.set(k.id, k)
  const sorted = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return { version: VERSION, keys: sorted }
}

// CLI driver: single optional arg = output file path.
if (require.main === module) {
  const fs = require('fs')
  const path = require('path')
  const outputFilePath =
    process.argv[2] || path.resolve(__dirname, '../../generated/asset-keys.json')
  const data = genAssetKeys()
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`gen-asset-keys: wrote ${outputFilePath} (${data.keys.length} keys)`)
}
