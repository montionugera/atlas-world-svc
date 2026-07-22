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
}

const VERSION = 1

/** Build the valid mob type id set from the live server config. */
export function genMobTypes(): MobTypeSet {
  const mobTypes = [...new Set(MOB_TYPES.map((m) => m.id))].sort()
  return { version: VERSION, mobTypes }
}
