function parseAtlasZoneLevelRange(z) {
  if (Array.isArray(z && z.level_range) && z.level_range.length >= 2) return z.level_range.map(Number);
  for (const raw of [z && z.level_band, z && z.level_header]) {
    const m = String(raw || '').match(/(\d+)\D+(\d+)\D*$/);
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  }
  return [1, 20];
}

// F-155: ONE table of overland landmark coordinates (SVG space, y down), read by BOTH 2D engines:
// renderDedicatedWorldAtlas draws each landmark at (x, y) and OpenLayers anchors the joined zone at [x, 500 - y].
// zoneId is the zone the landmark stands for in the 63-zone list; kind is the map symbol (2D) and the silhouette (3D). Kilnwatch sits at y=318 (not 308) so it lands
// inside the C01 coast in both engines; the Crown-Beacon Astrolabe is the Crown-Beacon Citadel zone.
const ATLAS_OVERLAND_LANDMARK_ANCHORS = [
  { landmarkId: 'town-lantern-hollow', zoneId: 'zone-town-lantern-hollow', x: 432, y: 422, kind: 'town' },
  { landmarkId: 'town-porcelain-loom-sanctuary', zoneId: 'zone-town-porcelain-loom', x: 545, y: 404, kind: 'town' },
  { landmarkId: 'town-draft-kiln-post', zoneId: 'zone-town-draft-kiln-post', x: 305, y: 418, kind: 'fortress' },
  { landmarkId: 'town-root-train-roundhouse', zoneId: 'zone-town-root-train-roundhouse', x: 712, y: 418, kind: 'town' },
  { landmarkId: 'town-carillon-hearth-belfry', zoneId: 'zone-town-carillon-belfry', x: 382, y: 338, kind: 'town' },
  { landmarkId: 'town-cinnamon-mill-haven', zoneId: 'zone-town-cinnamon-mill', x: 215, y: 332, kind: 'windmill' },
  { landmarkId: 'town-kilnwatch-bastion', zoneId: 'zone-town-kilnwatch-bastion', x: 618, y: 318, kind: 'castle' },
  { landmarkId: 'zone-dungeon-kiln-cellar', zoneId: 'zone-dungeon-kiln-cellar', x: 515, y: 468, kind: 'catacomb' },
  { landmarkId: 'town-pinion-terminus', zoneId: 'zone-town-pinion-terminus', x: 745, y: 288, kind: 'castle' },
  { landmarkId: 'zone-dungeon-pendulum-shaft', zoneId: 'zone-dungeon-pendulum-shaft', x: 665, y: 252, kind: 'tower' },
  { landmarkId: 'zone-dungeon-chronometer-foundry', zoneId: 'zone-dungeon-chronometer-foundry', x: 845, y: 215, kind: 'tower' },
  { landmarkId: 'town-starfall-haven', zoneId: 'zone-town-starfall-haven', x: 565, y: 122, kind: 'castle' },
  { landmarkId: 'citadel-crown-lens', zoneId: 'zone-town-crown-beacon', x: 785, y: 88, kind: 'lair' }
];

// Overland spawn / boss pins in SVG space (y down); read by the 2D atlas and the 3D blockout (svgTo3dWorld).
const ATLAS_OVERLAND_MOB_PINS = [
  { id: 'mob-clover-pup', name: 'Clover-Dew Pup', type: 'Monster', lv: 4, x: 378, y: 468, loc: '-89200:246100', zone: 'Clover South-Gate Meadow' },
  { id: 'mob-kiln-captain', name: '[Mini-Boss] Kiln-Shell Captain', type: 'Mini-Boss', lv: 13, x: 452, y: 472, loc: '48880:247220', zone: 'Kiln Cellar Entrance' },
  { id: 'mob-queen-ant', name: '[MVP] Queen Ant Ash-Brood Sovereign', type: 'MVP', lv: 22, x: 602, y: 472, loc: '53100:242600', zone: 'The Ant Nest B3', dungeonWarpId: 'zone-dungeon-kiln-cellar', dungeonFloorId: 'B3' },
  { id: 'mob-catherok-raid', name: '[Raid] Catherok Pendulum Colossus', type: 'Raid', lv: 26, x: 602, y: 242, loc: '17710:110100', zone: 'Cruma Tower 2F', dungeonWarpId: 'zone-dungeon-pendulum-shaft', dungeonFloorId: '2F' },
  { id: 'mob-cruma-core', name: '[MVP] Core — Prime Governor', type: 'MVP', lv: 30, x: 705, y: 218, loc: '17724:108150', zone: 'Cruma Tower 3F', dungeonWarpId: 'zone-dungeon-pendulum-shaft', dungeonFloorId: '3F' },
  { id: 'mob-hallate-raid', name: '[Raid] Hallate Clockwork Vanguard', type: 'Raid', lv: 32, x: 805, y: 256, loc: '115000:159500', zone: 'Tower of Insolence 2F', dungeonWarpId: 'zone-dungeon-chronometer-foundry', dungeonFloorId: '2F' },
  { id: 'mob-baium-mvp', name: '[MVP] Sovereign Chronometer Aethelgard', type: 'MVP', lv: 35, x: 888, y: 186, loc: '115180:15900', zone: 'Tower of Insolence 3F', dungeonWarpId: 'zone-dungeon-chronometer-foundry', dungeonFloorId: '3F' },
  { id: 'mob-halo-watcher', name: 'Astral Prism Sentinel', type: 'Monster', lv: 48, x: 638, y: 156, loc: '12400:-118000', zone: 'Zenith Refractory' },
  { id: 'mob-vesper-raid', name: '[Raid] Star-Tether Leviathan', type: 'Raid', lv: 68, x: 678, y: 78, loc: '94000:-164000', zone: 'Crown-Lens Approach' },
  { id: 'mob-architect-mvp', name: '[MVP] Apostle of the Shattered Halo', type: 'MVP', lv: 92, x: 896, y: 78, loc: '148000:-204000', zone: 'Celestial Astrolabe Core' }
];

// Travel highways between landmarks (landmark ids). The SVG atlas draws them as curves, OpenLayers as straight
// segments between the same anchors, so both engines show the same road graph.
const ATLAS_OVERLAND_HIGHWAYS = [
  ['town-cinnamon-mill-haven', 'town-carillon-hearth-belfry'],
  ['town-carillon-hearth-belfry', 'town-kilnwatch-bastion'],
  ['town-draft-kiln-post', 'town-lantern-hollow'],
  ['town-lantern-hollow', 'zone-dungeon-kiln-cellar'],
  ['town-lantern-hollow', 'town-porcelain-loom-sanctuary'],
  ['town-porcelain-loom-sanctuary', 'town-kilnwatch-bastion'],
  ['town-root-train-roundhouse', 'town-kilnwatch-bastion'],
  ['town-kilnwatch-bastion', 'zone-dungeon-pendulum-shaft'],
  ['zone-dungeon-pendulum-shaft', 'town-pinion-terminus'],
  ['town-pinion-terminus', 'zone-dungeon-chronometer-foundry'],
  ['town-pinion-terminus', 'town-starfall-haven'],
  ['town-starfall-haven', 'citadel-crown-lens']
];

function getAtlasHighwaySegments() {
  return ATLAS_OVERLAND_HIGHWAYS
    .map(([a, b]) => [getAtlasLandmarkAnchor(a), getAtlasLandmarkAnchor(b)])
    .filter(([a, b]) => a && b);
}

function getAtlasLandmarkAnchor(landmarkId) {
  const a = ATLAS_OVERLAND_LANDMARK_ANCHORS.find(e => e.landmarkId === landmarkId);
  return a ? { x: a.x, y: a.y } : null;
}

// Expanded Full-Canvas Exploration Spread for the 50 non-landmark zones across C01 (x=22..785, y=218..488),
// C02 (x=612..1014, y=156..354), and C03 (x=58..968, y=16..188). Keeps all 13 Landmark Anchors & 5 3D Mountain Massif zones exact!
const ATLAS_EXPANDED_ZONE_SPREAD_TABLE = {
  "zone-town-cinder-gate": [68, 408],
  "zone-town-brass-bell-keep": [288, 258],
  "zone-town-wick-market-commons": [478, 368],
  "zone-town-glass-mire-sanctuary": [592, 456],
  "zone-town-salt-anchor-wharf": [368, 464],
  "zone-field-clover-south-gate": [462, 456],
  "zone-field-kiln-east-orchard": [408, 386],
  "zone-field-celadon-causeway": [535, 352],
  "zone-field-firebrick-duct": [168, 428],
  "zone-field-resin-arch-tunnel": [748, 386],
  "zone-field-cobalt-sandbar-ford": [332, 304],
  "zone-field-chime-pipe-colonnade": [102, 258],
  "zone-field-apricot-aqueduct-terrace": [128, 342],
  "zone-field-cinnamon-bark-viaduct": [248, 388],
  "zone-field-ginger-aqueduct-bridge": [668, 378],
  "zone-field-cinder-apron": [522, 286],
  "zone-field-whispering-mire": [348, 258],
  "zone-field-slag-chasm": [198, 268],
  "zone-harbor-glaze-barge-airship-dock": [58, 296],
  "zone-dungeon-barter-cellar": [388, 434],
  "zone-dungeon-sunken-bloom": [585, 368],
  "zone-dungeon-bellows-barracks": [212, 452],
  "zone-dungeon-root-forge": [678, 456],
  "zone-dungeon-echo-well": [425, 276],
  "zone-dungeon-bellows-gorge": [62, 352],
  "zone-dungeon-terrace-Kiln": [612, 356],
  "zone-catacomb-HERETICS": [482, 412],
  "zone-catacomb-BRANDED": [556, 444],
  "zone-catacomb-APOSTATE": [638, 408],
  "zone-harbor-lantern-ferry-pier": [426, 468],
  "zone-clanhall-kilnwatch-accord": [598, 294],
  "zone-fortress-shanty-kiln": [118, 454],
  "zone-fortress-floran-saffron": [282, 462],
  "zone-field-brass-spur-ridge": [682, 294],
  "zone-field-caldera-rim": [892, 198],
  "zone-field-leyden-causeway": [792, 196],
  "zone-field-astrolabe-rift": [958, 296],
  "zone-field-siphon-sluice": [888, 262],
  "zone-field-metronome-bridge": [648, 262],
  "zone-field-spiral-wormway-ramp": [858, 182],
  "zone-dungeon-mainspring-vault": [918, 326],
  "zone-catacomb-WITCH": [742, 322],
  "zone-catacomb-DARK-OMENS": [798, 252],
  "zone-clanhall-inductor-conclave": [636, 224],
  "zone-fortress-dragonspine-cog": [736, 182],
  "zone-field-tether-causeway": [492, 92],
  "zone-field-aurora-tether": [842, 68],
  "zone-field-orrery-bridge": [348, 62],
  "zone-field-kelp-spiral-reef": [918, 92],
  "zone-town-escapement-anvil": [928, 232],
  "zone-dungeon-star-heart-nave": [118, 96],
  "zone-catacomb-forbidden-path-orrery": [278, 118],
  "zone-fortress-cloud-halo": [678, 86]
};

function getAtlasZoneAnchorLookup() {
  const out = {};
  Object.entries(ATLAS_EXPANDED_ZONE_SPREAD_TABLE).forEach(([zid, pt]) => {
    out[zid] = { x: pt[0], y: pt[1] };
  });
  ATLAS_OVERLAND_LANDMARK_ANCHORS.forEach(e => { out[e.zoneId] = { x: e.x, y: e.y }; });
  return out;
}

// Spawn entity types per zone, from field spawn_territories and dungeon floor spawns.
function getAtlasZoneEntityTypes(tatlas, zones) {
  const entityTypesByZone = {};
  const addEntityType = (zoneId, t) => {
    if (!zoneId || !t) return;
    (entityTypesByZone[zoneId] = entityTypesByZone[zoneId] || new Set()).add(t === 'RaidBoss' ? 'Raid' : t);
  };
  zones.forEach(z => ((z.field_tactical_blueprint || {}).spawn_territories || []).forEach(st => addEntityType(z.zone_id, st.entity_type)));
  ((tatlas && tatlas.multi_floor_dungeons) || []).forEach(d => (d.floors || []).forEach(fl => (fl.spawns || []).forEach(s => addEntityType(d.dungeon_id, s.entity_type))));
  return entityTypesByZone;
}

// F-155: the ONE zone predicate behind the overland filter. OpenLayers features, the 2D SVG zone layer and the
// filter badge count all call it, so both engines always report and highlight the same zones.
function atlasZoneMatchesFilter(z, effFilter, entityTypesByZone) {
  const lvRange = parseAtlasZoneLevelRange(z);
  if (typeof matchesAtlasLevelBand === 'function' && !matchesAtlasLevelBand(lvRange)) return false;
  if (effFilter === 'All') return true;
  if (effFilter === 'TownMarks') return z.actionType === 'town' || z.actionType === 'fortress';
  if (effFilter === 'RaceSpawns') return z.actionType === 'town' && lvRange[0] <= 1;
  if (['Monster', 'Mini-Boss', 'Raid', 'MVP'].includes(effFilter)) {
    // Tier rules (UX-12). Every field and dungeon spawns all four entity types, so tiers key on zone role and level:
    //   Monster   = every hunting zone (field + dungeon) that spawns Monster                         -> 40
    //   Mini-Boss = hunting zones that spawn Mini-Boss and whose max level >= 15 (mid/high tier)     -> 32
    //   Raid      = dungeons + fortress/harbor/clan-hall marks + fields with max level >= 45         -> 27
    //   MVP       = dungeons + endgame apex fields (continent C02/C03, max level >= 45)               -> 19
    const hunting = z.actionType === 'field' || z.actionType === 'dungeon';
    const hasSpawn = t => Boolean(entityTypesByZone[z.zone_id] && entityTypesByZone[z.zone_id].has(t));
    const lvMax = lvRange[1];
    const apexField = z.actionType === 'field' && lvMax >= 45;
    if (effFilter === 'Monster') return hunting && hasSpawn('Monster');
    if (effFilter === 'Mini-Boss') return hunting && hasSpawn('Mini-Boss') && lvMax >= 15;
    if (effFilter === 'Raid') return z.actionType === 'dungeon' || z.actionType === 'fortress' || apexField;
    return z.actionType === 'dungeon' || (apexField && /^continent-0[23]/.test(String(z.continent_id || '')));
  }
  return true;
}

// Place ALL zones once (positions never shift with the active filter), then separate stacked points.
// Cached per atlas document: placement is pure in the zone list and the landmark table.
let ATLAS_ZONE_PLACEMENT_CACHE = { tatlas: null, placedById: null };
function getAtlasPlacedZonePoints(tatlas, zones) {
  if (ATLAS_ZONE_PLACEMENT_CACHE.tatlas === tatlas && ATLAS_ZONE_PLACEMENT_CACHE.placedById) return ATLAS_ZONE_PLACEMENT_CACHE.placedById;
  const anchorLookup = getAtlasZoneAnchorLookup();
  const placeItems = zones.map(z => {
    const anchored = anchorLookup[z.zone_id];
    // Anchors are already 1040×500 pixel-CRS; everything else projects its metre loc_coord via svgX/svgY.
    const loc = anchored ? null : clampWorldLocCoord(z.loc_coord || '-84120:243500');
    const code = getAtlasContinentCode(z.continent_id);
    const p = anchored ? { x: anchored.x, y: anchored.y } : clampPointIntoAtlasContinent(loc.svgX, loc.svgY, code);
    return { id: z.zone_id, code, anchored: Boolean(anchored), x: p.x, y: p.y };
  });
  repelAtlasZonePoints(placeItems);
  const placedById = {};
  placeItems.forEach(it => { placedById[it.id] = { x: it.x, y: it.y }; });
  ATLAS_ZONE_PLACEMENT_CACHE = { tatlas, placedById };
  return placedById;
}

// { effFilter, zones (all 63), matching (zones passing atlasZoneMatchesFilter), placedById }.
function getAtlasOverlandZoneFilterModel() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(tatlas);
  const effFilter = (typeof resolveAtlasEffectiveFilter === 'function' && typeof ATLAS_STATE_STORE !== 'undefined')
    ? resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter || 'All', 'overland').effective
    : 'All';
  const entityTypesByZone = getAtlasZoneEntityTypes(tatlas, zones);
  const matching = zones.filter(z => atlasZoneMatchesFilter(z, effFilter, entityTypesByZone));
  return { effFilter, zones, matching, placedById: getAtlasPlacedZonePoints(tatlas, zones) };
}

function buildAtlasspatialFeaturesList() {
  const { matching, placedById } = getAtlasOverlandZoneFilterModel();
  return matching.map(z => {
    const contCode = getAtlasContinentCode(z.continent_id);
    const placed = placedById[z.zone_id];
    const sx = placed.x;
    const sy = placed.y;
    const lvRange = parseAtlasZoneLevelRange(z);
    const lensMeta = getAtlasPersonaLensTelemetrySummary({
      id: z.zone_id,
      name: z.name,
      actionType: z.actionType || 'field',
      levelRange: lvRange,
      locCoord: z.loc_coord || '0:0'
    });
    const shortName = (z.name || z.zone_id).split(' (')[0];
    const poi = {
      title: z.name || z.zone_id,
      category: `${z.zoneCategory || 'World Zone'} · ${lensMeta.lensBadge}`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `${z.level_header || `Lv.${lvRange[0]}–${lvRange[1]}`} · loc=${z.loc_coord || '0:0'}`,
      summary: `OpenLayers 2D Pixel-CRS feature (${lensMeta.pillText}). Click primary action to drill into Street Blueprint or Multi-Floor Sub-Map.`,
      address: `${z.territory_name || shortName} · CRADLE-METERS (${sx}, ${sy})`,
      coordinates: `loc=${z.loc_coord || '0:0'} · Lens: ${lensMeta.lens.toUpperCase()}`,
      scaleSpecs: '12.5m–14.0m Arterial Roads · 4.4m Walkways · 0.58m Counters',
      locCoord: z.loc_coord || '0:0',
      townBlueprintId: z.actionType === 'town' ? (z.studio_node_id || z.zone_id) : '',
      dungeonWarpId: z.actionType === 'dungeon' ? z.zone_id : '',
      dungeonFloorId: z.actionType === 'dungeon' ? 'B1' : '',
      inspectId: z.studio_node_id || z.zone_id,
      svgX: sx,
      svgY: sy
    };
    return {
      id: z.zone_id,
      studioNodeId: z.studio_node_id || z.zone_id,
      name: shortName,
      fullName: z.name || z.zone_id,
      category: z.zoneCategory || 'Zone',
      actionType: z.actionType || 'field',
      levelRange: lvRange,
      levelHeader: z.level_header || `Lv.${lvRange[0]}–${lvRange[1]}`,
      locCoord: z.loc_coord || '0:0',
      continentCode: contCode,
      lensBadge: lensMeta.lensBadge,
      lensColor: lensMeta.lensColor,
      poi,
      x: sx,
      y: sy
    };
  });
}

function ensureOpenLayersRuntimeLoaded() {
  if (typeof document === 'undefined' || !document.createElement || !document.head || typeof document.head.appendChild !== 'function') return;
  if (!document.getElementById('atlasOlCssLink')) {
    const link = document.createElement('link');
    link.id = 'atlasOlCssLink';
    link.rel = 'stylesheet';
    link.href = '/vendor/ol.css';
    document.head.appendChild(link);
  }
  if (!document.getElementById('atlasOlScriptTag') && typeof window !== 'undefined' && !window.ol) {
    const s = document.createElement('script');
    s.id = 'atlasOlScriptTag';
    s.src = '/vendor/ol.js';
    s.async = true;
    s.onload = () => {
      try {
        if (window.ol && window.ol.proj && window.ol.proj.Projection) {
          window.__ATLAS_OL_PROJECTION = new window.ol.proj.Projection({
            code: 'CRADLE-METERS',
            units: 'm',
            extent: [0, 0, 1040, 500]
          });
        }
        if (ATLAS_ENGINE_MODE === '2d_ol') {
          initOrUpdateAtlasOpenLayersEngine();
        }
      } catch (_e) {}
    };
    document.head.appendChild(s);
  }
}

// Continent polygons in OL pixel-CRS (y up, 1040x500; feature points plot at [x, 500 - y]). These are the original
// non-overlapping landmass outlines (they match renderCleanVectorContinentReliefSvg); zone points that fall outside
// their own continent are pulled in by clampPointIntoAtlasContinent, not by growing the polygons.
function getAtlasContinentPolygons() {
  return [
    { code: 'C01', name: 'C01 Hearthbloom Basin', pts: [[28,14],[22,155],[46,265],[235,282],[435,268],[585,232],[642,195],[648,162],[778,138],[785,38],[695,14],[380,12],[28,14]], fill: 'rgba(16,185,129,0.22)', stroke: '#34d399' },
    { code: 'C02', name: 'C02 Clockwork Steppe', pts: [[655,178],[612,242],[615,298],[705,336],[858,344],[1008,318],[1014,188],[945,146],[805,152],[655,178]], fill: 'rgba(245,158,11,0.22)', stroke: '#fbbf24' },
    { code: 'C03', name: 'C03 Shattered Sky-Halo', pts: [[68,312],[58,438],[195,480],[525,484],[865,478],[968,428],[928,356],[685,348],[415,318],[68,312]], fill: 'rgba(168,85,247,0.22)', stroke: '#c084fc' }
  ];
}

// Pull an SVG-space point (x, y down) into its own continent polygon and out of every other one. Returns the input
// unchanged when it is already valid; otherwise projects onto the nearest own-polygon edge and nudges inward
// (toward the vertex centroid) until the point is inside its own continent and outside all others.
function clampPointIntoAtlasContinent(x, y, code) {
  const polys = getAtlasContinentPolygons();
  const own = polys.find(c => c.code === code);
  if (!own) return { x, y, moved: 0 };
  const valid = (px, py) => isPointInAtlasPolygon(px, py, own.pts)
    && !polys.some(c => c.code !== code && isPointInAtlasPolygon(px, py, c.pts));
  const py = 500 - y;
  if (valid(x, py)) return { x, y, moved: 0 };
  let best = null;
  for (let i = 0; i < own.pts.length - 1; i++) {
    const [ax, ay] = own.pts[i];
    const [bx, by] = own.pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = Math.hypot(x - qx, py - qy);
    if (!best || d < best.d) best = { qx, qy, d };
  }
  const ring = own.pts.slice(0, -1);
  const cx = ring.reduce((n, p) => n + p[0], 0) / ring.length;
  const cy = ring.reduce((n, p) => n + p[1], 0) / ring.length;
  const vlen = Math.hypot(cx - best.qx, cy - best.qy) || 1;
  const ux = (cx - best.qx) / vlen;
  const uy = (cy - best.qy) / vlen;
  let out = { x: Math.round(cx), y: Math.round(cy) };
  for (let step = 8; step <= 80; step += 4) {
    const nx = Math.round(best.qx + ux * step);
    const ny = Math.round(best.qy + uy * step);
    if (valid(nx, ny)) { out = { x: nx, y: ny }; break; }
  }
  return { x: out.x, y: 500 - out.y, moved: Math.hypot(out.x - x, 500 - out.y - y) };
}

// Deterministic repel pass: push distinct zone points apart to >= ATLAS_MIN_ZONE_GAP_PX along the pair vector, keeping
// each point strictly inside its OWN continent polygon and outside the others. items: [{id, code, anchored, x, y}] in
// SVG coords (y down); mutated in place and returned. Anchored points never move toward a free partner's push.
function repelAtlasZonePoints(items) {
  const GAP = 13;
  const polys = getAtlasContinentPolygons();
  const valid = (it, px, py) => {
    const own = polys.find(c => c.code === it.code);
    if (!own) return true;
    return isPointInAtlasPolygon(px, 500 - py, own.pts) && !polys.some(c => c.code !== it.code && isPointInAtlasPolygon(px, 500 - py, c.pts));
  };
  const order = items.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tryMove = (it, ang, dist) => {
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, 3.14159]) {
      const nx = Math.round(it.x + Math.cos(ang + off) * dist);
      const ny = Math.round(it.y + Math.sin(ang + off) * dist);
      if (valid(it, nx, ny)) { it.x = nx; it.y = ny; return true; }
    }
    return false;
  };
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = order[i], b = order[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= GAP) continue;
        if (a.anchored && b.anchored && d > 0.5) continue;
        const ang = d < 1e-6 ? ((i * 2.399963 + j * 0.7548) % (2 * Math.PI)) : Math.atan2(dy, dx);
        const need = GAP - d + 0.5;
        if (a.anchored && !b.anchored) moved = tryMove(b, ang, need) || moved;
        else if (b.anchored && !a.anchored) moved = tryMove(a, ang + Math.PI, need) || moved;
        else if (a.anchored && b.anchored) moved = tryMove(b, ang, need) || moved;
        else {
          const m1 = tryMove(a, ang + Math.PI, need / 2);
          const m2 = tryMove(b, ang, need / 2);
          moved = m1 || m2 || moved;
        }
      }
    }
    if (!moved) break;
  }
  return items;
}

function getAtlasContinentCode(continentId) {
  const m = String(continentId || '').match(/^continent-0([123])/);
  return m ? 'C0' + m[1] : '';
}

// OL only draws the overland vector map; town/field/dungeon contexts fall back to the 2D SVG renderer.
function getAtlasEffectiveEngineMode() {
  if (ATLAS_ENGINE_MODE === '2d_ol' && getAtlasSpatialContext() !== 'overland') return '2d_svg';
  return ATLAS_ENGINE_MODE;
}

// The app camera (STUDIO_MAP_ZOOM + PAN) is the single source of truth for SVG and OL:
// OL resolution = SVG units per CSS px at that zoom, OL centre = the world point at the SVG view centre.
function getAtlasOlCameraFromApp(el) {
  const rect = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 1040, height: 500 };
  const k = Math.min((rect.width || 1040) / 1040, (rect.height || 500) / 500) || 1;
  const s = Math.max(0.1, getStudioMapEffScale());
  const c = atlasSvgToWorldPoint(520, 250);
  return { k, center: [c.x, 500 - c.y], resolution: 1 / (k * s) };
}

function applyAtlasOlViewToApp(map, el) {
  const view = map && typeof map.getView === 'function' ? map.getView() : null;
  if (!view || !isStudioMapOverland()) return;
  const res = view.getResolution();
  const c = view.getCenter();
  if (!res || !c) return;
  const { k } = getAtlasOlCameraFromApp(el);
  const s = Math.max(0.85, Math.min(8.0, 1 / (res * k)));
  STUDIO_MAP_ZOOM = +s.toFixed(2);
  STUDIO_MAP_PAN_X = -s * (c[0] - 520);
  STUDIO_MAP_PAN_Y = -s * ((500 - c[1]) - 250);
  const lbl = document.getElementById('studioCartoZoomReadout');
  if (lbl) lbl.textContent = `${STUDIO_MAP_ZOOM.toFixed(2)}\u00d7`;
  writeUrlState(false);
}

function syncAtlasOlViewFromApp() {
  const map = typeof window !== 'undefined' ? window.__ATLAS_OL_MAP_INSTANCE : null;
  if (!map || getAtlasEffectiveEngineMode() !== '2d_ol' || typeof map.getView !== 'function') return;
  const el = typeof map.getTargetElement === 'function' ? map.getTargetElement() : null;
  const cam = getAtlasOlCameraFromApp(el);
  map.getView().setCenter(cam.center);
  map.getView().setResolution(cam.resolution);
}

function getVisibleAtlasOverlandMobPins() {
  const fFilter = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'overland').effective;
  const lensMeta = getAtlasPersonaLensTelemetrySummary({ actionType: 'field', levelRange: [1, 35] });
  return ATLAS_OVERLAND_MOB_PINS.filter(mp => {
    if (typeof matchesAtlasLevelBand === 'function' && !matchesAtlasLevelBand(mp.lv)) return false;
    if (fFilter === 'All') return true;
    if (['Monster', 'Mini-Boss', 'Raid', 'MVP'].includes(fFilter)) return mp.type === fFilter;
    return false;
  }).map(mp => ({
    ...mp,
    poi: {
      title: mp.name,
      category: `${mp.type} Spawn Pin · Lv.${mp.lv} · ${lensMeta.lensBadge}`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `${mp.type} · loc=${mp.loc}`,
      summary: `${mp.type} habitat in ${mp.zone}.`,
      address: mp.zone,
      coordinates: `loc=${mp.loc}`,
      scaleSpecs: 'Spawn marker',
      locCoord: mp.loc,
      dungeonWarpId: mp.dungeonWarpId || '',
      dungeonFloorId: mp.dungeonFloorId || '',
      inspectId: mp.id,
      svgX: mp.x,
      svgY: mp.y
    }
  }));
}

function getActiveAtlasOverlandRouteOverlay(tatlasOpt) {
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  const tatlas = tatlasOpt || sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(tatlas);
  const placed = typeof getAtlasPlacedZonePoints === 'function' ? getAtlasPlacedZonePoints(tatlas, zones) : {};
  let bfsRouteHops = [];
  if (ATLAS_ROUTE_PLANNER_OPEN) {
    const res = computeShortestAtlasZonePath(
      ATLAS_ROUTE_FROM_ID || ATLAS_STATE_STORE.routeFromId || 'zone-town-lantern-hollow',
      ATLAS_ROUTE_TO_ID || ATLAS_STATE_STORE.routeToId || 'zone-dungeon-kiln-cellar',
      tatlas
    );
    const total = (res.hops || []).length;
    bfsRouteHops = (res.hops || []).map(hop => {
      const a = placed[hop.zoneId];
      const sx = a ? a.x : hop.svgX;
      const sy = a ? a.y : hop.svgY;
      const act = (hop.zone && hop.zone.actionType) || 'field';
      return {
        ...hop,
        sx,
        sy,
        poi: {
          title: `🧭 Hop #${hop.hopIndex}: ${hop.name}`,
          category: `${hop.travelMode} · ${hop.levelBand} · Fee: ${hop.adenaFee} Adena`,
          thumb: '/thumbs/buildings/tower_round_roof_a.webp',
          hoursOrStatus: `TRAVEL ROUTE HOP ${hop.hopIndex} OF ${total} · loc=${hop.locCoord}`,
          summary: `L2 Reference: ${hop.l2Analog}. Mode: ${hop.travelMode}.`,
          address: `${hop.name} (${hop.zoneId})`,
          coordinates: `loc=${hop.locCoord} · ${hop.levelBand}`,
          scaleSpecs: `Connected 63-Zone Graph Hop #${hop.hopIndex}`,
          locCoord: hop.locCoord,
          townBlueprintId: act === 'town' ? ((hop.zone && hop.zone.studio_node_id) || hop.zoneId) : '',
          fieldTacticalBlueprintId: act === 'field' || act === 'fortress' ? hop.zoneId : '',
          dungeonWarpId: act === 'dungeon' ? hop.zoneId : '',
          dungeonFloorId: act === 'dungeon' ? 'B1' : '',
          inspectId: (hop.zone && hop.zone.studio_node_id) || hop.zoneId,
          svgX: sx,
          svgY: sy
        }
      };
    });
  }
  const raceRoutes = tatlas.race_growth_routes || [];
  const activeRaceRouteLabel = ATLAS_STATE_STORE.raceGrowthRoute || 'All';
  const raceRouteObj = activeRaceRouteLabel !== 'All'
    ? (raceRoutes.find(r => r.race_label === activeRaceRouteLabel || r.race_key === activeRaceRouteLabel) || null)
    : null;
  let raceRouteWaypoints = [];
  if (raceRouteObj && Array.isArray(raceRouteObj.waypoints)) {
    raceRouteWaypoints = raceRouteObj.waypoints.map((wp, idx) => {
      const a = placed[wp.zone_id] || resolveAtlasFocusLoc(wp.loc, wp.zone_id);
      const sx = a.x !== undefined && a.x <= 1040 ? a.x : (a.svgX || 520);
      const sy = a.y !== undefined && a.y <= 500 ? a.y : (a.svgY || 250);
      return {
        ...wp,
        sx,
        sy,
        idx,
        poi: {
          title: `🛤️ Stage ${wp.stage_code} (Step ${wp.step_index}): ${wp.name}`,
          category: `${raceRouteObj.race_name} Growth Route · ${wp.level_range} · ${wp.travel_mode}`,
          thumb: '/thumbs/buildings/tower_round_roof_a.webp',
          hoursOrStatus: `STAGE ${wp.stage_code} WAYPOINT #${wp.step_index} · Mode: ${String(wp.travel_mode || '').toUpperCase()}`,
          summary: wp.milestone_goal,
          address: `${wp.name} (${wp.l2_alias})`,
          coordinates: `Zone: ${wp.zone_id} · loc=${wp.loc}`,
          scaleSpecs: `Recommended Level: ${wp.level_range} · Travel Mode: ${wp.travel_mode}`,
          locCoord: wp.loc,
          townBlueprintId: String(wp.zone_id || '').startsWith('zone-town-') ? wp.zone_id : '',
          fieldTacticalBlueprintId: String(wp.zone_id || '').startsWith('zone-field-') ? wp.zone_id : '',
          dungeonWarpId: String(wp.zone_id || '').startsWith('zone-dungeon-') ? wp.zone_id : '',
          inspectId: wp.zone_id,
          svgX: sx,
          svgY: sy
        }
      };
    });
  }
  return { bfsRouteHops, raceRouteWaypoints, raceRouteObj };
}

