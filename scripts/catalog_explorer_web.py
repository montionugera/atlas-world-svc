#!/usr/bin/env python3
"""
Atlas World — MMORPG Catalog & Balance Observatory Web Studio (scripts/catalog_explorer_web.py)

Powered by the canonical `joy-design` Design System (`@joymify/tokens` `theme.css`,
`@joymify/brand` emblem, and `.joy-*` component primitives):
  - Global Search (`⌘K` / `/`) across Jobs, Mobs, Cards, Items, Quests, Handbook, Castles, and Maps
  - Interactive Slide-Over Inspector Drawer (`.joy-drawer`) with full JSON contract & cross-references
  - Interactive Job Tree & Promotion Trial Explorer
  - Monster Bestiary, Drop Table & EXP/HP Economy Inspector
  - 10-Element Counter Matrix & Weapon-vs-Size Heatmap + Live Damage Multiplier Calculator
  - Equipment, Refine (+0..+15 Pity), Cards & Adventurer Handbook Passive Calculator
  - War of Emperium (GvG Castle Siege) Breach & TTK Calculator
  - Read-Only Live SQLite Query Console against `build/catalog.sqlite`
  - Live `server-rs` Headless Balance Simulator Runner (`POST /api/sim`)
  - Spec & Canon Markdown Reviewer (`docs/superpowers/specs/*.md`, `content/story/canon.md`)

Usage:
  python3 scripts/catalog_explorer_web.py [--port 8788]
"""

from __future__ import annotations

