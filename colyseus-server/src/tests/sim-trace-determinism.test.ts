import { readFileSync } from 'fs'
import { join } from 'path'
import { runDeterministicSimulation, SimulationTrace } from './harness/DeterministicSimHarness'

describe('Deterministic Simulation Parity Oracle (I-126 / F-055)', () => {
  const fixturePath = join(__dirname, 'fixtures', 'golden_sim_trace_1000.json')
  let goldenTrace: SimulationTrace

  beforeAll(() => {
    const raw = readFileSync(fixturePath, 'utf-8')
    goldenTrace = JSON.parse(raw)
  })

  it('loads valid golden simulation trace fixture', () => {
    expect(goldenTrace.seed).toBe(0x1337c0de)
    expect(goldenTrace.totalTicks).toBe(1000)
    expect(goldenTrace.snapshots.length).toBeGreaterThanOrEqual(20)
    expect(goldenTrace.finalSummary.alivePlayers).toBe(9)
    expect(goldenTrace.finalSummary.aliveMobs).toBe(50)
  })

  it('re-simulates identical state matching golden trace tick-by-tick', () => {
    const { trace: freshTrace, env } = runDeterministicSimulation(0x1337c0de, 1000, 10, 50)

    try {
      expect(freshTrace.snapshots.length).toBe(goldenTrace.snapshots.length)

      for (let i = 0; i < goldenTrace.snapshots.length; i++) {
        const expectedSnapshot = goldenTrace.snapshots[i]
        const actualSnapshot = freshTrace.snapshots[i]

        expect(actualSnapshot.tick).toBe(expectedSnapshot.tick)
        expect(actualSnapshot.simTimeMs).toBe(expectedSnapshot.simTimeMs)
        expect(actualSnapshot.entities.length).toBe(expectedSnapshot.entities.length)

        for (let j = 0; j < expectedSnapshot.entities.length; j++) {
          const expectedEntity = expectedSnapshot.entities[j]
          const actualEntity = actualSnapshot.entities[j]

          expect(actualEntity.id).toBe(expectedEntity.id)
          expect(actualEntity.type).toBe(expectedEntity.type)

          // Strict coordinate assertion
          expect(actualEntity.x).toBeCloseTo(expectedEntity.x, 2)
          expect(actualEntity.y).toBeCloseTo(expectedEntity.y, 2)
          expect(actualEntity.vx).toBeCloseTo(expectedEntity.vx, 2)
          expect(actualEntity.vy).toBeCloseTo(expectedEntity.vy, 2)

          // State and health assertion
          expect(actualEntity.health).toBe(expectedEntity.health)
          expect(actualEntity.isAlive).toBe(expectedEntity.isAlive)
          if (expectedEntity.behavior) {
            expect(actualEntity.behavior).toBe(expectedEntity.behavior)
          }
        }
      }
    } finally {
      env.dispose()
    }
  })
})
