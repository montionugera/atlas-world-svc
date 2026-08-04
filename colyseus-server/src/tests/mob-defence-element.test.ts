/**
 * F-030: MobTypeConfig.element is the DEFENCE element (World Wisdom / F-017).
 * Before this change no mob ever received one, so every entity defended as neutral
 * and the 7x7 table in DamageCalculator was a no-op.
 */

// Two synthetic mob types — one elemental, one not — so the spawn path can be
// asserted without depending on any shipped MOB_TYPES entry carrying an element.
// (Names must start with `mock`/`MOCK` so jest's hoist check allows the reference.)
const MOCK_EARTH_TYPE = {
  id: 'test_earth_mob',
  name: 'Test Earth Mob',
  hp: 100,
  radius: 5,
  element: 'earth',
  stats: {},
  atkStrategies: [],
}

const MOCK_PLAIN_TYPE = {
  id: 'test_plain_mob',
  name: 'Test Plain Mob',
  hp: 100,
  radius: 5,
  stats: {},
  atkStrategies: [],
}

const MOCK_SPAWN_AREAS = [
  {
    id: 'elem-area',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    count: 1,
    spawnIntervalMs: 1000,
    mobType: MOCK_EARTH_TYPE.id,
  },
  {
    id: 'plain-area',
    x: 20,
    y: 20,
    width: 10,
    height: 10,
    count: 1,
    spawnIntervalMs: 1000,
    mobType: MOCK_PLAIN_TYPE.id,
  },
]

jest.mock('../config/mapConfig', () => {
  const original = jest.requireActual('../config/mapConfig') as any
  return {
    ...original,
    getMobSpawnAreasForMap: jest.fn(() => MOCK_SPAWN_AREAS),
  }
})

jest.mock('../config/mobTypesConfig', () => {
  const original = jest.requireActual('../config/mobTypesConfig') as any
  return {
    ...original,
    getMobTypeById: jest.fn((id: string) => {
      if (id === MOCK_EARTH_TYPE.id) return MOCK_EARTH_TYPE
      if (id === MOCK_PLAIN_TYPE.id) return MOCK_PLAIN_TYPE
      return original.getMobTypeById(id)
    }),
  }
})

import { MOB_TYPES } from '../config/mobs'
import { MOB_STATS } from '../config/combatConfig'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { eventBus } from '../events/EventBus'
import type { MobTypeConfig } from '../config/mobs/types'

describe('mob defence element', () => {
  it('is declarable on MobTypeConfig', () => {
    const config: MobTypeConfig = {
      id: 'test_earth',
      name: 'Test Earth',
      element: 'earth',
      stats: {},
      atkStrategies: [],
    }
    expect(config.element).toBe('earth')
  })

  it('reaches the spawned Mob', () => {
    const mob = new Mob({
      id: 'm1',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      element: 'earth',
      maxMoveSpeed: MOB_STATS.maxMoveSpeed,
      attackStrategies: [],
    })
    expect(mob.element).toBe('earth')
  })

  it('defaults to neutral when the config omits it', () => {
    const mob = new Mob({
      id: 'm2',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      element: undefined,
      maxMoveSpeed: MOB_STATS.maxMoveSpeed,
      attackStrategies: [],
    })
    expect(mob.element).toBe('neutral')
  })

  it('leaves every mob type that predates F-030 neutral', () => {
    for (const mobType of MOB_TYPES) {
      if (mobType.id === 'thorncrown_drake') continue
      expect(mobType.element ?? 'neutral').toBe('neutral')
    }
  })
})

/**
 * The delete-the-rule guard. The four cases above construct `new Mob({...})` by hand,
 * so they all stay green even if MobLifeCycleManager stops forwarding the element —
 * verified by deleting the line and re-running. These two go through the real spawn
 * path, so they are the ones that actually pin the wiring.
 */
describe('mob defence element at spawn (MobLifeCycleManager)', () => {
  const roomId = 'test-room-f030'
  let state: GameState
  let manager: MobLifeCycleManager

  beforeEach(() => {
    state = new GameState('map-01-sector-a', roomId)
    manager = new MobLifeCycleManager(roomId, state)
  })

  afterEach(() => {
    state.stopAI()
    eventBus.removeRoomListeners(roomId)
  })

  it('forwards the configured element to the spawned Mob', () => {
    manager.seedInitial()

    const spawned = [...state.mobs.values()].find(m => m.mobTypeId === MOCK_EARTH_TYPE.id)
    expect(spawned).toBeDefined()
    expect(spawned!.element).toBe('earth')
  })

  it('leaves a mob type that declares no element neutral', () => {
    manager.seedInitial()

    const spawned = [...state.mobs.values()].find(m => m.mobTypeId === MOCK_PLAIN_TYPE.id)
    expect(spawned).toBeDefined()
    expect(spawned!.element).toBe('neutral')
  })
})