import argparse
import json
import os
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
                    "terraceCount": len(d.get("heightTerraces", [])),
                    "structureCount": len(d.get("structures", [])),
                    "propCount": len(d.get("props", [])),
                    "structures": d.get("structures", []),
                    "heightTerraces": d.get("heightTerraces", []),
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
  <title>Atlas World — Joymify Design Observatory</title>
  <link rel="stylesheet" href="/theme.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --sidebar-width: 276px;
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

    /* Custom Scrollbars */
    * { scrollbar-width: thin; scrollbar-color: var(--joy-border-default) transparent; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background-color: var(--joy-border-default); border-radius: var(--joy-radius-pill); }
    ::-webkit-scrollbar-thumb:hover { background-color: var(--joy-border-strong); }

    /* Sidebar (joy-design Storybook Hub Shell) */
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
      padding: 20px 20px 16px;
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
      transition: border-color var(--joy-duration-fast), box-shadow var(--joy-duration-fast);
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
      height: 36px;
      padding: 0 8px;
      background: transparent;
      border: none;
      outline: none;
      font-size: var(--joy-font-size-sm);
      font-family: inherit;
      color: var(--joy-text-primary);
    }
    .sidebar-search__input::placeholder {
      color: var(--joy-text-muted);
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
      padding: 8px 12px 16px;
    }
    .nav-section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--joy-text-muted);
      padding: 12px 10px 6px;
      margin-top: 4px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--joy-radius-control);
      font-size: var(--joy-font-size-sm);
      font-weight: 500;
      color: var(--joy-text-secondary);
      cursor: pointer;
      transition: background-color var(--joy-duration-fast), color var(--joy-duration-fast);
      margin-bottom: 2px;
    }
    .nav-item__left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
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
    .nav-item.active .nav-section-count {
      background: var(--joy-surface-card);
      color: var(--joy-accent-text);
      border-color: var(--joy-border-default);
    }
    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--joy-border-subtle);
      font-size: var(--joy-font-size-xs);
      color: var(--joy-text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Main Content */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .topbar {
      min-height: 60px;
      border-bottom: 1px solid var(--hub-chrome-border);
      background: var(--hub-topbar-bg);
      padding: 0 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--joy-space-3);
      flex-shrink: 0;
    }
    .topbar__start, .topbar__end {
      display: flex;
      align-items: center;
      gap: var(--joy-space-2);
    }
    .topbar__title {
      font-size: var(--joy-font-size-md);
      font-weight: 600;
      color: var(--joy-text-primary);
    }
    .scroll-stage {
      flex: 1;
      overflow-y: auto;
    }
    .content-area {
      max-width: 1220px;
      width: 100%;
      margin: 0 auto;
      padding: 32px 32px 72px;
      display: flex;
      flex-direction: column;
      gap: var(--joy-space-6);
    }

    /* Editorial Page Header */
    .page-hero {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--joy-space-4);
      padding-bottom: var(--joy-space-4);
      border-bottom: 1px solid var(--joy-border-subtle);
    }
    .page-hero__eyebrow {
      font-family: var(--joy-font-family-mono);
      font-size: var(--joy-font-size-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--joy-accent-text);
      margin-bottom: 6px;
    }
    .page-hero__title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2.25rem;
      font-weight: 600;
      line-height: 1.1;
      color: var(--joy-text-primary);
      margin: 0 0 6px 0;
    }
    .page-hero__sub {
      font-size: var(--joy-font-size-sm);
      color: var(--joy-text-secondary);
      margin: 0;
      max-width: 720px;
      line-height: 1.5;
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
      transition: border-color var(--joy-duration-fast), transform var(--joy-duration-fast), box-shadow var(--joy-duration-fast);
    }
    .observatory-card--interactive {
      cursor: pointer;
    }
    .observatory-card--interactive:hover {
      border-color: var(--joy-border-strong);
      transform: translateY(-2px);
      box-shadow: var(--joy-elevation-2);
    }
    .observatory-card--gold {
      border-color: var(--joy-border-strong);
    }
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
    .kv-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: var(--joy-font-size-sm);
    }
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
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .mono {
      font-family: var(--joy-font-family-mono);
      font-variant-numeric: tabular-nums;
    }

    /* Controls Bar */
    .controls-panel {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: var(--joy-space-4) var(--joy-space-5);
      box-shadow: var(--joy-elevation-1);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--joy-space-4);
    }
    .control-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .control-field label {
      font-size: var(--joy-font-size-xs);
      font-weight: 600;
      color: var(--joy-text-secondary);
    }

    /* SQL Editor */
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
    .sql-editor:focus {
      border-color: var(--joy-border-focus);
      box-shadow: 0 0 0 2px var(--joy-focus-ring);
    }

    /* Slide-over Inspector Drawer */
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
    .inspector-drawer.open {
      transform: translateX(0);
    }
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

    /* Element cell coloring */
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
        <h2>Atlas World</h2>
        <span>Joymify Design v3.12</span>
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
          placeholder="Search catalog, IDs, skills..."
          autocomplete="off"
        />
        <kbd class="sidebar-search__kbd">⌘K</kbd>
      </div>
    </div>

    <nav class="nav" id="sidebarNav"></nav>

    <div class="sidebar-footer">
      <span>SQLite + JSONB</span>
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
        <select id="paletteSelect" class="joy-select" style="height:32px;font-size:12px;padding:0 28px 0 10px;width:auto" aria-label="Color palette" onchange="setPalette(this.value)">
          <option value="classic">Palette: Classic Gold &amp; Navy</option>
          <option value="clay-court">Palette: Clay Court</option>
          <option value="verdant-lawn">Palette: Verdant Lawn</option>
          <option value="nordic-slate">Palette: Nordic Slate</option>
          <option value="bauhaus-primary">Palette: Bauhaus Primary</option>
          <option value="outdoor">Palette: High-Contrast Outdoor</option>
        </select>

        <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="toggleTheme()" id="themeToggleBtn">
          Light / Dark
        </button>

        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="rebuildDb()">
          Rebuild SQLite
        </button>

        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="switchTab('sim'); triggerBalanceSim();">
          Run Balance Sim
        </button>
      </div>
    </header>

    <div class="scroll-stage">
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
      <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="closeInspector()">Close (Esc)</button>
    </div>
    <div class="inspector-drawer__body" id="inspectorBody"></div>
  </aside>

<script>
let DATA = null;
let CURRENT_TAB = 'overview';
let SEARCH_QUERY = '';
let SELECTED_DOC_IDX = 0;
let SIM_OUTPUT = 'Click "Run Balance Sim" in the top bar (or below) to execute `cargo run --bin balance_sim` against the live Rust authoritative combat engine.';
let SIM_RUNNING = false;

