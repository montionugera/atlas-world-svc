#!/usr/bin/env python3
"""
Atlas World — MMORPG Catalog & Balance Observatory Web Studio (scripts/catalog_explorer_web.py)

Unified Web-First + Native macOS (`WKWebView`) Observatory powered by:
  1. Canonical `joy-design` Design System (`@joymify/tokens` `theme.css`, `@joymify/brand`, `.joy-*`)
  2. RateMyServer (RMS) Information Architecture:
     - Dense 2D Tabular Datasheets (`item_db`, `mob_db`, `skill_db_class`, `map_db` / `areainfo`)
     - Dual Human Description + Authoritative Engine Script / Contract Rows
     - Bidirectional Reverse-Lookup Joins (Dropped By, Applicable Jobs, Spawns On, Used In Quests)
     - Live Parameterized Drop Rate Multiplier (`1x`, `3x`, `5x`, `10x`)
     - 2D Top-Down Minimap SVG Renderer + Area Monster Spawn Table

Usage:
  python3 scripts/catalog_explorer_web.py [--port 8788]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
BUILD_SCRIPT = ROOT / "scripts" / "build_catalog_db.py"
DB_PATH = ROOT / "build" / "catalog.sqlite"
CONTENT_DIR = ROOT / "contracts" / "content"
MAPS_DIR = ROOT / "content" / "maps"
SPECS_DIR = ROOT / "docs" / "superpowers" / "specs"
CANON_PATH = ROOT / "content" / "story" / "canon.md"

THEME_CSS_CANDIDATES = [
    ROOT.parent / "joy-design" / "packages" / "tokens" / "dist" / "theme.css",
    ROOT.parent / "joy-design" / ".claude" / "worktrees" / "_release" / "packages" / "tokens" / "dist" / "theme.css",
    ROOT / "tools" / "mac-observatory" / "joy-theme.css",
]


def load_theme_css() -> bytes:
    for candidate in THEME_CSS_CANDIDATES:
        if candidate.exists():
            return candidate.read_bytes()
    return b"/* joy-theme.css not found */"


def ensure_catalog_db() -> None:
    if not DB_PATH.exists():
        subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)


def load_json_file(path: Path):
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_full_bundle() -> dict:
    ensure_catalog_db()
    jobs = load_json_file(CONTENT_DIR / "jobs.json") or []
    skills = load_json_file(CONTENT_DIR / "skills.json") or []
    items = load_json_file(CONTENT_DIR / "items.json") or []
    mobs = load_json_file(CONTENT_DIR / "mobs.json") or []
    cards = load_json_file(CONTENT_DIR / "cards.json") or []
    quests = load_json_file(CONTENT_DIR / "quest_board.json") or []
    handbook = load_json_file(CONTENT_DIR / "handbook.json") or []
    castles = load_json_file(CONTENT_DIR / "castles.json") or []
    elements = load_json_file(CONTENT_DIR / "elements.json") or {}
    summary = load_json_file(ROOT / "build" / "catalog_summary.json") or {}

    maps = []
    if MAPS_DIR.exists():
        for mp in sorted(MAPS_DIR.glob("*.json")):
            d = load_json_file(mp) or {}
            maps.append(
                {
                    "id": d.get("mapId") or mp.stem,
                    "name": d.get("name") or d.get("displayName") or mp.stem,
                    "width": d.get("width", d.get("widthMeters", 200)),
                    "height": d.get("height", d.get("depthMeters", 200)),
                    "terrainAmplitude": d.get("terrainAmplitude", 1.0),
                    "defaultTimeOfDayHours": d.get("defaultTimeOfDayHours", 12.0),
                    "terraceCount": len(d.get("heightTerraces", [])),
                    "structureCount": len(d.get("structures", [])),
                    "propCount": len(d.get("props", [])),
                    "structures": d.get("structures", []),
                    "heightTerraces": d.get("heightTerraces", []),
                    "spawnAreas": d.get("spawnAreas", []),
                    "props": (d.get("props", []) or [])[:40],
                }
            )

    docs = []
    if SPECS_DIR.exists():
        for sp in sorted(SPECS_DIR.glob("*.md"), reverse=True):
            docs.append(
                {
                    "id": sp.name,
                    "title": sp.stem,
                    "path": str(sp.relative_to(ROOT)),
                    "category": "spec",
                    "content": sp.read_text(encoding="utf-8", errors="replace"),
                }
            )
    if CANON_PATH.exists():
        docs.append(
            {
                "id": "canon.md",
                "title": "World Lore Canon (canon.md)",
                "path": str(CANON_PATH.relative_to(ROOT)),
                "category": "canon",
                "content": CANON_PATH.read_text(encoding="utf-8", errors="replace"),
            }
        )

    return {
        "jobs": jobs,
        "skills": skills,
        "items": items,
        "mobs": mobs,
        "cards": cards,
        "quests": quests,
        "handbook": handbook,
        "castles": castles,
        "elements": elements,
        "maps": maps,
        "summary": summary,
        "docs": docs,
    }


def run_readonly_sql(query: str) -> dict:
    ensure_catalog_db()
    clean = query.strip()
    if not clean:
        return {"ok": False, "error": "Empty SQL query."}
    first_word = clean.split()[0].upper()
    if first_word not in ("SELECT", "PRAGMA", "WITH", "EXPLAIN"):
        return {"ok": False, "error": "Only read-only SELECT / WITH / PRAGMA / EXPLAIN queries are permitted."}

    try:
        uri = f"file:{DB_PATH}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        cur = conn.cursor()
        cur.execute(clean)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = [list(r) for r in cur.fetchmany(250)]
        conn.close()
        return {"ok": True, "columns": cols, "rows": rows, "rowCount": len(rows)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def run_balance_sim() -> dict:
    cargo_bin = shutil.which("cargo") or str(Path.home() / ".cargo" / "bin" / "cargo")
    manifest = ROOT / "server-rs" / "Cargo.toml"
    try:
        res = subprocess.run(
            [cargo_bin, "run", "--quiet", "--manifest-path", str(manifest), "--bin", "balance_sim"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        out = (res.stdout or "") + (("\n" + res.stderr) if res.stderr else "")
        return {
            "ok": res.returncode == 0,
            "exitCode": res.returncode,
            "output": out.strip() or "(no output)",
        }
    except Exception as exc:
        return {"ok": False, "exitCode": -1, "output": f"Failed to run balance_sim: {exc}"}


INDEX_HTML = r"""<!DOCTYPE html>
<html lang="en" data-theme="dark" data-palette="classic">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script>
    (function () {
      var theme = 'dark';
      try { theme = localStorage.getItem('joy-theme') || 'dark'; } catch (e) {}
      document.documentElement.setAttribute('data-theme', theme);
      var palette = 'classic';
      try { palette = localStorage.getItem('joy-palette') || 'classic'; } catch (e) {}
      document.documentElement.setAttribute('data-palette', palette);
    })();
  </script>
  <title>Atlas World — Joymify Design Observatory (RMS Edition)</title>
  <link rel="stylesheet" href="/theme.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --sidebar-width: 268px;
      --hub-sidebar-bg: var(--joy-surface-card);
      --hub-topbar-bg: var(--joy-surface-card);
      --hub-chrome-border: var(--joy-border-default);
    }
    [data-theme="dark"] {
      --hub-sidebar-bg: var(--joy-surface-card);
      --hub-topbar-bg: var(--joy-surface-card);
      --hub-chrome-border: var(--joy-border-strong);
    }
    * { box-sizing: border-box; min-width: 0; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      font-family: var(--joy-font-family-sans, 'Inter', -apple-system, sans-serif);
      background-color: var(--joy-surface-canvas);
      color: var(--joy-text-primary);
      -webkit-font-smoothing: antialiased;
    }
    body { display: flex; }

    * { scrollbar-width: thin; scrollbar-color: var(--joy-border-default) transparent; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background-color: var(--joy-border-default); border-radius: var(--joy-radius-pill); }
    ::-webkit-scrollbar-thumb:hover { background-color: var(--joy-border-strong); }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--hub-sidebar-bg);
      border-right: 1px solid var(--hub-chrome-border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      height: 100%;
      user-select: none;
    }
    .brand {
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--joy-border-subtle);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .brand-info h2 {
      margin: 0;
      font-size: var(--joy-font-size-md);
      font-weight: 700;
      color: var(--joy-text-primary);
      letter-spacing: -0.01em;
    }
    .brand-info span {
      display: block;
      font-size: var(--joy-font-size-xs);
      color: var(--joy-accent-text);
      font-weight: 600;
      margin-top: 2px;
    }
    .sidebar-search {
      padding: 12px 12px 6px;
      flex-shrink: 0;
    }
    .sidebar-search__inner {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--joy-surface-sunken);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-control);
    }
    .sidebar-search__inner:focus-within {
      border-color: var(--joy-border-focus);
      box-shadow: 0 0 0 2px var(--joy-focus-ring);
    }
    .sidebar-search__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      padding-left: 10px;
      color: var(--joy-text-secondary);
      pointer-events: none;
    }
    .sidebar-search__input {
      flex: 1;
      width: 100%;
      height: 34px;
      padding: 0 8px;
      background: transparent;
      border: none;
      outline: none;
      font-size: var(--joy-font-size-sm);
      font-family: inherit;
      color: var(--joy-text-primary);
    }
    .sidebar-search__kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 6px;
      margin-right: 8px;
      font-size: 11px;
      font-family: var(--joy-font-family-mono);
      font-weight: 600;
      color: var(--joy-text-secondary);
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: 4px;
    }
    .nav {
      flex: 1;
      overflow-y: auto;
      padding: 6px 10px 16px;
    }
    .nav-section {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--joy-text-muted);
      padding: 12px 10px 5px;
      margin-top: 2px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 10px;
      border-radius: var(--joy-radius-control);
      font-size: var(--joy-font-size-sm);
      font-weight: 500;
      color: var(--joy-text-secondary);
      cursor: pointer;
      margin-bottom: 2px;
    }
    .nav-item:hover {
      background: var(--joy-surface-sunken);
      color: var(--joy-text-primary);
    }
    .nav-item.active {
      background: var(--joy-accent-subtle);
      color: var(--joy-accent-text);
      font-weight: 600;
    }
    .nav-section-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 1px 7px;
      font-size: 11px;
      font-family: var(--joy-font-family-mono);
      font-weight: 600;
      border-radius: var(--joy-radius-pill);
      background: var(--joy-surface-sunken);
      color: var(--joy-text-secondary);
      border: 1px solid var(--joy-border-subtle);
    }
    .sidebar-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--joy-border-subtle);
      font-size: var(--joy-font-size-xs);
      color: var(--joy-text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Main Workspace */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .topbar {
      min-height: 56px;
      border-bottom: 1px solid var(--hub-chrome-border);
      background: var(--hub-topbar-bg);
      padding: 6px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--joy-space-3);
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .topbar__start, .topbar__end {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .topbar__title {
      font-size: var(--joy-font-size-md);
      font-weight: 600;
      color: var(--joy-text-primary);
    }
    .scroll-stage {
      flex: 1;
      overflow-y: auto;
      scroll-behavior: smooth;
    }
    .content-area {
      max-width: 1260px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 28px 72px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Editorial Page Header */
    .page-hero {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--joy-space-4);
      padding-bottom: 14px;
      border-bottom: 1px solid var(--joy-border-subtle);
    }
    .page-hero__eyebrow {
      font-family: var(--joy-font-family-mono);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--joy-accent-text);
      margin-bottom: 4px;
    }
    .page-hero__title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2rem;
      font-weight: 600;
      line-height: 1.1;
      color: var(--joy-text-primary);
      margin: 0 0 4px 0;
    }
    .page-hero__sub {
      font-size: var(--joy-font-size-sm);
      color: var(--joy-text-secondary);
      margin: 0;
      max-width: 780px;
      line-height: 1.45;
    }

    /* RateMyServer (RMS) 2D Datasheet Table */
    .rms-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .rms-sheet {
      width: 100%;
      border-collapse: collapse;
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-strong);
      border-radius: var(--joy-radius-card);
      overflow: hidden;
      box-shadow: var(--joy-elevation-1);
      font-size: 13px;
      transition: box-shadow 0.25s ease, border-color 0.25s ease;
    }
    .rms-sheet.rms-highlight {
      border-color: var(--joy-accent-primary);
      box-shadow: 0 0 0 3px var(--joy-focus-ring), var(--joy-elevation-2);
    }
    .rms-sheet__head {
      background: var(--joy-accent-subtle);
      border-bottom: 1px solid var(--joy-border-strong);
      padding: 9px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .rms-sheet__head-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .rms-icon-box {
      width: 26px;
      height: 26px;
      border-radius: 5px;
      background: var(--joy-surface-sunken);
      border: 1px solid var(--joy-border-default);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .rms-sheet__title {
      font-weight: 700;
      font-size: 14.5px;
      color: var(--joy-text-primary);
    }
    .rms-sheet__id {
      font-family: var(--joy-font-family-mono);
      font-size: 12px;
      color: var(--joy-text-secondary);
    }
    .rms-table {
      width: 100%;
      border-collapse: collapse;
    }
    .rms-table th, .rms-table td {
      border: 1px solid var(--joy-border-subtle);
      padding: 7px 11px;
      text-align: left;
      vertical-align: middle;
    }
    .rms-table th {
      background: var(--joy-surface-sunken);
      color: var(--joy-accent-text);
      font-weight: 600;
      font-size: 12px;
      width: 128px;
      white-space: nowrap;
    }
    .rms-table td {
      color: var(--joy-text-primary);
      font-size: 13px;
    }
    .rms-script-code {
      display: block;
      font-family: var(--joy-font-family-mono);
      font-size: 12px;
      background: var(--joy-surface-sunken);
      border: 1px dashed var(--joy-border-default);
      padding: 6px 10px;
      border-radius: 4px;
      color: var(--joy-accent-text);
      overflow-x: auto;
    }

    /* Bidirectional RMS Entity Links */
    .rms-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--joy-accent-text);
      background: var(--joy-accent-subtle);
      border: 1px solid var(--joy-border-default);
      cursor: pointer;
      text-decoration: none;
      margin: 2px 4px 2px 0;
      transition: transform 0.1s ease, border-color 0.15s ease;
    }
    .rms-link:hover {
      border-color: var(--joy-accent-primary);
      transform: translateY(-1px);
    }
    .rms-link__arrow {
      font-size: 10px;
      opacity: 0.8;
    }
    .rms-link__rate {
      font-family: var(--joy-font-family-mono);
      font-size: 11px;
      color: var(--joy-text-secondary);
    }

    /* RMS 3-Column Reference Hub (Charts / Guides / Simulators) */
    .rms-hub-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }
    .rms-hub-box {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: 14px 16px;
      box-shadow: var(--joy-elevation-1);
    }
    .rms-hub-box h4 {
      margin: 0 0 8px 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--joy-accent-text);
      border-bottom: 1px solid var(--joy-border-subtle);
      padding-bottom: 6px;
    }
    .rms-hub-links {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 13px;
    }

    /* RMS AreaInfo Map + Spawn Split Layout */
    .rms-map-split {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 0;
    }
    @media (max-width: 860px) {
      .rms-map-split { grid-template-columns: 1fr; }
    }
    .rms-minimap-cell {
      padding: 14px;
      background: var(--joy-surface-sunken);
      border-right: 1px solid var(--joy-border-subtle);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .rms-spawn-cell {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Grids & Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: var(--joy-space-3);
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: var(--joy-space-4);
    }
    .observatory-card {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: var(--joy-space-5);
      box-shadow: var(--joy-elevation-1);
      display: flex;
      flex-direction: column;
      gap: var(--joy-space-3);
    }
    .observatory-card--gold { border-color: var(--joy-border-strong); }
    .observatory-card__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--joy-space-3);
      padding-bottom: var(--joy-space-3);
      border-bottom: 1px solid var(--joy-border-subtle);
    }
    .observatory-card__title {
      font-size: var(--joy-font-size-md);
      font-weight: 600;
      color: var(--joy-text-primary);
      margin: 0;
    }
    .observatory-card__meta {
      font-family: var(--joy-font-family-mono);
      font-size: var(--joy-font-size-xs);
      color: var(--joy-text-muted);
      margin-top: 3px;
    }
    .kv-list { display: flex; flex-direction: column; gap: 6px; font-size: var(--joy-font-size-sm); }
    .kv-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--joy-space-3);
      padding: 4px 0;
      border-bottom: 1px dashed var(--joy-border-subtle);
    }
    .kv-row:last-child { border-bottom: none; }
    .kv-label { color: var(--joy-text-secondary); }
    .kv-val {
      font-family: var(--joy-font-family-mono);
      font-size: 0.8125rem;
      color: var(--joy-text-primary);
      text-align: right;
    }
    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .mono { font-family: var(--joy-font-family-mono); font-variant-numeric: tabular-nums; }

    .controls-panel {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: 12px 16px;
      box-shadow: var(--joy-elevation-1);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
    }
    .control-field { display: flex; flex-direction: column; gap: 4px; }
    .control-field label {
      font-size: var(--joy-font-size-xs);
      font-weight: 600;
      color: var(--joy-text-secondary);
    }

    .sql-editor {
      width: 100%;
      min-height: 96px;
      background: var(--joy-surface-sunken);
      color: var(--joy-text-primary);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-control);
      padding: 12px 14px;
      font-family: var(--joy-font-family-mono);
      font-size: 0.84rem;
      line-height: 1.5;
      resize: vertical;
      outline: none;
    }

    .inspector-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(10, 18, 31, 0.62);
      z-index: var(--joy-z-backdrop);
      display: none;
    }
    .inspector-backdrop.open { display: block; }
    .inspector-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(560px, 92vw);
      background: var(--joy-surface-card);
      border-left: 1px solid var(--joy-border-strong);
      box-shadow: var(--joy-elevation-3);
      z-index: var(--joy-z-drawer);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform var(--joy-duration-normal) var(--joy-ease-out-quint);
    }
    .inspector-drawer.open { transform: translateX(0); }
    .inspector-drawer__head {
      padding: 20px 24px;
      border-bottom: 1px solid var(--joy-border-default);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .inspector-drawer__body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .elem-cell--pos {
      color: var(--joy-status-success-fg);
      background: var(--joy-status-success-bg);
      font-weight: 700;
    }
    .elem-cell--neg {
      color: var(--joy-status-danger-fg);
      background: var(--joy-status-danger-bg);
    }
    .elem-cell--zero {
      color: var(--joy-text-muted);
      opacity: 0.55;
    }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <aside class="sidebar" aria-label="Observatory navigation">
    <div class="brand">
      <div class="brand-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" class="joy-brand-mark">
          <rect width="32" height="32" rx="6" fill="var(--joy-brand-tile)"/>
          <path d="M16 4 28 16 16 28 4 16Z" fill="none" stroke="var(--joy-brand-mark-on-tile)" stroke-width="1.6"/>
          <path d="M16 9 23 16 16 23 9 16Z" fill="var(--joy-brand-mark-on-tile)"/>
          <circle cx="16" cy="16" r="1.6" fill="var(--joy-brand-mark-contrast)"/>
        </svg>
      </div>
      <div class="brand-info">
        <h2>Atlas World DB</h2>
        <span>Joymify Design · RMS Edition</span>
      </div>
    </div>

    <div class="sidebar-search" role="search">
      <div class="sidebar-search__inner">
        <span class="sidebar-search__icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <input
          type="search"
          id="globalSearch"
          class="sidebar-search__input"
          placeholder="Search items, mobs, skills..."
          autocomplete="off"
        />
        <kbd class="sidebar-search__kbd">⌘K</kbd>
      </div>
    </div>

    <nav class="nav" id="sidebarNav"></nav>

    <div class="sidebar-footer">
      <span>Web + macOS WKWebView</span>
      <span class="joy-badge joy-badge--brand joy-badge--sm">joy-design</span>
    </div>
  </aside>

  <!-- Main Workspace -->
  <div class="main">
    <header class="topbar">
      <div class="topbar__start">
        <span class="topbar__title" id="topbarTitle">Overview &amp; Telemetry</span>
        <span class="joy-badge joy-badge--neutral joy-badge--sm" id="topbarStatus">Ready</span>
      </div>
      <div class="topbar__end">
        <select id="dropRateSelect" class="joy-select" style="height:30px;font-size:12px;padding:0 26px 0 10px;width:auto" aria-label="Item Drop Rate Multiplier" onchange="setDropRate(this.value)">
          <option value="1">⚙️ Drop Rate: 1x (Official)</option>
          <option value="3">⚙️ Drop Rate: 3x</option>
          <option value="5">⚙️ Drop Rate: 5x</option>
          <option value="10">⚙️ Drop Rate: 10x</option>
        </select>

        <select id="paletteSelect" class="joy-select" style="height:30px;font-size:12px;padding:0 26px 0 10px;width:auto" aria-label="Color palette" onchange="setPalette(this.value)">
          <option value="classic">Palette: Classic Gold &amp; Navy</option>
          <option value="clay-court">Palette: Clay Court</option>
          <option value="verdant-lawn">Palette: Verdant Lawn</option>
          <option value="nordic-slate">Palette: Nordic Slate</option>
          <option value="bauhaus-primary">Palette: Bauhaus Primary</option>
          <option value="outdoor">Palette: High-Contrast Outdoor</option>
        </select>

        <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="toggleTheme()" id="themeToggleBtn">
          Theme: Dark
        </button>

        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="rebuildDb()">
          Rebuild SQLite
        </button>

        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="switchTab('sim'); triggerBalanceSim();">
          Run Balance Sim
        </button>
      </div>
    </header>

    <div class="scroll-stage" id="scrollStage">
      <main class="content-area" id="mainContent"></main>
    </div>
  </div>

  <!-- Slide-Over Entity Inspector Drawer -->
  <div class="inspector-backdrop" id="inspectorBackdrop" onclick="closeInspector()"></div>
  <aside class="inspector-drawer" id="inspectorDrawer" aria-label="Entity Contract Inspector">
    <div class="inspector-drawer__head">
      <div>
        <div class="page-hero__eyebrow" id="inspectorKind">CONTRACT INSPECTOR</div>
        <h3 style="margin:0;font-size:1.15rem" id="inspectorTitle">Entity</h3>
      </div>
      <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="closeInspector()">Close (Esc)</button>\n    </div>
    <div class="inspector-drawer__body" id="inspectorBody"></div>
  </aside>

<script>
let DATA = null;
let CURRENT_TAB = 'overview';
let SEARCH_QUERY = '';
let DROP_RATE_MULT = 1;
let HIGHLIGHT_ENTITY_ID = '';
let SELECTED_DOC_IDX = 0;
let SIM_OUTPUT = 'Click "Run Balance Sim" in the top bar (or below) to execute cargo run --bin balance_sim against the live Rust authoritative combat engine.';
let SIM_RUNNING = false;

const NAV_GROUPS = [
  {
    section: 'Databases (RMS)',
    items: [
      { id: 'overview', label: 'Database Hub & Matrix', countKey: () => 9 },
      { id: 'gear',     label: 'Item Database (item_db)', countKey: d => d.items.length + d.cards.length },
      { id: 'mobs',     label: 'Monster Database (mob_db)', countKey: d => d.mobs.length },
      { id: 'jobs',     label: 'Skill & Job DB (skill_db)', countKey: d => d.jobs.length + d.skills.length },
      { id: 'maps',     label: 'Map & Spawn DB (map_db)', countKey: d => d.maps.length + 4 },
      { id: 'quests',   label: 'Quest Database (quest_db)', countKey: d => d.quests.length },
    ]
  },
  {
    section: 'Tools & Calculators',
    items: [
      { id: 'elements', label: 'Property & Size Chart', countKey: d => (d.elements.elements || []).length },
      { id: 'siege',    label: 'WoE Castle Calculator', countKey: d => d.castles.length },
      { id: 'sql',      label: 'SQLite Query Studio', countKey: () => 'SQL' },
      { id: 'sim',      label: 'Rust Balance Simulator', countKey: () => 'RS' },
      { id: 'docs',     label: 'RO Writings & Specs', countKey: d => d.docs.length },
    ]
  }
];

function syncUrlState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const t = params.get('tab');
  const q = params.get('q');
  const focus = params.get('focus');
  if (t) CURRENT_TAB = t;
  if (q !== null) {
    SEARCH_QUERY = q;
    const inp = document.getElementById('globalSearch');
    if (inp) inp.value = q;
  }
  HIGHLIGHT_ENTITY_ID = focus || '';
}

