let DATA = null;
let THUMB_INDEX = {};
let CURRENT_TAB = 'studio';
let SEARCH_QUERY = '';
let DROP_RATE_MULT = 1;
let HIGHLIGHT_ENTITY_ID = '';
let SELECTED_DOC_IDX = 0;
let SELECTED_CONTINENT_ID = 'all';
let STUDIO_PERSPECTIVE = 'world-history-and-concept';
let STUDIO_STATUS_FILTER = 'all';
let STUDIO_SELECTED_CONTINENT_ID = 'continent-01-hearthbloom-basin';
let STUDIO_SELECTED_DISTRICT_ID = 'district-teacup-meadows';
let STUDIO_SELECTED_NODE_ID = 'town-lantern-hollow';
let STUDIO_ACTIVE_INSPECT_ID = 'world-history-cradle-of-embers';
let STUDIO_LEVEL_BAND = 'Levels 1 to 20';
let STUDIO_PINNED_MONSTER_ID = '';
let STUDIO_SELECTED_MONSTER_ID = '';
let SELECTED_STORY_KIND = 'all';
let SELECTED_BESTIARY_REGION = 'all';
let MAXION_LEVEL_BAND = '1-20';
let MAXION_CAT_FILTER = 'all';
let MAXION_PINNED_MOB_ID = 'poring';
let MAXION_SELECTED_TILE_ID = 'freja-south-gate';
let MAXION_SELECTED_MOB_ID = 'hunter_fly';
let MAP_DIR_FILTER = 'all';
let SIM_OUTPUT = 'Click "Run Balance Sim" in the top bar (or below) to execute cargo run --bin balance_sim against the live Rust authoritative combat engine.';
let SIM_RUNNING = false;
// Panel params (SSOT merge): URL-borne state for mounted panels and the story/review sub-views.
// Absent in the URL = cleared here, matching the other params (Back/forward never keeps stale state).
const ATLAS_PARAM_KEYS = ['kind', 'key', 'mode', 'group', 'view', 'verdict'];
const ATLAS_PARAM_RE = /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,119}$/;
let ATLAS_PARAMS = {};
const ATLAS_SUBVIEWS = {
  story:  { dflt: 'nodes',     views: [['nodes', 'Nodes'], ['reader', 'Reader'], ['graph', 'Graph'], ['undertow', 'Undertow']] },
  review: { dflt: 'proposals', views: [['proposals', 'Proposals'], ['verdicts', 'Asset verdicts']] }
};

const NAV_GROUPS = [
  {
    section: 'Systematic Top-Down World Studio',
    items: [
      { id: 'studio', label: '🌌 Top-Down World Studio (4 Perspectives)', countKey: d => {
        const sp = (d && d.studioPerspectives) || {};
        const dists = (sp.districts || []).length;
        const canonMaps = (sp.nodes || []).filter(n => n.status === 'canon').length;
        return dists + 'D · ' + canonMaps + ' Maps';
      } },
    ]
  },
  {
    section: 'World Map & Atlas (Maxion / Lineage)',
    items: [
      { id: 'world', label: '🧭 Interactive World Map', countKey: () => getAllWorldTiles().length + ' Tiles' },
      { id: 'maps',  label: '🗺️ Connected Map Directory', countKey: () => getAllWorldTiles().length + ' Maps' },
      { id: 'map-sheets',  label: '📐 Map Sheets (mapforge)', panel: true, countKey: () => atlasPanelCount('map-sheets') },
      { id: 'map-builder', label: '🧱 Map Builder (draft · publish)', panel: true, countKey: () => atlasPanelCount('map-builder') },
      { id: 'mobs',  label: '👾 Monster Detail (mob_db)', countKey: () => getAllMonsters().length + ' Mobs' },
      { id: 'bestiary', label: '🐉 World Bestiary (116 Fauna)', countKey: d => (d.bestiary || []).length },
    ]
  },
  {
    section: 'MMORPG Databases (RMS)',
    items: [
      { id: 'gear',     label: '⚔️ Item & Card DB (item_db)', countKey: d => d.items.length + d.cards.length },
      { id: 'jobs',     label: '🛡️ Job & Skill DB (skill_db)', countKey: d => d.jobs.length + d.skills.length },
      { id: 'races',    label: '🧬 6 Canonical Races & Towns', countKey: d => (d.races || []).length },
      { id: 'dungeons', label: '🏰 60-Dungeon Spires (dungeon_db)', countKey: d => (d.dungeons || []).length },
      { id: 'enchant',  label: '✨ High-Stakes +20 Forge', countKey: () => 20 },
      { id: 'quests',   label: '📜 Quest Database (quest_db)', countKey: d => d.quests.length },
      { id: 'story',    label: '📖 Story & Undertow Reader', countKey: d => ((d.worldSpine || {}).storyNodes || []).length },
      { id: 'overview', label: '📊 Database Hub & Matrix', countKey: () => 9 },
    ]
  },
  {
    section: 'Asset Library',
    items: [
      { id: 'assets',   label: '🧊 Asset Classes & 3D Viewer', panel: true, countKey: () => atlasPanelCount('assets') },
      { id: 'audio',    label: '🔊 SFX & Music Soundboard', panel: true, countKey: () => atlasPanelCount('audio') },
      { id: 'art',      label: '🎨 Concept Art', panel: true, countKey: () => atlasPanelCount('art') },
      { id: 'coverage', label: '🧩 Asset Key Coverage', panel: true, countKey: () => atlasPanelCount('coverage') },
    ]
  },
  {
    section: 'AI Asset & Map Studio',
    items: [
      { id: 'review',  label: '✨ Review Gate Inbox (Step 3)', countKey: d => ((d.reviewQueue && d.reviewQueue.proposals) || []).length },
      { id: 'forge',   label: '🔥 Art Forge Runs & Briefs', panel: true, countKey: () => atlasPanelCount('forge') },
      { id: 'brushes', label: '🌿 Biome Brush & Tag Pools',    countKey: d => Object.keys(d.groundPalettes || {}).length },
    ]
  },
  {
    section: 'Tools & Calculators',
    items: [
      { id: 'elements', label: '🔥 Property & Size Chart', countKey: d => (d.elements.elements || []).length },
      { id: 'siege',    label: '🏰 WoE Castle Calculator', countKey: d => d.castles.length },
      { id: 'sql',      label: '🗄️ SQLite Query Studio', countKey: () => 'SQL' },
      { id: 'combat-lab', label: '🧮 Combat Model Lab (design)', panel: true, countKey: () => atlasPanelCount('combat-lab') },
      { id: 'sim',      label: '⚙️ Rust Balance Simulator', countKey: () => 'RS' },
      { id: 'docs',     label: '📖 Architecture Specs', countKey: d => d.docs.length },
    ]
  }
];

// Mounted storybook panels (atelier/atlas-world-panels/js/panels/registry.mjs) report their own
// counts once mounted; until then the sidebar shows an ellipsis.
function atlasPanelCount(id) {
  const c = window.ATLAS_PANELS && window.ATLAS_PANELS.count ? window.ATLAS_PANELS.count(id) : null;
  return c === null || c === undefined ? '…' : c;
}

// Which tab+params the panel host owns. registry.mjs is the authority once loaded; this mirror
// (checked against the registry by tests) only covers the moment before the module has run.
function atlasPanelGuess(tab, params) {
  if (tab === 'story') return ['reader', 'graph', 'undertow'].includes(params.view);
  if (tab === 'review') return params.view === 'verdicts';
  return NAV_GROUPS.some(g => g.items.some(it => it.id === tab && it.panel));
}

// Panels adjust their own URL params (selected asset, mode, ...) without a re-render.
function atlasSetParams(patch, opts) {
  Object.keys(patch || {}).forEach(k => {
    if (!ATLAS_PARAM_KEYS.includes(k)) return;
    const v = patch[k];
    // An unrepresentable value clears the param: keeping the old one would leave the URL naming a stale selection.
    if (v !== null && v !== undefined && v !== '' && ATLAS_PARAM_RE.test(String(v))) ATLAS_PARAMS[k] = String(v);
    else delete ATLAS_PARAMS[k];
  });
  writeUrlState(!!(opts && opts.push));
}
window.atlasSetParams = atlasSetParams;

function renderSubViewBar() {
  const bar = document.getElementById('subViewBar');
  if (!bar) return;
  const cfg = ATLAS_SUBVIEWS[CURRENT_TAB];
  if (!cfg) { bar.hidden = true; bar.innerHTML = ''; return; }
  const cur = ATLAS_PARAMS.view || cfg.dflt;
  bar.hidden = false;
  bar.innerHTML = cfg.views.map(([id, label]) =>
    `<button type="button" class="joy-button joy-button--sm ${id === cur ? 'joy-button--solid' : 'joy-button--outline'}" data-subview="${id}" aria-pressed="${id === cur}" onclick="setSubView('${id}')">${label}</button>`
  ).join('');
}

function setSubView(view) {
  ATLAS_PARAMS = { view };
  writeUrlState();
  render();
}

function panelDispatch(main) {
  const host = document.getElementById('panelHost');
  if (!host) return false;
  const P = window.ATLAS_PANELS;
  const claimed = P ? P.claims(CURRENT_TAB, ATLAS_PARAMS) : atlasPanelGuess(CURRENT_TAB, ATLAS_PARAMS);
  if (!claimed) {
    if (P) P.hideAll();
    host.hidden = true;
    main.hidden = false;
    return false;
  }
  main.hidden = true;
  host.hidden = false;
  if (P) P.show(CURRENT_TAB, ATLAS_PARAMS);
  else if (!host.firstElementChild) {
    host.innerHTML = '<div data-panel-loading class="empty-state">Loading panels…</div>';
    // registry.mjs never defined ATLAS_PANELS (404 / syntax error): say so instead of loading forever.
    setTimeout(() => {
      const el = document.querySelector('#panelHost [data-panel-loading]');
      if (el && !window.ATLAS_PANELS) {
        el.textContent = 'Panels failed to load (/atelier/atlas-world-panels/js/panels/registry.mjs). See the browser console.';
        console.error('[atlas-panels] registry.mjs did not define window.ATLAS_PANELS');
      }
    }, 8000);
  }
  return true;
}

function buildThumbIndex() {
  THUMB_INDEX = {};
  if (!DATA) return;
  ['items', 'cards', 'mobs', 'jobs', 'skills', 'quests', 'castles'].forEach(group => {
    (DATA[group] || []).forEach(ent => {
      if (ent && ent.id && ent.thumbUrl) {
        THUMB_INDEX[ent.id] = ent.thumbUrl;
      }
    });
  });
}

function renderThumbChip(entityObjOrId, fallbackText) {
  const url = typeof entityObjOrId === 'string' ? THUMB_INDEX[entityObjOrId] : entityObjOrId?.thumbUrl;
  const alt = typeof entityObjOrId === 'string' ? entityObjOrId : (entityObjOrId?.name || entityObjOrId?.id || '');
  if (url) {
    return `<span class="rms-thumb-chip"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" /></span>`;
  }
  return `<span class="rms-thumb-chip">${escapeHtml(fallbackText || '◆')}</span>`;
}

