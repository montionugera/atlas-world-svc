import { Encoder, StateView } from '@colyseus/schema'
import { GameState } from '../../schemas/GameState'

describe('GameState view filtering', () => {
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

    // Load-bearing assertion — do not remove or "simplify" this away.
    // `encodeAllView` only walks a ChangeTree's `allFilteredChanges` bucket,
    // and that bucket only exists on schema classes carrying
    // `$viewFieldIndexes` (i.e. at least one `@view()` field). If `@view()`
    // is ever removed from every root collection on GameState, the class
    // loses `$viewFieldIndexes` entirely and EVERY filtered encode
    // degenerates to 0 bytes — this assertion is what catches that: it
    // fails pre-fix (withPlayer.byteLength === 0) and passes post-fix.
    // Verified by temporarily stripping `@view()` from all five collections:
    // the test goes red, then green again once restored (see task-3-report.md).
    expect(withPlayer.byteLength).toBeGreaterThan(0)
  })
})
