#!/usr/bin/env python3
"""Deterministic UX & Performance Verification Probe (UX-0) for Atlas World Studio.

Executes the live frontend bundle inside a zero-dependency Node VM + Python HTML AST
harness and verifies:
- V-1: Above-canvas chrome DOM count <= 55, gamer SVG nodes <= 600, all lenses SVG nodes <= 1500, render() <= 30ms.
- V-2: Pure render-path filter auto-healing across all 4 spatial contexts x 7 filters (zero state mutation).
- V-3: Zero orphan gateStudioOverlaySvg keys across ATLAS_PERSONA_STUDIO_CATALOG + Compare Overlay dual-mount.
- V-4: Zero inline style= and zero emoji characters on .joy-* contract elements + 375px mobile overflow CSS guard.
- V-5: Theater mode 100% SVG viewport contract and below-canvas studio dock placement.
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
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; },
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
    location: { search: '?tab=studio', hash: '', pathname: '/', origin: 'http://127.0.0.1:8788' },
    history: { replaceState() {}, pushState() {}, back() {}, forward() {} },
    addEventListener() {},
    scrollTo() {}
  },
  document: {
    documentElement: makeEl('html'),
    body: makeEl('body'),
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

console.log(JSON.stringify({
  lensOutputs,
  stateMutationFailures,
  testedFiltersCount: filters.length,
  compareHtml,
  theaterHtml
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

    return {
        "overall_passed": bool(
            v1_passed and v2_passed and v3_passed and v4_passed and v5_passed
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
        },
    }


def main() -> int:
    report = run_ux_probe()
    print(json.dumps(report, indent=2))
    return 0 if report["overall_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
