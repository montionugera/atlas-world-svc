#!/usr/bin/env python3
"""Deterministic UX & Performance Verification Probe (UX-0) for Atlas World Studio.

Executes the live frontend bundle inside a zero-dependency Node VM + Python HTML AST
harness and verifies:
- V-1: Above-canvas chrome DOM count <= 55, gamer SVG nodes <= 600, all lenses SVG nodes <= 1500, render() <= 30ms.
- V-2: Pure render-path filter auto-healing across all 4 spatial contexts x 7 filters (zero state mutation).
- V-3: Zero orphan gateStudioOverlaySvg keys across ATLAS_PERSONA_STUDIO_CATALOG + Compare Overlay dual-mount.
- V-4: Zero inline style= and zero emoji characters on .joy-* contract elements + 375px mobile overflow CSS guard.
- V-5: Theater mode 100% SVG viewport contract and below-canvas studio dock placement.
- V-10 (F-155): one landmark table for OL + SVG (0px), one zone predicate (SVG marks == OL features == badge per filter
  at 1x/2.8x/6x), URL round-trip of route planner + 3D camera, lens-from-URL default overlay.
  Test-the-test: ATLAS_V10_SIMULATE=landmark|count|url (or --simulate-v10=<kind>) perturbs the vm and must go red.
- V-11 (F-157): clipPath #atlasWorldFrameClip wraps #studioCartoViewport, app-sidebar collapse state machine + CSS,
  closing the place inspector collapses its drawer column, lens-bar never clips its buttons (CSS contract; real layout
  widths are asserted by atlas_zoom_drift_check.mjs).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF\u2139]")
JOY_CONTRACT_PREFIXES = ("joy-",)
JOY_TEXT_CHECK_CLASSES = {
    "joy-lens-bar",
    "joy-context-filter-bar",
    "joy-omni-command-bar",
    "joy-spatial-shell__toggle",
}
VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


@dataclass
class HtmlNode:
    tag: str
    attrs: dict[str, str]
    children: list["HtmlNode"] = field(default_factory=list)
    text_parts: list[str] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return set((self.attrs.get("class") or "").split())

    def descendant_count(self, exclude_tags: set[str] | None = None) -> int:
        total = 0
        for c in self.children:
            if not exclude_tags or c.tag not in exclude_tags:
                total += 1
            total += c.descendant_count(exclude_tags)
        return total

    def full_text(self) -> str:
        parts = list(self.text_parts)
        for c in self.children:
            parts.append(c.full_text())
        return "".join(parts)

    def iter_nodes(self):
        yield self
        for c in self.children:
            yield from c.iter_nodes()


class TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = HtmlNode(tag="root", attrs={})
        self.stack: list[HtmlNode] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = {k: (v if v is not None else "") for k, v in attrs}
        node = HtmlNode(tag=tag.lower(), attrs=attr_dict)
        self.stack[-1].children.append(node)
        if tag.lower() not in VOID_ELEMENTS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = {k: (v if v is not None else "") for k, v in attrs}
        node = HtmlNode(tag=tag.lower(), attrs=attr_dict)
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        for idx in range(len(self.stack) - 1, 0, -1):
            if self.stack[idx].tag == t:
                del self.stack[idx:]
                break

    def handle_data(self, data: str) -> None:
        if self.stack:
            self.stack[-1].text_parts.append(data)


def parse_html_fragment(fragment: str) -> HtmlNode:
    parser = TreeBuilder()
    parser.feed(fragment)
    parser.close()
    return parser.root


def inspect_rendered_dom(fragment: str) -> dict:
    root = parse_html_fragment(fragment)
    above_canvas_dom = 0
    svg_nodes = 0
    inline_style_offenders = []
    emoji_offenders = []
    shell_attrs = {}
    svg_attrs = {}
    dock_in_bottom = False
    active_mount_children = 0

    for node in root.iter_nodes():
        node_id = node.attrs.get("id", "")
        classes = node.classes
        if (
            node_id in ("perspectiveBar", "joyPersonaLensBar")
            or "joy-context-filter-bar" in classes
        ):
            above_canvas_dom += node.descendant_count(
                exclude_tags={"svg", "circle", "rect", "path", "polygon", "polyline", "line"}
            )
        if node_id == "dedicatedWorldAtlasSvg":
            svg_nodes = node.descendant_count()
            svg_attrs = dict(node.attrs)
        if "joy-spatial-shell" in classes:
            shell_attrs = dict(node.attrs)
        if "joy-spatial-shell__bottom" in classes:
            for desc in node.iter_nodes():
                if desc.attrs.get("id") == "atlasBelowCanvasStudioDock":
                    dock_in_bottom = True
        if node_id == "atlasActiveStudioBarMount":
            active_mount_children = len(node.children)

        if any(
            any(cls.startswith(prefix) for prefix in JOY_CONTRACT_PREFIXES)
            for cls in classes
        ):
            if "style" in node.attrs:
                inline_style_offenders.append(
                    {
                        "tag": node.tag,
                        "className": node.attrs.get("class", ""),
                        "style": node.attrs.get("style", ""),
                    }
                )

        if classes & JOY_TEXT_CHECK_CLASSES:
            txt = node.full_text()
            m = EMOJI_RE.search(txt)
            if m:
                emoji_offenders.append(
                    {
                        "className": node.attrs.get("class", ""),
                        "emoji": m.group(0),
                        "snippet": txt.strip()[:60],
                    }
                )

    return {
        "aboveCanvasDom": above_canvas_dom,
        "svgNodes": svg_nodes,
        "inlineStyleOffenders": inline_style_offenders,
        "emojiOffenders": emoji_offenders,
        "shellAttrs": shell_attrs,
        "svgAttrs": svg_attrs,
        "dockInBottom": dock_in_bottom,
        "activeMountChildren": active_mount_children,
    }


def run_ux_probe() -> dict:
    import catalog_explorer_web as web

    html = web.INDEX_HTML
    raw_css = web.load_theme_css()
    theme_css = raw_css.decode("utf-8") if isinstance(raw_css, bytes) else str(raw_css)
    bundle = web.load_studio_perspectives_bundle()

    gate_keys = sorted(set(re.findall(r"gateStudioOverlaySvg\('([^']+)'", html)))
    catalog_match = re.search(
        r"const\s+ATLAS_PERSONA_STUDIO_CATALOG\s*=\s*\{(.*?)\};",
        html,
        re.DOTALL,
    )
    catalog_keys = (
        sorted(set(re.findall(r"'([a-z0-9_]+)'", catalog_match.group(1))))
        if catalog_match
        else []
    )
    orphan_keys = sorted(set(gate_keys) - set(catalog_keys))

    script_blocks = re.findall(r"<script[^>]*>(.*?)</script>", html, re.DOTALL)
    main_js = script_blocks[-1]

    node_script = r"""
