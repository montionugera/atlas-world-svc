import { LoadoutSnapshot, loadoutSnapshotSchema, MatchEventBatch, RPC } from '@atlas/contracts'
import { IMetaBackend } from './IMetaBackend'

export interface NakamaMetaBackendOptions {
  baseUrl: string
  httpKey: string
  timeoutMs?: number
  retries?: number
}

interface NakamaAccountResponse {
  user?: { id?: string }
}

/**
 * IMetaBackend backed by a real Nakama server. RPC calls hit
 * `POST /v2/rpc/<id>?http_key=...&unwrap`; session verification hits
 * `GET /v2/account` with a Bearer token. Both paths share the same
 * timeout + exponential-backoff retry policy (250ms * 2^attempt).
 */
export class NakamaMetaBackend implements IMetaBackend {
  private readonly baseUrl: string
  private readonly httpKey: string
  private readonly timeoutMs: number
  private readonly retries: number

  constructor(options: NakamaMetaBackendOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.httpKey = options.httpKey
    this.timeoutMs = options.timeoutMs ?? 2000
    this.retries = options.retries ?? 3
  }

  async verifySession(token: string): Promise<{ userId: string } | null> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/v2/account`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res) return null

    try {
      const body = (await res.json()) as NakamaAccountResponse
      const userId = body.user?.id
      return userId ? { userId } : null
    } catch {
      return null
    }
  }

  async getLoadout(userId: string): Promise<LoadoutSnapshot | null> {
    const body = await this.rpc(RPC.getLoadout, { userId })
    if (body === null) return null

    const parsed = loadoutSnapshotSchema.safeParse(body)
    return parsed.success ? parsed.data : null
  }

  async reportMatchEvents(
    batch: MatchEventBatch & { userId: string }
  ): Promise<'ok' | 'deduped' | 'failed'> {
    const body = await this.rpc(RPC.reportMatchEvents, batch)
    if (body === null) return 'failed'

    // Real report_match_events response shape (see
    // nakama/src/rpc/reportMatchEvents.ts): { deduped: true } or
    // { deduped: false, progressed, completedNow }. Anything else is
    // unrecognized/malformed — fail CLOSED so the batch is retried rather
    // than silently dropped.
    const deduped = (body as { deduped?: unknown }).deduped
    if (deduped === true) return 'deduped'
    if (deduped === false) return 'ok'
    return 'failed'
  }

  private async rpc(id: string, payload: unknown): Promise<unknown | null> {
    const url = `${this.baseUrl}/v2/rpc/${id}?http_key=${encodeURIComponent(this.httpKey)}&unwrap`
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res) return null

    try {
      return await res.json()
    } catch {
      return null
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response | null> {
    for (let attempt = 0; attempt < this.retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, { ...init, signal: controller.signal })
        if (res.ok) return res
      } catch {
        // network error or abort — fall through to retry/backoff
      } finally {
        clearTimeout(timer)
      }

      if (attempt < this.retries - 1) {
        const backoffMs = 250 * 2 ** attempt
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }
    return null
  }
}
