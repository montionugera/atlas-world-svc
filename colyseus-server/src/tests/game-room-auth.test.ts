import { Client } from 'colyseus'
import { GameRoom, GameRoomAuthData, GameRoomOptions } from '../rooms/GameRoom'
import { FakeMetaBackend } from '../meta/FakeMetaBackend'

/**
 * Unit-tests GameRoom.onAuth() in isolation — it only reads `this.metaBackend`
 * and `client.sessionId`, so we can exercise it without booting a full
 * Colyseus room (no onCreate/matchmaking machinery needed). Mirrors how
 * Colyseus itself calls onAuth(client, options) before consuming the seat
 * reservation, and rejects the join when it throws (see @colyseus/core
 * Room.js `_consumeSeatReservation`).
 */
function fakeClient(sessionId: string): Client<any, GameRoomAuthData> {
  return { sessionId } as unknown as Client<any, GameRoomAuthData>
}

describe('GameRoom.onAuth', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  function buildRoom(backend: FakeMetaBackend): GameRoom {
    const room = new GameRoom()
    room.metaBackend = backend
    return room
  }

  it('rejects when there is no valid token and devBypass is not set', async () => {
    process.env.NODE_ENV = 'test'
    const backend = new FakeMetaBackend()
    const room = buildRoom(backend)

    await expect(room.onAuth(fakeClient('sess-1'), {} as GameRoomOptions)).rejects.toThrow(
      /unauthorized/
    )
  })

  it('rejects an invalid/unrecognized token even without devBypass', async () => {
    process.env.NODE_ENV = 'test'
    const backend = new FakeMetaBackend()
    const room = buildRoom(backend)

    await expect(
      room.onAuth(fakeClient('sess-1'), { token: 'not-a-real-token' } as GameRoomOptions)
    ).rejects.toThrow(/unauthorized/)
  })

  it('accepts and resolves the verified userId when the token is valid', async () => {
    process.env.NODE_ENV = 'test'
    const backend = new FakeMetaBackend()
    backend.setSession('valid-token', 'user-42')
    const room = buildRoom(backend)

    const auth = await room.onAuth(fakeClient('sess-1'), {
      token: 'valid-token',
    } as GameRoomOptions)

    expect(auth).toEqual({ userId: 'user-42' })
  })

  it('accepts via devBypass in non-production, using sessionId as userId', async () => {
    process.env.NODE_ENV = 'test'
    const backend = new FakeMetaBackend()
    const room = buildRoom(backend)
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const auth = await room.onAuth(fakeClient('sess-debug'), {
      devBypass: true,
    } as GameRoomOptions)

    expect(auth).toEqual({ userId: 'sess-debug' })
    expect(warnSpy).toHaveBeenCalledWith('[meta] dev bypass join', 'sess-debug')

    warnSpy.mockRestore()
  })

  it('rejects devBypass in production, even with the flag set', async () => {
    process.env.NODE_ENV = 'production'
    const backend = new FakeMetaBackend()
    const room = buildRoom(backend)

    await expect(
      room.onAuth(fakeClient('sess-1'), { devBypass: true } as GameRoomOptions)
    ).rejects.toThrow(/unauthorized/)
  })
})