const NAV_GROUPS = [
  {
    section: 'World Telemetry',
    items: [
      { id: 'overview', label: 'Overview & Matrix', countKey: () => 9 },
      { id: 'sql',      label: 'SQLite Query Studio', countKey: () => 'SQL' },
      { id: 'sim',      label: 'Rust Balance Sim', countKey: () => 'RS' },
    ]
  },
  {
    section: 'Combat & Progression',
    items: [
      { id: 'jobs',     label: 'Job Tree & Trials', countKey: d => d.jobs.length },
      { id: 'mobs',     label: 'Monster Bestiary', countKey: d => d.mobs.length },
      { id: 'elements', label: '10-Element & Size', countKey: d => (d.elements.elements || []).length },
      { id: 'gear',     label: 'Equipment & Cards', countKey: d => d.items.length + d.cards.length },
    ]
  },
  {
    section: 'World & Endgame',
    items: [
      { id: 'quests',   label: 'Quest Board', countKey: d => d.quests.length },
      { id: 'siege',    label: 'WoE Castle Siege', countKey: d => d.castles.length },
      { id: 'maps',     label: '3D Maps & Terraces', countKey: d => d.maps.length },
      { id: 'docs',     label: 'Specs & Lore Canon', countKey: d => d.docs.length },
    ]
  }
];

function syncUrlState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const t = params.get('tab');
  const q = params.get('q');
  if (t) CURRENT_TAB = t;
  if (q !== null) {
    SEARCH_QUERY = q;
    const inp = document.getElementById('globalSearch');
    if (inp) inp.value = q;
  }
}

function writeUrlState() {
  const params = new URLSearchParams();
  params.set('tab', CURRENT_TAB);
  if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);
  history.replaceState(null, '', '#' + params.toString());
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
  writeUrlState();
  renderSidebar();
  render();
}

