import {
  ELEMENTS,
  DEFAULT_ELEMENT,
  getElementMultiplier,
  isElement,
  type Element,
} from '../config/combat/elements'

// Expected table, transcribed from the approved spec (rows = attack, cols = defense).
const EXPECTED: Record<Element, Record<Element, number>> = {
  neutral: { neutral: 1.0, earth: 1.0, water: 1.0, wind: 1.0, fire: 1.0, holy: 1.0, void: 1.0 },
  earth: { neutral: 1.0, earth: 0.5, water: 1.0, wind: 2.0, fire: 0.5, holy: 1.0, void: 1.0 },
  water: { neutral: 1.0, earth: 1.0, water: 0.5, wind: 0.5, fire: 2.0, holy: 1.0, void: 1.0 },
  wind: { neutral: 1.0, earth: 0.5, water: 2.0, wind: 0.5, fire: 1.0, holy: 1.0, void: 1.0 },
  fire: { neutral: 1.0, earth: 2.0, water: 0.5, wind: 1.0, fire: 0.5, holy: 1.0, void: 1.0 },
  holy: { neutral: 1.0, earth: 1.0, water: 1.0, wind: 1.0, fire: 1.0, holy: 0.5, void: 2.0 },
  void: { neutral: 1.0, earth: 1.0, water: 1.0, wind: 1.0, fire: 1.0, holy: 2.0, void: 0.5 },
}

describe('elements', () => {
  it('exposes exactly the seven canon elements', () => {
    expect([...ELEMENTS]).toEqual(['neutral', 'earth', 'water', 'wind', 'fire', 'holy', 'void'])
    expect(DEFAULT_ELEMENT).toBe('neutral')
  })

  it('matches the approved multiplier table in all 49 cells', () => {
    for (const atk of ELEMENTS) {
      for (const def of ELEMENTS) {
        expect(`${atk}->${def}=${getElementMultiplier(atk, def)}`).toBe(
          `${atk}->${def}=${EXPECTED[atk][def]}`
        )
      }
    }
  })

  it('keeps neutral inert on both sides', () => {
    for (const e of ELEMENTS) {
      expect(getElementMultiplier('neutral', e)).toBe(1.0)
      expect(getElementMultiplier(e, 'neutral')).toBe(1.0)
    }
  })

  it('makes the natural cycle one-directional and holy/void mutual', () => {
    // water > fire > earth > wind > water
    expect(getElementMultiplier('water', 'fire')).toBe(2.0)
    expect(getElementMultiplier('fire', 'water')).toBe(0.5)
    expect(getElementMultiplier('holy', 'void')).toBe(2.0)
    expect(getElementMultiplier('void', 'holy')).toBe(2.0)
  })

  it('resists itself for every non-neutral element', () => {
    for (const e of ELEMENTS) {
      expect(getElementMultiplier(e, e)).toBe(e === 'neutral' ? 1.0 : 0.5)
    }
  })

  it('isElement narrows only valid ids', () => {
    expect(isElement('holy')).toBe(true)
    expect(isElement('Holy')).toBe(false)
    expect(isElement('lightning')).toBe(false)
    expect(isElement(undefined)).toBe(false)
    expect(isElement(null)).toBe(false)
    expect(isElement(0)).toBe(false)
    expect(isElement({ element: 'holy' })).toBe(false)
    expect(isElement(['holy'])).toBe(false)
  })
})