function mountRealOpenLayersInstance(targetEl, features) {
  if (!targetEl || typeof window === 'undefined' || !window.ol || !window.ol.Map || !window.ol.View) return false;
  try {
    const ol = window.ol;
    const proj = window.__ATLAS_OL_PROJECTION || new ol.proj.Projection({
      code: 'CRADLE-METERS',
      units: 'm',
      extent: [0, 0, 1040, 500]
    });
    window.__ATLAS_OL_PROJECTION = proj;
    // Dispose the previous map (render() remounts) - its camera lives on in the app camera.
    const prevMap = window.__ATLAS_OL_MAP_INSTANCE;
    if (prevMap && typeof prevMap.setTarget === 'function') prevMap.setTarget(null);
    window.__ATLAS_OL_MAP_INSTANCE = null;
    targetEl.innerHTML = '';
    const olFeatures = [];
    if (ol.Feature && ol.geom && ol.geom.Polygon && ol.style && ol.style.Style) {
      const contDefs = getAtlasContinentPolygons();
      contDefs.forEach(cd => {
        const pf = new ol.Feature({ geometry: new ol.geom.Polygon([cd.pts]), name: cd.name });
        pf.setStyle(new ol.style.Style({
          fill: new ol.style.Fill({ color: cd.fill }),
          stroke: new ol.style.Stroke({ color: cd.stroke, width: 2 })
        }));
        olFeatures.push(pf);
      });
    }
    // F-155: pins and labels are separate layers. Pins never declutter (every zone is always drawn); labels
    // declutter with core landmarks (town/dungeon/fortress) placed first so fields never evict them and a core
    // label never disappears when zooming in.
    const pinFeatures = [];
    const labelFeatures = [];
    const isCoreZone = f => f.actionType === 'town' || f.actionType === 'dungeon' || f.actionType === 'fortress';
    // F-159: OL's greedy declutter is NOT monotone under zoom-in. A core label H hidden at one zoom by a higher-priority
    // neighbour H' is revealed once H' drifts away, and (id-ordered) then evicts a lower-priority core label L that was
    // drawn a step earlier (768px: Star-Heart Nave and Forbidden-Path Orrery evicted Starfall Haven between 1.5x and 2.2x).
    // Fix at the cause: core labels get a fixed, zoom-independent reveal resolution computed once in priority order.
    // Two label boxes (fixed px size, centres scale with 1/resolution) overlap iff res > sepRes, so L may show while
    // res <= min(sepRes(L,E)) over every earlier E that is itself showing at that sepRes. Once a core label is
    // drawn it stays drawn on zoom-in, and nothing it was drawn beside can later evict it.
    const labelBoxPx = (() => {
      let ctx = null;
      try { ctx = document.createElement('canvas').getContext('2d'); if (ctx) ctx.font = 'bold 10px monospace'; } catch (e) { ctx = null; }
      return f => {
        const w = ctx ? ctx.measureText(String(f.name)).width : String(f.name).length * 6.1;
        return { w: w + 8 + 2 + 4, h: 12 + 4 + 2 + 4 }; // text + padding + stroke + safety margin
      };
    })();
    const coreRevealRes = new Map();
    features.filter(isCoreZone).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(f => {
      const bf = labelBoxPx(f); let limit = Infinity;
      coreRevealRes.forEach((rE, idE) => {
        const e = features.find(x => x.id === idE); const be = labelBoxPx(e);
        const sepRes = Math.max(Math.abs(f.x - e.x) / ((bf.w + be.w) / 2), Math.abs(f.y - e.y) / ((bf.h + be.h) / 2));
        if (rE > sepRes && sepRes < limit) limit = sepRes;
      });
      coreRevealRes.set(f.id, limit);
    });
    if (ol.Feature && ol.geom && ol.geom.Point && ol.style && ol.style.Style) {
      features.forEach(f => {
        const col = f.actionType === 'town' ? '#eab308' : (f.actionType === 'dungeon' ? '#a855f7' : '#38bdf8');
        const pf = new ol.Feature({ geometry: new ol.geom.Point([f.x, 500 - f.y]), zoneMeta: f });
        pf.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: f.actionType === 'town' ? 6.5 : 5,
            fill: new ol.style.Fill({ color: col }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
          })
        }));
        pinFeatures.push(pf);
        const lf = new ol.Feature({ geometry: new ol.geom.Point([f.x, 500 - f.y]), labelMeta: f, labelRank: isCoreZone(f) ? 0 : 1 });
        const labelStyle = new ol.style.Style({
          text: new ol.style.Text({
            text: f.name,
            offsetY: 14,
            font: 'bold 10px monospace',
            fill: new ol.style.Fill({ color: '#f8fafc' }),
            backgroundFill: new ol.style.Fill({ color: 'rgba(9,13,22,0.88)' }),
            backgroundStroke: new ol.style.Stroke({ color: col, width: 1 }),
            padding: [2, 4, 2, 4]
          })
        });
        if (coreRevealRes.has(f.id)) {
          const revealRes = coreRevealRes.get(f.id);
          lf.setStyle((feat, resolution) => (resolution <= revealRes ? labelStyle : null));
        } else {
          lf.setStyle(labelStyle);
        }
        labelFeatures.push(lf);
      });
    }
    const highwayFeatures = [];
    if (ol.Feature && ol.geom && ol.geom.LineString && ol.style && ol.style.Style) {
      getAtlasHighwaySegments().forEach(([a, b]) => {
        const lf = new ol.Feature({ geometry: new ol.geom.LineString([[a.x, 500 - a.y], [b.x, 500 - b.y]]) });
        lf.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({ color: 'rgba(250, 204, 21, 0.72)', width: 2.4, lineDash: [8, 5] })
        }));
        highwayFeatures.push(lf);
      });
    }
    const rulerFeatures = [];
    if (ATLAS_OL_RULER_POINTS.length > 0 && ol.Feature && ol.geom && ol.geom.Point && ol.style && ol.style.Style) {
      if (ATLAS_OL_RULER_POINTS.length === 2 && ol.geom.LineString) {
        const ra = ATLAS_OL_RULER_POINTS[0];
        const rb = ATLAS_OL_RULER_POINTS[1];
        const rfLine = new ol.Feature({
          geometry: new ol.geom.LineString([[ra.x, 500 - ra.y], [rb.x, 500 - rb.y]])
        });
        rfLine.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({ color: '#fde047', width: 3, lineDash: [6, 4] })
        }));
        rulerFeatures.push(rfLine);
      }
      ATLAS_OL_RULER_POINTS.forEach(pt => {
        const rfPt = new ol.Feature({ geometry: new ol.geom.Point([pt.x, 500 - pt.y]), rulerPoint: true });
        rfPt.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6.5,
            fill: new ol.style.Fill({ color: '#ef4444' }),
            stroke: new ol.style.Stroke({ color: '#fde047', width: 2.2 })
          })
        }));
        rulerFeatures.push(rfPt);
      });
    }
    const visibleMobPins = getVisibleAtlasOverlandMobPins();
    const mobPinFeatures = [];
    if (ol.Feature && ol.geom && ol.geom.Point && ol.style && ol.style.Style) {
      const mobColMap = { Monster: '#2dd4bf', 'Mini-Boss': '#fb923c', Raid: '#f43f5e', MVP: '#fde047' };
      visibleMobPins.forEach(mp => {
        const mf = new ol.Feature({ geometry: new ol.geom.Point([mp.x, 500 - mp.y]), mobPinMeta: mp });
        const mCol = mobColMap[mp.type] || '#2dd4bf';
        mf.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: mp.type === 'MVP' ? 7 : (mp.type === 'Raid' ? 6 : 5),
            fill: new ol.style.Fill({ color: mCol }),
            stroke: new ol.style.Stroke({ color: '#0f172a', width: 2 })
          })
        }));
        mobPinFeatures.push(mf);
      });
    }
    const routeOv = getActiveAtlasOverlandRouteOverlay();
    const routeFeatures = [];
    if (ol.Feature && ol.geom && ol.geom.Point && ol.geom.LineString && ol.style && ol.style.Style) {
      if (routeOv.bfsRouteHops.length >= 2) {
        const coords = routeOv.bfsRouteHops.map(h => [h.sx, 500 - h.sy]);
        const bfLine = new ol.Feature({ geometry: new ol.geom.LineString(coords), routeRole: 'bfs_segment' });
        bfLine.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({ color: '#38bdf8', width: 3.5, lineDash: [9, 5] })
        }));
        routeFeatures.push(bfLine);
        routeOv.bfsRouteHops.forEach(hop => {
          const hf = new ol.Feature({ geometry: new ol.geom.Point([hop.sx, 500 - hop.sy]), routeHopMeta: hop, routeRole: 'bfs_hop' });
          hf.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
              radius: 8,
              fill: new ol.style.Fill({ color: '#0284c7' }),
              stroke: new ol.style.Stroke({ color: '#fde047', width: 2 })
            }),
            text: ol.style.Text ? new ol.style.Text({
              text: String(hop.hopIndex),
              font: 'bold 9px monospace',
              fill: new ol.style.Fill({ color: '#ffffff' })
            }) : undefined
          }));
          routeFeatures.push(hf);
        });
      }
      if (routeOv.raceRouteWaypoints.length >= 2) {
        const coords = routeOv.raceRouteWaypoints.map(wp => [wp.sx, 500 - wp.sy]);
        const rfLine = new ol.Feature({ geometry: new ol.geom.LineString(coords), routeRole: 'race_segment' });
        rfLine.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({ color: '#fde047', width: 3.8, lineDash: [10, 6] })
        }));
        routeFeatures.push(rfLine);
        routeOv.raceRouteWaypoints.forEach(wp => {
          const wf = new ol.Feature({ geometry: new ol.geom.Point([wp.sx, 500 - wp.sy]), routeWaypointMeta: wp, routeRole: 'race_waypoint' });
          wf.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
              radius: 8.5,
              fill: new ol.style.Fill({ color: '#b45309' }),
              stroke: new ol.style.Stroke({ color: '#fde047', width: 2 })
            }),
            text: ol.style.Text ? new ol.style.Text({
              text: String(wp.stage_code || ''),
              font: 'bold 9px monospace',
              fill: new ol.style.Fill({ color: '#ffffff' })
            }) : undefined
          }));
          routeFeatures.push(wf);
        });
      }
    }
    const baseLayer = new ol.layer.Vector({ source: new ol.source.Vector({ features: [...olFeatures, ...highwayFeatures] }) });
    const pinLayer = new ol.layer.Vector({ source: new ol.source.Vector({ features: pinFeatures }), declutter: false });
    pinLayer.set('atlasRole', 'pins');
    const mobPinLayer = new ol.layer.Vector({ source: new ol.source.Vector({ features: mobPinFeatures }), declutter: false, zIndex: 6 });
    mobPinLayer.set('atlasRole', 'mob_pins');
    const routeLayer = new ol.layer.Vector({ source: new ol.source.Vector({ features: routeFeatures }), declutter: false, zIndex: 8 });
    routeLayer.set('atlasRole', 'routes');
    const labelLayer = new ol.layer.Vector({
      source: new ol.source.Vector({ features: labelFeatures }),
      declutter: true,
      // Rendered first = placed first = wins collisions: core landmarks before fields, then a stable id order.
      renderOrder: (fa, fb) => (fa.get('labelRank') - fb.get('labelRank'))
        || String(fa.get('labelMeta').id).localeCompare(String(fb.get('labelMeta').id))
    });
    labelLayer.set('atlasRole', 'labels');
    const rulerLayer = new ol.layer.Vector({ source: new ol.source.Vector({ features: rulerFeatures }), declutter: false, zIndex: 10 });
    rulerLayer.set('atlasRole', 'ruler');
    // Explicit geometric resolution ladder with exact 0.85x and 8x endpoints (no power-of-two rounding, which
    // capped OL at 6.8x). 4 steps = ~1.75x per wheel notch / +- click / double-click.
    const cam0 = getAtlasOlCameraFromApp(targetEl);
    const maxRes = 1 / (cam0.k * 0.85);
    const minRes = 1 / (cam0.k * 8.0);
    const resSteps = 4;
    const resLadder = Array.from({ length: resSteps + 1 }, (_, i) => (i === resSteps ? minRes : maxRes * Math.pow(minRes / maxRes, i / resSteps)));
    const map = new ol.Map({
      target: targetEl,
      controls: [],
      layers: [baseLayer, pinLayer, mobPinLayer, routeLayer, labelLayer, rulerLayer],
      view: new ol.View({
        projection: proj,
        center: cam0.center,
        resolution: Math.max(minRes, Math.min(maxRes, cam0.resolution)),
        resolutions: resLadder,
        constrainResolution: false,
        enableRotation: false // F-156 B7: the atlas is north-up; a two-finger twist must not rotate it
      })
    });
    // Two quick ruler clicks must not double-click-zoom the map.
    if (typeof map.getInteractions === 'function' && ol.interaction && ol.interaction.DoubleClickZoom) {
      map.getInteractions().forEach(it => { if (it instanceof ol.interaction.DoubleClickZoom) it.setActive(!ATLAS_OL_RULER_ACTIVE); });
    }
    if (typeof map.on === 'function') {
      map.on('moveend', () => applyAtlasOlViewToApp(map, targetEl));
    }
    if (typeof map.on === 'function') {
      // Ruler points use 'click' (fires at once): 'singleclick' waits 250ms and is dropped for BOTH clicks
      // when two land quickly (OL reads them as a dblclick), so a fast A-B measure recorded nothing.
      map.on('click', (evt) => {
        if (!ATLAS_OL_RULER_ACTIVE) return;
        const coord = evt.coordinate || [520, 250];
        // Fractional world coords: rounding here cost the ruler up to ~2% on short spans.
        if (ATLAS_OL_RULER_POINTS.length >= 2) ATLAS_OL_RULER_POINTS = [];
        ATLAS_OL_RULER_POINTS.push({ x: Math.max(0, Math.min(1040, coord[0])), y: Math.max(0, Math.min(500, 500 - coord[1])) });
        initOrUpdateAtlasOpenLayersEngine();
      });
      map.on('singleclick', (evt) => {
        if (ATLAS_OL_RULER_ACTIVE) return;
        const coord = evt.coordinate || [520, 250];
        const cx = Math.max(0, Math.min(1040, coord[0]));
        const cy = Math.max(0, Math.min(500, 500 - coord[1]));
        // Nearest feature in screen pixels (tolerance 14px at any zoom), not the first within 18 map units.
        const view = typeof map.getView === 'function' ? map.getView() : null;
        const res = (view && typeof view.getResolution === 'function' && view.getResolution()) || 1;
        let clicked = null;
        // F-160: a coarse pointer gets a 44x44 px box around each pin (half-side 22); the nearest centre still wins.
        const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
        let bestPx = coarse ? Infinity : 14;
        const clickCandidates = [
          ...features,
          ...visibleMobPins.map(mp => ({
            id: mp.id,
            name: mp.name,
            actionType: 'mob_pin',
            locCoord: mp.loc,
            dungeonWarpId: mp.dungeonWarpId || '',
            dungeonFloorId: mp.dungeonFloorId || '',
            poi: mp.poi,
            x: mp.x,
            y: mp.y
          }))
        ];
        clickCandidates.forEach(f => {
          const dxPx = Math.abs(f.x - coord[0]) / res;
          const dyPx = Math.abs((500 - f.y) - coord[1]) / res;
          const dPx = Math.hypot(dxPx, dyPx);
          if (coarse ? (dxPx <= 22 && dyPx <= 22 && dPx < bestPx) : dPx <= bestPx) {
            bestPx = dPx;
            clicked = f;
          }
        });
        if (clicked) {
          if (clicked.poi) {
            STUDIO_MAP_SELECTED_POI = clicked.poi;
            ATLAS_LEFT_DRAWER_OPEN = true;
            ATLAS_STATE_STORE.leftDrawerOpen = true;
          }
          if (clicked.actionType === 'dungeon') {
            openDungeonSubMap(clicked.id, 'B1');
          } else if (clicked.actionType === 'town') {
            focusTownStreetBlueprint(clicked.id, clicked.locCoord);
          } else {
            STUDIO_MAP_LOC = clampWorldLocCoord(clicked.locCoord);
            render();
          }
        }
      });
    }
    window.__ATLAS_OL_MAP_INSTANCE = map;
    return true;
  } catch (_e) {
    return false;
  }
}

