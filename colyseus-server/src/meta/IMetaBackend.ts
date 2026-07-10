import { LoadoutSnapshot, MatchEventBatch } from '@atlas/contracts'

/**
 * Single seam between the Colyseus simulation and the Nakama meta-systems backend
 * (auth, profile/inventory/equipment/skills/quests, match-event reporting).
 * GameRoom depends on this interface only — FakeMetaBackend in tests,
 * NakamaMetaBackend for real wiring.
 */
export interface IMetaBackend {
  /** Verify a client-provided session token. Returns null if invalid/unverifiable. */
  verifySession(token: string): Promise<{ userId: string } | null>

  /** Fetch the player's loadout snapshot (profile/equipment/skills/quests). Null if unavailable. */
  getLoadout(userId: string): Promise<LoadoutSnapshot | null>

  /**
   * Report a batch of match events. 'ok' = accepted, 'deduped' = already seen (safe to
   * advance seq), 'failed' = caller should keep the batch buffered and retry later.
   */
  reportMatchEvents(
    batch: MatchEventBatch & { userId: string }
  ): Promise<'ok' | 'deduped' | 'failed'>
}