const fs = require('fs');
const vm = require('vm');
const { performance } = require('perf_hooks');

const code = fs.readFileSync(process.env.ATLAS_JS_PATH, 'utf8');
const sp = JSON.parse(fs.readFileSync(process.env.ATLAS_BUNDLE_PATH, 'utf8'));

const elements = {};
function makeEl(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    style: { setProperty(k, v) { this[k] = v; } },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1040, height: 500 }; },
    getContext() {
      return {
        setTransform() {}, save() {}, restore() {}, translate() {}, scale() {}, clip() {},
        clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
        closePath() {}, fill() {}, stroke() {}, arc() {}, fillText() {}, setLineDash() {},
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; }
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    scrollIntoView() {},
    focus() {},
    select() {}
  };
}

const sandbox = {
  window: {
    devicePixelRatio: 2,
    location: { search: '?tab=studio', hash: '', pathname: '/', origin: 'http://127.0.0.1:8788' },
    history: { replaceState() {}, pushState() {}, back() {}, forward() {} },
    addEventListener() {},
    scrollTo() {}
  },
  document: {
    documentElement: makeEl('html'),
    body: { ...makeEl('body'), appendChild() {}, removeChild() {} },
    head: { appendChild() {} },
    createElement(tag) { return makeEl(tag); },
    getElementById(id) {
      if (!elements[id]) elements[id] = makeEl(id);
      return elements[id];
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: () => new Promise(() => {}),
  requestAnimationFrame: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  TextEncoder,
  Buffer,
  ArrayBuffer,
  DataView,
  Uint8Array,
  Uint16Array,
  Uint32Array,
  Float32Array,
  URLSearchParams,
  console,
  performance,
  Math,
  Date,
  JSON,
  Number,
  String,
  Boolean,
  Array,
  Object,
  RegExp,
  Map,
  Set,
  Promise,
  encodeURIComponent,
  decodeURIComponent,
  parseInt,
  parseFloat,
  isNaN,
  isFinite
};
sandbox.window.document = sandbox.document;
sandbox.history = sandbox.window.history;
sandbox.location = sandbox.window.location;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

vm.runInContext(`
  DATA = {
    studioPerspectives: ${JSON.stringify(sp)},
    worldMap: { maps: [], monsters: [] },
    summary: {},
    tables: [],
    zones: [],
    encounters: [],
    loot: []
  };
  CURRENT_TAB = 'studio';
  STUDIO_PERSPECTIVE = 'town-or-hunting-area';
  render();
  render();
`, sandbox);

const lenses = ['gamer', 'designer', 'architect', 'developer', 'liveops'];
const lensOutputs = {};
for (const lens of lenses) {
  const t0 = performance.now();
  vm.runInContext(`setAtlasPersonaLens('${lens}');`, sandbox);
  const elapsedMs = Number((performance.now() - t0).toFixed(2));
  lensOutputs[lens] = {
    elapsedMs,
    html: elements['mainContent'] ? elements['mainContent'].innerHTML : ''
  };
}

// V-2: Filter auto-heal matrix across all 4 spatial contexts x 7 filters
const filters = ['All', 'RaceSpawns', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'];
let stateMutationFailures = 0;
for (const f of filters) {
  vm.runInContext(`
    zoomStudioMap(0, true);
    setAtlasFilter('${f}');
    focusTownStreetBlueprint('town-lantern-hollow');
  `, sandbox);
  const storedAfterTown = vm.runInContext(`ATLAS_STATE_STORE.filter`, sandbox);
  const effInTown = vm.runInContext(`resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, getAtlasSpatialContext())`, sandbox);

  vm.runInContext(`openDungeonSubMap('zone-dungeon-kiln-cellar', 'B1');`, sandbox);
  const storedAfterDungeon = vm.runInContext(`ATLAS_STATE_STORE.filter`, sandbox);
  const effInDungeon = vm.runInContext(`resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, getAtlasSpatialContext())`, sandbox);

  vm.runInContext(`zoomStudioMap(0, true);`, sandbox);
  const storedAfterReturn = vm.runInContext(`ATLAS_STATE_STORE.filter`, sandbox);
  const effInOverland = vm.runInContext(`resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, getAtlasSpatialContext())`, sandbox);

  if (storedAfterTown !== f || storedAfterDungeon !== f || storedAfterReturn !== f || effInOverland.effective !== f) {
    stateMutationFailures++;
  }
}

// V-3: Compare overlay dual-mount HTML
vm.runInContext(`
  setAtlasPersonaLens('designer');
  setAtlasActiveStudioBar('boss_hierarchy');
  setAtlasCompareStudioBar('quest_trials');
`, sandbox);
const compareHtml = elements['mainContent'] ? elements['mainContent'].innerHTML : '';

// V-5: Theater mode HTML
vm.runInContext(`
  setAtlasCompareStudioBar('');
  toggleAtlasTheaterMode();
`, sandbox);
const theaterHtml = elements['mainContent'] ? elements['mainContent'].innerHTML : '';

// V-6: Spatial Engines (2d_ol, 3d_map3d), 3D Mesh Picking, and Binary glTF 2.0 (.glb) Integrity
const v6Report = vm.runInContext(`(() => {
  toggleAtlasTheaterMode();
  setAtlasPersonaLens('developer');
  setAtlasEngineMode('2d_ol');
  const olFeatures = buildAtlasspatialFeaturesList();
  setAtlasEngineMode('3d_map3d');
  const contexts = ['overland', 'town', 'dungeon'];
  const glbChecks = {};
  for (const ctxName of contexts) {
    setAtlas3dOption('contextOverride', ctxName);
    const built = buildAtlasGlbArrayBuffer();
    const dv = new DataView(built);
    const magic = dv.getUint32(0, true);
    const version = dv.getUint32(4, true);
    const totalLen = dv.getUint32(8, true);
    const jsonLen = dv.getUint32(12, true);
    const jsonBytes = new Uint8Array(built, 20, jsonLen);
    const gltf = JSON.parse(Buffer.from(jsonBytes).toString('utf8').trim());
    glbChecks[ctxName] = {
      magic,
      version,
      totalLen,
      meshCount: (gltf.meshes || []).length,
      nodeCount: (gltf.nodes || []).length,
      unit: gltf.asset && gltf.asset.extras && gltf.asset.extras.unit
    };
  }
  setAtlas3dOption('contextOverride', 'town');
  const townScene = buildAtlas3dBlockoutScene();
  const bldg3 = townScene.meshes.find(m => m.name.startsWith('Building_3_'));
  const road1 = townScene.meshes.find(m => m.name.startsWith('Road_1_'));
  const pickRes = bldg3 ? selectAtlas3dMeshByName(bldg3.name, false) : null;
  setAtlasEngineMode('2d_svg');
  return {
    olFeatureCount: olFeatures.length,
    olHasLensBadge: Boolean(olFeatures[0] && olFeatures[0].lensBadge && olFeatures[0].lensBadge.includes('.glb')),
    glbChecks,
    hasStreetRibbonMesh: Boolean(road1),
    pickRes
  };
})()`, sandbox);

// V-7: Town-only shops, 63-zone pixel-CRS coverage, spawn-driven filters, honest GLB scale, pick helpers
const v7Report = vm.runInContext(`(() => {
  const inWorld = f => f.x >= 0 && f.x <= 1040 && f.y >= 0 && f.y <= 500;
  setAtlasFilter('All');
  ATLAS_STATE_STORE.levelBand = 'All';
  const all = buildAtlasspatialFeaturesList();
  const filterCounts = {};
  for (const f of ['Monster', 'Mini-Boss', 'Raid', 'MVP']) {
    setAtlasFilter(f);
    filterCounts[f] = buildAtlasspatialFeaturesList().length;
  }
  setAtlasFilter('All');
  ATLAS_STATE_STORE.levelBand = '1-10';
  const band1to10 = buildAtlasspatialFeaturesList().length;
  ATLAS_STATE_STORE.levelBand = 'All';

  setAtlasEngineMode('3d_map3d');
  setAtlas3dOption('contextOverride', 'town');
  const bldg = buildAtlas3dBlockoutScene().meshes.find(m => m.name.startsWith('Building_3_'));
  selectAtlas3dMeshByName(bldg.name, false);
  const townPoi = STUDIO_MAP_SELECTED_POI;
  ATLAS_LEFT_DRAWER_OPEN = true;
  const townDrawer = buildStudioPlaceDrawerHtml(townPoi);
  setAtlas3dOption('contextOverride', 'dungeon');
  const dungeonDrawer = buildStudioPlaceDrawerHtml(townPoi);
  setAtlas3dOption('contextOverride', 'town');
  setAtlasEngineMode('2d_svg');
  STUDIO_MAP_SELECTED_POI = townPoi;
  openDungeonSubMap('zone-dungeon-kiln-cellar', 'B1');
  const poiClearedOnDungeon = STUDIO_MAP_SELECTED_POI === null;
  exitDungeonSubMap();
  STUDIO_MAP_SELECTED_POI = townPoi;
  focusFieldTacticalBlueprint('zone-field-clover-south-gate');
  const poiClearedOnField = STUDIO_MAP_SELECTED_POI === null;

  const mpu = {};
  for (const c of ['overland', 'town', 'dungeon']) {
    ATLAS_3D_STATE.contextOverride = c;
    const buf = buildAtlasGlbArrayBuffer();
    const jl = new DataView(buf).getUint32(12, true);
    const g = JSON.parse(Buffer.from(new Uint8Array(buf, 20, jl)).toString('utf8').trim());
    mpu[c] = g.asset.extras.metersPerUnit;
  }
  ATLAS_3D_STATE.contextOverride = '';
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  return {
    zoneCount: all.length,
    offWorld: all.filter(f => !inWorld(f)).map(f => f.name),
    actionTypes: all.reduce((acc, f) => { acc[f.actionType] = (acc[f.actionType] || 0) + 1; return acc; }, {}),
    filterCounts,
    band1to10,
    townHasInspector: townDrawer.includes('studioShopAndRefinementInspector'),
    dungeonHasInspector: dungeonDrawer.includes('studioShopAndRefinementInspector'),
    dungeonHasTownOnlyNote: dungeonDrawer.includes('studioShopTownOnlyNote'),
    poiClearedOnDungeon,
    poiClearedOnField,
    metersPerUnit: mpu,
    polyHit: isPointInAtlasPolygon(5, 5, sq) && !isPointInAtlasPolygon(15, 5, sq),
    groundRank: ['Road_1_X', 'Town_Plaza_Ground', 'Wall_North', 'Floor_B1_Slab', 'C01_Basin'].every(n => isAtlas3dGroundMesh({ name: n }))
      && !['Building_7_7_Apprentice', 'Porcelain_Loom'].some(n => isAtlas3dGroundMesh({ name: n }))
  };
})()`, sandbox);

// V-8: distinct tier filters, zero-emoji pills, lens default overlay, co-registered continent polygons, handler parse
const v8Report = vm.runInContext(`(() => {
  setAtlasEngineMode('2d_ol');
  setAtlasFilter('All');
  ATLAS_STATE_STORE.levelBand = 'All';
  const all = buildAtlasspatialFeaturesList();
  const tierCounts = {};
  for (const f of ['Monster', 'Mini-Boss', 'Raid', 'MVP']) {
    setAtlasFilter(f);
    tierCounts[f] = buildAtlasspatialFeaturesList().length;
  }
  setAtlasFilter('All');
  const emojiRe = /\\p{Extended_Pictographic}/u;
  const pillEmoji = [];
  for (const lens of ['gamer', 'designer', 'architect', 'developer', 'liveops']) {
    setAtlasPersonaLens(lens);
    const pill = getAtlasPersonaLensTelemetrySummary({}).pillText;
    if (emojiRe.test(pill)) pillEmoji.push(lens);
  }
  setAtlasPersonaLens('architect');
  const architectBar = ATLAS_ACTIVE_STUDIO_BAR;
  setAtlasPersonaLens('gamer');
  const gamerBar = ATLAS_ACTIVE_STUDIO_BAR;
  const polys = {};
  getAtlasContinentPolygons().forEach(c => { polys[c.code] = c.pts; });
  const outside = all.filter(f => !polys[f.continentCode] || !isPointInAtlasPolygon(f.x, 500 - f.y, polys[f.continentCode])).map(f => f.id);
  const codes = Object.keys(polys);
  const foreignHits = all.filter(f => codes.some(c => c !== f.continentCode && isPointInAtlasPolygon(f.x, 500 - f.y, polys[c]))).map(f => f.id);
  const ownInside = all.filter(f => polys[f.continentCode] && isPointInAtlasPolygon(f.x, 500 - f.y, polys[f.continentCode])).length;
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const segCross = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
  const overlapPairs = [];
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const A = polys[codes[i]], B = polys[codes[j]];
      let hit = A.some(p => isPointInAtlasPolygon(p[0], p[1], B)) || B.some(p => isPointInAtlasPolygon(p[0], p[1], A));
      for (let m = 0; m < A.length - 1 && !hit; m++) for (let n = 0; n < B.length - 1 && !hit; n++) hit = segCross(A[m], A[m + 1], B[n], B[n + 1]);
      if (hit) overlapPairs.push(codes[i] + '/' + codes[j]);
    }
  }
  let stackedZero = 0, minPair = Infinity;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
    if (d < 0.5) stackedZero++;
    if (d < minPair) minPair = d;
  }
  // Diagnostics: how far clampPointIntoAtlasContinent moved each non-anchored zone from its raw projection.
  const zonesRaw = getAllAtlas63Zones(((DATA.studioPerspectives || {}).tShapedWorldAtlas) || {});
  let clampedZones = 0, maxMovePx = 0;
  const clampMoves = [];
  zonesRaw.forEach(z => {
    const l = clampWorldLocCoord(z.loc_coord || '-84120:243500');
    const r = clampPointIntoAtlasContinent(l.svgX, l.svgY, getAtlasContinentCode(z.continent_id));
    if (r.moved > 0) { clampedZones++; maxMovePx = Math.max(maxMovePx, r.moved); clampMoves.push(z.zone_id + ':' + Math.round(r.moved)); }
  });
  setAtlasEngineMode('2d_svg');
  zoomStudioMap(0, true);
  return {
    tierCounts,
    pillEmojiLenses: pillEmoji,
    architectBar,
    gamerBar,
    gamerDefaultBar: ATLAS_LENS_DEFAULT_BAR.gamer,
    pointsChecked: all.length,
    pointsOutsideOwnContinent: outside,
    foreign_continent_hits: foreignHits.length,
    foreign_continent_hit_ids: foreignHits,
    own_continent_inside: ownInside,
    overlapping_polygon_pairs: overlapPairs.length,
    stacked_zero_px_pairs: stackedZero,
    min_pair_dist_px: Math.round(minPair * 100) / 100,
    overlapping_polygon_pair_ids: overlapPairs,
    clamped_zone_count: clampedZones,
    clamp_moves: clampMoves,
    kilnwatch_continent: (zonesRaw.find(z => z.zone_id === 'zone-town-kilnwatch-bastion') || {}).continent_id,
    max_clamp_move_px: Math.round(maxMovePx * 10) / 10
  };
})()`, sandbox);
const unescapeHtml = t => t.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const svgHtml = elements['mainContent'] ? elements['mainContent'].innerHTML : '';
const handlerBodies = [];
for (const m of svgHtml.matchAll(/on(?:click|keydown)="([^"]*selectStudioMapPoi[^"]*)"/g)) handlerBodies.push(unescapeHtml(m[1]));
let handlerParseFailures = 0;
for (const body of handlerBodies) {
  try { new Function('event', body); } catch (_e) { handlerParseFailures++; }
}
v8Report.handlerCount = handlerBodies.length;
v8Report.handlerParseFailures = handlerParseFailures;

// V-9: zoom is pure camera (no LOC teleport, no field/town hijack, continuous overland scale, monotonic labels)
const v9Report = vm.runInContext(`(() => {
  STUDIO_PERSPECTIVE = 'world-history-and-concept';
  zoomStudioMap(0, true);
  setAtlasFilter('All');
  const loc0 = JSON.stringify(STUDIO_MAP_LOC);
  const steps = [];
  const labelsAt = () => {
    const h = document.getElementById('mainContent').innerHTML;
    return [...h.matchAll(/<g\\b[^>]*>/g)]
      .map(m => m[0])
      .filter(t => t.includes('class="atlas-screen-pin"'))
      .map(t => (t.match(/aria-label="([^"]+)"/) || [])[1])
      .filter(Boolean)
      .map(l => l.split(' (')[0]);
  };
  let prevLabels = labelsAt();
  const initialLabelCount = prevLabels.length;
  const lostLabels = [];
  for (let i = 0; i < 30 && STUDIO_MAP_ZOOM < 8.0; i++) {
    zoomStudioMap(0.35, false, null, 300, 200);
    render();
    const scale = getStudioMapEffScale(STUDIO_MAP_ZOOM);
    const labels = labelsAt();
    prevLabels.forEach(l => { if (!labels.includes(l)) lostLabels.push(STUDIO_MAP_ZOOM + ':' + l); });
    prevLabels = labels;
    steps.push({ z: STUDIO_MAP_ZOOM, ctx: getAtlasSpatialContext(), scale, field: ATLAS_STATE_STORE.activeFieldOrFortId });
  }
  const wheelMaxZoom = STUDIO_MAP_ZOOM;
  const locUnchanged = JSON.stringify(STUDIO_MAP_LOC) === loc0;
  focusTownStreetBlueprint('town-lantern-hollow');
  const lensTownCtx = getAtlasSpatialContext();
  zoomStudioMap(0, false, 2.8);
  const afterRegionalCtx = getAtlasSpatialContext();
  focusFieldTacticalBlueprint('zone-field-clover-south-gate');
  const lensFieldCtx = getAtlasSpatialContext();
  zoomStudioMap(0, true);
  openDungeonSubMap('zone-dungeon-does-not-exist', 'B1');
  const unknownDungeonOpened = ATLAS_STATE_STORE.activeDungeonId;
  const unknownDungeonToast = ATLAS_STATE_STORE.toastMessage;
  zoomStudioMap(0, true);
  ATLAS_SHOW_ALL_SVG_OVERLAYS = true;
  render();
  const bossHtml = (document.getElementById('mainContent').innerHTML.match(/<g id="studioBossHierarchyChainOverlay">[\\s\\S]*?<\\/g>/) || [''])[0];
  const bossEnds = new Set([...bossHtml.matchAll(/x2="([^"]+)" y2="([^"]+)"/g)].map(m => m[1] + ',' + m[2])).size;
  const sealOnclick = (bossHtml.match(/onclick="(openDungeonSubMap\\([^"]*)"/) || [])[1] || '';
  ATLAS_SHOW_ALL_SVG_OVERLAYS = false;
  zoomStudioMap(0, true);
  focusTownStreetBlueprint('town-lantern-hollow');
  openDungeonSubMap('zone-dungeon-kiln-cellar', 'B1');
  const dungeonClearsTownInterior = STUDIO_MAP_TOWN_INTERIOR === false;
  zoomStudioMap(0, true);
  const townBefore = ATLAS_STATE_STORE.activeTownId;
  resolveNearestZoneFromPanAndLoc(5.0, clampWorldLocCoord('72986:113330'), 0, 0);
  const nearestZoneNoHijack = !ATLAS_STATE_STORE.activeFieldOrFortId && ATLAS_STATE_STORE.activeTownId === townBefore;
  zoomStudioMap(0, false, 3.0);
  ATLAS_STATE_STORE.activeFieldOrFortId = 'zone-field-does-not-exist';
  const bogusFieldCtx = getAtlasSpatialContext();
  const bogusFieldScale = getStudioMapEffScale();
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  zoomStudioMap(0, true);
  const sl = svgToL2Loc(700, 120);
  const rt = clampWorldLocCoord(sl.x + ':' + sl.y);
  return {
    steps: steps.length,
    initialLabelCount,
    nonOverlandSteps: steps.filter(st => st.ctx !== 'overland' || st.field).map(st => st.z),
    scaleJumps: steps.filter(st => Math.abs(st.scale - st.z) > 1e-9).map(st => st.z),
    wheelMaxZoom,
    locUnchanged,
    lostLabels,
    lensTownCtx,
    afterRegionalCtx,
    lensFieldCtx,
    locRoundTripErr: Math.abs(rt.svgX - 700) + Math.abs(rt.svgY - 120),
    unknownDungeonOpened,
    dungeonClearsTownInterior,
    nearestZoneNoHijack,
    bogusFieldCtx,
    bogusFieldScale,
    unknownDungeonToast,
    bossEnds,
    sealOnclick
  };
})()`, sandbox);


// V-10 (F-155): engine parity + URL round-trip
const v10Sim = process.env.ATLAS_V10_SIMULATE || '';
const v10Report = vm.runInContext(`(() => {
  const SIM = ${JSON.stringify(v10Sim)};
  if (SIM === 'landmark') { const orig = getAtlasLandmarkAnchor; getAtlasLandmarkAnchor = id => id === 'town-kilnwatch-bastion' ? { x: 618, y: 308 } : orig(id); }
  if (SIM === 'count') { const orig = getAtlasOverlandZoneFilterModel; getAtlasOverlandZoneFilterModel = () => { const m = orig(); return m.effFilter === 'Monster' ? { ...m, matching: m.matching.slice(1) } : m; };
    const origB = buildAtlasspatialFeaturesList; buildAtlasspatialFeaturesList = () => { const keep = getAtlasOverlandZoneFilterModel; getAtlasOverlandZoneFilterModel = orig; try { return origB(); } finally { getAtlasOverlandZoneFilterModel = keep; } }; }
  STUDIO_PERSPECTIVE = 'world-history-and-concept';
  setAtlasEngineMode('2d_svg');
  ATLAS_STATE_STORE.levelBand = 'All';
  setAtlasFilter('All');
  zoomStudioMap(0, true);
  render();
  const html = () => document.getElementById('mainContent').innerHTML;
  // SVG side: landmark id + inner translate(x, y) straight from the rendered markup.
  const svgLms = [...html().matchAll(/data-landmark-id="([^"]+)"[\\s\\S]*?translate\\(\\s*([-\\d.]+)[ ,]+([-\\d.]+)\\)/g)].map(m => ({ id: m[1], x: +m[2], y: +m[3] }));
  // OL side: the feature list mountRealOpenLayersInstance turns into Point([x, 500 - y]).
  const olById = {}; buildAtlasspatialFeaturesList().forEach(f => { olById[f.id] = f; });
  const zoneIds = new Set(getAllAtlas63Zones(DATA.studioPerspectives.tShapedWorldAtlas).map(z => z.zone_id));
  const landmarkRows = svgLms.map(lm => {
    const j = ATLAS_OVERLAND_LANDMARK_ANCHORS.find(e => e.landmarkId === lm.id);
    const f = j && olById[j.zoneId];
    const olPt = f ? [f.x, 500 - f.y] : null;
    return { id: lm.id, zone: j ? j.zoneId : null, zoneExists: Boolean(j && zoneIds.has(j.zoneId)), svg: [lm.x, lm.y], olSvgSpace: olPt ? [olPt[0], 500 - olPt[1]] : null,
      d: olPt ? Math.hypot(olPt[0] - lm.x, (500 - olPt[1]) - lm.y) : null };
  });
  const filters = ['All', 'RaceSpawns', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'];
  const counts = {};
  for (const f of filters) {
    setAtlasFilter(f);
    const ol = buildAtlasspatialFeaturesList().length;
    const row = { ol, svg: {}, badge: {} };
    for (const z of [1.0, 2.8, 6.0]) {
      STUDIO_MAP_ZOOM = z; render();
      const h = html();
      row.svg[z] = (h.match(/class="atlas-zone-mark"/g) || []).length;
      row.badge[z] = +((h.match(/joy-context-filter-bar__count">\\s*(\\d+)/) || [])[1] || -1);
    }
    counts[f] = row;
  }
  setAtlasFilter('All');
  zoomStudioMap(0, true);
  // URL round-trip through the real writer and reader (history + location are vm mocks).
  let lastUrl = '';
  history.replaceState = (a, b, u) => { lastUrl = String(u); };
  history.pushState = (a, b, u) => { lastUrl = String(u); };
  const loadUrl = u => { const i = u.indexOf('#'); window.location.search = ''; window.location.hash = i >= 0 ? u.slice(i) : ''; if (i < 0) window.location.search = u; syncUrlState(); };
  CURRENT_TAB = 'studio';
  ATLAS_ROUTE_PLANNER_OPEN = false; toggleAtlasRoutePlanner();
  setAtlasRouteEndpoints('zone-town-kilnwatch-bastion', 'zone-dungeon-pendulum-shaft');
  Object.assign(ATLAS_3D_STATE, { zoom: 1.734, yaw: 0.913, pitch: 1.2, panX: 12.5, panY: -7.25 });
  if (SIM === 'url') { const w = writeUrlState; writeUrlState = (...a) => { w(...a); lastUrl = lastUrl.replace(/[&?#](route|routeFrom|routeTo|zoom3d|yaw3d|pitch3d|pan3d)=[^&#]*/g, ''); }; }
  writeUrlState(false);
  const written = lastUrl;
  Object.assign(ATLAS_3D_STATE, ATLAS_3D_CAMERA_DEFAULTS);
  ATLAS_ROUTE_PLANNER_OPEN = false; ATLAS_ROUTE_FROM_ID = 'x'; ATLAS_ROUTE_TO_ID = 'y';
  loadUrl(written);
  const back = { route: ATLAS_ROUTE_PLANNER_OPEN, from: ATLAS_ROUTE_FROM_ID, to: ATLAS_ROUTE_TO_ID, cam: [ATLAS_3D_STATE.zoom, ATLAS_3D_STATE.yaw, ATLAS_3D_STATE.pitch, ATLAS_3D_STATE.panX, ATLAS_3D_STATE.panY] };
  ATLAS_ACTIVE_STUDIO_BAR = 'stale_overlay'; ATLAS_STATE_STORE.activeStudioBar = 'stale_overlay'; ATLAS_LEFT_DRAWER_OPEN = false; ATLAS_DIMENSION_DRAWER_OPEN = false;
  loadUrl('#tab=studio&lens=liveops');
  const lens = { bar: ATLAS_ACTIVE_STUDIO_BAR, storeBar: ATLAS_STATE_STORE.activeStudioBar, dflt: ATLAS_LENS_DEFAULT_BAR.liveops, dim: ATLAS_DIMENSION_DRAWER_OPEN, left: ATLAS_LEFT_DRAWER_OPEN };
  loadUrl('#tab=studio&lens=liveops&overlay=tools_squad');
  const overlayWins = ATLAS_ACTIVE_STUDIO_BAR === 'tools_squad';
  loadUrl('#tab=studio&zoom3d=NaN&yaw3d=abc&pitch3d=99&pan3d=1:&routeFrom=%3Cx%3E');
  const junk = { cam: [ATLAS_3D_STATE.zoom, ATLAS_3D_STATE.yaw, ATLAS_3D_STATE.pitch, ATLAS_3D_STATE.panX, ATLAS_3D_STATE.panY], from: ATLAS_ROUTE_FROM_ID, route: ATLAS_ROUTE_PLANNER_OPEN };
  loadUrl('#tab=studio&lens=gamer');
  setAtlasPersonaLens('gamer');
  return { simulate: SIM, landmarkCount: svgLms.length, tableCount: ATLAS_OVERLAND_LANDMARK_ANCHORS.length, landmarkRows, counts, written, back, lens, overlayWins, junk };
})()`, sandbox);
// V-11 (F-157): frame clip, sidebar/drawer state machines
const v11Report = vm.runInContext(`(() => {
  STUDIO_PERSPECTIVE = 'world-history-and-concept';
  setAtlasEngineMode('2d_svg');
  render();
  const html = document.getElementById('mainContent').innerHTML;
  const clipDef = /<clipPath id="atlasWorldFrameClip"[^>]*>\\s*<rect[^>]*x="0"[^>]*y="0"[^>]*width="1040"[^>]*height="500"/.test(html);
  const wrapped = /<g clip-path="url\\(#atlasWorldFrameClip\\)">\\s*(?:<!--[\\s\\S]*?-->\\s*)*<g id="studioCartoViewport"/.test(html);
  const hasSidebarFn = typeof toggleAppSidebar === 'function';
  let drawerAfterClose = null;
  STUDIO_MAP_SELECTED_POI = { title: 'Probe', category: 'Probe' };
  ATLAS_LEFT_DRAWER_OPEN = true;
  try { closeStudioMapPoi(); drawerAfterClose = ATLAS_LEFT_DRAWER_OPEN; } catch (e) { drawerAfterClose = 'err:' + e.message; }
  const hasMaximize = typeof toggleAtlasMaximizeMap === 'function';
  return { clipDef, wrapped, hasSidebarFn, drawerAfterClose, hasMaximize };
})()`, sandbox);
console.log(JSON.stringify({
  v11Report,
  v10Report,
  v9Report,
  v8Report,
  lensOutputs,
  stateMutationFailures,
  testedFiltersCount: filters.length,
  compareHtml,
  theaterHtml,
  v6Report,
  v7Report
}));
"""

    with tempfile.TemporaryDirectory() as tmpdir:
        js_path = Path(tmpdir) / "app.js"
        bundle_path = Path(tmpdir) / "bundle.json"
        js_path.write_text(main_js, encoding="utf-8")
        bundle_path.write_text(json.dumps(bundle), encoding="utf-8")

        env = dict(os.environ)
        env["ATLAS_JS_PATH"] = str(js_path)
        env["ATLAS_BUNDLE_PATH"] = str(bundle_path)

        proc = subprocess.run(
            ["node", "-e", node_script],
            capture_output=True,
            text=True,
            env=env,
            check=True,
        )
        vm_out = json.loads(proc.stdout.strip().splitlines()[-1])

    lens_metrics = {}
    for lens, data in vm_out["lensOutputs"].items():
        dom_info = inspect_rendered_dom(data["html"])
        lens_metrics[lens] = {
            "elapsedMs": data["elapsedMs"],
            "vm_render_ms": data["elapsedMs"],
            "runner": "node-vm-mock",
            "svgNodes": dom_info["svgNodes"],
            "aboveCanvasDom": dom_info["aboveCanvasDom"],
        }

    gamer_dom = inspect_rendered_dom(vm_out["lensOutputs"]["gamer"]["html"])
    compare_dom = inspect_rendered_dom(vm_out["compareHtml"])
    theater_dom = inspect_rendered_dom(vm_out["theaterHtml"])

    full_doc_dom = inspect_rendered_dom(html + "\n" + vm_out["lensOutputs"]["gamer"]["html"])
    v1_passed = (
        lens_metrics["gamer"]["aboveCanvasDom"] <= 55
        and lens_metrics["gamer"]["svgNodes"] <= 550
        and all(m["svgNodes"] <= 550 for m in lens_metrics.values())
        and all(m["elapsedMs"] <= 30.0 for m in lens_metrics.values())
    )
    v2_passed = (
        vm_out["stateMutationFailures"] == 0 and vm_out["testedFiltersCount"] == 7
    )
    v3_passed = (
        len(gate_keys) == 87
        and set(catalog_keys) == set(gate_keys)
        and len(orphan_keys) == 0
        and compare_dom["activeMountChildren"] == 2
    )
    v4_passed = (
        len(full_doc_dom["inlineStyleOffenders"]) == 0
        and len(gamer_dom["emojiOffenders"]) == 0
        and "@media (max-width: 767px)" in html
        and ".joy-spatial-shell" in theme_css
    )
    v5_passed = (
        theater_dom["shellAttrs"].get("data-theater") == "true"
        and theater_dom["shellAttrs"].get("data-bottom-open") == "false"
        and theater_dom["svgAttrs"].get("width") == "100%"
        and theater_dom["svgAttrs"].get("height") == "100%"
        and theater_dom["dockInBottom"] is True
    )
    v6 = vm_out.get("v6Report") or {}
    glb_checks = v6.get("glbChecks") or {}
    v6_passed = (
        v6.get("olFeatureCount", 0) >= 10
        and v6.get("olHasLensBadge") is True
        and v6.get("hasStreetRibbonMesh") is True
        and bool(v6.get("pickRes") and v6["pickRes"].get("hasShopCatalog") is True)
        and all(
            c.get("magic") == 0x46546C67
            and c.get("version") == 2
            and c.get("nodeCount") == c.get("meshCount", 0) + 1
            and c.get("nodeCount", 0) >= 12
            and "Godot 4" in str(c.get("unit") or "")
            for c in glb_checks.values()
        )
    )
    v7 = vm_out.get("v7Report") or {}
    filter_counts = v7.get("filterCounts") or {}
    v7_passed = (
        v7.get("zoneCount") == 63
        and v7.get("offWorld") == []
        and all(0 < filter_counts.get(f, 0) < 63 for f in ("Monster", "Mini-Boss", "Raid", "MVP"))
        and 0 < v7.get("band1to10", 0) < 63
        and v7.get("townHasInspector") is True
        and v7.get("dungeonHasInspector") is False
        and v7.get("dungeonHasTownOnlyNote") is True
        and v7.get("poiClearedOnDungeon") is True
        and v7.get("poiClearedOnField") is True
        and v7.get("metersPerUnit") == {"overland": 1860, "town": 1, "dungeon": 1}
        and v7.get("polyHit") is True
        and v7.get("groundRank") is True
    )

    v8 = vm_out.get("v8Report") or {}
    tiers = v8.get("tierCounts") or {}
    ol_vendor = ROOT / "tools" / "mac-observatory" / "vendor" / "ol.js"
    ol_vendor_bytes = ol_vendor.stat().st_size if ol_vendor.is_file() else 0
    v8_passed = (
        tiers.get("Monster", 0) > tiers.get("Mini-Boss", 0) > tiers.get("Raid", 0) > tiers.get("MVP", 0) > 0
        and v8.get("pillEmojiLenses") == []
        and v8.get("gamerBar") == v8.get("gamerDefaultBar")
        and v8.get("architectBar") != v8.get("gamerBar")
        and v8.get("pointsChecked") == 63
        and v8.get("pointsOutsideOwnContinent") == []
        and v8.get("foreign_continent_hits") == 0
        and v8.get("own_continent_inside") == 63
        and v8.get("overlapping_polygon_pairs") == 0
        and v8.get("stacked_zero_px_pairs") == 0
        and v8.get("min_pair_dist_px", 0) >= 10
        and v8.get("handlerCount", 0) > 0
        and v8.get("handlerParseFailures") == 0
        and "cdn.jsdelivr" not in html
        and "pendingDrawerTimer" not in html
        and ol_vendor_bytes > 100 * 1024
    )

    v9 = vm_out.get("v9Report") or {}
    zoom_fn = re.search(r"function zoomStudioMap\(.*?\n}\n", html, re.DOTALL)
    zoom_body = zoom_fn.group(0) if zoom_fn else ""
    pin_css = re.search(r"\.atlas-screen-pin \{(.*?)\}", html, re.DOTALL)
    pin_css_body = pin_css.group(1) if pin_css else ""
    v9_passed = (
        "transform-box: view-box" in pin_css_body
        and "fill-box" not in pin_css_body
        and bool(zoom_body)
        and "STUDIO_MAP_LOC =" not in zoom_body
        and "resolveNearestZoneFromPanAndLoc" not in zoom_body
        and v9.get("steps", 0) >= 15
        and v9.get("initialLabelCount", 0) >= 10
        and v9.get("nonOverlandSteps") == []
        and v9.get("scaleJumps") == []
        and v9.get("wheelMaxZoom") == 8.0
        and v9.get("locUnchanged") is True
        and v9.get("lostLabels") == []
        and v9.get("lensTownCtx") == "town"
        and v9.get("afterRegionalCtx") == "overland"
        and v9.get("lensFieldCtx") == "field"
        and v9.get("locRoundTripErr", 99) <= 1
        and v9.get("unknownDungeonOpened") == ""
        and "not found" in str(v9.get("unknownDungeonToast") or "")
        and v9.get("bossEnds", 0) >= 4
        and "zone-catacomb-" in str(v9.get("sealOnclick") or "")
        and "STUDIO_PERSPECTIVE !== 'world_atlas'" not in html
        and v9.get("dungeonClearsTownInterior") is True
        and v9.get("nearestZoneNoHijack") is True
        and v9.get("bogusFieldCtx") == "overland"
        and v9.get("bogusFieldScale") == 3.0
        and "function getAtlasEffectiveEngineMode(" in html
        and "function getAtlasOlCameraFromApp(" in html
    )

    v10 = vm_out.get("v10Report") or {}
    lm_rows = v10.get("landmarkRows") or []
    v10_bad_landmarks = [r["id"] for r in lm_rows if r.get("d") is None or r["d"] >= 0.5 or not r.get("zoneExists")]
    v10_count_mismatch = {
        f: r
        for f, r in (v10.get("counts") or {}).items()
        if not (r["ol"] > 0 and all(n == r["ol"] for n in r["svg"].values()) and all(n == r["ol"] for n in r["badge"].values()))
    }
    v10_back = v10.get("back") or {}
    v10_lens = v10.get("lens") or {}
    v10_junk = v10.get("junk") or {}
    v10_url_ok = (
        v10_back.get("route") is True
        and v10_back.get("from") == "zone-town-kilnwatch-bastion"
        and v10_back.get("to") == "zone-dungeon-pendulum-shaft"
        and v10_back.get("cam") == [1.734, 0.913, 1.2, 12.5, -7.25]
    )
    v10_lens_ok = (
        v10_lens.get("bar") == v10_lens.get("dflt")
        and v10_lens.get("storeBar") == v10_lens.get("dflt")
        and v10_lens.get("dim") is True
        and v10_lens.get("left") is True
        and v10.get("overlayWins") is True
    )
    v10_junk_ok = v10_junk.get("cam") == [1, -0.62, 1.45, 0, 0] and v10_junk.get("from") == "zone-town-lantern-hollow" and v10_junk.get("route") is False
    v10_passed = (
        v10.get("landmarkCount", 0) >= 10
        and v10.get("landmarkCount") == v10.get("tableCount")
        and v10_bad_landmarks == []
        and len(v10.get("counts") or {}) == 7
        and v10_count_mismatch == {}
        and v10_url_ok
        and v10_lens_ok
        and v10_junk_ok
    )

    v11 = vm_out.get("v11Report") or {}
    v11_css = {
        "sidebar_collapse_css": bool(re.search(r'body\[data-sidebar-collapsed="true"\]\s+\.sidebar\s*\{[^}]*width:\s*0', html)),
        "sidebar_reopen_tab": 'id="appSidebarReopenTab"' in html,
        "sidebar_hotkey": "evt.key === '['" in html and "toggleAppSidebar();" in html,
        "sidebar_url_state": "sidebar=" in html or "params.set('sidebar'" in html,
        "lens_bar_wraps": bool(re.search(r"\.joy-lens-bar\s*\{[^}]*flex-wrap:\s*wrap", html)),
        "lens_buttons_nowrap": bool(re.search(r"\.joy-spatial-shell__toggle[^{]*\{[^}]*white-space:\s*nowrap", html)),
        "drawer_overlay_le_1180": bool(re.search(r"max-width: 1180px\) and \(min-width: 768px\)\s*\{\s*\.joy-spatial-shell\[data-left-open=\"true\"\] \.joy-spatial-shell__body[^}]*\}[^}]*position: absolute", html)),
    }
    v11_passed = (
        v11.get("clipDef") is True
        and v11.get("wrapped") is True
        and v11.get("hasSidebarFn") is True
        and v11.get("hasMaximize") is True
        and v11.get("drawerAfterClose") is False
        and all(v11_css.values())
    )

    return {
        "overall_passed": bool(
            v1_passed and v2_passed and v3_passed and v4_passed and v5_passed and v6_passed and v7_passed and v8_passed
            and v9_passed and v10_passed and v11_passed
        ),
        "gates": {
            "V-1_dom_and_render_budget": {
                "passed": v1_passed,
                "lens_metrics": lens_metrics,
            },
            "V-2_filter_auto_heal_state_machine": {
                "passed": v2_passed,
                "state_mutation_failures": vm_out["stateMutationFailures"],
                "tested_filters_count": vm_out["testedFiltersCount"],
            },
            "V-3_zero_orphan_overlays_and_compare_mode": {
                "passed": v3_passed,
                "gated_overlays_count": len(gate_keys),
                "catalog_keys_count": len(catalog_keys),
                "orphan_keys": orphan_keys,
                "compare_mount_children": compare_dom["activeMountChildren"],
            },
            "V-4_joy_contract_purity_and_mobile_guard": {
                "passed": v4_passed,
                "inline_style_offenders": gamer_dom["inlineStyleOffenders"],
                "emoji_offenders": gamer_dom["emojiOffenders"],
            },
            "V-5_theater_mode_and_below_canvas_dock": {
                "passed": v5_passed,
                "theater_attr": theater_dom["shellAttrs"].get("data-theater"),
                "bottom_open_attr": theater_dom["shellAttrs"].get("data-bottom-open"),
                "svg_width": theater_dom["svgAttrs"].get("width"),
                "svg_height": theater_dom["svgAttrs"].get("height"),
                "dock_in_bottom": theater_dom["dockInBottom"],
            },
            "V-6_spatial_engines_and_glb_integrity": {
                "passed": v6_passed,
                "ol_feature_count": v6.get("olFeatureCount"),
                "ol_has_lens_badge": v6.get("olHasLensBadge"),
                "has_street_ribbon_mesh": v6.get("hasStreetRibbonMesh"),
                "pick_res": v6.get("pickRes"),
                "glb_checks": glb_checks,
            },
            # vm-tier only: real picking/focus/second-click drill are verified in Chrome (wave-11 audit).
            "V-7_town_only_shops_zone_coverage_and_glb_scale": {
                "passed": v7_passed,
                **v7,
            },
            "V-8_wave12_distinct_filters_zero_delay_and_pin_handlers": {
                "passed": v8_passed,
                **v8,
                "no_cdn_jsdelivr": "cdn.jsdelivr" not in html,
                "no_pending_drawer_timer": "pendingDrawerTimer" not in html,
                "vendor_ol_js_bytes": ol_vendor_bytes,
            },
            "V-9_zoom_invariance_no_loc_teleport_no_tier_hijack": {
                "passed": v9_passed,
                "pin_css_view_box": "transform-box: view-box" in pin_css_body,
                "zoom_fn_mutates_loc": "STUDIO_MAP_LOC =" in zoom_body,
                "zoom_fn_resolves_zone": "resolveNearestZoneFromPanAndLoc" in zoom_body,
                **v9,
            },
            "V-11_frame_clip_sidebar_drawer_lens_bar": {
                "passed": v11_passed,
                **v11,
                "css": v11_css,
            },
            "V-10_engine_parity_zone_counts_and_url_round_trip": {
                "passed": v10_passed,
                "simulate": v10.get("simulate"),
                "landmark_count": v10.get("landmarkCount"),
                "landmark_table_count": v10.get("tableCount"),
                "max_landmark_delta_px": max((r["d"] for r in lm_rows if r.get("d") is not None), default=None),
                "bad_landmarks": v10_bad_landmarks,
                "zone_counts": v10.get("counts"),
                "count_mismatch": v10_count_mismatch,
                "url_round_trip_ok": v10_url_ok,
                "url_written": v10.get("written"),
                "url_back": v10_back,
                "lens_default_ok": v10_lens_ok,
                "lens": v10_lens,
                "junk_params_ok": v10_junk_ok,
                "junk": v10_junk,
            },
        },
    }


def main() -> int:
    for arg in sys.argv[1:]:
        if arg.startswith("--simulate-v10="):
            os.environ["ATLAS_V10_SIMULATE"] = arg.split("=", 1)[1]
    report = run_ux_probe()
    print(json.dumps(report, indent=2))
    return 0 if report["overall_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