function initOrUpdateAtlasOpenLayersEngine() {
  const mount = document.getElementById('atlasAdvancedEngineMount');
  if (!mount || getAtlasEffectiveEngineMode() !== '2d_ol') return;
  ensureOpenLayersRuntimeLoaded();
  attachAtlasEngineResizeObserver(mount);
  const features = buildAtlasspatialFeaturesList();
  // 400,000m world span / 1040 logical units = 384.615m per logical unit (1:1 isotropic)
  const METERS_PER_WORLD_UNIT = 400000 / 1040;
  const rulerText = ATLAS_OL_RULER_POINTS.length === 2
    ? (() => {
        const a = ATLAS_OL_RULER_POINTS[0];
        const b = ATLAS_OL_RULER_POINTS[1];
        const distUnits = Math.hypot(b.x - a.x, b.y - a.y);
        const meters = Math.round(distUnits * METERS_PER_WORLD_UNIT);
        const walkSec = Math.round(meters / 6.5);
        const mountSec = Math.round(meters / 14.0);
        return `📏 ${meters.toLocaleString()} m (${walkSec}s walk · ${mountSec}s strider mount)`;
      })()
    : (ATLAS_OL_RULER_ACTIVE ? 'Click 2 points on the GIS canvas to measure exact world distance (CRADLE-METERS)' : 'Decluttered Pixel-CRS Vector Layer (CRADLE-METERS · 1040×500 · 1:1 Isotropic)');

  const hasLiveOl = Boolean(typeof window !== 'undefined' && window.ol && window.ol.Map && window.ol.View && window.ol.layer && window.ol.source);
  const activeLensMeta = getAtlasPersonaLensTelemetrySummary({ actionType: 'town', levelRange: [1, 20] });
  mount.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;background:#07111f">
      <div style="position:relative;flex:1;width:100%;height:100%;overflow:hidden">
        <div id="atlasOlExternalViewport" style="position:absolute;inset:0;z-index:${hasLiveOl ? 5 : 1};opacity:${hasLiveOl ? 1 : 0};pointer-events:${hasLiveOl ? 'auto' : 'none'};background:#07111f;cursor:${ATLAS_OL_RULER_ACTIVE ? 'crosshair' : 'grab'}"></div>
        <canvas id="atlasOlGisCanvas" tabindex="0" onkeydown="onStudioMapKeyDown(event)"
                style="width:100%;height:100%;display:${hasLiveOl ? 'none' : 'block'};position:relative;z-index:3;cursor:${ATLAS_OL_RULER_ACTIVE ? 'crosshair' : 'grab'};outline:none"></canvas>
        <div id="atlasOlToolbarPanel" style="position:absolute;bottom:52px;left:12px;z-index:30;pointer-events:auto;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 10px;border-radius:8px;background:rgba(9,14,24,0.95);border:1px solid rgba(56,189,248,0.55);font-size:11px;color:#e2e8f0;box-shadow:0 6px 18px rgba(0,0,0,0.65)">
          <span class="mono" style="color:#38bdf8;font-weight:800">🌐 OpenLayers 2D Pixel-CRS (CRADLE-METERS · ${features.length} Zones)</span>
          <span id="atlasOlPersonaTelemetryPill" class="mono" style="padding:2px 7px;border-radius:4px;background:rgba(15,23,42,0.95);border:1px solid ${activeLensMeta.lensColor};color:${activeLensMeta.lensColor};font-size:10px;font-weight:800">${escapeHtml(activeLensMeta.pillText)}</span>
          <span id="atlasOlRulerReadout" class="mono" style="color:#fde047">${escapeHtml(rulerText)}</span>
          <button id="atlasOlMeasureBtn" type="button" onclick="toggleAtlasOlRuler()"
                  style="padding:3px 9px;border-radius:5px;border:1px solid ${ATLAS_OL_RULER_ACTIVE ? '#fde047' : 'rgba(148,163,184,0.45)'};background:${ATLAS_OL_RULER_ACTIVE ? '#854d0e' : '#1e293b'};color:#ffffff;font-size:10px;font-weight:800;cursor:pointer">
            📏 ${ATLAS_OL_RULER_ACTIVE ? 'Clear Ruler' : 'Measure Distance'}
          </button>
        </div>
      </div>
    </div>
  `;

  const olExt = document.getElementById('atlasOlExternalViewport');
  const olMounted = mountRealOpenLayersInstance(olExt, features);
  const canvas = document.getElementById('atlasOlGisCanvas');
  if (olMounted && olExt && olExt.style) {
    olExt.style.opacity = '1';
    olExt.style.zIndex = '5';
    olExt.style.pointerEvents = 'auto';
    if (canvas && canvas.style) canvas.style.display = 'none';
  }
  const setup = setupHiDpiIsotropicCanvas(canvas);
  if (!setup) return;
  const { ctx, cssW, cssH, dpr, scale, offsetX, offsetY } = setup;

  // Fill full viewport background at native Retina DPR
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, cssW, cssH);

  // Switch into 1:1 isotropic letterboxed 1040x500 world space
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
  }

  const grad = ctx.createRadialGradient(520, 250, 40, 520, 250, 560);
  grad.addColorStop(0, '#132a46');
  grad.addColorStop(1, '#091526');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1040, 500);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, 1040, 500);

  // Coordinate Grid (CRADLE-METERS 80px isotropic intervals)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = 1;
  for (let gx = 80; gx < 1040; gx += 80) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, 500); ctx.stroke();
  }
  for (let gy = 80; gy < 500; gy += 80) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(1040, gy); ctx.stroke();
  }

  // Draw 3 Continent Vector Polygons
  const drawPoly = (pts, fill, stroke) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  getAtlasContinentPolygons().forEach(c => drawPoly(c.pts.map(([px, py]) => [px, 500 - py]), c.fill, c.stroke));

  // Highway Vector Splines
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
  ctx.lineWidth = 2.2;
  getAtlasHighwaySegments().forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  // Decluttered Vector Features & Labels
  const placedBoxes = [];
  features.forEach(f => {
    const col = f.actionType === 'town' ? '#eab308' : (f.actionType === 'dungeon' ? '#a855f7' : '#38bdf8');
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.actionType === 'town' ? 7 : 5.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const lblW = f.name.length * 6.4 + 12;
    const box = { x1: f.x - lblW / 2, y1: f.y + 8, x2: f.x + lblW / 2, y2: f.y + 24 };
    const hit = placedBoxes.some(b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2));
    if (!hit) {
      placedBoxes.push(box);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
      ctx.fillRect(box.x1, box.y1, lblW, 15);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x1, box.y1, lblW, 15);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.name, f.x, f.y + 19);
    }
  });

  // Draw Ruler Overlay if active
  if (ATLAS_OL_RULER_POINTS.length > 0) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    if (ATLAS_OL_RULER_POINTS.length === 2) {
      ctx.beginPath();
      ctx.moveTo(ATLAS_OL_RULER_POINTS[0].x, ATLAS_OL_RULER_POINTS[0].y);
      ctx.lineTo(ATLAS_OL_RULER_POINTS[1].x, ATLAS_OL_RULER_POINTS[1].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ATLAS_OL_RULER_POINTS.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  canvas.onclick = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const curScale = Math.min(rect.width / 1040, rect.height / 500) || 1;
    const curOffX = (rect.width - 1040 * curScale) / 2;
    const curOffY = (rect.height - 500 * curScale) / 2;
    const cx = Math.max(0, Math.min(1040, (evt.clientX - rect.left - curOffX) / curScale));
    const cy = Math.max(0, Math.min(500, (evt.clientY - rect.top - curOffY) / curScale));
    if (ATLAS_OL_RULER_ACTIVE) {
      if (ATLAS_OL_RULER_POINTS.length >= 2) ATLAS_OL_RULER_POINTS = [];
      ATLAS_OL_RULER_POINTS.push({ x: cx, y: cy });
      initOrUpdateAtlasOpenLayersEngine();
      return;
    }
    const clicked = features.find(f => Math.hypot(f.x - cx, f.y - cy) <= 14);
    if (clicked) {
      if (clicked.poi) {
        STUDIO_MAP_SELECTED_POI = clicked.poi;
        ATLAS_LEFT_DRAWER_OPEN = true;
        ATLAS_STATE_STORE.leftDrawerOpen = true;
      }
      if (clicked.actionType === 'dungeon') {
        openDungeonSubMap(clicked.id, 'B1');
      } else if (clicked.actionType === 'town') {
        focusTownStreetBlueprint(clicked.id, clicked.locCoord);
      } else {
        STUDIO_MAP_LOC = clampWorldLocCoord(clicked.locCoord);
        render();
      }
    }
  };
}

function buildAtlas3dBlockoutScene() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const spatialCtx = ATLAS_3D_STATE.contextOverride || getAtlasSpatialContext();
  const elevMul = ATLAS_3D_STATE.elevScale || 1.0;
  const lensMeta = getAtlasPersonaLensTelemetrySummary({ actionType: spatialCtx, levelRange: [1, 35] });
  const meshes = [];

  if (spatialCtx === 'dungeon') {
    const mfDungeons = tatlas.multi_floor_dungeons || [];
    const dng = mfDungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId || d.studio_node_id === ATLAS_STATE_STORE.activeDungeonId)
      || mfDungeons[0]
      || { dungeon_id: 'zone-dungeon-kiln-cellar', name: 'Kiln Cellar (The Ant Nest)', dungeon_kind: 'underground_labyrinth', floors: [] };
    const isTower = dng.dungeon_kind === 'vertical_tower';
    const floors = dng.floors || [];
    // Tall stacks (5-14 floors) tighten the vertical pitch and centre the stack on y=0 so every plate stays in frame.
    const stepY = floors.length > 8 ? 16 : (floors.length > 4 ? 26 : 42);
    const stackShift = floors.length > 4 ? -((floors.length - 1) * stepY / 2) * (isTower ? 1 : -1) : 0;
    const floorBaseY = fIdx => ((isTower ? fIdx * stepY : -fIdx * stepY) + stackShift) * elevMul;
    floors.forEach((fl, fIdx) => {
      const baseY = floorBaseY(fIdx);
      // Floor slab plate
      meshes.push({
        name: `Floor_${fl.floor_id}_Slab`,
        x: 0, y: baseY - 2, z: 0,
        w: 220, h: 3, d: 130,
        color: isTower ? '#1e3a8a' : '#3b0764',
        alpha: 0.38,
        label: `${fl.floor_id} (${fl.level_range || ''})`,
        poi: {
          title: `${dng.name} — Floor ${fl.floor_id}`,
          category: `Multi-Floor ${isTower ? 'Spire' : 'Labyrinth'} Slab · ${fl.level_range || ''} · ${lensMeta.lensBadge}`,
          thumb: '/thumbs/buildings/tower_round_roof_a.webp',
          hoursOrStatus: `FLOOR ${fl.floor_id} · ${(fl.rooms || []).length} Chambers`,
          summary: fl.name || 'Subterranean/vertical dungeon floor plate.',
          address: `${dng.name} · Floor ${fl.floor_id}`,
          coordinates: `loc=${dng.entrance_loc || '-113490:235526'} · Y=${Math.round(baseY)}m`,
          scaleSpecs: 'Corridors ≥7.5m–12.0m wide · Unobstructed camera sightlines',
          dungeonWarpId: dng.dungeon_id,
          dungeonFloorId: fl.floor_id,
          inspectId: dng.studio_node_id || dng.dungeon_id
        }
      });
      (fl.rooms || []).forEach((rm, rIdx) => {
        const rx = ((rm.x_pct || 20) - 50) * 2.0;
        const rz = ((rm.y_pct || 20) - 50) * 1.1;
        const rw = Math.max(16, (rm.w_pct || 18) * 1.6);
        const rd = Math.max(14, (rm.h_pct || 18) * 1.0);
        const isBossRoom = rIdx === (fl.rooms.length - 1);
        const rh = Math.min(isBossRoom ? 18 : 12, isBossRoom ? stepY * 0.7 : stepY * 0.5) * elevMul;
        const meshName = `${fl.floor_id}_${rm.room_id || ('Room_' + (rIdx + 1))}`;
        meshes.push({
          name: meshName,
          x: rx, y: baseY + rh / 2, z: rz,
          w: rw, h: rh, d: rd,
          color: isBossRoom ? '#f59e0b' : (isTower ? '#38bdf8' : '#a855f7'),
          alpha: 0.88,
          label: `[${fl.floor_id}] ${rm.name.slice(0, 18)}`,
          poi: {
            room_id: rm.room_id,
            title: `[${fl.floor_id}] ${rm.name}`,
            category: `${isBossRoom ? '👑 Boss Sanctum Chamber' : '⚔️ Dungeon Combat Chamber'} · ${fl.level_range || ''} · ${lensMeta.lensBadge}`,
            thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
            hoursOrStatus: `3D CHAMBER MESH (${meshName}) · ${Math.round(rw)}m × ${Math.round(rd)}m × ${Math.round(rh)}m`,
            summary: rm.tactical_notes || rm.function || `Multi-floor chamber on ${fl.floor_id} inside ${dng.name}.`,
            address: `${dng.name} · Floor ${fl.floor_id} · Room #${rIdx + 1}`,
            coordinates: `loc=${dng.entrance_loc || '-113490:235526'} · 3D (${Math.round(rx)}, ${Math.round(baseY)}, ${Math.round(rz)})`,
            scaleSpecs: `Ceiling Height: ${Math.round(rh)}m · Doorway Clearance: 4.5m`,
            dungeonWarpId: dng.dungeon_id,
            dungeonFloorId: fl.floor_id,
            inspectId: dng.studio_node_id || dng.dungeon_id
          }
        });
      });
      if (fIdx < floors.length - 1) {
        const nextY = floorBaseY(fIdx + 1);
        const midY = (baseY + nextY) / 2;
        const nextFloorId = floors[fIdx + 1].floor_id;
        meshes.push({
          name: `WarpShaft_${fl.floor_id}`,
          x: 0, y: midY, z: 0,
          w: 8, h: Math.abs(nextY - baseY), d: 8,
          color: '#22d3ee',
          alpha: 0.75,
          label: `Warp Shaft ${fl.floor_id}⇄${nextFloorId}`,
          poi: {
            title: `Inter-Floor Warp Shaft (${fl.floor_id} ⇄ ${nextFloorId})`,
            category: `Vertical Traversal Conduit · ${dng.name}`,
            thumb: '/thumbs/buildings/tower_round_roof_a.webp',
            hoursOrStatus: `ACTIVE WARP PORTAL · ${fl.floor_id} ⇄ ${nextFloorId}`,
            summary: `Connects Floor ${fl.floor_id} directly to Floor ${nextFloorId}.`,
            address: `${dng.name} Central Axis`,
            coordinates: `Vertical Span: ${Math.round(Math.abs(nextY - baseY))}m`,
            dungeonWarpId: dng.dungeon_id,
            dungeonFloorId: nextFloorId,
            inspectId: dng.studio_node_id || dng.dungeon_id
          }
        });
      }
    });
    return { context: 'dungeon', title: `${dng.name} — 3D Multi-Floor Cutaway`, meshes };
  }

  if (spatialCtx === 'field') {
    const resolvedField = getFieldOrFortressBlueprintData(resolveActiveFieldOrFortEntry() || ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate', tatlas)
      || getFieldOrFortressBlueprintData('zone-field-clover-south-gate', tatlas);
    const entry = (resolvedField && resolvedField.entry) || { zone_id: 'zone-field-clover-south-gate', studio_node_id: 'zone-field-clover-south-gate', name: 'Clover South-Gate Meadow' };
    const bp = (resolvedField && resolvedField.bp) || {};
    const fFilter = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'field').effective;
    const { biomeId: fieldBiomeId, palette: fieldBiomePal } = resolveFieldZoneBiomeId(entry);
    meshes.push({
      name: 'Field_Terrain_Ground',
      part: 'field_ground',
      biomeId: fieldBiomeId,
      x: 0, y: -2, z: 0,
      w: 240, h: 4, d: 140,
      color: fieldBiomePal.baseFill || '#14261c',
      alpha: 0.82,
      label: ''
    });
    // Layer 1 (Hydrology): 3D River Channel & Stone Sluice Bridge
    meshes.push({
      name: 'Field_River_Channel_1',
      part: 'composable_river',
      x: 0, y: 0.25 * elevMul, z: -4,
      w: 195, h: 0.5 * elevMul, d: 14,
      color: fieldBiomePal.waterCore || '#3b7d91',
      alpha: 0.88,
      label: '🌊 River Channel',
      poi: {
        title: `River Sluiceway (${entry.name})`,
        category: `Layer 1 Hydrology Spline · ${fieldBiomeId} · ${lensMeta.lensBadge}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `COMPOSABLE LAYER 1 (HYDROLOGY)`,
        summary: `Meandering river channel and shallow sandbank shoal across ${entry.name}.`,
        address: entry.name,
        scaleSpecs: 'Channel Width: 14m',
        inspectId: entry.studio_node_id || entry.zone_id
      }
    });
    meshes.push({
      name: 'Field_Bridge_Sluice_1',
      part: 'composable_bridge',
      x: -8, y: 1.6 * elevMul, z: -4,
      w: 16, h: 3.2 * elevMul, d: 22,
      color: '#78716c',
      alpha: 0.94,
      label: '🌉 Sluice Bridge',
      poi: {
        title: `Stone Sluice Bridge (${entry.name})`,
        category: `Layer 1 Crossing · ${entry.name}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `PASSABLE BRIDGE CROSSING`,
        summary: `Reinforced stone sluice bridge spanning the primary river channel.`,
        address: entry.name,
        scaleSpecs: 'Bridge Deck Width: 8.5m',
        inspectId: entry.studio_node_id || entry.zone_id
      }
    });
    // Layer 2 (Topography): NW & SE Terraced Highland Plateaus
    meshes.push({
      name: 'Field_Highland_Terrace_NW',
      part: 'composable_highland',
      x: -54, y: 4.5 * elevMul, z: -34,
      w: 62, h: 9.0 * elevMul, d: 28,
      color: fieldBiomePal.highStroke || '#3f4d28',
      alpha: 0.86,
      label: '⛰️ NW Highland',
      poi: {
        title: `North-West Highland Escarpment (${entry.name})`,
        category: `Layer 2 Topography Terrace · ${fieldBiomeId}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `ELEVATED CLIFF PLATEAU`,
        summary: `Terraced highland ridge and cliff escarpment overlooking the northern approach.`,
        address: entry.name,
        scaleSpecs: 'Elevation +9.0m',
        inspectId: entry.studio_node_id || entry.zone_id
      }
    });
    meshes.push({
      name: 'Field_Highland_Terrace_SE',
      part: 'composable_highland',
      x: 56, y: 4.0 * elevMul, z: 36,
      w: 54, h: 8.0 * elevMul, d: 26,
      color: fieldBiomePal.highStroke || '#364222',
      alpha: 0.86,
      label: '⛰️ SE Highland',
      poi: {
        title: `South-East Highland Mesa (${entry.name})`,
        category: `Layer 2 Topography Terrace · ${fieldBiomeId}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `ELEVATED CLIFF MESA`,
        summary: `South-eastern cliff ledge with hachure slope drops.`,
        address: entry.name,
        scaleSpecs: 'Elevation +8.0m',
        inspectId: entry.studio_node_id || entry.zone_id
      }
    });
    // Layer 3 (Small Walkways): Footpath ribbon
    meshes.push({
      name: 'Field_Small_Walkway_1',
      part: 'composable_walkway',
      x: -18, y: 0.35 * elevMul, z: 12,
      w: 48, h: 0.7 * elevMul, d: 6,
      color: fieldBiomePal.walkwayCore || '#b89f74',
      alpha: 0.90,
      label: '🛤️ Small Walkway',
      poi: {
        title: `Branching Hunter Footpath (${entry.name})`,
        category: `Layer 3 Small Walkway (3.5m–4.5m)`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `COMPOSABLE LAYER 3 (WALKWAY)`,
        summary: `Secondary dirt footpath linking central patrol road to hunting camps and quest rings.`,
        address: entry.name,
        scaleSpecs: 'Walkway Width: 4.0m',
        inspectId: entry.studio_node_id || entry.zone_id
      }
    });
    // Layer 4 (Foliage & Canopy Scatters): 3D Tree Canopy Groves
    meshes.push({
      name: 'Field_Tree_Canopy_1',
      part: 'composable_tree',
      x: -68, y: 3.5 * elevMul, z: -22,
      w: 10, h: 7.0 * elevMul, d: 10,
      color: fieldBiomePal.treeC1 || '#28542a',
      alpha: 0.92,
      label: '🌲 Canopy Grove NW'
    });
    meshes.push({
      name: 'Field_Tree_Canopy_2',
      part: 'composable_tree',
      x: 64, y: 3.5 * elevMul, z: 18,
      w: 10, h: 7.0 * elevMul, d: 10,
      color: fieldBiomePal.treeC2 || '#326634',
      alpha: 0.92,
      label: '🌲 Canopy Grove SE'
    });
    // Layer 5 (Architectural Compounds): Ancient Stone Watchtower Ruin
    meshes.push({
      name: 'Field_Watchtower_Ruin_1',
      part: 'composable_ruin',
      x: -16, y: 5.5 * elevMul, z: -24,
      w: 14, h: 11.0 * elevMul, d: 12,
      color: '#78716c',
      alpha: 0.94,
      label: '🏛️ Watchtower Ruin',
      poi: {
        title: `Ancient Stone Watchtower & Courtyard Ruin (${entry.name})`,
        category: `Layer 5 Architectural Compound · ${fieldBiomeId}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `COMPOSABLE LAYER 5 (RUIN COMPOUND)`,
        summary: `Top-down & 3D ruined watchtower plinth anchoring field quest rings.`,
        address: entry.name,
        scaleSpecs: 'Compound Footprint: 14m × 12m',
        inspectId: entry.studio_node_id || entry.zone_id
      }
    });
    (bp.patrol_trails || []).forEach((tr, tIdx) => {
      const pts = tr.path_pct || [];
      if (pts.length >= 2) {
        const p0 = pts[0], pN = pts[pts.length - 1];
        const x0 = ((p0[0] || 50) - 50) * 1.9, z0 = ((p0[1] || 50) - 50) * 1.15;
        const x1 = ((pN[0] || 50) - 50) * 1.9, z1 = ((pN[1] || 50) - 50) * 1.15;
        const trailName = `Trail_${tIdx + 1}_${(tr.name || 'Patrol_Path').replace(/[^a-zA-Z0-9]+/g, '_')}`;
        meshes.push({
          name: trailName,
          part: 'patrol_trail',
          x: (x0 + x1) / 2, y: 0.4 * elevMul, z: (z0 + z1) / 2,
          w: Math.min(200, Math.max(8, Math.abs(x1 - x0) + 10)),
          h: 0.8 * elevMul,
          d: Math.min(120, Math.max(8, Math.abs(z1 - z0) + 10)),
          color: '#78716c',
          alpha: 0.85,
          label: '',
          poi: {
            title: tr.name || `Patrol Trail #${tIdx + 1}`,
            category: `Field Patrol Trail · ${entry.name} · ${lensMeta.lensBadge}`,
            thumb: '/thumbs/buildings/tower_round_roof_a.webp',
            hoursOrStatus: `PATROL CORRIDOR (${trailName})`,
            summary: `Hunting patrol trail across ${entry.name}.`,
            address: entry.name,
            scaleSpecs: `${tr.width_meters || 9}m Trail Width`,
            inspectId: entry.studio_node_id || entry.zone_id
          }
        });
      }
    });
    (bp.camp_and_shrine_marks || []).filter(() => fFilter === 'All' || fFilter === 'TownMarks').forEach((m, mIdx) => {
      const mx = ((m.x_pct || 30) - 50) * 1.9;
      const mz = ((m.y_pct || 30) - 50) * 1.15;
      const mh = 11 * elevMul;
      const markName = `CampMark_${(m.mark_id || ('Mark_' + (mIdx + 1))).replace(/[^a-zA-Z0-9]+/g, '_')}`;
      meshes.push({
        name: markName,
        part: 'camp_mark',
        x: mx, y: mh / 2, z: mz,
        w: 9, h: mh, d: 9,
        color: '#10b981',
        alpha: 0.94,
        label: `${m.icon || '⛺'} ${(m.label || m.mark_type || 'Camp').slice(0, 14)}`,
        poi: {
          title: `${m.icon || '⛺'} ${m.label} (${m.mark_type})`,
          category: `Field Tactical Mark · ${m.npc_or_node || ''} · ${lensMeta.lensBadge}`,
          thumb: '/thumbs/buildings/tower_round_roof_a.webp',
          hoursOrStatus: `ACTIVE ${(m.mark_type || 'CAMP').toUpperCase()} · ${entry.name}`,
          summary: m.description || 'Field supply camp and wayfarer shrine.',
          address: `${m.label} · ${entry.name}`,
          coordinates: `Mark ID: ${m.mark_id}`,
          scaleSpecs: 'Clearance >= 6.0m',
          inspectId: entry.studio_node_id || entry.zone_id
        }
      });
    });
    (bp.spawn_territories || []).filter(st => {
      if (typeof matchesAtlasLevelBand === 'function' && !matchesAtlasLevelBand(st.level)) return false;
      if (fFilter === 'All') return true;
      return st.entity_type === fFilter;
    }).forEach((st, sIdx) => {
      const sx = ((st.x_pct || 50) - 50) * 1.9;
      const sz = ((st.y_pct || 50) - 50) * 1.15;
      const rad = Math.max(8, (st.radius_pct || 10) * 0.9);
      const isMvp = st.entity_type === 'MVP';
      const isRaid = st.entity_type === 'Raid';
      const isMini = st.entity_type === 'Mini-Boss';
      const col = isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444'));
      const sh = (isMvp ? 22 : (isRaid ? 18 : (isMini ? 14 : 10))) * elevMul;
      const spawnName = `Spawn_${(st.territory_id || ('T_' + (sIdx + 1))).replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const dropsStr = (st.refinement_drops || []).join(' · ');
      meshes.push(atlas3dMkPrism(`TerritoryRing_${sIdx + 1}`, 'spawn_ring', atlas3dRegPoly(sx, sz, rad), 0, 1.2 * elevMul, col, 0.35, { pickAs: spawnName }));
      meshes.push({
        name: spawnName,
        part: 'spawn_pillar',
        entityType: st.entity_type,
        x: sx, y: sh / 2, z: sz,
        w: isMvp || isRaid ? 10 : 7,
        h: sh,
        d: isMvp || isRaid ? 10 : 7,
        color: col,
        alpha: 0.96,
        label: `${(st.mob_name || 'Spawn').slice(0, 14)} (Lv.${st.level})`,
        poi: {
          title: `${st.mob_name} (Lv.${st.level} ${st.entity_type})`,
          category: `${st.entity_type} Spawn Territory · ×${st.count} (${st.respawn}) · ${lensMeta.lensBadge}`,
          thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
          hoursOrStatus: `3D SPAWN TERRITORY (${spawnName}) · Respawn ${st.respawn}`,
          summary: `Refinement Drops: ${dropsStr}`,
          address: `${entry.name} · loc=${st.loc_coord}`,
          coordinates: `loc=${st.loc_coord} · Radius: ${st.radius_pct}%`,
          scaleSpecs: `Refinement Drops: ${dropsStr}`,
          inspectId: entry.studio_node_id || entry.zone_id
        }
      });
    });
    (bp.dungeon_entrance_warps || []).forEach((dw, dIdx) => {
      const wx = ((dw.x_pct || 70) - 50) * 1.9;
      const wz = ((dw.y_pct || 70) - 50) * 1.15;
      const wh = 16 * elevMul;
      const portalName = `DungeonPortal_${(dw.dungeon_id || ('D_' + (dIdx + 1))).replace(/[^a-zA-Z0-9]+/g, '_')}`;
      meshes.push({
        name: portalName,
        part: 'dungeon_portal',
        drillContext3d: 'dungeon',
        dungeonId: dw.dungeon_id,
        x: wx, y: wh / 2, z: wz,
        w: 11, h: wh, d: 11,
        color: '#a855f7',
        alpha: 0.95,
        label: `🕳️ ${(dw.label || dw.dungeon_id || 'Dungeon').slice(0, 16)}`,
        poi: {
          title: dw.label || `Dungeon Entrance (${dw.dungeon_id})`,
          category: `Subterranean Dungeon Warp Portal · ${lensMeta.lensBadge}`,
          thumb: '/thumbs/buildings/tower_round_roof_a.webp',
          hoursOrStatus: `DUNGEON PORTAL (${dw.floor_id || 'B1'}) · Double-click to enter`,
          summary: ` Connects ${entry.name} directly to ${dw.dungeon_id} (${dw.floor_id || 'B1'}).`,
          address: entry.name,
          dungeonWarpId: dw.dungeon_id,
          dungeonFloorId: dw.floor_id || 'B1',
          inspectId: dw.dungeon_id
        }
      });
    });
    return { context: 'field', title: `${entry.name} — 3D Tactical Spawn & Territory Blockout`, meshes };
  }

  if (spatialCtx === 'town') {
    const allTowns = getAllAtlasTownEntries(tatlas);
    const townNode = allTowns.find(t => t.id === ATLAS_STATE_STORE.activeTownId || t.zone_id === ATLAS_STATE_STORE.activeTownId || t.studio_node_id === ATLAS_STATE_STORE.activeTownId) || allTowns[0] || { id: 'town-lantern-hollow', name: 'Lantern Hollow' };
    const bp = getTownBlueprintData(townNode, tatlas);
    const npcByBldg = {};
    (bp.npc_roster || []).forEach(n => { npcByBldg[n.building_number] = n; });
    // Town ground plinth
    meshes.push({
      name: 'Town_Plaza_Ground',
      x: 0, y: -2, z: 0,
      w: 240, h: 4, d: 140,
      color: '#1e293b',
      alpha: 0.75,
      label: ''
    });
    // Extrude Town Street Ribbons (bp.streets) as 3D cobblestone road slabs connecting buildings
    (bp.streets || []).forEach((st, sIdx) => {
      const pts = st.path_pct || [];
      if (pts.length >= 2) {
        const p0 = pts[0];
        const pN = pts[pts.length - 1];
        const x0 = ((p0[0] || 50) - 50) * 1.9;
        const z0 = ((p0[1] || 50) - 50) * 1.15;
        const x1 = ((pN[0] || 50) - 50) * 1.9;
        const z1 = ((pN[1] || 50) - 50) * 1.15;
        const roadW = Math.max(10, Math.abs(x1 - x0) + (st.width_meters || 12) * 0.9);
        const roadD = Math.max(10, Math.abs(z1 - z0) + (st.width_meters || 12) * 0.9);
        const roadH = Math.max(0.8, 1.0 * elevMul);
        const roadName = `Road_${sIdx + 1}_${(st.name || 'Cobblestone_Way').replace(/[^a-zA-Z0-9]+/g, '_')}`;
        meshes.push({
          name: roadName,
          x: (x0 + x1) / 2,
          y: roadH / 2,
          z: (z0 + z1) / 2,
          w: Math.min(200, roadW),
          h: roadH,
          d: Math.min(120, roadD),
          color: '#475569',
          alpha: 0.88,
          label: '',
          poi: {
            title: `${st.name || `Arterial Street #${sIdx + 1}`}`,
            category: `Cobblestone Thoroughfare · ${st.width_meters || 12.5}m Wide · ${lensMeta.lensBadge}`,
            thumb: '/thumbs/buildings/tower_round_roof_a.webp',
            hoursOrStatus: `NAVIGABLE STREET RIBBON (${roadName})`,
            summary: `Primary pedestrian & strider thoroughfare across ${bp.archetype_subtitle || townNode.name}.`,
            address: `${bp.archetype_subtitle || townNode.name}`,
            scaleSpecs: `${st.width_meters || 12.5}m Carriageway · 0.14m Curb Step Riser`,
            inspectId: townNode.studio_node_id || townNode.id || 'town-lantern-hollow'
          }
        });
      }
    });
    // Outer defensive curtain walls (N/S/E/W bastions)
    const wallH = 14 * elevMul;
    meshes.push({ name: 'Wall_North', x: 0, y: wallH / 2, z: -64, w: 210, h: wallH, d: 5, color: '#64748b', alpha: 0.85, label: 'North Gate Wall (14m)' });
    meshes.push({ name: 'Wall_South', x: 0, y: wallH / 2, z: 64, w: 210, h: wallH, d: 5, color: '#64748b', alpha: 0.85, label: '' });
    meshes.push({ name: 'Wall_West', x: -102, y: wallH / 2, z: 0, w: 5, h: wallH, d: 128, color: '#64748b', alpha: 0.85, label: '' });
    meshes.push({ name: 'Wall_East', x: 102, y: wallH / 2, z: 0, w: 5, h: wallH, d: 128, color: '#64748b', alpha: 0.85, label: '' });
    // Central Race Spawn Obelisk
    const shrineH = 22 * elevMul;
    meshes.push({
      name: 'Central_Race_Spawn_Shrine',
      x: 0, y: shrineH / 2, z: 0,
      w: 12, h: shrineH, d: 12,
      color: '#10b981',
      alpha: 0.95,
      label: '🧬 Race Spawn Shrine',
      poi: {
        title: `🧬 ${bp.spawn_point ? bp.spawn_point.label : 'Central Race Spawn Obelisk'}`,
        category: `Starter Race Spawn & Gatekeeper Plaza · ${lensMeta.lensBadge}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `ACTIVE SPAWN SHRINE · loc=${(bp.spawn_point && bp.spawn_point.loc_coord) || '-84120:243500'}`,
        summary: 'Central town resurrection & starter arrival monument with 360° sightlines to all 12 service buildings.',
        address: `Central Plaza · ${bp.archetype_subtitle || townNode.name}`,
        coordinates: `loc=${(bp.spawn_point && bp.spawn_point.loc_coord) || '-84120:243500'}`,
        scaleSpecs: '22m Obelisk Spire · 13.0m Central Plaza Ring',
        inspectId: townNode.studio_node_id || townNode.id || 'town-lantern-hollow'
      }
    });
    // Extrude #1..#12 numbered town buildings with full Shop & Refinement Catalog POI!
    (bp.buildings || []).forEach(b => {
      const bx = ((b.x_pct || 30) - 50) * 1.9;
      const bz = ((b.y_pct || 30) - 50) * 1.15;
      const bw = Math.max(12, (b.w_pct || 10) * 1.5);
      const bd = Math.max(10, (b.h_pct || 10) * 1.0);
      const baseHeights = { 1: 24, 2: 18, 3: 16, 4: 15, 5: 19, 6: 16, 7: 14, 8: 13, 9: 14, 10: 15, 11: 12, 12: 20 };
      const bh = (baseHeights[b.building_number] || 15) * elevMul;
      const npc = npcByBldg[b.building_number] || {};
      const bldgCatalogTab = b.building_number === 7 ? 'equip_shop' : (b.building_number === 8 ? 'consumable_shop' : (b.building_number === 3 ? 'blacksmith' : 'all'));
      const meshName = `Building_${b.building_number}_${(b.name || '').replace(/[^a-zA-Z0-9]+/g, '_')}`;
      meshes.push({
        name: meshName,
        x: bx, y: bh / 2, z: bz,
        w: bw, h: bh, d: bd,
        color: b.roof_color || '#d97706',
        alpha: 0.92,
        label: `#${b.building_number} ${(b.name || '').replace(/^[0-9]+\.\s*/, '').slice(0, 14)}`,
        poi: {
          title: `${b.name} (3D Building #${b.building_number})`,
          category: `Building #${b.building_number} · NPC: ${npc.name || 'Master Artisan'} (${npc.role_title || b.function || ''}) · ${lensMeta.lensBadge}`,
          thumb: '/thumbs/buildings/tower_round_roof_a.webp',
          hoursOrStatus: `3D EXTRUDED BUILDING #${b.building_number} · ${Math.round(bw)}m × ${Math.round(bd)}m × ${Math.round(bh)}m`,
          summary: b.function || 'Town service building, merchant counter, and refinement workshop.',
          address: `Building #${b.building_number} · ${bp.archetype_subtitle || townNode.name}`,
          coordinates: `loc=${npc.loc_coord || '-84120:243500'} · 3D (${Math.round(bx)}, ${Math.round(bh / 2)}, ${Math.round(bz)})`,
          scaleSpecs: `Doorway: 2.15m × 1.60m · Counter: 0.58m · Roof Apex: ${Math.round(bh)}m`,
          inspectId: townNode.studio_node_id || townNode.id || 'town-lantern-hollow',
          shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
          activeCatalogTab: bldgCatalogTab,
          connections: [{ label: `🏛️ ${b.function || 'Town Service'}`, badge: `#${b.building_number}` }]
        }
      });
    });
    return { context: 'town', title: `${bp.archetype_subtitle || townNode.name} — 3D Building, Street & Wall Extrusion (#1..#12)`, meshes };
  }

  // Default: Overland — the 2D map in 3D (F-158)
  return atlas3dBuildOverlandScene(lensMeta, elevMul);
}

// ---------------------------------------------------------------------------------------------------------------
// F-158: overland 3D blockout = the 2D map in 3D. ONE projection (svgTo3dWorld), the real continent polygons
// (getAtlasContinentPolygons), the shared landmark / highway / boss-pin tables, and per-type silhouettes.
// Mesh contract (read by V-12): every landmark part carries landmarkId + part; the primary also has landmarkPrimary,
// landmarkKind, baseY and sits at the projected anchor; parts of one object carry pickAs = the primary's name.
// ---------------------------------------------------------------------------------------------------------------
function svgTo3dWorld(svgX, svgY) {
  return { x: (svgX - 520) * 0.25, z: (svgY - 250) * 0.25 };
}
// 1040 svg units span the 400 km world; 1 svg unit = 0.25 scene units, so 1 scene unit = 400000 / 260 m.
const ATLAS_3D_OVERLAND_M_PER_UNIT = 400000 / 260;

const ATLAS_3D_LANDMARK_META = {
  'town-lantern-hollow': { name: 'Lantern_Hollow', label: '🏰 Lantern Hollow', color: '#eab308', loc: '-84120:243500', lv: [1, 10], townId: 'town-lantern-hollow' },
  'town-porcelain-loom-sanctuary': { name: 'Porcelain_Loom', label: '🏰 Porcelain Loom', color: '#38bdf8', loc: '45800:41200', lv: [1, 10], townId: 'town-porcelain-loom-sanctuary' },
  'town-draft-kiln-post': { name: 'Draft_Kiln_Post', label: '🛡️ Draft-Kiln Post', color: '#f97316', loc: '-44800:-113200', lv: [1, 10], townId: 'town-draft-kiln-post' },
  'town-root-train-roundhouse': { name: 'Root_Train_Roundhouse', label: '🏘️ Root-Train Roundhouse', color: '#d97706', loc: '115100:-178200', lv: [1, 10], townId: 'town-root-train-roundhouse' },
  'town-carillon-hearth-belfry': { name: 'Carillon_Belfry', label: '🏘️ Carillon Belfry', color: '#a855f7', loc: '12400:16800', lv: [1, 10], townId: 'town-carillon-hearth-belfry' },
  'town-cinnamon-mill-haven': { name: 'Cinnamon_Mill_Haven', label: '🌾 Cinnamon-Mill Haven', color: '#22c55e', loc: '-118200:46800', lv: [1, 10], townId: 'town-cinnamon-mill-haven' },
  'town-kilnwatch-bastion': { name: 'Kilnwatch_Bastion', label: '🏰 Kilnwatch Bastion', color: '#ef4444', loc: '18600:145200', lv: [10, 20], townId: 'town-kilnwatch-bastion' },
  'zone-dungeon-kiln-cellar': { name: 'Kiln_Cellar_Ruins', label: '🕳️ Kiln Cellar Ruins', color: '#a855f7', loc: '-113490:235526', lv: [9, 22], dngId: 'zone-dungeon-kiln-cellar' },
  'town-pinion-terminus': { name: 'Pinion_Terminus', label: '⚙️ Pinion Terminus', color: '#f59e0b', loc: '82900:53200', lv: [18, 25], townId: 'town-pinion-terminus' },
  'zone-dungeon-pendulum-shaft': { name: 'Pendulum_Shaft_Cruma', label: '🗼 Cruma Spire (3F)', color: '#22d3ee', loc: '85400:144200', lv: [20, 30], dngId: 'zone-dungeon-pendulum-shaft' },
  'zone-dungeon-chronometer-foundry': { name: 'Chronometer_Foundry_ToI', label: '🗼 Tower of Insolence (7F)', color: '#fde047', loc: '84800:56400', lv: [25, 38], dngId: 'zone-dungeon-chronometer-foundry', floorTiers: 7 },
  'town-starfall-haven': { name: 'Starfall_Haven_Capital', label: '✨ Starfall Haven', color: '#c084fc', loc: '-14200:-124000', lv: [38, 55], townId: 'town-starfall-haven' },
  'citadel-crown-lens': { name: 'Crown_Beacon_Astrolabe', label: '👑 Crown-Beacon (Lv.99)', color: '#f43f5e', loc: '142000:-198000', lv: [60, 99], dngId: 'zone-dungeon-kiln-cellar' }
};

// Terrain per continent: stepped plateaus inset toward the polygon centroid. top = height above the sea plane.
const ATLAS_3D_CONTINENT_SPEC = {
  C01: { slug: 'Hearthbloom_Basin', shelf: '#1f6f7a', steps: [{ k: 1.0, top: 3, color: '#2f8a57' }, { k: 0.78, top: 5, color: '#46a36a' }],
    poi: { title: 'C01 Hearthbloom Basin (Starter Continent Plateau)', category: 'Continental Massif · Lv.1–20 · 6 Race Spawns', hours: 'CONTINENT C01 · 12 DISTRICTS · 6 STARTER TOWNS', summary: 'Warm pastoral starter basin housing all 6 Playable Race home villages and converging at Kilnwatch Bastion.', address: 'Hearthbloom Basin · Southern Cradle', coords: 'loc=-84120:243500 · Base Elevation: +3m', scale: '180km × 140km Continental Shelf', label: 'C01 Hearthbloom Basin (Lv.1–20)' } },
  C02: { slug: 'Clockwork_Steppe', shelf: '#1f6f7a', steps: [{ k: 1.0, top: 8, color: '#a8721f' }, { k: 0.84, top: 12, color: '#b9822a' }, { k: 0.6, top: 15, color: '#cc9535' }],
    poi: { title: 'C02 The Clockwork Steppe (Midgame Mesa)', category: 'Continental Mesa · Lv.18–35 · Spire Dungeons', hours: 'CONTINENT C02 · PINION TERMINUS & CRUMA/TOI SPIRES', summary: 'Elevated brass-and-basalt plateau featuring Pendulum Shaft (Cruma) and Chronometer Foundry (Tower of Insolence).', address: 'The Clockwork Steppe · Eastern Highland', coords: 'loc=82900:53200 · Base Elevation: +8m', scale: '150km × 120km Terraced Mesa', label: 'C02 Clockwork Steppe (Lv.18–35)' } },
  C03: { slug: 'Shattered_Sky_Halo_Caldera', shelf: '#2a5a8a', steps: [{ k: 1.0, top: 14, color: '#5b3f9c' }, { k: 0.84, top: 20, color: '#7452bd' }], abyss: { k: 0.42, color: '#120826' },
    poi: { title: 'C03 The Shattered Sky-Halo (Endgame Caldera)', category: 'Celestial Ring Continent · Lv.35–99 · Sovereign Sanctums', hours: 'CONTINENT C03 · STARFALL HAVEN & CROWN-BEACON', summary: 'High-altitude floating astral caldera where guilds contest Castle Sieges and the 6 Sealed God Apostles.', address: 'The Shattered Halo · Northern Zenith', coords: 'loc=-14200:-124000 · Base Elevation: +14m', scale: '160km × 95km Floating Ring', label: 'C03 Shattered Sky-Halo (Lv.35–99)' } }
};

