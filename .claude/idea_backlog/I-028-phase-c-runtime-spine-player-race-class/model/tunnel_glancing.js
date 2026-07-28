/**
 * Glancing-hit reliability. The head-on case has a 2*(r1+r2)=3.6u capture band and is
 * forgiving; a shot passing off-centre has a chord of 2*sqrt((r1+r2)^2 - b^2), which
 * shrinks to 0 at a graze. That is where discrete 50ms stepping actually drops hits.
 *
 * Geometry-true test: fire the projectile at impact parameter b (perpendicular offset).
 * Anything with b < r1+r2 = 1.8 is a REAL hit and must register.
 */
const planck = require('/Users/pasitnusso/workspace/repos/atlas-world-svc/colyseus-server/node_modules/planck')

const R_PLAYER = 1.3, R_PROJ = 0.5, SUM_R = R_PLAYER + R_PROJ
const PROJ_SPEED = 36, TICK_S = 0.05

function trial({ playerSpeed, substeps, b, phase }) {
  const world = planck.World({ gravity: planck.Vec2(0, 0) })
  const player = world.createBody({ type: 'dynamic', position: planck.Vec2(0, 0) })
  player.createFixture({ shape: planck.Circle(R_PLAYER), density: 0.001 })
  player.setLinearVelocity(planck.Vec2(playerSpeed, 0))

  // projectile flies along -x at perpendicular offset b; player runs +x into it
  const proj = world.createBody({ type: 'dynamic', position: planck.Vec2(20 + phase, b) })
  proj.createFixture({ shape: planck.Circle(R_PROJ), isSensor: true, density: 0.1 })
  proj.setLinearVelocity(planck.Vec2(-PROJ_SPEED, 0))

  let hit = false
  world.on('begin-contact', () => { hit = true })

  const dt = TICK_S / substeps
  const steps = Math.ceil((26 / (playerSpeed + PROJ_SPEED) + 0.3) / dt)
  for (let i = 0; i < steps && !hit; i++) {
    world.step(dt)
    player.setLinearVelocity(planck.Vec2(playerSpeed, 0))
    if (!hit) proj.setLinearVelocity(planck.Vec2(-PROJ_SPEED, 0))
  }
  return hit
}

const PHASES = []
for (let p = 0; p < 1.6; p += 0.1) PHASES.push(Number(p.toFixed(2)))   // sample alignment
const BS = [0, 0.4, 0.8, 1.2, 1.5, 1.7]                                 // impact parameter

function run(label, cfg) {
  const cells = BS.map((b) => {
    const hits = PHASES.filter((phase) => trial({ ...cfg, b, phase })).length
    return (hits / PHASES.length) * 100
  })
  const overall = cells.reduce((a, c) => a + c, 0) / cells.length
  console.log(
    label.padEnd(34) +
      cells.map((c) => `${c.toFixed(0).padStart(5)}%`).join('') +
      `   | avg ${overall.toFixed(1).padStart(5)}%`
  )
}

console.log(`glancing-hit reliability — every case below is a GENUINE hit (b < ${SUM_R})`)
console.log(`proj ${PROJ_SPEED} u/s, ${PHASES.length} alignments per cell\n`)
console.log('build'.padEnd(34) + BS.map((b) => `b=${b}`.padStart(6)).join('') + '   | overall')
console.log('-'.repeat(34 + BS.length * 6 + 14))

console.log('# single 50ms step (as shipped)')
run('  mspd 0 (stationary)', { playerSpeed: 0, substeps: 1 })
run('  mspd 30 (proposed cap)', { playerSpeed: 30, substeps: 1 })
run('  mspd 34.85 (handoff v2)', { playerSpeed: 34.85, substeps: 1 })
run('  mspd 39.8 (shipped 0.2/agi)', { playerSpeed: 39.8, substeps: 1 })

console.log('\n# substepped, mspd 30')
run('  2x substep (25ms)', { playerSpeed: 30, substeps: 2 })
run('  4x substep (12.5ms)', { playerSpeed: 30, substeps: 4 })

console.log('\n# substepped, mspd 39.8 (shipped speed)')
run('  4x substep (12.5ms)', { playerSpeed: 39.8, substeps: 4 })
