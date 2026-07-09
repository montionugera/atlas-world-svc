import { MatchEvent } from '@atlas/contracts'
import { IMetaBackend } from './IMetaBackend'

export interface MetaEventReporterOptions {
  backend: IMetaBackend
  matchId: string
  flushIntervalMs?: number
  maxBuffer?: number
}

/**
 * Buffers MatchEvents produced during a match and periodically reports them to
 * the IMetaBackend as an idempotent batch. `seq` only advances on a
 * successful/deduped report so a 'failed' report is safe to retry verbatim on
 * the next flush. When the buffer overflows `maxBuffer`, the oldest events are
 * dropped and a single coalesced console.warn is emitted at the next flush.
 */
export class MetaEventReporter {
  private readonly backend: IMetaBackend
  private readonly matchId: string
  private readonly flushIntervalMs: number
  private readonly maxBuffer: number

  private seq = 0
  private buffer: MatchEvent[] = []
  private droppedSinceWarn = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private flushing = false

  constructor(options: MetaEventReporterOptions) {
    this.backend = options.backend
    this.matchId = options.matchId
    this.flushIntervalMs = options.flushIntervalMs ?? 5000
    this.maxBuffer = options.maxBuffer ?? 500
  }

  /** Buffer an event for the next flush. Drops the oldest event if over capacity. */
  record(event: MatchEvent): void {
    this.buffer.push(event)
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift()
      this.droppedSinceWarn += 1
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.flush()
    }, this.flushIntervalMs)
    // Don't let the periodic flush keep the Node process alive by itself.
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /**
   * Report the currently buffered events. Safe to call concurrently — a flush
   * already in flight is skipped rather than overlapped. Note: this reporter
   * is constructed one-per-room; the batch's required `userId` is taken from
   * the first buffered event (this codebase currently runs 1 match = 1 room =
   * 1 player, see GameRoom.maxClients).
   */
  async flush(): Promise<void> {
    this.warnDroppedIfAny()

    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true
    try {
      const events = [...this.buffer]
      const userId = events[0].userId
      const result = await this.backend.reportMatchEvents({
        matchId: this.matchId,
        seq: this.seq,
        userId,
        events,
      })

      if (result === 'ok' || result === 'deduped') {
        // Only remove the events we actually sent — record() may have pushed
        // more onto the buffer while this flush was in flight.
        this.buffer.splice(0, events.length)
        this.seq += 1
      }
      // 'failed': leave the buffer untouched so the next flush retries verbatim.
    } finally {
      this.flushing = false
    }
  }

  private warnDroppedIfAny(): void {
    if (this.droppedSinceWarn > 0) {
      console.warn(
        `[meta] MetaEventReporter dropped ${this.droppedSinceWarn} buffered event(s) past maxBuffer=${this.maxBuffer}`
      )
      this.droppedSinceWarn = 0
    }
  }
}
