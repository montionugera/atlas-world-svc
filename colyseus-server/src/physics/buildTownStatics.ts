/**
 * Town plan → static collision bodies (F-040, design §5).
 *
 * A town plan (`content/towns/town-<id>.json`, validated by
 * `content/schemas/town-plan.schema.json`) is authored in the town's OWN local
 * coordinate space. `origin` is the world-space point that local (0, 0) maps to —
 * derived from the town's `at` point in the geography file (decision D2).
 *
 * Only `footprints` become collision. Per design §5:
 * - `roads` and `plazas` are the ABSENCE of collision, not surfaces — there is no
 *   ground plane to author, so they produce no bodies.
 * - `water` is deliberately NOT collision here. Whether a river blocks, slows or
 *   drowns is an undecided gameplay rule (design §10), and inventing one in the
 *   binder would be the wrong place to decide it.
 * - `landmarks` are points of interest for orientation and rendering, not obstacles.
 */

import type { CreateStaticBoxOptions } from './PlanckPhysicsManager'

/** A point in the plan's local space, or in world space once offset by `origin`. */
export interface TownPoint {
  x: number
  y: number
}

/** A building footprint: an axis-aligned rect `[x0, y0, x1, y1]` in local units. */
export interface TownFootprint {
  id: string
  kind: string
  rect: number[]
  /** Rendering hint only — collision is the 2D footprint (design §2). */
  storeys?: number
  entranceOn?: string
}

/**
 * The subset of a town plan this binder reads. The non-collision arrays are declared
 * so that the "these produce zero bodies" contract is visible in the type, not just
 * in the tests.
 */
export interface TownPlan {
  town: string
  extent: { width: number; height: number }
  footprints: TownFootprint[]
  /** Not collision — see file header. */
  roads?: unknown[]
  /** Not collision — see file header. */
  plazas?: unknown[]
  /** Not collision — see file header. */
  water?: unknown[]
  /** Not collision — see file header. */
  landmarks?: unknown[]
}

/**
 * Anything that can make a static box. `PlanckPhysicsManager` satisfies this
 * structurally; tests can pass a recording fake. `TBody` is inferred from the target,
 * so a real manager yields `planck.Body[]` with no cast.
 */
export interface StaticBoxTarget<TBody> {
  createStaticBox(options: CreateStaticBoxOptions): TBody
}

export interface BuildTownStaticsOptions<TBody> {
  plan: TownPlan
  physicsManager: StaticBoxTarget<TBody>
  /** World-space position of the plan's local (0, 0). */
  origin: TownPoint
}

/**
 * Create one static body per footprint, offset into world space by `origin`.
 * Returns the created bodies in plan order.
 */
export function buildTownStatics<TBody>(options: BuildTownStaticsOptions<TBody>): TBody[] {
  const { plan, physicsManager, origin } = options

  return plan.footprints.map(footprint => {
    const [x0, y0, x1, y1] = footprint.rect

    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)

    return physicsManager.createStaticBox({
      id: footprint.id,
      center: {
        x: (minX + maxX) / 2 + origin.x,
        y: (minY + maxY) / 2 + origin.y,
      },
      halfWidth: (maxX - minX) / 2,
      halfHeight: (maxY - minY) / 2,
    })
  })
}
