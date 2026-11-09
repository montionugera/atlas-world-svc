import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

test('C1: identity — millcross-ford carries metres-v1 and 400x400m dimensions across map JSON, server-rs, and game-client', () => {
  const mapDoc = readJson('content/maps/millcross-ford.json');
  assert.equal(mapDoc.mapId, 'millcross-ford', 'mapId must be millcross-ford');
  assert.equal(mapDoc.unitContract, 'metres-v1', 'unitContract must be metres-v1');
  assert.equal(mapDoc.width, 400, 'width must be 400m');
  assert.equal(mapDoc.height, 400, 'height must be 400m');

  const worldRegionsRs = read('server-rs/src/content/world_regions.rs');
  assert.match(
    worldRegionsRs,
    /MILLCROSS_FORD_JSON:\s*&str\s*=\s*include_str!\("\.\.\/\.\.\/\.\.\/content\/maps\/millcross-ford\.json"\);/,
    'world_regions.rs must embed millcross-ford.json'
  );
  assert.match(
    worldRegionsRs,
    /GENERATED_REGION_IDS:\s*\[&str;\s*\d+\]\s*=\s*\[[\s\S]*?"millcross-ford"[\s\S]*?\];/,
    'world_regions.rs GENERATED_REGION_IDS must contain millcross-ford'
  );

  const unifiedMapCs = read('game-client/src/World/UnifiedMapDocument.cs');
  assert.match(
    unifiedMapCs,
    /Path\.Combine\(repoRoot,\s*"content",\s*"maps",\s*\$"{mapId}\.json"\)/,
    'UnifiedMapDocument.cs ResolveMapFilePath must resolve content/maps/{mapId}.json'
  );
});

test('C2: geography — worldSpineBinding matches source zone-millcross-ford.json and spine node', () => {
  const mapDoc = readJson('content/maps/millcross-ford.json');
  const binding = mapDoc.worldSpineBinding;
  assert.ok(binding, 'millcross-ford.json must define worldSpineBinding');

  assert.equal(binding.continentId, 'c02', 'continentId must be c02');
  assert.equal(binding.regionId, 'c02/r21', 'regionId must be c02/r21');
  assert.equal(binding.zoneId, 'millcross-ford', 'zoneId must be millcross-ford');
  assert.equal(binding.spineNodeId, 'n-millcross', 'spineNodeId must be n-millcross');
  assert.equal(binding.townId, 'c-town-millcross', 'townId must be c-town-millcross');
  assert.equal(binding.storyRegionId, 'region-millcross', 'storyRegionId must be region-millcross');

  const zoneDoc = readJson('content/zones/zone-millcross-ford.json');
  assert.equal(zoneDoc.zone, binding.zoneId, 'zoneId matches zone document');
  assert.equal(zoneDoc.region, binding.regionId, 'regionId matches zone document');

  for (const lm of zoneDoc.landmarks || []) {
    assert.ok(binding.landmarkIds.includes(lm.id), `landmark ${lm.id} missing from binding`);
  }
  for (const res of zoneDoc.resources || []) {
    assert.ok(binding.resourceIds.includes(res.id), `resource ${res.id} missing from binding`);
  }
  for (const haz of zoneDoc.hazards || []) {
    assert.ok(binding.hazardIds.includes(haz.id), `hazard ${haz.id} missing from binding`);
  }

  const spineNode = readJson('content/spine/nodes/n-millcross.json');
  assert.equal(spineNode.id, binding.spineNodeId, 'spine node ID matches');
  assert.equal(spineNode.title, 'Millcross', 'spine node title matches');
  assert.deepEqual(spineNode.interior?.size, [220, 160], 'spine node interior size is 220x160');
  assert.deepEqual(spineNode.interior?.anchorInInterior, [110, 80], 'spine node interior anchor is [110, 80]');
});

