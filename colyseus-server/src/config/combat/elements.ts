/**
 * Elements - RO-style elemental damage table (World Wisdom / F-017).
 *
 * Canon: docs/superpowers/specs/2026-07-27-world-wisdom-design.md
 * Natural cycle (one-directional): water > fire > earth > wind > water.
 * Opposed pair (mutual): holy <-> void.
 * `neutral` is the inert baseline: 1.0 as attacker and as defender.
 */

export const ELEMENTS = ['neutral', 'earth', 'water', 'wind', 'fire', 'holy', 'void'] as const

export type Element = (typeof ELEMENTS)[number]

export const DEFAULT_ELEMENT: Element = 'neutral'

/** Advantage. Cycle advantage and the holy/void duel both use this. */
const STRONG = 2.0
/** Reverse-of-cycle, and every element against itself. */
const WEAK = 0.5
const EVEN = 1.0

const ELEMENT_MULTIPLIER: Record<Element, Record<Element, number>> = {
  neutral: {
    neutral: EVEN,
    earth: EVEN,
    water: EVEN,
    wind: EVEN,
    fire: EVEN,
    holy: EVEN,
    void: EVEN,
  },
  earth: {
    neutral: EVEN,
    earth: WEAK,
    water: EVEN,
    wind: STRONG,
    fire: WEAK,
    holy: EVEN,
    void: EVEN,
  },
  water: {
    neutral: EVEN,
    earth: EVEN,
    water: WEAK,
    wind: WEAK,
    fire: STRONG,
    holy: EVEN,
    void: EVEN,
  },
  wind: {
    neutral: EVEN,
    earth: WEAK,
    water: STRONG,
    wind: WEAK,
    fire: EVEN,
    holy: EVEN,
    void: EVEN,
  },
  fire: {
    neutral: EVEN,
    earth: STRONG,
    water: WEAK,
    wind: EVEN,
    fire: WEAK,
    holy: EVEN,
    void: EVEN,
  },
  holy: {
    neutral: EVEN,
    earth: EVEN,
    water: EVEN,
    wind: EVEN,
    fire: EVEN,
    holy: WEAK,
    void: STRONG,
  },
  void: {
    neutral: EVEN,
    earth: EVEN,
    water: EVEN,
    wind: EVEN,
    fire: EVEN,
    holy: STRONG,
    void: WEAK,
  },
}

export function isElement(value: unknown): value is Element {
  return typeof value === 'string' && (ELEMENTS as readonly string[]).includes(value)
}

/** Damage multiplier for an attack of `attack` element landing on a `defense` element target. */
export function getElementMultiplier(attack: Element, defense: Element): number {
  return ELEMENT_MULTIPLIER[attack][defense]
}
