import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const OUT = path.resolve(__dirname, '../../../generated/asset-keys.json')
const VALID_KINDS = ['character', 'prop', 'vfx', 'audio']

type AssetKey = { id: string; kind: string }

describe('gen-asset-keys pipeline', () => {
  beforeAll(() => {
    execSync('bash scripts/codegen/gen-asset-keys.sh', {
      cwd: path.resolve(__dirname, '../../..'),
      stdio: 'inherit',
    })
  }, 120000)

  const load = (): { version: number; keys: AssetKey[] } => JSON.parse(fs.readFileSync(OUT, 'utf8'))

  it('emits generated/asset-keys.json with version 1', () => {
    expect(fs.existsSync(OUT)).toBe(true)
    expect(load().version).toBe(1)
  })

  it('contains every known mob type id from mobTypesConfig', () => {
    const ids = load().keys.map(k => k.id)
    for (const id of [
      'mob:spear_thrower',
      'mob:hybrid',
      'mob:aggressive',
      'mob:defensive',
      'mob:balanced',
      'mob:double_attacker',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('contains projectile, fixed-actor, and zone keys', () => {
    const ids = load().keys.map(k => k.id)
    expect(ids).toContain('projectile:spear')
    expect(ids).toContain('player')
    expect(ids).toContain('npc')
    expect(ids.some(id => id.startsWith('zone:'))).toBe(true)
  })

  it('gives every entry a non-empty id and a valid kind', () => {
    const keys = load().keys
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      expect(typeof k.id).toBe('string')
      expect(k.id.length).toBeGreaterThan(0)
      expect(VALID_KINDS).toContain(k.kind)
    }
  })

  it('is deterministically sorted by id with no duplicates', () => {
    const ids = load().keys.map(k => k.id)
    expect(ids).toEqual([...ids].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })
})