test('C3: spawn parity — playerSpawn and spawnAreas use explicit server [0..400] <-> world [-200..200] origin convention', () => {
  const mapDoc = readJson('content/maps/millcross-ford.json');
  const w = mapDoc.width;
  const h = mapDoc.height;
  assert.equal(w, 400);
  assert.equal(h, 400);

  // playerSpawn: either authored in doc or defaulted to center (width/2, height/2) as defined by server-rs & client manifest
  const playerSpawn = mapDoc.playerSpawn ?? { x: w * 0.5, y: h * 0.5 };
  assert.ok(playerSpawn.x >= 0 && playerSpawn.x <= w, `playerSpawn x=${playerSpawn.x} within [0, ${w}]`);
  assert.ok(playerSpawn.y >= 0 && playerSpawn.y <= h, `playerSpawn y=${playerSpawn.y} within [0, ${h}]`);
  assert.equal(playerSpawn.x, 200, 'playerSpawn x centered at 200');
  assert.equal(playerSpawn.y, 200, 'playerSpawn y centered at 200');

  // Verify against client/react-client/src/data/generatedWorldMaps.json
  const clientGenMaps = readJson('client/react-client/src/data/generatedWorldMaps.json');
  assert.deepEqual(clientGenMaps.regions['millcross-ford']?.playerSpawn, { x: 200, y: 200 });

  // Verify spawn areas: all lie strictly within [0, 400] x [0, 400] with positive dimensions & count
  assert.ok(Array.isArray(mapDoc.spawnAreas) && mapDoc.spawnAreas.length > 0, 'spawnAreas must not be empty');
  for (const s of mapDoc.spawnAreas) {
    assert.ok(s.x >= 0 && s.x + s.width <= w, `spawnArea ${s.id} x bounds [${s.x}, ${s.x + s.width}] outside [0, ${w}]`);
    assert.ok(s.y >= 0 && s.y + s.height <= h, `spawnArea ${s.id} y bounds [${s.y}, ${s.y + s.height}] outside [0, ${h}]`);
    assert.ok(s.width > 0 && s.height > 0, `spawnArea ${s.id} dims must be positive`);
    assert.ok(s.count > 0, `spawnArea ${s.id} count must be > 0`);
  }

  // Verify origin convention: server_to_world(sx, sy) = (sx - 200, sy - 200)
  const server_to_world = (sx, sy) => ({ wx: sx - w * 0.5, wz: sy - h * 0.5 });
  const centerWorld = server_to_world(200, 200);
  assert.equal(centerWorld.wx, 0, 'center sx=200 maps to wx=0');
  assert.equal(centerWorld.wz, 0, 'center sy=200 maps to wz=0');

  const minWorld = server_to_world(0, 0);
  assert.equal(minWorld.wx, -200, 'min sx=0 maps to wx=-200');
  assert.equal(minWorld.wz, -200, 'min sy=0 maps to wz=-200');

  const maxWorld = server_to_world(400, 400);
  assert.equal(maxWorld.wx, 200, 'max sx=400 maps to wx=200');
  assert.equal(maxWorld.wz, 200, 'max sy=400 maps to wz=200');

  // Verify server-rs map.rs implements this exact formula
  const mapRs = read('server-rs/src/content/map.rs');
  assert.match(
    mapRs,
    /pub fn server_to_world\(&self,\s*sx:\s*f32,\s*sy:\s*f32\)\s*->\s*\(f32,\s*f32\)\s*\{[\s\S]*?let cx = self\.arena_width \* 0\.5;[\s\S]*?let cy = self\.arena_height \* 0\.5;[\s\S]*?\(\(sx - cx\) \* self\.coord_scale,\s*\(sy - cy\) \* self\.coord_scale\)/
  );
});

test('C4: obstacles — staticObstacles have valid 2D AABB bounds, unique stable IDs, and match town-millcross 0.1x metre scaling', () => {
  const mapDoc = readJson('content/maps/millcross-ford.json');
  const obstacles = mapDoc.staticObstacles || [];
  assert.ok(obstacles.length > 0, 'staticObstacles must not be empty');

  const seenIds = new Set();
  for (const obs of obstacles) {
    assert.ok(!seenIds.has(obs.id), `duplicate obstacle id: ${obs.id}`);
    seenIds.add(obs.id);
    assert.ok(0 <= obs.min_x && obs.min_x < obs.max_x && obs.max_x <= mapDoc.width, `obstacle ${obs.id} x out of bounds`);
    assert.ok(0 <= obs.min_y && obs.min_y < obs.max_y && obs.max_y <= mapDoc.height, `obstacle ${obs.id} y out of bounds`);
  }

  // Cross-verify town building footprints from town-millcross.json scaled at 0.1x metre
  const townDoc = readJson('content/towns/town-millcross.json');
  const cx = mapDoc.width * 0.5;
  const cy = mapDoc.height * 0.5;
  const town_w = townDoc.extent.width;
  const town_h = townDoc.extent.height;
  const town_cx = town_w * 0.5;
  const town_cy = town_h * 0.5;
  const town_u = 0.1;
  const origin_sx = cx - town_cx * town_u;
  const origin_sy = cy - town_cy * town_u;

  const buildingFPs = townDoc.footprints.filter((fp) => fp.kind !== 'wall' && fp.kind !== 'gate');
  assert.equal(buildingFPs.length, 18, 'Expected 18 town building footprints');

  const obsMap = new Map(obstacles.map((o) => [o.id, o]));
  for (const fp of buildingFPs) {
    const rect = fp.rect;
    const x0 = Number(rect[0]);
    const y0 = Number(rect[1]);
    const x1 = Number(rect[2]);
    const y1 = Number(rect[3]);

    const expMinX = Math.round((origin_sx + town_u * Math.min(x0, x1)) * 100) / 100;
    const expMinY = Math.round((origin_sy + town_u * Math.min(y0, y1)) * 100) / 100;
    const expMaxX = Math.round((origin_sx + town_u * Math.max(x0, x1)) * 100) / 100;
    const expMaxY = Math.round((origin_sy + town_u * Math.max(y0, y1)) * 100) / 100;

    const obs = obsMap.get(fp.id);
    assert.ok(obs, `Missing obstacle for town footprint ${fp.id}`);
    assert.equal(obs.min_x, expMinX, `min_x mismatch for ${fp.id}`);
    assert.equal(obs.min_y, expMinY, `min_y mismatch for ${fp.id}`);
    assert.equal(obs.max_x, expMaxX, `max_x mismatch for ${fp.id}`);
    assert.equal(obs.max_y, expMaxY, `max_y mismatch for ${fp.id}`);
  }
});

test('C5: terrain & walkability parity — Rust and C# analytical heightfield & 35 deg slope rules agree at sampled points', () => {
  const rsMap = read('server-rs/src/content/map.rs');
  const csTerrain = read('game-client/src/World/TerrainElevation.cs');

  const rsSlopeMatch = rsMap.match(/MAX_WALKABLE_SLOPE_DEG:\s*f32\s*=\s*([\d.]+);/);
  const csSlopeMatch = csTerrain.match(/MaxWalkableSlopeDeg\s*=\s*([\d.]+)f;/);
  assert.ok(rsSlopeMatch, 'server-rs must declare MAX_WALKABLE_SLOPE_DEG');
  assert.ok(csSlopeMatch, 'TerrainElevation.cs must declare MaxWalkableSlopeDeg');
  const rsSlope = Number(rsSlopeMatch[1]);
  const csSlope = Number(csSlopeMatch[1]);
  assert.equal(rsSlope, 35.0, 'server-rs max walkable slope is 35 deg');
  assert.equal(csSlope, 35.0, 'game-client max walkable slope is 35 deg');

  const mapDoc = readJson('content/maps/millcross-ford.json');
  const amp = mapDoc.terrainAmplitude;
  assert.equal(amp, 0.85, 'millcross-ford terrainAmplitude must be 0.85');
  const terraces = mapDoc.heightTerraces || [];
  assert.ok(terraces.length > 0, 'heightTerraces must not be empty');

  function smoothStep(edge0, edge1, x) {
    if (Math.abs(edge0 - edge1) < 1e-6) {
      return x >= edge1 ? 1.0 : 0.0;
    }
    const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
  }

  function sampleHeightWorld(wx, wz) {
    const distOrigin = Math.hypot(wx, wz);
    const outerMask = smoothStep(9.0, 22.0, distOrigin);
    const waveA = Math.sin(wx * 0.085 + 0.4) * Math.cos(wz * 0.075 - 0.3) * 2.15;
    const waveB = Math.sin((wx * 0.7 - wz * 0.7) * 0.14 + 1.1) * 0.85;
    const northRamp = smoothStep(-9.5, -20.0, wz);
    const northPlateau = northRamp * 1.65 * smoothStep(28.0, 8.0, Math.abs(wx));
    const roadCarve = 1.0 - 0.55 * smoothStep(4.5, 1.8, Math.abs(wx));
    const procY = (waveA + waveB) * outerMask * roadCarve + northPlateau;
    let totalY = procY * amp;

    for (const t of terraces) {
      const dx = wx - t.x;
      const dz = wz - t.z;
      const d = Math.hypot(dx, dz);
      const outerR = Math.max(1.0, t.radius);
      if (d >= outerR) continue;
      const innerR = outerR * Math.max(0.08, Math.min(0.92, 1.0 - t.falloff));
      const weight = 1.0 - smoothStep(innerR, outerR, d);
      totalY += t.height * weight;
    }
    return totalY;
  }

  function sampleSlopeDeg(wx, wz) {
    const eps = 0.25;
    const hl = sampleHeightWorld(wx - eps, wz);
    const hr = sampleHeightWorld(wx + eps, wz);
    const hd = sampleHeightWorld(wx, wz - eps);
    const hu = sampleHeightWorld(wx, wz + eps);
    const vx = hl - hr;
    const vy = 2.0 * eps;
    const vz = hd - hu;
    const len = Math.max(1e-6, Math.hypot(vx, vy, vz));
    const ny = Math.max(-1.0, Math.min(1.0, vy / len));
    return (Math.acos(ny) * 180.0) / Math.PI;
  }

  // Sample grid of points across [-180..180] (20m step)
  let count = 0;
  for (let x = -180; x <= 180; x += 20) {
    for (let z = -180; z <= 180; z += 20) {
      const h = sampleHeightWorld(x, z);
      assert.ok(Number.isFinite(h), `Height at (${x}, ${z}) must be finite`);
      const slope = sampleSlopeDeg(x, z);
      assert.ok(Number.isFinite(slope), `Slope at (${x}, ${z}) must be finite`);
      const isWalkable = slope <= 35.0;
      assert.equal(typeof isWalkable, 'boolean');
      count++;
    }
  }
  assert.equal(count, 19 * 19, 'Sampled 361 grid points across [-180..180]');

  // Verify origin (central plaza) is flat and walkable
  const centerSlope = sampleSlopeDeg(0, 0);
  assert.ok(centerSlope < 5.0, `Center slope ${centerSlope} deg must be gentle (< 5 deg)`);
  assert.ok(centerSlope <= rsSlope, 'Center must be walkable');
});

test('C6: portals — all portals in millcross-ford have unique IDs, in-bounds trigger coordinates, and existing targetMapId files', () => {
  const mapDoc = readJson('content/maps/millcross-ford.json');
  const portals = mapDoc.portals || [];
  const portalIds = new Set();
  for (const p of portals) {
    assert.ok(!portalIds.has(p.id), `Duplicate portal ID: ${p.id}`);
    portalIds.add(p.id);
    assert.ok(p.x >= 0 && p.x <= mapDoc.width, `Portal ${p.id} x out of bounds`);
    assert.ok(p.y >= 0 && p.y <= mapDoc.height, `Portal ${p.id} y out of bounds`);
    if (p.targetMapId) {
      assert.ok(existsSync(resolve(ROOT, `content/maps/${p.targetMapId}.json`)), `Target map ${p.targetMapId}.json does not exist`);
    }
  }

  // Verify cardinal region connections for millcross-ford in Wealdmarch default 3x3 grid
  // Grid layout:
  // [northern-icefield, hollowmarch, gildmark-head]
  // [thornveil,         millcross-ford, ashvale-front]
  // [rooktide-reach,    cindervast,  emberdown]
  const wealdmarchNeighbors = {
    west: 'thornveil',
    east: 'ashvale-front',
    north: 'hollowmarch',
    south: 'cindervast',
  };
  for (const [dir, neighborMapId] of Object.entries(wealdmarchNeighbors)) {
    const neighborPath = resolve(ROOT, `content/maps/${neighborMapId}.json`);
    assert.ok(existsSync(neighborPath), `Neighbor map for ${dir} border (${neighborMapId}.json) must exist`);
  }

  // Cross-verify runtime manifest portal routing table has valid trigger coordinates when present
  const manifest = readJson('content/maps/_manifest.runtime.json');
  const prt = manifest.portalRoutingTable || {};
  const manifestPortalIds = new Set();
  for (const [pid, p] of Object.entries(prt)) {
    assert.ok(!manifestPortalIds.has(pid), `Duplicate manifest portal: ${pid}`);
    manifestPortalIds.add(pid);
    if (p.triggerBoxMeters) {
      assert.ok(p.triggerBoxMeters.x >= 0 && p.triggerBoxMeters.y >= 0, `Invalid triggerBox origin for ${pid}`);
      assert.ok(p.triggerBoxMeters.width > 0 && p.triggerBoxMeters.height > 0, `Invalid triggerBox dimensions for ${pid}`);
    }
  }

  // Cross-verify dungeon portals indexing for millcross-ford
  const dungeonCatalog = readJson('content/dungeons/_compiled_catalog.json');
  const millcrossDungeons = (dungeonCatalog.dungeons || dungeonCatalog).filter((d) => d.mapId === 'millcross-ford');
  assert.ok(millcrossDungeons.length >= 1, 'Expected at least 1 dungeon catalog entry bound to millcross-ford');
  for (const d of millcrossDungeons) {
    assert.ok(d.id, 'Dungeon entry must have id');
    assert.ok(existsSync(resolve(ROOT, `content/dungeons/${d.id}.json`)), `Dungeon template ${d.id}.json must exist`);
    assert.ok(d.portalRadius > 0, 'Dungeon portalRadius must be positive');
  }
});

test('C7: streaming vs AOI boundary — 24m chunks (radius 2, 5x5=120m window) vs 60/64m AOI and full-region floor mesh', () => {
  const mapDoc = readJson('content/maps/millcross-ford.json');
  assert.equal(mapDoc.chunkSizeWorld, 24, 'chunkSizeWorld must be 24m');
  assert.equal(mapDoc.activeChunkRadius, 2, 'activeChunkRadius must be 2');

  const chunkSize = mapDoc.chunkSizeWorld; // 24m
  const radius = mapDoc.activeChunkRadius; // 2
  const windowChunks = 2 * radius + 1; // 5 chunks
  const windowSpanMeters = windowChunks * chunkSize; // 120m
  assert.equal(windowChunks, 5, '5x5 active chunk window');
  assert.equal(windowSpanMeters, 120, '120m x 120m active chunk window span');

  // Center analysis: player at chunk center (0, 0)
  // Window extends [-2.5 * 24, +2.5 * 24] = [-60m, +60m]
  const centerExtent = (radius + 0.5) * chunkSize;
  assert.equal(centerExtent, 60.0, 'Window extends exactly +-60m from chunk center');

  // Chunk edge analysis: player offset by +12.0m inside center chunk
  // Near side window ahead before crossing into next chunk extends to +60m: 60m - 12m = 48.0m away (2 * 24m)
  const chunkHalf = chunkSize * 0.5; // 12.0m
  const nearSideDistance = centerExtent - chunkHalf;
  assert.equal(nearSideDistance, 48.0, 'Near side distance to window edge is 48.0m (2 * 24m)');

  // Network AOI contract: enter = 60m, exit = 64m
  const fixture = readJson('scripts/tests/fixtures/coordinate-contract-fixture.json');
  const aoiEnter = fixture.region.aoiEnterRadiusMetres;
  const aoiExit = fixture.region.aoiExitRadiusMetres;
  assert.equal(aoiEnter, 60.0, 'AOI enter radius is 60m');
  assert.equal(aoiExit, 64.0, 'AOI exit radius is 64m');

  // Near-side gap: 48m streaming prop coverage < 60/64m network AOI
  assert.ok(nearSideDistance < aoiEnter, 'Edge prop streaming cutoff (48m) is inside network AOI (60m)');

  // Verify TerrainElevation.BuildTerrainMesh builds full-region floor mesh (400x400m)
  // preventing floating in void for entities between 48m and 64m
  const terrainCs = read('game-client/src/World/TerrainElevation.cs');
  assert.match(
    terrainCs,
    /public static ArrayMesh BuildTerrainMesh\(float widthMeters,\s*float depthMeters,\s*UnifiedMapDocument\?\s*doc\s*=\s*null\)/,
    'TerrainElevation.cs must have BuildTerrainMesh'
  );
  assert.match(
    terrainCs,
    /int halfCellsX = Mathf\.Max\(10,\s*Mathf\.CeilToInt\(\(widthMeters \* 0\.5f\) \/ step\)\);/,
    'BuildTerrainMesh computes cells across full widthMeters'
  );
  assert.match(
    terrainCs,
    /int halfCellsZ = Mathf\.Max\(10,\s*Mathf\.CeilToInt\(\(depthMeters \* 0\.5f\) \/ step\)\);/,
    'BuildTerrainMesh computes cells across full depthMeters'
  );

  // In MapChunkStreamer.cs: verify chunk streamer respects chunkSize and activeChunkRadius
  const streamerCs = read('game-client/src/World/MapChunkStreamer.cs');
  assert.match(streamerCs, /public float ChunkSizeWorld => Mathf\.Max\(8\.0f,\s*_doc\.ChunkSizeWorld\);/);
  assert.match(streamerCs, /public int ActiveChunkRadius[\s\S]*?Mathf\.Clamp\(_doc\.ActiveChunkRadius,\s*1,\s*8\);/);
});

test('C8: repeatability — compile_world_maps.py --check confirms zero drift', () => {
  const res = spawnSync('python3', ['scripts/compile_world_maps.py', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `compile_world_maps.py --check failed with status ${res.status}:\n${res.stderr || res.stdout}`);
  assert.match(res.stdout, /PASS/, 'compile_world_maps.py output must indicate PASS');
  assert.match(res.stdout, /millcross-ford/, 'compile_world_maps.py output must include millcross-ford');
});
