/**
 * Pure builder for generated/mob-types.json — the set of valid server mob type
 * ids (F-013). Lives under src/ (inside the tsc rootDir) so the direct-import
 * unit test compiles in the production build; the CLI entrypoint that writes
 * the artifact stays in scripts/codegen/gen-mob-types.ts alongside the other
 * codegen drivers and wraps this function.
 */
import { MOB_TYPES } from './index'

export interface MobTypeSet {
  version: number
  mobTypes: string[]
  /**
   * F-031: defence element per mob id, omitted entirely when the mob is
   * neutral (so this map stays small and "absent means neutral" is the single
   * reading). Consumed by the content gate's G-BESTIARY-SHEET rule, which has
   * no other way to see a runtime element: the character sheet cannot record
   * one (`character.schema.json` is `additionalProperties: false`) and a .mjs
   * gate cannot import TypeScript.
   */
  elements: Record<string, string>
}

// Bumped to 2 by F-031 when `elements` was added. Additive only — every
// existing consumer reads `mobTypes` and ignores unknown keys.
const VERSION = 2

/** Build the valid mob type id set from the live server config. */
export function genMobTypes(): MobTypeSet {
  const mobTypes = [...new Set(MOB_TYPES.map((m) => m.id))].sort()
  const elements: Record<string, string> = {}
  for (const id of mobTypes) {
    const element = MOB_TYPES.find((m) => m.id === id)?.element
    if (element) elements[id] = element
  }
  return { version: VERSION, mobTypes, elements }
}