// Mountain / highland zones of the 63-zone list; placed with the same pixel-CRS placement the 2D map uses.
const ATLAS_3D_MOUNTAIN_ZONES = [
  // off = [dx, dz] in scene units from the zone's projected anchor. In 2D the five mountain zones plot within ~30 svg px of
  // Kilnwatch Bastion, so the massifs fan out around that cluster instead of burying the castle.
  { zoneId: 'zone-field-brass-spur-ridge', name: 'Brass_Spur_Ridge', off: [6.8, 9.8], rx: 10, rz: 4.2, rot: 0.2, heights: [6, 5, 5, 4], color: '#8a6a45', peaks: 2 },
  { zoneId: 'zone-field-caldera-rim', name: 'Mainspring_Caldera_Rim', off: [2.3, -5.3], rx: 5.2, rz: 5.2, rot: 0.3, heights: [7, 6], color: '#7a5a52', caldera: true },
  { zoneId: 'zone-field-astrolabe-rift', name: 'Astrolabe_Rift_Escarpment', off: [1.5, -15], rx: 10, rz: 3.4, rot: 1.35, heights: [5, 5, 5, 4], color: '#7c7468', peaks: 2 },
  { zoneId: 'zone-fortress-dragonspine-cog', name: 'Dragonspine_Cog', off: [7.1, -1.8], rx: 6.6, rz: 5.8, rot: 0.2, heights: [7, 6, 6, 5], color: '#6b7280', peaks: 1, snow: true },
  { zoneId: 'zone-fortress-cloud-halo', name: 'Cloud_Halo_Crag', off: [0, 0], rx: 8, rz: 6, rot: -0.2, heights: [7, 6, 6, 5], color: '#6e7787', peaks: 2, snow: true }
];

const ATLAS_3D_BOSS_PIN_COLORS = { Monster: '#2dd4bf', 'Mini-Boss': '#fb923c', Raid: '#f43f5e', MVP: '#fde047' };

function atlas3dMixHex(hex, other, t) {
  const a = hexToRgbNormalized(hex), b = hexToRgbNormalized(other);
  const c = a.map((v, i) => Math.round((v + (b[i] - v) * t) * 255));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function atlas3dPolyCentroid(pts) {
  let sx = 0, sz = 0;
  pts.forEach(p => { sx += p[0]; sz += p[1]; });
  return [sx / pts.length, sz / pts.length];
}

function atlas3dBlobPts(cx, cz, rx, rz, rot, n) {
  const out = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + 0.12 * Math.sin(i * 2.3 + rx) + 0.08 * Math.cos(i * 3.1 + rz);
    const px = Math.cos(a) * rx * j, pz = Math.sin(a) * rz * j;
    out.push([+(cx + px * cr - pz * sr).toFixed(3), +(cz + px * sr + pz * cr).toFixed(3)]);
  }
  return out;
}

function atlas3dRegPoly(cx, cz, r) {
  const out = [];
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2 + Math.PI / 8; out.push([+(cx + Math.cos(t) * r).toFixed(3), +(cz + Math.sin(t) * r).toFixed(3)]); }
  return out;
}

function atlas3dMk(name, part, x, y0, z, w, h, d, color, alpha, extra) {
  return Object.assign({ name, part, x, y: y0 + h / 2, z, w, h, d, color, alpha: alpha === undefined ? 0.95 : alpha, label: '' }, extra || {});
}

// Polygon prism. pts = [[x, z], ...] unclosed, kept in the given order; winding records the sign of its area.
function atlas3dMkPrism(name, part, pts, y0, h, color, alpha, extra) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, area = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    area += p[0] * q[1] - q[0] * p[1];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  });
  return Object.assign({ name, part, pts, winding: area >= 0 ? 1 : -1, x: (minX + maxX) / 2, y: y0 + h / 2, z: (minZ + maxZ) / 2,
    w: maxX - minX, h, d: maxZ - minZ, color, alpha: alpha === undefined ? 0.95 : alpha, label: '' }, extra || {});
}

function atlas3dBuildTerrain(E) {
  const terraces = [];
  getAtlasContinentPolygons().forEach(c => {
    const spec = ATLAS_3D_CONTINENT_SPEC[c.code];
    if (!spec) return;
    const base = c.pts.slice(0, -1).map(q => { const w = svgTo3dWorld(q[0], 500 - q[1]); return [w.x, w.z]; });
    const cen = atlas3dPolyCentroid(base);
    const scaled = k => base.map(p => [cen[0] + (p[0] - cen[0]) * k, cen[1] + (p[1] - cen[1]) * k]);
    spec.steps.forEach((st, i) => terraces.push({ code: c.code, spec, idx: i, pts: k1(i === 0 ? base : scaled(st.k)), top: st.top * E, color: st.color }));
    terraces.push({ code: c.code, spec, idx: -1, pts: scaled(1.1), top: 0, color: spec.shelf, shelf: true });
    if (spec.abyss) terraces.push({ code: c.code, spec, idx: -2, pts: scaled(spec.abyss.k), top: spec.steps[spec.steps.length - 1].top * E, color: spec.abyss.color, abyss: true });
  });
  function k1(p) { return p.map(q => [+q[0].toFixed(3), +q[1].toFixed(3)]); }
  const land = terraces.filter(t => !t.shelf && !t.abyss);
  land.forEach(t => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    t.pts.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); });
    t.bb = [a, b, c, d];
  });
  const top = (x, z) => {
    let h = 0;
    for (let i = 0; i < land.length; i++) {
      const t = land[i];
      if (t.top > h && x >= t.bb[0] && x <= t.bb[1] && z >= t.bb[2] && z <= t.bb[3] && isPointInAtlasPolygon(x, z, t.pts)) h = t.top;
    }
    return h;
  };
  return { terraces, top };
}

function atlas3dLandmarkPoi(meta, kind, tLens, th, footprint) {
  const isDng = Boolean(meta.dngId);
  return {
    title: `${meta.label} (3D Landmark ${kind === 'tower' ? 'Spire' : (kind === 'catacomb' || kind === 'lair' ? 'Crypt' : 'Keep')})`,
    category: `${isDng ? 'Multi-Floor Dungeon' : 'Walled Town Keep'} · Lv.${meta.lv[0]}–${meta.lv[1]} · ${tLens.lensBadge}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `3D LANDMARK (${meta.name}) · Double-click to drill into ${isDng ? 'DUNGEON' : 'TOWN'} 3D`,
    summary: `Click to inspect in Place Drawer, or double-click in 3D Blockout to drill directly into the ${isDng ? 'Multi-Floor Dungeon Cutaway' : 'Town #1..#12 Building Blockout'}.`,
    address: `${meta.label} · Cradle of Embers`,
    coordinates: `loc=${meta.loc} · Height: ${Math.round(th)}m`,
    scaleSpecs: `${Math.round(footprint)}m Footprint · 1:1 Godot 4 Blockout Node`,
    townBlueprintId: meta.townId || '',
    dungeonWarpId: meta.dngId || '',
    dungeonFloorId: meta.dngId ? '1F' : '',
    inspectId: meta.townId || meta.dngId || meta.name
  };
}

// Builds every part of one landmark. L: { id, kind, cx, cz, b (base y), low (lowest terrain under footprint), meta }.
function atlas3dBuildLandmark(L, E, tLens) {
  const { cx, cz, meta, kind } = L;
  const parts = [];
  const add = m => { m.landmarkId = L.id; m.landmarkKind = kind; m.baseY = L.b; m.layer = 8; parts.push(m); return m; };
  const col = meta.color;
  let primary = null;
  const plinth = (S, extraH) => add(atlas3dMk(`${meta.name}_Plinth`, 'foundation', cx, L.low - 0.4, cz, S, (L.b + 0.5) - (L.low - 0.4), S, '#57534e', 1));
  if (kind === 'town' || kind === 'castle' || kind === 'fortress') {
    const S = kind === 'castle' ? 12 : (kind === 'fortress' ? 11 : 10);
    const K = kind === 'castle' ? 1.3 : (kind === 'fortress' ? 1.1 : 1.0);
    const half = S / 2, wt = 1.1, wallH = 2.4 * E, tw = 2.6, towH = 5.2 * E;
    plinth(S + 1.6);
    const yb = L.b + 0.5;
    const wallCol = '#94a3b8';
    add(atlas3dMk(`${meta.name}_Wall_N`, 'curtain_wall', cx, yb, cz - half + wt / 2, S, wallH, wt, wallCol));
    add(atlas3dMk(`${meta.name}_Wall_S`, 'curtain_wall', cx, yb, cz + half - wt / 2, S, wallH, wt, wallCol));
    add(atlas3dMk(`${meta.name}_Wall_W`, 'curtain_wall', cx - half + wt / 2, yb, cz, wt, wallH, S - 2 * wt, wallCol));
    add(atlas3dMk(`${meta.name}_Wall_E`, 'curtain_wall', cx + half - wt / 2, yb, cz, wt, wallH, S - 2 * wt, wallCol));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
      const tx = cx + sx * (half - tw / 2 + 0.1), tz = cz + sz * (half - tw / 2 + 0.1);
      add(atlas3dMk(`${meta.name}_CornerTower_${i + 1}`, 'corner_tower', tx, yb, tz, tw, towH, tw, '#64748b'));
      add(atlas3dMk(`${meta.name}_TowerCap_${i + 1}`, 'tower_cap', tx, yb + towH, tz, tw + 0.7, 0.7 * E, tw + 0.7, col));
    });
    const h1 = 3.2 * K * E, h2 = 2.4 * K * E, h3 = 1.5 * K * E;
    primary = add(atlas3dMk(`${meta.name}`, 'keep', cx, yb, cz, 0.42 * S, h1, 0.42 * S, col, 0.97));
    add(atlas3dMk(`${meta.name}_KeepUpper`, 'keep_upper', cx, yb + h1, cz, 0.3 * S, h2, 0.3 * S, atlas3dMixHex(col, '#ffffff', 0.18)));
    add(atlas3dMk(`${meta.name}_KeepTop`, 'keep_top', cx, yb + h1 + h2, cz, 0.18 * S, h3, 0.18 * S, atlas3dMixHex(col, '#ffffff', 0.34)));
    const ty = yb + h1 + h2 + h3;
    add(atlas3dMk(`${meta.name}_BannerPole`, 'banner_pole', cx, ty, cz, 0.25, 2.4 * E, 0.25, '#e2e8f0'));
    add(atlas3dMk(`${meta.name}_BannerFlag`, 'banner_flag', cx + 0.9, ty + 1.3 * E, cz, 1.6, 1.0, 0.15, col));
  } else if (kind === 'tower') {
    const K = L.id === 'zone-dungeon-chronometer-foundry' ? 1.15 : 1.0;
    const W = 7 * K;
    plinth(W + 2);
    const yb = L.b + 0.5;
    // One tier per playable floor for the tall towers (14F / 7F); the 3F towers keep the 4-tier silhouette.
    const tierN = meta.floorTiers || 0;
    const tiers = tierN > 4
      ? Array.from({ length: tierN }, (_, i) => [W * (1 - 0.6 * i / (tierN - 1)), tierN >= 14 ? 2.6 : 3.4])
      : [[W, 5], [W * 0.78, 5], [W * 0.57, 5], [W * 0.4, 4]];
    let y = yb;
    tiers.forEach(([w, h], i) => {
      const hh = h * E;
      const m = add(atlas3dMk(i === 0 ? meta.name : `${meta.name}_Tier_${i + 1}`, 'tier', cx, y, cz, w, hh, w, atlas3dMixHex(col, '#1e293b', 0.55 - i * 0.1), 0.97));
      if (i === 0) primary = m;
      y += hh;
      add(atlas3dMk(`${meta.name}_Ring_${i + 1}`, 'ring', cx, y - 0.15, cz, w + 0.8, 0.35, w + 0.8, col, 0.95));
    });
    add(atlas3dMk(`${meta.name}_Spire`, 'spire_tip', cx, y, cz, W * 0.2, (tierN > 4 ? 8 : 5) * E, W * 0.2, atlas3dMixHex(col, '#ffffff', 0.4)));
  } else if (kind === 'catacomb' || kind === 'lair') {
    const K = kind === 'lair' ? 1.25 : 1.0;
    const R = 5.2 * K;
    const rimH = 1.3 * E;
    primary = add(atlas3dMkPrism(`${meta.name}`, 'crater', atlas3dRegPoly(cx, cz, R), L.b, rimH + 0.6, '#57534e', 0.97));
    const ring = (r, c, dy, name) => add(atlas3dMkPrism(name, 'crater_pit', atlas3dRegPoly(cx, cz, r), L.b + rimH + 0.6, dy, c, 1));
    ring(R * 0.66, '#0b0614', 0.06, `${meta.name}_Pit_1`);
    ring(R * 0.46, atlas3dMixHex('#1e1038', col, 0.25), 0.12, `${meta.name}_Pit_2`);
    ring(R * 0.26, col, 0.18, `${meta.name}_Pit_3`);
    const gz = cz + R + 0.2;
    add(atlas3dMk(`${meta.name}_GateL`, 'gate_pillar', cx - 1.7 * K, L.b, gz, 0.9, 3.4 * E, 0.9, '#a8a29e'));
    add(atlas3dMk(`${meta.name}_GateR`, 'gate_pillar', cx + 1.7 * K, L.b, gz, 0.9, 3.4 * E, 0.9, '#a8a29e'));
    add(atlas3dMk(`${meta.name}_GateArch`, 'gate_arch', cx, L.b + 3.4 * E, gz, 4.6 * K, 0.9, 1.1, '#d6d3d1'));
    if (kind === 'lair') {
      [[-1, -1], [1, -1], [0, 1]].forEach(([sx, sz], i) => add(atlas3dMk(`${meta.name}_Fang_${i + 1}`, 'fang', cx + sx * R * 0.8, L.b + rimH + 0.6, cz + sz * R * 0.7, 1.1, 3.6 * E, 1.1, col)));
    }
  } else if (kind === 'windmill') {
    plinth(5.6);
    const yb = L.b + 0.5;
    primary = add(atlas3dMk(`${meta.name}`, 'mill_body', cx, yb, cz, 3.4, 3.6 * E, 3.4, '#e7e5e4', 0.97));
    add(atlas3dMk(`${meta.name}_BodyUpper`, 'mill_body_upper', cx, yb + 3.6 * E, cz, 2.6, 2.2 * E, 2.6, '#d6d3d1'));
    add(atlas3dMk(`${meta.name}_Cap`, 'mill_cap', cx, yb + 5.8 * E, cz, 3.1, 1.0, 3.1, col));
    add(atlas3dMk(`${meta.name}_SailH`, 'mill_sail', cx, yb + 5.0 * E, cz + 1.9, 7.4, 0.5, 0.25, '#f1f5f9'));
    add(atlas3dMk(`${meta.name}_SailV`, 'mill_sail', cx, yb + 5.0 * E - 3.4, cz + 1.9, 0.5, 7.4, 0.25, '#f1f5f9'));
    add(atlas3dMk(`${meta.name}_Plot_1`, 'farm_plot', cx + 5.2, L.b, cz + 2.0, 4.2, 0.35, 3.2, '#a3b838'));
    add(atlas3dMk(`${meta.name}_Plot_2`, 'farm_plot', cx - 5.4, L.b, cz + 3.0, 4.2, 0.35, 3.2, '#84a63a'));
  }
  const tops = parts.reduce((s, m) => Math.max(s, m.y + m.h / 2), -Infinity);
  const foot = parts.reduce((s, m) => Math.max(s, Math.max(m.w, m.d)), 0);
  primary.landmarkPrimary = true;
  primary.label = meta.label;
  primary.drillContext3d = meta.dngId ? 'dungeon' : 'town';
  primary.townId = meta.townId || '';
  primary.dungeonId = meta.dngId || '';
  primary.poi = atlas3dLandmarkPoi(meta, kind, tLens, tops - L.b, foot);
  parts.forEach(m => { if (m !== primary) m.pickAs = primary.name; });
  return parts;
}

function atlas3dBuildOverlandScene(lensMeta, E) {
  const meshes = [];
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(tatlas);
  const placed = getAtlasPlacedZonePoints(tatlas, zones);
  const zoneById = {};
  zones.forEach(z => { zoneById[z.zone_id] = z; });
  const terrain = atlas3dBuildTerrain(E);

  meshes.push(atlas3dMk('Sea_Ocean_Basin', 'sea', 0, -3, 0, 280, 3, 140, '#0c3b66', 0.96, { layer: 0 }));
  // Continents: the real 2D polygons, extruded as stepped plateaus (shelf, basin, terraces, caldera abyss).
  terrain.terraces.forEach(t => {
    const spec = t.spec;
    if (t.shelf) {
      meshes.push(atlas3dMkPrism(`${t.code}_${spec.slug}_Shelf`, 'shelf', t.pts, -0.6, 1.2, t.color, 0.8, { layer: 1 }));
      return;
    }
    if (t.abyss) {
      meshes.push(atlas3dMkPrism(`${t.code}_${spec.slug}_Abyss`, 'abyss', t.pts, t.top, 0.1, t.color, 1, { layer: 6 }));
      return;
    }
    const extra = { terrace: t.idx, layer: 2 + t.idx };
    if (t.idx === 0) {
      const p = spec.poi;
      Object.assign(extra, {
        label: p.label,
        poi: { title: p.title, category: `${p.category} · ${lensMeta.lensBadge}`, thumb: '/thumbs/buildings/tower_round_roof_a.webp', hoursOrStatus: p.hours,
          summary: p.summary, address: p.address, coordinates: p.coords, scaleSpecs: p.scale }
      });
    }
    const name = t.idx === 0 ? `${t.code}_${spec.slug}_Plateau` : `${t.code}_${spec.slug}_Terrace_${t.idx}`;
    const mesh = atlas3dMkPrism(name, 'continent', t.pts, t.idx === 0 ? -0.6 : spec.steps[t.idx - 1].top * E, t.top - (t.idx === 0 ? -0.6 : spec.steps[t.idx - 1].top * E), t.color, 0.97, extra);
    if (t.idx > 0) mesh.pickAs = `${t.code}_${spec.slug}_Plateau`;
    meshes.push(mesh);
  });

  // Mountains and highlands at the mountain zones.
  ATLAS_3D_MOUNTAIN_ZONES.forEach(mz => {
    const q = placed[mz.zoneId];
    if (!q) return;
    const c0 = svgTo3dWorld(q.x, q.y);
    const c = { x: c0.x + mz.off[0], z: c0.z + mz.off[1] };
    const z = zoneById[mz.zoneId] || {};
    const code = (getAtlasContinentCode(z.continent_id) || 'C02');
    const base = terrain.top(c.x, c.z);
    const peaks = mz.peaks || 1;
    const first = `${code}_Mtn_${mz.name}`;
    for (let pk = 0; pk < peaks; pk++) {
      const off = peaks === 1 ? 0 : (pk === 0 ? -0.5 : 0.5) * mz.rx * 0.9;
      const px = c.x + off * Math.cos(mz.rot), pz = c.z + off * Math.sin(mz.rot);
      const pBase = Math.max(base, terrain.top(px, pz));
      let y = pBase - 0.5;
      const stages = mz.caldera ? 2 : mz.heights.length;
      for (let s = 0; s < stages; s++) {
        const k = [1, 0.74, 0.5, 0.28][s];
        const kk = k * (pk === 1 ? 0.85 : 1);
        const h = mz.heights[s] * E * (pk === 1 ? 0.88 : 1) + (s === 0 ? 0.5 : 0);
        const isTopSnow = mz.snow && s >= stages - 2;
        const color = isTopSnow ? '#e5e7eb' : atlas3dMixHex(mz.color, '#ffffff', s * 0.14);
        const name = pk === 0 && s === 0 ? first : `${first}_P${pk + 1}_S${s + 1}`;
        const mesh = atlas3dMkPrism(name, 'mountain', atlas3dBlobPts(px, pz, mz.rx * kk * (peaks > 1 ? 0.62 : 1), mz.rz * kk * (peaks > 1 ? 0.85 : 1), mz.rot, 10), y, h, color, 0.98, { zoneId: mz.zoneId, layer: 8 });
        if (name === first) {
          mesh.label = `⛰ ${(z.name || mz.name).split(' (')[0]}`;
          mesh.poi = { title: z.name || mz.name, category: `Mountain / Highland · ${z.zoneCategory || 'Hunting Zone'} · ${lensMeta.lensBadge}`, thumb: '/thumbs/buildings/tower_round_roof_a.webp',
            hoursOrStatus: `Highland relief · loc=${z.loc_coord || '0:0'}`, summary: 'Stepped mountain relief placed at this zone with the same pixel-CRS anchor as the 2D map.',
            address: z.territory_name || mz.name, coordinates: `loc=${z.loc_coord || '0:0'}`, scaleSpecs: `Peak +${Math.round(y + h)}m above sea`, inspectId: z.studio_node_id || mz.zoneId };
        } else mesh.pickAs = first;
        meshes.push(mesh);
        y += h;
      }
      if (mz.caldera) {
        const top = y;
        meshes.push(atlas3dMkPrism(`${first}_P${pk + 1}_Pit`, 'mountain', atlas3dBlobPts(px, pz, mz.rx * 0.36, mz.rz * 0.36, mz.rot, 10), top, 0.12, '#2a0f0f', 1, { zoneId: mz.zoneId, layer: 8, pickAs: first }));
        meshes.push(atlas3dMkPrism(`${first}_P${pk + 1}_Lava`, 'mountain', atlas3dBlobPts(px, pz, mz.rx * 0.18, mz.rz * 0.18, mz.rot, 8), top + 0.12, 0.1, '#f97316', 1, { zoneId: mz.zoneId, layer: 8, pickAs: first }));
      }
    }
  });

  // Roads and sea bridges: the same highway table and the same curve as the 2D map, stepping with the terrain.
  const anchorOf = id => getAtlasLandmarkAnchor(id);
  ATLAS_OVERLAND_HIGHWAYS.forEach(([aId, bId], hi) => {
    const a = anchorOf(aId), b = anchorOf(bId);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 10;
    const n = Math.max(4, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 24));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push(svgTo3dWorld(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y));
    }
    const hs = [];
    for (let i = 0; i < n; i++) hs.push(terrain.top((pts[i].x + pts[i + 1].x) / 2, (pts[i].z + pts[i + 1].z) / 2));
    // Sea spans become bridge decks interpolated between the land on either side.
    const deck = hs.map((h, i) => {
      if (h > 0.01) return h;
      let l = i - 1; while (l >= 0 && hs[l] <= 0.01) l--;
      let r = i + 1; while (r < n && hs[r] <= 0.01) r++;
      const hl = l >= 0 ? hs[l] : (r < n ? hs[r] : 4), hr = r < n ? hs[r] : hl;
      const f = (i - l) / Math.max(1, r - l);
      return Math.max(4, hl + (hr - hl) * f);
    });
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * 0.75, nz = dx / len * 0.75;
      const isBridge = hs[i] <= 0.01;
      const y0 = deck[i] - 0.25;
      const corners = [[p0.x + nx, p0.z + nz], [p1.x + nx, p1.z + nz], [p1.x - nx, p1.z - nz], [p0.x - nx, p0.z - nz]];
      meshes.push(atlas3dMkPrism(`Road_${hi + 1}_${isBridge ? 'Bridge_' : ''}${i + 1}`, 'road', corners, y0, 0.65, isBridge ? '#cbd5e1' : '#e2c778', 0.95,
        { ends: [[p0.x, p0.z], [p1.x, p1.z]], highway: hi, layer: 6 }));
      if (isBridge && i % 2 === 0) {
        meshes.push(atlas3dMk(`Road_${hi + 1}_Pier_${i + 1}`, 'bridge_pier', (p0.x + p1.x) / 2, -0.5, (p0.z + p1.z) / 2, 1.0, y0 + 0.5, 1.0, '#64748b', 0.95, { layer: 6 }));
      }
    }
  });

  // Landmarks: distinct silhouettes by 2D type, each at its projected anchor.
  ATLAS_OVERLAND_LANDMARK_ANCHORS.forEach(a => {
    const meta = ATLAS_3D_LANDMARK_META[a.landmarkId];
    if (!meta) return;
    const c = svgTo3dWorld(a.x, a.y);
    const foot = (a.kind === 'castle' ? 12 : 10) / 2 + 1;
    const samples = [[0, 0], [foot, foot], [-foot, foot], [foot, -foot], [-foot, -foot]].map(([dx, dz]) => terrain.top(c.x + dx, c.z + dz));
    const tLens = getAtlasPersonaLensTelemetrySummary({ id: meta.townId || meta.dngId || meta.name, name: meta.label, actionType: meta.dngId ? 'dungeon' : 'town', levelRange: meta.lv, locCoord: meta.loc });
    atlas3dBuildLandmark({ id: a.landmarkId, kind: a.kind, cx: c.x, cz: c.z, b: Math.max.apply(null, samples), low: Math.min.apply(null, samples), meta }, E, tLens).forEach(m => meshes.push(m));
  });

  // Harbor piers at the harbor zones (reach toward the nearest water).
  zones.filter(z => /^zone-harbor-/.test(z.zone_id)).forEach(z => {
    const q = placed[z.zone_id];
    if (!q) return;
    const c = svgTo3dWorld(q.x, q.y);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = dirs[0], bh = Infinity;
    dirs.forEach(dv => { const h = terrain.top(c.x + dv[0] * 6, c.z + dv[1] * 6); if (h < bh) { bh = h; best = dv; } });
    const along = best[0] !== 0;
    const base = terrain.top(c.x, c.z);
    meshes.push(atlas3dMk(`Pier_${z.zone_id.replace(/[^a-zA-Z0-9]+/g, '_')}`, 'harbor_pier', c.x + best[0] * 3, base + 0.2, c.z + best[1] * 3, along ? 7 : 1.8, 0.6, along ? 1.8 : 7, '#a16207', 0.96, { layer: 8 }));
  });

  // Boss / spawn pins (same table, filters, and anchors as the 2D SVG and 2D OL engines).
  getVisibleAtlasOverlandMobPins().forEach(mp => {
    const c = svgTo3dWorld(mp.x, mp.y);
    const base = terrain.top(c.x, c.z);
    const col = ATLAS_3D_BOSS_PIN_COLORS[mp.type] || '#f8fafc';
    const hgt = (mp.type === 'MVP' ? 5.5 : (mp.type === 'Raid' ? 4.6 : 3.4)) * E;
    const name = `Pin_${mp.id.replace(/[^a-zA-Z0-9]+/g, '_')}`;
    meshes.push(atlas3dMk(name, 'boss_pin', c.x, base, c.z, 0.9, hgt, 0.9, col, 1, { pinId: mp.id, layer: 8, poi: mp.poi }));
    meshes.push(atlas3dMk(`${name}_Cap`, 'boss_pin_cap', c.x, base + hgt, c.z, 1.9, 1.1, 1.9, col, 1, { layer: 8, pickAs: name }));
  });

  // Active D17 BFS travel route & D9 race growth route ribbons and hop/stage beacons in 3D overland.
  const routeOv3d = getActiveAtlasOverlandRouteOverlay(tatlas);
  if (routeOv3d.bfsRouteHops.length >= 2) {
    for (let i = 0; i < routeOv3d.bfsRouteHops.length - 1; i++) {
      const a = svgTo3dWorld(routeOv3d.bfsRouteHops[i].sx, routeOv3d.bfsRouteHops[i].sy);
      const b = svgTo3dWorld(routeOv3d.bfsRouteHops[i + 1].sx, routeOv3d.bfsRouteHops[i + 1].sy);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * 0.9, nz = dx / len * 0.9;
      const y0 = Math.max(terrain.top(a.x, a.z), terrain.top(b.x, b.z)) + 1.2 * E;
      const corners = [[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz]];
      meshes.push(atlas3dMkPrism(`RouteSeg_${i + 1}`, 'bfs_route_segment', corners, y0, 0.8 * E, '#38bdf8', 0.92, { layer: 9 }));
    }
    routeOv3d.bfsRouteHops.forEach(hop => {
      const c = svgTo3dWorld(hop.sx, hop.sy);
      const base = terrain.top(c.x, c.z) + 1.2 * E;
      meshes.push(atlas3dMk(`RouteHop_${hop.hopIndex}`, 'bfs_route_hop', c.x, base, c.z, 2.2, 4.5 * E, 2.2, '#0284c7', 0.98, {
        layer: 9,
        hopIndex: hop.hopIndex,
        zoneId: hop.zoneId,
        label: `#${hop.hopIndex} ${String(hop.name || '').slice(0, 12)}`,
        poi: hop.poi
      }));
    });
  }
  if (routeOv3d.raceRouteWaypoints.length >= 2) {
    for (let i = 0; i < routeOv3d.raceRouteWaypoints.length - 1; i++) {
      const a = svgTo3dWorld(routeOv3d.raceRouteWaypoints[i].sx, routeOv3d.raceRouteWaypoints[i].sy);
      const b = svgTo3dWorld(routeOv3d.raceRouteWaypoints[i + 1].sx, routeOv3d.raceRouteWaypoints[i + 1].sy);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * 0.9, nz = dx / len * 0.9;
      const y0 = Math.max(terrain.top(a.x, a.z), terrain.top(b.x, b.z)) + 1.6 * E;
      const corners = [[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz]];
      meshes.push(atlas3dMkPrism(`GrowthSeg_${i + 1}`, 'race_route_segment', corners, y0, 0.85 * E, '#fde047', 0.92, { layer: 9 }));
    }
    routeOv3d.raceRouteWaypoints.forEach(wp => {
      const c = svgTo3dWorld(wp.sx, wp.sy);
      const base = terrain.top(c.x, c.z) + 1.6 * E;
      meshes.push(atlas3dMk(`GrowthStage_${wp.stage_code}`, 'race_route_waypoint', c.x, base, c.z, 2.2, 4.8 * E, 2.2, '#b45309', 0.98, {
        layer: 9,
        stageCode: wp.stage_code,
        zoneId: wp.zone_id,
        label: `[${wp.stage_code}] ${String(wp.name || '').slice(0, 12)}`,
        poi: wp.poi
      }));
    });
  }

  return { context: 'overland', title: 'Cradle of Embers — 3D Continental Elevation & Spire Blockout', meshes };
}

function isAtlas3dGroundMesh(m) {
  return /^(Town_Plaza_Ground|Field_Terrain_Ground|Trail_|TerritoryRing_|Road_|RouteSeg_|GrowthSeg_|Wall_|Floor_.*_Slab|C0\d_|Sea_)/.test(String((m && m.name) || ''));
}

function isPointInAtlasPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Redraw the live 3D canvas without replacing it (keeps keyboard focus); falls back to a rebuild.
function redrawAtlas3dInPlace() {
  if (typeof window.__ATLAS_3D_DRAW_SCENE === 'function' && document.getElementById('atlasMap3dCanvas')) {
    window.__ATLAS_3D_DRAW_SCENE();
  } else {
    initOrUpdateAtlasMap3dEngine();
  }
}

