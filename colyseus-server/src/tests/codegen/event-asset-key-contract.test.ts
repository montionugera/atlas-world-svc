/**
 * Event → asset-key binding contract (F-006 Phase 3).
 *
 * This is the authoritative test for the spine's binding contract: every
 * asset-bearing SYNCED schema field maps to exactly one codegen asset-key, and
 * no asset-key exists without a backing server config value. Downstream content
 * lanes (sfx-events, vfx-events, character-content) bind against these forms,
 * so a silent drift here would break every dependent lane.
 *
 * We validate the COMMITTED `generated/asset-keys.json` against the SAME server
 * configs the generator reads (MOB_TYPES / WEAPON_TYPES / SKILLS) — reconstructing
 * the documented forms and asserting exact equality in both directions. We do NOT
 * import the generator itself: it lives under `scripts/` (outside this package's
 * tsc `rootDir: src`), so importing it breaks `tsc --noEmit`. Reconstructing from
 * the configs is a stronger drift check anyway (committed file ↔ live config value
 * spaces). Keys derive from server-authoritative config only — never client input.
 */
import * as fs from 'fs'
import * as path from 'path'
import { MOB_TYPES } from '../../config/mobs'
import { WEAPON_TYPES } from '../../config/combat/projectileInteractions'
import { SKILLS } from '../../config/skills'

const OUT = path.resolve(__dirname, '../../../generated/asset-keys.json')

type AssetKey = { id: string; kind: string }

/** The expected id→kind map, reconstructed from the live server configs. */
function expectedKeys(): Map<string, string> {
  const m = new Map<string, string>()
  for (const mob of MOB_TYPES) m.set(`mob:${mob.id}`, 'character')
  for (const type of Object.values(WEAPON_TYPES)) m.set(`projectile:${type}`, 'vfx')
  m.set('player', 'character')
  m.set('npc', 'character')
  for (const skill of Object.values(SKILLS))
    for (const effect of skill.effects) m.set(`zone:${effect.type}`, 'vfx')
  return m
}

describe('event → asset-key binding contract', () => {
  const onDisk: { version: number; keys: AssetKey[] } = JSON.parse(fs.readFileSync(OUT, 'utf8'))
  const ids = new Set(onDisk.keys.map(k => k.id))
  const kindById = new Map(onDisk.keys.map(k => [k.id, k.kind]))
  const expected = expectedKeys()

  it('committed asset-keys.json exactly matches the config-derived key set (no drift)', () => {
    // Every committed id/kind is backed by a config value...
    for (const k of onDisk.keys) {
      expect(expected.has(k.id)).toBe(true)
      expect(k.kind).toBe(expected.get(k.id))
    }
    // ...and every config value has a committed key (no missing keys).
    for (const [id, kind] of expected) {
      expect(ids.has(id)).toBe(true)
      expect(kindById.get(id)).toBe(kind)
    }
  })

  it('Mob.mobTypeId → mob:<id> for every configured mob (character)', () => {
    for (const mob of MOB_TYPES) {
      const key = `mob:${mob.id}`
      expect(ids.has(key)).toBe(true)
      expect(kindById.get(key)).toBe('character')
    }
  })

  it('Projectile.type → projectile:<Type> for every weapon type (vfx)', () => {
    for (const type of Object.values(WEAPON_TYPES)) {
      const key = `projectile:${type}`
      expect(ids.has(key)).toBe(true)
      expect(kindById.get(key)).toBe('vfx')
    }
  })

  it('ZoneEffect.type → zone:<type> for every effect type used by skills (vfx)', () => {
    const zoneTypes = new Set<string>()
    for (const skill of Object.values(SKILLS)) {
      for (const effect of skill.effects) zoneTypes.add(effect.type)
    }
    expect(zoneTypes.size).toBeGreaterThan(0)
    for (const t of zoneTypes) {
      const key = `zone:${t}`
      expect(ids.has(key)).toBe(true)
      expect(kindById.get(key)).toBe('vfx')
    }
  })

  it('fixed-actor kinds player + npc are present (character)', () => {
    for (const key of ['player', 'npc']) {
      expect(ids.has(key)).toBe(true)
      expect(kindById.get(key)).toBe('character')
    }
  })

  it('no asset-key exists without a backing config value (no orphan keys)', () => {
    for (const key of ids) {
      expect(expected.has(key)).toBe(true)
    }
  })

  it('every emitted kind is one the render-spec taxonomy can resolve', () => {
    // Guard J (check_asset_manifest.mjs) enforces renderability; here we assert
    // the codegen only emits kinds the contract knows how to bind.
    const emitted = new Set(onDisk.keys.map(k => k.kind))
    for (const kind of emitted) {
      expect(['character', 'vfx']).toContain(kind)
    }
  })
})
