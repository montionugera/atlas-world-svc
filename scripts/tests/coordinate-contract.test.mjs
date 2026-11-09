import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

export const fixture = readJson('scripts/tests/fixtures/coordinate-contract-fixture.json');

// --- Pure extractors ---
export function extractA1(files) {
  const mapRs = files.mapRs;
  const csRoot = files.csRoot;
  const docContract = files.docContract;
  const millcross = files.millcross;
  const freja = files.freja;

  const coordScaleRsMatch = mapRs.match(/coord_scale:\s*([0-9.]+)/);
  const coordScaleCsMatch = csRoot.match(/ServerCoordScale\s*=\s*([0-9.]+)f;/);

  return {
    fixtureUnitContract: fixture.unitContract,
    fixtureMetresPerGameUnit: fixture.metresPerGameUnit,
    fixtureCoordScale: fixture.coordScale,
    coordScaleRs: coordScaleRsMatch ? Number(coordScaleRsMatch[1]) : null,
    coordScaleCs: coordScaleCsMatch ? Number(coordScaleCsMatch[1]) : null,
    docHasUnitIdentity: docContract.includes('1 game unit = 1 metre'),
    millcrossUnitContract: millcross.unitContract,
    frejaUnitContract: freja.unitContract,
  };
}

export function verifyA1(values, expectedFixture = fixture) {
  assert.equal(values.fixtureUnitContract, 'metres-v1', 'fixture unitContract must be metres-v1');
  assert.equal(values.fixtureMetresPerGameUnit, 1.0, 'fixture metresPerGameUnit must be 1.0');
  assert.equal(values.fixtureCoordScale, 1.0, 'fixture coordScale must be 1.0');
  assert.equal(values.coordScaleRs, expectedFixture.coordScale, 'server-rs map.rs coord_scale must equal fixture');
  assert.equal(values.coordScaleCs, expectedFixture.coordScale, 'game-client VerticalSliceRoot.cs ServerCoordScale must equal fixture');
  assert.equal(values.docHasUnitIdentity, true, 'docs/unit-contract.md must declare 1 game unit = 1 metre');
  assert.equal(values.millcrossUnitContract, expectedFixture.unitContract, 'millcross-ford.json unitContract must be metres-v1');
  assert.equal(values.frejaUnitContract, expectedFixture.unitContract, 'freja-south-gate.json unitContract must be metres-v1');
}

