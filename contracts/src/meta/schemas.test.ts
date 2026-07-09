import {
  profileDocSchema,
  inventoryDocSchema,
  equipmentDocSchema,
  skillsDocSchema,
  questsDocSchema,
  matchEventBatchSchema,
  DEFAULT_PROFILE,
  defaultDoc,
} from './schemas'
import { COLLECTIONS } from './ids'

test('DEFAULT_PROFILE validates', () => {
  expect(profileDocSchema.parse(DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE)
})

test('unknown keys are rejected (strict)', () => {
  expect(() => profileDocSchema.parse({ ...DEFAULT_PROFILE, hax: 1 })).toThrow()
})

test('batch requires monotonic-friendly shape', () => {
  const b = {
    matchId: 'm1',
    seq: 0,
    events: [{ type: 'MOB_KILLED', userId: 'u1', targetId: 'boar', count: 1 }],
  }
  expect(matchEventBatchSchema.parse(b)).toEqual(b)
})

test('defaultDoc(inventory) validates against inventoryDocSchema', () => {
  const doc = defaultDoc(COLLECTIONS.inventory)
  expect(inventoryDocSchema.parse(doc)).toEqual(doc)
})

test('defaultDoc(equipment) validates against equipmentDocSchema', () => {
  const doc = defaultDoc(COLLECTIONS.equipment)
  expect(equipmentDocSchema.parse(doc)).toEqual(doc)
})

test('defaultDoc(skills) validates against skillsDocSchema', () => {
  const doc = defaultDoc(COLLECTIONS.skills)
  expect(skillsDocSchema.parse(doc)).toEqual(doc)
})

test('defaultDoc(quests) validates against questsDocSchema', () => {
  const doc = defaultDoc(COLLECTIONS.quests)
  expect(questsDocSchema.parse(doc)).toEqual(doc)
})
