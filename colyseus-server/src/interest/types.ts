import { SpatialEntity } from './SpatialHash'

/**
 * Shared shapes for the interest subsystem. Lives apart from InterestManager.ts
 * so visibility.ts (predicates) and collect.ts (collectors) can both import
 * InterestEntity without importing InterestManager.ts, which would create an
 * import cycle (InterestManager.ts already imports from visibility.ts).
 */

/** An entity as InterestManager sees it: a position plus the schema ref to filter. */
export interface InterestEntity extends SpatialEntity {
  /** The @colyseus/schema instance handed to StateView.add / .remove.
   * Typed as object because it's an opaque reference that could be Schema,
   * ArraySchema, MapSchema, CollectionSchema, SetSchema, or a test mock.
   */
  ref: object
}

export interface InterestViewer {
  sessionId: string
  x: number
  y: number
}
