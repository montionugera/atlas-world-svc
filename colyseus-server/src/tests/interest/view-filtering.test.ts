import { Encoder, StateView } from '@colyseus/schema'
import { GameState } from '../../schemas/GameState'

describe('GameState view filtering', () => {
  it('encodes nothing for a view that has been given no entities', () => {
    const state = new GameState('map-test', 'room-1')
    state.addPlayer('s1', 'Alice')

    const encoder = new Encoder(state)
    const emptyView = new StateView()

    const full = encoder.encodeAll()
    const filtered = encoder.encodeAllView(emptyView, full.byteLength, { offset: 0 })

    // The player must not reach a client whose view does not contain it.
    expect(filtered.byteLength).toBeLessThan(full.byteLength)
  })

  it('encodes a player once it is added to the view', () => {
    const state = new GameState('map-test', 'room-1')
    const player = state.addPlayer('s1', 'Alice')

    const encoder = new Encoder(state)
    const view = new StateView()
    view.add(player)

    const shared = encoder.encodeAll()
    const withPlayer = encoder.encodeAllView(view, shared.byteLength, { offset: 0 })
    const withoutPlayer = encoder.encodeAllView(new StateView(), shared.byteLength, {
      offset: 0,
    })

    expect(withPlayer.byteLength).toBeGreaterThan(withoutPlayer.byteLength)
  })
})
