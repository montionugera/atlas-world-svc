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
      res.end(JSON.stringify({ status: 'ok' }))
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
})
