import http from 'http'
import { AddressInfo } from 'net'
import { NakamaMetaBackend } from '../meta/NakamaMetaBackend'

function startServer(
  handler: http.RequestListener
): Promise<{ server: http.Server; port: number }> {
  return new Promise(resolve => {
    const server = http.createServer(handler)
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, port })
    })
  })
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()))
}

describe('NakamaMetaBackend', () => {
  let server: http.Server | undefined

  afterEach(async () => {
    if (server) {
      await closeServer(server)
      server = undefined
    }
  })

  it('retries a 500 twice then succeeds', async () => {
    let calls = 0
    const started = await startServer((req, res) => {
      calls += 1
      if (calls < 3) {
        res.writeHead(500)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      // Real report_match_events shape (nakama/src/rpc/reportMatchEvents.ts),
      // not the fabricated { status: ... } shape the RPC never returns.
      res.end(JSON.stringify({ deduped: false, progressed: [], completedNow: [] }))
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      retries: 3,
      timeoutMs: 500,
    })

    const result = await backend.reportMatchEvents({
      matchId: 'match-1',
      seq: 0,
      userId: 'user-1',
      events: [],
    })

    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it("parses { deduped: true } as 'deduped'", async () => {
    const started = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ deduped: true }))
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      timeoutMs: 500,
    })

    const result = await backend.reportMatchEvents({
      matchId: 'match-1',
      seq: 0,
      userId: 'user-1',
      events: [],
    })

    expect(result).toBe('deduped')
  })

  it('fails closed on an unrecognized/malformed response body', async () => {
    const started = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      // Fabricated shape the real RPC never returns — must not be treated as success.
      res.end(JSON.stringify({ status: 'ok' }))
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      timeoutMs: 500,
    })

    const result = await backend.reportMatchEvents({
      matchId: 'match-1',
      seq: 0,
      userId: 'user-1',
      events: [],
    })

    expect(result).toBe('failed')
  })

  it("returns 'failed' after exhausting retries", async () => {
    let calls = 0
    const started = await startServer((req, res) => {
      calls += 1
      res.writeHead(500)
      res.end()
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      retries: 2,
      timeoutMs: 500,
    })

    const result = await backend.reportMatchEvents({
      matchId: 'match-1',
      seq: 0,
      userId: 'user-1',
      events: [],
    })

    expect(result).toBe('failed')
    expect(calls).toBe(2)
  })

  it('verifySession returns userId parsed from /v2/account', async () => {
    const started = await startServer((req, res) => {
      expect(req.url).toBe('/v2/account')
      expect(req.headers.authorization).toBe('Bearer test-token')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ user: { id: 'user-42' } }))
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      timeoutMs: 500,
    })

    const result = await backend.verifySession('test-token')
    expect(result).toEqual({ userId: 'user-42' })
  })

  it('verifySession returns null after exhausting retries', async () => {
    const started = await startServer((req, res) => {
      res.writeHead(401)
      res.end()
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      retries: 1,
      timeoutMs: 500,
    })

    const result = await backend.verifySession('bad-token')
    expect(result).toBeNull()
  })

  it('verifySession does not retry a 401 — single attempt, fails fast', async () => {
    let calls = 0
    const started = await startServer((req, res) => {
      calls += 1
      res.writeHead(401)
      res.end()
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      retries: 3, // would prove a retry happened if the guard were missing
      timeoutMs: 500,
    })

    const result = await backend.verifySession('bad-token')

    expect(result).toBeNull()
    expect(calls).toBe(1)
  })

  it('reportMatchEvents does not retry a 400 — single attempt, fails fast', async () => {
    let calls = 0
    const started = await startServer((req, res) => {
      calls += 1
      res.writeHead(400)
      res.end()
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      retries: 3,
      timeoutMs: 500,
    })

    const result = await backend.reportMatchEvents({
      matchId: 'match-1',
      seq: 0,
      userId: 'user-1',
      events: [],
    })

    expect(result).toBe('failed')
    expect(calls).toBe(1)
  })

  it('reportMatchEvents DOES retry a 429 (rate limit) unlike other 4xx', async () => {
    let calls = 0
    const started = await startServer((req, res) => {
      calls += 1
      if (calls < 2) {
        res.writeHead(429)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ deduped: false }))
    })
    server = started.server

    const backend = new NakamaMetaBackend({
      baseUrl: `http://localhost:${started.port}`,
      httpKey: 'atlas_dev_http_key',
      retries: 3,
      timeoutMs: 500,
    })

    const result = await backend.reportMatchEvents({
      matchId: 'match-1',
      seq: 0,
      userId: 'user-1',
      events: [],
    })

    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })
})