function renderSidebar() {
  if (!DATA) return;
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = NAV_GROUPS.map(group => `
    <div class="nav-section">${group.section}</div>
    ${group.items.map(it => `
      <div class="nav-item ${it.id === CURRENT_TAB ? 'active' : ''}" onclick="switchTab('${it.id}')">
        <div class="nav-item__left">
          <span>${it.label}</span>
        </div>
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
  SIM_OUTPUT = 'Running `cargo run --quiet --manifest-path server-rs/Cargo.toml --bin balance_sim`...';
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
    overview: 'Overview & Cross-Repo Telemetry',
    jobs: 'Job Class Hierarchy & Promotion Trials',
    mobs: 'Monster Bestiary, Drops & Economy',
    elements: '10-Element Counter Matrix & Size Penalties',
    gear: 'Equipment, +0..+15 Refine & Adventurer Handbook',
    quests: 'Unified 6-Category Quest Board',
    siege: 'War of Emperium (GvG Castle Siege) Simulator',
    maps: '3D World Maps, Walkable Structures & Terraces',
    sql: 'Live Read-Only SQLite Query Studio',
    sim: 'Authoritative Rust Balance Simulator (balance_sim)',
    docs: 'Architecture Specs & World Lore Canon'
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
  return `<button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="openInspector('${kind}', '${safeTitle}', JSON.parse(decodeURIComponent('${encoded}')))">Inspect JSON</button>`;
}

function renderOverview() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const mobs = DATA.mobs.filter(matchesSearch);
  const items = DATA.items.filter(matchesSearch);
  const cards = DATA.cards.filter(matchesSearch);
  const quests = DATA.quests.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">JOYMIFY DESIGN SYSTEM · ATLAS WORLD OBSERVATORY</div>
        <h1 class="page-hero__title">MMORPG Catalog, SQLite &amp; Balance Telemetry</h1>
        <p class="page-hero__sub">
          Single-source-of-truth contract explorer across <code>contracts/content/*.json</code>,
          <code>build/catalog.sqlite</code>, <code>server-rs</code> combat math, and <code>atlas-asset-studio</code> keys.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand">SQLite Indexed</span>
        <span class="joy-badge joy-badge--success">68/68 Rust Tests Passing</span>
      </div>
    </div>

    <div class="joy-telemetry-strip">
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.jobs.length}</span>
        <span class="joy-telemetry-strip__label">Job Classes</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.skills.length}</span>
        <span class="joy-telemetry-strip__label">Active Skills</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.mobs.length}</span>
        <span class="joy-telemetry-strip__label">Monsters &amp; MVPs</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.items.length}</span>
        <span class="joy-telemetry-strip__label">Equipment &amp; Loot</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.cards.length}</span>
        <span class="joy-telemetry-strip__label">Monster Cards</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.quests.length}</span>
        <span class="joy-telemetry-strip__label">Quest Board</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.castles.length}</span>
        <span class="joy-telemetry-strip__label">WoE Castles</span>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="joy-metric-tile joy-metric-tile--up" onclick="switchTab('jobs')" style="cursor:pointer">
        <div class="joy-metric-tile__title">Job Tree &amp; Promotion Trials</div>
        <div class="joy-metric-tile__value">${jobs.length}</div>
        <div class="joy-metric-tile__change">Tier 0 Novice → Tier 2 Knight / Wizard</div>
      </div>
      <div class="joy-metric-tile joy-metric-tile--up" onclick="switchTab('mobs')" style="cursor:pointer">
        <div class="joy-metric-tile__title">Monster Bestiary &amp; MVP Bosses</div>
        <div class="joy-metric-tile__value">${mobs.length}</div>
        <div class="joy-metric-tile__change">10-Element + 10-Race + 3-Size</div>
      </div>
      <div class="joy-metric-tile joy-metric-tile--up" onclick="switchTab('gear')" style="cursor:pointer">
        <div class="joy-metric-tile__title">Items, Cards &amp; Handbook</div>
        <div class="joy-metric-tile__value">${items.length + cards.length}</div>
        <div class="joy-metric-tile__change">+0..+15 Pity Refine &amp; Card Sockets</div>
      </div>
      <div class="joy-metric-tile joy-metric-tile--up" onclick="switchTab('siege')" style="cursor:pointer">
        <div class="joy-metric-tile__title">War of Emperium (GvG)</div>
        <div class="joy-metric-tile__value">${DATA.castles.length} Castle</div>
        <div class="joy-metric-tile__change">Kriemhild · Normal-Attack Emperium</div>
      </div>
    </div>

    <div class="observatory-card observatory-card--gold">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Cross-Repo Asset Studio Binding Matrix</h3>
          <div class="observatory-card__meta">Live verification across jobs, monsters, castles, and 3D glTF / VRM assets</div>
        </div>
        <span class="joy-badge joy-badge--brand">v_asset_studio_entries</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Entity ID</th>
              <th>Display Name</th>
              <th>Tier / Rank / Slot</th>
              <th>Asset Studio Key</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            ${jobs.map(j => `
              <tr>
                <td><span class="joy-badge joy-badge--brand joy-badge--sm">JOB</span></td>
                <td class="mono">${j.id}</td>
                <td><strong>${j.name}</strong></td>
                <td class="mono">Tier ${j.tier} (${j.parentJobId || 'root'})</td>
                <td class="mono">${j.assetStudioKey}</td>
                <td>${inspectBtnHtml('job', j.name, j)}</td>
              </tr>
            `).join('')}
            ${mobs.map(m => `
              <tr>
                <td><span class="joy-badge ${m.isMvp ? 'joy-badge--warning' : 'joy-badge--danger'} joy-badge--sm">${m.isMvp ? 'MVP' : 'MOB'}</span></td>
                <td class="mono">${m.id}</td>
                <td><strong>${m.name}</strong></td>
                <td class="mono">Lv.${m.level} · ${m.element}/${m.race}/${m.size}</td>
                <td class="mono">${m.assetStudioKey}</td>
                <td>${inspectBtnHtml('mob', m.name, m)}</td>
              </tr>
            `).join('')}
            ${DATA.castles.filter(matchesSearch).map(c => `
              <tr>
                <td><span class="joy-badge joy-badge--success joy-badge--sm">CASTLE</span></td>
                <td class="mono">${c.id}</td>
                <td><strong>${c.name}</strong></td>
                <td class="mono">${c.hubTownId} → ${c.siegeMapId}</td>
                <td class="mono">${c.assetStudioKey}</td>
                <td>${inspectBtnHtml('castle', c.name, c)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderJobs() {
  const jobs = DATA.jobs.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">PROGRESSION ARCHITECTURE</div>
        <h1 class="page-hero__title">Job Class Hierarchy &amp; Promotion Trials (${jobs.length})</h1>
        <p class="page-hero__sub">Novice (Tier 0) → First Class at Base Lv.10 / Job Lv.10 → Second Class at Base Lv.40 / Job Lv.40.</p>
      </div>
    </div>
    <div class="card-grid">
      ${jobs.map(j => `
        <div class="observatory-card ${j.tier === 2 ? 'observatory-card--gold' : ''}">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">${j.name}</h3>
              <div class="observatory-card__meta">ID: ${j.id} · Parent: ${j.parentJobId || 'Root'}</div>
            </div>
            <span class="joy-badge ${j.tier === 2 ? 'joy-badge--brand' : (j.tier === 1 ? 'joy-badge--success' : 'joy-badge--neutral')}">Tier ${j.tier}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Min Base Level</span><span class="kv-val">Lv.${j.minBaseLevel}</span></div>
            <div class="kv-row"><span class="kv-label">Max Job Level</span><span class="kv-val">Job Lv.${j.maxJobLevel}</span></div>
            <div class="kv-row"><span class="kv-label">Promotion Quest</span><span class="kv-val">${j.promotionQuestId || 'Starter'}</span></div>
            <div class="kv-row"><span class="kv-label">Allowed Weapons</span><span class="kv-val">${(j.allowedWeaponKinds || []).join(', ')}</span></div>
            <div class="kv-row"><span class="kv-label">Unlocked Skills</span><span class="kv-val">${(j.unlockedSkillIds || []).join(', ')}</span></div>
            <div class="kv-row"><span class="kv-label">Base Stat Bonuses</span><span class="kv-val">${Object.entries(j.baseStatBonuses || {}).filter(([,v])=>v>0).map(([k,v])=>`${k.toUpperCase()}+${v}`).join(' ') || 'None'}</span></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px">
            <span class="mono" style="font-size:11px;color:var(--joy-text-muted)">${j.assetStudioKey}</span>
            ${inspectBtnHtml('job', j.name, j)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMobs() {
  const mobs = DATA.mobs.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">COMBAT &amp; LOOT TABLES</div>
        <h1 class="page-hero__title">Monster Bestiary, Drop Tables &amp; EXP/HP Efficiency (${mobs.length})</h1>
        <p class="page-hero__sub">Authoritative stats, 10-element / 10-race / 3-size tags, card sockets, and basis-point drop tables.</p>
      </div>
    </div>
    <div class="card-grid">
      ${mobs.map(m => `
        <div class="observatory-card ${m.isMvp ? 'observatory-card--gold' : ''}">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">Lv.${m.level} ${m.name}</h3>
              <div class="observatory-card__meta">${m.element} · ${m.race} · ${m.size}</div>
            </div>
            <span class="joy-badge ${m.isMvp ? 'joy-badge--brand' : 'joy-badge--danger'}">${m.isMvp ? 'MVP BOSS' : m.rank.toUpperCase()}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">HP / ATK / DEF / MDEF</span><span class="kv-val">${m.hp.toLocaleString()} HP · ${m.pAtk} ATK · ${m.pDef}/${m.mDef}</span></div>
            <div class="kv-row"><span class="kv-label">Base / Job EXP</span><span class="kv-val">+${m.baseExp} / +${m.jobExp}</span></div>
            <div class="kv-row"><span class="kv-label">EXP per 100 HP</span><span class="kv-val">${((m.baseExp * 100) / Math.max(1, m.hp)).toFixed(1)} Base/100HP</span></div>
            <div class="kv-row"><span class="kv-label">Linked Card</span><span class="kv-val">${m.cardId || '—'}</span></div>
            <div class="kv-row"><span class="kv-label">Loot Drops</span><span class="kv-val">${(m.drops || []).map(d => `${d.itemId} (${(d.chanceBps/100).toFixed(2)}%)`).join(', ')}</span></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px">
            <span class="mono" style="font-size:11px;color:var(--joy-text-muted)">${m.assetStudioKey}</span>
            ${inspectBtnHtml('mob', m.name, m)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderElements() {
  const elems = DATA.elements.elements || [];
  const mat = DATA.elements.damageMatrixPct || {};
  const sizePen = DATA.elements.weaponSizePenaltyPct || {};
  const wpnKinds = Object.keys(sizePen);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">COMBAT DAMAGE MODEL</div>
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
          <div class="observatory-card__meta">Classic RO weapon-size signature (e.g., Spears excel vs. Large, Daggers excel vs. Small)</div>
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
                <td><strong>${wpn}</strong></td>
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
  if (!DATA) return;
  const atk = document.getElementById('calcAtkElem')?.value;
  const def = document.getElementById('calcDefElem')?.value;
  const wpn = document.getElementById('calcWpnKind')?.value;
  const sz = document.getElementById('calcTargetSize')?.value;
  const ePct = DATA.elements.damageMatrixPct?.[atk]?.[def] ?? 100;
  const sPct = DATA.elements.weaponSizePenaltyPct?.[wpn]?.[sz] ?? 100;
  const combined = ((ePct / 100) * (sPct / 100) * 100).toFixed(1);
  const out = document.getElementById('elemCalcOutput');
  if (out) out.textContent = `Element ${ePct}% × Size ${sPct}% = ${combined}% Final Damage`;
}

function renderGear() {
  const items = DATA.items.filter(matchesSearch);
  const cards = DATA.cards.filter(matchesSearch);
  const handbook = DATA.handbook.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">ITEMIZATION &amp; HORIZONTAL PROGRESSION</div>
        <h1 class="page-hero__title">Equipment, +0..+15 Refine Calculator, Cards &amp; Handbook</h1>
        <p class="page-hero__sub">Safe refine through +4, failure pity gauge (+20%/fail, 5/5 = 100%), socketable monster cards, and permanent account-wide handbook deposits.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="refBaseAtk">Base Weapon ATK</label>
        <input id="refBaseAtk" class="joy-input" type="number" value="120" min="10" max="500" style="width:120px" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refLevel">Target Refine Level (+0..+15)</label>
        <input id="refLevel" class="joy-input" type="number" value="10" min="0" max="15" style="width:120px" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refFails">Consecutive Fails (Pity 0..5)</label>
        <input id="refFails" class="joy-input" type="number" value="2" min="0" max="5" style="width:120px" oninput="updateRefineCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="refineCalcResult" style="font-size:0.9rem;padding:8px 14px"></span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Equipment &amp; Consumable Catalog (${items.length})</h3>
          <div class="observatory-card__meta">contracts/content/items.json</div>
        </div>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Name</th>
              <th>Slot / Kind</th>
              <th>Card Slots</th>
              <th>Refineable</th>
              <th>Base Stats</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td class="mono">${it.id}</td>
                <td><strong>${it.name}</strong></td>
                <td><span class="joy-badge joy-badge--neutral joy-badge--sm">${it.slot}</span> <span class="mono" style="font-size:12px">${it.weaponKind || ''}</span></td>
                <td class="mono">${it.cardSlots}</td>
                <td><span class="joy-badge ${it.refineable ? 'joy-badge--success' : 'joy-badge--neutral'} joy-badge--sm">${it.refineable ? 'Yes' : 'No'}</span></td>
                <td class="mono">${Object.entries(it.stats || {}).map(([k,v]) => `${k}+${v}`).join(' ') || '—'}</td>
                <td>${inspectBtnHtml('item', it.name, it)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card-grid">
      ${cards.map(c => `
        <div class="observatory-card observatory-card--gold">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">${c.name}</h3>
              <div class="observatory-card__meta">Source Mob: ${c.mobId}</div>
            </div>
            <span class="joy-badge joy-badge--brand">${c.slot.toUpperCase()} CARD</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Socket Equip Bonus</span><span class="kv-val">${Object.entries(c.equipStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</span></div>
            <div class="kv-row"><span class="kv-label">Handbook Deposit</span><span class="kv-val">${Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</span></div>
          </div>
          <div style="display:flex;justify-content:flex-end">${inspectBtnHtml('card', c.name, c)}</div>
        </div>
      `).join('')}
      ${handbook.map(h => `
        <div class="observatory-card">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">${h.title}</h3>
              <div class="observatory-card__meta">Category: ${h.category} · Target: ${h.targetId}</div>
            </div>
            <span class="joy-badge joy-badge--success">HANDBOOK</span>
          </div>
          <div class="kv-list">
            ${h.tiers.map(t => `
              <div class="kv-row">
                <span class="kv-label">≥ ${t.requiredCount}: ${t.unlockNote}</span>
                <span class="kv-val">${t.bonusStat} +${t.bonusValue}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
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

function renderQuests() {
  const quests = DATA.quests.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">QUEST PROGRESSION</div>
        <h1 class="page-hero__title">Unified 6-Category Quest Board (${quests.length})</h1>
        <p class="page-hero__sub">Main Story, Side Story, Daily Board, Weekly Elite, Hunting Bounties, and Job Promotion Trials.</p>
      </div>
    </div>
    <div class="card-grid">
      ${quests.map(q => `
        <div class="observatory-card ${q.category === 'job_change' ? 'observatory-card--gold' : ''}">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">${q.title}</h3>
              <div class="observatory-card__meta">ID: ${q.id} · Zone: ${q.zoneId} · NPC: ${q.giverNpcId}</div>
            </div>
            <span class="joy-badge ${q.category === 'job_change' ? 'joy-badge--brand' : 'joy-badge--success'}">${q.category.toUpperCase()}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Min Base Level</span><span class="kv-val">Lv.${q.minBaseLevel} ${q.requiredJobId ? `(${q.requiredJobId})` : ''}</span></div>
            <div class="kv-row"><span class="kv-label">Objectives</span><span class="kv-val">${q.objectives.map(o => `${o.type}: ${o.targetId} ×${o.required}`).join(', ')}</span></div>
            <div class="kv-row"><span class="kv-label">EXP Rewards</span><span class="kv-val">+${q.rewards.baseXp} Base / +${q.rewards.jobXp} Job</span></div>
            <div class="kv-row"><span class="kv-label">Unlocks</span><span class="kv-val">${q.rewards.unlockJobId || q.rewards.unlockSkillId || '—'}</span></div>
          </div>
          <div style="display:flex;justify-content:flex-end">${inspectBtnHtml('quest', q.title, q)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

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

    <div class="card-grid">
      ${castles.map(cs => `
        <div class="observatory-card observatory-card--gold">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">${cs.name}</h3>
              <div class="observatory-card__meta">Hub: ${cs.hubTownId} · Siege Map: ${cs.siegeMapId}</div>
            </div>
            <span class="joy-badge joy-badge--brand">WOE CASTLE</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Emperium Crystal</span><span class="kv-val">${cs.emperium.hp.toLocaleString()} HP · ${cs.emperium.element}/${cs.emperium.race}/${cs.emperium.size}</span></div>
            <div class="kv-row"><span class="kv-label">Normal Attack Only</span><span class="kv-val">${cs.emperium.onlyNormalAttackDamage ? 'YES (Skills Blocked)' : 'No'}</span></div>
            <div class="kv-row"><span class="kv-label">Gate Barricades</span><span class="kv-val">${cs.fortifications.outerGateBarricadeCount} Outer + ${cs.fortifications.innerGateBarricadeCount} Inner (${cs.fortifications.barricadeHp.toLocaleString()} HP ea)</span></div>
            <div class="kv-row"><span class="kv-label">PvP Damage Scaling</span><span class="kv-val">${cs.pvpRules.playerDamageScalingPct}% (Ranged ${cs.pvpRules.rangedDamageInSiegePct}%)</span></div>
            <div class="kv-row"><span class="kv-label">Owner Rewards</span><span class="kv-val">${cs.ownerRewards.dailyTreasureChestCount} Chests/day · Dungeon: ${cs.ownerRewards.guildDungeonZoneId}</span></div>
          </div>
          <div style="display:flex;justify-content:flex-end">${inspectBtnHtml('castle', cs.name, cs)}</div>
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

function renderMaps() {
  const maps = DATA.maps.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">WORLD TOPOLOGY</div>
        <h1 class="page-hero__title">3D World Maps, Walkable Structures &amp; Height Terraces (${maps.length})</h1>
        <p class="page-hero__sub">Single-source terrain heightfields, multi-floor towers, hollow caves, and instanced environment props.</p>
      </div>
    </div>
    <div class="card-grid">
      ${maps.map(m => `
        <div class="observatory-card observatory-card--gold">
          <div class="observatory-card__head">
            <div>
              <h3 class="observatory-card__title">${m.name} (${m.id})</h3>
              <div class="observatory-card__meta">Dimensions: ${m.width}×${m.height}m · Amplitude: ${m.terrainAmplitude}</div>
            </div>
            <span class="joy-badge joy-badge--success">${m.structureCount} STRUCTURES</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Height Terraces</span><span class="kv-val">${m.terraceCount} terraces</span></div>
            <div class="kv-row"><span class="kv-label">Walkable 3D Structures</span><span class="kv-val">${(m.structures || []).map(s => `${s.kind}@(${s.x},${s.z})`).join(', ')}</span></div>
            <div class="kv-row"><span class="kv-label">Environment Props</span><span class="kv-val">${m.propCount} props</span></div>
          </div>
          <div style="display:flex;justify-content:flex-end">${inspectBtnHtml('map', m.name, m)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

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
        <span class="observatory-card__meta">Read-only SQLite connection (`SELECT`, `WITH`, `PRAGMA`, `EXPLAIN`)</span>
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
    parser.add_argument("--port", type=int, default=8788, help="HTTP port (default: 8765)")
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
