#!/usr/bin/env python3
"""
Atlas World — MMORPG Catalog & Balance Observatory Web Studio (scripts/catalog_explorer_web.py)

Zero-dependency local HTTP + SQLite + JSONB Web Observatory for exploring, reviewing,
searching, and running SQL queries across the entire Atlas World MMORPG catalog:
  - Full-Text Global Search across Jobs, Mobs, Cards, Items, Quests, Handbook, Castles, and Maps
  - Interactive Job Tree & Promotion Trial Explorer
  - Mob Bestiary, Drop Table & EXP/HP Economy Inspector
  - 10-Element Counter Matrix & Weapon-vs-Size Heatmap
  - Equipment, Refine (+0..+15 Pity), Cards & Adventurer Handbook Passive Calculator
  - War of Emperium (GvG Castle Siege) Breach & TTK Calculator
  - Read-Only Live SQLite Query Console against build/catalog.sqlite
  - Spec & Canon Markdown Reviewer (docs/superpowers/specs/*.md, content/story/canon.md)

Usage:
  python3 scripts/catalog_explorer_web.py [--port 8765]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
BUILD_SCRIPT = ROOT / "scripts" / "build_catalog_db.py"
DB_PATH = ROOT / "build" / "catalog.sqlite"
CONTENT_DIR = ROOT / "contracts" / "content"
MAPS_DIR = ROOT / "content" / "maps"
SPECS_DIR = ROOT / "docs" / "superpowers" / "specs"
CANON_PATH = ROOT / "content" / "story" / "canon.md"


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


INDEX_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Atlas World — MMORPG Catalog &amp; Balance Observatory</title>
<style>
  :root {
    --bg: #070b14;
    --panel: #0f172a;
    --panel-2: #131e36;
    --border: #1e293b;
    --accent: #38bdf8;
    --gold: #fbbf24;
    --emerald: #34d399;
    --rose: #fb7185;
    --purple: #a78bfa;
    --text: #f1f5f9;
    --muted: #94a3b8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    background: linear-gradient(90deg, #0b1324 0%, #111c35 100%);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-badge {
    background: rgba(251, 191, 36, 0.16);
    border: 1px solid rgba(251, 191, 36, 0.45);
    color: var(--gold);
    font-weight: 700;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 999px;
    letter-spacing: 0.06em;
  }
  .brand h1 {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
  }
  .search-wrap {
    flex: 1;
    max-width: 520px;
    position: relative;
  }
  .search-input {
    width: 100%;
    background: #070c18;
    border: 1px solid #283652;
    color: #fff;
    padding: 9px 14px;
    border-radius: 10px;
    font-size: 13.5px;
    outline: none;
  }
  .search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }
  .top-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .btn {
    background: #17233d;
    color: #e2e8f0;
    border: 1px solid #2b3b5c;
    padding: 7px 13px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn:hover { background: #1f3052; border-color: var(--accent); color: #fff; }
  .btn-gold {
    background: rgba(251, 191, 36, 0.16);
    color: var(--gold);
    border-color: rgba(251, 191, 36, 0.45);
  }
  .layout {
    display: grid;
    grid-template-columns: 230px 1fr;
    flex: 1;
  }
  nav {
    background: #0a101f;
    border-right: 1px solid var(--border);
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .nav-btn {
    text-align: left;
    background: transparent;
    color: var(--muted);
    border: 1px solid transparent;
    padding: 10px 12px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .nav-btn:hover { color: #fff; background: rgba(255,255,255,0.03); }
  .nav-btn.active {
    background: rgba(56, 189, 248, 0.14);
    color: var(--accent);
    border-color: rgba(56, 189, 248, 0.35);
  }
  .nav-count {
    font-size: 11px;
    background: #162038;
    color: #cbd5e1;
    padding: 2px 7px;
    border-radius: 99px;
  }
  main {
    padding: 22px 26px;
    overflow-y: auto;
  }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .kpi {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
  }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .kpi-val { font-size: 22px; font-weight: 800; color: #fff; margin-top: 4px; }
  .kpi-sub { font-size: 11.5px; color: var(--emerald); margin-top: 2px; }
  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 12px;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .grid-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 14px;
    margin-bottom: 22px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .card-title { font-size: 15px; font-weight: 700; color: #fff; }
  .card-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .pill {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 99px;
    background: rgba(56, 189, 248, 0.15);
    color: var(--accent);
    border: 1px solid rgba(56, 189, 248, 0.35);
  }
  .pill-gold {
    background: rgba(251, 191, 36, 0.15);
    color: var(--gold);
    border-color: rgba(251, 191, 36, 0.4);
  }
  .pill-rose {
    background: rgba(251, 113, 133, 0.15);
    color: var(--rose);
    border-color: rgba(251, 113, 133, 0.4);
  }
  .pill-emerald {
    background: rgba(52, 211, 153, 0.15);
    color: var(--emerald);
    border-color: rgba(52, 211, 153, 0.4);
  }
  .kv-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
    color: #cbd5e1;
    margin-top: 8px;
  }
  .kv-row {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px dashed rgba(148, 163, 184, 0.14);
    padding-bottom: 4px;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: #fcd34d;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    font-size: 12.5px;
    margin-bottom: 22px;
  }
  th, td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
  th {
    background: #131d33;
    color: #93c5fd;
    font-weight: 700;
    font-size: 11.5px;
    text-transform: uppercase;
  }
  tr:hover td { background: rgba(255,255,255,0.02); }
  .sql-box {
    width: 100%;
    min-height: 92px;
    background: #060a12;
    color: #fcd34d;
    border: 1px solid #283652;
    border-radius: 10px;
    padding: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .doc-viewer {
    background: #0a101d;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    color: #e2e8f0;
    max-height: 620px;
    overflow-y: auto;
  }
  .sim-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    background: var(--panel-2);
    border: 1px solid var(--border);
    padding: 14px;
    border-radius: 12px;
    margin-bottom: 16px;
  }
  .sim-controls label {
    font-size: 12.5px;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sim-controls select, .sim-controls input {
    background: #080d19;
    color: #fff;
    border: 1px solid #2b3b5c;
    padding: 6px 10px;
    border-radius: 7px;
    font-size: 12.5px;
  }
</style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="brand-badge">3-TIER OBSERVATORY</span>
      <h1>Atlas World — MMORPG Catalog, Balance &amp; SQLite Explorer</h1>
    </div>
    <div class="search-wrap">
      <input id="globalSearch" class="search-input" type="text" placeholder="Search any Job, Mob, Card, Skill, Item, Quest, Castle, or Asset Key..." />
    </div>
    <div class="top-actions">
      <button class="btn btn-gold" onclick="rebuildDb()">⟳ Rebuild SQLite DB</button>
      <button class="btn" onclick="switchTab('sql')">SQL Console</button>
    </div>
  </header>

  <div class="layout">
    <nav id="navRail">
      <button class="nav-btn active" data-tab="overview" onclick="switchTab('overview')">
        <span>◈ Overview &amp; Search</span><span class="nav-count" id="cnt-all">0</span>
      </button>
      <button class="nav-btn" data-tab="jobs" onclick="switchTab('jobs')">
        <span>⚔ Jobs &amp; Skills</span><span class="nav-count" id="cnt-jobs">0</span>
      </button>
      <button class="nav-btn" data-tab="mobs" onclick="switchTab('mobs')">
        <span>☠ Bestiary &amp; Drops</span><span class="nav-count" id="cnt-mobs">0</span>
      </button>
      <button class="nav-btn" data-tab="elements" onclick="switchTab('elements')">
        <span>✦ 10-Element &amp; Size</span><span class="nav-count">10×10</span>
      </button>
      <button class="nav-btn" data-tab="cards" onclick="switchTab('cards')">
        <span>🃏 Cards &amp; Handbook</span><span class="nav-count" id="cnt-cards">0</span>
      </button>
      <button class="nav-btn" data-tab="quests" onclick="switchTab('quests')">
        <span>📜 Quest Board</span><span class="nav-count" id="cnt-quests">0</span>
      </button>
      <button class="nav-btn" data-tab="siege" onclick="switchTab('siege')">
        <span>🏰 WoE Castle Siege</span><span class="nav-count" id="cnt-castles">0</span>
      </button>
      <button class="nav-btn" data-tab="maps" onclick="switchTab('maps')">
        <span>🗺 3D Maps &amp; Slabs</span><span class="nav-count" id="cnt-maps">0</span>
      </button>
      <button class="nav-btn" data-tab="sql" onclick="switchTab('sql')">
        <span>⌕ SQLite Query Studio</span><span class="nav-count">SQL</span>
      </button>
      <button class="nav-btn" data-tab="docs" onclick="switchTab('docs')">
        <span>📖 Specs &amp; Lore Canon</span><span class="nav-count" id="cnt-docs">0</span>
      </button>
    </nav>

    <main id="mainContent">
      Loading catalog bundle...
    </main>
  </div>

<script>
let DATA = null;
let ACTIVE_TAB = 'overview';
let SEARCH_QUERY = '';
let SELECTED_DOC_IDX = 0;

async function init() {
  const res = await fetch('/api/bundle');
  DATA = await res.json();
  updateCounts();
  render();
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    SEARCH_QUERY = e.target.value.trim().toLowerCase();
    render();
  });
}

function updateCounts() {
  if (!DATA) return;
  const total = (DATA.jobs?.length || 0) + (DATA.mobs?.length || 0) + (DATA.cards?.length || 0) +
                (DATA.items?.length || 0) + (DATA.quests?.length || 0) + (DATA.castles?.length || 0);
  document.getElementById('cnt-all').textContent = total;
  document.getElementById('cnt-jobs').textContent = DATA.jobs?.length || 0;
  document.getElementById('cnt-mobs').textContent = DATA.mobs?.length || 0;
  document.getElementById('cnt-cards').textContent = (DATA.cards?.length || 0) + (DATA.handbook?.length || 0);
  document.getElementById('cnt-quests').textContent = DATA.quests?.length || 0;
  document.getElementById('cnt-castles').textContent = DATA.castles?.length || 0;
  document.getElementById('cnt-maps').textContent = DATA.maps?.length || 0;
  document.getElementById('cnt-docs').textContent = DATA.docs?.length || 0;
}

function switchTab(tab) {
  ACTIVE_TAB = tab;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  render();
}

function matchesSearch(obj) {
  if (!SEARCH_QUERY) return true;
  return JSON.stringify(obj).toLowerCase().includes(SEARCH_QUERY);
}

async function rebuildDb() {
  const res = await fetch('/api/rebuild', { method: 'POST' });
  const out = await res.json();
  await init();
  alert(out.message || 'Rebuilt build/catalog.sqlite');
}

function render() {
  const main = document.getElementById('mainContent');
  if (!DATA) return;

  if (ACTIVE_TAB === 'overview') {
    main.innerHTML = renderOverview();
  } else if (ACTIVE_TAB === 'jobs') {
    main.innerHTML = renderJobs();
  } else if (ACTIVE_TAB === 'mobs') {
    main.innerHTML = renderMobs();
  } else if (ACTIVE_TAB === 'elements') {
    main.innerHTML = renderElements();
  } else if (ACTIVE_TAB === 'cards') {
    main.innerHTML = renderCardsAndHandbook();
  } else if (ACTIVE_TAB === 'quests') {
    main.innerHTML = renderQuests();
  } else if (ACTIVE_TAB === 'siege') {
    main.innerHTML = renderSiege();
  } else if (ACTIVE_TAB === 'maps') {
    main.innerHTML = renderMaps();
  } else if (ACTIVE_TAB === 'sql') {
    main.innerHTML = renderSqlStudio();
    runSqlPreset("SELECT * FROM v_mob_economy;");
  } else if (ACTIVE_TAB === 'docs') {
    main.innerHTML = renderDocs();
  }
}

function renderOverview() {
  const c = DATA.summary?.counts || {};
  const assetEntries = (DATA.summary?.assetStudioEntries || []).filter(matchesSearch);

  let searchResultsHtml = '';
  if (SEARCH_QUERY) {
    const matchedJobs = DATA.jobs.filter(matchesSearch);
    const matchedMobs = DATA.mobs.filter(matchesSearch);
    const matchedCards = DATA.cards.filter(matchesSearch);
    const matchedQuests = DATA.quests.filter(matchesSearch);
    const matchedItems = DATA.items.filter(matchesSearch);
    searchResultsHtml = `
      <div class="section-title">Global Search Matches for "${SEARCH_QUERY}"</div>
      <div class="grid-cards">
        ${matchedJobs.map(j => `<div class="card"><div class="card-head"><div><div class="card-title">${j.name}</div><div class="card-sub">Job (${j.id}) · Tier ${j.tier}</div></div><span class="pill">Job</span></div><div class="mono">${j.assetStudioKey}</div></div>`).join('')}
        ${matchedMobs.map(m => `<div class="card"><div class="card-head"><div><div class="card-title">Lv.${m.level} ${m.name}</div><div class="card-sub">${m.element} · ${m.race} · ${m.size}</div></div><span class="pill ${m.isMvp ? 'pill-gold' : 'pill-rose'}">${m.isMvp ? 'MVP Boss' : 'Mob'}</span></div><div class="mono">HP ${m.hp.toLocaleString()} · Card: ${m.cardId || 'None'}</div></div>`).join('')}
        ${matchedCards.map(cd => `<div class="card"><div class="card-head"><div><div class="card-title">${cd.name}</div><div class="card-sub">Slot: ${cd.slot} · Mob: ${cd.mobId}</div></div><span class="pill pill-gold">Card</span></div><div class="mono">${JSON.stringify(cd.equipStats)}</div></div>`).join('')}
        ${matchedQuests.map(q => `<div class="card"><div class="card-head"><div><div class="card-title">${q.title}</div><div class="card-sub">${q.category} · Zone: ${q.zoneId}</div></div><span class="pill pill-emerald">Quest</span></div><div class="mono">+${q.rewards.baseXp} BaseEXP / +${q.rewards.jobXp} JobEXP</div></div>`).join('')}
        ${matchedItems.map(it => `<div class="card"><div class="card-head"><div><div class="card-title">${it.name}</div><div class="card-sub">${it.kind} (${it.id})</div></div><span class="pill">Item</span></div><div class="mono">P.ATK ${it.pAtk || 0} · M.ATK ${it.mAtk || 0}</div></div>`).join('')}
      </div>
    `;
  }

  return `
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Job Classes</div><div class="kpi-val">${c.jobs || 0}</div><div class="kpi-sub">Tier 0 → Tier 1 → Tier 2</div></div>
      <div class="kpi"><div class="kpi-label">Monsters &amp; MVPs</div><div class="kpi-val">${c.mobs || 0}</div><div class="kpi-sub">10-Element &amp; Size Indexed</div></div>
      <div class="kpi"><div class="kpi-label">Monster Cards</div><div class="kpi-val">${c.cards || 0}</div><div class="kpi-sub">Equip + Handbook Deposit</div></div>
      <div class="kpi"><div class="kpi-label">Quest Board</div><div class="kpi-val">${c.questBoard || 0}</div><div class="kpi-sub">Main / Job / Side / Bounty</div></div>
      <div class="kpi"><div class="kpi-label">GvG Castles (WoE)</div><div class="kpi-val">${c.castles || 0}</div><div class="kpi-sub">Kriemhild (120k Emperium)</div></div>
      <div class="kpi"><div class="kpi-label">3D World Maps</div><div class="kpi-val">${c.maps || 0}</div><div class="kpi-sub">Multi-Floor Slabs &amp; Caves</div></div>
    </div>
    ${searchResultsHtml}
    <div class="section-title">
      <span>Cross-Repo Asset Studio Binding Index (v_asset_studio_entries)</span>
      <span class="mono">${assetEntries.length} entries</span>
    </div>
    <table>
      <thead>
        <tr><th>Asset Studio Entry Key</th><th>Domain</th><th>Catalog ID</th><th>Display Name</th></tr>
      </thead>
      <tbody>
        ${assetEntries.map(e => `
          <tr>
            <td class="mono">${e.entryKey}</td>
            <td><span class="pill">${e.domain.toUpperCase()}</span></td>
            <td class="mono">${e.catalogId}</td>
            <td>${e.name}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderJobs() {
  const jobs = DATA.jobs.filter(matchesSearch);
  return `
    <div class="section-title">Job Class Hierarchy &amp; Promotion Trials (contracts/content/jobs.json)</div>
    <div class="grid-cards">
      ${jobs.map(j => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${j.name} <span class="mono">(${j.id})</span></div>
              <div class="card-sub">Tier ${j.tier} · Parent: ${j.parentJobId || 'Root'}</div>
            </div>
            <span class="pill ${j.tier === 2 ? 'pill-gold' : ''}">Tier ${j.tier}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span>Min Base Level</span><span class="mono">Lv.${j.minBaseLevel}</span></div>
            <div class="kv-row"><span>Max Job Level</span><span class="mono">Job Lv.${j.maxJobLevel}</span></div>
            <div class="kv-row"><span>Allowed Weapons</span><span class="mono">${j.allowedWeaponKinds.join(', ')}</span></div>
            <div class="kv-row"><span>Max Job Bonus</span><span class="mono">${Object.entries(j.jobBonusAtMax).filter(([k,v])=>v>0).map(([k,v])=>`${k.toUpperCase()}+${v}`).join(' ')}</span></div>
            <div class="kv-row"><span>Job Trial Quest</span><span class="mono">${j.jobChangeQuestId || 'None'}</span></div>
            <div class="kv-row"><span>Asset Studio Key</span><span class="mono">${j.assetStudioKey}</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMobs() {
  const mobs = DATA.mobs.filter(matchesSearch);
  return `
    <div class="section-title">Monster Bestiary, Drop Tables &amp; EXP/HP Efficiency (contracts/content/mobs.json)</div>
    <div class="grid-cards">
      ${mobs.map(m => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Lv.${m.level} ${m.name}</div>
              <div class="card-sub">${m.element} · ${m.race} · ${m.size} · Rank ${m.rank}</div>
            </div>
            <span class="pill ${m.isMvp ? 'pill-gold' : 'pill-rose'}">${m.isMvp ? '★ MVP BOSS' : 'Monster'}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span>HP / P.ATK / P.DEF</span><span class="mono">${m.hp.toLocaleString()} HP · ${m.pAtk} ATK · ${m.pDef} DEF</span></div>
            <div class="kv-row"><span>Base EXP / Job EXP</span><span class="mono">+${m.baseExp} Base / +${m.jobExp} Job (${(m.baseExp/m.hp).toFixed(2)} EXP/HP)</span></div>
            <div class="kv-row"><span>Aggro / Leash</span><span class="mono">${m.aggroRangeM}m / ${m.leashRangeM}m</span></div>
            <div class="kv-row"><span>Spawn Zones</span><span class="mono">${m.spawnZones.join(', ')}</span></div>
            <div class="kv-row"><span>Card Drop</span><span class="mono">${m.cardId || '—'}</span></div>
            <div class="kv-row"><span>Drops (bps)</span><span class="mono">${m.drops.map(d => `${d.itemId} (${(d.chanceBps/100).toFixed(2)}%)`).join(', ')}</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderElements() {
  const elems = DATA.elements?.elements || [];
  const matrix = DATA.elements?.damageMatrixPct || {};
  const sizeTable = DATA.elements?.weaponSizePenaltyPct || {};

  return `
    <div class="section-title">10-Element Counter Matrix (Attacker Row vs. Defender Column %)</div>
    <table>
      <thead>
        <tr>
          <th>ATK \\ DEF</th>
          ${elems.map(e => `<th>${e}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${elems.map(atk => `
          <tr>
            <td style="font-weight:700;color:#fff">${atk}</td>
            ${elems.map(def => {
              const val = (matrix[atk] && matrix[atk][def]) ?? 100;
              const col = val > 100 ? '#34d399' : (val < 100 ? '#fb7185' : '#94a3b8');
              return `<td class="mono" style="color:${col};font-weight:${val!==100?700:400}">${val}%</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-title">Weapon Kind vs. Monster Size Modifier (Small / Medium / Large %)</div>
    <table>
      <thead>
        <tr><th>Weapon Kind</th><th>Small</th><th>Medium</th><th>Large</th></tr>
      </thead>
      <tbody>
        ${Object.entries(sizeTable).map(([wpn, row]) => `
          <tr>
            <td class="mono">${wpn}</td>
            <td class="mono">${row.Small}%</td>
            <td class="mono">${row.Medium}%</td>
            <td class="mono">${row.Large}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCardsAndHandbook() {
  const cards = DATA.cards.filter(matchesSearch);
  const hb = DATA.handbook.filter(matchesSearch);
  return `
    <div class="section-title">Monster Cards — Socket Bonus vs. Permanent Handbook Deposit (contracts/content/cards.json)</div>
    <div class="grid-cards">
      ${cards.map(c => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${c.name}</div>
              <div class="card-sub">Equip Slot: ${c.slot.toUpperCase()} · Source Mob: ${c.mobId}</div>
            </div>
            <span class="pill pill-gold">Card</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span>Socketed Bonus</span><span class="mono">${JSON.stringify(c.equipStats)}</span></div>
            <div class="kv-row"><span>Handbook Deposit</span><span class="mono">${JSON.stringify(c.handbookDepositStats)}</span></div>
            <div class="kv-row"><span>Asset Studio Key</span><span class="mono">${c.assetStudioKey}</span></div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section-title">Adventurer Handbook Milestones (contracts/content/handbook.json)</div>
    <div class="grid-cards">
      ${hb.map(h => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${h.title}</div>
              <div class="card-sub">Category: ${h.category} · Target: ${h.targetId}</div>
            </div>
            <span class="pill pill-emerald">${h.tiers.length} Tiers</span>
          </div>
          <div class="kv-list">
            ${h.tiers.map(t => `
              <div class="kv-row">
                <span>≥ ${t.requiredCount}: ${t.unlockNote}</span>
                <span class="mono">${t.bonusStat} +${t.bonusValue}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderQuests() {
  const quests = DATA.quests.filter(matchesSearch);
  return `
    <div class="section-title">Unified 6-Category Quest Board (contracts/content/quest_board.json)</div>
    <div class="grid-cards">
      ${quests.map(q => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${q.title}</div>
              <div class="card-sub">ID: ${q.id} · Zone: ${q.zoneId} · NPC: ${q.giverNpcId}</div>
            </div>
            <span class="pill ${q.category === 'job_change' ? 'pill-gold' : 'pill-emerald'}">${q.category}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span>Min Base Level</span><span class="mono">Lv.${q.minBaseLevel} ${q.requiredJobId ? `(${q.requiredJobId})` : ''}</span></div>
            <div class="kv-row"><span>Objectives</span><span class="mono">${q.objectives.map(o => `${o.type}: ${o.targetId} x${o.required}`).join(', ')}</span></div>
            <div class="kv-row"><span>EXP Rewards</span><span class="mono">+${q.rewards.baseXp} Base / +${q.rewards.jobXp} Job</span></div>
            <div class="kv-row"><span>Unlocks</span><span class="mono">${q.rewards.unlockJobId || q.rewards.unlockSkillId || '—'}</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSiege() {
  const castles = DATA.castles.filter(matchesSearch);
  const c = castles[0] || DATA.castles[0];
  return `
    <div class="section-title">War of Emperium (GvG Castle Siege) — Interactive Breach Simulator</div>
    <div class="sim-controls">
      <label>Attackers:
        <input id="simAttackers" type="number" value="15" min="1" max="50" oninput="updateSiegeCalc()" />
      </label>
      <label>Avg Normal-Attack DPS / Player:
        <input id="simDps" type="number" value="620" min="50" max="5000" step="50" oninput="updateSiegeCalc()" />
      </label>
      <span id="siegeSimResult" class="mono"></span>
    </div>
    <div class="grid-cards">
      ${castles.map(cs => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${cs.name}</div>
              <div class="card-sub">Hub: ${cs.hubTownId} · Siege Map: ${cs.siegeMapId}</div>
            </div>
            <span class="pill pill-gold">WoE Castle</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span>Emperium Crystal</span><span class="mono">${cs.emperium.hp.toLocaleString()} HP · ${cs.emperium.element}/${cs.emperium.race}/${cs.emperium.size}</span></div>
            <div class="kv-row"><span>Normal Attack Only</span><span class="mono">${cs.emperium.onlyNormalAttackDamage ? 'YES (Skills Blocked)' : 'No'}</span></div>
            <div class="kv-row"><span>Gate Barricades</span><span class="mono">${cs.fortifications.outerGateBarricadeCount} Outer + ${cs.fortifications.innerGateBarricadeCount} Inner (${cs.fortifications.barricadeHp.toLocaleString()} HP ea)</span></div>
            <div class="kv-row"><span>PvP Damage Scaling</span><span class="mono">${cs.pvpRules.playerDamageScalingPct}% (Ranged ${cs.pvpRules.rangedDamageInSiegePct}%)</span></div>
            <div class="kv-row"><span>Guild Rewards</span><span class="mono">${cs.ownerRewards.dailyTreasureChestCount} Chests/day · Dungeon: ${cs.ownerRewards.guildDungeonZoneId}</span></div>
          </div>
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
    el.textContent = `Barricades (180k HP): ${barSec.toFixed(1)}s | Emperium (120k HP): ${empSec.toFixed(1)}s | Total Siege Breach: ${totalMin.toFixed(2)} min`;
  }
}

function renderMaps() {
  const maps = DATA.maps.filter(matchesSearch);
  return `
    <div class="section-title">3D World Maps, Walkable Multi-Floor Structures &amp; Height Terraces</div>
    <div class="grid-cards">
      ${maps.map(m => `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${m.name} <span class="mono">(${m.id})</span></div>
              <div class="card-sub">Dimensions: ${m.width}×${m.height} · Amplitude: ${m.terrainAmplitude}</div>
            </div>
            <span class="pill pill-emerald">${m.structureCount} Structures</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span>Height Terraces</span><span class="mono">${m.terraceCount} terraces</span></div>
            <div class="kv-row"><span>3D Structures</span><span class="mono">${(m.structures || []).map(s => `${s.kind}@(${s.x},${s.z})`).join(', ')}</span></div>
            <div class="kv-row"><span>Environment Props</span><span class="mono">${m.propCount} props</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSqlStudio() {
  return `
    <div class="section-title">Live Read-Only SQLite Query Studio (build/catalog.sqlite)</div>
    <div class="preset-row">
      <button class="btn" onclick="runSqlPreset('SELECT * FROM v_job_progression;')">v_job_progression</button>
      <button class="btn" onclick="runSqlPreset('SELECT * FROM v_mob_economy;')">v_mob_economy</button>
      <button class="btn" onclick="runSqlPreset('SELECT * FROM v_asset_studio_entries;')">v_asset_studio_entries</button>
      <button class="btn" onclick="runSqlPreset('SELECT m.name AS mob, i.name AS item, d.chance_bps/100.0 AS drop_pct FROM mob_drops d JOIN mobs m ON m.id=d.mob_id JOIN items i ON i.id=d.item_id ORDER BY m.level, drop_pct DESC;')">Mob Drop Rates</button>
      <button class="btn" onclick="runSqlPreset('SELECT id, title, category, min_base_level, base_xp, job_xp, unlock_job_id FROM quest_board ORDER BY min_base_level;')">Quest Board Progression</button>
      <button class="btn" onclick="runSqlPreset('SELECT id, name, emperium_hp, barricade_hp, player_damage_scaling_pct, guild_dungeon_zone_id FROM castles;')">WoE Castles</button>
    </div>
    <textarea id="sqlInput" class="sql-box">SELECT * FROM v_mob_economy;</textarea>
    <div style="margin-bottom:14px">
      <button class="btn btn-gold" onclick="executeSql()">▶ Run SQL Query</button>
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
    out.innerHTML = `<div class="card" style="border-color:var(--rose);color:var(--rose)">SQL Error: ${data.error}</div>`;
    return;
  }
  out.innerHTML = `
    <table>
      <thead>
        <tr>${data.columns.map(c => `<th>${c}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${data.rows.map(r => `<tr>${r.map(v => `<td class="mono">${v === null ? 'NULL' : v}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function renderDocs() {
  const docs = DATA.docs || [];
  const active = docs[SELECTED_DOC_IDX] || docs[0];
  return `
    <div class="section-title">Architecture Specs &amp; World Lore Canon Reviewer</div>
    <div class="preset-row">
      ${docs.map((d, i) => `
        <button class="btn ${i === SELECTED_DOC_IDX ? 'btn-gold' : ''}" onclick="SELECTED_DOC_IDX=${i};render()">
          ${d.id}
        </button>
      `).join('')}
    </div>
    ${active ? `<div class="doc-viewer">${escapeHtml(active.content)}</div>` : ''}
  `;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
        self._send_json({"ok": False, "error": "Not found"}, status=404)


def main() -> int:
    parser = argparse.ArgumentParser(description="Atlas World MMORPG Catalog & Balance Observatory Web Studio")
    parser.add_argument("--port", type=int, default=8765, help="HTTP port (default: 8765)")
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
    server = HTTPServer(("127.0.0.1", args.port), ObservatoryHandler)
    print(f"[catalog_explorer_web] Atlas World Observatory listening on http://127.0.0.1:{args.port}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
