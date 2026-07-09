import { LoadoutSnapshot, MatchEventBatch } from '@atlas/contracts'
import { IMetaBackend } from './IMetaBackend'

/**
 * In-memory IMetaBackend for tests. Records every accepted batch and lets tests
 * force the next N reportMatchEvents calls to fail (simulating backend outages).
 */
export class FakeMetaBackend implements IMetaBackend {
  readonly batches: (MatchEventBatch & { userId: string })[] = []
  failNextN = 0

  private readonly sessions = new Map<string, string>()
  private readonly loadouts = new Map<string, LoadoutSnapshot>()

  setSession(token: string, userId: string): void {
    this.sessions.set(token, userId)
  }

  setLoadout(userId: string, snapshot: LoadoutSnapshot): void {
    this.loadouts.set(userId, snapshot)
  }

  async verifySession(token: string): Promise<{ userId: string } | null> {
    const userId = this.sessions.get(token)
    return userId ? { userId } : null
  }

  async getLoadout(userId: string): Promise<LoadoutSnapshot | null> {
    return this.loadouts.get(userId) ?? null
  }

  async reportMatchEvents(
    batch: MatchEventBatch & { userId: string }
  ): Promise<'ok' | 'deduped' | 'failed'> {
    if (this.failNextN > 0) {
      this.failNextN -= 1
      return 'failed'
    }
    this.batches.push(batch)
    return 'ok'
  }
}
