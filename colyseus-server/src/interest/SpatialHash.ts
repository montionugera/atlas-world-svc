export interface SpatialEntity {
  id: string
  x: number
  y: number
}

/**
 * Uniform-grid spatial hash. Rebuilt from scratch each tick — with a few
 * thousand entities that is cheaper and far simpler than incremental
 * insert/remove bookkeeping, and it cannot drift out of sync with the world.
 *
 * Deliberately knows nothing about Colyseus or game types so it stays
 * trivially testable.
 */
export class SpatialHash<T extends SpatialEntity> {
  private readonly cells = new Map<string, T[]>()

  constructor(private readonly cellSize: number) {
    if (cellSize <= 0) throw new Error(`SpatialHash cellSize must be > 0, got ${cellSize}`)
  }

  clear(): void {
    this.cells.clear()
  }

  insert(entity: T): void {
    const key = this.keyFor(entity.x, entity.y)
    const bucket = this.cells.get(key)
    if (bucket) bucket.push(entity)
    else this.cells.set(key, [entity])
  }

  /** All inserted entities whose euclidean distance to (x, y) is <= radius. */
  queryRadius(x: number, y: number, radius: number): T[] {
    const minCx = Math.floor((x - radius) / this.cellSize)
    const maxCx = Math.floor((x + radius) / this.cellSize)
    const minCy = Math.floor((y - radius) / this.cellSize)
    const maxCy = Math.floor((y + radius) / this.cellSize)

    const radiusSq = radius * radius
    const results: T[] = []

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(`${cx}:${cy}`)
        if (!bucket) continue
        for (const entity of bucket) {
          const dx = entity.x - x
          const dy = entity.y - y
          if (dx * dx + dy * dy <= radiusSq) results.push(entity)
        }
      }
    }

    return results
  }

  private keyFor(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`
  }
}