function renderArtworkCell(entity, rowspan, badgeLabel) {
  const url = entity?.thumbUrl || THUMB_INDEX[entity?.id];
  const sceneShort = (entity?.scenePath || '').replace('res://assets/', '');
  return `
    <td rowspan="${rowspan}" class="rms-artwork-cell">
      <div class="rms-artwork-stage">
        ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(entity?.name || entity?.id || '')}" loading="lazy" />` : '<span>◆</span>'}
      </div>
      <div class="rms-artwork-caption">${escapeHtml(sceneShort || badgeLabel || entity?.id || '')}</div>
    </td>
  `;
}

function renderCardPortraitCell(card, rowspan) {
  const url = card?.thumbUrl || THUMB_INDEX[card?.id];
  return `
    <td rowspan="${rowspan}" class="rms-artwork-cell">
      <div class="rms-card-portrait">
        <div class="rms-card-portrait__header">${escapeHtml(card.slot)} CARD</div>
        ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(card.name)}" loading="lazy" />` : '<span>🃏</span>'}
        <div class="rms-card-portrait__footer">${escapeHtml(card.mobId)}</div>
      </div>
      <div class="rms-artwork-caption">${escapeHtml(card.assetStudioKey || card.id)}</div>
    </td>
  `;
}

function syncUrlState() {
  const searchParams = new URLSearchParams((window.location && window.location.search) || '');
  const hashParams = new URLSearchParams(((window.location && window.location.hash) || '').replace(/^#/, ''));
  const params = new URLSearchParams(searchParams);
  hashParams.forEach((v, k) => params.set(k, v));
  const t = params.get('tab');
  const q = params.get('q');
  const focus = params.get('focus');
  const mob = params.get('mob');
  const tile = params.get('tile');
  const band = params.get('band');
  const perspective = params.get('perspective');
  const studioCont = params.get('continent');
  const studioDist = params.get('district');
  const studioNode = params.get('node') || params.get('map');
  const studioMonster = params.get('monster');
  const locParam = params.get('loc');
  const zoomParam = params.get('zoom');
  const floorParam = params.get('floor');
  const filterParam = params.get('filter');
  const dungeonParam = params.get('dungeon');
  const lensParam = params.get('lens');
  const theaterParam = params.get('theater');
  const leftDrawerParam = params.get('leftDrawer');
  const sidebarParam = params.get('sidebar');
  if (sidebarParam !== null) APP_SIDEBAR_COLLAPSED = sidebarParam === '0';
  applyAppSidebarState();
  const engineParam = params.get('engine');
  const ctx3dParam = params.get('ctx3d');
  if (perspective) {
    CURRENT_TAB = 'studio';
    STUDIO_PERSPECTIVE = perspective;
  }
  if (studioCont) STUDIO_SELECTED_CONTINENT_ID = studioCont;
  if (studioDist) STUDIO_SELECTED_DISTRICT_ID = studioDist;
  if (studioNode) STUDIO_SELECTED_NODE_ID = studioNode;
  if (studioMonster) {
    STUDIO_SELECTED_MONSTER_ID = studioMonster;
    STUDIO_PINNED_MONSTER_ID = studioMonster;
  }
  if (t) CURRENT_TAB = t;
  if (q !== null) {
    SEARCH_QUERY = q;
    const inp = document.getElementById('globalSearch');
    if (inp) inp.value = q;
  }
  if (mob) {
    MAXION_SELECTED_MOB_ID = mob;
    MAXION_PINNED_MOB_ID = mob;
  }
  if (tile) {
    MAXION_SELECTED_TILE_ID = tile;
  }
  if (band) {
    MAXION_LEVEL_BAND = band;
    if (typeof ATLAS_STATE_STORE !== 'undefined') {
      const validBands = ['All', '1-20', '21-40', '41-60', '61-80', '81-99'];
      ATLAS_STATE_STORE.levelBand = validBands.includes(band) ? band : 'All';
    }
  }
  if (filterParam && typeof ATLAS_STATE_STORE !== 'undefined') {
    const validFilters = ['All', 'RaceSpawns', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'];
    ATLAS_STATE_STORE.filter = validFilters.includes(filterParam) ? filterParam : 'All';
  }
  if (lensParam && typeof ATLAS_STATE_STORE !== 'undefined') {
    const validLenses = ['gamer', 'designer', 'architect', 'developer', 'liveops'];
    const nextLens = validLenses.includes(lensParam) ? lensParam : 'gamer';
    // Same defaults as clicking the lens tab (overlay + drawers); explicit overlay/leftDrawer params below win.
    applyAtlasLensDefaults(nextLens);
    const overlayParam = params.get('overlay');
    if (overlayParam && /^[a-z0-9_]{1,48}$/.test(overlayParam)) {
      ATLAS_ACTIVE_STUDIO_BAR = overlayParam;
      ATLAS_STATE_STORE.activeStudioBar = overlayParam;
      ATLAS_DIMENSION_DRAWER_OPEN = true;
    }
    if (typeof ATLAS_PO_TELEMETRY_OPEN !== 'undefined') {
      ATLAS_PO_TELEMETRY_OPEN = nextLens === 'architect';
    }
  }
  if (theaterParam !== null && typeof ATLAS_STATE_STORE !== 'undefined') {
    ATLAS_THEATER_MODE = theaterParam === '1' || theaterParam === 'true';
    ATLAS_STATE_STORE.theaterMode = ATLAS_THEATER_MODE;
  }
  if (leftDrawerParam !== null && typeof ATLAS_STATE_STORE !== 'undefined') {
    ATLAS_LEFT_DRAWER_OPEN = leftDrawerParam === '1' || leftDrawerParam === 'true';
    ATLAS_STATE_STORE.leftDrawerOpen = ATLAS_LEFT_DRAWER_OPEN;
  }
  if (zoomParam !== null && typeof STUDIO_MAP_ZOOM !== 'undefined') {
    const zVal = parseFloat(zoomParam);
    STUDIO_MAP_ZOOM = Number.isFinite(zVal) ? Math.max(0.85, Math.min(12.0, +zVal.toFixed(2))) : 1.0;
  }
  if (typeof STUDIO_MAP_TOWN_INTERIOR !== 'undefined') {
    STUDIO_MAP_TOWN_INTERIOR = params.get('interior') === 'town';
  }
  const panParam = params.get('pan');
  if (typeof STUDIO_MAP_PAN_X !== 'undefined') {
    const pp = String(panParam || '0:0').split(':').map(Number);
    STUDIO_MAP_PAN_X = Number.isFinite(pp[0]) ? pp[0] : 0;
    STUDIO_MAP_PAN_Y = Number.isFinite(pp[1]) ? pp[1] : 0;
  }
  if (typeof ATLAS_STATE_STORE !== 'undefined') {
    // Absent params clear their state so Back/forward never leaves a blueprint the URL no longer names.
    ATLAS_STATE_STORE.activeTownId = params.get('town') || 'town-lantern-hollow';
    ATLAS_STATE_STORE.activeFieldOrFortId = params.get('field') || '';
    ATLAS_STATE_STORE.activeDungeonId = params.get('dungeon') || '';
    ATLAS_STATE_STORE.activeFloorId = params.get('floor') || '';
  }
  if (typeof clampStudioMapPan === 'function' && typeof DATA !== 'undefined') {
    clampStudioMapPan();
  }
  if (locParam && typeof clampWorldLocCoord === 'function') {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(locParam);
  }

  if (engineParam && typeof ATLAS_ENGINE_MODE !== 'undefined') {
    const validEngines = ['2d_svg', '2d_ol', '3d_map3d'];
    ATLAS_ENGINE_MODE = validEngines.includes(engineParam) ? engineParam : '2d_svg';
  }
  if (ctx3dParam !== null && typeof ATLAS_3D_STATE !== 'undefined') {
    const validCtx = ['', 'overland', 'town', 'dungeon'];
    if (validCtx.includes(ctx3dParam)) ATLAS_3D_STATE.contextOverride = ctx3dParam;
  }
  // F-155: route planner + 3D camera. Absent param = default, so Back/forward never keeps state the URL dropped.
  if (typeof ATLAS_STATE_STORE !== 'undefined' && typeof ATLAS_ROUTE_PLANNER_OPEN !== 'undefined') {
    const zoneIdRe = /^[a-z0-9][a-z0-9-]{0,95}$/;
    const rf = params.get('routeFrom');
    const rt = params.get('routeTo');
    ATLAS_ROUTE_PLANNER_OPEN = params.get('route') === '1';
    ATLAS_STATE_STORE.routePlannerOpen = ATLAS_ROUTE_PLANNER_OPEN;
    ATLAS_ROUTE_FROM_ID = rf && zoneIdRe.test(rf) ? rf : ATLAS_ROUTE_DEFAULT_FROM_ID;
    ATLAS_ROUTE_TO_ID = rt && zoneIdRe.test(rt) ? rt : ATLAS_ROUTE_DEFAULT_TO_ID;
    ATLAS_STATE_STORE.routeFromId = ATLAS_ROUTE_FROM_ID;
    ATLAS_STATE_STORE.routeToId = ATLAS_ROUTE_TO_ID;
  }
  if (typeof ATLAS_3D_STATE !== 'undefined') {
    const num = (k, dflt, lo, hi) => {
      const raw = params.get(k);
      const v = raw === null || raw === '' ? NaN : Number(raw);
      return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
    };
    const cam = ATLAS_3D_CAMERA_DEFAULTS;
    ATLAS_3D_STATE.zoom = num('zoom3d', cam.zoom, 0.45, 3.5);
    ATLAS_3D_STATE.yaw = num('yaw3d', cam.yaw, -1e6, 1e6);
    ATLAS_3D_STATE.pitch = num('pitch3d', cam.pitch, 0.2, 1.45);
    const pp3 = String(params.get('pan3d') || '').split(':');
    const px3 = pp3.length === 2 && pp3[0] !== '' ? Number(pp3[0]) : NaN;
    const py3 = pp3.length === 2 && pp3[1] !== '' ? Number(pp3[1]) : NaN;
    const ok3 = Number.isFinite(px3) && Number.isFinite(py3);
    ATLAS_3D_STATE.panX = ok3 ? Math.max(-4000, Math.min(4000, px3)) : cam.panX;
    ATLAS_3D_STATE.panY = ok3 ? Math.max(-4000, Math.min(4000, py3)) : cam.panY;
  }
  HIGHLIGHT_ENTITY_ID = focus || '';
  ATLAS_PARAMS = {};
  ATLAS_PARAM_KEYS.forEach(k => {
    const v = params.get(k);
    if (v && ATLAS_PARAM_RE.test(v)) ATLAS_PARAMS[k] = v;
  });
}

function writeUrlState(pushHistory = true) {
  const params = new URLSearchParams();
  params.set('tab', CURRENT_TAB);
  if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);
  if (HIGHLIGHT_ENTITY_ID) params.set('focus', HIGHLIGHT_ENTITY_ID);
  if (CURRENT_TAB === 'mobs' && MAXION_SELECTED_MOB_ID) params.set('mob', MAXION_SELECTED_MOB_ID);
  if (CURRENT_TAB === 'world' && MAXION_PINNED_MOB_ID) params.set('mob', MAXION_PINNED_MOB_ID);
  if (CURRENT_TAB === 'world' && MAXION_SELECTED_TILE_ID) params.set('tile', MAXION_SELECTED_TILE_ID);
  if (CURRENT_TAB === 'studio' || CURRENT_TAB === 'world') {
    if (CURRENT_TAB === 'studio') {
      params.set('perspective', STUDIO_PERSPECTIVE);
      if (STUDIO_SELECTED_CONTINENT_ID) params.set('continent', STUDIO_SELECTED_CONTINENT_ID);
      if (STUDIO_SELECTED_DISTRICT_ID) params.set('district', STUDIO_SELECTED_DISTRICT_ID);
      if (STUDIO_SELECTED_NODE_ID) {
        params.set('node', STUDIO_SELECTED_NODE_ID);
        params.set('map', STUDIO_SELECTED_NODE_ID);
      }
      if (STUDIO_SELECTED_MONSTER_ID) params.set('monster', STUDIO_SELECTED_MONSTER_ID);
    }
    if (typeof STUDIO_MAP_LOC !== 'undefined' && STUDIO_MAP_LOC) {
      const clamped = typeof clampWorldLocCoord === 'function'
        ? clampWorldLocCoord(`${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`)
        : STUDIO_MAP_LOC;
      params.set('loc', `${clamped.x}:${clamped.y}`);
    }
    if (typeof STUDIO_MAP_ZOOM !== 'undefined') {
      params.set('zoom', String(Math.max(0.85, Math.min(12.0, +STUDIO_MAP_ZOOM.toFixed(2)))));
    }
    if (typeof STUDIO_MAP_TOWN_INTERIOR !== 'undefined' && STUDIO_MAP_TOWN_INTERIOR) {
      params.set('interior', 'town');
    }
    if (typeof STUDIO_MAP_PAN_X !== 'undefined' && (STUDIO_MAP_PAN_X || STUDIO_MAP_PAN_Y)) {
      params.set('pan', `${+STUDIO_MAP_PAN_X.toFixed(1)}:${+STUDIO_MAP_PAN_Y.toFixed(1)}`);
    }
    if (typeof ATLAS_STATE_STORE !== 'undefined') {
      if (ATLAS_STATE_STORE.activeTownId) params.set('town', ATLAS_STATE_STORE.activeTownId);
      if (ATLAS_STATE_STORE.activeFieldOrFortId) params.set('field', ATLAS_STATE_STORE.activeFieldOrFortId);
    }
    if (typeof ATLAS_STATE_STORE !== 'undefined') {
      if (ATLAS_STATE_STORE.activeDungeonId) params.set('dungeon', ATLAS_STATE_STORE.activeDungeonId);
      if (ATLAS_STATE_STORE.activeFloorId) params.set('floor', ATLAS_STATE_STORE.activeFloorId);
      params.set('filter', ATLAS_STATE_STORE.filter || 'All');
      params.set('band', ATLAS_STATE_STORE.levelBand || 'All');
      params.set('lens', ATLAS_PERSONA_LENS || ATLAS_STATE_STORE.personaLens || 'gamer');
      // Overlay only when it differs from the lens default (absent = the lens default overlay).
      if (typeof ATLAS_LENS_DEFAULT_BAR !== 'undefined' && ATLAS_ACTIVE_STUDIO_BAR
          && ATLAS_ACTIVE_STUDIO_BAR !== (ATLAS_LENS_DEFAULT_BAR[ATLAS_PERSONA_LENS] || 'boss_hierarchy')) {
        params.set('overlay', ATLAS_ACTIVE_STUDIO_BAR);
      }
      if (ATLAS_ROUTE_PLANNER_OPEN) params.set('route', '1');
      if (ATLAS_ROUTE_FROM_ID && ATLAS_ROUTE_FROM_ID !== ATLAS_ROUTE_DEFAULT_FROM_ID) params.set('routeFrom', ATLAS_ROUTE_FROM_ID);
      if (ATLAS_ROUTE_TO_ID && ATLAS_ROUTE_TO_ID !== ATLAS_ROUTE_DEFAULT_TO_ID) params.set('routeTo', ATLAS_ROUTE_TO_ID);
      if (ATLAS_THEATER_MODE) params.set('theater', '1');
      params.set('leftDrawer', ATLAS_LEFT_DRAWER_OPEN ? '1' : '0');
    }
    if (APP_SIDEBAR_COLLAPSED) params.set('sidebar', '0');
    if (typeof ATLAS_ENGINE_MODE !== 'undefined') {
      params.set('engine', ATLAS_ENGINE_MODE || '2d_svg');
    }
    if (typeof ATLAS_3D_STATE !== 'undefined' && ATLAS_3D_STATE.contextOverride) {
      params.set('ctx3d', ATLAS_3D_STATE.contextOverride);
    }
    if (typeof ATLAS_3D_STATE !== 'undefined') {
      // 3D camera: only fields that differ from the default camera (absent = default).
      const cam = ATLAS_3D_CAMERA_DEFAULTS;
      const r3 = v => String(+Number(v).toFixed(3));
      if (Number.isFinite(ATLAS_3D_STATE.zoom) && r3(ATLAS_3D_STATE.zoom) !== r3(cam.zoom)) params.set('zoom3d', r3(ATLAS_3D_STATE.zoom));
      if (Number.isFinite(ATLAS_3D_STATE.yaw) && r3(ATLAS_3D_STATE.yaw) !== r3(cam.yaw)) params.set('yaw3d', r3(ATLAS_3D_STATE.yaw));
      if (Number.isFinite(ATLAS_3D_STATE.pitch) && r3(ATLAS_3D_STATE.pitch) !== r3(cam.pitch)) params.set('pitch3d', r3(ATLAS_3D_STATE.pitch));
      if (Number.isFinite(ATLAS_3D_STATE.panX) && Number.isFinite(ATLAS_3D_STATE.panY)
          && (r3(ATLAS_3D_STATE.panX) !== r3(cam.panX) || r3(ATLAS_3D_STATE.panY) !== r3(cam.panY))) {
        params.set('pan3d', `${r3(ATLAS_3D_STATE.panX)}:${r3(ATLAS_3D_STATE.panY)}`);
      }
    }
  }
  ATLAS_PARAM_KEYS.forEach(k => { if (ATLAS_PARAMS[k]) params.set(k, ATLAS_PARAMS[k]); });
  const newHash = '#' + params.toString();
  const targetUrl = (window.location && window.location.search) ? ('?' + params.toString() + newHash) : newHash;
  if (window.location.hash !== newHash || (window.location.search && window.location.search !== '?' + params.toString())) {
    if (pushHistory) history.pushState(null, '', targetUrl);
    else history.replaceState(null, '', targetUrl);
  }
}

function setDropRate(val) {
  DROP_RATE_MULT = Math.max(1, parseInt(val || '1', 10));
  render();
}

function formatDropPct(chanceBps) {
  const pct = Math.min(100, (chanceBps * DROP_RATE_MULT) / 100.0);
  return pct.toFixed(pct >= 10 ? 1 : 2) + '%';
}

function jumpToEntity(tab, entityId) {
  if (tab !== CURRENT_TAB) ATLAS_PARAMS = {};
  CURRENT_TAB = tab;
  SEARCH_QUERY = '';
  HIGHLIGHT_ENTITY_ID = entityId || '';
  const inp = document.getElementById('globalSearch');
  if (inp) inp.value = '';
  writeUrlState();
  renderSidebar();
  render();
  if (entityId) {
    setTimeout(() => {
      const el = document.getElementById('entity-' + entityId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('rms-highlight');
      }
    }, 40);
  }
}

function rmsLink(tab, id, label, extraMeta) {
  const safeId = escapeHtml(id);
  const safeLabel = escapeHtml(label || id);
  const thumbUrl = THUMB_INDEX[id];
  const thumbHtml = thumbUrl
    ? `<img class="rms-link__thumb" src="${escapeHtml(thumbUrl)}" alt="${safeLabel}" loading="lazy" />`
    : `<span class="rms-link__arrow">▸</span>`;
  const metaHtml = extraMeta ? `<span class="rms-link__rate">(${escapeHtml(extraMeta)})</span>` : '';
  return `<a class="rms-link" onclick="jumpToEntity('${tab}', '${safeId}')">${thumbHtml}<span>${safeLabel}</span>${metaHtml}</a>`;
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', cur);
  try { localStorage.setItem('joy-theme', cur); } catch (e) {}
  updateThemeButton();
}

function updateThemeButton() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = cur === 'dark' ? 'Theme: Dark' : 'Theme: Light';
}

function setPalette(val) {
  document.documentElement.setAttribute('data-palette', val);
  try { localStorage.setItem('joy-palette', val); } catch (e) {}
}

async function init() {
  updateThemeButton();
  const savedPal = document.documentElement.getAttribute('data-palette') || 'classic';
  const sel = document.getElementById('paletteSelect');
  if (sel) sel.value = savedPal;

  syncUrlState();
  window.addEventListener('hashchange', () => { syncUrlState(); renderSidebar(); render(); });
  window.addEventListener('popstate', () => { syncUrlState(); renderSidebar(); render(); });
  // registry.mjs is a deferred module: it may finish before or after the bundle fetch below.
  window.addEventListener('atlas-panels-ready', () => { if (DATA) { renderSidebar(); render(); } });
  window.addEventListener('atlas-panels-updated', () => { if (DATA) renderSidebar(); });
  const res = await fetch('/api/bundle');
  DATA = await res.json();
  buildThumbIndex();
  renderSidebar();
  render();

  const searchInput = document.getElementById('globalSearch');
  searchInput.addEventListener('input', e => {
    SEARCH_QUERY = e.target.value.trim().toLowerCase();
    HIGHLIGHT_ENTITY_ID = '';
    writeUrlState();
    render();
  });

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape') {
      if (MOBILE_NAV_OPEN) toggleMobileNavDrawer(false);
      closeInspector();
    }
  });
}

let MOBILE_NAV_OPEN = false;
function toggleMobileNavDrawer(forceState) {
  MOBILE_NAV_OPEN = typeof forceState === 'boolean' ? forceState : !MOBILE_NAV_OPEN;
  if (document.body) {
    document.body.setAttribute('data-mobile-nav-open', MOBILE_NAV_OPEN ? 'true' : 'false');
  }
  const btn = document.getElementById('mobileNavMenuBtn');
  if (btn) {
    btn.setAttribute('aria-expanded', MOBILE_NAV_OPEN ? 'true' : 'false');
  }
}

function switchTab(id) {
  if (id !== CURRENT_TAB) ATLAS_PARAMS = {};
  CURRENT_TAB = id;
  HIGHLIGHT_ENTITY_ID = '';
  toggleMobileNavDrawer(false);
  writeUrlState();
  renderSidebar();
  render();
  const st = document.getElementById('scrollStage');
  if (st) st.scrollTop = 0;
}

function renderSidebar() {
  if (!DATA) return;
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = NAV_GROUPS.map(group => `
    <div class="nav-section">${group.section}</div>
    ${group.items.map(it => `
      <div class="nav-item ${it.id === CURRENT_TAB ? 'active' : ''}" onclick="switchTab('${it.id}')">
        <span>${it.label}</span>
        <span class="nav-section-count">${it.countKey(DATA)}</span>
      </div>
    `).join('')}
  `).join('');
}

function matchesSearch(obj) {
  if (!SEARCH_QUERY) return true;
  return JSON.stringify(obj).toLowerCase().includes(SEARCH_QUERY);
}

function openInspector(kind, title, obj) {
  document.getElementById('inspectorKind').textContent = kind.toUpperCase() + ' CONTRACT';
  document.getElementById('inspectorTitle').textContent = title;
  const jsonStr = escapeHtml(JSON.stringify(obj, null, 2));
  const thumbHtml = obj?.thumbUrl
    ? `<div style="display:flex;align-items:center;gap:14px;padding:12px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);border-radius:8px">
         <img src="${escapeHtml(obj.thumbUrl)}" alt="${escapeHtml(title)}" style="width:64px;height:64px;object-fit:contain" />
         <div>
           <div style="font-weight:700">${escapeHtml(title)}</div>
           <div class="mono" style="font-size:12px;color:var(--joy-text-secondary)">${escapeHtml(obj.scenePath || obj.assetStudioKey || obj.id || '')}</div>
         </div>
       </div>`
    : '';
  document.getElementById('inspectorBody').innerHTML = `
    ${thumbHtml}
    <div class="joy-code-block">
      <div class="joy-code-block__header">
        <div class="joy-code-block__meta">
          <span class="joy-code-block__lang">JSONB</span>
          <span>Contract Payload</span>
        </div>
      </div>
      <pre style="margin:0;padding:14px;overflow-x:auto"><code>${jsonStr}</code></pre>
    </div>
  `;
  document.getElementById('inspectorBackdrop').classList.add('open');
  document.getElementById('inspectorDrawer').classList.add('open');
}

function closeInspector() {
  document.getElementById('inspectorBackdrop').classList.remove('open');
  document.getElementById('inspectorDrawer').classList.remove('open');
}

async function rebuildDb() {
  const status = document.getElementById('topbarStatus');
  status.textContent = 'Rebuilding SQLite...';
  await fetch('/api/rebuild', { method: 'POST' });
  const res = await fetch('/api/bundle');
  DATA = await res.json();
  buildThumbIndex();
  status.textContent = 'SQLite Rebuilt';
  renderSidebar();
  render();
}

async function triggerBalanceSim() {
  if (SIM_RUNNING) return;
  SIM_RUNNING = true;
  SIM_OUTPUT = 'Running cargo run --quiet --manifest-path server-rs/Cargo.toml --bin balance_sim...';
  document.getElementById('topbarStatus').textContent = 'Running Balance Sim...';
  render();
  const res = await fetch('/api/sim', { method: 'POST' });
  const payload = await res.json();
  SIM_RUNNING = false;
  SIM_OUTPUT = payload.output || '(no output)';
  document.getElementById('topbarStatus').textContent = payload.ok ? 'Balance Sim Complete' : 'Balance Sim Failed';
  render();
}

function render() {
  if (!DATA) return;
  const main = document.getElementById('mainContent');
  const titleMap = {
    studio:   'Systematic Top-Down World and Map Studio (World History and Concept ➔ Continent ➔ District ➔ Town or Hunting Area)',
    world:    'World & Continent Atlas (400×400 km · 13 Continents · Towns, Zones & Dungeons)',
    story:    'Story, 5-Act Chronology, Factions, NPCs & Quest Unlock Graph',
    bestiary: 'World Bestiary, Regional Ecology & 3D/2D Visual Briefs (116 Creatures)',
    review:   'Step 3 Review Gate Inbox — 1-Map Pilot (prontera_south_field)',
    brushes:  'Biome Brush & Smart Tag-Pool Studio (ground_id)',
    overview: 'RateMyServer Hub & Cross-Repo Telemetry',
    gear:     'Item & Card Database (item_db)',
    mobs:     'Monster Database & Spawn Drops (mob_db)',
    jobs:     'Skill & Class Branch Database (skill_db_class)',
    elements: '10-Element Property Chart & Size Matrix',
    quests:   'Quest Database & Promotion Trials (quest_db)',
    siege:    'War of Emperium (GvG Castle Siege) Calculator',
    maps:     'Map Database & Area Monster Spawns (map_db / areainfo)',
    sql:      'Live Read-Only SQLite Query Studio',
    sim:      'Authoritative Rust Balance Simulator (balance_sim)',
    docs:     'RO Writings — Architecture Specs & Lore Canon',
    'map-sheets':  'Map Sheets — mapforge world, continent and basin charts',
    'map-builder': 'Map Builder — draft, review, publish and undo world generation',
    assets:        'Asset Classes & 3D Viewer',
    audio:         'SFX & Music Soundboard',
    art:           'Concept Art',
    coverage:      'Asset Key Coverage — server type ids with no art binding',
    forge:         'Art Forge Runs & Briefs',
    'combat-lab':  'Combat Model Lab — design model (I-028)'
  };
  document.getElementById('topbarTitle').textContent = titleMap[CURRENT_TAB] || 'Observatory';
  renderSubViewBar();
  if (panelDispatch(main)) return;

  if (CURRENT_TAB === 'studio') {
    STUDIO_POI_REGISTRY = {};
    STUDIO_POI_SEQ = 0;
    main.innerHTML = renderTopDownStudio();
    if (typeof positionAtlasOmniTray === 'function') positionAtlasOmniTray();
    if (typeof updateAtlasPinHitSize === 'function') updateAtlasPinHitSize();
    if (typeof syncAtlasActiveSpatialEngine === 'function') {
      syncAtlasActiveSpatialEngine();
    }
  }
  else if (CURRENT_TAB === 'world') main.innerHTML = renderWorldAtlas();
  else if (CURRENT_TAB === 'story') main.innerHTML = renderStoryGraph();
  else if (CURRENT_TAB === 'bestiary') main.innerHTML = renderBestiary();
  else if (CURRENT_TAB === 'review') main.innerHTML = renderReviewInbox();
  else if (CURRENT_TAB === 'brushes') main.innerHTML = renderBiomeBrushes();
  else if (CURRENT_TAB === 'overview') main.innerHTML = renderOverview();
  else if (CURRENT_TAB === 'jobs') main.innerHTML = renderJobs();
  else if (CURRENT_TAB === 'mobs') main.innerHTML = renderMobs();
  else if (CURRENT_TAB === 'elements') { main.innerHTML = renderElements(); updateElemCalc(); }
  else if (CURRENT_TAB === 'gear') { main.innerHTML = renderGear(); updateRefineCalc(); }
  else if (CURRENT_TAB === 'races') main.innerHTML = renderRacesDirectory();
  else if (CURRENT_TAB === 'dungeons') main.innerHTML = renderDungeonsDirectory();
  else if (CURRENT_TAB === 'enchant') main.innerHTML = renderEnchantingForge();
  else if (CURRENT_TAB === 'quests') main.innerHTML = renderQuests();
  else if (CURRENT_TAB === 'siege') { main.innerHTML = renderSiege(); updateSiegeCalc(); }
  else if (CURRENT_TAB === 'maps') main.innerHTML = renderMapDirectory();
  else if (CURRENT_TAB === 'sql') { main.innerHTML = renderSqlStudio(); executeSql(); }
  else if (CURRENT_TAB === 'sim') main.innerHTML = renderSim();
  else if (CURRENT_TAB === 'docs') main.innerHTML = renderDocs();
}


function syncStudioNodeToDedicatedAtlas(targetNodeId, perspective = '') {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const nodes = sp.nodes || [];
  const allZones = getAllAtlas63Zones(tatlas);
  const mfDungeons = tatlas.multi_floor_dungeons || [];
  const rawId = String(targetNodeId || '');
  if (!rawId) return;

  const matchedDng = mfDungeons.find(d => d.dungeon_id === rawId || d.studio_node_id === rawId);
  if (matchedDng) {
    ATLAS_ACTIVE_DUNGEON_ID = matchedDng.dungeon_id;
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
    ATLAS_STATE_STORE.activeDungeonId = matchedDng.dungeon_id;
    ATLAS_STATE_STORE.activeFloorId = (matchedDng.floors && matchedDng.floors[0] && matchedDng.floors[0].floor_id) || 'B1';
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    if (matchedDng.entrance_loc) {
      STUDIO_MAP_LOC = resolveAtlasFocusLoc(matchedDng.entrance_loc, matchedDng.dungeon_id, matchedDng.studio_node_id);
    }
    return;
  }

  const matchedZone = allZones.find(z => z.zone_id === rawId || z.studio_node_id === rawId);
  const matchedNode = nodes.find(n => n.id === rawId);
  const isTown = (matchedZone && matchedZone.actionType === 'town')
    || (matchedNode && matchedNode.node_type === 'town')
    || rawId.startsWith('town-')
    || rawId.startsWith('zone-town-');
  const isFieldOrFort = (matchedZone && (matchedZone.actionType === 'field' || matchedZone.actionType === 'fortress'))
    || (matchedNode && matchedNode.node_type === 'hunting_area')
    || rawId.startsWith('hunting-area-')
    || rawId.startsWith('zone-field-')
    || rawId.startsWith('zone-harbor-')
    || rawId.startsWith('zone-clanhall-')
    || rawId.startsWith('zone-fortress-');

  if (isTown) {
    ATLAS_FOCUSED_TOWN_ID = (matchedZone && (matchedZone.studio_node_id || matchedZone.zone_id)) || rawId;
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
    ATLAS_ACTIVE_DUNGEON_ID = '';
    ATLAS_STATE_STORE.activeTownId = ATLAS_FOCUSED_TOWN_ID;
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    if (matchedZone && matchedZone.loc_coord) {
      STUDIO_MAP_LOC = resolveAtlasFocusLoc(matchedZone.loc_coord, matchedZone.zone_id, matchedZone.studio_node_id);
    }
  } else if (isFieldOrFort) {
    const resolvedFieldId = (matchedZone && matchedZone.zone_id) || rawId;
    if (resolvedFieldId.includes('fortress') || resolvedFieldId.includes('harbor') || resolvedFieldId.includes('clanhall')) {
      ATLAS_FOCUSED_FORTRESS_ID = resolvedFieldId;
    } else {
      ATLAS_FOCUSED_FIELD_ID = resolvedFieldId;
    }
    ATLAS_ACTIVE_DUNGEON_ID = '';
    ATLAS_STATE_STORE.activeFieldOrFortId = resolvedFieldId;
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    if (matchedZone && matchedZone.loc_coord) {
      STUDIO_MAP_LOC = resolveAtlasFocusLoc(matchedZone.loc_coord, matchedZone.zone_id, matchedZone.studio_node_id);
    }
  }
}

function setStudioPerspective(perspective, opts = {}) {
  CURRENT_TAB = 'studio';
  STUDIO_PERSPECTIVE = perspective;
  if (opts.continentId) STUDIO_SELECTED_CONTINENT_ID = opts.continentId;
  if (opts.districtId) STUDIO_SELECTED_DISTRICT_ID = opts.districtId;
  if (opts.nodeId) STUDIO_SELECTED_NODE_ID = opts.nodeId;
  if (opts.monsterId !== undefined) STUDIO_SELECTED_MONSTER_ID = opts.monsterId;
  if (opts.pinnedMonsterId !== undefined) STUDIO_PINNED_MONSTER_ID = opts.pinnedMonsterId;
  if (opts.levelBand) STUDIO_LEVEL_BAND = opts.levelBand;
  if (opts.inspectId) STUDIO_ACTIVE_INSPECT_ID = opts.inspectId;
  syncStudioNodeToDedicatedAtlas(opts.nodeId || opts.inspectId || STUDIO_SELECTED_NODE_ID, perspective);
  writeUrlState();
  renderSidebar();
  render();
}

function setStudioStatusFilter(status) {
  STUDIO_STATUS_FILTER = status;
  render();
}

function renderStatusBadgeHtml(status) {
  const s = (status || 'draft').toLowerCase();
  if (s === 'canon') {
    return '<span class="joy-badge joy-badge--success joy-badge--sm">🟢 Canon</span>';
  }
  if (s === 'mystery') {
    return '<span class="joy-badge joy-badge--neutral joy-badge--sm">🟣 Mystery (Fog of Lore)</span>';
  }
  return '<span class="joy-badge joy-badge--warning joy-badge--sm">🟡 Draft</span>';
}

async function submitStudioRationaleUpdate(nodeId, patchPayload) {
  const statusEl = document.getElementById('studioDrawerStatusMsg');
  if (statusEl) statusEl.textContent = 'Saving studio update...';
  const res = await fetch('/api/studio/rationale/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, ...patchPayload })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    if (statusEl) {
      statusEl.style.color = '#f87171';
      statusEl.textContent = data.error || 'Failed to update studio node.';
    }
    return;
  }
  if (data.studioPerspectives) {
    DATA.studioPerspectives = data.studioPerspectives;
  }
  render();
  const afterEl = document.getElementById('studioDrawerStatusMsg');
  if (afterEl) {
    afterEl.style.color = '#34d399';
    afterEl.textContent = 'Saved & snapshot recorded (' + ((data.snapshot && data.snapshot.id) || 'ok') + ').';
  }
}

async function saveStudioRationaleForm(nodeId) {
  const ratEl = document.getElementById('studioRationaleTextarea');
  const stEl = document.getElementById('studioStatusSelect');
  const rumorEl = document.getElementById('studioMysteryRumorInput');
  const silEl = document.getElementById('studioMysterySilhouetteInput');
  const qEl = document.getElementById('studioMysteryQuestionInput');
  const payload = {};
  if (ratEl) payload.core_rationale = ratEl.value;
  if (stEl) payload.status = stEl.value;
  if (rumorEl || silEl || qEl) {
    payload.mystery_hook = {
      in_world_rumor: rumorEl ? rumorEl.value : '',
      visual_silhouette: silEl ? silEl.value : '',
      unanswered_question: qEl ? qEl.value : ''
    };
  }
  await submitStudioRationaleUpdate(nodeId, payload);
}

async function toggleStudioQualityPillar(nodeId, pillarKey, verified, currentEvidence) {
  const ev = (currentEvidence && currentEvidence.length >= 15)
    ? currentEvidence
    : 'Verified against 90 to 120 centimeter scale and parent rationale.';
  await submitStudioRationaleUpdate(nodeId, {
    quality_checklist: {
      [pillarKey]: { verified: !!verified, evidence: ev }
    }
  });
}

async function triggerStudioChildGeneration(parentId) {
  const statusEl = document.getElementById('studioDrawerStatusMsg');
  const childNameEl = document.getElementById('studioChildNameInput');
  const childName = (childNameEl && childNameEl.value.trim()) || 'Uncharted Horizon Sector';
  if (statusEl) statusEl.textContent = 'Validating parent Canon & 5-pillar gate...';
  const res = await fetch('/api/studio/generate-children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId, childName, childStatus: 'mystery', persist: false })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    if (statusEl) {
      statusEl.style.color = '#f87171';
      statusEl.textContent = data.error || 'Child generation blocked.';
    }
    return;
  }
  if (statusEl) {
    statusEl.style.color = '#34d399';
    statusEl.textContent = 'Generated ' + data.childLayer + ' candidate: ' + data.childNode.id + ' (' + data.childNode.status + ')';
  }
  openInspector(data.childLayer, 'Generated Child Preview: ' + data.childNode.name, data.childNode);
}

async function undoStudioSnapshotAction() {
  const res = await fetch('/api/studio/undo', { method: 'POST' });
  const data = await res.json();
  const bundleRes = await fetch('/api/studio/perspectives');
  const bundleData = await bundleRes.json();
  if (bundleData.ok) {
    DATA.studioPerspectives = bundleData;
  }
  render();
  const statusEl = document.getElementById('studioDrawerStatusMsg');
  if (statusEl) {
    statusEl.style.color = data.ok ? '#34d399' : '#f87171';
    statusEl.textContent = data.ok ? ('Reverted snapshot ' + data.restoredSnapshot) : (data.error || 'Nothing to undo.');
  }
}

function renderQualityChecklistCardHtml(node) {
  const nodeId = (node && node.id) || '';
  const curStatus = (node && node.status) || 'draft';
  const qc = (node && node.quality_checklist) || {};
  const mh = (node && node.mystery_hook) || {};
  const labels = [
    ['causal_continuity', '1. Causal Continuity (Parent-to-Child Link)'],
    ['fantasy_and_wonder', '2. Fantasy and Wonder (Distinct High-Fantasy Hook)'],
    ['character_scale_consistency', '3. Character Scale Consistency (90 to 120 Centimeter Law)'],
    ['spatial_and_ecological_consistency', '4. Spatial and Ecological Consistency'],
    ['intentional_mystery_discipline', '5. Intentional Mystery Discipline (Zero Filler Slop)'],
  ];
  const passedCount = labels.filter(([k]) => qc[k] && qc[k].verified).length;
  const isLeaf = Boolean(node && node.node_type);

  return `
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px">
      <!-- Interactive Core Rationale & Status Editor -->
      <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:12px">Human-in-the-Loop Rationale &amp; Status Gate</strong>
          <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="undoStudioSnapshotAction()">
            ↶ Undo Last Snapshot
          </button>
        </div>

        <label class="mono" style="display:block;font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">NODE STATUS (CANON REQUIRES 5/5 CHECKLIST + CANON PARENT)</label>
        <select id="studioStatusSelect" class="joy-select">
          <option value="canon" ${curStatus === 'canon' ? 'selected' : ''}>🟢 Canon (Approved for Downward Generation)</option>
          <option value="draft" ${curStatus === 'draft' ? 'selected' : ''}>🟡 Draft (Work in Progress)</option>
          <option value="mystery" ${curStatus === 'mystery' ? 'selected' : ''}>🟣 Mystery / Fog of Lore (Intentional Uncharted Hook)</option>
        </select>

        <label class="mono" style="display:block;font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">CORE RATIONALE (MINIMUM 20 CHARACTERS)</label>
        <textarea id="studioRationaleTextarea" rows="3" style="width:100%;padding:8px;border-radius:6px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-default);font-size:11.5px;margin-bottom:8px">${escapeHtml((node && node.core_rationale) || '')}</textarea>

        <div style="padding:8px;border-radius:6px;background:rgba(168,85,247,0.08);border:1px dashed rgba(168,85,247,0.4);margin-bottom:8px">
          <div class="mono" style="font-size:10px;color:#c084fc;margin-bottom:4px">INTENTIONAL MYSTERY / FOG OF LORE HOOK</div>
          <input id="studioMysteryRumorInput" type="text" placeholder="In-world rumor..." value="${escapeHtml(mh.in_world_rumor || '')}" style="width:100%;padding:5px 7px;border-radius:4px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11px;margin-bottom:4px" />
          <input id="studioMysterySilhouetteInput" type="text" placeholder="Visual silhouette..." value="${escapeHtml(mh.visual_silhouette || '')}" style="width:100%;padding:5px 7px;border-radius:4px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11px;margin-bottom:4px" />
          <input id="studioMysteryQuestionInput" type="text" placeholder="Unanswered question..." value="${escapeHtml(mh.unanswered_question || '')}" style="width:100%;padding:5px 7px;border-radius:4px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11px" />
        </div>

        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="saveStudioRationaleForm('${escapeHtml(nodeId)}')">
          Save Rationale, Mystery Hook &amp; Status
        </button>
        <div id="studioDrawerStatusMsg" class="mono" style="font-size:10.5px;margin-top:6px;min-height:14px;color:var(--joy-text-secondary)"></div>
      </div>

      <!-- Step-by-Step Five-Pillar Quality Checklist -->
      <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:12px">Step-by-Step Five-Pillar Quality Checklist</strong>
          <span class="joy-badge ${passedCount === 5 ? 'joy-badge--success' : 'joy-badge--warning'} joy-badge--sm">${passedCount} / 5 Verified</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${labels.map(([k, title]) => {
            const item = qc[k] || { verified: false, evidence: 'Not verified yet.' };
            const safeEv = escapeHtml(item.evidence || '').replace(/'/g, "\'");
            return `
              <label style="padding:7px 9px;border-radius:6px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle);font-size:11.5px;cursor:pointer;display:block">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                  <span style="font-weight:700;color:${item.verified ? '#34d399' : '#fbbf24'};display:flex;align-items:center;gap:6px">
                    <input type="checkbox" ${item.verified ? 'checked' : ''} onchange="toggleStudioQualityPillar('${escapeHtml(nodeId)}', '${k}', this.checked, '${safeEv}')" />
                    ${escapeHtml(title)}
                  </span>
                  <span class="mono" style="font-size:10px">${item.verified ? 'VERIFIED' : 'PENDING'}</span>
                </div>
                <div style="color:var(--joy-text-secondary);margin-top:3px;font-size:11px">${escapeHtml(item.evidence || '')}</div>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Top-Down Child Layer Generation Gate -->
      ${!isLeaf ? `
        <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
          <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">
            TOP-DOWN CHILD LAYER GENERATION GATE
          </div>
          <input id="studioChildNameInput" type="text" placeholder="New child region name..." value="Uncharted Horizon Sector" style="width:100%;padding:6px 8px;border-radius:6px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11.5px;margin-bottom:8px" />
          <button type="button" class="joy-button ${curStatus === 'canon' && passedCount === 5 ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="triggerStudioChildGeneration('${escapeHtml(nodeId)}')">
            ${curStatus === 'canon' && passedCount === 5 ? '✨ Generate Child Layer Candidate ➔' : '🔒 Child Generation Locked (Requires Canon + 5/5 Checklist)'}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTopDownStudio() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const whc = sp.worldHistoryAndConcept || {};
  const continents = sp.continents || [];
  const districts = sp.districts || [];
  const nodes = sp.nodes || [];

  const activeContinent = continents.find(c => c.id === STUDIO_SELECTED_CONTINENT_ID) || continents[0] || {};
  const activeDistrict = districts.find(d => d.id === STUDIO_SELECTED_DISTRICT_ID) || districts[0] || {};
  const activeNode = nodes.find(n => n.id === STUDIO_SELECTED_NODE_ID) || nodes[0] || {};

  const isPerspOpen = Boolean(
    (typeof ATLAS_PERSPECTIVE_BAR_OPEN !== 'undefined' && ATLAS_PERSPECTIVE_BAR_OPEN)
    || (typeof ATLAS_PERSONA_LENS !== 'undefined' && ATLAS_PERSONA_LENS === 'architect')
  );
  const perspectiveBar = `
    <div id="perspectiveBar" style="position:sticky;top:0;z-index:20;display:${isPerspOpen ? 'flex' : 'none'};flex-wrap:nowrap;justify-content:space-between;align-items:center;gap:6px;padding:3px 10px;margin-bottom:2px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:8px;overflow-x:auto;scrollbar-width:none">
      <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'world-history-and-concept' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('world-history-and-concept', { inspectId: '${escapeHtml(whc.id || '')}' })">
        🌌 World History and Concept
      </button>
      <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'continent' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('continent', { inspectId: '${escapeHtml(activeContinent.id || '')}' })">
        🌍 Continent (${escapeHtml(activeContinent.name || 'Continent')})
      </button>
      <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'district' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('district', { inspectId: '${escapeHtml(activeDistrict.id || '')}' })">
        🗺️ District (${escapeHtml(activeDistrict.name || 'District')})
      </button>
      <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'town-or-hunting-area' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { inspectId: '${escapeHtml(activeNode.id || '')}' })">
        📍 Town or Hunting Area (${escapeHtml(activeNode.name || 'Map')})
      </button>
      ${isPerspOpen ? `
        <span class="mono" style="font-size:10px;color:var(--joy-text-secondary)">Filter Status:</span>
        ${['all', 'canon', 'draft', 'mystery'].map(st => `
          <button type="button" class="joy-button ${STUDIO_STATUS_FILTER === st ? 'joy-button--solid' : 'joy-button--ghost'} joy-button--sm" onclick="setStudioStatusFilter('${st}')">
            ${st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
          </button>
        `).join('')}
      ` : ''}
      <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${isPerspOpen ? 'true' : 'false'}" onclick="toggleAtlasPerspectiveBar()">
        ${isPerspOpen ? 'Hide' : 'Status'}
      </button>
    </div>
  `;

  let canvasHtml = '';
  if (STUDIO_PERSPECTIVE === 'world-history-and-concept') {
    canvasHtml = renderStudioWorldHistoryPerspective(whc, continents);
  } else if (STUDIO_PERSPECTIVE === 'continent') {
    canvasHtml = renderStudioContinentPerspective(whc, continents, districts, activeContinent);
  } else if (STUDIO_PERSPECTIVE === 'district') {
    canvasHtml = renderStudioDistrictPerspective(activeContinent, districts, nodes, activeDistrict);
  } else {
    canvasHtml = renderStudioTownOrHuntingAreaPerspective(activeDistrict, nodes, activeNode);
  }

  const selfEval = sp.selfEvaluation || {};
  const ts = selfEval.turnSpeedTelemetry || {};
  const qs = selfEval.qualityScorecard || {};
  const atlasTel = selfEval.atlasIterationTelemetry || {};
  const atlasScoreStr = typeof atlasTel.overallScore === 'number' ? atlasTel.overallScore.toFixed(1) : '100.0';
  const queue = selfEval.nextIncrementBrainstormQueue || [];
  const canonCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'canon').length;
  const draftCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'draft').length;
  const mysteryCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'mystery').length;

  const isPoOpen = typeof ATLAS_PO_TELEMETRY_OPEN !== 'undefined' ? ATLAS_PO_TELEMETRY_OPEN : false;
  const ownerTelemetryBar = `
    <div id="productOwnerTelemetryBar" style="display:flex;flex-direction:column;gap:0px;padding:7px 14px;margin-top:6px;margin-bottom:10px;background:#0d1624;border:1px solid rgba(218,179,98,0.28);border-radius:10px;font-size:11px">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;width:100%">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="mono" style="font-weight:900;color:#dab362">🏛️ 108D Studio Scorecard: ${atlasScoreStr}/100 · 63 Zones · 5 Persona Lenses</span>
          <span class="joy-badge joy-badge--success joy-badge--sm">Quality Score: ${qs.overallQualityScorePct ?? 100}%</span>
          <span class="mono" style="color:#94a3b8;font-size:10.5px">Nodes: 🟢 ${canonCount} Canon · 🟡 ${draftCount} Draft · 🟣 ${mysteryCount} Mystery</span>
        </div>
        <button type="button" onclick="toggleAtlasPoTelemetryBar()" aria-expanded="${isPoOpen ? 'true' : 'false'}"
                style="padding:3px 10px;border-radius:6px;border:1px solid rgba(218,179,98,0.45);background:#14253e;color:#fde68a;font-size:10px;font-weight:800;cursor:pointer">
          ${isPoOpen ? '▲ Collapse Full 108D Telemetry' : '▼ Expand Full 108D Telemetry'}
        </button>
      </div>
      <div id="productOwnerTelemetryBody" style="display:${isPoOpen ? 'flex' : 'none'};flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;width:100%;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
        ${isPoOpen ? `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
          <span class="mono" style="font-weight:800;color:#38bdf8">🏛️ PRODUCT OWNER SELF-EVALUATION:</span>
          <span class="joy-badge joy-badge--success joy-badge--sm">108-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 106-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 104-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 102-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 100-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 98-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 96-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 94-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 92-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 90-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 88-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 86-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 84-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 82-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 80-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 78-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 76-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 74-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 72-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 70-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 68-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 66-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 64-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 62-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 60-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 58-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 56-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 54-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 52-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 50-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 48-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 46-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 44-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 42-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 40-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 38-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 36-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 34-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 32-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 30-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 28-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 26-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 24-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 22-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 20-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 18-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · D1–D50 · D1–D54 · D1–D56 · D1–D58 · D1–D60 · D1–D62 · D1–D64 · D1–D66 · D1–D68 · D1–D70 Verified · D1–D72 Verified · D1–D74 Verified · D1–D76 Verified · D1–D78 Verified · D1–D80 Verified · D1–D82 Verified · D1–D84 Verified · D1–D86 Verified · D1–D88 Verified · D1–D90 Verified · D1–D92 Verified · D1–D94 Verified · D1–D96 Verified · D1–D98 Verified · D1–D100 Verified · D1–D102 Verified · D1–D104 Verified · D1–D106 Verified · D1–D108 Verified</span>
          <span class="joy-badge joy-badge--brand joy-badge--sm">Turn Speed: ${ts.totalElapsedMs ? ts.totalElapsedMs + ' ms (' + (ts.speedGrade || 'Fast') + ')' : 'Fast Cached'}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
          <span class="mono" style="font-size:10.5px;color:var(--joy-text-secondary)">NEXT INCREMENT QUEUE:</span>
          ${queue.slice(0, 3).map(item => `
            <span class="mono" style="font-size:10.5px;padding:2px 8px;border-radius:999px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle)">
              ${escapeHtml(item.name)} (${item.verifiedPillarsCount}/5 · ${escapeHtml(item.recommendedLeadRole)})
            </span>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  `;

  return `${perspectiveBar}${canvasHtml}${ownerTelemetryBar}`;
}

// ============================================================================
// L2HUB ADEN PARCHMENT ATLAS + GOOGLE / APPLE MAPS 2D CARTOGRAPHIC EXPLORER
// + DEDICATED SEMANTIC-ZOOM WORLD, TOWN & MULTI-FLOOR DUNGEON ATLAS COMPONENT
// ============================================================================
let STUDIO_CARTO_THEME = 'l2hub'; // 'l2hub' (L2 Aden Parchment) | 'google' (Google/Apple Dark GIS)
let STUDIO_MAP_ZOOM = 1.0;
// Explicit Town Street interior: only focusTownStreetBlueprint (5.2x lens) enters it; wheel/+/- never do.
let STUDIO_MAP_TOWN_INTERIOR = false;
// Coordinate space the current pan belongs to ('overland' | 'town:<id>' | 'field:<id>' | 'dungeon:<id>').
let STUDIO_MAP_PAN_SPACE = null;
// World-space pin anchors of the overland landmarks, registered at render: 'id:<zone/node id>' and 'loc:<x:y>' keys.
const ATLAS_OVERLAND_PIN_ANCHORS = {};
let STUDIO_MAP_PAN_X = 0;
let STUDIO_MAP_PAN_Y = 0;
let STUDIO_MAP_SELECTED_POI = null;
let STUDIO_MAP_DRAG = null;
let STUDIO_MAP_LOC = { x: -84120, y: 243500, svgX: 465, svgY: 442 };

let ATLAS_FOCUSED_TOWN_ID = 'town-lantern-hollow';
let ATLAS_FOCUSED_FIELD_ID = '';
let ATLAS_FOCUSED_FORTRESS_ID = '';
let ATLAS_ACTIVE_DUNGEON_ID = '';
let ATLAS_OMNI_SEARCH_QUERY = '';
const ATLAS_ROUTE_DEFAULT_FROM_ID = 'zone-town-lantern-hollow';
const ATLAS_ROUTE_DEFAULT_TO_ID = 'zone-dungeon-kiln-cellar';
let ATLAS_ROUTE_FROM_ID = ATLAS_ROUTE_DEFAULT_FROM_ID;
let ATLAS_ROUTE_TO_ID = ATLAS_ROUTE_DEFAULT_TO_ID;
let ATLAS_REFINE_GRADE = 'No-Grade Lv.1–19';
let ATLAS_REFINE_PLUS = 3;
let ATLAS_BOSS_GOD_ID = 'god-sola-hearth-weaver';
let ATLAS_QUEST_TRACK = 'All';
let ATLAS_ACTIVE_QUEST_ID = 'quest-ms-01-human';
let ATLAS_FARMING_MODE = 'All';
let ATLAS_SIEGE_DOMAIN_ID = 'All';
let ATLAS_BOSS_RADAR_MODE = 'All';
let ATLAS_SEVEN_SEALS_MODE = 'All';
let ATLAS_MANOR_MODE = 'All';
let ATLAS_OLYMPIAD_MODE = 'All';
let ATLAS_TRANSIT_MODE = 'All';
let ATLAS_SOUL_CRYSTAL_MODE = 'All';
let ATLAS_FISHING_MODE = 'All';
let ATLAS_PVP_KARMA_MODE = 'All';
let ATLAS_RIFT_SEPULCHER_MODE = 'All';
let ATLAS_AUGMENT_DYE_MODE = 'All';
let ATLAS_COMPANION_MOUNT_MODE = 'All';
let ATLAS_CLAN_ACADEMY_MODE = 'All';
let ATLAS_HERB_BIOME_MODE = 'All';
let ATLAS_WORKSHOP_MODE = 'All';
let ATLAS_TERRITORY_WARD_MODE = 'All';
let ATLAS_EPIC_JEWELRY_MODE = 'All';
let ATLAS_VITALITY_OBELISK_MODE = 'All';
let ATLAS_ARMOR_SET_MODE = 'All';
let ATLAS_KAMALOKA_MODE = 'All';
let ATLAS_SKILL_SCROLL_MODE = 'All';
let ATLAS_ELEMENTAL_QUARRY_MODE = 'All';
let ATLAS_CLAN_HALL_MODE = 'All';
let ATLAS_TRANSFORMATION_MODE = 'All';
let ATLAS_WAREHOUSE_MODE = 'All';
let ATLAS_MASTER_TOUR_MODE = 'All';
let ATLAS_FESTIVAL_ORACLE_MODE = 'All';
let ATLAS_LUXURY_MARKET_MODE = 'All';
let ATLAS_FACTION_ALLIANCE_MODE = 'All';
let ATLAS_FANTASY_PLAZA_MODE = 'All';
let ATLAS_HERO_WEAPON_MODE = 'All';
let ATLAS_TREASURE_CHEST_MODE = 'All';
let ATLAS_AERIAL_DOCK_MODE = 'All';
let ATLAS_BELT_CLOAK_MODE = 'All';
let ATLAS_WEDDING_MODE = 'All';
let ATLAS_COUNCIL_BENCHMARK_MODE = 'All';
let ATLAS_SEED_CYCLE_MODE = 'All';
let ATLAS_COLISEUM_TOURNAMENT_MODE = 'All';
let ATLAS_ELEMENTAL_JEWEL_MODE = 'All';
let ATLAS_FAME_MONUMENT_MODE = 'All';
let ATLAS_DELUSION_CHAMBER_MODE = 'All';
let ATLAS_COMMAND_RAID_MODE = 'All';
let ATLAS_NEVIT_BLESSING_MODE = 'All';
let ATLAS_COUNCIL_SIGNOFF_MODE = 'All';
let ATLAS_CHAMPION_MOB_MODE = 'All';
let ATLAS_DUALSWORD_FORGE_MODE = 'All';
let ATLAS_TECH_ART_PIPELINE_MODE = 'All';
let ATLAS_BOT_SWARM_SIM_MODE = 'All';
let ATLAS_LIVEOPS_GM_MODE = 'All';
let ATLAS_TOOLS_SQUAD_MODE = 'All';
let ATLAS_DIALOGUE_GRAPH_MODE = 'All';
let ATLAS_SPAWNER_BALANCER_MODE = 'All';
let ATLAS_SKILL_TIMELINE_MODE = 'All';
let ATLAS_BUILD_FARM_MODE = 'All';
let ATLAS_ARCHITECT_DX_MODE = 'All';
let ATLAS_TWO_RING_SIGNOFF_MODE = 'All';
let ATLAS_WEATHER_ACOUSTIC_MODE = 'All';
let ATLAS_SERVER_MESH_MODE = 'All';
let ATLAS_ANTI_BOT_MODE = 'All';
let ATLAS_GODOT_STORYBOOK_MODE = 'All';
let ATLAS_NAVMESH_MODE = 'All';
let ATLAS_LIVEOPS_FLAGS_MODE = 'All';
let ATLAS_CINEMATIC_RAILS_MODE = 'All';
let ATLAS_GPU_BUDGET_MODE = 'All';
let ATLAS_QA_SUITES_MODE = 'All';
let ATLAS_STUDIO_90D_MODE = 'All';
let ATLAS_FACTION_DISPOSITION_MODE = 'All';
let ATLAS_AUCTION_ESCROW_MODE = 'All';
let ATLAS_WORLD_INCURSION_MODE = 'All';
let ATLAS_CLAN_TREASURY_MODE = 'All';
let ATLAS_HOUSING_ESTATES_MODE = 'All';
let ATLAS_CDN_WEBRTC_MODE = 'All';
let ATLAS_CARAVAN_ROUTES_MODE = 'All';
let ATLAS_LOCALIZATION_VO_MODE = 'All';
let ATLAS_HOT_RELOAD_BRIDGE_MODE = 'All';
let ATLAS_CENTENNIAL_100D_MODE = 'All';
let ATLAS_NOCTURNAL_AFFIX_MODE = 'All';
let ATLAS_COMBAT_REPLAY_MODE = 'All';
let ATLAS_LORE_CODEX_MODE = 'All';
let ATLAS_PHYSICS_BIOME_MODE = 'All';
let ATLAS_BOUNTY_MANHUNT_MODE = 'All';
let ATLAS_PITR_CHAOS_MODE = 'All';
let ATLAS_TAVERN_HUBS_MODE = 'All';
let ATLAS_CHURN_INTERVENTION_MODE = 'All';
let SELECTED_ANTI_BOT_SENTINEL_ID = '';
let SELECTED_GODOT_STORYBOOK_PREFAB_ID = '';
let SELECTED_NAVMESH_SECTOR_ID = '';
let SELECTED_LIVEOPS_FLAG_ID = '';
let SELECTED_CINEMATIC_RAIL_ID = '';
let SELECTED_GPU_BUDGET_ID = '';
let SELECTED_QA_SUITE_ID = '';
let SELECTED_STUDIO_90D_LEDGER_ID = '';
let SELECTED_FACTION_DISPOSITION_ID = '';
let SELECTED_CROSS_REALM_ESCROW_ID = '';
let SELECTED_WORLD_INCURSION_ID = '';
let SELECTED_CLAN_TREASURY_ID = '';
let SELECTED_HOUSING_ESTATE_ID = '';
let SELECTED_CDN_WEBRTC_RELAY_ID = '';
let SELECTED_CARAVAN_ROUTE_ID = '';
let SELECTED_LOCALIZATION_VO_BANK_ID = '';
let SELECTED_CROSS_TOOL_BRIDGE_ID = '';
let SELECTED_CENTENNIAL_100D_CHARTER_ID = '';
let SELECTED_NOCTURNAL_AFFIX_SPAWN_ID = '';
let SELECTED_DETERMINISTIC_COMBAT_REPLAY_ID = '';
let SELECTED_ARCHAEOLOGICAL_CODEX_ID = '';
let SELECTED_DESTRUCTIBLE_PHYSICS_BIOME_ID = '';
let SELECTED_BOUNTY_MANHUNT_CONTRACT_ID = '';
let SELECTED_DISASTER_RECOVERY_DRILL_ID = '';
let SELECTED_TAVERN_SOCIAL_HUB_ID = '';
let SELECTED_CHURN_INTERVENTION_ID = '';
let ANTI_BOT_SENTINELS = [];
let GODOT_STORYBOOK_PREFABS = [];
let NAVMESH_OBSTACLE_SECTORS = [];
let LIVEOPS_EVENT_FLAGS = [];
let CINEMATIC_CAMERA_RAILS = [];
let CLIENT_GPU_BUDGETS = [];
let AUTOMATED_QA_SUITES = [];
let STUDIO_90D_LEDGER = [];
let FACTION_DISPOSITIONS = [];
let CROSS_REALM_ESCROWS = [];
let WORLD_INVASION_INCURSIONS = [];
let CLAN_TREASURY_LEDGERS = [];
let PLAYER_HOUSING_ESTATES = [];
let GLOBAL_CDN_RELAYS = [];
let CARAVAN_TRADE_ROUTES = [];
let LOCALIZATION_VO_BANKS = [];
let CROSS_TOOL_BRIDGES = [];
let CENTENNIAL_100D_CHARTERS = [];
let NOCTURNAL_AFFIX_SPAWNS = [];
let DETERMINISTIC_COMBAT_REPLAYS = [];
let ARCHAEOLOGICAL_CODICES = [];
let DESTRUCTIBLE_PHYSICS_BIOMES = [];
let BOUNTY_MANHUNT_CONTRACTS = [];
let DISASTER_RECOVERY_DRILLS = [];
let TAVERN_SOCIAL_HUBS = [];
let CHURN_INTERVENTIONS = [];

const ATLAS_STATE_STORE = {
  filter: 'All',         // 'All' | 'RaceSpawns' | 'TownMarks' | 'Monster' | 'Mini-Boss' | 'Raid' | 'MVP'
  levelBand: 'All',      // 'All' | '1-20' | '21-40' | '41-60' | '61-80' | '81-99'
  raceGrowthRoute: 'All', // 'All' | 'Human' | 'Lunar' | 'Ogre/Orc' | 'Dwarf' | 'Dark-Lunar' | 'Furral'
  omniSearchQuery: '',   // D13: Instant Atlas Omni-Search & Quick-Jump Query
  routeFromId: 'zone-town-lantern-hollow', // D17: Interactive Travel Path & Gatekeeper Route Origin
  routeToId: 'zone-dungeon-kiln-cellar',   // D17: Interactive Travel Path & Gatekeeper Route Destination
  refineGrade: 'No-Grade Lv.1–19',         // D19: Active Blacksmith Refinement Equipment Grade
  refinePlus: 3,                           // D19: Active Blacksmith Refinement Step (+1..+15)
  bossGodId: 'god-sola-hearth-weaver',     // D21: Active Sealed-God 5-Tier Boss Hierarchy Chain
  questTrack: 'All',                       // D23: Active Quest Track ('All' | 'main_story' | 'class_transfer' | 'racial_heritage')
  activeQuestId: 'quest-ms-01-human',      // D23: Active 3-Track Quest & Class Transfer Chain
  farmingMode: 'All',                      // D24: Active Party & Farming Efficiency Heatmap ('Off' | 'All' | 'solo_grinding' | 'duo_spoil_scavenger' | 'full_9p_aoe_party' | 'clan_raid_force')
  siegeDomainId: 'All',                    // D25: Active Castle Siege & Territory Tax Domain ('Off' | 'All' | domain_id)
  bossRadarMode: 'All',                    // D26: Active World Boss & MVP Respawn Radar ('Off' | 'All' | 'DungeonMVP' | 'OverlandRaid')
  sevenSealsMode: 'All',                   // D27: Active Seven-Seals & Mammon Rotation ('Off' | 'All' | 'Lords_of_Dawn' | 'Revolutionaries_of_Dusk' | 'Blacksmith_of_Mammon' | 'Merchant_of_Mammon')
  manorMode: 'All',                        // D28: Active 15-Town Manor Seed & Caravan Economy ('Off' | 'All' | 'Low_Patrolled' | 'High_Frontier_Ambush')
  olympiadMode: 'All',                     // D29: Active Subclass, Noblesse & Olympiad Network ('Off' | 'All' | 'Subclass_Mimir_Sanctum' | 'Noblesse_Barakiel_Shrine' | 'Olympiad_Monument')
  transitMode: 'All',                      // D30: Active Inter-Continental Transit ('Off' | 'All' | 'Maritime_Ship' | 'Brass_Airship' | 'Gatekeeper_Trunk')
  soulCrystalMode: 'All',                  // D31: Active Soul Crystal (SA) Stage 1-13 Selector ('Off' | 'All' | 'Crimson_Red' | 'Verdant_Green' | 'Azure_Blue' | 'Stage_11_to_13_S_Grade_Boss')
  fishingMode: 'All',                      // D32: Active Fishing Guild & Hot Springs Selector ('Off' | 'All' | 'Maritime_Harbor_Pier' | 'Luminous_Night_Lake' | 'Thermal_Hot_Spring')
  pvpKarmaMode: 'All',                     // D33: Active Cursed Weapon, PK & PvP Arena Selector ('Off' | 'All' | 'Cursed_Weapon_Drop_Zone' | 'Black_Judge_Karma_Sanctuary' | 'Coliseum_PvP_Arena')
  riftSepulcherMode: 'All',                // D34: Active Dimensional Rift & Four Sepulchers Selector ('Off' | 'All' | 'Dimensional_Rift' | 'Four_Sepulchers' | 'Key_Gated_Chapel')
  augmentDyeMode: 'All',                   // D35: Active Weapon Augmentation & Symbol Dye Selector ('Off' | 'All' | 'Top_High_Life_Stone' | 'Augment_Anvils' | 'Symbol_Dye_Parlors')
  companionMountMode: 'All',               // D36: Active Pet, Strider & Wyvern Mount Selector ('Off' | 'All' | 'Pet_Manager_Kennel' | 'Hatchling_Strider_Sanctum' | 'Castle_Wyvern_Roost')
  clanAcademyMode: 'All',                  // D37: Active Clan Reputation & Academy Selector ('Off' | 'All' | 'Clan_Academy_Hall' | 'Clan_Ambition_Altar' | 'Pledge_Skill_Sanctum')
  herbBiomeMode: 'All',                    // D38: Active 24-Field Elemental & Herb Sustainability Selector ('Off' | 'All' | 'S_Tier_Zero_Downtime' | 'A_Tier_Mystic_Mana_Rich' | 'By_Elemental_Weakness')
  workshopMode: 'All',                     // D39: Active 15-Town Soulshot & Dwarven Manufacture Selector ('Off' | 'All' | 'Starter_D_C_Plaza' | 'Regional_B_A_Workshop' | 'Capital_S_Grade_Master_Forge')
  territoryWardMode: 'All',                // D40: Active Territory Ward & Giant's Codex Selector ('Off' | 'All' | 'Sovereign_Territory_Ward' | 'Fortress_Codex_Supply_Vault')
  epicJewelryMode: 'All',                  // D41: Active 12-Relic Epic Boss Jewelry Selector ('Off' | 'All' | 'Epic_Ring' | 'Epic_Earring' | 'Epic_Necklace')
  vitalityObeliskMode: 'All',              // D42: Active 15-Town Adventurer's Guide & Vitality Obelisk Selector ('Off' | 'All' | 'Starter_Apprentice_Coupon_Hub' | 'Regional_Shadow_Weapon_Hub' | 'Capital_Stage4_Vitality_Sanctuary')
  armorSetMode: 'All',                     // D43: Active 16-Set Armor & Masterwork Forge Selector ('Off' | 'All' | 'Heavy_Vanguard_Set' | 'Light_Skirmisher_Set' | 'Mystic_Robe_Set')
  kamalokaMode: 'All',                     // D44: Active 15-Portal Kamaloka, Pailaka & Seed Selector ('Off' | 'All' | 'Kamaloka_Abyss_Hall' | 'Pailaka_Vitality_Trial' | 'Seed_Delusion_Conduit')
  skillScrollMode: 'All',                  // D45: Active 16-Sanctum Forgotten Scroll & Skill Mastery Selector ('Off' | 'All' | 'Martial_Will_Scroll' | 'Arcane_Enlightenment_Scroll' | 'Ancient_Tome_Codex_Sanctum')
  elementalQuarryMode: 'All',              // D46: Active 14-Node Elemental Stone/Crystal & Caravan Quarry Selector ('Off' | 'All' | 'Elemental_Stone_Quarry_150' | 'Elemental_Crystal_Sanctum_300' | 'Caravan_Trust_Oasis')
  clanHallMode: 'All',                     // D47: Active 16-Estate Clan Hall Auction & Siege Chateau Selector ('Off' | 'All' | 'Town_Luxury_Auction_Hall' | 'Contested_Siege_Chateau')
  transformationMode: 'All',               // D48: Active 15-Sanctum Transformation, Talisman & Agathion Selector ('Off' | 'All' | 'Avant_Garde_Transformation_Sanctum' | 'Epaulette_Talisman_Vault' | 'Agathion_Bracelet_Altar')
  warehouseMode: 'All',                    // D49: Active 15-Town Warehouse, Clan Vault & Freight Selector ('Off' | 'All' | 'Starter_Iron_Gate_Vault' | 'Regional_Freight_Depot' | 'Capital_Dimensional_Broker')
  masterTourMode: 'All',                   // D50: Active 18-Checkpoint 50D Master Cartographic Tour Selector ('Off' | 'All' | 'Race_Origin_To_Awakening' | 'Town_Blueprint_And_Economy' | 'Multi_Floor_Dungeon_Sanctum')
  festivalOracleMode: 'All',               // D51: Active 15-Town Festival of Darkness & Oracle Selector ('Off' | 'All' | 'Oracle_of_Dawn_Sanctuary' | 'Oracle_of_Dusk_Sanctuary' | 'High_Bracket_Blood_Offering_Altar')
  luxuryMarketMode: 'All',                 // D52: Active 12-Node Luxury Boutique & Black Marketeer Selector ('Off' | 'All' | 'Crystal_Luxury_Armory' | 'Black_Marketeer_of_Mammon' | 'Couture_Emporium')
  factionAllianceMode: 'All',              // D53: Active 14-Node Factional Alliance & Totem War Selector ('Off' | 'All' | 'Vanguard_Orc_Alliance_Outpost' | 'Shaman_Silenos_Alliance_Stronghold' | 'Totem_Spirit_Raid_Altar')
  fantasyPlazaMode: 'All',                 // D54: Active 12-Node Monster Derby, Coin of Magic & Kratei's Cube Selector ('Off' | 'All' | 'Monster_Derby_Race_Track' | 'Coin_of_Magic_Collector_Lodge' | 'Kratei_Cube_Fantasy_Arena')
  heroWeaponMode: 'All',                   // D55: Active 15-Town Hero Weapon & Olympiad Token Selector ('Off' | 'All' | 'Martial_Infinity_Armory' | 'Arcane_Infinity_Sanctum' | 'Olympiad_Token_Codex_Exchange')
  treasureChestMode: 'All',                // D56: Active 16-Zone Treasure Chest & Lockpick Cache Selector ('Off' | 'All' | 'Overland_Pirate_Bandit_Cache' | 'Underground_Catacomb_Vault' | 'Tower_Sanctum_Coffer_Room')
  aerialDockMode: 'All',                   // D57: Active 12-Node Clan Airship Dock & Star Stone Selector ('Off' | 'All' | 'Clan_Airship_Summon_Dock' | 'Star_Stone_Extraction_Field' | 'Aerial_Raid_Corridor')
  beltCloakMode: 'All',                    // D58: Active 14-Node Mithril Belt Weaver & Sovereign Cloak Selector ('Off' | 'All' | 'Weaver_Olf_Belt_Loom' | 'Sovereign_Boss_Cloak_Sanctum' | 'Castle_Knight_Cloak_Armory')
  weddingMode: 'All',                      // D59: Active 12-Sanctuary Wedding Cathedral & Couple Teleport Selector ('Off' | 'All' | 'Grand_Wedding_Cathedral' | 'Formal_Wear_Couture_Tailor' | 'Bridal_Procession_Garden')
  councilBenchmarkMode: 'All',             // D60: Active 18-Benchmark 6-Role Studio Council 60D Audit Selector ('Off' | 'All' | 'Product_Owner' | 'Game_Designer_Lead' | 'Player_Growth_Path_Designer' | 'Game_Story_Designer' | 'Monster_And_Mob_Designer' | 'Lead_Systems_Map_Architect')
  seedCycleMode: 'All',                    // D61: Active 14-Node Continental Seed Cycle (Stage 1-5) Selector ('Off' | 'All' | 'Seed_of_Infinity_Stage' | 'Seed_of_Destruction_Stage' | 'Energy_Compression_Well')
  coliseumTournamentMode: 'All',           // D62: Active 12-Arena Underground Coliseum & Clan Tournament Selector ('Off' | 'All' | 'Underground_Coliseum_Bracket' | 'Clan_War_Tournament_Ring' | 'Royal_Fame_Exhibition_Arena')
  elementalJewelMode: 'All',               // D63: Active 14-Sanctum Elemental Jewel, Raid Rune Stone & Giant's Relic Selector ('Off' | 'All' | 'Elemental_Jewel_Forge' | 'Raid_Rune_Stone_Altar' | 'Ancient_Giants_Relic_Vault')
  fameMonumentMode: 'All',                 // D64: Active 15-Town Reputation Manager (Rapidus / Scipio) Fame & PvP Infusion Selector ('Off' | 'All' | 'PvP_Weapon_Infusion_Obelisk' | 'PvP_Armor_Mirage_Obelisk' | 'PK_Pardon_And_CRP_Monument')
  delusionChamberMode: 'All',              // D65: Active 12-Conduit Delusion Chamber & Aenkinel Raid Selector ('Off' | 'All' | 'Seal_Delusion_Chamber' | 'Great_Tower_Of_Seal_Chamber' | 'Guiding_Tea_Leaf_Conduit')
  commandRaidMode: 'All',                  // D66: Active 14-Sanctum Zaken, Freya & Frintezza Command-Channel Raid Selector ('Off' | 'All' | 'Zaken_Candlelight_Cavern' | 'Ice_Queen_Freya_Palace' | 'Frintezza_Organ_Concert_Hall')
  nevitBlessingMode: 'All',                // D67: Active 15-Town Nevit's Blessing Hourglass & Hunting Helper Selector ('Off' | 'All' | 'Nevit_Hourglass_Altar' | 'Arcane_Fairy_Helper_Sanctuary' | 'Martial_Turtle_Helper_Sanctuary')
  councilSignoffMode: 'All',               // D68: Active 24-Record 8-Hour Studio Council D1-D68 Sign-Off Selector ('Off' | 'All' | 'Product_Owner' | 'Game_Designer_Lead' | 'Player_Growth_Path_Designer' | 'Game_Story_Designer' | 'Monster_And_Mob_Designer' | 'Lead_Systems_Map_Architect')
  championMobMode: 'All',                  // D69: Active 16-Zone Champion Mob Aura & Herd Leader Selector ('Off' | 'All' | 'Blue_Aura_10x_Champion_Field' | 'Crimson_Aura_50x_Champion_Sanctum' | 'Social_Herd_Leader_Pack_Ground')
  dualswordForgeMode: 'All',               // D70: Active 15-Town Dualsword Craft Stamp & Maestro Ishuma Unseal Selector ('Off' | 'All' | 'Starter_C_B_Dualsword_Anvil' | 'A_S_Grade_Craft_Stamp_Forge' | 'Maestro_Ishuma_S80_S84_Unseal_Dock')
  techArtPipelineMode: 'All',              // D71: Active 16-Node [Stage 2: Asset & Build] Technical Artist Pipeline Selector ('Off' | 'All' | 'Three_Tier_GLB_Asset_Gate' | 'Polygon_Bone_Shader_Validator' | 'Godot_World_Chunk_Streaming_Baker')
  botSwarmSimMode: 'All',                  // D72: Active 16-Node [Stage 3: Server & Simulation] 10k-Bot Swarm & Spatial Partition Selector ('Off' | 'All' | 'Headless_10k_Bot_Swarm_Sector' | 'Spatial_Grid_AOI_Partition_Cell' | 'Deterministic_Replay_Desync_Probe')
  liveopsGmMode: 'All',                    // D73: Active 15-Town [Stage 4: LiveOps & GM] Control Selector ('Off' | 'All' | 'GM_Stuck_Character_Rescue_Anchor' | 'Inventory_Rollback_Audit_Vault' | 'Zero_Restart_Live_Event_Hot_Config')
  toolsSquadMode: 'All',                   // D74: Active 20-Tool [4-Domain x 5-Role Tools Squad] Unified Pipeline Selector ('Off' | 'All' | 'Stage_1_Content_And_World' | 'Stage_2_Asset_And_Build_Pipeline' | 'Stage_3_Server_And_Simulation' | 'Stage_4_LiveOps_And_GM')
  dialogueGraphMode: 'All',                // D75: Active 18-Graph [Role 2: Content Tools] Branching Dialogue DAG & EN/TH Localization Selector ('Off' | 'All' | 'Main_Story_Dialogue_DAG' | 'Class_Trial_Branching_Tree' | 'Racial_Lore_Localization_Bundle')
  spawnerBalancerMode: 'All',              // D76: Active 16-Zone [Role 1 & 2: Spawner & Economy Tools] Visual Spawner & Loot Balancer Selector ('Off' | 'All' | 'Visual_Spawner_Leash_Editor' | 'Monte_Carlo_Loot_Inflation_Balancer' | 'Hot_Reload_SSOT_Writeback_Bridge')
  skillTimelineMode: 'All',                // D77: Active 16-Archetype [Role 2: Combat Timeline Editor] Skill & Boss Telegraph Selector ('Off' | 'All' | 'Martial_Combo_Hitbox_Timeline' | 'Arcane_Cast_Interrupt_Timeline' | 'Boss_Telegraph_VFX_Timeline')
  buildFarmMode: 'All',                    // D78: Active 15-Node [Role 5: Build Farm & Patch CDN] Cooker & Delta Patch Selector ('Off' | 'All' | 'Godot_Client_Pak_Cooker_Node' | 'Server_Rs_Linux_Musl_Build_Runner' | 'Delta_Binary_Patch_CDN_Edge')
  architectDxMode: 'All',                  // D79: Active 15-Town [Role 1: Lead Tools Architect] SSO, Undo/Redo & Codegen Drift-Gate Selector ('Off' | 'All' | 'Unified_SSO_Editor_Session_Hub' | 'Cross_Tool_Undo_Redo_Command_Stack' | 'Schema_Codegen_Drift_Gate_Watchdog')
  twoRingSignoffMode: 'All',               // D80: Active 22-Record [11-Role Two-Ring Studio] D1-D80 Sign-Off Selector ('Off' | 'All' | 'Ring_A_Creative_Council' | 'Ring_B_Platform_Tools_Squad')
  weatherAcousticMode: 'All',              // D81: Active 16-Zone [Role 3: Technical Artist] Weather, Day/Night Shader & Spatial Audio Selector ('Off' | 'All' | 'Town_Symphony_And_Tavern_Reverb' | 'Nocturnal_Curse_Fog_And_Blood_Rain_Field' | 'Subterranean_Catacomb_Echo_And_Resonance')
  serverMeshMode: 'All',                   // D82: Active 15-Corridor [Role 4: Backend Infra] Server-Mesh Handoff, Redis Stream & Postgres WAL Selector ('Off' | 'All' | 'Zero_Loading_Zone_Boundary_Handoff' | 'Redis_Stream_Cross_Realm_Event_Bus' | 'Postgres_Advisory_Lock_Writebehind_Wal')
  antiBotMode: 'All',                      // D83: Active 16-Node [Role 5: LiveOps & CS Portal] Anti-Bot / RMT Telemetry & Economy Anomaly Sentinel Selector
  godotStorybookMode: 'All',               // D84: Active 15-Node [Role 2 + Role 3: Godot Tool-Scene Storybook] 3D Kitbash Prefab Inspector Selector
  navmeshMode: 'All',                      // D85: Active 16-Node [Role 4: Backend Infra] NavMesh 3D Pathfinding, Jump-Link & Dynamic Door/Bridge Obstacle Selector
  liveopsFlagsMode: 'All',                 // D86: Active 15-Node [Role 5: LiveOps & Build] Seasonal World Event, Double-EXP / Drop Hot-Config & Feature Flag Selector
  cinematicRailsMode: 'All',               // D87: Active 16-Rail [Role 2: Content & World Tools] In-Game Cutscene Camera Rail, Boss Intro Cinematics & Story Trigger Selector
  gpuBudgetMode: 'All',                    // D88: Active 15-Town [Role 3: Technical Artist] Client GPU Frame-Time Profiler, Draw-Call Instancing & VRAM Pool Budget Selector
  qaSuitesMode: 'All',                     // D89: Active 16-Suite [Role 1 + Role 4] Automated Headless QA Playtest Matrix & Golden-Snapshot Regression Selector
  studio90dMode: 'All',                    // D90: Active 22-Record [90D Grand Studio Architecture Milestone] 11-Role Master Sign-Off & Telemetry Ledger Selector
  factionDispositionMode: 'All',           // D91: Active 16-Record [Role 2: Content & World Tools] Dynamic Faction Reputation, NPC Disposition & Town Guard Hostility Selector
  auctionEscrowMode: 'All',                // D92: Active 15-Town [Role 4: Backend Infra] Cross-Realm Auction House, Escrow Settlement & Price-Circuit-Breaker Selector
  worldIncursionMode: 'All',               // D93: Active 16-Record [Role 2: Content & World Tools] Dynamic World Boss Invasion, Rift Incursion & Public Quest Selector
  clanTreasuryMode: 'All',                 // D94: Active 15-Town [Role 4: Backend Infra] Guild / Clan Treasury Ledger, Siege Mercenary Payroll & Tax Dividend Selector
  housingEstatesMode: 'All',               // D95: Active 16-Record [Role 2: Content & World Tools] Player Housing, Clan Citadel Interior Customization & Trophy Taxidermy Selector
  cdnWebrtcMode: 'All',                    // D96: Active 15-Town [Role 5: LiveOps & Build] Global CDN Region Routing, Anycast DDoS Scrubbing & Voice-Chat WebRTC Relay Selector
  caravanRoutesMode: 'All',                // D97: Active 16-Route [Role 2: Content & World Tools] Dynamic Caravan Trade Routes, Bandit Ambush Escorts & Arbitrage Selector
  localizationVoMode: 'All',               // D98: Active 15-Bank [Role 5: LiveOps & CS Portal] Automated Localization Voice-Over (EN/TH/JP/KR) & Lip-Sync Selector
  hotReloadBridgeMode: 'All',              // D99: Active 16-Bridge [Role 1: Lead Tools & Pipeline Architect] Cross-Tool Hot-Reload WebSocket Bus & Godot Live-Sync Selector
  centennial100dMode: 'All',               // D100: Active 22-Charter [100D Centennial Studio Milestone] Two-Ring 11-Role Grand Centennial Sign-Off & Guided Tour Selector
  nocturnalAffixMode: 'All',               // D101: Active 16-Spawn [Role 2: Content & World Tools] Dynamic World Weather-Triggered Rare Spawns & Eclipse Affix Selector
  combatReplayMode: 'All',                 // D102: Active 15-Sector [Role 4: Backend Infra] Deterministic Combat Replay Verifier & BLAKE3 Tick Hash Selector
  loreCodexMode: 'All',                    // D103: Active 16-Codex [Role 2: Content & World Tools] Dynamic World Lore Codex, Relic Excavation & Bestiary Mastery Selector
  physicsBiomeMode: 'All',                 // D104: Active 15-Biome [Role 3: Technical Artist] Procedural Foliage Wind-Field, Water Ripple & Destructible Physics Selector
  bountyManhuntMode: 'All',                // D105: Active 16-Contract [Role 2: Content & World Tools] Dynamic Bounty Hunter Contracts, Chaotic PK Manhunt & High-Value Target Tracking Selector
  pitrChaosMode: 'All',                    // D106: Active 15-Shard [Role 4: Backend Infra] Distributed World-State Snapshot Backup, PITR & Disaster-Recovery Chaos Drill Selector
  tavernHubsMode: 'All',                   // D107: Active 16-Hub [Role 2: Content & World Tools] Dynamic World Tavern Mini-Games, Bardic Music Buffs & Social Mercenary Recruitment Selector
  churnInterventionMode: 'All',            // D108: Active 15-Town [Role 5: LiveOps & CS Portal] Player Sentiment Telemetry, Net-Promoter In-Game Survey & Rage-Quit Churn Intervention Selector
  townBlueprintMode: 'parchment', // 'parchment' (Screenshots 3 & 4) | 'schematic' ("Oren by Cheese" Screenshot 5)
  activeDungeonId: '',   // e.g. 'zone-dungeon-kiln-cellar' | 'zone-dungeon-pendulum-shaft' | 'zone-dungeon-chronometer-foundry'
  activeFloorId: '',     // e.g. 'B1', 'B2', 'B3' or '1F', '2F', '3F'
  activeTownId: 'town-lantern-hollow',
  activeFieldOrFortId: '', // e.g. 'zone-field-clover-south-gate' or 'zone-fortress-shanty-kiln'
  personaLens: 'gamer',    // 'gamer' | 'designer' | 'architect' | 'developer' | 'liveops'
  activeStudioBar: 'boss_hierarchy',
  routePlannerOpen: false,
  raceGrowthOpen: false,
  presetChipsOpen: false,
  leftDrawerOpen: false,
  theaterMode: false,
  entityMatrixOpen: false,
  contextAutoHealNote: '',
  toastMessage: ''
};

function setAtlasTavernHubsMode(modeId) {
  ATLAS_TAVERN_HUBS_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.tavernHubsMode = ATLAS_TAVERN_HUBS_MODE;
  writeUrlState(false);
  render();
}

function selectTavernSocialHub(tavernId) {
  SELECTED_TAVERN_SOCIAL_HUB_ID = String(tavernId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  TAVERN_SOCIAL_HUBS = tatlas.tavern_social_hubs || [];
  const item = TAVERN_SOCIAL_HUBS.find(t => t.tavern_id === SELECTED_TAVERN_SOCIAL_HUB_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasChurnInterventionMode(modeId) {
  ATLAS_CHURN_INTERVENTION_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.churnInterventionMode = ATLAS_CHURN_INTERVENTION_MODE;
  writeUrlState(false);
  render();
}

function selectChurnIntervention(interventionId) {
  SELECTED_CHURN_INTERVENTION_ID = String(interventionId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CHURN_INTERVENTIONS = tatlas.churn_sentiment_interventions || [];
  const item = CHURN_INTERVENTIONS.find(c => c.intervention_id === SELECTED_CHURN_INTERVENTION_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasLoreCodexMode(modeId) {
  ATLAS_LORE_CODEX_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.loreCodexMode = ATLAS_LORE_CODEX_MODE;
  writeUrlState(false);
  render();
}

function selectArchaeologicalCodex(codexId) {
  SELECTED_ARCHAEOLOGICAL_CODEX_ID = String(codexId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  ARCHAEOLOGICAL_CODICES = tatlas.archaeological_lore_codices || [];
  const item = ARCHAEOLOGICAL_CODICES.find(c => c.codex_id === SELECTED_ARCHAEOLOGICAL_CODEX_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasPhysicsBiomeMode(modeId) {
  ATLAS_PHYSICS_BIOME_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.physicsBiomeMode = ATLAS_PHYSICS_BIOME_MODE;
  writeUrlState(false);
  render();
}

function selectDestructiblePhysicsBiome(biomeId) {
  SELECTED_DESTRUCTIBLE_PHYSICS_BIOME_ID = String(biomeId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  DESTRUCTIBLE_PHYSICS_BIOMES = tatlas.destructible_physics_biomes || [];
  const item = DESTRUCTIBLE_PHYSICS_BIOMES.find(b => b.physics_biome_id === SELECTED_DESTRUCTIBLE_PHYSICS_BIOME_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasBountyManhuntMode(modeId) {
  ATLAS_BOUNTY_MANHUNT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.bountyManhuntMode = ATLAS_BOUNTY_MANHUNT_MODE;
  writeUrlState(false);
  render();
}

function selectBountyManhuntContract(bountyId) {
  SELECTED_BOUNTY_MANHUNT_CONTRACT_ID = String(bountyId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  BOUNTY_MANHUNT_CONTRACTS = tatlas.bounty_manhunt_contracts || [];
  const item = BOUNTY_MANHUNT_CONTRACTS.find(b => b.bounty_id === SELECTED_BOUNTY_MANHUNT_CONTRACT_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasPitrChaosMode(modeId) {
  ATLAS_PITR_CHAOS_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.pitrChaosMode = ATLAS_PITR_CHAOS_MODE;
  writeUrlState(false);
  render();
}

function selectDisasterRecoveryDrill(drillId) {
  SELECTED_DISASTER_RECOVERY_DRILL_ID = String(drillId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  DISASTER_RECOVERY_DRILLS = tatlas.disaster_recovery_pitr_drills || [];
  const item = DISASTER_RECOVERY_DRILLS.find(d => d.pitr_drill_id === SELECTED_DISASTER_RECOVERY_DRILL_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasNocturnalAffixMode(modeId) {
  ATLAS_NOCTURNAL_AFFIX_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.nocturnalAffixMode = ATLAS_NOCTURNAL_AFFIX_MODE;
  writeUrlState(false);
  render();
}

function selectNocturnalAffixSpawn(spawnId) {
  SELECTED_NOCTURNAL_AFFIX_SPAWN_ID = String(spawnId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  NOCTURNAL_AFFIX_SPAWNS = tatlas.nocturnal_weather_affix_spawns || [];
  const item = NOCTURNAL_AFFIX_SPAWNS.find(s => s.affix_spawn_id === SELECTED_NOCTURNAL_AFFIX_SPAWN_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasCombatReplayMode(modeId) {
  ATLAS_COMBAT_REPLAY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.combatReplayMode = ATLAS_COMBAT_REPLAY_MODE;
  writeUrlState(false);
  render();
}

function selectDeterministicCombatReplay(replayId) {
  SELECTED_DETERMINISTIC_COMBAT_REPLAY_ID = String(replayId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  DETERMINISTIC_COMBAT_REPLAYS = tatlas.deterministic_combat_replays || [];
  const item = DETERMINISTIC_COMBAT_REPLAYS.find(r => r.replay_sector_id === SELECTED_DETERMINISTIC_COMBAT_REPLAY_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasHotReloadBridgeMode(modeId) {
  ATLAS_HOT_RELOAD_BRIDGE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.hotReloadBridgeMode = ATLAS_HOT_RELOAD_BRIDGE_MODE;
  writeUrlState(false);
  render();
}

function selectCrossToolBridge(bridgeId) {
  SELECTED_CROSS_TOOL_BRIDGE_ID = String(bridgeId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CROSS_TOOL_BRIDGES = tatlas.cross_tool_hot_reload_bridges || [];
  const item = CROSS_TOOL_BRIDGES.find(b => b.bridge_id === SELECTED_CROSS_TOOL_BRIDGE_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasCentennial100dMode(modeId) {
  ATLAS_CENTENNIAL_100D_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.centennial100dMode = ATLAS_CENTENNIAL_100D_MODE;
  writeUrlState(false);
  render();
}

function selectCentennial100dCharter(charterId) {
  SELECTED_CENTENNIAL_100D_CHARTER_ID = String(charterId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CENTENNIAL_100D_CHARTERS = tatlas.centennial_100d_studio_charters || [];
  const item = CENTENNIAL_100D_CHARTERS.find(c => c.charter_id === SELECTED_CENTENNIAL_100D_CHARTER_ID);
  if (item) {
    if (typeof item.camera_zoom_preset === 'number') {
      STUDIO_MAP_ZOOM = item.camera_zoom_preset;
    }
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasCaravanRoutesMode(modeId) {
  ATLAS_CARAVAN_ROUTES_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.caravanRoutesMode = ATLAS_CARAVAN_ROUTES_MODE;
  writeUrlState(false);
  render();
}

function selectCaravanTradeRoute(caravanId) {
  SELECTED_CARAVAN_ROUTE_ID = String(caravanId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CARAVAN_TRADE_ROUTES = tatlas.caravan_trade_routes || [];
  const item = CARAVAN_TRADE_ROUTES.find(c => c.caravan_id === SELECTED_CARAVAN_ROUTE_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.origin_town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasLocalizationVoMode(modeId) {
  ATLAS_LOCALIZATION_VO_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.localizationVoMode = ATLAS_LOCALIZATION_VO_MODE;
  writeUrlState(false);
  render();
}

function selectLocalizationVoBank(voBankId) {
  SELECTED_LOCALIZATION_VO_BANK_ID = String(voBankId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  LOCALIZATION_VO_BANKS = tatlas.localization_voiceover_banks || [];
  const item = LOCALIZATION_VO_BANKS.find(v => v.vo_bank_id === SELECTED_LOCALIZATION_VO_BANK_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasHousingEstatesMode(modeId) {
  ATLAS_HOUSING_ESTATES_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.housingEstatesMode = ATLAS_HOUSING_ESTATES_MODE;
  writeUrlState(false);
  render();
}

function selectPlayerHousingEstate(estateId) {
  SELECTED_HOUSING_ESTATE_ID = String(estateId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  PLAYER_HOUSING_ESTATES = tatlas.player_housing_trophy_estates || [];
  const item = PLAYER_HOUSING_ESTATES.find(e => e.estate_id === SELECTED_HOUSING_ESTATE_ID);
  if (item) {
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasCdnWebrtcMode(modeId) {
  ATLAS_CDN_WEBRTC_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.cdnWebrtcMode = ATLAS_CDN_WEBRTC_MODE;
  writeUrlState(false);
  render();
}

function selectGlobalCdnRelay(relayId) {
  SELECTED_CDN_WEBRTC_RELAY_ID = String(relayId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  GLOBAL_CDN_RELAYS = tatlas.global_cdn_webrtc_relays || [];
  const item = GLOBAL_CDN_RELAYS.find(r => r.relay_id === SELECTED_CDN_WEBRTC_RELAY_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasWorldIncursionMode(modeId) {
  ATLAS_WORLD_INCURSION_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.worldIncursionMode = ATLAS_WORLD_INCURSION_MODE;
  writeUrlState(false);
  render();
}

function selectWorldInvasionIncursion(incursionId) {
  SELECTED_WORLD_INCURSION_ID = String(incursionId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  WORLD_INVASION_INCURSIONS = tatlas.world_invasion_incursions || [];
  const item = WORLD_INVASION_INCURSIONS.find(i => i.incursion_id === SELECTED_WORLD_INCURSION_ID);
  if (item) {
    if (item.dungeon_id) {
      openDungeonSubMap(item.dungeon_id, 'B2');
      return;
    }
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasClanTreasuryMode(modeId) {
  ATLAS_CLAN_TREASURY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.clanTreasuryMode = ATLAS_CLAN_TREASURY_MODE;
  writeUrlState(false);
  render();
}

function selectClanTreasuryLedger(treasuryId) {
  SELECTED_CLAN_TREASURY_ID = String(treasuryId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CLAN_TREASURY_LEDGERS = tatlas.clan_treasury_payroll_ledgers || [];
  const item = CLAN_TREASURY_LEDGERS.find(t => t.treasury_id === SELECTED_CLAN_TREASURY_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasFactionDispositionMode(modeId) {
  ATLAS_FACTION_DISPOSITION_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.factionDispositionMode = ATLAS_FACTION_DISPOSITION_MODE;
  writeUrlState(false);
  render();
}

function selectFactionDisposition(dispositionId) {
  SELECTED_FACTION_DISPOSITION_ID = String(dispositionId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  FACTION_DISPOSITIONS = tatlas.faction_reputation_dispositions || [];
  const item = FACTION_DISPOSITIONS.find(d => d.disposition_id === SELECTED_FACTION_DISPOSITION_ID);
  if (item) {
    if (item.dungeon_id) {
      openDungeonSubMap(item.dungeon_id, 'B2');
      return;
    }
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasAuctionEscrowMode(modeId) {
  ATLAS_AUCTION_ESCROW_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.auctionEscrowMode = ATLAS_AUCTION_ESCROW_MODE;
  writeUrlState(false);
  render();
}

function selectCrossRealmEscrow(escrowId) {
  SELECTED_CROSS_REALM_ESCROW_ID = String(escrowId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CROSS_REALM_ESCROWS = tatlas.cross_realm_auction_escrows || [];
  const item = CROSS_REALM_ESCROWS.find(e => e.escrow_id === SELECTED_CROSS_REALM_ESCROW_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasQaSuitesMode(modeId) {
  ATLAS_QA_SUITES_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.qaSuitesMode = ATLAS_QA_SUITES_MODE;
  writeUrlState(false);
  render();
}

function selectAutomatedQaSuite(suiteId) {
  SELECTED_QA_SUITE_ID = String(suiteId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  AUTOMATED_QA_SUITES = tatlas.automated_qa_smoke_suites || [];
  const item = AUTOMATED_QA_SUITES.find(s => s.qa_suite_id === SELECTED_QA_SUITE_ID);
  if (item) {
    if (item.dungeon_id) {
      openDungeonSubMap(item.dungeon_id, 'B2');
      return;
    }
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasStudio90dMode(modeId) {
  ATLAS_STUDIO_90D_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.studio90dMode = ATLAS_STUDIO_90D_MODE;
  writeUrlState(false);
  render();
}

function selectStudio90dLedger(ledgerId) {
  SELECTED_STUDIO_90D_LEDGER_ID = String(ledgerId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  STUDIO_90D_LEDGER = tatlas.studio_90d_master_ledger || [];
  const item = STUDIO_90D_LEDGER.find(l => l.ledger_id === SELECTED_STUDIO_90D_LEDGER_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasAntiBotMode(modeId) {
  ATLAS_ANTI_BOT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.antiBotMode = ATLAS_ANTI_BOT_MODE;
  writeUrlState(false);
  render();
}

function selectAntiBotSentinel(sentinelId) {
  SELECTED_ANTI_BOT_SENTINEL_ID = String(sentinelId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  ANTI_BOT_SENTINELS = tatlas.anti_bot_economy_sentinels || [];
  const item = ANTI_BOT_SENTINELS.find(s => s.sentinel_id === SELECTED_ANTI_BOT_SENTINEL_ID);
  if (item) {
    if (item.dungeon_id) {
      openDungeonSubMap(item.dungeon_id, 'B2');
      return;
    }
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasGodotStorybookMode(modeId) {
  ATLAS_GODOT_STORYBOOK_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.godotStorybookMode = ATLAS_GODOT_STORYBOOK_MODE;
  writeUrlState(false);
  render();
}

function selectGodotStorybookPrefab(prefabId) {
  SELECTED_GODOT_STORYBOOK_PREFAB_ID = String(prefabId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  GODOT_STORYBOOK_PREFABS = tatlas.godot_storybook_prefab_nodes || [];
  const item = GODOT_STORYBOOK_PREFABS.find(p => p.prefab_id === SELECTED_GODOT_STORYBOOK_PREFAB_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasNavmeshMode(modeId) {
  ATLAS_NAVMESH_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.navmeshMode = ATLAS_NAVMESH_MODE;
  writeUrlState(false);
  render();
}

function selectNavmeshObstacleSector(navmeshId) {
  SELECTED_NAVMESH_SECTOR_ID = String(navmeshId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  NAVMESH_OBSTACLE_SECTORS = tatlas.navmesh_obstacle_sectors || [];
  const item = NAVMESH_OBSTACLE_SECTORS.find(n => n.navmesh_id === SELECTED_NAVMESH_SECTOR_ID);
  if (item) {
    if (item.dungeon_id) {
      openDungeonSubMap(item.dungeon_id, 'B2');
      return;
    }
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasLiveopsFlagsMode(modeId) {
  ATLAS_LIVEOPS_FLAGS_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.liveopsFlagsMode = ATLAS_LIVEOPS_FLAGS_MODE;
  writeUrlState(false);
  render();
}

function selectLiveopsEventFlag(flagId) {
  SELECTED_LIVEOPS_FLAG_ID = String(flagId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  LIVEOPS_EVENT_FLAGS = tatlas.liveops_event_flag_nodes || [];
  const item = LIVEOPS_EVENT_FLAGS.find(f => f.event_flag_id === SELECTED_LIVEOPS_FLAG_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasCinematicRailsMode(modeId) {
  ATLAS_CINEMATIC_RAILS_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.cinematicRailsMode = ATLAS_CINEMATIC_RAILS_MODE;
  writeUrlState(false);
  render();
}

function selectCinematicCameraRail(railId) {
  SELECTED_CINEMATIC_RAIL_ID = String(railId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CINEMATIC_CAMERA_RAILS = tatlas.cinematic_camera_rails || [];
  const item = CINEMATIC_CAMERA_RAILS.find(r => r.rail_id === SELECTED_CINEMATIC_RAIL_ID);
  if (item) {
    if (item.dungeon_id) {
      openDungeonSubMap(item.dungeon_id, 'B3');
      return;
    }
    if (String(item.zone_id || '').startsWith('zone-town-')) {
      focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
      return;
    }
    focusFieldOrFortressBlueprint(item.zone_id, `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasGpuBudgetMode(modeId) {
  ATLAS_GPU_BUDGET_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.gpuBudgetMode = ATLAS_GPU_BUDGET_MODE;
  writeUrlState(false);
  render();
}

function selectClientGpuBudget(budgetId) {
  SELECTED_GPU_BUDGET_ID = String(budgetId || '');
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  CLIENT_GPU_BUDGETS = tatlas.client_gpu_vram_budgets || [];
  const item = CLIENT_GPU_BUDGETS.find(b => b.gpu_budget_id === SELECTED_GPU_BUDGET_ID);
  if (item) {
    focusTownStreetBlueprint(item.town_id || item.zone_id.replace('zone-', ''), `${item.world_x}:${item.world_y}`);
    return;
  }
  render();
}

function setAtlasWeatherAcousticMode(modeId) {
  ATLAS_WEATHER_ACOUSTIC_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.weatherAcousticMode = ATLAS_WEATHER_ACOUSTIC_MODE;
  writeUrlState(false);
  render();
}

function setAtlasServerMeshMode(modeId) {
  ATLAS_SERVER_MESH_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.serverMeshMode = ATLAS_SERVER_MESH_MODE;
  writeUrlState(false);
  render();
}

function setAtlasArchitectDxMode(modeId) {
  ATLAS_ARCHITECT_DX_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.architectDxMode = ATLAS_ARCHITECT_DX_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTwoRingSignoffMode(modeId) {
  ATLAS_TWO_RING_SIGNOFF_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.twoRingSignoffMode = ATLAS_TWO_RING_SIGNOFF_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSkillTimelineMode(modeId) {
  ATLAS_SKILL_TIMELINE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.skillTimelineMode = ATLAS_SKILL_TIMELINE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasBuildFarmMode(modeId) {
  ATLAS_BUILD_FARM_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.buildFarmMode = ATLAS_BUILD_FARM_MODE;
  writeUrlState(false);
  render();
}

function setAtlasDialogueGraphMode(modeId) {
  ATLAS_DIALOGUE_GRAPH_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.dialogueGraphMode = ATLAS_DIALOGUE_GRAPH_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSpawnerBalancerMode(modeId) {
  ATLAS_SPAWNER_BALANCER_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.spawnerBalancerMode = ATLAS_SPAWNER_BALANCER_MODE;
  writeUrlState(false);
  render();
}

function setAtlasLiveopsGmMode(modeId) {
  ATLAS_LIVEOPS_GM_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.liveopsGmMode = ATLAS_LIVEOPS_GM_MODE;
  writeUrlState(false);
  render();
}

function setAtlasToolsSquadMode(modeId) {
  ATLAS_TOOLS_SQUAD_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.toolsSquadMode = ATLAS_TOOLS_SQUAD_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTechArtPipelineMode(modeId) {
  ATLAS_TECH_ART_PIPELINE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.techArtPipelineMode = ATLAS_TECH_ART_PIPELINE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasBotSwarmSimMode(modeId) {
  ATLAS_BOT_SWARM_SIM_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.botSwarmSimMode = ATLAS_BOT_SWARM_SIM_MODE;
  writeUrlState(false);
  render();
}

function setAtlasChampionMobMode(modeId) {
  ATLAS_CHAMPION_MOB_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.championMobMode = ATLAS_CHAMPION_MOB_MODE;
  writeUrlState(false);
  render();
}

function setAtlasDualswordForgeMode(modeId) {
  ATLAS_DUALSWORD_FORGE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.dualswordForgeMode = ATLAS_DUALSWORD_FORGE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasClanHallMode(modeId) {
  ATLAS_CLAN_HALL_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.clanHallMode = ATLAS_CLAN_HALL_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTransformationMode(modeId) {
  ATLAS_TRANSFORMATION_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.transformationMode = ATLAS_TRANSFORMATION_MODE;
  writeUrlState(false);
  render();
}

function setAtlasWarehouseMode(modeId) {
  ATLAS_WAREHOUSE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.warehouseMode = ATLAS_WAREHOUSE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasMasterTourMode(modeId) {
  ATLAS_MASTER_TOUR_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.masterTourMode = ATLAS_MASTER_TOUR_MODE;
  writeUrlState(false);
  render();
}

function setAtlasFestivalOracleMode(modeId) {
  ATLAS_FESTIVAL_ORACLE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.festivalOracleMode = ATLAS_FESTIVAL_ORACLE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasLuxuryMarketMode(modeId) {
  ATLAS_LUXURY_MARKET_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.luxuryMarketMode = ATLAS_LUXURY_MARKET_MODE;
  writeUrlState(false);
  render();
}

function setAtlasFactionAllianceMode(modeId) {
  ATLAS_FACTION_ALLIANCE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.factionAllianceMode = ATLAS_FACTION_ALLIANCE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasFantasyPlazaMode(modeId) {
  ATLAS_FANTASY_PLAZA_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.fantasyPlazaMode = ATLAS_FANTASY_PLAZA_MODE;
  writeUrlState(false);
  render();
}

function setAtlasHeroWeaponMode(modeId) {
  ATLAS_HERO_WEAPON_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.heroWeaponMode = ATLAS_HERO_WEAPON_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTreasureChestMode(modeId) {
  ATLAS_TREASURE_CHEST_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.treasureChestMode = ATLAS_TREASURE_CHEST_MODE;
  writeUrlState(false);
  render();
}

function setAtlasAerialDockMode(modeId) {
  ATLAS_AERIAL_DOCK_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.aerialDockMode = ATLAS_AERIAL_DOCK_MODE;
  writeUrlState(false);
  render();
}

function setAtlasBeltCloakMode(modeId) {
  ATLAS_BELT_CLOAK_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.beltCloakMode = ATLAS_BELT_CLOAK_MODE;
  writeUrlState(false);
  render();
}

function setAtlasWeddingMode(modeId) {
  ATLAS_WEDDING_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.weddingMode = ATLAS_WEDDING_MODE;
  writeUrlState(false);
  render();
}

function setAtlasCouncilBenchmarkMode(modeId) {
  ATLAS_COUNCIL_BENCHMARK_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.councilBenchmarkMode = ATLAS_COUNCIL_BENCHMARK_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSeedCycleMode(modeId) {
  ATLAS_SEED_CYCLE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.seedCycleMode = ATLAS_SEED_CYCLE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasColiseumTournamentMode(modeId) {
  ATLAS_COLISEUM_TOURNAMENT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.coliseumTournamentMode = ATLAS_COLISEUM_TOURNAMENT_MODE;
  writeUrlState(false);
  render();
}

function setAtlasElementalJewelMode(modeId) {
  ATLAS_ELEMENTAL_JEWEL_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.elementalJewelMode = ATLAS_ELEMENTAL_JEWEL_MODE;
  writeUrlState(false);
  render();
}

function setAtlasFameMonumentMode(modeId) {
  ATLAS_FAME_MONUMENT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.fameMonumentMode = ATLAS_FAME_MONUMENT_MODE;
  writeUrlState(false);
  render();
}

function setAtlasDelusionChamberMode(modeId) {
  ATLAS_DELUSION_CHAMBER_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.delusionChamberMode = ATLAS_DELUSION_CHAMBER_MODE;
  writeUrlState(false);
  render();
}

function setAtlasCommandRaidMode(modeId) {
  ATLAS_COMMAND_RAID_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.commandRaidMode = ATLAS_COMMAND_RAID_MODE;
  writeUrlState(false);
  render();
}

function setAtlasNevitBlessingMode(modeId) {
  ATLAS_NEVIT_BLESSING_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.nevitBlessingMode = ATLAS_NEVIT_BLESSING_MODE;
  writeUrlState(false);
  render();
}

function setAtlasCouncilSignoffMode(modeId) {
  ATLAS_COUNCIL_SIGNOFF_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.councilSignoffMode = ATLAS_COUNCIL_SIGNOFF_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSkillScrollMode(modeId) {
  ATLAS_SKILL_SCROLL_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.skillScrollMode = ATLAS_SKILL_SCROLL_MODE;
  writeUrlState(false);
  render();
}

function setAtlasElementalQuarryMode(modeId) {
  ATLAS_ELEMENTAL_QUARRY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.elementalQuarryMode = ATLAS_ELEMENTAL_QUARRY_MODE;
  writeUrlState(false);
  render();
}

function setAtlasArmorSetMode(modeId) {
  ATLAS_ARMOR_SET_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.armorSetMode = ATLAS_ARMOR_SET_MODE;
  writeUrlState(false);
  render();
}

function setAtlasKamalokaMode(modeId) {
  ATLAS_KAMALOKA_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.kamalokaMode = ATLAS_KAMALOKA_MODE;
  writeUrlState(false);
  render();
}

function setAtlasEpicJewelryMode(modeId) {
  ATLAS_EPIC_JEWELRY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.epicJewelryMode = ATLAS_EPIC_JEWELRY_MODE;
  writeUrlState(false);
  render();
}

function setAtlasVitalityObeliskMode(modeId) {
  ATLAS_VITALITY_OBELISK_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.vitalityObeliskMode = ATLAS_VITALITY_OBELISK_MODE;
  writeUrlState(false);
  render();
}

function setAtlasWorkshopMode(modeId) {
  ATLAS_WORKSHOP_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.workshopMode = ATLAS_WORKSHOP_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTerritoryWardMode(modeId) {
  ATLAS_TERRITORY_WARD_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.territoryWardMode = ATLAS_TERRITORY_WARD_MODE;
  writeUrlState(false);
  render();
}

function setAtlasAugmentDyeMode(modeId) {
  ATLAS_AUGMENT_DYE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.augmentDyeMode = ATLAS_AUGMENT_DYE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasCompanionMountMode(modeId) {
  ATLAS_COMPANION_MOUNT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.companionMountMode = ATLAS_COMPANION_MOUNT_MODE;
  writeUrlState(false);
  render();
}

function setAtlasClanAcademyMode(modeId) {
  ATLAS_CLAN_ACADEMY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.clanAcademyMode = ATLAS_CLAN_ACADEMY_MODE;
  writeUrlState(false);
  render();
}

function setAtlasHerbBiomeMode(modeId) {
  ATLAS_HERB_BIOME_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.herbBiomeMode = ATLAS_HERB_BIOME_MODE;
  writeUrlState(false);
  render();
}

function setAtlasPvpKarmaMode(modeId) {
  ATLAS_PVP_KARMA_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.pvpKarmaMode = ATLAS_PVP_KARMA_MODE;
  writeUrlState(false);
  render();
}

function setAtlasRiftSepulcherMode(modeId) {
  ATLAS_RIFT_SEPULCHER_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.riftSepulcherMode = ATLAS_RIFT_SEPULCHER_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSoulCrystalMode(modeId) {
  ATLAS_SOUL_CRYSTAL_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.soulCrystalMode = ATLAS_SOUL_CRYSTAL_MODE;
  writeUrlState(false);
  render();
}

function setAtlasFishingMode(modeId) {
  ATLAS_FISHING_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.fishingMode = ATLAS_FISHING_MODE;
  writeUrlState(false);
  render();
}

function setAtlasOlympiadMode(modeId) {
  ATLAS_OLYMPIAD_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.olympiadMode = ATLAS_OLYMPIAD_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTransitMode(modeId) {
  ATLAS_TRANSIT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.transitMode = ATLAS_TRANSIT_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSevenSealsMode(modeId) {
  ATLAS_SEVEN_SEALS_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.sevenSealsMode = ATLAS_SEVEN_SEALS_MODE;
  writeUrlState(false);
  render();
}

function setAtlasManorMode(modeId) {
  ATLAS_MANOR_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.manorMode = ATLAS_MANOR_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSiegeDomain(domainId) {
  ATLAS_SIEGE_DOMAIN_ID = String(domainId || 'All');
  ATLAS_STATE_STORE.siegeDomainId = ATLAS_SIEGE_DOMAIN_ID;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const domains = tatlas.castle_siege_domains || [];
  const activeDom = domains.find(d => d.domain_id === ATLAS_SIEGE_DOMAIN_ID || d.stronghold_zone_id === ATLAS_SIEGE_DOMAIN_ID);
  if (activeDom && activeDom.artifact_altar_loc) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(activeDom.artifact_altar_loc);
  }
  writeUrlState(false);
  render();
}

function setAtlasBossRadarMode(modeId) {
  ATLAS_BOSS_RADAR_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.bossRadarMode = ATLAS_BOSS_RADAR_MODE;
  writeUrlState(false);
  render();
}

function setAtlasQuestTrack(trackId) {
  ATLAS_QUEST_TRACK = String(trackId || 'All');
  ATLAS_STATE_STORE.questTrack = ATLAS_QUEST_TRACK;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const quests = tatlas.quest_trial_chains || [];
  const matching = ATLAS_QUEST_TRACK === 'All'
    ? quests
    : quests.filter(q => q.quest_track === ATLAS_QUEST_TRACK);
  if (matching.length && !matching.some(q => q.quest_id === ATLAS_ACTIVE_QUEST_ID)) {
    ATLAS_ACTIVE_QUEST_ID = matching[0].quest_id;
    ATLAS_STATE_STORE.activeQuestId = ATLAS_ACTIVE_QUEST_ID;
  }
  writeUrlState(false);
  render();
}

function selectAtlasQuestChain(questId) {
  ATLAS_ACTIVE_QUEST_ID = String(questId || 'quest-ms-01-human');
  ATLAS_STATE_STORE.activeQuestId = ATLAS_ACTIVE_QUEST_ID;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const quests = tatlas.quest_trial_chains || [];
  const activeQuest = quests.find(q => q.quest_id === ATLAS_ACTIVE_QUEST_ID);
  if (activeQuest && activeQuest.objective_loc) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(activeQuest.objective_loc);
  }
  writeUrlState(false);
  render();
}

function setAtlasFarmingMode(modeId) {
  ATLAS_FARMING_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.farmingMode = ATLAS_FARMING_MODE;
  writeUrlState(false);
  render();
}

function setAtlasBossGodChain(godId) {
  ATLAS_BOSS_GOD_ID = String(godId || 'All');
  ATLAS_STATE_STORE.bossGodId = ATLAS_BOSS_GOD_ID;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const chains = tatlas.boss_hierarchy_chains || [];
  const activeChain = chains.find(c => c.god_id === ATLAS_BOSS_GOD_ID || c.god_short_label === ATLAS_BOSS_GOD_ID);
  if (activeChain && activeChain.seal_loc) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(activeChain.seal_loc);
  }
  writeUrlState(false);
  render();
}

function setAtlasRefineGrade(gradeCode) {
  ATLAS_REFINE_GRADE = String(gradeCode || 'No-Grade Lv.1–19');
  ATLAS_STATE_STORE.refineGrade = ATLAS_REFINE_GRADE;
  writeUrlState(false);
  render();
}

function setAtlasRefinePlus(plusLevel) {
  const lv = Math.max(1, Math.min(15, Number(plusLevel) || 3));
  ATLAS_REFINE_PLUS = lv;
  ATLAS_STATE_STORE.refinePlus = lv;
  writeUrlState(false);
  render();
}

function jumpToBlacksmithTownStreetMap(townZoneId) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const allZones = getAllAtlas63Zones(tatlas);
  const matched = allZones.find(z => z.zone_id === townZoneId || z.studio_node_id === townZoneId);
  const nodeId = (matched && (matched.studio_node_id || matched.zone_id)) || townZoneId || 'town-lantern-hollow';
  const loc = (matched && matched.loc_coord) || '';
  focusTownStreetBlueprint(nodeId, loc);
}

function highlightMaterialDropZonesOrOpenDungeon(dropZoneId) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const mfDungeons = tatlas.multi_floor_dungeons || [];
  const allZones = getAllAtlas63Zones(tatlas);
  const matchedDng = mfDungeons.find(d => d.dungeon_id === dropZoneId || d.studio_node_id === dropZoneId);
  if (matchedDng) {
    const firstFloor = (matchedDng.floors && matchedDng.floors[0] && matchedDng.floors[0].floor_id) || 'B1';
    openDungeonSubMap(matchedDng.dungeon_id, firstFloor);
    return;
  }
  const matchedZone = allZones.find(z => z.zone_id === dropZoneId || z.studio_node_id === dropZoneId);
  if (matchedZone) {
    focusFieldTacticalBlueprint(matchedZone.zone_id, matchedZone.loc_coord || '');
  }
}

function getAllAtlas63Zones(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  const list = [
    ...(zdir.starting_towns || []).map(z => ({ ...z, zoneCategory: 'Starting Town', actionType: 'town' })),
    ...(zdir.other_castle_and_hub_towns || []).map(z => ({ ...z, zoneCategory: 'Castle / Hub Town', actionType: 'town' })),
    ...(zdir.fields_and_hunting_areas || []).map(z => ({ ...z, zoneCategory: 'Field Hunting Area', actionType: 'field' })),
    ...(zdir.regular_dungeons || []).map(z => ({ ...z, zoneCategory: 'Multi-Floor Dungeon', actionType: 'dungeon' })),
    ...(zdir.seven_signs_seal_catacombs || []).map(z => ({ ...z, zoneCategory: 'Seven Signs Catacomb', actionType: 'dungeon' })),
    ...(zdir.harbors_clanhalls_and_forts || []).map(z => ({ ...z, zoneCategory: 'Harbor / ClanHall / Fortress', actionType: 'fortress' }))
  ];
  return list;
}

function computeShortestAtlasZonePath(fromZoneId, toZoneId, tatlas) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const atlasDoc = tatlas || sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(atlasDoc);
  const byId = {};
  const adj = {};
  zones.forEach(z => {
    byId[z.zone_id] = z;
    if (z.studio_node_id) byId[z.studio_node_id] = z;
    if (!adj[z.zone_id]) adj[z.zone_id] = new Set();
  });
  zones.forEach(z => {
    const u = z.zone_id;
    (z.connected_zone_ids || []).forEach(nbRaw => {
      const nbObj = byId[nbRaw];
      const v = nbObj ? nbObj.zone_id : nbRaw;
      if (byId[v]) {
        adj[u].add(v);
        if (!adj[v]) adj[v] = new Set();
        adj[v].add(u);
      }
    });
  });

  const startZone = byId[fromZoneId] || zones[0];
  const endZone = byId[toZoneId] || zones[Math.min(1, zones.length - 1)];
  if (!startZone || !endZone) {
    return { pathIds: [], hops: [], totalAdenaFee: 0, origin: null, destination: null };
  }
  const sId = startZone.zone_id;
  const tId = endZone.zone_id;
  if (sId === tId) {
    const c = resolveAtlasFocusLoc(startZone.loc_coord || '-84120:243500', startZone.zone_id, startZone.studio_node_id);
    return {
      origin: startZone,
      destination: endZone,
      pathIds: [sId],
      totalAdenaFee: 0,
      hops: [{
        hopIndex: 1,
        zone: startZone,
        zoneId: sId,
        name: startZone.name,
        l2Analog: startZone.l2_reference_analog || '',
        levelBand: Array.isArray(startZone.level_band) ? `Lv.${startZone.level_band[0]}–${startZone.level_band[1]}` : 'Lv.1–20',
        travelMode: 'Origin Sanctuary / Spawn Anchor',
        adenaFee: 0,
        locCoord: startZone.loc_coord || '-84120:243500',
        svgX: c.svgX,
        svgY: c.svgY
      }]
    };
  }

  const visited = new Set([sId]);
  const parent = {};
  const queue = [sId];
  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === tId) {
      found = true;
      break;
    }
    const neighbors = Array.from(adj[curr] || []);
    for (let i = 0; i < neighbors.length; i++) {
      const nxt = neighbors[i];
      if (!visited.has(nxt)) {
        visited.add(nxt);
        parent[nxt] = curr;
        queue.push(nxt);
      }
    }
  }

  const pathIds = [];
  if (found) {
    let cur = tId;
    while (cur) {
      pathIds.unshift(cur);
      if (cur === sId) break;
      cur = parent[cur];
    }
  } else {
    pathIds.push(sId, tId);
  }

  let totalAdenaFee = 0;
  const hops = pathIds.map((zid, idx) => {
    const z = byId[zid] || startZone;
    const prevZ = idx > 0 ? (byId[pathIds[idx - 1]] || startZone) : null;
    const lvArr = Array.isArray(z.level_band) && z.level_band.length >= 2 ? z.level_band : [1, 20];
    const c = resolveAtlasFocusLoc(z.loc_coord || '-84120:243500', z.zone_id, z.studio_node_id);
    let travelMode = 'Origin Zone Anchor';
    let adenaFee = 0;
    if (idx > 0) {
      const bothTownOrHarbor = prevZ && ['town', 'fortress'].includes(prevZ.actionType) && ['town', 'fortress'].includes(z.actionType);
      const isDungeonEntry = z.actionType === 'dungeon';
      if (bothTownOrHarbor) {
        travelMode = '🌀 Gatekeeper Teleport';
        adenaFee = Math.max(450, lvArr[0] * 180);
      } else if (isDungeonEntry) {
        travelMode = '🕳️ Dungeon Portal Approach (or GK Teleport)';
        adenaFee = lvArr[0] <= 15 ? 0 : Math.max(350, lvArr[0] * 120);
      } else {
        travelMode = '🥾 Walking Highway / Road';
        adenaFee = 0;
      }
    }
    const prevC = prevZ ? resolveAtlasFocusLoc(prevZ.loc_coord || '-84120:243500', prevZ.zone_id, prevZ.studio_node_id) : c;
    const rawSvgDist = idx > 0 ? Math.hypot((c.svgX || 520) - (prevC.svgX || 520), (c.svgY || 250) - (prevC.svgY || 250)) : 0;
    const effSvgDist = idx > 0 ? Math.max(58, Math.min(135, rawSvgDist || 88)) : 0;
    const euclidKm = idx > 0 ? +((effSvgDist * 62.5) / 1000).toFixed(2) : 0;
    const roadKm = idx > 0 ? +(euclidKm * 1.45).toFixed(2) : 0;
    const runMinutes = idx > 0 ? Math.max(5, Math.round((roadKm * 1000) / (4.4 * 60))) : 0;
    totalAdenaFee += adenaFee;
    return {
      hopIndex: idx + 1,
      zone: z,
      zoneId: z.zone_id,
      name: z.name,
      l2Analog: z.l2_reference_analog || z.territory_name || '',
      levelBand: `Lv.${lvArr[0]}–${lvArr[1]}`,
      travelMode,
      adenaFee,
      euclidKm,
      roadKm,
      runMinutes,
      locCoord: z.loc_coord || '-84120:243500',
      svgX: c.svgX,
      svgY: c.svgY
    };
  });
  const totalRoadKm = +(hops.reduce((s, h) => s + (h.roadKm || 0), 0)).toFixed(1);
  const totalRunMinutes = hops.reduce((s, h) => s + (h.runMinutes || 0), 0);

  return {
    origin: startZone,
    destination: endZone,
    pathIds,
    hops,
    totalAdenaFee,
    totalRoadKm,
    totalRunMinutes
  };
}

function setAtlasRouteEndpoints(fromZoneId, toZoneId) {
  if (fromZoneId) {
    ATLAS_ROUTE_FROM_ID = String(fromZoneId);
    ATLAS_STATE_STORE.routeFromId = ATLAS_ROUTE_FROM_ID;
  }
  if (toZoneId) {
    ATLAS_ROUTE_TO_ID = String(toZoneId);
    ATLAS_STATE_STORE.routeToId = ATLAS_ROUTE_TO_ID;
  }
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  if (STUDIO_MAP_ZOOM >= 3.5) {
    STUDIO_MAP_ZOOM = 2.4;
  }
  STUDIO_MAP_TOWN_INTERIOR = false;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const routeRes = computeShortestAtlasZonePath(ATLAS_ROUTE_FROM_ID, ATLAS_ROUTE_TO_ID, sp.tShapedWorldAtlas || {});
  if (routeRes.destination && routeRes.destination.loc_coord) {
    STUDIO_MAP_LOC = resolveAtlasFocusLoc(routeRes.destination.loc_coord, routeRes.destination.zone_id, routeRes.destination.studio_node_id);
  }
  writeUrlState(false);
  render();
}

function openAtlasRouteFinalHop(zoneId) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(tatlas);
  const z = zones.find(item => item.zone_id === zoneId || item.studio_node_id === zoneId);
  if (!z) return;
  if (z.actionType === 'dungeon') {
    const mf = (tatlas.multi_floor_dungeons || []).find(d => d.dungeon_id === z.zone_id || d.studio_node_id === z.studio_node_id);
    const firstFloor = (mf && mf.floors && mf.floors[0] && mf.floors[0].floor_id) || 'B1';
    openDungeonSubMap(z.zone_id, firstFloor);
  } else if (z.actionType === 'town') {
    focusTownStreetBlueprint(z.studio_node_id || z.zone_id, z.loc_coord || '');
  } else if (z.actionType === 'fortress') {
    focusFortressBlueprint(z.zone_id, z.loc_coord || '');
  } else {
    focusFieldTacticalBlueprint(z.zone_id, z.loc_coord || '');
  }
}

function selectDungeonRoomPoi(poiJsonStr, evt) {
  return selectStudioMapPoi(poiJsonStr, evt);
}

function setAtlasOmniSearch(query) {
  ATLAS_OMNI_TRAY_DISMISSED = false;
  ATLAS_OMNI_SEARCH_QUERY = String(query || '');
  ATLAS_STATE_STORE.omniSearchQuery = ATLAS_OMNI_SEARCH_QUERY;
  writeUrlState(false);
  render();
}

function clearAtlasOmniSearch() {
  ATLAS_OMNI_SEARCH_QUERY = '';
  ATLAS_STATE_STORE.omniSearchQuery = '';
  writeUrlState(false);
  render();
}

function setTownBlueprintMode(mode) {
  ATLAS_STATE_STORE.townBlueprintMode = mode === 'schematic' ? 'schematic' : 'parchment';
  writeUrlState(false);
  render();
}

function resolveNearestZoneFromPanAndLoc(
  zoomVal = STUDIO_MAP_ZOOM,
  locObj = STUDIO_MAP_LOC,
  panX = STUDIO_MAP_PAN_X,
  panY = STUDIO_MAP_PAN_Y
) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const towns = getAllAtlasTownEntries(tatlas);
  const fields = getAllAtlasFieldEntries(tatlas);
  const forts = getAllAtlasFortressEntries(tatlas);

  let targetLoc = clampWorldLocCoord(locObj || STUDIO_MAP_LOC);
  if ((panX !== 0 || panY !== 0) && (!locObj || locObj === STUDIO_MAP_LOC)) {
    const effScale = Math.max(1.0, zoomVal);
    const panSvgX = Math.max(30, Math.min(1010, Math.round((targetLoc.svgX || 520) - panX / effScale)));
    const panSvgY = Math.max(30, Math.min(470, Math.round((targetLoc.svgY || 250) - panY / effScale)));
    targetLoc = svgToL2Loc(panSvgX, panSvgY);
  }

  let nearestTown = towns[0] || { studio_node_id: 'town-lantern-hollow', zone_id: 'zone-town-lantern-hollow' };
  let minTownDist = Infinity;
  towns.forEach(t => {
    const c = clampWorldLocCoord(t.loc_coord || '-84120:243500');
    const dist = Math.hypot(c.x - targetLoc.x, c.y - targetLoc.y);
    if (dist < minTownDist) {
      minTownDist = dist;
      nearestTown = t;
    }
  });

  let nearestField = fields[0] || null;
  let minFieldDist = Infinity;
  fields.forEach(f => {
    const c = clampWorldLocCoord(f.loc_coord || '72986:113330');
    const dist = Math.hypot(c.x - targetLoc.x, c.y - targetLoc.y);
    if (dist < minFieldDist) {
      minFieldDist = dist;
      nearestField = f;
    }
  });

  let nearestFort = forts[0] || null;
  let minFortDist = Infinity;
  forts.forEach(h => {
    const c = clampWorldLocCoord(h.loc_coord || '-96200:258400');
    const dist = Math.hypot(c.x - targetLoc.x, c.y - targetLoc.y);
    if (dist < minFortDist) {
      minFortDist = dist;
      nearestFort = h;
    }
  });

  ATLAS_FOCUSED_TOWN_ID = nearestTown.studio_node_id || nearestTown.zone_id || 'town-lantern-hollow';
  ATLAS_FOCUSED_FIELD_ID = (nearestField && (nearestField.zone_id || nearestField.studio_node_id)) || '';
  ATLAS_FOCUSED_FORTRESS_ID = (nearestFort && (nearestFort.zone_id || nearestFort.studio_node_id)) || '';

  // Focus hints only: zoom level never selects or enters a town/field blueprint (explicit lens buttons do).
  return {
    townId: ATLAS_FOCUSED_TOWN_ID,
    fieldId: ATLAS_FOCUSED_FIELD_ID,
    fortressId: ATLAS_FOCUSED_FORTRESS_ID,
    nearestKind: minTownDist <= Math.min(minFieldDist, minFortDist)
      ? 'town'
      : (minFieldDist <= minFortDist ? 'field' : 'fortress')
  };
}

function clampWorldLocCoord(locStrOrObj) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const spec = tatlas.world_grid_spec || {};
  const bx = spec.coord_bounds_x || [-131072, 229376];
  const by = spec.coord_bounds_y || [-262144, 262144];
  let rawX = -84120;
  let rawY = 243500;
  if (typeof locStrOrObj === 'string' && locStrOrObj.includes(':')) {
    const parts = locStrOrObj.split(':');
    const px = parseInt(parts[0], 10);
    const py = parseInt(parts[1], 10);
    if (Number.isFinite(px) && Number.isFinite(py)) {
      rawX = px;
      rawY = py;
    }
  } else if (locStrOrObj && typeof locStrOrObj === 'object') {
    if (Number.isFinite(locStrOrObj.x)) rawX = locStrOrObj.x;
    if (Number.isFinite(locStrOrObj.y)) rawY = locStrOrObj.y;
  }
  const cx = Math.max(bx[0], Math.min(bx[1], Math.round(rawX)));
  const cy = Math.max(by[0], Math.min(by[1], Math.round(rawY)));
  const svgX = Math.max(30, Math.min(1010, Math.round(((cx - bx[0]) / Math.max(1, bx[1] - bx[0])) * 980 + 30)));
  const svgY = Math.max(30, Math.min(470, Math.round(((cy - by[0]) / Math.max(1, by[1] - by[0])) * 440 + 30)));
  return { x: cx, y: cy, svgX, svgY };
}

function getSemanticZoomLodTier(zoomVal = STUDIO_MAP_ZOOM) {
  if (zoomVal >= 4.5 && STUDIO_MAP_TOWN_INTERIOR) return 3; // Tier 3: Town Street, Building & Shop/Refinement Blueprint (4.5x - 12.0x)
  if (zoomVal >= 2.2) return 2; // Tier 2: Regional Roads, Level Bands & Dungeon Entrance Portals (2.2x - 4.5x)
  return 1;                     // Tier 1: Macro Geography, Travel Highways & 6 Race Spawns (1.0x - 2.2x)
}

function resolveActiveFieldOrFortEntry() {
  const id = ATLAS_STATE_STORE.activeFieldOrFortId;
  if (!id) return null;
  const tatlas = ((DATA && DATA.studioPerspectives) || {}).tShapedWorldAtlas || {};
  return getAllAtlasFieldEntries(tatlas).find(f => f.zone_id === id || f.studio_node_id === id)
    || getAllAtlasFortressEntries(tatlas).find(h => h.zone_id === id || h.studio_node_id === id)
    || null;
}

function isStudioMapOverland() {
  return !ATLAS_STATE_STORE.activeDungeonId && !resolveActiveFieldOrFortEntry() && !STUDIO_MAP_TOWN_INTERIOR;
}

// Single source for the viewport scale: overland is continuous (scale == zoom, up to 8x);
// blueprints/sub-maps keep their 5.2x == 1:1 framing from 4.5x upward.
function getStudioMapEffScale(zoomVal = STUDIO_MAP_ZOOM) {
  if (isStudioMapOverland()) return zoomVal;
  return Math.max(0.85, +(zoomVal / 5.2).toFixed(2));
}

// Client (CSS px) -> outer atlas SVG viewBox coords (0..1040 x 0..500), honouring the
// xMidYMid meet letterbox. Prefers the browser CTM; falls back to letterbox math.
function clientToAtlasSvgPoint(svgEl, clientX, clientY) {
  if (!svgEl) return null;
  if (typeof svgEl.getScreenCTM === 'function' && typeof svgEl.createSVGPoint === 'function') {
    const ctm = svgEl.getScreenCTM();
    if (ctm) {
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const out = pt.matrixTransform(ctm.inverse());
      return { x: out.x, y: out.y };
    }
  }
  if (typeof svgEl.getBoundingClientRect !== 'function') return null;
  const rect = svgEl.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const scale = Math.min(rect.width / 1040, rect.height / 500);
  const offX = (rect.width - 1040 * scale) / 2;
  const offY = (rect.height - 500 * scale) / 2;
  return { x: (clientX - rect.left - offX) / scale, y: (clientY - rect.top - offY) / scale };
}

// One pan clamp for wheel, buttons, drag and arrow keys.
// Guardrail V-15: maxPan scales with effScale * halfCanvas so eastern/western coastal zones (|x - 520| up to 440px)
// never hit asymmetric clamping during zoom-in/zoom-out round-trips or sub-map exit anchoring.
function clampStudioMapPan(effScale = getStudioMapEffScale()) {
  const maxPanX = Math.max(480, effScale * 520);
  const maxPanY = Math.max(240, effScale * 250);
  STUDIO_MAP_PAN_X = Math.max(-maxPanX, Math.min(maxPanX, STUDIO_MAP_PAN_X));
  STUDIO_MAP_PAN_Y = Math.max(-maxPanY, Math.min(maxPanY, STUDIO_MAP_PAN_Y));
}

// Guardrail V-15: When stepping out of a Town, Field, or Dungeon sub-map to regional overland (zoom > 1.05),
// keep the exited zone anchored at the viewport center (520, 250) instead of snapping pan back to (0, 0).
function anchorOverlandCameraOnCurrentZone(targetZoom = STUDIO_MAP_ZOOM, explicitId = '', explicitLoc = null) {
  const effScale = Math.max(0.85, Number(targetZoom) || 1.0);
  if (effScale <= 1.05) {
    STUDIO_MAP_PAN_X = 0;
    STUDIO_MAP_PAN_Y = 0;
    STUDIO_MAP_PAN_SPACE = 'overland';
    return { svgX: 520, svgY: 250, panX: 0, panY: 0 };
  }
  const candId = explicitId
    || ATLAS_STATE_STORE.activeFieldOrFortId
    || ATLAS_STATE_STORE.activeDungeonId
    || ATLAS_STATE_STORE.activeTownId
    || '';
  const resolved = resolveAtlasFocusLoc(explicitLoc || STUDIO_MAP_LOC, candId, 'zone-' + candId);
  const zx = (resolved && Number.isFinite(resolved.svgX)) ? resolved.svgX : 520;
  const zy = (resolved && Number.isFinite(resolved.svgY)) ? resolved.svgY : 250;
  STUDIO_MAP_PAN_X = +((520 - zx) * effScale).toFixed(2);
  STUDIO_MAP_PAN_Y = +((250 - zy) * effScale).toFixed(2);
  STUDIO_MAP_PAN_SPACE = 'overland';
  clampStudioMapPan(effScale);
  return { svgX: zx, svgY: zy, panX: STUDIO_MAP_PAN_X, panY: STUDIO_MAP_PAN_Y };
}

let ATLAS_SUBMAP_TRANSITION_SEQ = 0;

function triggerSmoothSubMapTransition() {
  ATLAS_SUBMAP_TRANSITION_SEQ += 1;
  if (typeof document !== 'undefined') {
    const applyCls = (el) => {
      if (!el) return;
      if (el.classList && typeof el.classList.add === 'function') {
        el.classList.add('atlas-submap-smooth-transition');
      }
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('data-transition-seq', String(ATLAS_SUBMAP_TRANSITION_SEQ));
      }
    };
    applyCls(document.getElementById('dedicatedWorldAtlasSvg'));
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => applyCls(document.getElementById('dedicatedWorldAtlasSvg')));
    }
  }
  return ATLAS_SUBMAP_TRANSITION_SEQ;
}

function stepOutSubMapToOverlandRegional(targetZoom = 2.6) {
  triggerSmoothSubMapTransition();
  const prevId = ATLAS_STATE_STORE.activeDungeonId
    || ATLAS_STATE_STORE.activeFieldOrFortId
    || (STUDIO_MAP_TOWN_INTERIOR ? (ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow') : '');
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  ATLAS_FOCUSED_FIELD_ID = '';
  ATLAS_FOCUSED_FORTRESS_ID = '';
  STUDIO_MAP_TOWN_INTERIOR = false;
  ATLAS_STATE_STORE.toastMessage = '';
  STUDIO_MAP_ZOOM = Math.max(1.0, Math.min(4.2, Number(targetZoom) || 2.6));
  anchorOverlandCameraOnCurrentZone(STUDIO_MAP_ZOOM, prevId);
  writeUrlState(true);
  render();
  triggerSmoothSubMapTransition();
}

// Google Maps-style live metric scale bar calculation (50 m / 100 m / 200 m / 500 m / 1 km / 2 km / 5 km / 10 km)
function computeAtlasGoogleScaleBarSpec(zoomVal = STUDIO_MAP_ZOOM, spatialCtx = null) {
  const ctx = spatialCtx || (typeof getAtlasSpatialContext === 'function' ? getAtlasSpatialContext() : 'overland');
  const eff = Math.max(0.85, Number(zoomVal) || 1.0);
  // Base meters across the 1040px SVG canvas at 1.0x for each spatial lens:
  // Overland macro continent = 16,640m across (16m/px at 1x); Field hunting zone = 2,900m across;
  // Town interior = 1,450m across; Dungeon floor = 1,100m across.
  // Recalibrated for 30-Minute Town-to-Town Run Scale (~8.0 km winding road / ~5.5 km Euclidean between adjacent towns):
  // Overland macro continent = 65,000m across (62.5m/px at 1x); adjacent towns (~88px apart) = 5.5km Euclidean = 8.0km winding road (1.45x tortuosity) = ~30 min run at 4.4 m/s.
  const baseMetersPerSvgPx = ctx === 'dungeon'
    ? (1.05 * 4.5)
    : (ctx === 'town'
      ? (1.38 * 4.5)
      : (ctx === 'field' ? (2.78 * 2.8) : 62.5));
  const metersPerSvgPx = baseMetersPerSvgPx / eff;
  const niceSteps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  let bestMeters = 500;
  let bestPx = 100;
  let bestScore = Infinity;
  for (const m of niceSteps) {
    const px = m / metersPerSvgPx;
    const score = (px >= 58 && px <= 148)
      ? Math.abs(px - 96)
      : (Math.abs(px - 96) + 500);
    if (score < bestScore) {
      bestScore = score;
      bestMeters = m;
      bestPx = px;
    }
  }
  const barWidthPx = Math.max(54, Math.min(152, Math.round(bestPx)));
  const label = bestMeters >= 1000 ? `${bestMeters / 1000} km` : `${bestMeters} m`;
  const tortuosity = ctx === 'overland' ? 1.45 : 1.15;
  const roadMeters = Math.round(bestMeters * tortuosity);
  const walkSec = Math.max(1, Math.round(roadMeters / 4.4));
  const subLabel = walkSec >= 60
    ? `~${Math.round(walkSec / 60)} min run · ${(roadMeters / 1000).toFixed(1)}km road (Town↔Town ~30m)`
    : `~${walkSec}s sprint`;
  return {
    meters: bestMeters,
    roadMeters,
    barWidthPx,
    label,
    subLabel,
    townToTownSpec: '~30 min Town-to-Town (~8.0 km road)',
    metersPerSvgPx: +metersPerSvgPx.toFixed(3),
    context: ctx,
    zoom: eff
  };
}

// Loc-driven focus (route planner, dungeon entrances, quests, siege, deep links): when the target is an
// overland landmark, aim the crosshair at the landmark pin itself instead of the raw projected loc.
function ensureAtlasAll63ZonePinAnchors(tatlasOpt) {
  if (ATLAS_OVERLAND_PIN_ANCHORS.__all63Done && !tatlasOpt) return;
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  const doc = tatlasOpt || sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(doc);
  if (!zones.length || typeof getAtlasPlacedZonePoints !== 'function') return;
  const placedById = getAtlasPlacedZonePoints(doc, zones);
  zones.forEach(z => {
    const a = placedById[z.zone_id];
    if (!a) return;
    ATLAS_OVERLAND_PIN_ANCHORS['id:' + z.zone_id] = a;
    const bare = String(z.zone_id || '').replace(/^zone-/, '');
    if (bare && !ATLAS_OVERLAND_PIN_ANCHORS['id:' + bare]) ATLAS_OVERLAND_PIN_ANCHORS['id:' + bare] = a;
    if (z.studio_node_id && !ATLAS_OVERLAND_PIN_ANCHORS['id:' + z.studio_node_id]) ATLAS_OVERLAND_PIN_ANCHORS['id:' + z.studio_node_id] = a;
    if (z.loc_coord) {
      const c = clampWorldLocCoord(z.loc_coord);
      const lk = 'loc:' + c.x + ':' + c.y;
      if (!ATLAS_OVERLAND_PIN_ANCHORS[lk]) ATLAS_OVERLAND_PIN_ANCHORS[lk] = a;
    }
  });
  ATLAS_OVERLAND_PIN_ANCHORS.__all63Done = true;
}

function resolveAtlasFocusLoc(locStrOrObj, ...ids) {
  ensureAtlasAll63ZonePinAnchors();
  const loc = clampWorldLocCoord(locStrOrObj);
  const hit = ids.map(id => id && ATLAS_OVERLAND_PIN_ANCHORS['id:' + id]).find(Boolean)
    || ATLAS_OVERLAND_PIN_ANCHORS['loc:' + loc.x + ':' + loc.y];
  return hit ? { ...loc, svgX: hit.x, svgY: hit.y } : loc;
}

// A context jump (town / field / dungeon / search) drops a stale selection unless it targets that selection.
function clearAtlasSelectionUnlessTarget(targetId) {
  const poi = STUDIO_MAP_SELECTED_POI;
  if (!poi) return;
  const ids = [poi.inspectId, poi.townBlueprintId, poi.dungeonWarpId, poi.zoneId, poi.id].filter(Boolean);
  const t = String(targetId || '');
  if (t && ids.some(id => id === t || 'zone-' + id === t || id === 'zone-' + t)) return;
  STUDIO_MAP_SELECTED_POI = null;
}

function registerAtlasOverlandPinAnchors(landmarks, tatlas) {
  const zones = getAllAtlas63Zones(tatlas);
  const dungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  landmarks.forEach(lm => {
    const a = { x: lm.x, y: lm.y };
    const ids = [lm.id, 'zone-' + lm.id, lm.townBlueprintId, lm.dungeonWarpId].filter(Boolean);
    const locs = [lm.loc];
    zones.forEach(z => {
      if (ids.includes(z.zone_id) || ids.includes(z.studio_node_id)) {
        ids.push(z.zone_id, z.studio_node_id);
        locs.push(z.loc_coord);
      }
    });
    dungeons.forEach(d => {
      if (ids.includes(d.dungeon_id) || ids.includes(d.studio_node_id)) locs.push(d.entrance_loc);
    });
    ids.filter(Boolean).forEach(id => { ATLAS_OVERLAND_PIN_ANCHORS['id:' + id] = a; });
    locs.filter(Boolean).forEach(l => {
      const c = clampWorldLocCoord(l);
      ATLAS_OVERLAND_PIN_ANCHORS['loc:' + c.x + ':' + c.y] = a;
    });
  });
  ensureAtlasAll63ZonePinAnchors(tatlas);
}

// Outer SVG coords -> world (studioCartoViewport content) coords, inverting the viewport transform.
function atlasSvgToWorldPoint(svgX, svgY) {
  const s = Math.max(0.1, getStudioMapEffScale());
  return { x: 520 + (svgX - 520 - STUDIO_MAP_PAN_X) / s, y: 250 + (svgY - 250 - STUDIO_MAP_PAN_Y) / s };
}

function getAtlasBossHierarchyChains(tatlas) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const doc = tatlas || sp.tShapedWorldAtlas || {};
  return Array.isArray(doc.boss_hierarchy_chains) ? doc.boss_hierarchy_chains : [];
}

function locToAtlasSvg(xOrLoc, yOpt) {
  if (typeof xOrLoc === 'number' && typeof yOpt === 'number') {
    return clampWorldLocCoord({ x: xOrLoc, y: yOpt });
  }
  return clampWorldLocCoord(xOrLoc);
}

function setStudioCartoTheme(theme) {
  STUDIO_CARTO_THEME = theme === 'google' ? 'google' : 'l2hub';
  render();
}

function svgToL2Loc(svgX, svgY) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const spec = (sp.tShapedWorldAtlas && sp.tShapedWorldAtlas.world_grid_spec) || {};
  const bx = spec.coord_bounds_x || [-131072, 229376];
  const by = spec.coord_bounds_y || [-262144, 262144];
  const lx = Math.round(bx[0] + ((svgX - 30) / 980) * (bx[1] - bx[0]));
  const ly = Math.round(by[0] + ((svgY - 30) / 440) * (by[1] - by[0]));
  return {
    x: Math.max(bx[0], Math.min(bx[1], lx)),
    y: Math.max(by[0], Math.min(by[1], ly)),
    svgX: Math.round(svgX),
    svgY: Math.round(svgY)
  };
}

function zoomStudioMap(delta, reset = false, targetZoom = null, pivotSvgX = null, pivotSvgY = null) {
  // Zoom is pure camera: it never rewrites STUDIO_MAP_LOC and never auto-enters a field/town
  // blueprint. Only explicit lens buttons (focusTownStreetBlueprint / focusFieldTacticalBlueprint) do.
  const prevTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const prevEffScale = getStudioMapEffScale(STUDIO_MAP_ZOOM);
  const prevTownInterior = STUDIO_MAP_TOWN_INTERIOR;
  const maxZoom = isStudioMapOverland() ? 8.0 : 12.0;
  if (reset) {
    STUDIO_MAP_ZOOM = 1.0;
    STUDIO_MAP_PAN_X = 0;
    STUDIO_MAP_PAN_Y = 0;
    STUDIO_MAP_TOWN_INTERIOR = false;
    ATLAS_STATE_STORE.toastMessage = '';
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
  } else if (targetZoom !== null && Number.isFinite(targetZoom)) {
    STUDIO_MAP_ZOOM = Math.max(0.85, Math.min(maxZoom, +targetZoom.toFixed(2)));
  } else {
    STUDIO_MAP_ZOOM = Math.max(0.85, Math.min(maxZoom, +(STUDIO_MAP_ZOOM + delta).toFixed(2)));
  }
  // Zooming out of a Town Street or Field/Fortress blueprint below 4.5x returns smoothly to the unified overland map
  // while keeping the exited zone centered at (520, 250) at the exact current zoom instead of jumping or resetting to 1.0x.
  const wasSubMap = Boolean(STUDIO_MAP_TOWN_INTERIOR || ATLAS_STATE_STORE.activeFieldOrFortId);
  if (wasSubMap && STUDIO_MAP_ZOOM < 4.5) {
    const exitedZoneId = ATLAS_STATE_STORE.activeFieldOrFortId || ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow';
    STUDIO_MAP_TOWN_INTERIOR = false;
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
    anchorOverlandCameraOnCurrentZone(STUDIO_MAP_ZOOM, exitedZoneId);
  }
  const nextTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const nextEffScale = getStudioMapEffScale(STUDIO_MAP_ZOOM);
  if (!reset && prevTownInterior === STUDIO_MAP_TOWN_INTERIOR && pivotSvgX !== null && pivotSvgY !== null && Number.isFinite(pivotSvgX) && Number.isFinite(pivotSvgY)) {
    // Keep the world point under the pivot stationary: pan' = (p - c) - (s'/s) * (p - c - pan)
    const cx = 520;
    const cy = 250;
    const ratio = nextEffScale / Math.max(0.1, prevEffScale);
    STUDIO_MAP_PAN_X = (pivotSvgX - cx) - ratio * (pivotSvgX - cx - STUDIO_MAP_PAN_X);
    STUDIO_MAP_PAN_Y = (pivotSvgY - cy) - ratio * (pivotSvgY - cy - STUDIO_MAP_PAN_Y);
  }
  clampStudioMapPan(nextEffScale);
  writeUrlState(false);
  const crossedMicroLod = (prevEffScale < 1.8 && nextEffScale >= 1.8) || (prevEffScale >= 1.8 && nextEffScale < 1.8)
    || (prevEffScale < 3.4 && nextEffScale >= 3.4) || (prevEffScale >= 3.4 && nextEffScale < 3.4);
  if (prevTier !== nextTier || prevTownInterior !== STUDIO_MAP_TOWN_INTERIOR || wasSubMap !== Boolean(STUDIO_MAP_TOWN_INTERIOR || ATLAS_STATE_STORE.activeFieldOrFortId) || crossedMicroLod || reset || targetZoom !== null) {
    render();
  } else {
    applyStudioMapTransform();
  }
}

function positionAtlasOmniTray() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  const bar = document.querySelector('.joy-lens-bar .joy-omni-command-bar');
  const root = document.documentElement;
  if (!bar || !root || !root.style || typeof bar.getBoundingClientRect !== 'function') return;
  const r = bar.getBoundingClientRect();
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1440;
  const width = Math.min(Math.max(r.width, 420), vw - 32);
  const left = Math.max(16, Math.min(r.left, vw - 16 - width));
  root.style.setProperty('--atlas-omni-tray-left', `${Math.round(left)}px`);
  root.style.setProperty('--atlas-omni-tray-top', `${Math.round(r.bottom + 4)}px`);
  root.style.setProperty('--atlas-omni-tray-width', `${Math.round(width)}px`);
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', () => positionAtlasOmniTray());
  window.addEventListener('scroll', () => positionAtlasOmniTray(), true);
  window.addEventListener('focusin', () => positionAtlasOmniTray());
}

function zoomActiveAtlasEngine(delta, reset = false, targetZoom = null) {
  if (getAtlasEffectiveEngineMode() === '3d_map3d') {
    if (reset) {
      // F-156 B5: "1:1" must also undo what the HUD's 5.2x set (TOWN scene, 2D zoom), not just the 3D camera.
      zoomStudioMap(0, true);
      setAtlas3dOption('reset', true);
    } else {
      const next = targetZoom !== null ? targetZoom : ATLAS_3D_STATE.zoom * (delta > 0 ? 1.14 : 0.88);
      ATLAS_3D_STATE.zoom = Math.max(0.45, Math.min(3.5, +next.toFixed(3)));
      redrawAtlas3dInPlace();
      scheduleAtlas3dCameraUrlWrite();
    }
    const lbl = document.getElementById('studioCartoZoomReadout');
    if (lbl) lbl.textContent = `${ATLAS_3D_STATE.zoom.toFixed(2)}\u00d7 3D`;
    return;
  }
  zoomStudioMap(delta, reset, targetZoom, reset ? null : 520, reset ? null : 250);
}

// F-160: transparent hit box centred on a pin anchor (x,y); sized in CSS by --atlas-hit-size (coarse pointers only).
function atlasPinHitRect(x, y) {
  return `<rect class="atlas-pin-hit" x="${x}" y="${y}" width="44" height="44" aria-hidden="true"/>`;
}

// F-160: 44 CSS px expressed in a pin's local units = 44 / (svg px-per-unit * map zoom * pin inverse zoom).
function updateAtlasPinHitSize() {
  const svgEl = document.getElementById('dedicatedWorldAtlasSvg');
  if (!svgEl || !svgEl.getBoundingClientRect) return;
  if (!svgEl.__atlasHitRo && typeof ResizeObserver === 'function') { svgEl.__atlasHitRo = new ResizeObserver(() => updateAtlasPinHitSize()); svgEl.__atlasHitRo.observe(svgEl); }
  const r = svgEl.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const unit = Math.min(r.width / 1040, r.height / 500);
  const eff = getStudioMapEffScale(STUDIO_MAP_ZOOM);
  const perLocal = unit * eff * (1 / Math.max(1, eff));
  svgEl.style.setProperty('--atlas-hit-size', `${(44 / Math.max(perLocal, 0.01)).toFixed(3)}px`);
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', () => updateAtlasPinHitSize());
}

function applyStudioMapTransform() {
  const g = document.getElementById('studioCartoViewport');
  const svgEl = document.getElementById('dedicatedWorldAtlasSvg');
  const lbl = document.getElementById('studioCartoZoomReadout');
  const tierBadge = document.getElementById('studioSemanticLodBadge');
  const tier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const effScale = getStudioMapEffScale(STUDIO_MAP_ZOOM);
  const invZoom = (1 / Math.max(1, effScale)).toFixed(4);
  if (svgEl && svgEl.style && typeof svgEl.style.setProperty === 'function') {
    svgEl.style.setProperty('--atlas-inv-zoom', invZoom);
    updateAtlasPinHitSize();
  } else if (svgEl && svgEl.style) {
    svgEl.style['--atlas-inv-zoom'] = invZoom;
  }
  if (g) {
    const cx = 520;
    const cy = 250;
    g.setAttribute(
      'transform',
      `translate(${cx + STUDIO_MAP_PAN_X}, ${cy + STUDIO_MAP_PAN_Y}) scale(${effScale}) translate(${-cx}, ${-cy})`
    );
  }
  if (lbl) {
    lbl.textContent = `${STUDIO_MAP_ZOOM.toFixed(2)}\u00d7`;
  }
  syncAtlasOlViewFromApp();
  if (tierBadge) {
    tierBadge.textContent = tier === 3
      ? '🏘️ LOD Tier 3: Town Street & Shop/Refinement Blueprint (4.5×–12.0×)'
      : (tier === 2 ? '🛤️ LOD Tier 2: Regional Roads, Lv.Bands & Dungeon Portals (2.2×–8.0×)' : '🌍 LOD Tier 1: Macro Geography & 6 Race Spawns (1.0×–2.2×)');
  }
  const scaleSpec = computeAtlasGoogleScaleBarSpec(STUDIO_MAP_ZOOM);
  const scaleLblEl = document.getElementById('studioGoogleScaleBarLabel');
  const scaleSubEl = document.getElementById('studioGoogleScaleBarSub');
  const scaleLineEl = document.getElementById('studioGoogleScaleBarLine');
  const scaleWidgetEl = document.getElementById('studioGoogleScaleBarWidget');
  if (scaleLblEl) scaleLblEl.textContent = scaleSpec.label;
  if (scaleSubEl) scaleSubEl.textContent = scaleSpec.subLabel;
  if (scaleLineEl && scaleLineEl.style) scaleLineEl.style.width = `${scaleSpec.barWidthPx}px`;
  if (scaleWidgetEl && scaleWidgetEl.setAttribute) {
    scaleWidgetEl.setAttribute('data-scale-meters', String(scaleSpec.meters));
    scaleWidgetEl.setAttribute('data-scale-label', scaleSpec.label);
  }
}

let ATLAS_AUTO_DRILL_ON_ZOOM = true;
let ATLAS_ACTIVE_BIOME_THEME_ID = 'grassland';
let ATLAS_BIOME_USER_OVERRIDE = false;

function toggleAtlasAutoDrillOnZoom() {
  ATLAS_AUTO_DRILL_ON_ZOOM = !ATLAS_AUTO_DRILL_ON_ZOOM;
  render();
}

function setAtlasActiveBiomeTheme(themeId) {
  ATLAS_ACTIVE_BIOME_THEME_ID = themeId || 'grassland';
  ATLAS_BIOME_USER_OVERRIDE = Boolean(themeId);
  render();
}

function smartDrillAt52x() {
  const poi = STUDIO_MAP_SELECTED_POI;
  if (poi && poi.dungeonWarpId) {
    openDungeonSubMap(poi.dungeonWarpId, poi.dungeonFloorId || 'B1');
    return;
  }
  const targetId = (poi && (poi.fieldTacticalBlueprintId || poi.townBlueprintId || poi.inspectId || poi.zoneId))
    || ATLAS_STATE_STORE.activeFieldOrFortId
    || ATLAS_STATE_STORE.activeTownId
    || 'town-lantern-hollow';
  if (getAtlasEffectiveEngineMode() === '3d_map3d') {
    zoomActiveAtlasEngine(0, false, 2.6);
    return;
  }
  focusZoneOnUnifiedWorldMap(targetId, 5.2);
}

function maybeAutoDrillStudioSubMapAtPoint(delta, pivotSvgX, pivotSvgY) {
  if (!ATLAS_AUTO_DRILL_ON_ZOOM) return;
  if (delta < 0 && STUDIO_MAP_ZOOM < 3.5 && (ATLAS_STATE_STORE.activeDungeonId || ATLAS_STATE_STORE.activeFieldOrFortId)) {
    const exitedZoneId = ATLAS_STATE_STORE.activeDungeonId || ATLAS_STATE_STORE.activeFieldOrFortId;
    ATLAS_ACTIVE_DUNGEON_ID = '';
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
    STUDIO_MAP_ZOOM = 2.6;
    anchorOverlandCameraOnCurrentZone(STUDIO_MAP_ZOOM, exitedZoneId);
    writeUrlState(false);
    render();
    return;
  }
  if (delta <= 0 || !isStudioMapOverland() || STUDIO_MAP_ZOOM < 4.2) return;
  const wp = atlasSvgToWorldPoint(
    Number.isFinite(pivotSvgX) ? pivotSvgX : 520,
    Number.isFinite(pivotSvgY) ? pivotSvgY : 250
  );
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(tatlas);
  const placed = (typeof getAtlasPlacedZonePoints === 'function') ? getAtlasPlacedZonePoints(tatlas, zones) : {};
  let bestZone = null;
  let bestDist = 48;
  zones.forEach(z => {
    const pt = placed[z.zone_id];
    if (!pt) return;
    const d = Math.hypot(pt.x - wp.x, pt.y - wp.y);
    if (d < bestDist) {
      bestDist = d;
      bestZone = z;
    }
  });
  if (!bestZone && STUDIO_MAP_SELECTED_POI) {
    const poi = STUDIO_MAP_SELECTED_POI;
    if (poi.dungeonWarpId) {
      openDungeonSubMap(poi.dungeonWarpId, poi.dungeonFloorId || 'B1');
      return;
    }
    if (poi.townBlueprintId) {
      focusTownStreetBlueprint(poi.townBlueprintId, poi.locCoord || '');
      return;
    }
    if (poi.fieldTacticalBlueprintId) {
      focusFieldTacticalBlueprint(poi.fieldTacticalBlueprintId, poi.locCoord || '');
      return;
    }
  }
  if (!bestZone) return;
  if (bestZone.actionType === 'dungeon') {
    const defFloor = (bestZone.zone_id.includes('pendulum') || bestZone.zone_id.includes('chronometer') || bestZone.zone_id.includes('tower')) ? '1F' : 'B1';
    openDungeonSubMap(bestZone.zone_id, defFloor);
  } else if (bestZone.actionType === 'town') {
    focusTownStreetBlueprint(bestZone.studio_node_id || bestZone.zone_id, bestZone.loc_coord || '');
  } else if (bestZone.actionType === 'field' || bestZone.actionType === 'fortress') {
    focusFieldTacticalBlueprint(bestZone.zone_id, bestZone.loc_coord || '');
  }
}

function onStudioMapWheel(evt) {
  evt.preventDefault();
  const step = STUDIO_MAP_ZOOM >= 4.0 ? 0.65 : 0.35;
  const delta = evt.deltaY < 0 ? step : -step;
  let pivotX = null;
  let pivotY = null;
  const svg = evt.currentTarget || document.getElementById('dedicatedWorldAtlasSvg');
  if (svg && evt.clientX !== undefined) {
    const pt = clientToAtlasSvgPoint(svg, evt.clientX, evt.clientY);
    if (pt) {
      pivotX = pt.x;
      pivotY = pt.y;
    }
  }
  zoomStudioMap(delta, false, null, pivotX, pivotY);
}

function focusZoneOnUnifiedWorldMap(zoneId, targetZoom = 4.6) {
  triggerSmoothSubMapTransition();
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  ATLAS_FOCUSED_FIELD_ID = '';
  ATLAS_FOCUSED_FORTRESS_ID = '';
  STUDIO_MAP_TOWN_INTERIOR = false;
  const resolved = resolveAtlasFocusLoc(STUDIO_MAP_LOC, zoneId, 'zone-' + zoneId);
  if (resolved) STUDIO_MAP_LOC = resolved;
  STUDIO_MAP_ZOOM = Math.max(1.0, Math.min(8.0, Number(targetZoom) || 4.6));
  anchorOverlandCameraOnCurrentZone(STUDIO_MAP_ZOOM, zoneId, resolved);
  writeUrlState(true);
  render();
  scrollCanvasIntoViewSmooth();
}

function setAtlasFilter(cat) {
  ATLAS_STATE_STORE.filter = cat || 'All';
  ATLAS_STATE_STORE.contextAutoHealNote = '';
  writeUrlState(false);
  render();
}

function setAtlasLevelBand(band) {
  ATLAS_STATE_STORE.levelBand = band || 'All';
  writeUrlState(false);
  render();
}

function setAtlasRaceGrowthRoute(raceLabel) {
  ATLAS_STATE_STORE.raceGrowthRoute = raceLabel || 'All';
  writeUrlState(false);
  render();
}

function resetAtlasFilters() {
  ATLAS_STATE_STORE.filter = 'All';
  ATLAS_STATE_STORE.levelBand = 'All';
  ATLAS_STATE_STORE.raceGrowthRoute = 'All';
  ATLAS_STATE_STORE.contextAutoHealNote = '';
  ATLAS_BOSS_GOD_ID = 'All';
  ATLAS_STATE_STORE.bossGodId = 'All';
  ATLAS_QUEST_TRACK = 'All';
  ATLAS_STATE_STORE.questTrack = 'All';
  ATLAS_FARMING_MODE = 'All';
  ATLAS_STATE_STORE.farmingMode = 'All';
  ATLAS_SIEGE_DOMAIN_ID = 'All';
  ATLAS_STATE_STORE.siegeDomainId = 'All';
  ATLAS_BOSS_RADAR_MODE = 'All';
  ATLAS_STATE_STORE.bossRadarMode = 'All';
  ATLAS_OMNI_SEARCH_QUERY = '';
  ATLAS_STATE_STORE.omniSearchQuery = '';
  ATLAS_STATE_STORE.toastMessage = '';
  writeUrlState(false);
  render();
}

let ATLAS_DIMENSION_DRAWER_OPEN = false;
let ATLAS_PERSONA_LENS = 'gamer';
let ATLAS_ACTIVE_STUDIO_BAR = 'boss_hierarchy';
let ATLAS_ROUTE_PLANNER_OPEN = false;
let ATLAS_RACE_GROWTH_OPEN = false;
let ATLAS_PRESET_CHIPS_OPEN = false;
// F-156 B2: set when the user dismisses the search tray; cleared by typing/searching or toggling Presets.
let ATLAS_OMNI_TRAY_DISMISSED = false;
let ATLAS_LEFT_DRAWER_OPEN = false;
// F-157: the app navigation sidebar can be collapsed to give the map the full width (localStorage + ?sidebar=0).
// F-160: phones start with the top-left HUD hidden (it covered ~50% of the map); a stored choice wins.
let ATLAS_HUD_HIDDEN = (() => {
  try { const v = localStorage.getItem('atlas-hud-hidden'); if (v === '0' || v === '1') return v === '1'; } catch (e) {}
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 430px)').matches;
})();
// F-161: phones start with the map legend collapsed to a toggle; a stored choice wins. Same query as the .atlas-legend-toggle CSS.
const ATLAS_LEGEND_PHONE_QUERY = '(max-width: 430px), (pointer: coarse) and (max-width: 767px)';
let ATLAS_LEGEND_COLLAPSED = (() => {
  try { const v = localStorage.getItem('atlas-legend-collapsed'); if (v === '0' || v === '1') return v === '1'; } catch (e) {}
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(ATLAS_LEGEND_PHONE_QUERY).matches;
})();
let APP_SIDEBAR_COLLAPSED = (() => { try { return localStorage.getItem('atlas-sidebar-collapsed') === '1'; } catch (e) { return false; } })();
let ATLAS_THEATER_MODE = false;
let ATLAS_ENTITY_MATRIX_OPEN = false;
let ATLAS_PO_TELEMETRY_OPEN = false;
let ATLAS_SHOW_ALL_SVG_OVERLAYS = false;
let ATLAS_STUDIO_NOTES_OPEN = false;
let ATLAS_COMPARE_STUDIO_BAR = '';
let ATLAS_PERSPECTIVE_BAR_OPEN = false;
let ATLAS_QUICK_WARP_OPEN = false;
let ATLAS_LAST_MATCH_COUNT = 0;
let ATLAS_ENGINE_MODE = '2d_svg';
let ATLAS_RASTER_RELIEF_OVERLAY = false;
let ATLAS_OL_RULER_ACTIVE = false;
let ATLAS_OL_RULER_POINTS = [];
const ATLAS_3D_CAMERA_DEFAULTS = Object.freeze({ yaw: -0.62, pitch: 0.78, zoom: 1.0, panX: 0, panY: 0 });
let ATLAS_3D_STATE = {
  ...ATLAS_3D_CAMERA_DEFAULTS,
  elevScale: 1.0,
  wireframe: false,
  contextOverride: '',
  selectedMeshName: '',
  hoveredMeshName: '',
  downClientX: 0,
  downClientY: 0
};

function getAtlasPersonaLensTelemetrySummary(meta = {}) {
  const lens = (typeof ATLAS_PERSONA_LENS !== 'undefined' && ATLAS_PERSONA_LENS) ? ATLAS_PERSONA_LENS : 'gamer';
  const bar = (typeof ATLAS_ACTIVE_STUDIO_BAR !== 'undefined' && ATLAS_ACTIVE_STUDIO_BAR) ? ATLAS_ACTIVE_STUDIO_BAR : 'boss_hierarchy';
  const act = meta.actionType || 'field';
  const lvArr = Array.isArray(meta.levelRange) ? meta.levelRange : [1, 20];
  const lvMax = Number(lvArr[1] || lvArr[0] || 20);
  const loc = meta.locCoord || '-84120:243500';
  const id = meta.id || 'zone-town-lantern-hollow';
  if (lens === 'designer') {
    return {
      lens,
      bar,
      lensColor: '#fbbf24',
      lensBadge: `🎨 Density:${act === 'dungeon' ? '18/rm' : '9/ha'} · XP/h:${Math.round((lvMax * 14.5))}k`,
      pillText: `DESIGNER LENS · Overlay: ${bar} · Balance & Spawn Density Telemetry`
    };
  }
  if (lens === 'architect') {
    return {
      lens,
      bar,
      lensColor: '#38bdf8',
      lensBadge: `🏛️ CRS:${loc} · ${id.slice(0, 16)}`,
      pillText: `ARCHITECT LENS · Overlay: ${bar} · Pixel-CRS & Topology Contract`
    };
  }
  if (lens === 'developer') {
    return {
      lens,
      bar,
      lensColor: '#c084fc',
      lensBadge: `⚙️ .glb Node · VRAM ~${act === 'town' ? '14.2' : '8.6'}MB · NavMesh:OK`,
      pillText: `DEVELOPER LENS · Overlay: ${bar} · Godot 4 .glb & NavMesh Telemetry`
    };
  }
  if (lens === 'liveops') {
    return {
      lens,
      bar,
      lensColor: '#f43f5e',
      lensBadge: `📡 CCU:${110 + lvMax * 6} · BotRisk:<0.4%`,
      pillText: `LIVEOPS LENS · Overlay: ${bar} · Concurrency, Siege & Sentinel Telemetry`
    };
  }
  return {
    lens: 'gamer',
    bar,
    lensColor: '#34d399',
    lensBadge: `🎮 Lv.${lvArr[0]}–${lvArr[1]} · ${act === 'town' ? 'Hub/Spawn' : (act === 'dungeon' ? 'Sub-Map' : 'Field')}`,
    pillText: `GAMER LENS · Overlay: ${bar} · Progression, Shops & Dungeon Warps`
  };
}

function setAtlasEngineMode(mode) {
  const valid = ['2d_svg', '2d_ol', '3d_map3d'];
  ATLAS_ENGINE_MODE = valid.includes(mode) ? mode : '2d_svg';
  writeUrlState(false);
  render();
  syncAtlasActiveSpatialEngine();
}

function toggleAtlasRasterReliefOverlay() {
  ATLAS_RASTER_RELIEF_OVERLAY = !ATLAS_RASTER_RELIEF_OVERLAY;
  render();
}

function toggleAtlasOlRuler() {
  ATLAS_OL_RULER_ACTIVE = !ATLAS_OL_RULER_ACTIVE;
  if (!ATLAS_OL_RULER_ACTIVE) {
    ATLAS_OL_RULER_POINTS = [];
  }
  syncAtlasActiveSpatialEngine();
}

// F-155: 3D camera moves (drag end, wheel, keys) persist to the URL via replaceState, debounced so a wheel burst
// writes once.
let ATLAS_3D_URL_WRITE_TIMER = null;
function scheduleAtlas3dCameraUrlWrite() {
  if (ATLAS_3D_URL_WRITE_TIMER) clearTimeout(ATLAS_3D_URL_WRITE_TIMER);
  ATLAS_3D_URL_WRITE_TIMER = setTimeout(() => { ATLAS_3D_URL_WRITE_TIMER = null; writeUrlState(false); }, 120);
}

function setAtlas3dOption(key, val) {
  if (key === 'elevScale') ATLAS_3D_STATE.elevScale = Math.max(0.4, Math.min(3.0, Number(val) || 1.0));
  else if (key === 'pitch') ATLAS_3D_STATE.pitch = Math.max(0.25, Math.min(1.42, Number(val) || 0.78));
  else if (key === 'yaw') ATLAS_3D_STATE.yaw = Number(val) || 0;
  else if (key === 'wireframe') ATLAS_3D_STATE.wireframe = Boolean(val);
  else if (key === 'contextOverride') ATLAS_3D_STATE.contextOverride = String(val || '');
  else if (key === 'reset') {
    Object.assign(ATLAS_3D_STATE, ATLAS_3D_CAMERA_DEFAULTS);
    ATLAS_3D_STATE.elevScale = 1.0;
  }
  writeUrlState(false);
  if (key === 'contextOverride') {
    if (ATLAS_3D_STATE.contextOverride === 'dungeon') clearAtlasLingeringTownShopPoi();
    if (ATLAS_ENGINE_MODE === '3d_map3d') refreshStudioPlaceDrawerInPlace();
  }
  initOrUpdateAtlasMap3dEngine();
}

function setupHiDpiIsotropicCanvas(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const rect = typeof canvas.getBoundingClientRect === 'function'
    ? canvas.getBoundingClientRect()
    : { width: 1040, height: 500 };
  const cssW = Math.max(320, Math.round(rect.width || canvas.clientWidth || 1040));
  const cssH = Math.max(240, Math.round(rect.height || canvas.clientHeight || 500));
  const dpr = (typeof window !== 'undefined' && Number(window.devicePixelRatio) > 0)
    ? Math.min(2, Number(window.devicePixelRatio))
    : 1;
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const scale = Math.min(cssW / 1040, cssH / 500);
  const offsetX = (cssW - 1040 * scale) / 2;
  const offsetY = (cssH - 500 * scale) / 2;
  return { ctx, cssW, cssH, dpr, scale, offsetX, offsetY };
}

let ATLAS_ENGINE_RESIZE_OBSERVER = null;
function attachAtlasEngineResizeObserver(mount) {
  if (!mount || typeof ResizeObserver === 'undefined') return;
  try {
    if (ATLAS_ENGINE_RESIZE_OBSERVER) {
      ATLAS_ENGINE_RESIZE_OBSERVER.disconnect();
    }
    let lastW = mount.clientWidth;
    let lastH = mount.clientHeight;
    ATLAS_ENGINE_RESIZE_OBSERVER = new ResizeObserver(() => {
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      if (Math.abs(nw - lastW) > 2 || Math.abs(nh - lastH) > 2) {
        lastW = nw;
        lastH = nh;
        if (ATLAS_ENGINE_MODE === '3d_map3d') redrawAtlas3dInPlace();
        else syncAtlasActiveSpatialEngine();
      }
    });
    ATLAS_ENGINE_RESIZE_OBSERVER.observe(mount);
  } catch (_e) {}
}

// ============================================================================
// 6-LAYER COMPOSABLE CARTOGRAPHIC PIPELINE (L2SANCTUM.NET / LINEAGE II FREYA)
// Edit/Add a Walk Path, River, or Tree Grove in < 5ms WITHOUT full map rebuild
// ============================================================================
const ATLAS_COMPOSABLE_LAYER_VISIBILITY = {
  layer_0_base_elevation_dem: true,
  layer_1_hydrology_splines: true,
  layer_2_topography_cliffs_and_highlands: true,
  layer_3_road_and_walkway_network: true,
  layer_4_foliage_and_canopy_scatters: true,
  layer_5_architectural_compounds_and_quest_rings: true
};
const ATLAS_INCREMENTAL_CUSTOM_FEATURES = {
  walkways: [],
  rivers: [],
  trees: [],
  quest_rings: []
};
let ATLAS_INCREMENTAL_FEATURE_HISTORY = [];
let ATLAS_FULL_MAP_REBUILD_COUNT = 0;
let ATLAS_INCREMENTAL_LAYER_PATCH_COUNT = 0;
let ATLAS_SAVED_LAYER_SNAPSHOT_COUNT = 0;

const ATLAS_CANONICAL_BIOME_PALETTES = {
  grassland: {
    baseFill: '#1b311d', turfFill: 'rgba(45,76,34,0.68)', perimStroke: '#4ade80',
    waterOuter: 'rgba(186,166,118,0.48)', waterDeep: '#235363', waterCore: '#3b7d91', waterFoam: 'rgba(186,230,253,0.55)',
    highOuter: 'rgba(92,108,58,0.62)', highInner: 'rgba(122,138,78,0.58)', highStroke: '#3f4d28',
    roadCore: '#9a8462', walkwayCore: '#b89f74',
    treeC0: '#1e3f20', treeC1: '#28542a', treeC2: '#326634', treeHi0: '#4d8c4a', treeHi1: '#65a358',
    ruinFill: 'rgba(87,83,78,0.78)', ruinStroke: '#d6d3d1'
  },
  swamp: {
    baseFill: '#0f2926', turfFill: 'rgba(13,148,136,0.42)', perimStroke: '#0d9488',
    waterOuter: 'rgba(45,212,191,0.38)', waterDeep: '#115e59', waterCore: '#0d9488', waterFoam: 'rgba(153,246,228,0.62)',
    highOuter: 'rgba(30,68,62,0.65)', highInner: 'rgba(45,102,92,0.58)', highStroke: '#134e4a',
    roadCore: '#6b705c', walkwayCore: '#84a98c',
    treeC0: '#134e4a', treeC1: '#0f766e', treeC2: '#0d9488', treeHi0: '#2dd4bf', treeHi1: '#5eead4',
    ruinFill: 'rgba(45,74,67,0.82)', ruinStroke: '#5eead4'
  },
  canyon: {
    baseFill: '#3b1d11', turfFill: 'rgba(194,65,12,0.48)', perimStroke: '#c2410c',
    waterOuter: 'rgba(251,146,60,0.42)', waterDeep: '#7c2d12', waterCore: '#c2410c', waterFoam: 'rgba(254,215,170,0.55)',
    highOuter: 'rgba(154,52,18,0.68)', highInner: 'rgba(194,65,12,0.62)', highStroke: '#7c2d12',
    roadCore: '#b45309', walkwayCore: '#d97706',
    treeC0: '#274223', treeC1: '#35582e', treeC2: '#46703c', treeHi0: '#6fa358', treeHi1: '#8fc276',
    ruinFill: 'rgba(124,45,18,0.82)', ruinStroke: '#fdba74'
  },
  rainforest: {
    baseFill: '#0b2918', turfFill: 'rgba(21,128,61,0.58)', perimStroke: '#22c55e',
    waterOuter: 'rgba(74,222,128,0.40)', waterDeep: '#065f46', waterCore: '#059669', waterFoam: 'rgba(167,243,208,0.60)',
    highOuter: 'rgba(20,83,45,0.68)', highInner: 'rgba(22,101,52,0.62)', highStroke: '#14532d',
    roadCore: '#65a30d', walkwayCore: '#84cc16',
    treeC0: '#064e3b', treeC1: '#047857', treeC2: '#10b981', treeHi0: '#34d399', treeHi1: '#6ee7b7',
    ruinFill: 'rgba(20,83,45,0.82)', ruinStroke: '#86efac'
  },
  valley: {
    baseFill: '#1e293b', turfFill: 'rgba(226,232,240,0.34)', perimStroke: '#2dd4bf',
    waterOuter: 'rgba(226,232,240,0.55)', waterDeep: '#0f766e', waterCore: '#2dd4bf', waterFoam: '#e2e8f0',
    highOuter: 'rgba(148,163,184,0.65)', highInner: 'rgba(226,232,240,0.78)', highStroke: '#475569',
    roadCore: '#94a3b8', walkwayCore: '#cbd5e1',
    treeC0: '#334155', treeC1: '#475569', treeC2: '#64748b', treeHi0: '#e2e8f0', treeHi1: '#2dd4bf',
    ruinFill: 'rgba(71,85,105,0.82)', ruinStroke: '#e2e8f0'
  },
  volcano_cave: {
    baseFill: '#2a120a', turfFill: 'rgba(154,52,18,0.52)', perimStroke: '#ea580c',
    waterOuter: 'rgba(250,204,21,0.52)', waterDeep: '#9a3412', waterCore: '#ea580c', waterFoam: '#facc15',
    highOuter: 'rgba(69,26,3,0.78)', highInner: 'rgba(234,88,12,0.68)', highStroke: '#ea580c',
    roadCore: '#78350f', walkwayCore: '#ea580c',
    treeC0: '#293824', treeC1: '#384d31', treeC2: '#4a6340', treeHi0: '#729460', treeHi1: '#94b880',
    ruinFill: 'rgba(69,26,3,0.85)', ruinStroke: '#facc15'
  },
  god_valley: {
    baseFill: '#1e1035', turfFill: 'rgba(126,34,206,0.45)', perimStroke: '#7e22ce',
    waterOuter: 'rgba(216,180,254,0.48)', waterDeep: '#581c87', waterCore: '#7e22ce', waterFoam: 'rgba(243,232,255,0.72)',
    highOuter: 'rgba(88,28,135,0.68)', highInner: 'rgba(126,34,206,0.62)', highStroke: '#6b21a8',
    roadCore: '#a855f7', walkwayCore: '#d8b4fe',
    treeC0: '#4c1d95', treeC1: '#6b21a8', treeC2: '#7e22ce', treeHi0: '#c084fc', treeHi1: '#e9d5ff',
    ruinFill: 'rgba(88,28,135,0.82)', ruinStroke: '#e9d5ff'
  },
  sea_cave: {
    baseFill: '#082f49', turfFill: 'rgba(2,132,199,0.48)', perimStroke: '#0284c7',
    waterOuter: 'rgba(125,211,252,0.48)', waterDeep: '#0c4a6e', waterCore: '#0284c7', waterFoam: 'rgba(224,242,254,0.72)',
    highOuter: 'rgba(12,74,110,0.68)', highInner: 'rgba(3,105,161,0.62)', highStroke: '#075985',
    roadCore: '#0284c7', walkwayCore: '#38bdf8',
    treeC0: '#0c4a6e', treeC1: '#075985', treeC2: '#0369a1', treeHi0: '#38bdf8', treeHi1: '#7dd3fc',
    ruinFill: 'rgba(12,74,110,0.82)', ruinStroke: '#7dd3fc'
  },
  underground_cave: {
    baseFill: '#0f172a', turfFill: 'rgba(51,65,85,0.62)', perimStroke: '#64748b',
    waterOuter: 'rgba(148,163,184,0.42)', waterDeep: '#1e293b', waterCore: '#475569', waterFoam: 'rgba(203,213,225,0.58)',
    highOuter: 'rgba(30,41,59,0.75)', highInner: 'rgba(51,65,85,0.68)', highStroke: '#334155',
    roadCore: '#475569', walkwayCore: '#94a3b8',
    treeC0: '#1e293b', treeC1: '#334155', treeC2: '#475569', treeHi0: '#94a3b8', treeHi1: '#cbd5e1',
    ruinFill: 'rgba(30,41,59,0.85)', ruinStroke: '#cbd5e1'
  },
  giant_tower: {
    baseFill: '#172554', turfFill: 'rgba(37,99,235,0.45)', perimStroke: '#3b82f6',
    waterOuter: 'rgba(147,197,253,0.48)', waterDeep: '#1e3a8a', waterCore: '#2563eb', waterFoam: 'rgba(219,234,254,0.70)',
    highOuter: 'rgba(30,58,138,0.68)', highInner: 'rgba(29,78,216,0.62)', highStroke: '#1d4ed8',
    roadCore: '#3b82f6', walkwayCore: '#93c5fd',
    treeC0: '#1e3a8a', treeC1: '#1d4ed8', treeC2: '#2563eb', treeHi0: '#60a5fa', treeHi1: '#bfdbfe',
    ruinFill: 'rgba(30,58,138,0.82)', ruinStroke: '#bfdbfe'
  }
};

function resolveFieldZoneBiomeId(entry) {
  const canonicalIds = [
    'grassland', 'swamp', 'canyon', 'rainforest', 'valley',
    'volcano_cave', 'god_valley', 'sea_cave', 'underground_cave', 'giant_tower'
  ];
  if (typeof ATLAS_BIOME_USER_OVERRIDE !== 'undefined' && ATLAS_BIOME_USER_OVERRIDE === true && ATLAS_ACTIVE_BIOME_THEME_ID && ATLAS_CANONICAL_BIOME_PALETTES[ATLAS_ACTIVE_BIOME_THEME_ID]) {
    return { biomeId: ATLAS_ACTIVE_BIOME_THEME_ID, palette: ATLAS_CANONICAL_BIOME_PALETTES[ATLAS_ACTIVE_BIOME_THEME_ID] };
  }
  const zid = String((entry && (entry.zone_id || entry.id || entry.studio_node_id)) || ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate');
  const zname = String((entry && entry.name) || zid).toLowerCase();
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  const mfl = sp.mapFeatureLayers || {};
  const assignments = mfl.zone_biome_assignments || {};
  const rawAssign = assignments[zid];
  let resolvedId = (typeof rawAssign === 'string' ? rawAssign : (rawAssign && rawAssign.biome_id)) || (entry && entry.biome_theme_id) || '';
  if (!resolvedId || !ATLAS_CANONICAL_BIOME_PALETTES[resolvedId]) {
    const hay = `${zid.toLowerCase()} ${zname}`;
    if (hay.includes('swamp') || hay.includes('marsh') || hay.includes('fen') || hay.includes('cruma') || hay.includes('bog') || hay.includes('mire')) resolvedId = 'swamp';
    else if (hay.includes('volcan') || hay.includes('caldera') || hay.includes('magma') || hay.includes('lava') || hay.includes('forge') || hay.includes('blazing') || hay.includes('kilnfire') || hay.includes('crucible')) resolvedId = 'volcano_cave';
    else if (hay.includes('canyon') || hay.includes('gorge') || hay.includes('pass') || hay.includes('tanor') || hay.includes('mesa') || hay.includes('redbrick') || hay.includes('quarry') || hay.includes('badland')) resolvedId = 'canyon';
    else if (hay.includes('god') || hay.includes('astral') || hay.includes('celestial') || hay.includes('halo') || hay.includes('star') || hay.includes('imperial') || hay.includes('argos') || hay.includes('forbidden') || hay.includes('crown')) resolvedId = 'god_valley';
    else if (hay.includes('valley') || hay.includes('snow') || hay.includes('frozen') || hay.includes('spring') || hay.includes('ice') || hay.includes('schuttgart') || hay.includes('dragon') || hay.includes('enchanted')) resolvedId = 'valley';
    else if (hay.includes('rainforest') || hay.includes('jungle') || hay.includes('canopy') || hay.includes('primeval') || hay.includes('alligator') || hay.includes('delta') || hay.includes('loom') || hay.includes('grove')) resolvedId = 'rainforest';
    else if (hay.includes('sea') || hay.includes('harbor') || hay.includes('pier') || hay.includes('port') || hay.includes('pirate') || hay.includes('grotto') || hay.includes('coral') || hay.includes('barge') || hay.includes('ferry') || hay.includes('island')) resolvedId = 'sea_cave';
    else if (hay.includes('tower') || hay.includes('spire') || hay.includes('pendulum') || hay.includes('chronometer') || hay.includes('insolence') || hay.includes('ivory') || hay.includes('astrolabe')) resolvedId = 'giant_tower';
    else if (hay.includes('cave') || hay.includes('catacomb') || hay.includes('necropolis') || hay.includes('cellar') || hay.includes('crypt') || hay.includes('underground') || hay.includes('subterranean')) resolvedId = 'underground_cave';
    else if (zid === 'zone-field-clover-south-gate' || hay.includes('clover') || hay.includes('meadow') || hay.includes('floran') || hay.includes('plain') || hay.includes('pasture') || hay.includes('grass')) resolvedId = 'grassland';
    else {
      let h = 0;
      for (let i = 0; i < zid.length; i++) h = ((h * 33) + zid.charCodeAt(i)) % 997;
      resolvedId = canonicalIds[h % canonicalIds.length];
    }
  }
  const palette = ATLAS_CANONICAL_BIOME_PALETTES[resolvedId] || ATLAS_CANONICAL_BIOME_PALETTES.grassland;
  return { biomeId: resolvedId, palette };
}

function selectAtlasQuestPin(questId, evt) {
  if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  const bcat = sp.biomeThemesCatalog || {};
  const codexQuests = (bcat.starter_quest_codex && bcat.starter_quest_codex.quests) || bcat.starter_library_quests || [];
  const q = codexQuests.find(item => item.quest_id === questId || item.id === questId) || codexQuests[0] || {
    quest_id: questId || 'quest-l2-01-kelp-spores',
    title: 'Spores of the Sunken Kelp-Fen (l2sanctum Quest Ring)',
    repeatable: true,
    recommended_level_range: [1, 6],
    giver_building_number: 10,
    giver_npc_name: 'South-Gate Captain Arnold',
    giver_loc_coord: '-84120:243500',
    target_hunting_zone_id: ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate',
    target_monsters: ['Clover-Dew Keltir', 'Spore-Drifter Toad'],
    quest_item_drop: { item_name: 'Luminous Kelp Spore Pouch', required_count: 15, drop_rate_pct: 80 },
    rewards: { adena: 1850, items: ['Soulshot (No-Grade) x200', 'Apprentice Adventurer Ring'] }
  };
  const dropObj = q.quest_item_drop || { item_name: 'Quest Token', required_count: 10, drop_rate_pct: 100 };
  const rewObj = q.rewards || { adena: 1200, items: q.reward_items || ['Adventurer Supply Pack'] };
  const targetMons = Array.isArray(q.target_monsters) ? q.target_monsters : [q.target_description || 'Field Monster Pack'];
  const giverName = q.giver_npc_name || q.start_npc_name || 'Town Guild Guide';
  const giverBldg = q.giver_building_number || q.start_npc_number || 1;
  const lvRange = q.recommended_level_range || [q.start_level || 1, (q.start_level || 1) + 5];
  STUDIO_MAP_SELECTED_POI = {
    title: `📜 [!] ${q.title || questId}`,
    category: `l2sanctum.net Golden Quest Ring · ${q.repeatable ? 'REPEATABLE' : 'ONE-TIME'} · Lv.${lvRange[0]}–${lvRange[1]}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `QUEST GIVER: #${giverBldg} ${giverName} · TARGET RING ACTIVE`,
    summary: `Hunt ${targetMons.join(', ')} to collect ${dropObj.item_name} (×${dropObj.required_count || 10}). Reward: ${rewObj.adena || 1200} Adena + ${(rewObj.items || []).join(', ')}.`,
    address: `Target Zone: ${q.target_hunting_zone_id || q.target_zone_id || ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate'}`,
    coordinates: `Giver loc=${q.giver_loc_coord || '-84120:243500'} · Quest ID: ${q.quest_id || questId}`,
    scaleSpecs: `Quest Drop: ${dropObj.item_name} · Reward: ${rewObj.adena || 1200} Adena`,
    questId: q.quest_id || questId,
    giverNpc: giverName,
    targetMonsters: targetMons,
    questDrop: dropObj.item_name,
    rewards: rewObj,
    inspectId: q.target_hunting_zone_id || q.target_zone_id || ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate'
  };
  ATLAS_LEFT_DRAWER_OPEN = true;
  if (typeof ATLAS_STATE_STORE !== 'undefined') ATLAS_STATE_STORE.leftDrawerOpen = true;
  if (!refreshStudioPlaceDrawerInPlace()) {
    render();
  }
  return STUDIO_MAP_SELECTED_POI;
}

const catmullSplineD = (pts, closed = false) => {
  if (!pts || pts.length < 2) return "";
  const n = pts.length;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  const limit = closed ? n : n - 1;
  for (let i = 0; i < limit; i++) {
    const p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
    const c1x = +(p1[0] + (p2[0] - p0[0]) / 5.5).toFixed(1), c1y = +(p1[1] + (p2[1] - p0[1]) / 5.5).toFixed(1);
    const c2x = +(p2[0] - (p3[0] - p1[0]) / 5.5).toFixed(1), c2y = +(p2[1] - (p3[1] - p1[1]) / 5.5).toFixed(1);
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return closed ? d + " Z" : d;
};

const sampleCatmullPts = (pts, sub = 3) => {
  if (!pts || pts.length < 2) return pts || [];
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const u = s / sub, u2 = u * u, u3 = u2 * u;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
      out.push([x, y]);
    }
  }
  out.push(pts[n - 1]);
  return out;
};

const variableRibbonPolyD = (pts, wStart, wEnd, seed = 1, flareStart = 1.35, flareEnd = 1.65) => {
  if (!pts || pts.length < 2) return "";
  const dense = sampleCatmullPts(pts, 3);
  const left = [], right = [], n = dense.length;
  for (let i = 0; i < n; i++) {
    const pPrev = dense[Math.max(0, i - 1)], pNext = dense[Math.min(n - 1, i + 1)];
    const dx = pNext[0] - pPrev[0], dy = pNext[1] - pPrev[1], dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist, t = i / (n - 1);
    const flare = (flareStart - 1) * Math.pow(Math.max(0, 1 - t * 4.5), 2) + (flareEnd - 1) * Math.pow(Math.max(0, (t - 0.78) / 0.22), 2);
    const baseW = (wStart + (wEnd - wStart) * Math.pow(t, 0.85)) * (1 + flare);
    const hwL = baseW * 0.5 * (1.0 + 0.18 * Math.sin(t * 9.5 + seed * 1.7));
    const hwR = baseW * 0.5 * (1.0 + 0.16 * Math.cos(t * 8.3 + seed * 2.1));
    left.push([+(dense[i][0] + nx * hwL).toFixed(1), +(dense[i][1] + ny * hwL).toFixed(1)]);
    right.unshift([+(dense[i][0] - nx * hwR).toFixed(1), +(dense[i][1] - ny * hwR).toFixed(1)]);
  }
  return catmullSplineD(left.concat(right), true);
};

function buildFieldComposableLayerInnerSvg(layerId, entry, bp, isFort = false) {
  const zid = String((entry && entry.zone_id) || (bp && bp.zone_id) || "zone-field-default");
  const { biomeId, palette } = resolveFieldZoneBiomeId(entry || bp || { zone_id: zid });
  const perimArr = (bp && (bp.terrain_perimeter_pct || bp.bastion_wall_pct)) || [[10, 14], [88, 12], [92, 48], [86, 86], [14, 88], [8, 50]];
  const perimPts = perimArr.map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(" ");
  const circleSubpath = (cx, cy, r) => `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;

  if (layerId === "layer_0_base_elevation_dem") {
    const baseFill = isFort ? "#1b2634" : palette.baseFill;
    const strokeCol = isFort ? "#fb923c" : palette.perimStroke;
    return `
      <rect x="0" y="0" width="1040" height="500" fill="${baseFill}" data-biome-id="${biomeId}"/>
      <image href="/studio-maps/d01_field_radar_map.png?v=l2sanctum3" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid slice" opacity="0.20"/>
      <path d="M 40,95 Q 280,45 540,85 T 990,75 L 990,445 Q 740,475 480,435 T 40,425 Z" fill="${palette.turfFill}" fill-opacity="0.28"/>
      <path d="M 110,135 Q 340,95 560,130 T 920,125 M 95,245 Q 360,210 590,250 T 940,240 M 115,355 Q 380,325 610,360 T 915,350" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1.2" stroke-dasharray="6 4"/>
      <polygon points="${perimPts}" fill="none" stroke="${strokeCol}" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="${isFort ? "none" : "8 5"}" opacity="0.72"/>
    `;
  }
  if (layerId === "layer_1_hydrology_splines") {
    const rivD = variableRibbonPolyD([[55,392],[175,328],[295,382],[435,288],[575,342],[715,242],[865,295],[985,188]], 7.5, 13.5, 3);
    const customRivD = ATLAS_INCREMENTAL_CUSTOM_FEATURES.rivers.map(r => r.d).join(" ");
    return `
      <path d="${rivD}" fill="none" stroke="rgba(251,191,36,0.28)" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="${rivD}" fill="${palette.riverCore0}" stroke="${palette.riverBank}" stroke-width="1.8" stroke-linejoin="round"/>
      ${customRivD ? `<path d="${customRivD}" fill="none" stroke="${palette.riverBank}" stroke-width="12" stroke-linecap="round"/><path d="${customRivD}" fill="none" stroke="${palette.riverCore0}" stroke-width="8" stroke-linecap="round"/>` : ""}
    `;
  }
  if (layerId === "layer_2_topography_cliffs_and_highlands") {
    return `
      <path d="M 82,118 C 145,58 315,48 438,86 C 495,104 482,152 405,166 C 295,182 142,168 82,118 Z M 648,332 C 725,292 865,298 938,346 C 962,388 905,438 815,446 C 712,452 622,385 648,332 Z" fill="rgba(30,41,59,0.28)" stroke="${palette.highStroke}" stroke-width="1.8"/>
      <path d="M 135,116 Q 205,86 278,104 T 412,102 M 695,368 Q 768,342 842,362 T 912,374" fill="none" stroke="#fde68a" stroke-width="2.0" stroke-linecap="round"/>
    `;
  }
  if (layerId === "layer_3_road_and_walkway_network") {
    const walkD = [
      catmullSplineD([[68,262],[210,208],[355,254],[515,212],[680,256],[835,204],[972,238]]),
      catmullSplineD([[355,254],[382,340],[428,425],[462,468]]),
      catmullSplineD([[680,256],[645,168],[585,96],[535,42]])
    ].join(" ");
    const customWalkD = ATLAS_INCREMENTAL_CUSTOM_FEATURES.walkways.map(w => w.d).join(" ");
    const allWalkD = customWalkD ? `${walkD} ${customWalkD}` : walkD;
    return `
      <path d="${allWalkD}" fill="none" stroke="${palette.roadBorder}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>
      <path d="${allWalkD}" fill="none" stroke="${palette.roadCore}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
    `;
  }
  if (layerId === "layer_4_foliage_and_canopy_scatters") {
    const treeClusters = [
      [108, 88, 6.5], [122, 95, 5.5], [232, 66, 6], [248, 74, 7], [542, 72, 6], [558, 80, 5.5],
      [782, 84, 6.5], [798, 92, 6], [114, 294, 6.5], [244, 374, 6.5], [482, 384, 6], [814, 254, 6],
      ...ATLAS_INCREMENTAL_CUSTOM_FEATURES.trees.map(t => [t.x, t.y, Math.min(7, t.r || 6)])
    ];
    const shadowD = treeClusters.map(([tx, ty, tr]) => circleSubpath(tx + 1.8, ty + 2.2, tr)).join(" ");
    const canopyD0 = treeClusters.map(([tx, ty, tr]) => circleSubpath(tx, ty, tr)).join(" ");
    const hiD = treeClusters.map(([tx, ty, tr]) => circleSubpath(tx - 1.2, ty - 1.2, Math.max(2.2, +(tr * 0.52).toFixed(1)))).join(" ");
    return `
      <path d="${shadowD}" fill="rgba(10,18,12,0.52)"/>
      <path d="${canopyD0}" fill="${palette.treeC0}" stroke="#142915" stroke-width="1"/>
      <path d="${hiD}" fill="${palette.treeHi0}" opacity="0.88"/>
    `;
  }
  if (layerId === "layer_5_architectural_compounds_and_quest_rings") {
    const customRings = ATLAS_INCREMENTAL_CUSTOM_FEATURES.quest_rings.map((q) => `
      <g class="atlas-l2sanctum-quest-ring" pointer-events="all" data-poi-clickable="1" style="cursor:pointer" onclick="selectAtlasQuestPin('quest-l2-01-kelp-spores', event)">
        <circle cx="${q.x}" cy="${q.y}" r="20" fill="rgba(239,68,68,0.12)" stroke="#ef4444" stroke-width="1.6" stroke-dasharray="5 3"/>
        <circle cx="${q.x}" cy="${q.y}" r="7.5" fill="#eab308" stroke="#ffffff" stroke-width="1.8"/>
      </g>
    `).join("");
    return `
      <g transform="translate(432, 142)">
        <path d="M-22,12 L-20,-8 Q0,-16 20,-8 L22,12 Q0,16 -22,12 Z" fill="${palette.ruinFill}" stroke="${palette.ruinStroke}" stroke-width="1.4" stroke-linejoin="round"/>
        <circle cx="-18" cy="-6" r="4.5" fill="#44403c" stroke="${palette.ruinStroke}" stroke-width="1.1"/>
        <circle cx="18" cy="-6" r="4.5" fill="#44403c" stroke="${palette.ruinStroke}" stroke-width="1.1"/>
        <circle cx="0" cy="6" r="4.2" fill="#292524" stroke="#fde68a" stroke-width="1"/>
      </g>
      <g class="atlas-l2sanctum-quest-ring" transform="translate(562, 218)" pointer-events="all" data-poi-clickable="1" style="cursor:pointer" onclick="selectAtlasQuestPin('quest-l2-01-kelp-spores', event)">
        <circle cx="0" cy="0" r="24" fill="rgba(239,68,68,0.12)" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="6 4"/>
        <circle cx="0" cy="0" r="14" fill="rgba(250,204,21,0.18)" stroke="#fde047" stroke-width="1.2" stroke-dasharray="4 3"/>
        <circle cx="0" cy="0" r="7.5" fill="#eab308" stroke="#ffffff" stroke-width="1.8"/>
      </g>
      ${customRings}
    `;
  }
  return "";
}

function renderFieldComposableLayersSvg(entry, bp, isFort = false) {
  const { biomeId } = resolveFieldZoneBiomeId(entry || bp || {});
  const layerIds = [
    "layer_0_base_elevation_dem",
    "layer_1_hydrology_splines",
    "layer_2_topography_cliffs_and_highlands",
    "layer_3_road_and_walkway_network",
    "layer_4_foliage_and_canopy_scatters",
    "layer_5_architectural_compounds_and_quest_rings"
  ];
  return layerIds.map((lid) => {
    const visible = ATLAS_COMPOSABLE_LAYER_VISIBILITY[lid] !== false;
    const inner = buildFieldComposableLayerInnerSvg(lid, entry, bp, isFort);
    const biomeAttr = lid === "layer_0_base_elevation_dem" ? ` data-biome-id="${biomeId}"` : "";
    const ptrEvents = lid === "layer_5_architectural_compounds_and_quest_rings" ? "visiblePainted" : "none";
    return `<g id="atlasFieldComposable_${lid}" class="atlas-composable-layer" data-layer-id="${lid}"${biomeAttr} data-incremental-rebuild="isolated" style="display:${visible ? "inline" : "none"}" pointer-events="${ptrEvents}">${inner}</g>`;
  }).join("");
}