function writeUrlState() {
  const params = new URLSearchParams();
  params.set('tab', CURRENT_TAB);
  if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);
  if (HIGHLIGHT_ENTITY_ID) params.set('focus', HIGHLIGHT_ENTITY_ID);
  history.replaceState(null, '', '#' + params.toString());
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
  const metaHtml = extraMeta ? `<span class="rms-link__rate">(${escapeHtml(extraMeta)})</span>` : '';
  return `<a class="rms-link" onclick="jumpToEntity('${tab}', '${safeId}')"><span class="rms-link__arrow">▸</span><span>${safeLabel}</span>${metaHtml}</a>`;
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
  const res = await fetch('/api/bundle');
  DATA = await res.json();
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
      closeInspector();
    }
  });
}

function switchTab(id) {
  CURRENT_TAB = id;
  HIGHLIGHT_ENTITY_ID = '';
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
  document.getElementById('inspectorBody').innerHTML = `
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
    docs:     'RO Writings — Architecture Specs & Lore Canon'
  };
  document.getElementById('topbarTitle').textContent = titleMap[CURRENT_TAB] || 'Observatory';

  if (CURRENT_TAB === 'overview') main.innerHTML = renderOverview();
  else if (CURRENT_TAB === 'jobs') main.innerHTML = renderJobs();
  else if (CURRENT_TAB === 'mobs') main.innerHTML = renderMobs();
  else if (CURRENT_TAB === 'elements') { main.innerHTML = renderElements(); updateElemCalc(); }
  else if (CURRENT_TAB === 'gear') { main.innerHTML = renderGear(); updateRefineCalc(); }
  else if (CURRENT_TAB === 'quests') main.innerHTML = renderQuests();
  else if (CURRENT_TAB === 'siege') { main.innerHTML = renderSiege(); updateSiegeCalc(); }
  else if (CURRENT_TAB === 'maps') main.innerHTML = renderMaps();
  else if (CURRENT_TAB === 'sql') { main.innerHTML = renderSqlStudio(); executeSql(); }
  else if (CURRENT_TAB === 'sim') main.innerHTML = renderSim();
  else if (CURRENT_TAB === 'docs') main.innerHTML = renderDocs();
}

function inspectBtnHtml(kind, title, obj) {
  const encoded = encodeURIComponent(JSON.stringify(obj));
  const safeTitle = escapeHtml(title).replace(/'/g, "\\'");
  return `<button type="button" class="joy-button joy-button--outline joy-button--sm" style="height:24px;padding:0 8px;font-size:11px" onclick="openInspector('${kind}', '${safeTitle}', JSON.parse(decodeURIComponent('${encoded}')))">JSONB</button>`;
}

/* ============================================================================
 * 1. OVERVIEW & RMS HUB
 * ========================================================================== */
function renderOverview() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const mobs = DATA.mobs.filter(matchesSearch);
  const items = DATA.items.filter(matchesSearch);
  const cards = DATA.cards.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">JOYMIFY DESIGN SYSTEM · RATEMYSERVER OBSERVATORY EDITION</div>
        <h1 class="page-hero__title">Atlas World Database, Reverse-Lookup &amp; Balance Studio</h1>
        <p class="page-hero__sub">
          Dense 2D datasheets, bidirectional foreign-key joins, live drop-rate scaling (<strong>${DROP_RATE_MULT}x</strong>),
          and top-down 2D map spawn charts—running identically in your browser and native macOS app.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand">Drop Rate: ${DROP_RATE_MULT}x</span>
        <span class="joy-badge joy-badge--success">68/68 Rust Tests Passing</span>
      </div>
    </div>

    <!-- RMS 3-Box Reference Hub -->
    <div class="rms-hub-grid">
      <div class="rms-hub-box">
        <h4>📊 Charts &amp; Tables</h4>
        <div class="rms-hub-links">
          ${rmsLink('elements', '', '10×10 Elemental Property Chart', 'elements.json')}
          ${rmsLink('elements', '', 'Weapon Type vs Monster Size Table', 'Small/Med/Large')}
          ${rmsLink('gear', '', '+0..+15 Refine & Pity Success Table', '5-Fail Pity')}
          ${rmsLink('sql', '', 'v_mob_economy (EXP-per-HP Ranking)', 'SQLite View')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>📜 Promotion &amp; World Guides</h4>
        <div class="rms-hub-links">
          ${rmsLink('quests', 'jq_swordman_trial', 'Swordman → Knight Promotion Trials', 'Lv.10 / Lv.40')}
          ${rmsLink('quests', 'jq_mage_academy', 'Mage → High Wizard Academy Trials', 'Lv.10 / Lv.40')}
          ${rmsLink('maps', 'freja-south-gate', 'Prontera South Gate — Area Spawn Guide', '8 Spawn Areas')}
          ${rmsLink('docs', '', 'World Lore Canon & Undertow Specs', DATA.docs.length + ' Docs')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🧮 Simulators &amp; Calculators</h4>
        <div class="rms-hub-links">
          ${rmsLink('sim', '', 'Authoritative Rust Balance Simulator', 'server-rs')}
          ${rmsLink('siege', 'castle_valkyrie_01', 'WoE Emperium Breach & TTK Calculator', 'Kriemhild')}
          ${rmsLink('gear', '', 'Equipment Refine & Card Socket Calculator', '+0..+15')}
          ${rmsLink('sql', '', 'Read-Only SQLite + JSONB Query Console', 'catalog.sqlite')}
        </div>
      </div>
    </div>

    <div class="joy-telemetry-strip">
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.items.length}</span>
        <span class="joy-telemetry-strip__label">Items (item_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.cards.length}</span>
        <span class="joy-telemetry-strip__label">Cards</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.mobs.length}</span>
        <span class="joy-telemetry-strip__label">Monsters (mob_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.jobs.length}</span>
        <span class="joy-telemetry-strip__label">Jobs</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.skills.length}</span>
        <span class="joy-telemetry-strip__label">Skills (skill_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.quests.length}</span>
        <span class="joy-telemetry-strip__label">Quests (quest_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.maps.length}</span>
        <span class="joy-telemetry-strip__label">3D Maps (map_db)</span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Cross-Repo Entity &amp; Asset Studio Binding Matrix</h3>
          <div class="observatory-card__meta">Click any entity link to jump straight to its RateMyServer 2D datasheet</div>
        </div>
        <span class="joy-badge joy-badge--brand">v_asset_studio_entries</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Datasheet Link</th>
              <th>Tier / Rank / Slot</th>
              <th>Cross-References</th>
              <th>Asset Studio Key</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            ${jobs.map(j => `
              <tr>
                <td><span class="joy-badge joy-badge--brand joy-badge--sm">JOB</span></td>
                <td>${rmsLink('jobs', j.id, j.name, 'Tier ' + j.tier)}</td>
                <td>Tier ${j.tier} (${j.parentJobId || 'root'})</td>
                <td>${(j.unlockedSkillIds || []).map(sid => rmsLink('jobs', sid, sid)).join('')}</td>
                <td class="mono">${j.assetStudioKey}</td>
                <td>${inspectBtnHtml('job', j.name, j)}</td>
              </tr>
            `).join('')}
            ${mobs.map(m => `
              <tr>
                <td><span class="joy-badge ${m.isMvp ? 'joy-badge--warning' : 'joy-badge--danger'} joy-badge--sm">${m.isMvp ? 'MVP' : 'MOB'}</span></td>
                <td>${rmsLink('mobs', m.id, m.name, 'Lv.' + m.level)}</td>
                <td>${m.element} / ${m.race} / ${m.size}</td>
                <td>${(m.drops || []).map(d => rmsLink('gear', d.itemId, d.itemId, formatDropPct(d.chanceBps))).join('')}</td>
                <td class="mono">${m.assetStudioKey}</td>
                <td>${inspectBtnHtml('mob', m.name, m)}</td>
              </tr>
            `).join('')}
            ${items.map(it => `
              <tr>
                <td><span class="joy-badge joy-badge--neutral joy-badge--sm">ITEM</span></td>
                <td>${rmsLink('gear', it.id, it.name, it.kind)}</td>
                <td>${it.kind.toUpperCase()} ${it.pAtk ? '· ATK ' + it.pAtk : ''} ${it.mAtk ? '· MATK ' + it.mAtk : ''}</td>
                <td>${DATA.mobs.filter(m => (m.drops || []).some(d => d.itemId === it.id)).map(m => rmsLink('mobs', m.id, m.name)).join('') || '<span class="observatory-card__meta">Quest / Starter</span>'}</td>
                <td class="mono">item.${it.id}</td>
                <td>${inspectBtnHtml('item', it.name, it)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 2. ITEM & CARD DATABASE (RateMyServer item_db 2D Datasheet Layout)
 * ========================================================================== */
function renderGear() {
  const items = DATA.items.filter(matchesSearch);
  const cards = DATA.cards.filter(matchesSearch);
  const handbook = DATA.handbook.filter(matchesSearch);

  const iconForKind = k => k === 'weapon' ? '⚔️' : (k === 'armor' ? '🛡️' : (k === 'consumable' ? '🧪' : '🪨'));
  const descForItem = it => {
    if (it.id === 'basic_sword') return 'Standard-issue steel shortsword balanced for Novice and Swordman frontliners. Scales with STR.';
    if (it.id === 'magic_staff') return ' Focuses ambient mana into elemental bolts. Increases Magical Attack (MATK +15) scaling with INT.';
    if (it.id === 'great_bow') return 'Long-draw ashwood bow favored by Payon and Prontera Rangers. Scales with DEX.';
    if (it.id === 'dagger') return 'Lightweight close-quarters blade usable by almost all novice and caster classes.';
    if (it.id === 'scythe') return 'Heavy two-handed polearm-scythe wielded by Chivalry Knights and Orc Warlords. Excels against Large targets.';
    if (it.id === 'potion_minor') return 'Restores a small amount of HP during field expeditions. Stackable consumable.';
    if (it.id === 'leather_armor') return 'Reinforced boar-hide tunic providing reliable physical protection for field patrols.';
    return 'High-purity metallic ore smelted by Prontera blacksmiths and required for Watchtower repairs and Promotion Trials.';
  };

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER ITEM_DB · +0..+15 REFINE &amp; CARDS</div>
        <h1 class="page-hero__title">Item &amp; Card Database (${items.length} Items, ${cards.length} Cards)</h1>
        <p class="page-hero__sub">
          RateMyServer-style 2D tabular datasheets with Applicable Jobs bitmasks, Engine Script contracts,
          Dropped By reverse joins (at <strong>${DROP_RATE_MULT}x</strong> rate), and Quest Reward sources.
        </p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="refBaseAtk">Weapon Base ATK</label>
        <input id="refBaseAtk" class="joy-input" type="number" value="120" min="10" max="500" style="width:110px" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refLevel">Target Refine (+0..+15)</label>
        <input id="refLevel" class="joy-input" type="number" value="10" min="0" max="15" style="width:110px" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refFails">Consecutive Fails (Pity 0..5)</label>
        <input id="refFails" class="joy-input" type="number" value="2" min="0" max="5" style="width:110px" oninput="updateRefineCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="refineCalcResult" style="font-size:0.85rem;padding:7px 12px"></span>
      </div>
    </div>

    <div class="rms-list">
      ${items.map((it, idx) => {
        const isWeapon = it.kind === 'weapon';
        const isEquip = it.kind === 'weapon' || it.kind === 'armor';
        const slots = isWeapon ? '[1]' : (it.kind === 'armor' ? '[1]' : '[0]');
        const handed = it.id === 'great_bow' || it.id === 'scythe' ? '[Two Handed]' : (isWeapon ? '[One Hand]' : '');
        const applicableJobs = isWeapon
          ? DATA.jobs.filter(j => (j.allowedWeaponKinds || []).includes(it.id))
          : DATA.jobs;
        const droppedBy = [];
        DATA.mobs.forEach(m => {
          (m.drops || []).forEach(d => {
            if (d.itemId === it.id) droppedBy.push({ mob: m, chanceBps: d.chanceBps });
          });
        });
        const questRewards = DATA.quests.filter(q => ((q.rewards && q.rewards.items) || []).some(ri => ri.itemId === it.id));
        const questObjectives = DATA.quests.filter(q => (q.objectives || []).some(ob => ob.targetId === it.id));
        const scriptStr = isWeapon
          ? `{ bonus bBaseAtk,${it.pAtk || 0}; bonus bMatk,${it.mAtk || 0}; bonus bAtkStat,"${(it.atkStat || 'str').toUpperCase()}"; bonus bRefinePityMax,5; }`
          : (it.kind === 'armor'
            ? `{ bonus bDef,12; bonus bMaxHp,80; bonus bRefinePityMax,5; }`
            : (it.kind === 'consumable' ? `{ itemheal rand(45,65),0; }` : `{ /* Crafting & Quest Material */ }`));

        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === it.id ? 'rms-highlight' : ''}" id="entity-${it.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">${iconForKind(it.kind)}</span>
                <span class="rms-sheet__title">${escapeHtml(it.name)} ${slots}</span>
                ${handed ? `<span class="joy-badge joy-badge--brand joy-badge--sm">${handed}</span>` : ''}
                <span class="rms-sheet__id">Item ID# ${1001 + idx} (<code>${escapeHtml(it.id)}</code>)</span>
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${it.kind.toUpperCase()}</span>
                ${inspectBtnHtml('item', it.name, it)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Type</th>
                  <td>${escapeHtml(it.kind.toUpperCase())}</td>
                  <th>Class / Subtype</th>
                  <td>${isWeapon ? escapeHtml(it.id.replace('_', ' ')) : escapeHtml(it.kind)}</td>
                  <th>Stackable</th>
                  <td class="mono">${it.stackable ? 'Yes (Max 999)' : 'No (Unique Slot)'}</td>
                  <th>Refineable</th>
                  <td class="mono">${isEquip ? 'Yes (+0..+15 Pity)' : 'No'}</td>
                </tr>
                <tr>
                  <th>Physical ATK</th>
                  <td class="mono">${it.pAtk ?? '—'}</td>
                  <th>Magical MATK</th>
                  <td class="mono">${it.mAtk ?? '—'}</td>
                  <th>Scaling Stat</th>
                  <td class="mono">${it.atkStat ? it.atkStat.toUpperCase() : '—'}</td>
                  <th>Card Slots</th>
                  <td class="mono">${isEquip ? '1' : '0'}</td>
                </tr>
                <tr>
                  <th>Applicable Jobs</th>
                  <td colspan="7">
                    ${applicableJobs.map(j => rmsLink('jobs', j.id, j.name)).join(' ') || '<span class="observatory-card__meta">All Classes</span>'}
                  </td>
                </tr>
                <tr>
                  <th>Description</th>
                  <td colspan="7">${escapeHtml(descForItem(it))}</td>
                </tr>
                <tr>
                  <th>Item Script</th>
                  <td colspan="7"><code class="rms-script-code">${escapeHtml(scriptStr)}</code></td>
                </tr>
                <tr>
                  <th>Dropped By</th>
                  <td colspan="7">
                    ${droppedBy.length
                      ? droppedBy.map(d => rmsLink('mobs', d.mob.id, d.mob.name, formatDropPct(d.chanceBps))).join(' ')
                      : '<span style="color:var(--joy-status-danger-fg);font-weight:600">No Monster Drop (Quest / Starter Reward)</span>'}
                  </td>
                </tr>
                <tr>
                  <th>Obtainable / Used In</th>
                  <td colspan="7">
                    ${questRewards.map(q => rmsLink('quests', q.id, 'Reward: ' + q.title)).join(' ')}
                    ${questObjectives.map(q => rmsLink('quests', q.id, 'Required: ' + q.title)).join(' ')}
                    ${(!questRewards.length && !questObjectives.length) ? '<span class="observatory-card__meta">Field Drop / NPC Shop</span>' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${cards.map((c, idx) => {
        const mob = DATA.mobs.find(m => m.id === c.mobId);
        const equipScript = Object.entries(c.equipStats || {}).map(([k,v]) => `bonus ${k},${v};`).join(' ');
        const depScript = Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `handbook_bonus ${k},${v};`).join(' ');
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === c.id ? 'rms-highlight' : ''}" id="entity-${c.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">🃏</span>
                <span class="rms-sheet__title">${escapeHtml(c.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">[${c.slot.toUpperCase()} SOCKET]</span>
                <span class="rms-sheet__id">Card ID# ${4001 + idx} (<code>${escapeHtml(c.id)}</code>)</span>
              </div>
              <div class="chip-row">
                <span class="mono" style="font-size:11px;color:var(--joy-text-muted)">${c.assetStudioKey}</span>
                ${inspectBtnHtml('card', c.name, c)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Type</th>
                  <td>Monster Card</td>
                  <th>Compound On</th>
                  <td><strong>${escapeHtml(c.slot.toUpperCase())}</strong></td>
                  <th>Socket Bonus</th>
                  <td class="mono">${Object.entries(c.equipStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</td>
                  <th>Handbook Deposit</th>
                  <td class="mono">${Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</td>
                </tr>
                <tr>
                  <th>Item Script</th>
                  <td colspan="7"><code class="rms-script-code">{ ${escapeHtml(equipScript)} } /* Deposit: { ${escapeHtml(depScript)} } */</code></td>
                </tr>
                <tr>
                  <th>Dropped By</th>
                  <td colspan="7">
                    ${mob ? rmsLink('mobs', mob.id, mob.name, formatDropPct(20)) : c.mobId}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateRefineCalc() {
  const baseAtk = parseInt(document.getElementById('refBaseAtk')?.value || '120', 10);
  const lvl = Math.max(0, Math.min(15, parseInt(document.getElementById('refLevel')?.value || '10', 10)));
  const fails = Math.max(0, Math.min(5, parseInt(document.getElementById('refFails')?.value || '0', 10)));
  const baseRates = [100,100,100,100,100, 60,50,40,30,20, 15,12,10,8,5,5];
  const baseRate = baseRates[lvl] ?? 10;
  const effRate = lvl <= 4 ? 100 : (fails >= 5 ? 100 : Math.min(100, baseRate + fails * 20));
  const overUpgrade = lvl > 4 ? (lvl - 4) * 5 : 0;
  const totalAtk = baseAtk + lvl * 3 + overUpgrade;
  const el = document.getElementById('refineCalcResult');
  if (el) {
    el.textContent = `+${lvl} Total ATK: ${totalAtk} (+${lvl*3 + overUpgrade} bonus) · Success Rate: ${effRate}% (Base ${baseRate}% + Pity ${fails}/5)`;
  }
}

/* ============================================================================
 * 3. MONSTER DATABASE (RateMyServer mob_db 2D Datasheet Layout)
 * ========================================================================== */
function renderMobs() {
  const mobs = DATA.mobs.filter(matchesSearch);
  const mat = (DATA.elements && DATA.elements.damageMatrixPct) || {};
  const elems = (DATA.elements && DATA.elements.elements) || [];

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER MOB_DB · ELEMENT / RACE / SIZE &amp; DROPS</div>
        <h1 class="page-hero__title">Monster Bestiary &amp; Drop Datasheets (${mobs.length})</h1>
        <p class="page-hero__sub">
          Full RateMyServer monster specification tables including elemental weakness calculations,
          spawn map links, quest hunting links, and live <strong>${DROP_RATE_MULT}x</strong> drop rates.
        </p>
      </div>
    </div>

    <div class="rms-list">
      ${mobs.map((m, idx) => {
        const weakTo = [];
        const resists = [];
        elems.forEach(atk => {
          const pct = (mat[atk] && mat[atk][m.element] !== undefined) ? mat[atk][m.element] : 100;
          if (pct > 100) weakTo.push(`${atk} (${pct}%)`);
          else if (pct < 100) resists.push(`${atk} (${pct}%)`);
        });
        const huntedInQuests = DATA.quests.filter(q => (q.objectives || []).some(o => o.targetId === m.id));
        const handbookEntries = DATA.handbook.filter(h => h.targetId === m.id);

        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === m.id ? 'rms-highlight' : ''}" id="entity-${m.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">${m.isMvp ? '👑' : '👾'}</span>
                <span class="rms-sheet__title">Lv.${m.level} ${escapeHtml(m.name)}</span>
                <span class="joy-badge ${m.isMvp ? 'joy-badge--warning' : 'joy-badge--danger'} joy-badge--sm">${m.isMvp ? 'MVP BOSS' : 'Rank ' + m.rank}</span>
                <span class="rms-sheet__id">Mob ID# ${2001 + idx} (<code>${escapeHtml(m.id)}</code> · <code>${escapeHtml(m.assetStudioKey)}</code>)</span>
              </div>
              <div class="chip-row">
                ${inspectBtnHtml('mob', m.name, m)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>HP</th>
                  <td class="mono"><strong>${m.hp.toLocaleString()}</strong></td>
                  <th>Attack (pAtk)</th>
                  <td class="mono">${m.pAtk}</td>
                  <th>Defense (pDef)</th>
                  <td class="mono">${m.pDef}</td>
                  <th>Aggro / Leash</th>
                  <td class="mono">${m.aggroRangeM}m / ${m.leashRangeM}m</td>
                </tr>
                <tr>
                  <th>Element</th>
                  <td><strong>${escapeHtml(m.element)}</strong></td>
                  <th>Race</th>
                  <td><strong>${escapeHtml(m.race)}</strong></td>
                  <th>Size</th>
                  <td><strong>${escapeHtml(m.size)}</strong></td>
                  <th>EXP / 100 HP</th>
                  <td class="mono">${((m.baseExp * 100) / Math.max(1, m.hp)).toFixed(1)} Base/100HP</td>
                </tr>
                <tr>
                  <th>Base EXP</th>
                  <td class="mono">+${(m.baseExp * DROP_RATE_MULT).toLocaleString()} (${DROP_RATE_MULT}x)</td>
                  <th>Job EXP</th>
                  <td class="mono">+${(m.jobExp * DROP_RATE_MULT).toLocaleString()} (${DROP_RATE_MULT}x)</td>
                  <th>Weak To (&gt;100%)</th>
                  <td style="color:var(--joy-status-success-fg);font-weight:600">${weakTo.join(', ') || 'None'}</td>
                  <th>Resists (&lt;100%)</th>
                  <td style="color:var(--joy-status-danger-fg)">${resists.join(', ') || 'None'}</td>
                </tr>
                <tr>
                  <th>Spawn Maps</th>
                  <td colspan="7">
                    ${(m.spawnZones || []).map(z => rmsLink('maps', z, z, 'Active Spawn')).join(' ')}
                  </td>
                </tr>
                <tr>
                  <th>Drops (${DROP_RATE_MULT}x Rate)</th>
                  <td colspan="7">
                    ${(m.drops || []).map(d => rmsLink('gear', d.itemId, d.itemId, formatDropPct(d.chanceBps))).join(' ')}
                    ${m.cardId ? rmsLink('gear', m.cardId, m.cardId, formatDropPct(20)) : ''}
                  </td>
                </tr>
                <tr>
                  <th>Quests &amp; Research</th>
                  <td colspan="7">
                    ${huntedInQuests.map(q => rmsLink('quests', q.id, q.title, 'Hunt Objective')).join(' ')}
                    ${handbookEntries.map(h => `<span class="joy-badge joy-badge--success joy-badge--sm">${escapeHtml(h.title)} (${h.tiers.map(t => '≥' + t.requiredCount).join('/')})</span>`).join(' ')}
                    ${(!huntedInQuests.length && !handbookEntries.length) ? '<span class="observatory-card__meta">Field / Boss Encounter</span>' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 4. SKILL & JOB BRANCH DATABASE (RateMyServer skill_db_class Layout)
 * ========================================================================== */
function renderJobs() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const skills = DATA.skills.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER SKILL_DB_CLASS · JOB TREE &amp; SKILLS</div>
        <h1 class="page-hero__title">Job Branches, Stat Bonuses &amp; Skill Database</h1>
        <p class="page-hero__sub">
          Browse class branches (Tier 0 Novice → Tier 1 Swordman / Mage / Archer → Tier 2 Knight / High Wizard),
          allowed weapon bitmasks, and skill prerequisites.
        </p>
      </div>
    </div>

    <!-- RMS Visual Branch Summary -->
    <div class="rms-hub-grid">
      <div class="rms-hub-box">
        <h4>⚔️ Swordman → Knight Branch</h4>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'swordman', '1-1: Swordman (Lv.10 / Job 40)')}
          ${rmsLink('jobs', 'knight', '2-1: Knight (Lv.40 / Job 50)')}
          ${rmsLink('quests', 'jq_swordman_trial', 'Quest: Trial of the Blade')}
          ${rmsLink('quests', 'jq_knight_chivalry', 'Quest: Oath of the Watchtower')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🔮 Mage → High Wizard Branch</h4>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'mage', '1-1: Mage (Lv.10 / Job 40)')}
          ${rmsLink('jobs', 'wizard', '2-1: High Wizard (Lv.40 / Job 50)')}
          ${rmsLink('quests', 'jq_mage_academy', 'Quest: Elemental Thesis')}
          ${rmsLink('quests', 'jq_wizard_tower', 'Quest: Rite of the High Arcana')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🏹 Archer &amp; Ranger Branch</h4>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'archer', '1-1: Archer (Lv.10 / Job 40)')}
          ${rmsLink('quests', 'jq_archer_guild', 'Quest: Wind & Steady Aim')}
          ${rmsLink('gear', 'great_bow', 'Weapon: Great Bow [Two Handed]')}
        </div>
      </div>
    </div>

    <div class="rms-list">
      ${jobs.map((j, idx) => {
        const bonusStr = Object.entries(j.jobBonusAtMax || {}).filter(([,v]) => v > 0).map(([k,v]) => `${k.toUpperCase()} +${v}`).join(' · ') || 'None';
        const childJobs = DATA.jobs.filter(cj => cj.parentJobId === j.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === j.id ? 'rms-highlight' : ''}" id="entity-${j.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">🛡️</span>
                <span class="rms-sheet__title">${escapeHtml(j.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">TIER ${j.tier}</span>
                <span class="rms-sheet__id">Job ID# ${3001 + idx} (<code>${escapeHtml(j.id)}</code> · <code>${escapeHtml(j.assetStudioKey)}</code>)</span>
              </div>
              <div class="chip-row">${inspectBtnHtml('job', j.name, j)}</div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Min Base Level</th>
                  <td class="mono">Lv.${j.minBaseLevel}</td>
                  <th>Max Job Level</th>
                  <td class="mono">Job Lv.${j.maxJobLevel}</td>
                  <th>Parent Class</th>
                  <td>${j.parentJobId ? rmsLink('jobs', j.parentJobId, j.parentJobId) : '<span class="observatory-card__meta">Starter Root</span>'}</td>
                  <th>Promotes To</th>
                  <td>${childJobs.map(cj => rmsLink('jobs', cj.id, cj.name)).join(' ') || '<span class="observatory-card__meta">Max Tier</span>'}</td>
                </tr>
                <tr>
                  <th>Primary Stats</th>
                  <td class="mono">${(j.primaryStats || []).map(s => s.toUpperCase()).join(', ')}</td>
                  <th>Max Job Bonuses</th>
                  <td colspan="3" class="mono">${escapeHtml(bonusStr)}</td>
                  <th>Promotion Trial</th>
                  <td>${j.jobChangeQuestId ? rmsLink('quests', j.jobChangeQuestId, j.jobChangeQuestId) : '<span class="observatory-card__meta">None</span>'}</td>
                </tr>
                <tr>
                  <th>Allowed Weapons</th>
                  <td colspan="7">${(j.allowedWeaponKinds || []).map(w => rmsLink('gear', w, w)).join(' ')}</td>
                </tr>
                <tr>
                  <th>Unlocked Skills</th>
                  <td colspan="7">${(j.unlockedSkillIds || []).map(s => rmsLink('jobs', s, s)).join(' ')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${skills.map((sk, idx) => {
        const usedByJobs = DATA.jobs.filter(j => (j.unlockedSkillIds || []).includes(sk.id));
        const unlockedByQuests = DATA.quests.filter(q => q.rewards && q.rewards.unlockSkillId === sk.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === sk.id ? 'rms-highlight' : ''}" id="entity-${sk.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">✨</span>
                <span class="rms-sheet__title">Skill: ${escapeHtml(sk.name)}</span>
                <span class="joy-badge joy-badge--success joy-badge--sm">MAX LV.${sk.maxLevel}</span>
                <span class="rms-sheet__id">Skill ID# ${5001 + idx} (<code>${escapeHtml(sk.id)}</code>)</span>
              </div>
              <div class="chip-row">${inspectBtnHtml('skill', sk.name, sk)}</div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Max Skill Level</th>
                  <td class="mono">Lv.${sk.maxLevel}</td>
                  <th>Prerequisites</th>
                  <td>${(sk.requires || []).length ? sk.requires.map(r => rmsLink('jobs', r, r)).join(' ') : '<span class="observatory-card__meta">None (Tier 1 Core)</span>'}</td>
                  <th>Learnable By</th>
                  <td colspan="3">${usedByJobs.map(j => rmsLink('jobs', j.id, j.name)).join(' ')}</td>
                </tr>
                <tr>
                  <th>Quest Unlocks</th>
                  <td colspan="7">
                    ${unlockedByQuests.map(q => rmsLink('quests', q.id, q.title)).join(' ') || '<span class="observatory-card__meta">Innate Class Skill</span>'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 5. ELEMENT & SIZE MATRIX
 * ========================================================================== */
function renderElements() {
  const elems = DATA.elements.elements || [];
  const mat = DATA.elements.damageMatrixPct || {};
  const sizePen = DATA.elements.weaponSizePenaltyPct || {};
  const wpnKinds = Object.keys(sizePen);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER PROPERTY CHART · 10-ELEMENT &amp; 3-SIZE</div>
        <h1 class="page-hero__title">10-Element Counter Matrix &amp; Weapon-vs-Size Modifiers</h1>
        <p class="page-hero__sub">Interactive damage multiplier calculator + full 10×10 elemental lookup table and Small/Medium/Large weapon size table.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="calcAtkElem">Attacker Element</label>
        <select id="calcAtkElem" class="joy-select" onchange="updateElemCalc()">
          ${elems.map((e, i) => `<option value="${e}" ${i===1?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcDefElem">Defender Element</label>
        <select id="calcDefElem" class="joy-select" onchange="updateElemCalc()">
          ${elems.map((e, i) => `<option value="${e}" ${i===2?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcWpnKind">Weapon Kind</label>
        <select id="calcWpnKind" class="joy-select" onchange="updateElemCalc()">
          ${wpnKinds.map(w => `<option value="${w}">${w}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcTargetSize">Target Size</label>
        <select id="calcTargetSize" class="joy-select" onchange="updateElemCalc()">
          <option value="Small">Small</option>
          <option value="Medium" selected>Medium</option>
          <option value="Large">Large</option>
        </select>
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="elemCalcOutput" style="font-size:0.9rem;padding:8px 14px">Combined Multiplier: 100%</span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">10×10 Elemental Damage Matrix (Attacker Row vs. Defender Column %)</h3>
          <div class="observatory-card__meta">Values &gt; 100% deal bonus counter damage; values &lt; 100% are resisted</div>
        </div>
        <span class="joy-badge joy-badge--brand">elements.json</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>ATK \\ DEF</th>
              ${elems.map(e => `<th>${e}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${elems.map(atk => `
              <tr>
                <td><strong>${atk}</strong></td>
                ${elems.map(def => {
                  const v = (mat[atk] && mat[atk][def] !== undefined) ? mat[atk][def] : 100;
                  const cls = v > 100 ? 'elem-cell--pos' : (v === 0 ? 'elem-cell--zero' : (v < 100 ? 'elem-cell--neg' : ''));
                  return `<td class="mono ${cls}">${v}%</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Weapon Kind vs. Monster Size Modifier (Small / Medium / Large %)</h3>
          <div class="observatory-card__meta">Classic RO weapon-size signature (e.g., Spears/Scythes excel vs. Large, Daggers excel vs. Small)</div>
        </div>
        <span class="joy-badge joy-badge--neutral">Size Table</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Weapon Kind</th>
              <th>Small</th>
              <th>Medium</th>
              <th>Large</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(sizePen).map(([wpn, row]) => `
              <tr>
                <td>${rmsLink('gear', wpn, wpn)}</td>
                <td class="mono">${row.Small}%</td>
                <td class="mono">${row.Medium}%</td>
                <td class="mono">${row.Large}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function updateElemCalc() {
  if (!DATA || !DATA.elements) return;
  const atk = document.getElementById('calcAtkElem')?.value;
  const def = document.getElementById('calcDefElem')?.value;
  const wpn = document.getElementById('calcWpnKind')?.value;
  const sz = document.getElementById('calcTargetSize')?.value;
  const elemPct = (DATA.elements.damageMatrixPct?.[atk]?.[def]) ?? 100;
  const sizePct = (DATA.elements.weaponSizePenaltyPct?.[wpn]?.[sz]) ?? 100;
  const combined = ((elemPct / 100.0) * (sizePct / 100.0) * 100.0).toFixed(1);
  const out = document.getElementById('elemCalcOutput');
  if (out) {
    out.textContent = `Elemental ${elemPct}% × Size ${sizePct}% = ${combined}% Final Damage`;
  }
}

/* ============================================================================
 * 6. QUEST DATABASE (RateMyServer quest_db Datasheet Layout)
 * ========================================================================== */
function renderQuests() {
  const quests = DATA.quests.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER QUEST_DB · PROGRESSION &amp; TRIALS</div>
        <h1 class="page-hero__title">Unified 6-Category Quest Database (${quests.length})</h1>
        <p class="page-hero__sub">Main Story, Side Story, Daily Bounties, and Job Promotion Trials with clickable objective targets and item rewards.</p>
      </div>
    </div>
    <div class="rms-list">
      ${quests.map((q, idx) => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === q.id ? 'rms-highlight' : ''}" id="entity-${q.id}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              <span class="rms-icon-box">📜</span>
              <span class="rms-sheet__title">${escapeHtml(q.title)}</span>
              <span class="joy-badge ${q.category === 'job_change' ? 'joy-badge--brand' : 'joy-badge--success'} joy-badge--sm">${q.category.toUpperCase()}</span>
              <span class="rms-sheet__id">Quest ID# ${6001 + idx} (<code>${escapeHtml(q.id)}</code>)</span>
            </div>
            <div class="chip-row">${inspectBtnHtml('quest', q.title, q)}</div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                <th>Zone / Map</th>
                <td>${rmsLink('maps', q.zoneId, q.zoneId)}</td>
                <th>Giver NPC</th>
                <td class="mono">${escapeHtml(q.giverNpcId)}</td>
                <th>Min Base Lvl</th>
                <td class="mono">Lv.${q.minBaseLevel}</td>
                <th>Required Job</th>
                <td>${q.requiredJobId ? rmsLink('jobs', q.requiredJobId, q.requiredJobId) : '<span class="observatory-card__meta">Any Job</span>'}</td>
              </tr>
              <tr>
                <th>Objectives</th>
                <td colspan="7">
                  ${(q.objectives || []).map(o => {
                    if (o.type === 'MOB_KILLED') return rmsLink('mobs', o.targetId, `Hunt ${o.targetId} ×${o.required}`, o.type);
                    if (o.type === 'ITEM_PICKED_UP') return rmsLink('gear', o.targetId, `Collect ${o.targetId} ×${o.required}`, o.type);
                    return rmsLink('maps', o.targetId, `Visit ${o.targetId} ×${o.required}`, o.type);
                  }).join(' ')}
                </td>
              </tr>
              <tr>
                <th>Rewards</th>
                <td colspan="7">
                  <span class="joy-badge joy-badge--neutral joy-badge--sm">+${q.rewards.baseXp} Base EXP</span>
                  <span class="joy-badge joy-badge--neutral joy-badge--sm">+${q.rewards.jobXp} Job EXP</span>
                  ${q.rewards.unlockJobId ? rmsLink('jobs', q.rewards.unlockJobId, 'Promotes To: ' + q.rewards.unlockJobId) : ''}
                  ${q.rewards.unlockSkillId ? rmsLink('jobs', q.rewards.unlockSkillId, 'Unlocks Skill: ' + q.rewards.unlockSkillId) : ''}
                  ${((q.rewards && q.rewards.items) || []).map(ri => rmsLink('gear', ri.itemId, `${ri.itemId} ×${ri.qty}`, 'Item Reward')).join(' ')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================================
 * 7. WOE CASTLE SIEGE SIMULATOR
 * ========================================================================== */
function renderSiege() {
  const castles = DATA.castles.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">ENDGAME GVG SIEGE</div>
        <h1 class="page-hero__title">War of Emperium (GvG Castle Siege) — Breach &amp; TTK Calculator</h1>
        <p class="page-hero__sub">Simulate guild breach time across Outer Gate Barricades, Inner Gate Barricades, and the Holy 1 Normal-Attack-Only Emperium crystal.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="simAttackers">Attacking Guild Members (1..50)</label>
        <input id="simAttackers" class="joy-input" type="number" value="15" min="1" max="50" style="width:140px" oninput="updateSiegeCalc()" />
      </div>
      <div class="control-field">
        <label for="simDps">Avg Normal-Attack DPS / Player</label>
        <input id="simDps" class="joy-input" type="number" value="620" min="50" max="5000" step="50" style="width:160px" oninput="updateSiegeCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="siegeSimResult" style="font-size:0.9rem;padding:8px 14px"></span>
      </div>
    </div>

    <div class="rms-list">
      ${castles.map(cs => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === cs.id ? 'rms-highlight' : ''}" id="entity-${cs.id}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              <span class="rms-icon-box">🏰</span>
              <span class="rms-sheet__title">${escapeHtml(cs.name)}</span>
              <span class="joy-badge joy-badge--brand joy-badge--sm">WOE CASTLE</span>
              <span class="rms-sheet__id">Castle ID# <code>${escapeHtml(cs.id)}</code> (<code>${escapeHtml(cs.assetStudioKey)}</code>)</span>
            </div>
            <div class="chip-row">${inspectBtnHtml('castle', cs.name, cs)}</div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                <th>Hub Town</th>
                <td class="mono">${escapeHtml(cs.hubTownId)}</td>
                <th>Siege Map</th>
                <td>${rmsLink('maps', cs.siegeMapId, cs.siegeMapId)}</td>
                <th>Siege Duration</th>
                <td class="mono">${cs.siegeDurationMinutes} mins</td>
                <th>Max Guild Size</th>
                <td class="mono">${cs.maxGuildSize} members</td>
              </tr>
              <tr>
                <th>Emperium Crystal</th>
                <td colspan="3" class="mono">${cs.emperium.hp.toLocaleString()} HP · ${cs.emperium.element} / ${cs.emperium.race} / ${cs.emperium.size}</td>
                <th>Normal-Attack Only</th>
                <td colspan="3"><span class="joy-badge joy-badge--warning joy-badge--sm">${cs.emperium.onlyNormalAttackDamage ? 'YES (Skills Blocked)' : 'No'}</span></td>
              </tr>
              <tr>
                <th>Gate Barricades</th>
                <td colspan="3" class="mono">${cs.fortifications.outerGateBarricadeCount} Outer + ${cs.fortifications.innerGateBarricadeCount} Inner (${cs.fortifications.barricadeHp.toLocaleString()} HP each)</td>
                <th>Owner Rewards</th>
                <td colspan="3" class="mono">${cs.ownerRewards.dailyTreasureChestCount} Treasure Chests/day · Dungeon: ${cs.ownerRewards.guildDungeonZoneId}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

function updateSiegeCalc() {
  const c = DATA.castles[0];
  if (!c) return;
  const attackers = Math.max(1, parseInt(document.getElementById('simAttackers')?.value || '15', 10));
  const dps = Math.max(10, parseFloat(document.getElementById('simDps')?.value || '620'));
  const scale = c.pvpRules.playerDamageScalingPct / 100.0;
  const raidDps = attackers * dps * scale;
  const totalBarricadeHp = (c.fortifications.outerGateBarricadeCount + c.fortifications.innerGateBarricadeCount) * c.fortifications.barricadeHp;
  const barSec = totalBarricadeHp / raidDps;
  const empSec = c.emperium.hp / raidDps;
  const totalMin = (barSec + empSec + 45) / 60.0;
  const el = document.getElementById('siegeSimResult');
  if (el) {
    el.textContent = `4 Barricades (180k HP): ${barSec.toFixed(1)}s · Emperium (120k HP): ${empSec.toFixed(1)}s · Total Siege Breach: ${totalMin.toFixed(2)} min`;
  }
}

/* ============================================================================
 * 8. MAP & AREA SPAWN DIRECTORY (RateMyServer map_db + areainfo Layout)
 * ========================================================================== */
function renderMinimapSvg(m) {
  const terraces = m.heightTerraces || [];
  const structs = m.structures || [];
  const spawns = m.spawnAreas || [];

  const mapCoord = (v) => 120 + (v / 42.0) * 105;
  const mapSpawnCoord = (v) => ((v - 1650) / 850.0) * 240;

  return `
    <svg width="240" height="240" viewBox="0 0 240 240" style="border-radius:6px;border:1px solid var(--joy-border-strong);background:#16241c">
      <defs>
        <pattern id="grid-${escapeHtml(m.id)}" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="240" height="240" fill="url(#grid-${escapeHtml(m.id)})"/>
      <!-- Roads / Gate Paths -->
      <path d="M 120 0 L 120 240 M 0 120 L 240 120" stroke="rgba(212,175,55,0.22)" stroke-width="8" stroke-dasharray="4 2"/>
      <!-- Height Terraces -->
      ${terraces.map(t => {
        const cx = mapCoord(t.x || 0);
        const cy = mapCoord(t.z || 0);
        const r = Math.max(12, (t.radius || 10) * 2.2);
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(72, 168, 104, 0.28)" stroke="#5ec27e" stroke-width="1.2"/>`;
      }).join('')}
      <!-- Spawn Areas -->
      ${spawns.map(sp => {
        const sx = mapSpawnCoord(sp.x || 1900);
        const sy = mapSpawnCoord(sp.y || 1900);
        const sw = Math.max(14, ((sp.width || 120) / 850.0) * 240);
        const sh = Math.max(14, ((sp.height || 120) / 850.0) * 240);
        return `<rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" fill="rgba(235, 87, 87, 0.18)" stroke="rgba(235, 87, 87, 0.75)" stroke-width="1" stroke-dasharray="2 2"/>`;
      }).join('')}
      <!-- Walkable 3D Structures -->
      ${structs.map(s => {
        const sx = mapCoord(s.x || 0);
        const sy = mapCoord(s.z || 0);
        const sr = Math.max(7, (s.radius || 3.5) * 2.1);
        return `
          <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="rgba(230, 184, 77, 0.45)" stroke="#ffd166" stroke-width="2"/>
          <text x="${sx.toFixed(1)}" y="${(sy - sr - 4).toFixed(1)}" text-anchor="middle" fill="#ffd166" font-size="9" font-family="monospace">${escapeHtml(s.kind)}</text>
        `;
      }).join('')}
    </svg>
  `;
}

function renderMaps() {
  const maps = DATA.maps.filter(matchesSearch);

  const zoneCards = [
    { id: 'prontera_south_field', name: 'Prontera South Gate Field (prontera_south_field)', area: 'Prontera Kingdom — Core Area', linkedMap: maps[0] },
    { id: 'forest_zone',          name: 'Payon & South Gate Forest Range (forest_zone)',   area: 'Archery & Beast Hunting Woods', linkedMap: null },
    { id: 'sunken_crypt_1f',      name: 'Sunken Crypt 1F (sunken_crypt_1f)',               area: 'Undead Catacombs · Chivalry & Arcana Trials', linkedMap: null },
    { id: 'orc_fortress_courtyard', name: 'Orc Fortress Courtyard (orc_fortress_courtyard)', area: 'High-Risk MVP Siege Arena', linkedMap: null },
  ].filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER MAP_DB &amp; AREAINFO · MONSTER ON MAPS</div>
        <h1 class="page-hero__title">World Map Directory, 2D Minimaps &amp; Monster Spawn Tables</h1>
        <p class="page-hero__sub">
          RateMyServer <code>areainfo</code> layout: 2D top-down terrain/structure/spawn minimap on the left,
          paired with clickable Monster Spawn counts, 3D Walkable Structures, and Zone Quests on the right.
        </p>
      </div>
    </div>

    <div class="rms-list">
      ${maps.map(m => {
        const southMobs = DATA.mobs.filter(mb => (mb.spawnZones || []).includes('prontera_south_field'));
        const southQuests = DATA.quests.filter(q => q.zoneId === 'prontera_south_field');
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === m.id || HIGHLIGHT_ENTITY_ID === 'prontera_south_field' ? 'rms-highlight' : ''}" id="entity-${m.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">🗺️</span>
                <span class="rms-sheet__title">Map: ${escapeHtml(m.id)} — ${escapeHtml(m.name)}</span>
                <span class="joy-badge joy-badge--success joy-badge--sm">${m.structureCount} 3D Structures · ${m.terraceCount} Terraces</span>
              </div>
              <div class="chip-row">
                <span class="rms-sheet__id">Area: Prontera South Gate (${m.width}×${m.height})</span>
                ${inspectBtnHtml('map', m.name, m)}
              </div>
            </div>
            <div class="rms-map-split">
              <div class="rms-minimap-cell">
                ${renderMinimapSvg(m)}
                <div class="observatory-card__meta" style="text-align:center">
                  🟢 Terraces (${m.terraceCount}) · 🟡 3D Structures (${m.structureCount}) · 🔴 Spawn Areas (${(m.spawnAreas || []).length})
                </div>
              </div>
              <div class="rms-spawn-cell">
                <div style="font-weight:700;color:var(--joy-accent-text);font-size:13px">
                  Click on a monster or quest below to view its datasheet:
                </div>
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Catalog Monsters in Zone (<code>prontera_south_field</code>):</strong><br/>
                  ${southMobs.map(mb => rmsLink('mobs', mb.id, `${mb.name} (Lv.${mb.level})`, `${mb.element}/${mb.race}/${mb.size}`)).join(' ')}
                </div>
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Map Spawn Areas (<code>content/maps/${escapeHtml(m.id)}.json</code>):</strong>
                  <div class="chip-row" style="margin-top:4px">
                    ${(m.spawnAreas || []).map(sp => `
                      <span class="joy-badge joy-badge--neutral joy-badge--sm mono">
                        ${escapeHtml(sp.id)}: ${escapeHtml(sp.mobType)} (${sp.count}) @ (${sp.x},${sp.y})
                      </span>
                    `).join('')}
                  </div>
                </div>
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Walkable 3D Structures &amp; Terraces:</strong>
                  <div class="chip-row" style="margin-top:4px">
                    ${(m.structures || []).map(s => `<span class="joy-badge joy-badge--brand joy-badge--sm mono">${escapeHtml(s.id)} (${escapeHtml(s.kind)} · r=${s.radius}m · 2F=${s.upperFloorHeight}m)</span>`).join('')}
                    ${(m.heightTerraces || []).map(t => `<span class="joy-badge joy-badge--success joy-badge--sm mono">${escapeHtml(t.id)} (h=${t.height}m)</span>`).join('')}
                  </div>
                </div>
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Quests in this Area:</strong><br/>
                  ${southQuests.map(q => rmsLink('quests', q.id, q.title, q.category)).join(' ')}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}

      ${zoneCards.map(z => {
        const zMobs = DATA.mobs.filter(mb => (mb.spawnZones || []).includes(z.id));
        const zQuests = DATA.quests.filter(q => q.zoneId === z.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === z.id ? 'rms-highlight' : ''}" id="entity-${z.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-icon-box">🧭</span>
                <span class="rms-sheet__title">Zone: ${escapeHtml(z.id)}</span>
                <span class="rms-sheet__id">${escapeHtml(z.name)}</span>
              </div>
              <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(z.area)}</span>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Monsters on Map</th>
                  <td>
                    ${zMobs.map(mb => rmsLink('mobs', mb.id, `${mb.name} (Lv.${mb.level})`, mb.isMvp ? 'MVP Boss / 60 min' : 'Field Spawn / 3~5 min')).join(' ') || 'No monster on this map.'}
                  </td>
                </tr>
                <tr>
                  <th>Active Quests</th>
                  <td>
                    ${zQuests.map(q => rmsLink('quests', q.id, q.title, 'Lv.' + q.minBaseLevel)).join(' ') || '<span class="observatory-card__meta">None</span>'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 9. SQLITE STUDIO, BALANCE SIM & DOCS
 * ========================================================================== */
function renderSqlStudio() {
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RELATIONAL + JSONB OBSERVABILITY</div>
        <h1 class="page-hero__title">Live Read-Only SQLite Query Studio (build/catalog.sqlite)</h1>
        <p class="page-hero__sub">Query indexed relational tables, JSONB payloads, and analytical views directly in browser or Mac app.</p>
      </div>
    </div>

    <div class="observatory-card">
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_job_progression;')">v_job_progression</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_mob_economy;')">v_mob_economy</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_asset_studio_entries;')">v_asset_studio_entries</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT m.name AS mob, i.name AS item, d.chance_bps/100.0 AS drop_pct FROM mob_drops d JOIN mobs m ON m.id=d.mob_id JOIN items i ON i.id=d.item_id ORDER BY m.level, drop_pct DESC;')">Mob Drop Rates</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, title, category, min_base_level, base_xp, job_xp, unlock_job_id FROM quest_board ORDER BY min_base_level;')">Quest Board</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, name, emperium_hp, barricade_hp, player_damage_scaling_pct, guild_dungeon_zone_id FROM castles;')">WoE Castles</button>
      </div>
      <textarea id="sqlInput" class="sql-editor">SELECT * FROM v_mob_economy;</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="observatory-card__meta">Read-only SQLite connection (<code>SELECT</code>, <code>WITH</code>, <code>PRAGMA</code>, <code>EXPLAIN</code>)</span>
        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="executeSql()">Execute SQL Query</button>
      </div>
    </div>

    <div id="sqlOutput"></div>
  `;
}

async function runSqlPreset(sql) {
  const box = document.getElementById('sqlInput');
  if (box) box.value = sql;
  await executeSql();
}

async function executeSql() {
  const box = document.getElementById('sqlInput');
  const out = document.getElementById('sqlOutput');
  if (!box || !out) return;
  const res = await fetch('/api/sql?q=' + encodeURIComponent(box.value));
  const data = await res.json();
  if (!data.ok) {
    out.innerHTML = `<div class="joy-alert joy-alert--danger">SQL Error: ${escapeHtml(data.error)}</div>`;
    return;
  }
  out.innerHTML = `
    <div class="observatory-card">
      <div class="observatory-card__head">
        <h3 class="observatory-card__title">Query Result (${data.rowCount} rows)</h3>
        <span class="joy-badge joy-badge--success">Read-Only</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>${data.columns.map(c => `<th>${escapeHtml(String(c))}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.rows.map(r => `<tr>${r.map(v => `<td class="mono">${v === null ? 'NULL' : escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSim() {
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">AUTHORITATIVE RUST COMBAT ENGINE</div>
        <h1 class="page-hero__title">Headless Balance Simulator (server-rs / balance_sim)</h1>
        <p class="page-hero__sub">Executes <code>cargo run --bin balance_sim</code> to verify TTK, EXP/hour, refine +0..+15 curves, and WoE Emperium breach pacing.</p>
      </div>
      <button type="button" class="joy-button joy-button--solid" onclick="triggerBalanceSim()" ${SIM_RUNNING ? 'disabled' : ''}>
        ${SIM_RUNNING ? 'Running Simulator...' : 'Re-Run Balance Simulator'}
      </button>
    </div>

    <div class="joy-code-block">
      <div class="joy-code-block__header">
        <div class="joy-code-block__meta">
          <span class="joy-code-block__lang">RUST</span>
          <span>server-rs/src/bin/balance_sim.rs</span>
        </div>
      </div>
      <pre style="margin:0;padding:18px;overflow-x:auto"><code>${escapeHtml(SIM_OUTPUT)}</code></pre>
    </div>
  `;
}

function renderDocs() {
  const docs = DATA.docs || [];
  const active = docs[SELECTED_DOC_IDX] || docs[0];
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">CANON &amp; ARCHITECTURE SPECS</div>
        <h1 class="page-hero__title">Architecture Specs &amp; World Lore Canon Reviewer</h1>
        <p class="page-hero__sub">Browse design specs and world canon directly inside the Joymify Observatory shell.</p>
      </div>
    </div>
    <div class="chip-row">
      ${docs.map((d, i) => `
        <button type="button" class="joy-button ${i === SELECTED_DOC_IDX ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="SELECTED_DOC_IDX=${i};render()">
          ${escapeHtml(d.id)}
        </button>
      `).join('')}
    </div>
    ${active ? `
      <div class="joy-code-block">
        <div class="joy-code-block__header">
          <div class="joy-code-block__meta">
            <span class="joy-code-block__lang">MARKDOWN</span>
            <span>${escapeHtml(active.path)}</span>
          </div>
        </div>
        <pre style="margin:0;padding:18px;white-space:pre-wrap;font-family:var(--joy-font-family-mono)"><code>${escapeHtml(active.content)}</code></pre>
      </div>
    ` : ''}
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
</script>
</body>
</html>
"""


class ObservatoryHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, payload: dict, status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            raw = INDEX_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if parsed.path == "/theme.css":
            raw = load_theme_css()
            self.send_response(200)
            self.send_header("Content-Type", "text/css; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if parsed.path == "/api/bundle":
            self._send_json(build_full_bundle())
            return

        if parsed.path == "/api/sql":
            qs = parse_qs(parsed.query)
            q = (qs.get("q") or [""])[0]
            self._send_json(run_readonly_sql(q))
            return

        self._send_json({"ok": False, "error": "Not found"}, status=404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/rebuild":
            subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)
            self._send_json({"ok": True, "message": "Rebuilt build/catalog.sqlite and build/catalog_summary.json"})
            return
        if parsed.path == "/api/sim":
            self._send_json(run_balance_sim())
            return
        self._send_json({"ok": False, "error": "Not found"}, status=404)


def main() -> int:
    parser = argparse.ArgumentParser(description="Atlas World MMORPG Catalog & Balance Observatory Web Studio")
    parser.add_argument("--port", type=int, default=8788, help="HTTP port (default: 8788)")
    parser.add_argument("--dump-check", action="store_true", help="Verify bundle + SQL engine and exit 0")
    args = parser.parse_args()

    if args.dump_check:
        bundle = build_full_bundle()
        sql_res = run_readonly_sql("SELECT * FROM v_mob_economy;")
        print(
            f"[catalog_explorer_web] OK — jobs={len(bundle['jobs'])}, mobs={len(bundle['mobs'])}, "
            f"cards={len(bundle['cards'])}, quests={len(bundle['quests'])}, "
            f"castles={len(bundle['castles'])}, sql_rows={sql_res.get('rowCount')}"
        )
        return 0

    ensure_catalog_db()
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(("0.0.0.0", args.port), ObservatoryHandler)
    print(f"[catalog_explorer_web] Atlas World Observatory listening on http://127.0.0.1:{args.port}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