// Swap only the left Place Inspector drawer, leaving #atlasMap3dCanvas in the DOM.
function refreshStudioPlaceDrawerInPlace() {
  const body = document.getElementById('joySpatialViewportShell');
  if (!body) return false;
  const shell = document.querySelector('.joy-spatial-shell');
  if (shell) shell.setAttribute('data-left-open', ATLAS_LEFT_DRAWER_OPEN ? 'true' : 'false');
  const html = buildStudioPlaceDrawerHtml(STUDIO_MAP_SELECTED_POI);
  const existing = document.querySelector('#studioGooglePlaceDrawer');
  if (existing) existing.outerHTML = html;
  else if (html && typeof body.insertAdjacentHTML === 'function') body.insertAdjacentHTML('afterbegin', html);
  return true;
}

function selectAtlas3dMeshByName(meshName, drillOnMatch = false) {
  const scene = buildAtlas3dBlockoutScene();
  const m = (scene.meshes || []).find(item => item.name === meshName);
  if (!m) return null;
  ATLAS_3D_STATE.selectedMeshName = m.name;
  if (m.poi) {
    STUDIO_MAP_SELECTED_POI = m.poi;
    ATLAS_LEFT_DRAWER_OPEN = true;
    ATLAS_STATE_STORE.leftDrawerOpen = true;
    if (m.poi.inspectId) {
      STUDIO_ACTIVE_INSPECT_ID = m.poi.inspectId;
    }
  }
  const willDrill = Boolean(drillOnMatch && m.drillContext3d);
  if (willDrill) {
    if (m.townId) ATLAS_STATE_STORE.activeTownId = m.townId;
    if (m.dungeonId) ATLAS_STATE_STORE.activeDungeonId = m.dungeonId;
    ATLAS_3D_STATE.contextOverride = m.drillContext3d;
  }
  writeUrlState(false);
  const canvas = document.getElementById('atlasMap3dCanvas');
  if (ATLAS_ENGINE_MODE === '3d_map3d' && canvas && document.getElementById('joySpatialViewportShell')) {
    // The drawer opens at 0ms; the shifted layout is handled by the document-level second-click guard
    // (installAtlas3dSecondClickGuard), which drills from the first click's recorded point.
    refreshStudioPlaceDrawerInPlace();
    if (willDrill) initOrUpdateAtlasMap3dEngine();
    else redrawAtlas3dInPlace();
    const live = document.getElementById('atlasMap3dCanvas');
    if (live && typeof live.focus === 'function') live.focus({ preventScroll: true });
  } else {
    render();
  }
  return {
    selected: m.name,
    context: ATLAS_3D_STATE.contextOverride || scene.context,
    poiTitle: m.poi ? m.poi.title : m.label,
    hasShopCatalog: Boolean(m.poi && m.poi.shopAndRefinementCatalog)
  };
}

