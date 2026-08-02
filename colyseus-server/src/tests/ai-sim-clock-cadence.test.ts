import { AIModule } from '../ai/AIModule'
import { AIWorldInterface } from '../ai/AIWorldInterface'
import { SimClock } from '../time/SimClock'

/**
 * These tests drive AIModule far faster than wall-clock time. Against the old
 * Date.now()-gated implementation the fast-forward test measured ~1 decision
 * instead of 100 — the same failure that invalidated F-027's first capacity
 * table (6 of 100 ticks).
 */
describe('AIModule cadence on simulated time', () => {
  const buildModule = () => {
    // No agents are registered: this exercises the update() gate itself, which
    // is the untested path. Decision passes are counted via the private hook.
    const worldInterface = { buildAgentEnvironment: () => ({}) } as unknown as AIWorldInterface
    const aiModule = new AIModule(worldInterface)
    aiModule.start()
    const decisions = { count: 0 }
    jest
      .spyOn(aiModule as unknown as { updateAIDecision: () => void }, 'updateAIDecision')
      .mockImplementation(() => {
        decisions.count += 1
      })
    return { aiModule, decisions }
  }

  it('runs one decision pass per tick when ticks are fast-forwarded', () => {
    const clock = new SimClock()
    const { aiModule, decisions } = buildModule()

    // 100 ticks of 50ms simulated each, executed in a few real milliseconds.
    for (let i = 0; i < 100; i++) {
      clock.advance(50)
      aiModule.update(clock.now())
    }

    expect(decisions.count).toBe(100)
  })

  it('still throttles when ticks are shorter than the decision interval', () => {
    const clock = new SimClock()
    const { aiModule, decisions } = buildModule()

    // 100 ticks of 10ms = 1000ms simulated, at a 50ms interval => 20 passes.
    for (let i = 0; i < 100; i++) {
      clock.advance(10)
      aiModule.update(clock.now())
    }

    expect(decisions.count).toBe(20)
  })

  it('does not run when stopped', () => {
    const clock = new SimClock()
    const { aiModule, decisions } = buildModule()
    aiModule.stop()

    clock.advance(1000)
    aiModule.update(clock.now())

    expect(decisions.count).toBe(0)
  })
})
