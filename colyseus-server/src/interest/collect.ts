import { GameState } from '../schemas/GameState'
import type { InterestEntity, InterestViewer } from './types'

/**
 * Flattens the five view-filtered root collections into the shape
 * InterestManager consumes. Keyed by session id for players so it matches
 * interestManager.attach().
 *
 * Canonical implementation — GameRoom.collectInterestEntities() and every
 * test/harness that needs the same collection (f018-harness.ts,
 * game-simulation-integration.test.ts, room-interest-wiring.test.ts,
 * bandwidth.test.ts, roomLoad.harness.ts) delegate here instead of
 * re-implementing it. Two copies had already drifted before this existed:
 * bandwidth.test.ts covered only players+mobs, and roomLoad.harness.ts
 * omitted zoneEffects entirely.
 */
export function collectInterestEntities(state: GameState): InterestEntity[] {
  const out: InterestEntity[] = []
  for (const [sessionId, p] of state.players.entries()) {
    out.push({ id: sessionId, x: p.x, y: p.y, ref: p })
  }
  for (const m of state.mobs.values()) out.push({ id: m.id, x: m.x, y: m.y, ref: m })
  for (const n of state.npcs.values()) out.push({ id: n.id, x: n.x, y: n.y, ref: n })
  for (const pr of state.projectiles.values()) {
    out.push({ id: pr.id, x: pr.x, y: pr.y, ref: pr })
  }
  for (const z of state.zoneEffects.values()) {
    out.push({ id: z.id, x: z.x, y: z.y, ref: z })
  }
  return out
}

export function collectInterestViewers(state: GameState): InterestViewer[] {
  const out: InterestViewer[] = []
  for (const [sessionId, p] of state.players.entries()) {
    out.push({ sessionId, x: p.x, y: p.y })
  }
  return out
}
