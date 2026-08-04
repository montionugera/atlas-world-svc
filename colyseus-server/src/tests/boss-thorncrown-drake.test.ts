import { readFileSync } from 'fs'
import { join } from 'path'
import { MOB_TYPES } from '../config/mobs'

const REPO_ROOT = join(__dirname, '../../..')

type BestiaryDesign = { id: string; element?: string }

function bestiaryDesign(id: string): BestiaryDesign {
  const raw = readFileSync(join(REPO_ROOT, 'content/bestiary/bestiary.json'), 'utf8')
  const parsed = JSON.parse(raw) as BestiaryDesign[] | { designs: BestiaryDesign[] }
  const designs = Array.isArray(parsed) ? parsed : parsed.designs
  const found = designs.find(d => d.id === id)
  if (!found) throw new Error(`bestiary design ${id} not found`)
  return found
}

describe('Thorncrown Drake', () => {
  const drake = MOB_TYPES.find(m => m.id === 'thorncrown_drake')

  it('is registered in MOB_TYPES', () => {
    expect(drake).toBeDefined()
  })

  it('declares only strategies the factory can build', () => {
    // attackStrategyFactory only builds 'melee', 'spear' and 'doubleAttack'.
    for (const strategy of drake!.atkStrategies) {
      expect(['melee', 'spear', 'doubleAttack']).toContain(strategy.id)
    }
  })

  it('carries no ATTACK element (element-entity.test.ts must stay green)', () => {
    for (const strategy of drake!.atkStrategies) {
      for (const attack of strategy.attacks) {
        expect(attack.element ?? 'neutral').toBe('neutral')
      }
    }
  })

  // F-030: the roster<->runtime drift guard promised by the spec's §3.2 mitigation.
  // The earth defence element is a documented G-ELEM exception; this test makes it
  // impossible for the two sides to disagree silently.
  it('defends with the element its bestiary row declares', () => {
    const design = bestiaryDesign('mob-thorncrown-drake')
    expect(design.element).toBe('earth')
    expect(drake!.element).toBe(design.element)
  })
})
