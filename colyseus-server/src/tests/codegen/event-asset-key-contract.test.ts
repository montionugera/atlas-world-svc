/**
 * Event → asset-key binding contract (F-006 Phase 3).
 *
 * This is the authoritative test for the spine's binding contract: every
 * asset-bearing SYNCED schema field maps to exactly one codegen asset-key, and
 * no asset-key exists without a backing server config value. Downstream content
 * lanes (sfx-events, vfx-events, character-content) bind against these forms,
 * so a silent drift here would break every dependent lane.
 *
 * Single enumeration source: we import the generator's own `genAssetKeys()` and
 * the SAME configs it reads (MOB_TYPES / WEAPON_TYPES / SKILLS). We do NOT
 * re-implement the generator's key-building — instead we assert (a) the
 * committed file equals the generator's output (round-trip), and (b) the
 * documented event→key forms hold against the live config value spaces. Keys
 * derive from server-authoritative config only — never from client input.
 */
import * as fs from 'fs'
import * as path from 'path'
import { genAssetKeys } from '../../../scripts/codegen/gen-asset-keys'
import { MOB_TYPES } from '../../config/mobs'
import { WEAPON_TYPES } from '../../config/combat/projectileInteractions'
import { SKILLS } from '../../config/skills'

const OUT = path.resolve(__dirname, '../../../generated/asset-keys.json')

describe('event → asset-key binding contract', () => {
  const generated = genAssetKeys()
  const ids = new Set(generated.keys.map(k => k.id))

  it('committed asset-keys.json equals the generator output (single source of truth)', () => {
    const onDisk = JSON.parse(fs.readFileSync(OUT, 'utf8'))
    // Deep equality: the committed file must never drift from genAssetKeys().
    expect(onDisk).toEqual(generated)
  })

  it('Mob.mobTypeId → mob:<id> for every configured mob (character)', () => {
    for (const mob of MOB_TYPES) {
      const key = `mob:${mob.id}`
      expect(ids.has(key)).toBe(true)
      expect(generated.keys.find(k => k.id === key)!.kind).toBe('character')
    }
  })

  it('Projectile.type → projectile:<Type> for every weapon type (vfx)', () => {
    for (const type of Object.values(WEAPON_TYPES)) {
      const key = `projectile:${type}`
      expect(ids.has(key)).toBe(true)
      expect(generated.keys.find(k => k.id === key)!.kind).toBe('vfx')
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
      expect(generated.keys.find(k => k.id === key)!.kind).toBe('vfx')
    }
  })

  it('fixed-actor kinds player + npc are present (character)', () => {
    for (const key of ['player', 'npc']) {
      expect(ids.has(key)).toBe(true)
      expect(generated.keys.find(k => k.id === key)!.kind).toBe('character')
    }
  })

  it('no asset-key exists without a backing config value (no orphan keys)', () => {
    const mobKeys = new Set(MOB_TYPES.map(m => `mob:${m.id}`))
    const projKeys = new Set(Object.values(WEAPON_TYPES).map(t => `projectile:${t}`))
    const zoneKeys = new Set<string>()
    for (const skill of Object.values(SKILLS))
      for (const effect of skill.effects) zoneKeys.add(`zone:${effect.type}`)
    const fixed = new Set(['player', 'npc'])

    for (const key of ids) {
      const backed =
        mobKeys.has(key) || projKeys.has(key) || zoneKeys.has(key) || fixed.has(key)
      expect(backed).toBe(true)
    }
  })

  it('every emitted kind is one the render-spec taxonomy can resolve', () => {
    // Guard I (check_asset_manifest.mjs) enforces renderability; here we assert
    // the codegen only emits kinds the contract knows how to bind.
    const emitted = new Set(generated.keys.map(k => k.kind))
    for (const kind of emitted) {
      expect(['character', 'vfx']).toContain(kind)
    }
  })
})
