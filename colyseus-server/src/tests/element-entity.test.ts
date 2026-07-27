import { Metadata } from '@colyseus/schema'
import { Mob } from '../schemas/Mob'
import { WEAPONS } from '../config/combat/weapons'
import { MOB_TYPES } from '../config/mobs'

const mob = (over: Record<string, unknown> = {}) =>
  new Mob({
    id: 'm',
    x: 0,
    y: 0,
    radius: 1,
    maxHealth: 100,
    pAtk: 10,
    attackRange: 5,
    atkWindDownTime: 1000,
    density: 1,
    ...over,
  })

describe('entity element', () => {
  it('defaults to neutral', () => {
    expect(mob().element).toBe('neutral')
  })

  it('is seeded from constructor options', () => {
    expect(mob({ element: 'void' }).element).toBe('void')
  })

  it('falls back to neutral when seeded with a non-canon id', () => {
    // The field is `@type('string')`, so an untyped/deserialised caller can smuggle
    // anything in. Seeding must not let a value outside the 7 canon ids stick.
    expect(mob({ element: 'lightning' }).element).toBe('neutral')
  })

  it('is a synced colyseus field', () => {
    // Metadata.getFields() is the encoder's own record of @type-annotated fields
    // (it walks the prototype chain, so WorldLife fields show up on Mob).
    const fields = Metadata.getFields(Mob) as Record<string, unknown>
    expect(fields.element).toBe('string')
    // Sanity: the same lookup does NOT report server-only (un-annotated) fields,
    // so the assertion above genuinely proves `element` is synced.
    expect(fields.mDef).toBeUndefined()
  })
})

describe('config element', () => {
  it('leaves existing weapons neutral by default', () => {
    for (const weapon of Object.values(WEAPONS)) {
      expect(weapon.element ?? 'neutral').toBe('neutral')
    }
  })

  it('leaves every shipped mob attack neutral by default', () => {
    for (const mobType of MOB_TYPES) {
      for (const strategy of mobType.atkStrategies) {
        for (const attack of strategy.attacks) {
          expect(attack.element ?? 'neutral').toBe('neutral')
        }
      }
    }
  })
})