export function extractA5(files) {
  const compRs = files.compRs;
  const bestiaryRs = files.bestiaryRs;
  const csRoot = files.csRoot;

  const combatDefaultMatch = compRs.match(/impl Default for CombatStats\s*\{[\s\S]*?attack_range:\s*([0-9.]+)/);
  const swordMatch = compRs.match(/pub fn sword\(\) -> Self\s*\{[\s\S]*?projectile_range:\s*([0-9.]+)/);
  const bowMatch = compRs.match(/pub fn bow\(\) -> Self\s*\{[\s\S]*?projectile_range:\s*([0-9.]+)/);
  const staffMatch = compRs.match(/pub fn staff\(\) -> Self\s*\{[\s\S]*?projectile_range:\s*([0-9.]+)/);

  const bestiaryMatch = bestiaryRs.match(/pub fn attack_range\(&self\)\s*->\s*f32\s*\{[\s\S]*?if self\.is_ranged\s*\{\s*([0-9.]+)\s*\}\s*else\s*\{\s*([0-9.]+)\s*\}/);
  const clientMeleeMatch = csRoot.match(/MeleeAttackRangeWorld\s*=\s*([0-9.]+)f;/);

  return {
    combatDefaultMelee: combatDefaultMatch ? Number(combatDefaultMatch[1]) : null,
    swordRange: swordMatch ? Number(swordMatch[1]) : null,
    bowRange: bowMatch ? Number(bowMatch[1]) : null,
    staffRange: staffMatch ? Number(staffMatch[1]) : null,
    mobRanged: bestiaryMatch ? Number(bestiaryMatch[1]) : null,
    mobMelee: bestiaryMatch ? Number(bestiaryMatch[2]) : null,
    clientMelee: clientMeleeMatch ? Number(clientMeleeMatch[1]) : null,
  };
}

export function verifyA5(values, expectedFixture = fixture) {
  const { meleeBand, rangedBand } = expectedFixture.attackRangesMetres;

  // Exact match against fixture
  assert.equal(values.combatDefaultMelee, expectedFixture.attackRangesMetres.playerDefaultMeleeMetres, 'CombatStats default attack_range matches fixture');
  assert.equal(values.swordRange, expectedFixture.attackRangesMetres.playerSwordMetres, 'EquippedWeapon::sword projectile_range matches fixture');
  assert.equal(values.bowRange, expectedFixture.attackRangesMetres.playerBowMetres, 'EquippedWeapon::bow projectile_range matches fixture');
  assert.equal(values.staffRange, expectedFixture.attackRangesMetres.playerStaffMetres, 'EquippedWeapon::staff projectile_range matches fixture');
  assert.equal(values.mobMelee, expectedFixture.attackRangesMetres.mobMeleeMetres, 'DerivedMobStats melee attack_range matches fixture');
  assert.equal(values.mobRanged, expectedFixture.attackRangesMetres.mobRangedMetres, 'DerivedMobStats ranged attack_range matches fixture');
  assert.equal(values.clientMelee, expectedFixture.attackRangesMetres.clientMeleeWorldMetres, 'VerticalSliceRoot MeleeAttackRangeWorld matches fixture');

  // Band invariants (metres, not legacy 0.1m decimetres)
  const meleeValues = [
    ['combatDefaultMelee', values.combatDefaultMelee],
    ['swordRange', values.swordRange],
    ['mobMelee', values.mobMelee],
    ['clientMelee', values.clientMelee],
  ];
  for (const [name, val] of meleeValues) {
    assert.ok(
      val >= meleeBand[0] && val <= meleeBand[1],
      `${name} (${val}) must fall within meleeBand [${meleeBand[0]}, ${meleeBand[1]}] metres (never legacy decimetres)`
    );
  }

  const rangedValues = [
    ['bowRange', values.bowRange],
    ['staffRange', values.staffRange],
    ['mobRanged', values.mobRanged],
  ];
  for (const [name, val] of rangedValues) {
    assert.ok(
      val >= rangedBand[0] && val <= rangedBand[1],
      `${name} (${val}) must fall within rangedBand [${rangedBand[0]}, ${rangedBand[1]}] metres (never legacy decimetres)`
    );
  }
}

export function extractA6(files) {
  const worldModelRs = files.worldModelRs;
  const millcross = files.millcross;

  const regionSizeMatch = worldModelRs.match(/pub const REGION_SIZE_UNITS:\s*f32\s*=\s*([0-9.]+);/);
  const aoiEnterMatch = worldModelRs.match(/pub const AOI_ENTER_RADIUS_UNITS:\s*f32\s*=\s*([0-9.]+);/);
  const aoiExitMatch = worldModelRs.match(/pub const AOI_EXIT_RADIUS_UNITS:\s*f32\s*=\s*([0-9.]+);/);
  const borderGhostMatch = worldModelRs.match(/pub const BORDER_GHOST_BAND_UNITS:\s*f32\s*=\s*([0-9.]+);/);
  const handoffHysteresisMatch = worldModelRs.match(/pub const HANDOFF_HYSTERESIS_UNITS:\s*f32\s*=\s*([0-9.]+);/);

  return {
    regionSizeUnits: regionSizeMatch ? Number(regionSizeMatch[1]) : null,
    aoiEnterRadiusUnits: aoiEnterMatch ? Number(aoiEnterMatch[1]) : null,
    aoiExitRadiusUnits: aoiExitMatch ? Number(aoiExitMatch[1]) : null,
    borderGhostBandUnits: borderGhostMatch ? Number(borderGhostMatch[1]) : null,
    handoffHysteresisUnits: handoffHysteresisMatch ? Number(handoffHysteresisMatch[1]) : null,
    mapWidthMetres: millcross.width,
    mapHeightMetres: millcross.height,
    chunkSizeWorldMetres: millcross.chunkSizeWorld,
  };
}

export function verifyA6(values, expectedFixture = fixture) {
  // Fixture equality
  assert.equal(values.regionSizeUnits, expectedFixture.region.widthMetres, 'REGION_SIZE_UNITS equals fixture region width');
  assert.equal(values.regionSizeUnits, expectedFixture.region.heightMetres, 'REGION_SIZE_UNITS equals fixture region height');
  assert.equal(values.aoiEnterRadiusUnits, expectedFixture.region.aoiEnterRadiusMetres, 'AOI_ENTER_RADIUS_UNITS equals fixture');
  assert.equal(values.aoiExitRadiusUnits, expectedFixture.region.aoiExitRadiusMetres, 'AOI_EXIT_RADIUS_UNITS equals fixture');
  assert.equal(values.borderGhostBandUnits, expectedFixture.region.borderGhostBandMetres, 'BORDER_GHOST_BAND_UNITS equals fixture');
  assert.equal(values.handoffHysteresisUnits, expectedFixture.region.handoffHysteresisMetres, 'HANDOFF_HYSTERESIS_UNITS equals fixture');

  assert.equal(values.mapWidthMetres, expectedFixture.region.widthMetres, 'millcross map width equals fixture width');
  assert.equal(values.mapHeightMetres, expectedFixture.region.heightMetres, 'millcross map height equals fixture height');
  assert.equal(values.chunkSizeWorldMetres, expectedFixture.region.chunkSizeWorldMetres, 'millcross chunkSizeWorld equals fixture');

  // Geometric invariants
  assert.ok(values.aoiExitRadiusUnits > values.aoiEnterRadiusUnits, 'aoiExitRadius must strictly exceed aoiEnterRadius (hysteresis buffer)');
  assert.ok(values.regionSizeUnits >= 2 * values.aoiExitRadiusUnits, 'region size must encompass at least 2 * aoiExitRadius');
  assert.ok(values.borderGhostBandUnits > values.handoffHysteresisUnits, 'borderGhostBand must strictly exceed handoffHysteresis');
}

export function extractA7(files) {
  const mapRs = files.mapRs;
  const terrainCs = files.terrainCs;

  const slopeRsMatch = mapRs.match(/pub const MAX_WALKABLE_SLOPE_DEG:\s*f32\s*=\s*([0-9.]+);/);
  const slopeCsMatch = terrainCs.match(/MaxWalkableSlopeDeg\s*=\s*([0-9.]+)f;/);

  return {
    slopeDegRs: slopeRsMatch ? Number(slopeRsMatch[1]) : null,
    slopeDegCs: slopeCsMatch ? Number(slopeCsMatch[1]) : null,
  };
}

export function verifyA7(values, expectedFixture = fixture) {
  assert.equal(values.slopeDegRs, expectedFixture.slope.maxWalkableSlopeDeg, 'server-rs MAX_WALKABLE_SLOPE_DEG matches fixture');
  assert.equal(values.slopeDegCs, expectedFixture.slope.maxWalkableSlopeDeg, 'game-client MaxWalkableSlopeDeg matches fixture');
  assert.equal(values.slopeDegRs, values.slopeDegCs, 'server-rs and game-client slope limits must have exact parity');
}

// --- Test Suites ---

test('A1: unit identity (1 game unit = 1 metre across maps, server-rs, and game-client)', () => {
  const files = {
    mapRs: read('server-rs/src/content/map.rs'),
    csRoot: read('game-client/src/VerticalSliceRoot.cs'),
    docContract: read('docs/unit-contract.md'),
    millcross: readJson('content/maps/millcross-ford.json'),
    freja: readJson('content/maps/freja-south-gate.json'),
  };
  const values = extractA1(files);
  verifyA1(values);
});

test('A5: attack ranges are in metres across server-rs and game-client (never legacy 0.1m units)', () => {
  const files = {
    compRs: read('server-rs/src/ecs/components.rs'),
    bestiaryRs: read('server-rs/src/content/bestiary.rs'),
    csRoot: read('game-client/src/VerticalSliceRoot.cs'),
  };
  const values = extractA5(files);
  verifyA5(values);
});

test('A6: region boundary and AOI hysteresis match compiled 400x400m region maps', () => {
  const files = {
    worldModelRs: read('server-rs/src/content/world_model.rs'),
    millcross: readJson('content/maps/millcross-ford.json'),
  };
  const values = extractA6(files);
  verifyA6(values);
});

test('A7: walkable slope limit parity (35 deg in server-rs and game-client)', () => {
  const files = {
    mapRs: read('server-rs/src/content/map.rs'),
    terrainCs: read('game-client/src/World/TerrainElevation.cs'),
  };
  const values = extractA7(files);
  verifyA7(values);
});

test('mutation self-test: corrupting parsed constants trips verification assertions', () => {
  // A1 corruption checks
  const baselineA1 = extractA1({
    mapRs: read('server-rs/src/content/map.rs'),
    csRoot: read('game-client/src/VerticalSliceRoot.cs'),
    docContract: read('docs/unit-contract.md'),
    millcross: readJson('content/maps/millcross-ford.json'),
    freja: readJson('content/maps/freja-south-gate.json'),
  });
  assert.throws(() => verifyA1({ ...baselineA1, coordScaleRs: 0.1 }));
  assert.throws(() => verifyA1({ ...baselineA1, coordScaleCs: 10.0 }));
  assert.throws(() => verifyA1({ ...baselineA1, docHasUnitIdentity: false }));
  assert.throws(() => verifyA1({ ...baselineA1, millcrossUnitContract: 'decimetres' }));
  assert.throws(() => verifyA1({ ...baselineA1, frejaUnitContract: 'decimetres' }));

  // A5 corruption checks (legacy 0.1m numbers or out-of-band values)
  const baselineA5 = extractA5({
    compRs: read('server-rs/src/ecs/components.rs'),
    bestiaryRs: read('server-rs/src/content/bestiary.rs'),
    csRoot: read('game-client/src/VerticalSliceRoot.cs'),
  });
  assert.throws(() => verifyA5({ ...baselineA5, combatDefaultMelee: 30.0 })); // legacy 10x
  assert.throws(() => verifyA5({ ...baselineA5, swordRange: 40.0 })); // legacy 10x
  assert.throws(() => verifyA5({ ...baselineA5, bowRange: 300.0 })); // legacy 10x
  assert.throws(() => verifyA5({ ...baselineA5, staffRange: 280.0 })); // legacy 10x
  assert.throws(() => verifyA5({ ...baselineA5, mobRanged: 150.0 })); // legacy 10x
  assert.throws(() => verifyA5({ ...baselineA5, mobMelee: 20.0 })); // legacy 10x
  assert.throws(() => verifyA5({ ...baselineA5, clientMelee: 0.5 })); // below melee band
  assert.throws(() => verifyA5({ ...baselineA5, swordRange: 6.0 })); // above melee band
  assert.throws(() => verifyA5({ ...baselineA5, bowRange: 5.0 })); // below ranged band

  // A6 corruption checks
  const baselineA6 = extractA6({
    worldModelRs: read('server-rs/src/content/world_model.rs'),
    millcross: readJson('content/maps/millcross-ford.json'),
  });
  assert.throws(() => verifyA6({ ...baselineA6, regionSizeUnits: 4000.0 })); // legacy 4000
  assert.throws(() => verifyA6({ ...baselineA6, aoiEnterRadiusUnits: 600.0 })); // legacy 600
  assert.throws(() => verifyA6({ ...baselineA6, aoiExitRadiusUnits: 50.0 })); // exit <= enter
  assert.throws(() => verifyA6({ ...baselineA6, regionSizeUnits: 100.0 })); // regionSize < 2 * aoiExit
  assert.throws(() => verifyA6({ ...baselineA6, borderGhostBandUnits: 2.0 })); // borderGhostBand < handoff
  assert.throws(() => verifyA6({ ...baselineA6, mapWidthMetres: 4000 })); // legacy map
  assert.throws(() => verifyA6({ ...baselineA6, chunkSizeWorldMetres: 16 })); // wrong chunk size

  // A7 corruption checks
  const baselineA7 = extractA7({
    mapRs: read('server-rs/src/content/map.rs'),
    terrainCs: read('game-client/src/World/TerrainElevation.cs'),
  });
  assert.throws(() => verifyA7({ ...baselineA7, slopeDegRs: 45.0 }));
  assert.throws(() => verifyA7({ ...baselineA7, slopeDegCs: 30.0 }));
  assert.throws(() => verifyA7({ ...baselineA7, slopeDegRs: 30.0, slopeDegCs: 35.0 })); // mismatch
});
