import type { StateView, Ref } from '@colyseus/schema'
import { SpatialHash, SpatialEntity } from './SpatialHash'
import { VisibilityPredicate, VisibilityContext } from './visibility'

/** An entity as InterestManager sees it: a position plus the schema ref to filter. */
export interface InterestEntity extends SpatialEntity {
  /** The @colyseus/schema instance handed to StateView.add / .remove.
   * Typed as any because it's an opaque reference — could be Schema, ArraySchema,
   * MapSchema, CollectionSchema, SetSchema, or a test mock. The StateView is the authority.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: any
}

export interface InterestViewer {
  sessionId: string
  x: number
  y: number
}

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
  visibleRefs: Map<string, any>
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
        if (!slot.visible.has(own.id)) {
          slot.view.add(own.ref)
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
        if (!ctx.wasVisible) {
          slot.view.add(candidate.ref)
          slot.visibleRefs.set(candidate.id, candidate.ref)
        }
      }

      // Anything visible last pass but not this one leaves the view. This also
      // covers despawns, since a despawned entity cannot appear in `next`.
      for (const id of slot.visible) {
        if (next.has(id)) continue
        const ref = slot.visibleRefs.get(id)
        if (ref) slot.view.remove(ref)
        slot.visibleRefs.delete(id)
      }

      slot.visible = next
    }
  }
}