// One document-level capture mousedown (installed once): a mousedown within 400ms and ~8px of the first click's
// recorded point is the second click of a double-click, even if the 0ms drawer insert moved the canvas under the
// cursor. It drills once (clearing the recorded click) and swallows the event and its trailing click.
let ATLAS_3D_SECOND_CLICK_GUARD_INSTALLED = false;
function installAtlas3dSecondClickGuard() {
  if (ATLAS_3D_SECOND_CLICK_GUARD_INSTALLED || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  ATLAS_3D_SECOND_CLICK_GUARD_INSTALLED = true;
  document.addEventListener('mousedown', (e) => {
    const st = ATLAS_3D_STATE;
    if (ATLAS_ENGINE_MODE !== '3d_map3d' || !st.lastClickMeshName) return;
    if (Date.now() - (st.lastClickTime || 0) > 400) return;
    if (Math.hypot(e.clientX - (st.lastClickClientX || 0), e.clientY - (st.lastClickClientY || 0)) > 8) return;
    const meshName = st.lastClickMeshName;
    st.lastClickMeshName = '';
    st.lastClickTime = 0;
    st.suppressClickUntil = Date.now() + 600;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    selectAtlas3dMeshByName(meshName, true);
  }, true);
  document.addEventListener('click', (e) => {
    if (Date.now() < (ATLAS_3D_STATE.suppressClickUntil || 0)) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
  }, true);
}

function initOrUpdateAtlasMap3dEngine() {
  installAtlas3dSecondClickGuard();
  const mount = document.getElementById('atlasAdvancedEngineMount');
  if (!mount || ATLAS_ENGINE_MODE !== '3d_map3d') return;
  const hadCanvasFocus = Boolean(document.activeElement && document.activeElement.id === 'atlasMap3dCanvas');
  attachAtlasEngineResizeObserver(mount);
  const scene = buildAtlas3dBlockoutScene();
  const activeLensMeta = getAtlasPersonaLensTelemetrySummary({ actionType: scene.context, levelRange: [1, 35] });
  mount.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;background:#070b14">
      <canvas id="atlasMap3dCanvas" tabindex="0" onkeydown="onStudioMapKeyDown(event)"
              style="width:100%;height:100%;display:block;cursor:grab;outline:none;touch-action:none"></canvas>
      <div id="atlasMap3dToolbarPanel" style="position:absolute;bottom:52px;left:12px;z-index:30;pointer-events:auto;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:6px 10px;border-radius:8px;background:rgba(9,14,24,0.95);border:1px solid rgba(168,85,247,0.6);font-size:10.5px;color:#e2e8f0;box-shadow:0 6px 18px rgba(0,0,0,0.65)">
        <span class="mono" style="color:#c084fc;font-weight:900">🧊 map3d Blockout (${escapeHtml(scene.context.toUpperCase())} · ${scene.meshes.length} Extruded Meshes)</span>
        <span id="atlasMap3dPersonaTelemetryPill" class="mono" style="padding:2px 7px;border-radius:4px;background:rgba(15,23,42,0.95);border:1px solid ${activeLensMeta.lensColor};color:${activeLensMeta.lensColor};font-size:9.5px;font-weight:800">${escapeHtml(activeLensMeta.pillText)}</span>
        <button id="atlas3dBtnTown" type="button" onclick="setAtlas3dOption('contextOverride', 'town')" style="padding:2px 7px;border-radius:4px;border:1px solid rgba(250,204,21,0.45);background:${scene.context === 'town' ? '#854d0e' : '#1e293b'};color:#fde047;font-size:9.5px;font-weight:800;cursor:pointer">🏘️ Town #1..#12 3D</button>
        <button id="atlas3dBtnDungeon" type="button" onclick="setAtlas3dOption('contextOverride', 'dungeon')" style="padding:2px 7px;border-radius:4px;border:1px solid rgba(192,132,252,0.45);background:${scene.context === 'dungeon' ? '#581c87' : '#1e293b'};color:#e9d5ff;font-size:9.5px;font-weight:800;cursor:pointer">🕳️ Dungeon B1–B3 3D</button>
        <button id="atlas3dBtnOverland" type="button" onclick="setAtlas3dOption('contextOverride', 'overland')" style="padding:2px 7px;border-radius:4px;border:1px solid rgba(56,189,248,0.45);background:${scene.context === 'overland' ? '#0369a1' : '#1e293b'};color:#7dd3fc;font-size:9.5px;font-weight:800;cursor:pointer">🌍 Overland 3D</button>
        <label class="mono" style="font-size:9.5px;color:#cbd5e1;display:inline-flex;align-items:center;gap:4px">
          Elev:
          <input id="atlas3dElevSlider" type="range" min="0.5" max="2.5" step="0.1" value="${ATLAS_3D_STATE.elevScale}"
                 oninput="setAtlas3dOption('elevScale', this.value)" style="width:64px;accent-color:#c084fc;cursor:pointer"/>
        </label>
        <button id="atlas3dBtnWireframe" type="button" onclick="setAtlas3dOption('wireframe', !ATLAS_3D_STATE.wireframe)" style="padding:2px 7px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:${ATLAS_3D_STATE.wireframe ? '#4f46e5' : '#1e293b'};color:#ffffff;font-size:9.5px;font-weight:800;cursor:pointer">🕸️ Wireframe</button>
        <button id="atlas3dBtnReset" type="button" onclick="setAtlas3dOption('reset', true)" style="padding:2px 7px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:#1e293b;color:#cbd5e1;font-size:9.5px;font-weight:800;cursor:pointer">↺ Reset Orbit</button>
        <button id="atlas3dBtnExportGlb" type="button" onclick="exportAtlasBlockoutGlb()" style="padding:2px 8px;border-radius:4px;border:1px solid #34d399;background:#065f46;color:#ecfdf5;font-size:9.5px;font-weight:900;cursor:pointer">📦 Export .glb (Godot 4)</button>
      </div>
    </div>
  `;

  const canvas = document.getElementById('atlasMap3dCanvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  let renderedMeshBounds = [];
  const drawScene = () => {
    const setup = setupHiDpiIsotropicCanvas(canvas);
    if (!setup) return;
    const { ctx, cssW, cssH, dpr, scale: isoScale, offsetX, offsetY } = setup;

    ctx.clearRect(0, 0, cssW, cssH);
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, '#090d18');
    bg.addColorStop(1, '#111c2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr * isoScale, 0, 0, dpr * isoScale, dpr * offsetX, dpr * offsetY);
    }

    const cosY = Math.cos(ATLAS_3D_STATE.yaw);
    const sinY = Math.sin(ATLAS_3D_STATE.yaw);
    const cosP = Math.cos(ATLAS_3D_STATE.pitch);
    const sinP = Math.sin(ATLAS_3D_STATE.pitch);
    const scale = 3.1 * ATLAS_3D_STATE.zoom;
    const cx = 520 + ATLAS_3D_STATE.panX;
    const cy = 265 + ATLAS_3D_STATE.panY;

    const project = (x, y, z) => {
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const ry = y * cosP - rz * sinP;
      const depth = y * sinP + rz * cosP;
      return {
        sx: cx + rx * scale,
        sy: cy - ry * scale,
        depth
      };
    };

    // Ground Reference Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    for (let g = -120; g <= 120; g += 24) {
      const a = project(g, 0, -80);
      const b = project(g, 0, 80);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      const c = project(-120, 0, g * 0.66);
      const d = project(120, 0, g * 0.66);
      ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
    }

    // Sort meshes back-to-front: by draw layer first (sea, shelf, terraces, roads, objects; 0 when unset), then by centroid depth
    const sorted = scene.meshes.slice().map(m => {
      const p = project(m.x, m.y, m.z);
      return { m, depth: p.depth, center: p };
    }).sort((a, b) => ((a.m.layer || 0) - (b.m.layer || 0)) || (a.depth - b.depth));
    const primaryByName = {};
    scene.meshes.forEach(m => { if (m.poi) primaryByName[m.name] = m; });

    const pendingLabels = [];
    const nextBounds = [];
    sorted.forEach(({ m, depth }) => {
      const hw = m.w / 2;
      const hh = m.h / 2;
      const hd = m.d / 2;
      const pickM = m.poi ? m : (m.pickAs ? primaryByName[m.pickAs] : null);
      const isSelected = ATLAS_3D_STATE.selectedMeshName === m.name || (Boolean(m.pickAs) && ATLAS_3D_STATE.selectedMeshName === m.pickAs);
      const isHovered = ATLAS_3D_STATE.hoveredMeshName === m.name || (Boolean(m.pickAs) && ATLAS_3D_STATE.hoveredMeshName === m.pickAs);
      let v;
      let faces;
      let drawTop = null;
      if (m.pts) {
        // F-158 polygon prism: vertices 0..n-1 bottom, n..2n-1 top. Visible sides are the outward-facing ones; top is drawn last.
        const n = m.pts.length;
        const y0 = m.y - hh, y1 = m.y + hh;
        v = m.pts.map(q => project(q[0], y0, q[1])).concat(m.pts.map(q => project(q[0], y1, q[1])));
        faces = [];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const dx = m.pts[j][0] - m.pts[i][0], dz = m.pts[j][1] - m.pts[i][1];
          const nx = dz * m.winding, nz = -dx * m.winding;
          const nrz = nx * sinY + nz * cosY;
          if (nrz <= 0) continue;
          const nrx = nx * cosY - nz * sinY;
          const nl = Math.hypot(nx, nz) || 1;
          faces.push({ idx: [i, j, n + j, n + i], shade: 0.64 + 0.3 * (nrz / nl) - 0.1 * (nrx / nl), depth: (v[i].depth + v[j].depth + v[n + i].depth + v[n + j].depth) / 4 });
        }
        faces.sort((fa, fb) => fa.depth - fb.depth);
        drawTop = { idx: Array.from({ length: n }, (_, i) => n + i), shade: 1.08 };
        faces.push(drawTop);
      } else {
        v = [
          project(m.x - hw, m.y - hh, m.z - hd),
          project(m.x + hw, m.y - hh, m.z - hd),
          project(m.x + hw, m.y - hh, m.z + hd),
          project(m.x - hw, m.y - hh, m.z + hd),
          project(m.x - hw, m.y + hh, m.z - hd),
          project(m.x + hw, m.y + hh, m.z - hd),
          project(m.x + hw, m.y + hh, m.z + hd),
          project(m.x - hw, m.y + hh, m.z + hd)
        ];
        faces = [
          { idx: [0, 1, 5, 4], shade: 0.72 },
          { idx: [1, 2, 6, 5], shade: 0.84 },
          { idx: [2, 3, 7, 6], shade: 0.92 },
          { idx: [3, 0, 4, 7], shade: 0.68 },
          { idx: [4, 5, 6, 7], shade: 1.08 }
        ];
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      v.forEach(pt => {
        if (pt.sx < minX) minX = pt.sx;
        if (pt.sy < minY) minY = pt.sy;
        if (pt.sx > maxX) maxX = pt.sx;
        if (pt.sy > maxY) maxY = pt.sy;
      });
      if (pickM) {
        const polys = faces.map(f => f.idx.map(i => [v[i].sx, v[i].sy]));
        nextBounds.push({ m: pickM, depth, minX, minY, maxX, maxY, polys, isGround: isAtlas3dGroundMesh(m) });
      }
      if (!m.pts) {
        faces.sort((fa, fb) => {
          const da = fa.idx.reduce((s, i) => s + v[i].depth, 0) / 4;
          const db = fb.idx.reduce((s, i) => s + v[i].depth, 0) / 4;
          return da - db;
        });
      }
      faces.forEach(f => {
        ctx.beginPath();
        f.idx.forEach((vi, i) => {
          if (i === 0) ctx.moveTo(v[vi].sx, v[vi].sy);
          else ctx.lineTo(v[vi].sx, v[vi].sy);
        });
        ctx.closePath();
        if (!ATLAS_3D_STATE.wireframe) {
          ctx.fillStyle = m.color || '#38bdf8';
          ctx.globalAlpha = (m.alpha || 0.9) * Math.min(1, f.shade * (isSelected ? 1.18 : 1.0));
          ctx.fill();
        }
        ctx.globalAlpha = 0.98;
        ctx.strokeStyle = isSelected ? '#fde047' : (isHovered ? '#38bdf8' : (ATLAS_3D_STATE.wireframe ? '#38bdf8' : 'rgba(15, 23, 42, 0.85)'));
        ctx.lineWidth = isSelected ? 2.4 : (isHovered ? 1.8 : (ATLAS_3D_STATE.wireframe ? 1.4 : 1.0));
        ctx.stroke();
      });
      ctx.globalAlpha = 1.0;
      if (m.label || ((isSelected || isHovered) && pickM === m)) {
        const topPt = project(m.x, m.y + hh + 3, m.z);
        pendingLabels.push({ m, topPt, depth: isSelected ? depth + 1000 : (isHovered ? depth + 500 : depth), isSelected, isHovered });
      }
    });
    // Buildings / spires / rooms rank ahead of ground slabs, roads and walls; nearest first within a rank.
    renderedMeshBounds = nextBounds.sort((a, b) => (a.isGround - b.isGround) || (b.depth - a.depth));

    // Draw 3D labels front-to-back with AABB decluttering so multi-floor dungeon labels never overlap
    const placed3dBoxes = [];
    pendingLabels.sort((a, b) => b.depth - a.depth).forEach(({ m, topPt, isSelected, isHovered }) => {
      const displayTxt = isSelected ? `★ ${m.label || m.name}` : (isHovered ? `▸ ${m.label || m.name}` : m.label);
      if (!displayTxt) return;
      const tw = displayTxt.length * 5.8 + 10;
      const box = { x1: topPt.sx - tw / 2 - 2, y1: topPt.sy - 13, x2: topPt.sx + tw / 2 + 2, y2: topPt.sy + 3 };
      const collides = !(isSelected || isHovered) && placed3dBoxes.some(pb => !(box.x2 < pb.x1 || box.x1 > pb.x2 || box.y2 < pb.y1 || box.y1 > pb.y2));
      if (collides) return;
      placed3dBoxes.push(box);
      ctx.fillStyle = isSelected ? 'rgba(133, 77, 14, 0.96)' : (isHovered ? 'rgba(3, 105, 161, 0.95)' : 'rgba(9, 13, 22, 0.9)');
      ctx.fillRect(topPt.sx - tw / 2, topPt.sy - 12, tw, 14);
      ctx.strokeStyle = isSelected ? '#fde047' : (isHovered ? '#38bdf8' : (m.color || '#fde047'));
      ctx.lineWidth = isSelected || isHovered ? 1.8 : 1;
      ctx.strokeRect(topPt.sx - tw / 2, topPt.sy - 12, tw, 14);
      ctx.fillStyle = isSelected ? '#fef08a' : (isHovered ? '#e0f2fe' : '#f8fafc');
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(displayTxt, topPt.sx, topPt.sy - 2);
    });
  };

  drawScene();
  window.__ATLAS_3D_DRAW_SCENE = drawScene;
  if (hadCanvasFocus && typeof canvas.focus === 'function') canvas.focus({ preventScroll: true });

  const pickMeshAtClientEvent = (e) => {
    const rect = canvas.getBoundingClientRect();
    const curScale = Math.min(rect.width / 1040, rect.height / 500) || 1;
    const curOffX = (rect.width - 1040 * curScale) / 2;
    const curOffY = (rect.height - 500 * curScale) / 2;
    const lx = (e.clientX - rect.left - curOffX) / curScale;
    const ly = (e.clientY - rect.top - curOffY) / curScale;
    return renderedMeshBounds.find(b => lx >= b.minX && lx <= b.maxX && ly >= b.minY && ly <= b.maxY
      && b.polys.some(poly => isPointInAtlasPolygon(lx, ly, poly))) || null;
  };

  canvas.onmousedown = (e) => {
    ATLAS_3D_STATE.dragging = true;
    ATLAS_3D_STATE.lastX = e.clientX;
    ATLAS_3D_STATE.lastY = e.clientY;
    ATLAS_3D_STATE.downClientX = e.clientX;
    ATLAS_3D_STATE.downClientY = e.clientY;
    ATLAS_3D_STATE.dragButton = e.button;
  };
  canvas.onmousemove = (e) => {
    if (!ATLAS_3D_STATE.dragging) {
      const hit = pickMeshAtClientEvent(e);
      const nextHover = hit ? hit.m.name : '';
      if (ATLAS_3D_STATE.hoveredMeshName !== nextHover) {
        ATLAS_3D_STATE.hoveredMeshName = nextHover;
        if (canvas.style) canvas.style.cursor = nextHover ? 'pointer' : 'grab';
        drawScene();
      }
      return;
    }
    const dx = e.clientX - ATLAS_3D_STATE.lastX;
    const dy = e.clientY - ATLAS_3D_STATE.lastY;
    ATLAS_3D_STATE.lastX = e.clientX;
    ATLAS_3D_STATE.lastY = e.clientY;
    if (e.shiftKey || ATLAS_3D_STATE.dragButton === 2) {
      const curScale = clientToLogical3d(0, 0).curScale;
      ATLAS_3D_STATE.panX += dx / curScale;
      ATLAS_3D_STATE.panY += dy / curScale;
    } else {
      ATLAS_3D_STATE.yaw += dx * 0.008;
      ATLAS_3D_STATE.pitch = Math.max(0.2, Math.min(1.45, ATLAS_3D_STATE.pitch + dy * 0.006));
    }
    drawScene();
  };
  canvas.onmouseup = (e) => {
    const wasDragging = ATLAS_3D_STATE.dragging;
    ATLAS_3D_STATE.dragging = false;
    if (wasDragging) scheduleAtlas3dCameraUrlWrite();
    if (wasDragging && e && Math.hypot(e.clientX - ATLAS_3D_STATE.downClientX, e.clientY - ATLAS_3D_STATE.downClientY) < 5) {
      const hit = pickMeshAtClientEvent(e);
      if (hit && hit.m) {
        // A second click on the same mesh within 400ms drills in. Tracked in ATLAS_3D_STATE (not native
        // dblclick) so it still works if the first click rebuilt the canvas.
        const now = Date.now();
        const isSecondClick = ATLAS_3D_STATE.lastClickMeshName === hit.m.name && now - (ATLAS_3D_STATE.lastClickTime || 0) <= 400;
        ATLAS_3D_STATE.lastClickMeshName = isSecondClick ? '' : hit.m.name;
        ATLAS_3D_STATE.lastClickTime = isSecondClick ? 0 : now;
        ATLAS_3D_STATE.lastClickClientX = e.clientX;
        ATLAS_3D_STATE.lastClickClientY = e.clientY;
        selectAtlas3dMeshByName(hit.m.name, isSecondClick);
      }
    }
  };
  canvas.onmouseleave = () => { ATLAS_3D_STATE.dragging = false; };
  const clientToLogical3d = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const curScale = Math.min(rect.width / 1040, rect.height / 500) || 1;
    return {
      x: (clientX - rect.left - (rect.width - 1040 * curScale) / 2) / curScale,
      y: (clientY - rect.top - (rect.height - 500 * curScale) / 2) / curScale,
      curScale
    };
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const prevZoom = ATLAS_3D_STATE.zoom;
    ATLAS_3D_STATE.zoom = Math.max(0.45, Math.min(3.5, +(prevZoom * factor).toFixed(3)));
    // Cursor-anchored: keep the scene point under the cursor fixed (projection centre is 520+panX, 265+panY).
    const L = clientToLogical3d(e.clientX, e.clientY);
    const ratio = ATLAS_3D_STATE.zoom / prevZoom;
    ATLAS_3D_STATE.panX = L.x - 520 - (L.x - 520 - ATLAS_3D_STATE.panX) * ratio;
    ATLAS_3D_STATE.panY = L.y - 265 - (L.y - 265 - ATLAS_3D_STATE.panY) * ratio;
    drawScene();
    scheduleAtlas3dCameraUrlWrite();
    const lbl = document.getElementById('studioCartoZoomReadout');
    if (lbl) lbl.textContent = `${ATLAS_3D_STATE.zoom.toFixed(2)}\u00d7 3D`;
  };
  // F-155: touch. One finger orbits (the mouse drag path), two fingers pinch-zoom about their midpoint and pan.
  const touches3d = new Map();
  let pinch3d = null;
  const touchMid = () => { const pts = [...touches3d.values()]; return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) }; };
  canvas.onpointerdown = (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_e) {} }
    touches3d.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches3d.size === 1) canvas.onmousedown({ clientX: e.clientX, clientY: e.clientY, button: 0, shiftKey: false });
    else if (touches3d.size === 2) { ATLAS_3D_STATE.dragging = false; const m = touchMid(); pinch3d = { d0: m.d || 1, z0: ATLAS_3D_STATE.zoom, last: m }; }
  };
  canvas.onpointermove = (e) => {
    if (e.pointerType === 'mouse' || !touches3d.has(e.pointerId)) return;
    touches3d.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch3d && touches3d.size >= 2) {
      const m = touchMid();
      const prevZoom = ATLAS_3D_STATE.zoom;
      ATLAS_3D_STATE.zoom = Math.max(0.45, Math.min(3.5, +(pinch3d.z0 * m.d / pinch3d.d0).toFixed(3)));
      const L = clientToLogical3d(m.x, m.y);
      const ratio = ATLAS_3D_STATE.zoom / prevZoom;
      ATLAS_3D_STATE.panX = L.x - 520 - (L.x - 520 - ATLAS_3D_STATE.panX) * ratio + (m.x - pinch3d.last.x) / L.curScale;
      ATLAS_3D_STATE.panY = L.y - 265 - (L.y - 265 - ATLAS_3D_STATE.panY) * ratio + (m.y - pinch3d.last.y) / L.curScale;
      pinch3d.last = m;
      drawScene();
    } else if (touches3d.size === 1) {
      canvas.onmousemove({ clientX: e.clientX, clientY: e.clientY, shiftKey: false });
    }
  };
  const endTouch3d = (e, cancelled) => {
    if (e.pointerType === 'mouse' || !touches3d.has(e.pointerId)) return;
    touches3d.delete(e.pointerId);
    if (pinch3d) { if (touches3d.size < 2) { pinch3d = null; scheduleAtlas3dCameraUrlWrite(); } return; }
    // F-156 B6: a cancelled touch (system gesture, palm rejection) is not a tap, so it must not select a mesh.
    if (touches3d.size === 0) canvas.onmouseup(cancelled ? null : { clientX: e.clientX, clientY: e.clientY });
  };
  canvas.onpointerup = (e) => endTouch3d(e, false);
  canvas.onpointercancel = (e) => endTouch3d(e, true);
}

function syncAtlasActiveSpatialEngine() {
  const effMode = getAtlasEffectiveEngineMode();
  if (effMode !== '2d_ol' && typeof window !== 'undefined' && window.__ATLAS_OL_MAP_INSTANCE) {
    if (typeof window.__ATLAS_OL_MAP_INSTANCE.setTarget === 'function') window.__ATLAS_OL_MAP_INSTANCE.setTarget(null);
    window.__ATLAS_OL_MAP_INSTANCE = null;
  }
  if (effMode === '2d_ol') {
    initOrUpdateAtlasOpenLayersEngine();
  } else if (ATLAS_ENGINE_MODE === '3d_map3d') {
    initOrUpdateAtlasMap3dEngine();
  }
}

function hexToRgbNormalized(hex) {
  const clean = String(hex || '#eab308').replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16) || 0xeab308;
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

// Ear-clipping triangulation of a simple polygon (x, z points, any winding) -> [[i, j, k], ...] counter-clockwise in (x, z).
function atlasTriangulatePoly(pts) {
  const n = pts.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) { const q = pts[(i + 1) % n]; area += pts[i][0] * q[1] - q[0] * pts[i][1]; }
  const idx = pts.map((_, i) => i);
  if (area < 0) idx.reverse();
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (let k = 0; k < idx.length; k++) {
        const j = idx[k];
        if (j === ia || j === ib || j === ic) continue;
        const p = pts[j];
        if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) { ok = false; break; }
      }
      if (ok) { tris.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

function buildAtlasGlbArrayBuffer(sceneInput) {
  const scene = sceneInput || buildAtlas3dBlockoutScene();
  const meshes = scene.meshes || [];
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  const cubeFaces = [
    { n: [0, 0, 1], v: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },
    { n: [0, 0, -1], v: [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]] },
    { n: [0, 1, 0], v: [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]] },
    { n: [0, -1, 0], v: [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]] },
    { n: [1, 0, 0], v: [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]] },
    { n: [-1, 0, 0], v: [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]] }
  ];

  const gltfNodes = [];
  const gltfMeshes = [];
  const gltfAccessors = [];
  const childNodeIndices = [];

  // Per-mesh geometry first (boxes are 24 vertices / 36 indices; F-158 polygon prisms are variable), then pack.
  const geoms = meshes.map(m => {
    const g = { pos: [], nrm: [], idx: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    const pushV = (px, py, pz, n) => {
      px = +px.toFixed(3); py = +py.toFixed(3); pz = +pz.toFixed(3);
      g.pos.push(px, py, pz);
      g.nrm.push(n[0], n[1], n[2]);
      if (px < g.min[0]) g.min[0] = px;
      if (py < g.min[1]) g.min[1] = py;
      if (pz < g.min[2]) g.min[2] = pz;
      if (px > g.max[0]) g.max[0] = px;
      if (py > g.max[1]) g.max[1] = py;
      if (pz > g.max[2]) g.max[2] = pz;
    };
    if (m.pts) {
      const n = m.pts.length;
      const y0 = m.y - m.h / 2, y1 = m.y + m.h / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = m.pts[j][0] - m.pts[i][0], dz = m.pts[j][1] - m.pts[i][1];
        const nl = Math.hypot(dx, dz) || 1;
        const nrm = [dz * m.winding / nl, 0, -dx * m.winding / nl];
        const base = g.pos.length / 3;
        pushV(m.pts[i][0], y0, m.pts[i][1], nrm);
        pushV(m.pts[i][0], y1, m.pts[i][1], nrm);
        pushV(m.pts[j][0], y1, m.pts[j][1], nrm);
        pushV(m.pts[j][0], y0, m.pts[j][1], nrm);
        if (m.winding > 0) g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      const tris = atlasTriangulatePoly(m.pts);
      const topBase = g.pos.length / 3;
      m.pts.forEach(q => pushV(q[0], y1, q[1], [0, 1, 0]));
      const botBase = g.pos.length / 3;
      m.pts.forEach(q => pushV(q[0], y0, q[1], [0, -1, 0]));
      tris.forEach(([ia, ib, ic]) => g.idx.push(topBase + ia, topBase + ic, topBase + ib, botBase + ia, botBase + ib, botBase + ic));
    } else {
      const hw = (m.w || 10) / 2, hh = (m.h || 10) / 2, hd = (m.d || 10) / 2;
      cubeFaces.forEach(face => {
        const faceBase = g.pos.length / 3;
        face.v.forEach(([vx, vy, vz]) => pushV(m.x + vx * hw, m.y + vy * hh, m.z + vz * hd, face.n));
        g.idx.push(faceBase, faceBase + 1, faceBase + 2, faceBase, faceBase + 2, faceBase + 3);
      });
    }
    return g;
  });
  const totalVerts = geoms.reduce((s, g) => s + g.pos.length / 3, 0);
  const useUint32 = totalVerts > 65535;
  const idxComponentType = useUint32 ? 5125 : 5123;
  const idxBytesPerElem = useUint32 ? 4 : 2;
  let vertCursor = 0;
  let idxCursor = 0;
  meshes.forEach((m, mIdx) => {
    const g = geoms[mIdx];
    const [r, gg, b] = hexToRgbNormalized(m.color);
    const vCount = g.pos.length / 3;
    for (let i = 0; i < vCount; i++) colors.push(+r.toFixed(4), +gg.toFixed(4), +b.toFixed(4));
    g.pos.forEach(v => positions.push(v));
    g.nrm.forEach(v => normals.push(v));
    g.idx.forEach(v => indices.push(v)); // local to this primitive's accessors (their byteOffset already selects the vertices)

    const posAccIdx = gltfAccessors.length;
    const vecByteOffset = vertCursor * 12;
    const idxByteOffset = idxCursor * idxBytesPerElem;
    gltfAccessors.push(
      { bufferView: 0, byteOffset: vecByteOffset, componentType: 5126, count: vCount, type: 'VEC3', min: g.min, max: g.max },
      { bufferView: 1, byteOffset: vecByteOffset, componentType: 5126, count: vCount, type: 'VEC3' },
      { bufferView: 2, byteOffset: vecByteOffset, componentType: 5126, count: vCount, type: 'VEC3' },
      { bufferView: 3, byteOffset: idxByteOffset, componentType: idxComponentType, count: g.idx.length, type: 'SCALAR' }
    );
    vertCursor += vCount;
    idxCursor += g.idx.length;

    const meshName = String(m.name || m.label || (`Mesh_${mIdx}`));
    gltfMeshes.push({
      name: meshName,
      primitives: [{
        attributes: { POSITION: posAccIdx, NORMAL: posAccIdx + 1, COLOR_0: posAccIdx + 2 },
        indices: posAccIdx + 3,
        mode: 4
      }]
    });
    childNodeIndices.push(mIdx + 1);
    gltfNodes.push({
      name: meshName,
      mesh: mIdx,
      extras: {
        label: String(m.label || m.name || ''),
        dimensionsMeters: [m.w || 10, m.h || 10, m.d || 10]
      }
    });
  });

  const rootNode = {
    name: `Atlas_${scene.context}_Root`,
    children: childNodeIndices,
    extras: {
      unit: '1u = 1m (Godot 4 blockout scale; overland miniature 1u = 1.54km)',
      worldSpanMeters: 400000,
      context: scene.context
    }
  };
  const allNodes = [rootNode, ...gltfNodes];

  const posTyped = new Float32Array(positions);
  const normTyped = new Float32Array(normals);
  const colTyped = new Float32Array(colors);
  const idxTyped = useUint32 ? new Uint32Array(indices) : new Uint16Array(indices);

  const posBytes = posTyped.byteLength;
  const normBytes = normTyped.byteLength;
  const colBytes = colTyped.byteLength;
  const idxBytes = idxTyped.byteLength;
  const rawBinLen = posBytes + normBytes + colBytes + idxBytes;
  const paddedBinLen = (rawBinLen + 3) & ~3;

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Atlas World Studio map3d Blockout Exporter (Godot 4)',
      extras: {
        // Overland is a 260u miniature of the 400 km world (svgTo3dWorld: 1 svg unit = 0.25u, so ≈1538 m/u); town and dungeon are true 1u = 1m.
        unit: scene.context === 'overland' ? '1u = 1538m (overland miniature; scale by metersPerUnit for Godot 4)' : '1u = 1m (Godot 4 compatible)',
        metersPerUnit: scene.context === 'overland' ? ATLAS_3D_OVERLAND_M_PER_UNIT : 1,
        worldSpanMeters: 400000,
        context: scene.context
      }
    },
    scene: 0,
    scenes: [{ name: `Atlas_${scene.context}_Blockout`, nodes: [0] }],
    nodes: allNodes,
    meshes: gltfMeshes,
    buffers: [{ byteLength: paddedBinLen }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: normBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normBytes, byteLength: colBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normBytes + colBytes, byteLength: idxBytes, target: 34963 }
    ],
    accessors: gltfAccessors
  };

  const jsonStr = JSON.stringify(gltfJson);
  let jsonBytesEncoded;
  if (typeof TextEncoder !== 'undefined') {
    jsonBytesEncoded = Array.from(new TextEncoder().encode(jsonStr));
  } else {
    jsonBytesEncoded = [];
    for (let i = 0; i < jsonStr.length; i++) {
      jsonBytesEncoded.push(jsonStr.charCodeAt(i) & 0x7f);
    }
  }
  while (jsonBytesEncoded.length % 4 !== 0) {
    jsonBytesEncoded.push(0x20);
  }
  const jsonChunkLen = jsonBytesEncoded.length;
  const totalByteLength = 12 + 8 + jsonChunkLen + 8 + paddedBinLen;

  const arrayBuffer = new ArrayBuffer(totalByteLength);
  const dv = new DataView(arrayBuffer);
  // 12-byte GLB Header: magic "glTF" (0x46546C67), version 2, totalByteLength
  dv.setUint32(0, 0x46546C67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalByteLength, true);
  // Chunk 0: JSON (0x4E4F534A)
  dv.setUint32(12, jsonChunkLen, true);
  dv.setUint32(16, 0x4E4F534A, true);
  const u8 = new Uint8Array(arrayBuffer);
  for (let i = 0; i < jsonChunkLen; i++) {
    u8[20 + i] = jsonBytesEncoded[i];
  }
  // Chunk 1: BIN (0x004E4942)
  const binChunkOffset = 20 + jsonChunkLen;
  dv.setUint32(binChunkOffset, paddedBinLen, true);
  dv.setUint32(binChunkOffset + 4, 0x004E4942, true);
  const binStart = binChunkOffset + 8;
  u8.set(new Uint8Array(posTyped.buffer), binStart);
  u8.set(new Uint8Array(normTyped.buffer), binStart + posBytes);
  u8.set(new Uint8Array(colTyped.buffer), binStart + posBytes + normBytes);
  u8.set(new Uint8Array(idxTyped.buffer), binStart + posBytes + normBytes + colBytes);

  return arrayBuffer;
}

function exportAtlasBlockoutGlb() {
  const scene = buildAtlas3dBlockoutScene();
  const glbBuffer = buildAtlasGlbArrayBuffer(scene);
  const dv = new DataView(glbBuffer);
  const meta = {
    magic: dv.getUint32(0, true),
    version: dv.getUint32(4, true),
    byteLength: glbBuffer.byteLength,
    meshCount: scene.meshes.length,
    nodeCount: scene.meshes.length + 1,
    context: scene.context,
    fileName: `atlas-${scene.context}-blockout.glb`
  };
  if (typeof window !== 'undefined') {
    window.__LAST_EXPORTED_GLB_BYTES = new Uint8Array(glbBuffer);
    window.__LAST_EXPORTED_GLB_META = meta;
  }
  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined' && document.createElement) {
    try {
      const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      if (a) {
        a.href = url;
        a.download = meta.fileName;
        if (document.body && typeof document.body.appendChild === 'function') {
          document.body.appendChild(a);
          if (typeof a.click === 'function') a.click();
          document.body.removeChild(a);
        }
      }
    } catch (_e) {}
  }
  return meta;
}

const ATLAS_PERSONA_STUDIO_CATALOG = {
  gamer: [
    'transit_lines', 'fishing_sanctuary', 'companion_mount', 'vitality_obelisk',
    'master_tour', 'fantasy_plaza', 'treasure_chest', 'aerial_dock', 'wedding', 'nevit_blessing'
  ],
  designer: [
    'boss_hierarchy', 'quest_trials', 'farming_heatmap', 'olympiad',
    'soul_crystal', 'rift_sepulcher', 'augment_dye', 'herb_biome', 'workshop_plaza',
    'epic_jewelry', 'armor_set', 'kamaloka', 'skill_scroll', 'elemental_quarry',
    'transformation', 'faction_alliance', 'belt_cloak', 'elemental_jewel', 'delusion_chamber',
    'champion_mob', 'dualsword_forge', 'dialogue_dag', 'spawner_balancer', 'skill_timelines',
    'housing_estates', 'nocturnal_affix', 'lore_codex'
  ],
  architect: [
    'council_benchmark', 'council_signoff', 'tools_squad', 'architect_dx',
    'two_ring_80d', 'studio_90d', 'hot_reload_bridge', 'centennial_100d'
  ],
  developer: [
    'tech_art', 'bot_swarm', 'build_farm', 'weather_shader', 'server_mesh',
    'godot_storybook', 'navmesh', 'camera_rails', 'gpu_vram', 'headless_qa',
    'localization_vo', 'combat_replay', 'physics_biomes', 'pitr_chaos'
  ],
  liveops: [
    'siege_domain', 'boss_radar', 'seven_seals', 'manor_economy', 'pvp_karma',
    'clan_academy', 'territory_ward', 'clan_hall', 'warehouse', 'festival_oracle',
    'luxury_market', 'hero_weapon', 'seed_cycle', 'coliseum_tournament', 'fame_monument',
    'command_raid', 'liveops_gm', 'anti_bot', 'event_flags', 'faction_dispositions',
    'auction_escrow', 'world_incursions', 'clan_treasury', 'cdn_webrtc', 'caravan_routes',
    'bounty_manhunt', 'tavern_hubs', 'churn_care'
  ]
};

function toggleAtlasPerspectiveBar() {
  ATLAS_PERSPECTIVE_BAR_OPEN = !ATLAS_PERSPECTIVE_BAR_OPEN;
  render();
}

function toggleAtlasQuickWarp() {
  ATLAS_QUICK_WARP_OPEN = !ATLAS_QUICK_WARP_OPEN;
  render();
}

function toggleAtlasStudioNotes() {
  ATLAS_STUDIO_NOTES_OPEN = !ATLAS_STUDIO_NOTES_OPEN;
  render();
}

function setAtlasCompareStudioBar(barKey) {
  ATLAS_COMPARE_STUDIO_BAR = String(barKey || '');
  ATLAS_DIMENSION_DRAWER_OPEN = true;
  render();
}

function getAtlasSpatialContext() {
  if (ATLAS_STATE_STORE.activeDungeonId) return 'dungeon';
  if (resolveActiveFieldOrFortEntry()) return 'field';
  if (STUDIO_MAP_TOWN_INTERIOR) return 'town';
  return 'overland';
}

function resolveAtlasEffectiveFilter(requestedFilter, spatialContext) {
  const req = requestedFilter || 'All';
  const ctx = spatialContext || getAtlasSpatialContext();
  if (req === 'All') {
    return { effective: 'All', healed: false, reason: '' };
  }
  const allowedByContext = {
    overland: ['All', 'RaceSpawns', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'],
    town: ['All', 'TownMarks'],
    field: ['All', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'],
    dungeon: ['All', 'Monster', 'Mini-Boss', 'Raid', 'MVP']
  };
  const allowed = allowedByContext[ctx] || allowedByContext.overland;
  if (allowed.includes(req)) {
    return { effective: req, healed: false, reason: '' };
  }
  const viewNames = {
    town: 'Town Street view',
    field: 'Field Hunting view',
    dungeon: 'this Dungeon Floor'
  };
  return {
    effective: 'All',
    healed: true,
    reason: `Showing All Layers in ${viewNames[ctx] || 'this view'} — your ${req} filter returns on the Overland map`
  };
}

function shouldRenderStudioSvgOverlay(overlayKey) {
  if (ATLAS_SHOW_ALL_SVG_OVERLAYS || ATLAS_ACTIVE_STUDIO_BAR === 'all') return true;
  const curPersona = ATLAS_PERSONA_LENS || ATLAS_STATE_STORE.personaLens || 'gamer';
  if (curPersona === 'gamer' && !ATLAS_DIMENSION_DRAWER_OPEN) {
    return false;
  }
  const activeBar = ATLAS_ACTIVE_STUDIO_BAR || ATLAS_STATE_STORE.activeStudioBar || 'boss_hierarchy';
  if (overlayKey === activeBar) return true;
  if (ATLAS_COMPARE_STUDIO_BAR && overlayKey === ATLAS_COMPARE_STUDIO_BAR) return true;
  return false;
}

function gateStudioOverlaySvg(overlayKey, svgStr) {
  if (shouldRenderStudioSvgOverlay(overlayKey)) return svgStr;
  const m = String(svgStr || '').match(/<g\s+id="([^"]+)"/);
  return m ? `<g id="${m[1]}" data-lens-gated="1"></g>` : '';
}

function toggleAtlasPoTelemetryBar() {
  ATLAS_PO_TELEMETRY_OPEN = !ATLAS_PO_TELEMETRY_OPEN;
  render();
}

function toggleAtlasShowAllSvgOverlays() {
  ATLAS_SHOW_ALL_SVG_OVERLAYS = !ATLAS_SHOW_ALL_SVG_OVERLAYS;
  render();
}

function toggleAtlasDimensionDrawer() {
  ATLAS_DIMENSION_DRAWER_OPEN = !ATLAS_DIMENSION_DRAWER_OPEN;
  render();
}

const ATLAS_LENS_DEFAULT_BAR = { gamer: 'boss_hierarchy', designer: 'boss_hierarchy', architect: 'tools_squad', developer: 'tech_art', liveops: 'siege_domain' };

// F-155: the lens defaults (drawers + default overlay), with no URL write and no render. Shared by the lens tab
// setter and the URL restore path, so a lens restored from the URL looks exactly like a lens picked by hand.
function applyAtlasLensDefaults(lens) {
  const valid = ['gamer', 'designer', 'architect', 'developer', 'liveops'];
  ATLAS_PERSONA_LENS = valid.includes(lens) ? lens : 'gamer';
  ATLAS_STATE_STORE.personaLens = ATLAS_PERSONA_LENS;
  if (ATLAS_PERSONA_LENS === 'gamer') {
    ATLAS_DIMENSION_DRAWER_OPEN = false;
    ATLAS_RACE_GROWTH_OPEN = false;
    ATLAS_STATE_STORE.raceGrowthOpen = false;
    if (!STUDIO_MAP_SELECTED_POI) {
      ATLAS_LEFT_DRAWER_OPEN = false;
      ATLAS_STATE_STORE.leftDrawerOpen = false;
    }
  } else if (ATLAS_PERSONA_LENS === 'designer') {
    ATLAS_DIMENSION_DRAWER_OPEN = true;
    ATLAS_RACE_GROWTH_OPEN = false;
    ATLAS_STATE_STORE.raceGrowthOpen = false;
    ATLAS_LEFT_DRAWER_OPEN = true;
    ATLAS_STATE_STORE.leftDrawerOpen = true;
  } else if (ATLAS_PERSONA_LENS === 'architect') {
    ATLAS_DIMENSION_DRAWER_OPEN = true;
    ATLAS_LEFT_DRAWER_OPEN = true;
    ATLAS_STATE_STORE.leftDrawerOpen = true;
  } else if (ATLAS_PERSONA_LENS === 'developer') {
    ATLAS_DIMENSION_DRAWER_OPEN = true;
    ATLAS_LEFT_DRAWER_OPEN = true;
    ATLAS_STATE_STORE.leftDrawerOpen = true;
  } else if (ATLAS_PERSONA_LENS === 'liveops') {
    ATLAS_DIMENSION_DRAWER_OPEN = true;
    ATLAS_LEFT_DRAWER_OPEN = true;
    ATLAS_STATE_STORE.leftDrawerOpen = true;
  }
  // Every lens switch resets the overlay to that lens's default (no stale overlay from the previous lens).
  ATLAS_ACTIVE_STUDIO_BAR = ATLAS_LENS_DEFAULT_BAR[ATLAS_PERSONA_LENS] || 'boss_hierarchy';
  ATLAS_STATE_STORE.activeStudioBar = ATLAS_ACTIVE_STUDIO_BAR;
}

function setAtlasPersonaLens(lens) {
  applyAtlasLensDefaults(lens);
  writeUrlState(false);
  render();
}

function setAtlasActiveStudioBar(barKey) {
  ATLAS_ACTIVE_STUDIO_BAR = String(barKey || 'boss_hierarchy');
  ATLAS_STATE_STORE.activeStudioBar = ATLAS_ACTIVE_STUDIO_BAR;
  ATLAS_DIMENSION_DRAWER_OPEN = true;
  writeUrlState(false);
  render();
}

function toggleAtlasRoutePlanner() {
  ATLAS_ROUTE_PLANNER_OPEN = !ATLAS_ROUTE_PLANNER_OPEN;
  ATLAS_STATE_STORE.routePlannerOpen = ATLAS_ROUTE_PLANNER_OPEN;
  writeUrlState(false);
  render();
}

function toggleAtlasRaceGrowthBar() {
  ATLAS_RACE_GROWTH_OPEN = !ATLAS_RACE_GROWTH_OPEN;
  ATLAS_STATE_STORE.raceGrowthOpen = ATLAS_RACE_GROWTH_OPEN;
  render();
}

function toggleAtlasPresetChips() {
  ATLAS_OMNI_TRAY_DISMISSED = false;
  ATLAS_PRESET_CHIPS_OPEN = !ATLAS_PRESET_CHIPS_OPEN;
  ATLAS_STATE_STORE.presetChipsOpen = ATLAS_PRESET_CHIPS_OPEN;
  render();
}

function toggleAtlasLeftDrawer() {
  ATLAS_LEFT_DRAWER_OPEN = !ATLAS_LEFT_DRAWER_OPEN;
  ATLAS_STATE_STORE.leftDrawerOpen = ATLAS_LEFT_DRAWER_OPEN;
  writeUrlState(false);
  render();
}

// F-157: app navigation sidebar collapse. State lives in APP_SIDEBAR_COLLAPSED, mirrored to
// body[data-sidebar-collapsed], localStorage and ?sidebar=0 (absent = open).
function applyAppSidebarState() {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.setAttribute('data-sidebar-collapsed', APP_SIDEBAR_COLLAPSED ? 'true' : 'false');
  ['appSidebarToggleBtn', 'appSidebarReopenTab'].forEach(id => {
    const el = document.getElementById ? document.getElementById(id) : null;
    if (el) el.setAttribute('aria-expanded', APP_SIDEBAR_COLLAPSED ? 'false' : 'true');
  });
}

function toggleAppSidebar(forceCollapsed) {
  APP_SIDEBAR_COLLAPSED = typeof forceCollapsed === 'boolean' ? forceCollapsed : !APP_SIDEBAR_COLLAPSED;
  try { localStorage.setItem('atlas-sidebar-collapsed', APP_SIDEBAR_COLLAPSED ? '1' : '0'); } catch (e) {}
  applyAppSidebarState();
  writeUrlState(false);
  // Map engines (OpenLayers, 3D) size themselves at mount, so re-render to pick up the new canvas width.
  if (CURRENT_TAB === 'studio') render();
}

function toggleAtlasHud(forceHidden) {
  ATLAS_HUD_HIDDEN = typeof forceHidden === 'boolean' ? forceHidden : !ATLAS_HUD_HIDDEN;
  try { localStorage.setItem('atlas-hud-hidden', ATLAS_HUD_HIDDEN ? '1' : '0'); } catch (e) {}
  const shell = document.querySelector('.joy-spatial-shell');
  if (shell) shell.setAttribute('data-hud-hidden', ATLAS_HUD_HIDDEN ? 'true' : 'false');
  const btn = document.getElementById('atlasHudToggleBtn');
  if (btn) btn.setAttribute('aria-pressed', ATLAS_HUD_HIDDEN ? 'false' : 'true');
}

function toggleAtlasLegend(forceCollapsed) {
  ATLAS_LEGEND_COLLAPSED = typeof forceCollapsed === 'boolean' ? forceCollapsed : !ATLAS_LEGEND_COLLAPSED;
  try { localStorage.setItem('atlas-legend-collapsed', ATLAS_LEGEND_COLLAPSED ? '1' : '0'); } catch (e) {}
  const shell = document.querySelector('.joy-spatial-shell');
  if (shell) shell.setAttribute('data-legend-collapsed', ATLAS_LEGEND_COLLAPSED ? 'true' : 'false');
  const btn = document.getElementById('atlasLegendToggleBtn');
  if (btn) btn.setAttribute('aria-pressed', ATLAS_LEGEND_COLLAPSED ? 'false' : 'true');
}

// F-157: one control hands the map the whole screen width (sidebar + inspector drawer), a second press restores the sidebar.
function toggleAtlasMaximizeMap() {
  const maximized = APP_SIDEBAR_COLLAPSED && !ATLAS_LEFT_DRAWER_OPEN;
  ATLAS_LEFT_DRAWER_OPEN = false;
  ATLAS_STATE_STORE.leftDrawerOpen = false;
  APP_SIDEBAR_COLLAPSED = !maximized;
  try { localStorage.setItem('atlas-sidebar-collapsed', APP_SIDEBAR_COLLAPSED ? '1' : '0'); } catch (e) {}
  applyAppSidebarState();
  writeUrlState(false);
  render();
}

// F-155: Esc priority on the atlas - clear an active ruler first, else leave theater mode. Returns true when it
// consumed the key (callers then skip their own Esc behaviour).
function isAtlasOmniTrayOpen() {
  const bar = typeof document !== 'undefined' && document.querySelector ? document.querySelector('.joy-lens-bar .joy-omni-command-bar') : null;
  return Boolean(bar && bar.getAttribute('data-open') === 'true');
}

// F-156 B2: close the search tray without a re-render (the DOM stays; data-open hides it, the flag keeps it hidden
// across the next render). The query text is kept so reopening Presets or typing shows results again.
function dismissAtlasOmniTray() {
  ATLAS_OMNI_TRAY_DISMISSED = true;
  ATLAS_PRESET_CHIPS_OPEN = false;
  ATLAS_STATE_STORE.presetChipsOpen = false;
  const bar = document.querySelector('.joy-lens-bar .joy-omni-command-bar');
  if (bar) bar.setAttribute('data-open', 'false');
  const input = document.getElementById('atlasOmniSearchInput');
  if (input && typeof input.blur === 'function') input.blur();
}

function consumeAtlasEscape() {
  if (isAtlasOmniTrayOpen()) {
    dismissAtlasOmniTray();
    return true;
  }
  if (ATLAS_OL_RULER_ACTIVE || ATLAS_OL_RULER_POINTS.length) {
    ATLAS_OL_RULER_ACTIVE = false;
    ATLAS_OL_RULER_POINTS = [];
    syncAtlasActiveSpatialEngine();
    return true;
  }
  if (ATLAS_THEATER_MODE) {
    toggleAtlasTheaterMode();
    return true;
  }
  return false;
}

function toggleAtlasTheaterMode() {
  ATLAS_THEATER_MODE = !ATLAS_THEATER_MODE;
  ATLAS_STATE_STORE.theaterMode = ATLAS_THEATER_MODE;
  writeUrlState(false);
  render();
}

function toggleAtlasEntityMatrix() {
  ATLAS_ENTITY_MATRIX_OPEN = !ATLAS_ENTITY_MATRIX_OPEN;
  ATLAS_STATE_STORE.entityMatrixOpen = ATLAS_ENTITY_MATRIX_OPEN;
  render();
}

function scrollCanvasIntoViewSmooth() {
  requestAnimationFrame(() => {
    const svgEl = document.getElementById('dedicatedWorldAtlasSvg');
    if (svgEl && typeof svgEl.scrollIntoView === 'function') {
      svgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function focusTownStreetBlueprint(townId, locCoord) {
  triggerSmoothSubMapTransition();
  if (typeof window !== 'undefined') window.LAST_WORLD_TILE_ID = '';
  clearAtlasLingeringTownShopPoi();
  ATLAS_FOCUSED_TOWN_ID = townId || 'town-lantern-hollow';
  ATLAS_FOCUSED_FIELD_ID = '';
  ATLAS_FOCUSED_FORTRESS_ID = '';
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeTownId = ATLAS_FOCUSED_TOWN_ID;
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  // Pure render-path filter resolution (resolveAtlasEffectiveFilter) preserves ATLAS_STATE_STORE.filter
  // Legacy note: 'Auto-switched filter to 🌐 All Layers for Town Street Blueprint'
  const res = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'town');
  ATLAS_STATE_STORE.contextAutoHealNote = res.reason;
  if (locCoord) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(locCoord, ATLAS_STATE_STORE.activeTownId);
  }
  STUDIO_SELECTED_NODE_ID = ATLAS_STATE_STORE.activeTownId;
  STUDIO_MAP_PAN_X = 0;
  STUDIO_MAP_PAN_Y = 0;
  clearAtlasSelectionUnlessTarget(ATLAS_STATE_STORE.activeTownId);
  STUDIO_MAP_TOWN_INTERIOR = true;
  zoomStudioMap(0, false, 5.2);
  scrollCanvasIntoViewSmooth();
}

function focusFieldTacticalBlueprint(fieldOrFortId, locCoord = '') {
  triggerSmoothSubMapTransition();
  if (typeof window !== 'undefined') window.LAST_WORLD_TILE_ID = '';
  const targetId = fieldOrFortId || 'zone-field-clover-south-gate';
  if (targetId.includes('fortress') || targetId.includes('harbor') || targetId.includes('clanhall')) {
    ATLAS_FOCUSED_FORTRESS_ID = targetId;
  } else {
    ATLAS_FOCUSED_FIELD_ID = targetId;
  }
  ATLAS_ACTIVE_DUNGEON_ID = '';
  clearAtlasLingeringTownShopPoi();
  ATLAS_STATE_STORE.activeFieldOrFortId = targetId;
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  // Pure render-path filter resolution (resolveAtlasEffectiveFilter) preserves ATLAS_STATE_STORE.filter
  // Legacy note: 'Auto-switched filter to 🌐 All Layers for Tactical Field Blueprint'
  const res = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'field');
  ATLAS_STATE_STORE.contextAutoHealNote = res.reason;
  if (locCoord) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(locCoord, targetId);
  }
  STUDIO_SELECTED_NODE_ID = ATLAS_STATE_STORE.activeFieldOrFortId;
  STUDIO_MAP_PAN_X = 0;
  STUDIO_MAP_PAN_Y = 0;
  clearAtlasSelectionUnlessTarget(targetId);
  STUDIO_MAP_TOWN_INTERIOR = false;
  zoomStudioMap(0, false, 4.8);
  scrollCanvasIntoViewSmooth();
}

function focusFortressBlueprint(fortId, locCoord = '') {
  ATLAS_FOCUSED_FORTRESS_ID = fortId || 'zone-harbor-lantern-ferry-pier';
  focusFieldTacticalBlueprint(ATLAS_FOCUSED_FORTRESS_ID, locCoord);
}

function openDungeonSubMap(dungeonId, floorId = '') {
  triggerSmoothSubMapTransition();
  if (typeof window !== 'undefined') window.LAST_WORLD_TILE_ID = '';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const dungeons = tatlas.multi_floor_dungeons || [];
  const dng = dungeons.find(d => d.dungeon_id === dungeonId || d.studio_node_id === dungeonId);
  if (!dng) {
    // Never silently open another dungeon: tell the user the warp target is unknown.
    ATLAS_STATE_STORE.toastMessage = `Dungeon "${dungeonId || '(none)'}" not found`;
    render();
    return;
  }
  clearAtlasLingeringTownShopPoi();
  clearAtlasSelectionUnlessTarget(dng.dungeon_id);
  STUDIO_MAP_TOWN_INTERIOR = false;
  ATLAS_ACTIVE_DUNGEON_ID = dng.dungeon_id;
  ATLAS_STATE_STORE.activeDungeonId = dng.dungeon_id;
  // Pure render-path filter resolution (resolveAtlasEffectiveFilter) preserves ATLAS_STATE_STORE.filter
  // Legacy note: 'Auto-switched filter to 🌐 All Layers for Dungeon Floor view'
  const res = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'dungeon');
  ATLAS_STATE_STORE.contextAutoHealNote = res.reason;
  const floors = dng.floors || [];
  const defaultFloor = (floors[0] && floors[0].floor_id) || 'B1';
  if (!floorId) {
    ATLAS_STATE_STORE.activeFloorId = defaultFloor;
    ATLAS_STATE_STORE.toastMessage = '';
  } else {
    const matched = floors.find(f => f.floor_id.toUpperCase() === String(floorId).toUpperCase());
    if (matched) {
      ATLAS_STATE_STORE.activeFloorId = matched.floor_id;
      ATLAS_STATE_STORE.toastMessage = '';
    } else {
      ATLAS_STATE_STORE.activeFloorId = defaultFloor;
      ATLAS_STATE_STORE.toastMessage = `Floor "${floorId}" not found — showing ${defaultFloor}`;
    }
  }
  if (dng.entrance_loc) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(dng.entrance_loc, dng.dungeon_id, dng.studio_node_id);
  }
  STUDIO_MAP_PAN_X = 0;
  STUDIO_MAP_PAN_Y = 0;
  writeUrlState(true);
  render();
  scrollCanvasIntoViewSmooth();
}

function stepDungeonFloor(delta) {
  const dungeons = (((DATA && DATA.studioPerspectives) || {}).tShapedWorldAtlas || {}).multi_floor_dungeons || [];
  const dng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId || d.studio_node_id === ATLAS_STATE_STORE.activeDungeonId);
  const floors = (dng && dng.floors) || [];
  if (!floors.length) return;
  const curIdx = Math.max(0, floors.findIndex(f => f.floor_id === ATLAS_STATE_STORE.activeFloorId));
  switchDungeonFloor(floors[Math.max(0, Math.min(floors.length - 1, curIdx + delta))].floor_id);
}

function switchDungeonFloor(floorId, targetLoc = '') {
  if (!floorId || String(floorId).toUpperCase() === 'OVERLAND') {
    exitDungeonSubMap(targetLoc);
    return;
  }
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const dungeons = tatlas.multi_floor_dungeons || [];
  const dng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId || d.studio_node_id === ATLAS_STATE_STORE.activeDungeonId) || dungeons[0];
  if (!dng) return;
  clearAtlasLingeringTownShopPoi();
  const floors = dng.floors || [];
  const matched = floors.find(f => f.floor_id.toUpperCase() === String(floorId).toUpperCase());
  if (matched) {
    ATLAS_STATE_STORE.activeFloorId = matched.floor_id;
    ATLAS_STATE_STORE.toastMessage = '';
  } else {
    const fallback = (floors[0] && floors[0].floor_id) || 'B1';
    ATLAS_STATE_STORE.activeFloorId = fallback;
    ATLAS_STATE_STORE.toastMessage = `Floor "${floorId}" not found — showing ${fallback}`;
  }
  if (targetLoc) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(targetLoc);
  }
  writeUrlState(true);
  render();
}

function exitDungeonSubMap(targetLoc = '') {
  const prevDngId = ATLAS_STATE_STORE.activeDungeonId || ATLAS_ACTIVE_DUNGEON_ID || '';
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  ATLAS_STATE_STORE.toastMessage = '';
  if (targetLoc) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(targetLoc, prevDngId);
  }
  if (STUDIO_MAP_ZOOM >= 4.5) {
    STUDIO_MAP_ZOOM = 2.6;
  }
  STUDIO_MAP_TOWN_INTERIOR = false;
  anchorOverlandCameraOnCurrentZone(STUDIO_MAP_ZOOM, prevDngId, targetLoc || STUDIO_MAP_LOC);
  writeUrlState(true);
  render();
}

function onStudioMapKeyDown(evt) {
  if (!evt) return;
  const key = evt.key;
  if (ATLAS_ENGINE_MODE === '3d_map3d') {
    if (key === '+' || key === '=') {
      evt.preventDefault();
      ATLAS_3D_STATE.zoom = Math.max(0.45, Math.min(3.5, +(ATLAS_3D_STATE.zoom * 1.14).toFixed(3)));
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
      return;
    } else if (key === '-' || key === '_') {
      evt.preventDefault();
      ATLAS_3D_STATE.zoom = Math.max(0.45, Math.min(3.5, +(ATLAS_3D_STATE.zoom * 0.88).toFixed(3)));
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
      return;
    } else if (key === 'ArrowLeft') {
      evt.preventDefault();
      ATLAS_3D_STATE.yaw -= 0.12;
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
      return;
    } else if (key === 'ArrowRight') {
      evt.preventDefault();
      ATLAS_3D_STATE.yaw += 0.12;
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
      return;
    } else if (key === 'ArrowUp') {
      evt.preventDefault();
      ATLAS_3D_STATE.pitch = Math.max(0.25, Math.min(1.42, +(ATLAS_3D_STATE.pitch + 0.08).toFixed(3)));
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
      return;
    } else if (key === 'ArrowDown') {
      evt.preventDefault();
      ATLAS_3D_STATE.pitch = Math.max(0.25, Math.min(1.42, +(ATLAS_3D_STATE.pitch - 0.08).toFixed(3)));
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
      return;
    } else if (key === 'w' || key === 'W') {
      evt.preventDefault();
      setAtlas3dOption('wireframe', !ATLAS_3D_STATE.wireframe);
      return;
    } else if (['1', '2', '3'].includes(key)) {
      evt.preventDefault();
      const ctxOrder = ['overland', 'town', 'dungeon'];
      setAtlas3dOption('contextOverride', ctxOrder[parseInt(key, 10) - 1] || 'overland');
      return;
    }
  }
  if (key === '+' || key === '=') {
    evt.preventDefault();
    zoomStudioMap(0.55, false, null, 520, 250);
  } else if (key === '-' || key === '_') {
    evt.preventDefault();
    zoomStudioMap(-0.55, false, null, 520, 250);
  } else if (key === 'ArrowLeft') {
    evt.preventDefault();
    STUDIO_MAP_PAN_X += 42;
    clampStudioMapPan();
    applyStudioMapTransform();
  } else if (key === 'ArrowRight') {
    evt.preventDefault();
    STUDIO_MAP_PAN_X -= 42;
    clampStudioMapPan();
    applyStudioMapTransform();
  } else if (key === 'ArrowUp') {
    evt.preventDefault();
    STUDIO_MAP_PAN_Y += 42;
    clampStudioMapPan();
    applyStudioMapTransform();
  } else if (key === 'ArrowDown') {
    evt.preventDefault();
    STUDIO_MAP_PAN_Y -= 42;
    clampStudioMapPan();
    applyStudioMapTransform();
  } else if (key === 'Escape') {
    evt.preventDefault();
    if (consumeAtlasEscape()) {
      // ruler cleared or theater exited
    } else if (ATLAS_STATE_STORE.activeDungeonId) {
      exitDungeonSubMap();
    } else if (STUDIO_MAP_ZOOM > 1.2) {
      zoomStudioMap(0, true);
    } else {
      closeStudioMapPoi(evt);
    }
  } else if (['1', '2', '3', '4', '5', '6', '7', '8', '9', 'PageUp', 'PageDown'].includes(key) && ATLAS_STATE_STORE.activeDungeonId) {
    evt.preventDefault();
    const sp = (DATA && DATA.studioPerspectives) || {};
    const dungeons = (sp.tShapedWorldAtlas && sp.tShapedWorldAtlas.multi_floor_dungeons) || [];
    const dng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId);
    if (dng && dng.floors && dng.floors.length) {
      const curIdx = Math.max(0, dng.floors.findIndex(f => f.floor_id === ATLAS_STATE_STORE.activeFloorId));
      let nextIdx = curIdx;
      if (key === 'PageUp') nextIdx = Math.max(0, curIdx - 1);
      else if (key === 'PageDown') nextIdx = Math.min(dng.floors.length - 1, curIdx + 1);
      else nextIdx = Math.min(dng.floors.length - 1, parseInt(key, 10) - 1);
      switchDungeonFloor(dng.floors[nextIdx].floor_id);
    }
  }
}

function onStudioMapPointerDown(evt) {
  if (evt.target && evt.target.closest && evt.target.closest('[data-poi-clickable="1"]')) return;
  const svg = evt.currentTarget || document.getElementById('dedicatedWorldAtlasSvg');
  const p0 = clientToAtlasSvgPoint(svg, evt.clientX, evt.clientY);
  STUDIO_MAP_DRAG = {
    svg,
    startPanX: STUDIO_MAP_PAN_X,
    startPanY: STUDIO_MAP_PAN_Y,
    startSvgX: p0 ? p0.x : evt.clientX,
    startSvgY: p0 ? p0.y : evt.clientY,
    downClientX: evt.clientX,
    downClientY: evt.clientY
  };
}

function onStudioMapPointerMove(evt) {
  if (!STUDIO_MAP_DRAG) return;
  const p = clientToAtlasSvgPoint(STUDIO_MAP_DRAG.svg, evt.clientX, evt.clientY) || { x: evt.clientX, y: evt.clientY };
  STUDIO_MAP_PAN_X = STUDIO_MAP_DRAG.startPanX + (p.x - STUDIO_MAP_DRAG.startSvgX);
  STUDIO_MAP_PAN_Y = STUDIO_MAP_DRAG.startPanY + (p.y - STUDIO_MAP_DRAG.startSvgY);
  clampStudioMapPan();
  applyStudioMapTransform();
}

// F-155: touch on the 2D SVG atlas. Mouse keeps the onmouse* path; touch/pen pointers pan with one finger
// (the same drag path) and pinch-zoom with two, pivoting on the finger midpoint (cursor-anchored like the wheel)
// and panning with it. Pan clamping is zoomStudioMap/clampStudioMapPan's.
const STUDIO_MAP_TOUCHES = new Map();
let STUDIO_MAP_PINCH = null;
function onStudioMapTouchPointer(evt) {
  if (!evt || evt.pointerType === 'mouse') return;
  const svg = document.getElementById('dedicatedWorldAtlasSvg') || evt.currentTarget;
  const id = evt.pointerId;
  const mid = () => {
    const pts = [...STUDIO_MAP_TOUCHES.values()];
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    return { cx, cy, d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), svgPt: clientToAtlasSvgPoint(svg, cx, cy) };
  };
  if (evt.type === 'pointerdown') {
    STUDIO_MAP_TOUCHES.set(id, { x: evt.clientX, y: evt.clientY });
    if (STUDIO_MAP_TOUCHES.size === 1) {
      onStudioMapPointerDown(evt);
    } else if (STUDIO_MAP_TOUCHES.size === 2) {
      STUDIO_MAP_DRAG = null;
      const m = mid();
      STUDIO_MAP_PINCH = { d0: m.d || 1, z0: STUDIO_MAP_ZOOM, last: m };
    }
    return;
  }
  if (!STUDIO_MAP_TOUCHES.has(id)) return;
  if (evt.type === 'pointermove') {
    STUDIO_MAP_TOUCHES.set(id, { x: evt.clientX, y: evt.clientY });
    if (STUDIO_MAP_PINCH && STUDIO_MAP_TOUCHES.size >= 2) {
      const m = mid();
      if (m.svgPt && STUDIO_MAP_PINCH.last.svgPt) {
        STUDIO_MAP_PAN_X += m.svgPt.x - STUDIO_MAP_PINCH.last.svgPt.x;
        STUDIO_MAP_PAN_Y += m.svgPt.y - STUDIO_MAP_PINCH.last.svgPt.y;
      }
      const target = STUDIO_MAP_PINCH.z0 * m.d / STUDIO_MAP_PINCH.d0;
      // delta form (not targetZoom) so zoomStudioMap re-renders only on an LOD tier change.
      zoomStudioMap(target - STUDIO_MAP_ZOOM, false, null, m.svgPt ? m.svgPt.x : 520, m.svgPt ? m.svgPt.y : 250);
      STUDIO_MAP_PINCH.last = m;
    } else if (STUDIO_MAP_DRAG) {
      onStudioMapPointerMove(evt);
    }
    return;
  }
  // pointerup / pointercancel
  STUDIO_MAP_TOUCHES.delete(id);
  if (STUDIO_MAP_PINCH) {
    if (STUDIO_MAP_TOUCHES.size < 2) STUDIO_MAP_PINCH = null;
    return;
  }
  if (STUDIO_MAP_TOUCHES.size === 0) onStudioMapPointerUp(evt.type === 'pointercancel' ? null : evt);
}

function onStudioMapPointerUp(evt) {
  if (STUDIO_MAP_DRAG && evt && Math.hypot(evt.clientX - STUDIO_MAP_DRAG.downClientX, evt.clientY - STUDIO_MAP_DRAG.downClientY) < 5) {
    const svg = evt.currentTarget;
    const pt = clientToAtlasSvgPoint(svg, evt.clientX, evt.clientY);
    if (pt) {
      const w = atlasSvgToWorldPoint(pt.x, pt.y);
      STUDIO_MAP_LOC = svgToL2Loc(w.x, w.y);
      const locBadge = document.getElementById('studioL2LocReadout');
      if (locBadge) locBadge.textContent = `loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`;
      const ch = document.getElementById('studioL2Crosshair');
      if (ch) ch.setAttribute('transform', `translate(${STUDIO_MAP_LOC.svgX}, ${STUDIO_MAP_LOC.svgY})`);
    }
  }
  STUDIO_MAP_DRAG = null;
}

function getSortedContinentDistricts(districts, continentId) {
  return (districts || [])
    .filter(d => d.parent_continent_id === continentId)
    .slice()
    .sort((a, b) => {
      const aStarter = a.id === 'district-teacup-meadows' || a.id === 'district-pinion-terminus' || a.id === 'district-starfall-haven' ? 0 : 1;
      const bStarter = b.id === 'district-teacup-meadows' || b.id === 'district-pinion-terminus' || b.id === 'district-starfall-haven' ? 0 : 1;
      if (aStarter !== bStarter) return aStarter - bStarter;
      const aMin = (a.level_range && a.level_range[0]) || 1;
      const bMin = (b.level_range && b.level_range[0]) || 1;
      if (aMin !== bMin) return aMin - bMin;
      return String(a.id).localeCompare(String(b.id));
    });
}

function handleAtlasGlobalKeyDown(evt) {
  if (!evt) return;
  const tag = (evt.target && evt.target.tagName) ? evt.target.tagName.toUpperCase() : '';
  const isInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (evt.target && evt.target.isContentEditable);
  if ((evt.metaKey || evt.ctrlKey) && (evt.key === 'k' || evt.key === 'K')) {
    evt.preventDefault();
    const omniInput = document.getElementById('atlasOmniSearchInput');
    if (omniInput && typeof omniInput.focus === 'function') {
      omniInput.focus();
      if (typeof omniInput.select === 'function') omniInput.select();
    }
    return;
  }
  if (evt.key === 'Escape' && isInput && evt.target && evt.target.id === 'atlasOmniSearchInput' && isAtlasOmniTrayOpen()) {
    dismissAtlasOmniTray();
    return;
  }
  if (isInput || evt.metaKey || evt.ctrlKey || evt.altKey) return;
  if (evt.key === '[' && !evt.defaultPrevented) {
    evt.preventDefault();
    toggleAppSidebar();
    return;
  }
  if (evt.key === 'Escape' && !evt.defaultPrevented && CURRENT_TAB === 'studio') {
    if (consumeAtlasEscape()) evt.preventDefault();
    return;
  }
  if (evt.defaultPrevented) return;
  if (CURRENT_TAB !== 'studio' || !document.getElementById('dedicatedWorldAtlasSvg')) return;
  if (['+', '=', '-', '_'].includes(evt.key) && getAtlasEffectiveEngineMode() === '2d_ol') {
    evt.preventDefault();
    zoomActiveAtlasEngine(evt.key === '+' || evt.key === '=' ? 0.55 : -0.55);
    return;
  }
  if ((evt.key === 'f' || evt.key === 'F')) {
    evt.preventDefault();
    toggleAtlasTheaterMode();
    return;
  }
  if (!ATLAS_STATE_STORE.activeDungeonId && ['1', '2', '3', '4', '5'].includes(evt.key)) {
    evt.preventDefault();
    const lensOrder = ['gamer', 'designer', 'architect', 'developer', 'liveops'];
    setAtlasPersonaLens(lensOrder[parseInt(evt.key, 10) - 1] || 'gamer');
  }
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', handleAtlasGlobalKeyDown);
  // F-156 B2: on a phone the search tray is a bottom sheet; a tap anywhere outside the omni bar dismisses it.
  document.addEventListener('pointerdown', (evt) => {
    if (!window.matchMedia || !window.matchMedia('(max-width: 767px)').matches) return;
    if (!isAtlasOmniTrayOpen()) return;
    const t = evt.target;
    if (t && t.closest && t.closest('.joy-omni-command-bar')) return;
    dismissAtlasOmniTray();
  }, true);
}

// F-155: click on a 2D SVG zone mark selects the same POI an OpenLayers feature click selects.
function selectAtlasZoneMark(zoneId, evt) {
  if (evt && evt.stopPropagation) evt.stopPropagation();
  const f = buildAtlasspatialFeaturesList().find(x => x.id === zoneId);
  if (!f) return;
  STUDIO_MAP_SELECTED_POI = f.poi;
  STUDIO_ACTIVE_INSPECT_ID = f.poi.inspectId || f.id;
  window.LAST_WORLD_TILE_ID = f.poi.townBlueprintId || f.poi.inspectId || f.id;
  if (evt && f.poi && f.poi.dungeonWarpId) {
    openDungeonSubMap(f.poi.dungeonWarpId, f.poi.dungeonFloorId || 'B1');
    return;
  }
  ATLAS_LEFT_DRAWER_OPEN = true;
  ATLAS_STATE_STORE.leftDrawerOpen = true;
  writeUrlState(false);
  render();
}

function selectStudioMapPoi(poiJsonStr, evt) {
  if (evt && evt.stopPropagation) evt.stopPropagation();
  try {
    const poi = resolveEncodedPoi(poiJsonStr);
    STUDIO_MAP_SELECTED_POI = poi;
    window.LAST_WORLD_TILE_ID = (poi && !poi.room_id && (poi.townBlueprintId || poi.inspectId)) || '';
    if (evt && isStudioMapOverland() && poi && poi.dungeonWarpId) {
      openDungeonSubMap(poi.dungeonWarpId, poi.dungeonFloorId || 'B1');
      return;
    }
    ATLAS_LEFT_DRAWER_OPEN = true;
    ATLAS_STATE_STORE.leftDrawerOpen = true;
    if (poi && poi.svgX !== undefined && poi.svgY !== undefined) {
      STUDIO_MAP_LOC = svgToL2Loc(poi.svgX, poi.svgY);
    }
    if (poi && poi.inspectId) {
      STUDIO_ACTIVE_INSPECT_ID = poi.inspectId;
    }
    // Keep Continent -> District -> Town/Hunting Area selection 100% synchronized!
    const sp = (DATA && DATA.studioPerspectives) || {};
    const doOpts = (poi && poi.drillOpts) || {};
    if (doOpts.continentId) {
      STUDIO_SELECTED_CONTINENT_ID = doOpts.continentId;
    }
    if (doOpts.districtId) {
      STUDIO_SELECTED_DISTRICT_ID = doOpts.districtId;
      const dNodes = (sp.nodes || []).filter(n => n.parent_district_id === doOpts.districtId);
      const prefNode = dNodes.find(n => n.node_type === 'town') || dNodes[0];
      if (prefNode && !doOpts.nodeId) {
        STUDIO_SELECTED_NODE_ID = prefNode.id;
      }
    }
    if (doOpts.nodeId) {
      STUDIO_SELECTED_NODE_ID = doOpts.nodeId;
    }
    writeUrlState(false);
    render();
  } catch (err) {
    console.error('selectStudioMapPoi error:', err);
  }
}

function closeStudioMapPoi(evt) {
  if (evt && evt.stopPropagation) evt.stopPropagation();
  STUDIO_MAP_SELECTED_POI = null;
  window.LAST_WORLD_TILE_ID = '';
  // F-157: closing the inspector also hands its column back to the map (it used to leave an empty drawer).
  ATLAS_LEFT_DRAWER_OPEN = false;
  if (typeof ATLAS_STATE_STORE !== 'undefined') ATLAS_STATE_STORE.leftDrawerOpen = false;
  writeUrlState(false);
  render();
}

let STUDIO_POI_REGISTRY = {};
let STUDIO_POI_SEQ = 0;

function encodePoiAttr(poiObj) {
  const key = 'poi_' + (++STUDIO_POI_SEQ);
  STUDIO_POI_REGISTRY[key] = poiObj;
  return key;
}

function resolveEncodedPoi(poiKeyOrJson) {
  if (!poiKeyOrJson) return null;
  if (typeof poiKeyOrJson === 'object') return poiKeyOrJson;
  if (STUDIO_POI_REGISTRY[poiKeyOrJson]) return STUDIO_POI_REGISTRY[poiKeyOrJson];
  return JSON.parse(poiKeyOrJson);
}

// Reusable Lineage II (l2hub.info/map) Hand-Illustrated Landmark Silhouette Renderer
function drawL2LandmarkSvg({ kind, x, y, label, sublabel, flagColor, isSelected, poiObj }) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const fCol = flagColor || '#dc2626';
  const safeLabel = escapeHtml(label || '');
  const safeSub = escapeHtml(sublabel || '');
  const encPoi = poiObj ? encodePoiAttr({ ...poiObj, svgX: x, svgY: y }) : '';
  const clickAttr = poiObj
    ? `data-poi-clickable="1" data-landmark-id="${escapeHtml(poiObj.inspectId || '')}" tabindex="0" role="button" aria-label="${safeLabel}" class="atlas-screen-pin" style="cursor:pointer;transform-origin:${x}px ${y}px" onclick="selectStudioMapPoi('${encPoi}', event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectStudioMapPoi('${encPoi}', event);}"`
    : `class="atlas-screen-pin" style="transform-origin:${x}px ${y}px"`;
  const selRing = isSelected
    ? `<circle cx="${x}" cy="${y}" r="18" fill="rgba(250,204,21,0.22)" stroke="#fde047" stroke-width="1.6" stroke-dasharray="4 2.5"/>`
    : '';

  let iconSvg = '';
  if (kind === 'castle') {
    // Organic Multi-Turret 3/4 Isometric Stone Castle Citadel with Conical Spires, Stepped Central Keep & Curved Curtain Rampart
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.64)">
        <ellipse cx="0" cy="8" rx="24" ry="9.5" fill="rgba(20,15,9,0.58)" stroke="#6e5d3e" stroke-width="0.9"/>
        <path d="M-22,12 L-22,-6 L-18,-13 L-14,-6 L-10,-4 L-8,-16 L-4,-23 L0,-26 L4,-23 L8,-16 L10,-4 L14,-6 L18,-13 L22,-6 L22,12 Q0,15 -22,12 Z"
              fill="#5c492d" stroke="#140e07" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M-19,10 L-19,-5 L-16,-10 L-13,-5 L-13,10 Z M13,10 L13,-5 L16,-10 L19,-5 L19,10 Z" fill="#8c754c" stroke="#140e07" stroke-width="1.0"/>
        <path d="M-7,11 L-7,-14 L0,-22 L7,-14 L7,11 Q0,13 -7,11 Z" fill="#a88f60" stroke="#140e07" stroke-width="1.15"/>
        <path d="M-3.5,12 L-3.5,3 Q0,-2 3.5,3 L3.5,12 Z" fill="#140e07" stroke="#c8b282" stroke-width="0.9"/>
        <line x1="0" y1="-22" x2="0" y2="-30" stroke="#140e07" stroke-width="1.5"/>
        <polygon points="0,-30 9,-26.5 0,-23" fill="${fCol}" stroke="#140e07" stroke-width="0.8"/>
      </g>
    `;
  } else if (kind === 'town') {
    // Organic Curved Curtain-Wall Medieval City with Corner Turrets & Asymmetric Gabled Roofs (No boxy squares!)
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.64)">
        <ellipse cx="0" cy="4" rx="25" ry="13" fill="#3b2f1d" stroke="#140e07" stroke-width="1.5"/>
        <path d="M-22,4 Q-20,-6 -10,-8 Q0,-10 10,-8 Q20,-6 22,4 Q12,12 0,12 Q-12,12 -22,4 Z" fill="#786340" stroke="#c4ae7d" stroke-width="1.0"/>
        <path d="M-16,5 L-16,-4 L-11,-11 L-6,-4 L-6,5 Z" fill="#9c8256" stroke="#140e07" stroke-width="1.0"/>
        <polygon points="-17,-4 -11,-12 -5,-4" fill="#6b3a24" stroke="#140e07" stroke-width="1.0"/>
        <path d="M6,5 L6,-3 L11,-10 L16,-3 L16,5 Z" fill="#91784e" stroke="#140e07" stroke-width="1.0"/>
        <polygon points="5,-3 11,-11 17,-3" fill="#734028" stroke="#140e07" stroke-width="1.0"/>
        <path d="M-6,7 L-5,-10 L0,-19 L5,-10 L6,7 Z" fill="#b59c6b" stroke="#140e07" stroke-width="1.1"/>
        <polygon points="-6,-10 0,-20 6,-10" fill="#823e25" stroke="#140e07" stroke-width="1.1"/>
      </g>
    `;
  } else if (kind === 'fortress') {
    // Organic Multi-Bastion Stone Fortress Keep with Curved Rampart & Pennant Flag
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.66)">
        <ellipse cx="0" cy="8" rx="16" ry="6" fill="rgba(20,15,9,0.55)"/>
        <path d="M-14,9 L-12,-5 L-9,-9 L-6,-4 L-3,-9 L0,-13 L3,-9 L6,-4 L9,-9 L12,-5 L14,9 Q0,12 -14,9 Z"
              fill="#75603e" stroke="#140e07" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M-7,8 L-7,-2 L0,-7 L7,-2 L7,8 Z" fill="#9c8358" stroke="#140e07" stroke-width="0.95"/>
        <line x1="-1" y1="-12" x2="-1" y2="-23" stroke="#140e07" stroke-width="1.7"/>
        <polygon points="-1,-23 10,-19 -1,-15" fill="#b03a2e" stroke="#140e07" stroke-width="0.9"/>
      </g>
    `;
  } else if (kind === 'tower') {
    // Concentric Ring Moat & Tapered Ancient Stone Spire (Cruma Tower / Tower of Insolence)
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.64)">
        <ellipse cx="0" cy="5" rx="21" ry="9.5" fill="rgba(42,54,46,0.72)" stroke="#2b2215" stroke-width="1.4"/>
        <ellipse cx="0" cy="5" rx="13.5" ry="6" fill="#4f4029" stroke="#a89468" stroke-width="1.0"/>
        <path d="M-6,6 L-4,-18 L0,-25 L4,-18 L6,6 Q0,8 -6,6 Z" fill="#947d54" stroke="#140e07" stroke-width="1.4"/>
        <line x1="-4" y1="-8" x2="4" y2="-8" stroke="#140e07" stroke-width="1.0"/>
        <line x1="-3" y1="-14" x2="3" y2="-14" stroke="#140e07" stroke-width="1.0"/>
      </g>
    `;
  } else if (kind === 'catacomb') {
    // Stepped Necropolis Ziggurat & Dusk Portal Arch
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.68)">
        <polygon points="-11,9 -7,-4 7,-4 11,9" fill="#241d15" stroke="#a8946a" stroke-width="1.3"/>
        <path d="M-3,9 L-3,1 Q0,-2 3,1 L3,9 Z" fill="#0d0a06" stroke="#c8b48a" stroke-width="0.7"/>
        <path d="M-9,-10 Q0,-16 9,-10 Q0,-4 -9,-10 Z" fill="#2b2218" stroke="#d4c29a" stroke-width="1.1"/>
        <circle cx="0" cy="-10" r="2.0" fill="#d4c29a"/>
      </g>
    `;
  } else if (kind === 'lair') {
    // Sovereign Gothic Citadel & Astrolabe Spire (Replaces cartoon cat head while preserving exact probe path prefix!)
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.66)">
        <ellipse cx="0" cy="6" rx="17" ry="6.5" fill="rgba(20,15,9,0.55)"/>
        <path d="M-15,-4 Q-19,-15 -8,-12 L-4,-19 L0,-25 L4,-19 L8,-12 Q19,-15 15,-4 L13,8 Q0,11 -13,8 Z"
              fill="#8a744c" stroke="#140e07" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M-6,7 L-4,-12 L0,-20 L4,-12 L6,7 Z" fill="#b09868" stroke="#140e07" stroke-width="1.0"/>
        <circle cx="0" cy="-9" r="2.6" fill="#fde047" stroke="#140e07" stroke-width="0.9"/>
      </g>
    `;
  } else if (kind === 'windmill') {
    // 3/4 Isometric Timber Windmill & Diagonal Sails
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.68)">
        <polygon points="-7,10 -4,-6 4,-6 7,10" fill="#705738" stroke="#140e07" stroke-width="1.3"/>
        <line x1="-12" y1="-12" x2="12" y2="4" stroke="#140e07" stroke-width="2.4"/>
        <line x1="12" y1="-12" x2="-12" y2="4" stroke="#140e07" stroke-width="2.4"/>
        <line x1="-12" y1="-12" x2="12" y2="4" stroke="#d1bc8c" stroke-width="1.3"/>
        <line x1="12" y1="-12" x2="-12" y2="4" stroke="#d1bc8c" stroke-width="1.3"/>
        <circle cx="0" cy="-4" r="2.0" fill="#e6dec8" stroke="#140e07" stroke-width="1.0"/>
      </g>
    `;
  } else {
    iconSvg = `
      <g transform="translate(${x}, ${y}) scale(0.68)">
        <polygon points="-11,7 -4,-6 3,7" fill="#6e5436" stroke="#140e07" stroke-width="1.2"/>
        <polygon points="-1,8 6,-4 13,8" fill="#826440" stroke="#140e07" stroke-width="1.2"/>
      </g>
    `;
  }

  const labelY = y + (kind === 'castle' || kind === 'town' ? 15 : 14);
  return `
    <g ${clickAttr}>
      ${poiObj ? atlasPinHitRect(x, y) : ''}
      ${selRing}
      ${iconSvg}
      <text x="${x}" y="${labelY}" text-anchor="middle"
            style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.1px;stroke-linejoin:round;fill:${isSelected ? '#fde047' : '#f8f5ec'};font-size:${kind === 'castle' || kind === 'town' ? '9.2px' : '8.5px'};font-weight:800;font-family:${isL2 ? 'Georgia, serif' : 'Inter, sans-serif'}">
        ${safeLabel}
      </text>
      ${safeSub ? `
        <text x="${x}" y="${labelY + 10}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#120d07;stroke-width:2.5px;stroke-linejoin:round;fill:#e2d5b5;font-size:7.8px;font-weight:700;font-family:monospace">
          ${safeSub}
        </text>
      ` : ''}
    </g>
  `;
}

