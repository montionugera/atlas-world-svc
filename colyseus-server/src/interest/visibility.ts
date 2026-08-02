import { InterestEntity } from './types'

export interface VisibilityContext {
  viewerId: string
  viewerX: number
  viewerY: number
  /** True if this candidate was visible to this viewer on the previous pass. */
  wasVisible: boolean
}

/**
 * Decides whether `candidate` should be in `ctx.viewerId`'s view this tick.
 *
 * This is the extension seam required by I-053 (phasing). InterestManager must
 * never hard-wire a distance query — a phase predicate composes here with `&&`
 * and needs no change to the manager. See the design spec, Stage 1 ->
 * "The phasing hook (I-053)".
 *
 * `candidate` is typed as InterestEntity (not the narrower SpatialEntity) so a
 * future phase predicate can reach `candidate.ref` directly instead of keying
 * off string ids via an out-of-band table.
 */
export type VisibilityPredicate = (candidate: InterestEntity, ctx: VisibilityContext) => boolean

/**
 * Distance predicate with hysteresis: an entity becomes visible at `radius` but
 * stays visible out to `radius * hysteresis`. Without the wider drop threshold,
 * an entity hovering on the boundary is added and removed every tick, producing
 * continuous churn on the wire and visible flicker on the client.
 */
export function createDistancePredicate(opts: {
  radius: number
  hysteresis: number
}): VisibilityPredicate {
  if (opts.hysteresis < 1) {
    throw new Error(`AOI hysteresis must be >= 1, got ${opts.hysteresis}`)
  }
  const enterSq = opts.radius * opts.radius
  const exit = opts.radius * opts.hysteresis
  const exitSq = exit * exit

  return (candidate, ctx) => {
    const dx = candidate.x - ctx.viewerX
    const dy = candidate.y - ctx.viewerY
    const distSq = dx * dx + dy * dy
    return distSq <= (ctx.wasVisible ? exitSq : enterSq)
  }
}
