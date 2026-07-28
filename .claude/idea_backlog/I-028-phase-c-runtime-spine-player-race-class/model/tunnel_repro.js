/**
 * Tunnelling repro against the REAL engine (planck 1.4.2, same version the server uses).
 *
 * Mirrors PlanckPhysicsManager exactly:
 *   player     -> dynamic, circle r=1.3, solid       (PHYSICS_CONFIG.entities.player.radius)
 *   projectile -> dynamic, circle r=0.5, isSensor    (createProjectileBody)
 *   world      -> gravity 0, ONE step of deltaTime   (world.step(deltaTime/1000), line 335)
 *   proj speed -> capped 36 u/s                      (updateProjectile maxSpeed = 36)
 *
 * Sweeps the starting offset so we measure the real hit-rate, not one lucky alignment.
 */
const planck = require('/Users/pasitnusso/workspace/repos/atlas-world-svc/colyseus-server/node_modules/planck')

const R_PLAYER = 1.3
const R_PROJ = 0.5
const PROJ_SPEED = 36 // updateProjectile maxSpeed default
const TICK_S = 0.05 // gameConfig tickRate = 50ms

function trial({ playerSpeed, substeps, bullet, startGap }) {
  const world = planck.World({ gravity: planck.Vec2(0, 0) })

  const player = world.createBody({ type: 'dynamic', position: planck.Vec2(0, 0) })
  player.createFixture({ shape: planck.Circle(R_PLAYER), density: 0.001 })
  player.setLinearVelocity(planck.Vec2(playerSpeed, 0)) // running INTO the projectile

  const proj = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(startGap, 0),
    bullet: !!bullet,
  })
  proj.createFixture({ shape: planck.Circle(R_PROJ), isSensor: true, density: 0.1 })
  proj.setLinearVelocity(planck.Vec2(-PROJ_SPEED, 0)) // head-on

  let hit = false
  world.on('begin-contact', () => {
    hit = true
  })

  const dt = TICK_S / substeps
  const steps = Math.ceil((startGap / (playerSpeed + PROJ_SPEED) + 0.2) / dt)
  for (let i = 0; i < steps && !hit; i++) {
    world.step(dt)
    // keep velocities constant: no damping, matches linearDamping: 0
    player.setLinearVelocity(planck.Vec2(playerSpeed, 0))
    if (!hit) proj.setLinearVelocity(planck.Vec2(-PROJ_SPEED, 0))
  }
  return hit
}

// sweep start gaps to vary where the discrete sample lands relative to the overlap band
const GAPS = []
for (let g = 20; g < 26; g += 0.05) GAPS.push(Number(g.toFixed(2)))

function run(label, cfg) {
  const hits = GAPS.filter((startGap) => trial({ ...cfg, startGap })).length
  const pct = (hits / GAPS.length) * 100
  const rel = (cfg.playerSpeed + PROJ_SPEED) * (TICK_S / cfg.substeps)
  console.log(
    `${label.padEnd(46)} ${String(hits).padStart(3)}/${GAPS.length} hits ` +
      `${pct.toFixed(1).padStart(6)}%   ${rel.toFixed(2)} u/substep vs 1.8 budget`
  )
}

console.log(`planck ${require('/Users/pasitnusso/workspace/repos/atlas-world-svc/colyseus-server/node_modules/planck/package.json').version}   ` +
  `proj ${PROJ_SPEED} u/s head-on, tick ${TICK_S * 1000}ms, ${GAPS.length} start offsets each\n`)

console.log('--- AS SHIPPED: single 50ms step, no CCD ---')
run('stationary player (mspd 0)', { playerSpeed: 0, substeps: 1, bullet: false })
run('proposed cap        (mspd 30)', { playerSpeed: 30, substeps: 1, bullet: false })
run('handoff v2          (mspd 34.85)', { playerSpeed: 34.85, substeps: 1, bullet: false })
run('shipped 0.2/agi     (mspd 39.8)', { playerSpeed: 39.8, substeps: 1, bullet: false })

console.log('\n--- FIX A: physics substeps, mspd 30 ---')
for (const substeps of [2, 4]) run(`${substeps}x substep (${(50 / substeps).toFixed(1)}ms)`, { playerSpeed: 30, substeps, bullet: false })

console.log('\n--- FIX B: bullet:true (Planck CCD) on the projectile, single 50ms step ---')
run('mspd 30,   bullet:true', { playerSpeed: 30, substeps: 1, bullet: true })
run('mspd 39.8, bullet:true', { playerSpeed: 39.8, substeps: 1, bullet: true })
