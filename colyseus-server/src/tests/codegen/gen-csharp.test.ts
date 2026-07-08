import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const OUT = path.resolve(__dirname, '../../../generated/csharp/Runtime')

describe('gen-csharp pipeline', () => {
  beforeAll(() => {
    execSync('bash scripts/codegen/gen-csharp.sh', {
      cwd: path.resolve(__dirname, '../../..'),
      stdio: 'inherit',
    })
  }, 120000)

  const read = (f: string) => fs.readFileSync(path.join(OUT, f), 'utf8')

  it('generates the previously-crashing classes', () => {
    expect(fs.existsSync(path.join(OUT, 'GameState.cs'))).toBe(true)
    expect(fs.existsSync(path.join(OUT, 'Mob.cs'))).toBe(true)
    expect(fs.existsSync(path.join(OUT, 'NPC.cs'))).toBe(true)
  })

  it('GameState has npcs and zoneEffects (the drift sentinels)', () => {
    const gs = read('GameState.cs')
    expect(gs).toMatch(/npcs/)
    expect(gs).toMatch(/zoneEffects/)
  })

  it('WorldLife has teamId, resistances, battleStatuses', () => {
    const wl = read('WorldLife.cs')
    expect(wl).toMatch(/teamId/)
    expect(wl).toMatch(/resistances/)
    expect(wl).toMatch(/battleStatuses/)
  })
})
