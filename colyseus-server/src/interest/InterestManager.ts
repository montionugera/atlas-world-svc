import type { StateView, Ref } from '@colyseus/schema'
import { SpatialHash } from './SpatialHash'
import { VisibilityPredicate, VisibilityContext } from './visibility'
import type { InterestEntity, InterestViewer } from './types'

// Re-exported for backward compatibility: existing call sites import these
// interfaces from here. Canonical definitions live in ./types (see that
// file's comment for why — avoids an import cycle with visibility.ts).
export type { InterestEntity, InterestViewer } from './types'

export interface InterestManagerOptions {
  predicate: VisibilityPredicate
  cellSize: number
  /**
   * Widest distance the predicate could return true for — i.e. radius * hysteresis
   * for the default predicate. The hash only narrows candidates; the predicate is
   * the authority. Setting this tighter than the predicate's reach silently hides
   * entities, so it must be >= the predicate's maximum range.
   */
  candidateRadius: number
}

interface ViewerSlot {
  view: StateView
  /** The viewer's own entity id — always visible, never predicate-tested. */
  ownEntityId: string
  visible: Set<string>
  /** Map of id -> ref for entities currently visible, to support despawns. */
  visibleRefs: Map<string, object>
}

/**
 * Owns one StateView per connected client and keeps it in sync with a
 * per-client visible set.
 *
 * Rebuilds the spatial index from scratch each pass: with a few thousand
 * entities that is cheaper than incremental bookkeeping and cannot drift out of
 * sync with the world.
 */
export class InterestManager {
  private readonly hash: SpatialHash<InterestEntity>
  private readonly predicate: VisibilityPredicate
  private readonly candidateRadius: number
  private readonly viewers = new Map<string, ViewerSlot>()

  constructor(opts: InterestManagerOptions) {
    this.hash = new SpatialHash<InterestEntity>(opts.cellSize)
    this.predicate = opts.predicate
    this.candidateRadius = opts.candidateRadius
  }

  attach(sessionId: string, view: StateView, ownEntityId: string): void {
    this.viewers.set(sessionId, { view, ownEntityId, visible: new Set(), visibleRefs: new Map() })
  }

  detach(sessionId: string): void {
    this.viewers.delete(sessionId)
  }

  visibleIdsFor(sessionId: string): ReadonlySet<string> {
    return this.viewers.get(sessionId)?.visible ?? new Set<string>()
  }

  update(entities: Iterable<InterestEntity>, viewers: Iterable<InterestViewer>): void {
    if (this.viewers.size === 0) return

    // Index by id so despawned entities can be dropped from stale visible sets,
    // and so the viewer's own entity can be resolved without a scan.
    const byId = new Map<string, InterestEntity>()
    this.hash.clear()
    for (const entity of entities) {
      byId.set(entity.id, entity)
      this.hash.insert(entity)
    }

    // The hash only narrows the candidate set; the predicate is the authority
    // on visibility. candidateRadius must never be tighter than the predicate's
    // own reach or entities are silently hidden.
    const queryRadius = this.candidateRadius

    for (const viewer of viewers) {
      const slot = this.viewers.get(viewer.sessionId)
      if (!slot) continue

      const next = new Set<string>()

      // Invariant: a player always sees itself, whatever the predicate says.
      // Without this a client can be blind to its own character — and with
      // @view() on the root collections it would receive nothing at all.
      const own = byId.get(slot.ownEntityId)
      if (own) {
        next.add(own.id)
        // Re-add whenever the ref identity changed too, not just on first-seen:
        // if an id is rebound to a different schema instance while still
        // "visible" (MapSchema.set overwrites silently on id collision), the
        // view must drop the stale ref and pick up the live one, or the view
        // keeps pointing at a dead instance forever.
        if (!slot.visible.has(own.id) || slot.visibleRefs.get(own.id) !== own.ref) {
          // Cast to Ref: schema object (Schema | ArraySchema | MapSchema | etc) or test mock.
          slot.view.add(own.ref as Ref)
          slot.visibleRefs.set(own.id, own.ref)
        }
      }

      for (const candidate of this.hash.queryRadius(viewer.x, viewer.y, queryRadius)) {
        if (candidate.id === slot.ownEntityId) continue

        const ctx: VisibilityContext = {
          viewerId: viewer.sessionId,
          viewerX: viewer.x,
          viewerY: viewer.y,
          wasVisible: slot.visible.has(candidate.id),
        }

        if (!this.predicate(candidate, ctx)) continue

        next.add(candidate.id)
        // Same re-add-on-identity-change rule as the own-entity path above:
        // wasVisible alone isn't enough when an id can be rebound to a new
        // schema instance while still "visible" from the set's point of view.
        if (!ctx.wasVisible || slot.visibleRefs.get(candidate.id) !== candidate.ref) {
          slot.view.add(candidate.ref as Ref)
          slot.visibleRefs.set(candidate.id, candidate.ref)
        }
      }

      // Anything visible last pass but not this one leaves the view. This also
      // covers despawns, since a despawned entity cannot appear in `next`.
      for (const id of slot.visible) {
        if (next.has(id)) continue
        const ref = slot.visibleRefs.get(id)
        if (ref) slot.view.remove(ref as Ref)
        slot.visibleRefs.delete(id)
      }

      slot.visible = next
    }
  }
}