// Reusable Mountain Ridge Hachure Generator (L2Hub Topographic Relief)
function drawL2MountainRangeSvg(pointsStr, scale = 1.0) {
  return `
    <g opacity="0.72" pointer-events="none">
      <polyline points="${pointsStr}" fill="none" stroke="#2b2416" stroke-width="${12 * scale}" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
      <polyline points="${pointsStr}" fill="none" stroke="#463c27" stroke-width="${6 * scale}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 5"/>
      <polyline points="${pointsStr}" fill="none" stroke="#8c7f5a" stroke-width="${2 * scale}" stroke-linecap="round" stroke-dasharray="2 7"/>
    </g>
  `;
}

// Domain rule: Equip, Consumable & Blacksmith shops exist only in Towns — never in Dungeons or Hunting Fields.
function isAtlasTownShopContext(poi) {
  if (!poi || poi.dungeonWarpId || poi.dungeonFloorId || poi.fieldTacticalBlueprintId) return false;
  const ctx = ATLAS_ENGINE_MODE === '3d_map3d'
    ? (ATLAS_3D_STATE.contextOverride || getAtlasSpatialContext())
    : getAtlasSpatialContext();
  return ctx !== 'dungeon' && ctx !== 'field';
}

function clearAtlasLingeringTownShopPoi() {
  if (STUDIO_MAP_SELECTED_POI && (STUDIO_MAP_SELECTED_POI.shopAndRefinementCatalog || STUDIO_MAP_SELECTED_POI.room_id)) {
    STUDIO_MAP_SELECTED_POI = null;
  }
}

function buildStudioPlaceDrawerHtml(poi) {
  return poi ? `
    <div id="studioGooglePlaceDrawer" class="joy-spatial-shell__left">
      ${ATLAS_LEFT_DRAWER_OPEN ? `
      <div style="padding:16px">
        <!-- Place Header (Apple/Google Maps + L2Hub Place Card Style) -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <div style="font-size:17px;font-weight:800;color:#f8fafc;line-height:1.25">${escapeHtml(poi.title || 'Selected Place')}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:3px;font-weight:600">${escapeHtml(poi.category || 'Cartographic Feature')}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0"><button type="button" onclick="toggleAtlasLeftDrawer()" title="Collapse panel (keep the selection)" aria-label="Collapse panel" style="height:28px;padding:0 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);background:#243244;color:#cbd5e1;cursor:pointer;font-size:11px;font-weight:700;flex-shrink:0;white-space:nowrap">Collapse panel</button>
          <button type="button" onclick="closeStudioMapPoi(event)" title="Reset to Default Overview" style="width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);background:#243244;color:#cbd5e1;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center">×</button></div>
        </div>

        <!-- Primary Action Bar (Directions / Zoom Here / Warp to Dungeon / Center View) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          ${poi.dungeonWarpId ? `
            <button type="button" onclick="openDungeonSubMap('${escapeHtml(poi.dungeonWarpId)}', '${escapeHtml(poi.dungeonFloorId || '')}')" style="height:36px;border-radius:10px;border:1.5px solid #e9d5ff;background:#7e22ce;color:#ffffff;font-weight:800;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(126,34,206,0.45)">
              🕳️ ${escapeHtml(poi.drillLabel || 'Enter Dungeon Map')}
            </button>
          ` : (poi.fieldTacticalBlueprintId ? `
            <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(poi.fieldTacticalBlueprintId)}', '${escapeHtml(poi.locCoord || '')}')" style="height:36px;border-radius:10px;border:1.5px solid #86efac;background:#15803d;color:#ffffff;font-weight:800;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(21,128,61,0.4)">
              🏕️ ${escapeHtml(poi.drillLabel || 'Field Tactical Blueprint')}
            </button>
          ` : (poi.townBlueprintId ? `
            <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(poi.townBlueprintId)}', '${escapeHtml(poi.locCoord || '')}')" style="height:36px;border-radius:10px;border:1.5px solid #fde047;background:#2563eb;color:#ffffff;font-weight:800;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.35)">
              🔍 ${escapeHtml(poi.drillLabel || 'Zoom to Street Map')}
            </button>
          ` : (poi.drillPerspective ? `
            <button type="button" onclick="setStudioPerspective('${escapeHtml(poi.drillPerspective)}', ${escapeHtml(JSON.stringify(poi.drillOpts || {}))}); STUDIO_MAP_SELECTED_POI=null;" style="height:36px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.35)">
              🔍 ${escapeHtml(poi.drillLabel || 'Zoom Into Map')}
            </button>
          ` : `
            <button type="button" onclick="zoomStudioMap(0.65, false, null, 520, 250)" style="height:36px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
              🔍 Zoom Closer
            </button>
          `)))}
          <button type="button" onclick="zoomStudioMap(0, true)" style="height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:#243244;color:#e2e8f0;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
            🧭 Reset 1:1 View
          </button>
        </div>

        <!-- 3D Thumbnail + Status Banner -->
        <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding:10px;border-radius:10px;background:#0f1722;border:1px solid rgba(255,255,255,0.08)">
          <img src="${escapeHtml(poi.thumb || '/thumbs/buildings/tower_round_roof_a.webp')}" alt="" style="width:56px;height:56px;border-radius:8px;object-fit:contain;background:#090d14;border:1px solid rgba(255,209,102,0.35);flex-shrink:0" />
          <div style="min-width:0">
            <div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(poi.hoursOrStatus || 'Open 24 Hours · Active Canon')}</div>
            <div style="font-size:11.5px;color:#cbd5e1;margin-top:3px;line-height:1.35">${escapeHtml(poi.summary || '')}</div>
          </div>
        </div>

        <!-- Details Section (Apple/Google Maps + L2Hub Cards) -->
        <div style="font-size:13px;font-weight:800;color:#f8fafc;margin:14px 0 8px">Details &amp; Cartography</div>

        <!-- Card 1: Geographic Address & L2Hub loc=X:Y Coordinates -->
        <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07);margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase">Address &amp; Geolocation</span>
            <span class="mono" style="font-size:10px;color:#f87171;font-weight:800">╋ loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}</span>
          </div>
          <div style="font-size:12px;color:#f8fafc;margin-top:4px;line-height:1.45;font-weight:600">${escapeHtml(poi.address || 'Aethelgard World Atlas')}</div>
          ${poi.coordinates ? `<div class="mono" style="font-size:11px;color:#38bdf8;margin-top:4px">${escapeHtml(poi.coordinates)}</div>` : ''}
        </div>

        <!-- Card 2: Architecture, Walkways & 90–120cm Scale -->
        ${poi.scaleSpecs ? `
          <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07);margin-bottom:8px">
            <div style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase">Walkway, Building &amp; 90–120cm Scale</div>
            <div style="font-size:11.5px;color:#fde68a;margin-top:4px;line-height:1.45">${escapeHtml(poi.scaleSpecs)}</div>
          </div>
        ` : ''}

        <!-- Card 3: Connections / Residents / Drops -->
        ${(poi.connections && poi.connections.length) ? `
          <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07);margin-bottom:8px">
            <div style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:6px">Connected Routes &amp; Landmarks</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${poi.connections.map(c => `
                <div style="font-size:11.5px;color:#cbd5e1;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;border-radius:6px;background:#182232">
                  <span>${escapeHtml(c.label)}</span>
                  <span class="mono" style="font-size:10.5px;color:#38bdf8">${escapeHtml(c.badge || '')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Card 4 (D10): NPC Shop Catalog (Weapons, Armor, Potions) & +1..+15 Refinement Anvil Inspector — Towns only -->
        ${(poi.shopAndRefinementCatalog && !isAtlasTownShopContext(poi)) ? `
          <div id="studioShopTownOnlyNote" style="padding:9px 12px;border-radius:10px;background:#111823;border:1px dashed rgba(250,204,21,0.35);margin-bottom:8px;font-size:11px;color:#cbd5e1;line-height:1.45">🏛️ Equipment, Consumable &amp; Blacksmith Refinement Shops are located in Safe Towns — return to town to purchase gear or refine +1..+15.</div>
        ` : ''}
        ${(poi.shopAndRefinementCatalog && isAtlasTownShopContext(poi)) ? `
          <div id="studioShopAndRefinementInspector" style="padding:11px 12px;border-radius:10px;background:#111823;border:1.5px solid rgba(250,204,21,0.45);margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:11px;color:#fde047;font-weight:900;text-transform:uppercase">🛍️ NPC Shop Stock &amp; +1 to +15 Refinement Inspector</span>
              <span class="mono" style="font-size:9.5px;color:#4ade80;font-weight:800">D10 VERIFIED</span>
            </div>

            ${(!poi.activeCatalogTab || poi.activeCatalogTab === 'equip_shop' || poi.activeCatalogTab === 'all') ? `
              <div style="margin-bottom:8px">
                <div style="font-size:10.5px;font-weight:800;color:#fca5a5;margin-bottom:4px">⚔️ Equip Shop Stock (Weapons, Armor &amp; Shields)</div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${(poi.shopAndRefinementCatalog.equip_shop_stock || []).map(item => `
                    <div style="padding:5px 7px;border-radius:6px;background:#182232;border-left:3px solid #eab308">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                        <span style="font-size:11px;font-weight:800;color:#f8fafc">${escapeHtml(item.name)}</span>
                        <span class="mono" style="font-size:9.5px;color:#fde047">${Number(item.price_adena || 0).toLocaleString()} Adena</span>
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escapeHtml(item.category)} (${escapeHtml(item.grade)}) · ${escapeHtml(item.stats)} · Max ${escapeHtml(item.max_refinement || '+15')}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${(!poi.activeCatalogTab || poi.activeCatalogTab === 'consumable_shop' || poi.activeCatalogTab === 'all') ? `
              <div style="margin-bottom:8px">
                <div style="font-size:10.5px;font-weight:800;color:#67e8f9;margin-bottom:4px">🧪 Consumable &amp; Apothecary Stock (Potions, Soulshots &amp; Scrolls)</div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${(poi.shopAndRefinementCatalog.consumable_shop_stock || []).map(item => `
                    <div style="padding:5px 7px;border-radius:6px;background:#182232;border-left:3px solid #06b6d4">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                        <span style="font-size:11px;font-weight:800;color:#f8fafc">${escapeHtml(item.name)}</span>
                        <span class="mono" style="font-size:9.5px;color:#67e8f9">${Number(item.price_adena || 0).toLocaleString()} Adena</span>
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escapeHtml(item.category)} · ${escapeHtml(item.effect)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${(!poi.activeCatalogTab || poi.activeCatalogTab === 'blacksmith' || poi.activeCatalogTab === 'refinement_anvils' || poi.activeCatalogTab === 'all') ? `
              <div>
                <div style="font-size:10.5px;font-weight:800;color:#fb923c;margin-bottom:4px">⚒️ +1 to +15 Refinement Anvil Rates &amp; Material Spoils</div>
                <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
                  ${(poi.shopAndRefinementCatalog.refinement_anvil_rates || []).map(tier => `
                    <div style="padding:5px 7px;border-radius:6px;background:#1f1924;border-left:3px solid #f97316">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                        <span style="font-size:10.5px;font-weight:900;color:#fde047">${escapeHtml(tier.enchant_range)}</span>
                        <span class="mono" style="font-size:10px;color:#4ade80;font-weight:800">${tier.success_rate_pct}% Success</span>
                      </div>
                      <div style="font-size:9.8px;color:#e2e8f0;margin-top:2px">${escapeHtml(tier.stat_bonus)}</div>
                      <div style="font-size:9.5px;color:#fca5a5;margin-top:1px">⚠️ Penalty: ${escapeHtml(tier.failure_penalty)}</div>
                      <div style="font-size:9.5px;color:#bae6fd;margin-top:2px">💎 Spoils: ${escapeHtml((tier.material_spoils || []).join(', '))}</div>
                    </div>
                  `).join('')}
                </div>
                <div style="font-size:10px;font-weight:800;color:#c084fc;margin-bottom:3px">📦 Blacksmith Material Spoils &amp; Smelting Sources</div>
                <div style="display:flex;flex-direction:column;gap:3px">
                  ${(poi.shopAndRefinementCatalog.blacksmith_material_spoils || []).map(sp => `
                    <div style="padding:4px 6px;border-radius:5px;background:#182232;font-size:9.5px;color:#cbd5e1">
                      <strong style="color:#f8fafc">${escapeHtml(sp.material_name)}</strong> (${escapeHtml(sp.used_for_tiers)}) — ${escapeHtml(sp.source_zone)} [<span class="mono" style="color:#fde047">${escapeHtml(sp.drop_or_spoil_rate)}</span>]
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
  ` : '';
}

function renderCartoShellHtml({
  stepLabel,
  title,
  subtitle,
  activeScaleIndex,
  defaultPoi,
  svgInnerHtml,
  legendItems,
  drillControls,
  filterBarHtml,
  bottomPanelHtml
}) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const poi = STUDIO_MAP_SELECTED_POI || defaultPoi;
  const lodTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const initEffScale = getStudioMapEffScale(STUDIO_MAP_ZOOM);
  const initInvZoom = (1 / Math.max(1, initEffScale)).toFixed(4);
  const crosshairLoc = resolveAtlasFocusLoc(STUDIO_MAP_LOC);
  const zoomScales = [
    { idx: 1, code: 'LOD 1 · MACRO', label: '🌍 Lv.1 Macro Geography (1.0×)', persp: 'world-history-and-concept', z: 1.0 },
    { idx: 2, code: 'LOD 2 · REGIONAL', label: '🗺️ Lv.2 Regional Roads & Portals (2.8×)', persp: 'continent', z: 2.8 },
    { idx: 3, code: 'LOD 3 · DISTRICT', label: '🏙️ Lv.3 District Matrix (3.8×)', persp: 'district', z: 3.8 },
    { idx: 4, code: 'LOD 4 · STREET', label: '🏘️ Lv.4 Town Street & Shops Blueprint (6.0×)', persp: 'town-or-hunting-area', z: 6.0 }
  ];

  const placeDrawerHtml = buildStudioPlaceDrawerHtml(poi);

  return `
    <div class="joy-spatial-shell" data-engine="${getAtlasEffectiveEngineMode()}" data-carto-theme="${isL2 ? 'l2hub' : 'google'}" data-left-open="${ATLAS_LEFT_DRAWER_OPEN ? 'true' : 'false'}" data-bottom-open="${!ATLAS_THEATER_MODE ? 'true' : 'false'}" data-theater="${ATLAS_THEATER_MODE ? 'true' : 'false'}" data-hud-hidden="${ATLAS_HUD_HIDDEN ? 'true' : 'false'}" data-legend-collapsed="${ATLAS_LEGEND_COLLAPSED ? 'true' : 'false'}">
      <div class="joy-spatial-shell__chrome">
        ${filterBarHtml || renderAtlasFilterBarHtml(0)}
      </div>

      <!-- Main Split: Left Place Details Drawer + Right Interactive 2D World Map (Legacy alias: joy-spatial-viewport-shell) -->
      <div id="joySpatialViewportShell" class="joy-spatial-shell__body">
        ${placeDrawerHtml}

        <div class="joy-spatial-shell__canvas">
          <button type="button" id="atlasHudToggleBtn" class="atlas-hud-toggle" onclick="toggleAtlasHud()" aria-pressed="${ATLAS_HUD_HIDDEN ? 'false' : 'true'}" aria-label="Show or hide the map HUD" title="Show or hide the map HUD (engine, theme and LOD controls)">HUD</button>
          <!-- Top-Left Canvas HUD: Step Label, L2 Loc Readout, Semantic LOD Badge, Carto Theme & Scale Controls -->
          <div class="joy-spatial-shell__hud joy-spatial-shell__hud--top-left">
            <div class="joy-spatial-shell__hud-panel">
              <span class="mono" style="font-size:9.5px;font-weight:800;color:${isL2 ? '#dab362' : '#38bdf8'};letter-spacing:0.04em">${stepLabel}</span>
              <span id="studioL2LocReadout" class="mono" style="padding:1px 6px;border-radius:4px;background:rgba(220,38,38,0.18);border:1px solid rgba(248,113,113,0.5);color:#fca5a5;font-size:9.5px;font-weight:800">loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}</span>
              <span id="studioSemanticLodBadge" class="mono" style="padding:1px 6px;border-radius:4px;background:rgba(56,189,248,0.16);border:1px solid rgba(56,189,248,0.45);color:#7dd3fc;font-size:9.5px;font-weight:800">
                ${ATLAS_STATE_STORE.activeDungeonId
                  ? `🕳️ SUB-MAP: ${escapeHtml(ATLAS_STATE_STORE.activeDungeonId)} (${escapeHtml(ATLAS_STATE_STORE.activeFloorId)})`
                  : (lodTier === 3 ? '🏘️ LOD Tier 3: Town Street & Shop/Refinement Blueprint (4.5×–12.0×)' : (lodTier === 2 ? '🛤️ LOD Tier 2: Regional Roads, Lv.Bands & Dungeon Portals (2.2×–8.0×)' : '🌍 LOD Tier 1: Macro Geography & 6 Race Spawns (1.0×–2.2×)'))}
              </span>
              <span style="display:none" title="${escapeHtml(subtitle || '')}">${title}</span>
              <div style="display:inline-flex;background:#0d1624;padding:1px;border-radius:5px;border:1px solid rgba(255,255,255,0.16)">
                <button type="button" onclick="setStudioCartoTheme('l2hub')" style="padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;border:none;background:${isL2 ? '#dab362' : 'transparent'};color:${isL2 ? '#0d1624' : '#94a3b8'}">
                  📜 L2Hub Aden Parchment
                </button>
                <button type="button" onclick="setStudioCartoTheme('google')" style="padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;border:none;background:${!isL2 ? '#2563eb' : 'transparent'};color:${!isL2 ? '#ffffff' : '#94a3b8'}">
                  🗺️ Google/Apple GIS
                </button>
              </div>
              <div style="display:inline-flex;background:#0d1624;padding:1px;border-radius:5px;border:1px solid rgba(56,189,248,0.35)">
                <button type="button" onclick="setAtlasEngineMode('2d_svg')" style="padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;border:none;background:${ATLAS_ENGINE_MODE === '2d_svg' ? '#0284c7' : 'transparent'};color:${ATLAS_ENGINE_MODE === '2d_svg' ? '#ffffff' : '#94a3b8'}">
                  🗺️ 2D Crisp Vector
                </button>
                <button type="button" onclick="setAtlasEngineMode('2d_ol')" style="padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;border:none;background:${ATLAS_ENGINE_MODE === '2d_ol' ? '#0284c7' : 'transparent'};color:${ATLAS_ENGINE_MODE === '2d_ol' ? '#ffffff' : '#94a3b8'}">
                  🌐 2D OpenLayers GIS
                </button>
                <button type="button" onclick="setAtlasEngineMode('3d_map3d')" style="padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;border:none;background:${ATLAS_ENGINE_MODE === '3d_map3d' ? '#7e22ce' : 'transparent'};color:${ATLAS_ENGINE_MODE === '3d_map3d' ? '#ffffff' : '#94a3b8'}">
                  🧊 3D Blockout (map3d)
                </button>
              </div>
              <button type="button" onclick="toggleAtlasRasterReliefOverlay()" style="padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;border:1px solid ${ATLAS_RASTER_RELIEF_OVERLAY ? '#fde047' : 'rgba(255,255,255,0.16)'};background:${ATLAS_RASTER_RELIEF_OVERLAY ? '#78350f' : '#0d1624'};color:${ATLAS_RASTER_RELIEF_OVERLAY ? '#fde047' : '#94a3b8'}">
                🖼️ Legacy Raster Plate
              </button>
              <button type="button" onclick="exportAtlasBlockoutGlb()" style="padding:1px 7px;border-radius:4px;font-size:9.5px;font-weight:900;cursor:pointer;border:1px solid #34d399;background:#065f46;color:#ecfdf5">
                📦 Export .glb (Godot 4)
              </button>
              <span style="display:none">
                ${zoomScales.map(zs => `
                  <button type="button" onclick="ATLAS_STATE_STORE.activeDungeonId=''; ATLAS_STATE_STORE.activeFloorId=''; STUDIO_MAP_PAN_X=0; STUDIO_MAP_PAN_Y=0; STUDIO_MAP_TOWN_INTERIOR=${zs.z >= 4.5}; STUDIO_MAP_ZOOM=${zs.z}; setStudioPerspective('${zs.persp}');">${zs.label}</button>
                `).join('')}
              </span>
            </div>
            ${drillControls ? `
              <div class="joy-spatial-shell__hud-panel">
                ${drillControls}
              </div>
            ` : ''}
          </div>

          <!-- Floating Map Zoom Controls (+ / - / 1:1 / Street Blueprint) -->
          <div class="joy-spatial-shell__hud joy-spatial-shell__hud--top-right">
            <div class="joy-spatial-shell__hud-panel joy-spatial-shell__hud-panel--zoom">
              <button type="button" onclick="zoomActiveAtlasEngine(0.65)" title="Zoom In (+ key)" style="width:34px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#29251d;color:#f8fafc;font-size:16px;font-weight:800;cursor:pointer">+</button>
              <div id="studioCartoZoomReadout" class="mono" style="font-size:10px;text-align:center;color:#fde047;padding:2px 0">${getAtlasEffectiveEngineMode() === '3d_map3d' ? `${ATLAS_3D_STATE.zoom.toFixed(2)}× 3D` : `${STUDIO_MAP_ZOOM.toFixed(2)}×`}</div>
              <button type="button" onclick="zoomActiveAtlasEngine(-0.65)" title="Zoom Out (- key)" style="width:34px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#29251d;color:#f8fafc;font-size:16px;font-weight:800;cursor:pointer">−</button>
              <button type="button" onclick="zoomActiveAtlasEngine(0, false, 2.8)" title="Regional Roads LOD (2.8x)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(56,189,248,0.45);background:#0f172a;color:#38bdf8;font-size:9.5px;font-weight:800;cursor:pointer">2.8×</button>
              <button type="button" onclick="smartDrillAt52x()" title="Auto-Drill Sub-Map Blueprint (Town / Field / Dungeon at 5.2x)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(250,204,21,0.55);background:#422006;color:#fde047;font-size:9.5px;font-weight:800;cursor:pointer">5.2×</button>
              <button type="button" onclick="zoomActiveAtlasEngine(0, true)" title="Reset Pan & Zoom (1:1 Macro)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#17140f;color:#fde047;font-size:10px;font-weight:700;cursor:pointer">1:1</button>
              <button type="button" onclick="toggleAtlasLeftDrawer()" title="Toggle Left Inspector Drawer" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(56,189,248,0.45);background:#0f172a;color:#7dd3fc;font-size:10px;font-weight:800;cursor:pointer">${ATLAS_LEFT_DRAWER_OPEN ? '◀' : '▶'}</button>
              <button type="button" onclick="toggleAtlasMaximizeMap()" title="Maximize map: hide the sidebar and the inspector (press again to restore)" aria-label="Maximize map" style="height:24px;padding:0 6px;border-radius:7px;border:1px solid rgba(56,189,248,0.45);background:#0f172a;color:#7dd3fc;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap">Max map</button>
              <button type="button" class="atlas-touch-44" onclick="toggleAtlasTheaterMode()" title="Toggle Full-Viewport Theater Mode (Hotkey: F)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(250,204,21,0.45);background:#1c1917;color:#fde047;font-size:10px;font-weight:800;cursor:pointer">⛶</button>
            </div>
          </div>

          <!-- Interactive 2D Cartographic SVG Map (WCAG 2.2 Keyboard Accessible via onStudioMapKeyDown) -->
          <svg id="dedicatedWorldAtlasSvg" class="${ATLAS_SUBMAP_TRANSITION_SEQ > 0 ? 'atlas-submap-smooth-transition' : ''}" data-transition-seq="${ATLAS_SUBMAP_TRANSITION_SEQ}" tabindex="0" role="application" aria-label="Interactive Semantic-Zoom World, Town and Multi-Floor Dungeon Atlas"
               viewBox="0 0 1040 500" width="100%" height="100%"
               onkeydown="onStudioMapKeyDown(event)"
               onwheel="onStudioMapWheel(event)"
               onmousedown="onStudioMapPointerDown(event)"
               onmousemove="onStudioMapPointerMove(event)"
               onmouseup="onStudioMapPointerUp(event)"
               onmouseleave="onStudioMapPointerUp(event)"
               onpointerdown="onStudioMapTouchPointer(event)"
               onpointermove="onStudioMapTouchPointer(event)"
               onpointerup="onStudioMapTouchPointer(event)"
               onpointercancel="onStudioMapTouchPointer(event)"
               style="display:${getAtlasEffectiveEngineMode() === '2d_svg' ? 'block' : 'none'};width:100%;height:100%;cursor:grab;user-select:none;outline:none;touch-action:none;--atlas-inv-zoom:${initInvZoom}">
            <defs>
              <radialGradient id="cartoSeaGrad" cx="50%" cy="50%" r="72%">
                <stop offset="0%" stop-color="${isL2 ? '#3d5a5e' : '#21436a'}"/>
                <stop offset="65%" stop-color="${isL2 ? '#2f474b' : '#193452'}"/>
                <stop offset="100%" stop-color="${isL2 ? '#1f3134' : '#12263d'}"/>
              </radialGradient>
              <radialGradient id="l2ParchmentGrad" cx="48%" cy="46%" r="65%">
                <stop offset="0%" stop-color="#857c58"/>
                <stop offset="55%" stop-color="#6b6344"/>
                <stop offset="100%" stop-color="#4e472f"/>
              </radialGradient>
              <pattern id="cartoGridPat" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="${isL2 ? 'rgba(24,18,10,0.16)' : 'rgba(148,163,184,0.07)'}" stroke-width="1"/>
              </pattern>
              <filter id="cartoDropShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.65"/>
              </filter>
              <!-- F-157: nothing (raster plate, zoomed or panned content) may draw outside the 0..1040 x 0..500 world frame. -->
              <clipPath id="atlasWorldFrameClip"><rect x="0" y="0" width="1040" height="500" rx="6"/></clipPath>
            </defs>
            <rect width="1040" height="500" fill="url(#cartoSeaGrad)"/>
            <rect width="1040" height="500" fill="url(#cartoGridPat)"/>
            <!-- Vignette Parchment Frame like L2Hub Aden Map -->
            <g clip-path="url(#atlasWorldFrameClip)">
            <g id="studioCartoViewport" transform="translate(${520 + STUDIO_MAP_PAN_X}, ${250 + STUDIO_MAP_PAN_Y}) scale(${initEffScale}) translate(-520, -250)">
              ${svgInnerHtml}
              <!-- Interactive L2Hub Red/White Crosshair Target (+ at loc=X:Y, screen-space invariant via .atlas-screen-pin) -->
              <g id="studioL2Crosshair" transform="translate(${crosshairLoc.svgX}, ${crosshairLoc.svgY})" pointer-events="none">
                <g class="atlas-screen-pin" style="transform-origin:0px 0px">
                  <circle cx="0" cy="0" r="8" fill="rgba(220,38,38,0.16)" stroke="#ef4444" stroke-width="1.2"/>
                  <line x1="-7" y1="0" x2="7" y2="0" stroke="#ef4444" stroke-width="2.2"/>
                  <line x1="0" y1="-7" x2="0" y2="7" stroke="#ef4444" stroke-width="2.2"/>
                  <line x1="-5" y1="0" x2="5" y2="0" stroke="#ffffff" stroke-width="1.1"/>
                  <line x1="0" y1="-5" x2="0" y2="5" stroke="#ffffff" stroke-width="1.1"/>
                </g>
              </g>
            </g>
            </g>
            <rect width="1040" height="500" fill="none" stroke="#1c160e" stroke-width="10" pointer-events="none"/>
          </svg>
          ${getAtlasEffectiveEngineMode() !== '2d_svg' ? `<div id="atlasAdvancedEngineMount" data-engine-mode="${escapeHtml(ATLAS_ENGINE_MODE)}" style="position:relative;width:100%;height:100%;min-height:min(460px,100%);background:#090f1a;overflow:hidden"></div>` : ''}

          <!-- Google Maps-Style Live Metric Scale Bar (100 m / 500 m / 1 km / 5 km) -->
          ${(() => {
            const sb = computeAtlasGoogleScaleBarSpec(STUDIO_MAP_ZOOM);
            const curCtx = typeof getAtlasSpatialContext === 'function' ? getAtlasSpatialContext() : 'overland';
            const stepLabel = curCtx === 'dungeon' ? 'Dungeon Floor (50m–200m)' : (curCtx === 'town' ? 'Town Street (100m–200m)' : (curCtx === 'field' ? 'Field Tactical (200m–500m)' : 'Overland Continent (1km–10km)'));
            return `
              <div id="studioGoogleScaleBarWidget"
                   class="atlas-google-scale-bar"
                   data-scale-meters="${sb.meters}"
                   data-scale-label="${escapeHtml(sb.label)}"
                   data-spatial-context="${escapeHtml(curCtx)}"
                   style="position:absolute;bottom:48px;right:14px;z-index:16;display:inline-flex;align-items:center;gap:8px;padding:5px 11px;border-radius:7px;background:rgba(15,23,42,0.92);border:1px solid rgba(226,232,240,0.34);box-shadow:0 4px 12px rgba(0,0,0,0.45);color:#f8fafc;font-family:monospace;pointer-events:auto"
                   title="Google Maps–Style Live Metric Scale Bar (1.05m Chibi Character Reference · ${escapeHtml(stepLabel)})">
                <span id="studioGoogleScaleBarLabel" style="font-size:11.5px;font-weight:900;color:#ffffff;letter-spacing:0.02em;white-space:nowrap">${escapeHtml(sb.label)}</span>
                <div id="studioGoogleScaleBarLine"
                     style="width:${sb.barWidthPx}px;height:7px;border-bottom:2.5px solid #ffffff;border-left:2.5px solid #ffffff;border-right:2.5px solid #ffffff;box-sizing:border-box;position:relative;transition:width 140ms ease-out">
                  <span style="position:absolute;left:50%;bottom:0;height:4px;border-left:1.5px solid rgba(255,255,255,0.65)"></span>
                </div>
                <span id="studioGoogleScaleBarSub" style="font-size:9.5px;color:#93c5fd;white-space:nowrap">${escapeHtml(sb.subLabel)}</span>
              </div>
            `;
          })()}

          <!-- Bottom Cartographic Scale Bar & Legend -->
          <button type="button" id="atlasLegendToggleBtn" class="atlas-legend-toggle" onclick="toggleAtlasLegend()" aria-pressed="${ATLAS_LEGEND_COLLAPSED ? 'false' : 'true'}" aria-label="Show or hide the map legend" title="Show or hide the map legend">Legend</button>
          <div class="atlas-map-legend" style="position:absolute;bottom:10px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 12px;border-radius:8px;background:rgba(15,13,10,0.92);border:1px solid rgba(212,175,55,0.28);font-size:11px;color:#e7e5e4;pointer-events:none">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              ${(legendItems || []).map(item => `
                <span style="display:inline-flex;align-items:center;gap:5px">
                  <span style="width:10px;height:10px;border-radius:3px;background:${item.color};display:inline-block;border:1px solid rgba(255,255,255,0.4)"></span>
                  <span>${escapeHtml(item.label)}</span>
                </span>
              `).join('')}
            </div>
            <div class="mono atlas-legend-keys" style="font-size:10px;color:#fde68a">⌨️ Keys: [+/−] Semantic Zoom · [Arrows] Pan · [1–3/PgUp/PgDn] Floor · [Esc] Exit Sub-Map</div>
          </div>
        </div>
      </div>

      <div class="joy-spatial-shell__bottom">
        ${renderAtlasBelowCanvasStudioDockHtml(ATLAS_LAST_MATCH_COUNT)}
        ${bottomPanelHtml || ''}
      </div>
    </div>
  `;
}

// ============================================================================
// DEDICATED SEMANTIC-ZOOM WORLD, TOWN & MULTI-FLOOR DUNGEON ATLAS COMPONENT
// ============================================================================
function matchesAtlasLevelBand(lvOrRange, bandStr = ATLAS_STATE_STORE.levelBand) {
  if (!bandStr || bandStr === 'All') return true;
  const parts = String(bandStr).split('-').map(x => parseInt(x, 10));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return true;
  const [bMin, bMax] = parts;
  if (Array.isArray(lvOrRange) && lvOrRange.length >= 2) {
    return lvOrRange[1] >= bMin && lvOrRange[0] <= bMax;
  }
  const lv = parseInt(lvOrRange, 10);
  if (!Number.isFinite(lv)) return true;
  return lv >= bMin && lv <= bMax;
}

function getAllAtlasTownEntries(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  const list = [
    ...(zdir.starting_towns || []),
    ...(zdir.other_castle_and_hub_towns || [])
  ];
  const deepTown = (tatlas && tatlas.t_deep_validation_slice && tatlas.t_deep_validation_slice.deep_town) || null;
  if (deepTown && deepTown.studio_node_id && !list.some(t => t.studio_node_id === deepTown.studio_node_id)) {
    list.unshift(deepTown);
  }
  return list;
}

function getAllAtlasFieldEntries(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  return zdir.fields_and_hunting_areas || [];
}

function getAllAtlasFortressEntries(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  return zdir.harbors_clanhalls_and_forts || [];
}

function getFieldOrFortressBlueprintData(zoneOrNodeId, tatlas) {
  const targetId = typeof zoneOrNodeId === 'string'
    ? zoneOrNodeId
    : ((zoneOrNodeId && (zoneOrNodeId.zone_id || zoneOrNodeId.studio_node_id || zoneOrNodeId.id)) || ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate');
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allForts = getAllAtlasFortressEntries(tatlas);
  const matchedField = allFields.find(f => f.zone_id === targetId || f.studio_node_id === targetId);
  if (matchedField && matchedField.field_tactical_blueprint) {
    return { kind: 'field', entry: matchedField, bp: matchedField.field_tactical_blueprint };
  }
  const matchedFort = allForts.find(h => h.zone_id === targetId || h.studio_node_id === targetId);
  if (matchedFort && matchedFort.fortress_blueprint) {
    return { kind: 'fortress', entry: matchedFort, bp: matchedFort.fortress_blueprint };
  }
  if (allFields.length > 0 && allFields[0].field_tactical_blueprint) {
    return { kind: 'field', entry: allFields[0], bp: allFields[0].field_tactical_blueprint };
  }
  return null;
}

function getTownBlueprintData(townNodeOrId, tatlas) {
  const targetId = typeof townNodeOrId === 'string'
    ? townNodeOrId
    : ((townNodeOrId && (townNodeOrId.id || townNodeOrId.studio_node_id || townNodeOrId.zone_id)) || ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow');
  const allTowns = getAllAtlasTownEntries(tatlas);
  const matchedTown = allTowns.find(t => t.studio_node_id === targetId || t.zone_id === targetId);
  if (matchedTown && matchedTown.town_blueprint) {
    return matchedTown.town_blueprint;
  }
  const deepTown = (tatlas && tatlas.t_deep_validation_slice && tatlas.t_deep_validation_slice.deep_town) || {};
  if (deepTown.town_blueprint && (!targetId || targetId === 'town-lantern-hollow' || targetId === deepTown.studio_node_id || targetId === deepTown.zone_id)) {
    return deepTown.town_blueprint;
  }
  if (allTowns.length > 0 && allTowns[0].town_blueprint) {
    return allTowns[0].town_blueprint;
  }
  return deepTown.town_blueprint || {
    archetype_subtitle: 'Lantern Hollow Village (Gludin / Oren by Cheese Blueprint)',
    wall_polygon_pct: [[24, 12], [76, 12], [88, 28], [88, 72], [76, 88], [24, 88], [12, 72], [12, 28]],
    gates: [],
    streets: [],
    buildings: [],
    service_marks: [],
    npc_roster: []
  };
}

