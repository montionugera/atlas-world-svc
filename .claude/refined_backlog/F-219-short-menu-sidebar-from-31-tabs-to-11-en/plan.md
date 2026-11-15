# Short menu (game DB slice S2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The explorer sidebar shows 11 plain entries instead of 31 tabs; the old tabs become sub-view pills; a Home page shows record counts by kind.

**Architecture:** `NAV_GROUPS` (the one table the sidebar, the panel gate and the record page already read) is regrouped into 11 groups: a group is a sidebar entry, its items are that entry's pills. Tab ids do not change, so every old `?tab=<id>` link keeps opening the same content with no redirect code; only removed or unknown ids are sent to Home. Home is one new tab id (`home`) fed by one new read-only route, `GET /api/record-counts`.

**Tech Stack:** Python 3 stdlib HTTP server (`scripts/atlas_world_web/`), vanilla JS frontend slices concatenated by `frontend_loader.py`, SQLite, `node --test`, headless-Chrome probes in `scripts/probes/`.

**Spec:** `.claude/refined_backlog/F-219-short-menu-sidebar-from-31-tabs-to-11-en/spec.md` (restates slice S2 of the owner-approved `.claude/refined_backlog/F-216-game-db-from-the-studio-world-slim-catal/spec.md`).

## Global Constraints

- Entry labels, exact and in this order: `Home`, `World`, `Monsters`, `Items and cards`, `Jobs and skills`, `Quests and dungeons`, `Lore and canon`, `Art`, `Assets and audio`, `Tools`, `Archive (old concept)`. No emoji, no "(", no "_db", no "Step".
- Tab ids are unchanged. Removed ids: `sim`, `overview`. New id: `home`. The default tab when the URL has no `tab` stays `studio` (not asked to change; one line to flip later).
- Every item line in `NAV_GROUPS` keeps the shape `      { id: '<id>', label: '<label>'` at the start of its own line and keeps `panel: true` on the same line: `atelier/atlas-world-panels/tests/panel-parity.test.mjs:50-58` parses it with a regex.
- The search input keeps the id `globalSearch`; the Studio command bar (`#atlasOmniSearchInput`) is not touched; view pills keep `data-subview="<view>"` and `setSubView()`.
- User-facing strings that must stay exact: `Open in <entry label>`, `Search every record`, and the S1 strings in the F-216 plan "Global Constraints".
- Styling comes from `design-brief.md` in this feature folder (Task 0). Only `var(--joy-*)` tokens, no new colour literals.
- Do not run `prettier --write` on `scripts/atlas_world_web/frontend/*.js` or `*.html` (they are not formatter-clean; a full reformat breaks source-text tests). Keep edits surgical.
- `rtk` filters `node --test` output: run `rtk proxy node --test ... > <file> 2>&1` and read `grep -E "^ℹ (pass|fail)" <file>`.
- One browser run at a time (the machine is short on memory). Commit per task, new commits only, never amend.
- Out of this slice (recorded in the spec): removing the concept-art gallery's own search box; "legacy world data" under Archive (slice S3).

Batch: 1,2

---

### Task 0: Design brief (controller, not a worker)

**Files:**
- Create: `.claude/refined_backlog/F-219-short-menu-sidebar-from-31-tabs-to-11-en/design-brief.md`

- [ ] **Step 1:** The controller loads `impeccable` (shape), reads `docs/PRODUCT.md` and the S1 brief (`.claude/refined_backlog/F-216-game-db-from-the-studio-world-slim-catal/design-brief.md`), and writes `design-brief.md` with exact CSS for: (a) the 11-row sidebar (`.nav-item`, no count chips, no section headings), (b) the pills row (`.subview-bar`, `.subview-bar__sep`, sideways scroll at 720 px and below), (c) Home (`.home-page`, `.home-counts`, `.home-count`, `.home-count__n`, `.home-count__kind`, `.home-count__entry`), (d) the top bar overlap fix for spec A10 (measure `.topbar__start` / `.topbar__end` children at 1024, 1280 and 1440 px on `http://atlas-edit.joymify.local.com/` first; the long `Editable · <hostname>` chip is the cause).
- [ ] **Step 2:** Commit: `git add .claude/refined_backlog/F-219-*/design-brief.md && git commit -m "docs(F-219): design brief for the short menu and Home"`.

---

### Task 1: Home page and record counts

**Files:**
- Modify: `scripts/atlas_world_web/records.py` (add `counts()` after `search()`, before `record()`)
- Modify: `scripts/atlas_world_web/routes.py:129-160` (add `_record_counts`, one `ROUTES` row)
- Modify: `scripts/atlas_world_web/frontend/02c_records_search.js` (add `HOME_COUNTS`, `renderHome()`)
- Modify: `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js` (`:122-123` delete the two `SIM_*` lets; `:175` replace the `overview` item; `:202` delete the `sim` item; add `navGroupOf` / `normalizeTab` after `NAV_GROUPS`; `:226-227` `atlasSetParams`; `:396` `syncUrlState`; `:733` `switchTab`; `titleMap` `:810-839`; render dispatch `:859`, `:871`)
- Modify: `scripts/atlas_world_web/frontend/08_catalog_and_3d_modal_views.js` (delete `renderOverview()` at `:1349` and `renderSim()` at `:2719`, whole functions)
- Modify: `atelier/atlas-world-panels/js/panels/combat-lab.mjs` (remove `SIM_TAB` and the dead `sim` anchor)
- Modify: `scripts/atlas_world_web/frontend/01_shell_and_styles.html` (Home CSS from `design-brief.md`)
- Test: `scripts/tests/atlas-web-records.test.mjs`, `scripts/probes/atlas_records_probe.mjs`

**Interfaces:**
- Produces: `GET /api/record-counts` -> `{"ok": true, "counts": [{"kind": str, "n": int, "viewUrl": str}]}` (current concept only, largest first). JS globals `navGroupOf(tab) -> group | undefined`, `normalizeTab(tab) -> string`, `renderHome() -> string` (HTML). Task 2 relies on `navGroupOf` and `normalizeTab` exactly as written here.

- [ ] **Step 1: Write the failing server test.** Append to `scripts/tests/atlas-web-records.test.mjs`:

```js test:scripts/tests/atlas-web-records.test.mjs
test('F-219 A5 (API): /api/record-counts equals the records table, current concept only', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const q = spawnSync('python3', ['-c',
    "import sqlite3,sys,json; print(json.dumps(dict(sqlite3.connect(sys.argv[1]).execute(\"select kind, count(*) from records where concept != 'legacy' group by kind\").fetchall())))",
    DB], { encoding: 'utf8' });
  assert.equal(q.status, 0, q.stderr);
  const want = JSON.parse(q.stdout);
  const got = await get(srv, '/api/record-counts');
  assert.equal(got.status, 200);
  assert.equal(got.body.ok, true);
  assert.deepEqual(Object.fromEntries(got.body.counts.map((c) => [c.kind, c.n])), want);
  for (const kind of ['continent', 'district', 'node']) assert.ok(want[kind] > 0, `${kind} has records`);
  const district = got.body.counts.find((c) => c.kind === 'district');
  assert.match(district.viewUrl, /[?&]tab=studio(&|$)/, 'the sample link names the tab that holds the kind');
  const ns = got.body.counts.map((c) => c.n);
  assert.deepEqual(ns, [...ns].sort((a, b) => b - a), 'largest first');
});
```

Verify-Cmd: cd scripts && node --test tests/atlas-web-records.test.mjs

- [ ] **Step 2: Run it, expect FAIL** (`/api/record-counts` answers 404, `got.status` is 404).

- [ ] **Step 3: Server.** In `scripts/atlas_world_web/records.py` add:

```python
def counts() -> list[dict]:
    """Records per kind for Home, current concept only. viewUrl is one sample link: it names the kind's tab."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT kind, count(*), max(view_url) FROM records WHERE concept != 'legacy' "
            "GROUP BY kind ORDER BY count(*) DESC, kind"
        ).fetchall()
    return [dict(zip(("kind", "n", "viewUrl"), row)) for row in rows]
```

In `scripts/atlas_world_web/routes.py`, after `_record`:

```python
def _record_counts(handler, path: str, *, head: bool = False) -> None:
    try:
        counts = records.counts()
    except sqlite3.Error as exc:
        _send_json(handler, {"ok": False, "error": f"Search is unavailable: {exc}"}, 503, head=head)
        return
    _send_json(handler, {"ok": True, "counts": counts}, head=head)
```

and in `ROUTES["GET"]`, directly after the `("/api/record", _record),` row: `("/api/record-counts", _record_counts),`.

- [ ] **Step 4: Run the server test, expect PASS.**

- [ ] **Step 5: Write the failing browser checks.** In `scripts/probes/atlas_records_probe.mjs`, directly before the line `await goto(c, \`${BASE}?r=district:nope\`);` add:

```js
    for (const gone of ['sim', 'overview', 'nope']) {
      await goto(c, `${BASE}?tab=${gone}`);
      ck(`F-219 A3 ${v.name}: ?tab=${gone} opens Home`, await c.eval(`CURRENT_TAB==='home' && !!document.getElementById('homePage')`), await c.eval('CURRENT_TAB'));
    }
    await waitFor(c, `!!document.querySelector('#homePage [data-kind="district"]')`, 8000);
    const wantCounts = await c.eval(`fetch('/api/record-counts').then(r=>r.json()).then(b=>Object.fromEntries(b.counts.map(x=>[x.kind,String(x.n)])))`);
    for (const kind of ['continent', 'district', 'node']) {
      ck(`F-219 A5 ${v.name}: Home shows the ${kind} count`,
        (await c.eval(`(document.querySelector('#homePage [data-kind="${kind}"] .home-count__n')||{textContent:''}).textContent.trim()`)) === wantCounts[kind], wantCounts[kind]);
    }
    await click(c, await rect(c, '#homePage [data-kind="district"]'), v.touch);
    await waitFor(c, `CURRENT_TAB==='studio'`, 8000);
    ck(`F-219 A5 ${v.name}: a real click on the district count opens its tab`, await c.eval(`CURRENT_TAB==='studio' && !document.getElementById('homePage')`));
```

- [ ] **Step 6: Run the probe, expect the new checks FAIL.**

```bash
python3 scripts/catalog_explorer_web.py --port 8791 > /tmp/f219-8791.log 2>&1 &
curl -s --retry 30 --retry-delay 1 --retry-connrefused -o /dev/null http://127.0.0.1:8791/
rtk proxy node scripts/probes/atlas_records_probe.mjs --url http://127.0.0.1:8791/ | grep -E "FAIL|assertions"
```

Expected: `FAIL F-219 A3 ...` lines (today `?tab=sim` renders the sim page and `CURRENT_TAB` stays `sim`). Restart this server (`pkill -f "catalog_explorer_web.py --port 8791"`, then the first two lines again) after every Python change; frontend files are read from disk per request.

- [ ] **Step 7: Frontend, tab table.** In `02_state_and_composable_layers.js`:
  - Delete the two lines `let SIM_OUTPUT = ...` and `let SIM_RUNNING = false;` (`:122-123`) after `grep -n "SIM_OUTPUT\|SIM_RUNNING" scripts/atlas_world_web/frontend/*.js` shows no reader outside `renderSim()`.
  - Replace the line `{ id: 'overview', label: '📊 Database Hub & Matrix', countKey: () => 9 },` with `{ id: 'home', label: 'Home', countKey: () => '' },` and delete the `{ id: 'sim', ...},` line.
  - Directly after the closing `];` of `NAV_GROUPS` add:

```js
function navGroupOf(tab) { return NAV_GROUPS.find(g => g.items.some(it => it.id === tab)); }
// Removed tab ids (sim, overview) and unknown ones land on Home.
function normalizeTab(tab) { return navGroupOf(tab) ? tab : 'home'; }
```

  - In `atlasSetParams(patch, opts)`, normalize `patch.tab`: `const nextTab = patch && patch.tab ? normalizeTab(String(patch.tab)) : ''; if (nextTab && nextTab !== CURRENT_TAB) { CURRENT_TAB = nextTab; ATLAS_PARAMS = {}; tabChanged = true; }`
  - `:396` `if (t) CURRENT_TAB = t;` becomes `if (t) CURRENT_TAB = normalizeTab(t); else if (!perspective && !CURRENT_RECORD) CURRENT_TAB = 'studio';`
  - In `switchTab(id)`, `CURRENT_TAB = id;` becomes `CURRENT_TAB = normalizeTab(id);` and the line above it becomes `if (normalizeTab(id) !== CURRENT_TAB) ATLAS_PARAMS = {};`
  - In `titleMap`: delete the `overview:` and `sim:` lines, add `home:     'Atlas World DB',`.
  - In the render dispatch: replace `else if (CURRENT_TAB === 'overview') main.innerHTML = renderOverview();` with `else if (CURRENT_TAB === 'home') main.innerHTML = renderHome();` and delete the `sim` line.
  - In `atelier/atlas-world-panels/js/panels/combat-lab.mjs`, delete `const SIM_TAB = "sim";` and the `const sim = ...` anchor so Combat Lab no longer links to the removed `sim` tab.
  - In `08_catalog_and_3d_modal_views.js` delete the whole functions `renderOverview()` and `renderSim()`. Then `grep -n "renderOverview\|renderSim\|rmsLink('sim'\|'overview'\|SIM_TAB" scripts/atlas_world_web/frontend/*.js atelier/atlas-world-panels/js/panels/*.mjs scripts/probes/*.py tests/*.py` must print nothing; a helper used only by the two deleted functions is deleted too, one used elsewhere stays.

- [ ] **Step 8: Frontend, Home.** In `02c_records_search.js`, after `recordEntryLabel`:

```js
let HOME_COUNTS;                   // undefined = not asked yet, null = loading, array = loaded (empty when the route failed)
function renderHome() {
  if (HOME_COUNTS === undefined) {
    HOME_COUNTS = null;
    fetch('/api/record-counts').then(r => r.json()).then(b => b.counts || [], () => [])
      .then(counts => { HOME_COUNTS = counts; if (CURRENT_TAB === 'home' && !CURRENT_RECORD) render(); });
  }
  const tiles = (HOME_COUNTS || []).map(c => {
    const tab = new URLSearchParams((c.viewUrl.split('?')[1] || '')).get('tab');
    const group = navGroupOf(tab);
    const inner = `<span class="home-count__n">${Number(c.n)}</span><span class="home-count__kind">${escapeHtml(c.kind.replace(/_/g, ' '))}</span>`;
    return group
      ? `<button type="button" class="home-count" data-kind="${escapeHtml(c.kind)}" onclick="switchTab('${group.items.find(it => it.id === tab).id}')">${inner}<span class="home-count__entry">${escapeHtml(group.section)}</span></button>`
      : `<div class="home-count" data-kind="${escapeHtml(c.kind)}">${inner}</div>`;
  }).join('');
  return `
    <article id="homePage" class="home-page">
      <h1>Atlas World DB</h1>
      <p><button type="button" class="joy-button joy-button--outline" onclick="document.getElementById('globalSearch').focus()">Search every record</button></p>
      <div class="home-counts" aria-busy="${HOME_COUNTS === null}">${HOME_COUNTS === null ? '<p role="status">...</p>' : tiles}</div>
    </article>`;
}
```

  (`group.section` is the entry label after Task 2; until then it is the old section heading, which the Task 1 checks do not read.) Add the Home CSS block from `design-brief.md` to `01_shell_and_styles.html` next to the `.record-page` rules.

- [ ] **Step 9: Run** the probe (Step 6 commands) and `cd scripts && rtk proxy node --test tests/catalog-records.test.mjs tests/atlas-web-records.test.mjs > /tmp/f219-t.out 2>&1; grep -E "^ℹ (pass|fail)" /tmp/f219-t.out`. Expected: probe all PASS, `ℹ fail 0`.

- [ ] **Step 10: Commit.** `git add scripts/atlas_world_web atelier/atlas-world-panels/js/panels/combat-lab.mjs scripts/tests/atlas-web-records.test.mjs scripts/probes/atlas_records_probe.mjs && git commit -m "feat(explorer): Home page with record counts; the sim page and the old overview go (F-219)"`

---

### Task 2: The 11-entry sidebar and the pills row

**Files:**
- Modify: `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js` (`NAV_GROUPS` whole table, `atlasPanelCount` delete, `renderSubViewBar`, `renderSidebar`, the `atlas-panels-updated` listener)
- Modify: `scripts/atlas_world_web/frontend/02c_records_search.js` (`recordEntryLabel`)
- Modify: `scripts/atlas_world_web/frontend/01_shell_and_styles.html` (sidebar, pills and top bar CSS from `design-brief.md`)
- Modify: `scripts/tests/e2e/atlas-upright-toggle.e2e.mjs:141,144` (nav label text)
- Modify: `scripts/tests/e2e/atlas-web-tabs.e2e.mjs:139` (`Tools` nav item + `map-builder` pill)
- Modify: `scripts/atlas_world_web/catalog_index.py:32` (comment only: tab ids live in `NAV_GROUPS` items)
- Modify: `README.md` (explorer section: the menu has 11 entries; Home; `GET /api/record-counts`)
- Test: `scripts/probes/atlas_records_probe.mjs`

**Interfaces:**
- Consumes: `navGroupOf(tab)`, `normalizeTab(tab)` from Task 1.
- Produces: sidebar rows `#sidebarNav .nav-item[data-entry="<first tab id>"]`, the open one with `aria-current="page"`; entry pills `#subViewBar [data-tab-pill="<tab id>"]` with `aria-pressed`.

- [ ] **Step 1: Write the failing browser checks.** In `scripts/probes/atlas_records_probe.mjs`, directly before the `for (const gone of ['sim', 'overview', 'nope'])` block from Task 1 add:

```js
    const LABELS = ['Home', 'World', 'Monsters', 'Items and cards', 'Jobs and skills', 'Quests and dungeons', 'Lore and canon', 'Art', 'Assets and audio', 'Tools', 'Archive (old concept)'];
    await goto(c, `${BASE}?tab=bestiary`);
    ck(`F-219 A1 ${v.name}: the sidebar has exactly the 11 entries`,
      JSON.stringify(await c.eval(`[...document.querySelectorAll('#sidebarNav .nav-item')].map(e=>e.textContent.trim())`)) === JSON.stringify(LABELS),
      await c.eval(`document.querySelectorAll('#sidebarNav .nav-item').length`));
    const open = `({entry:(document.querySelector('#sidebarNav .nav-item[aria-current="page"]')||{textContent:''}).textContent.trim(), pill:(document.querySelector('#subViewBar [data-tab-pill][aria-pressed="true"]')||{dataset:{}}).dataset.tabPill||'', view:(document.querySelector('#subViewBar [data-subview][aria-pressed="true"]')||{dataset:{}}).dataset.subview||''})`;
    let o = await c.eval(open);
    ck(`F-219 A2 ${v.name}: ?tab=bestiary opens Monsters with the bestiary pill`, o.entry === 'Monsters' && o.pill === 'bestiary', JSON.stringify(o));
    await goto(c, `${BASE}?tab=map-sheets`);
    o = await c.eval(open);
    ck(`F-219 A2 ${v.name}: ?tab=map-sheets opens World with the map-sheets pill`, o.entry === 'World' && o.pill === 'map-sheets', JSON.stringify(o));
    await goto(c, `${BASE}?tab=story&view=reader`);
    o = await c.eval(open);
    ck(`F-219 A2 ${v.name}: ?tab=story&view=reader opens Archive with the Reader pill`, o.entry === 'Archive (old concept)' && o.view === 'reader', JSON.stringify(o));

    // A4: every tab is reachable by a real click on an entry and then a pill, and shows something.
    await goto(c, `${BASE}?tab=home`);
    const tabs = await c.eval(`NAV_GROUPS.flatMap(g => g.items.map(it => ({ entry: g.items[0].id, id: it.id, solo: g.items.length === 1 })))`);
    const dead = [];
    for (const tb of tabs) {
      if (v.touch) { await click(c, await rect(c, '#mobileNavMenuBtn'), true); await settle(c); }
      await click(c, await rect(c, `#sidebarNav .nav-item[data-entry="${tb.entry}"]`), v.touch);
      await settle(c);
      if (!tb.solo) { await c.eval(`(()=>{document.querySelector('#subViewBar [data-tab-pill="${tb.id}"]').scrollIntoView({inline:'center',block:'nearest'}); 0})()`); await click(c, await rect(c, `#subViewBar [data-tab-pill="${tb.id}"]`), v.touch); await settle(c); }
      // panels mount after a module load, so wait instead of looking once
      try { await waitFor(c, `CURRENT_TAB==='${tb.id}' && ['mainContent','panelHost'].some(id => { const e = document.getElementById(id); return e && !e.hidden && e.getBoundingClientRect().height > 40 && e.textContent.trim().length > 0; })`, 8000); }
      catch { dead.push(tb.id); }
    }
    ck(`F-219 A4 ${v.name}: ${tabs.length} tabs reachable by entry click then pill click`, tabs.length === 29 && dead.length === 0, dead.join(','));

    if (v.touch) {
      await click(c, await rect(c, '#mobileNavMenuBtn'), true);
      await settle(c);
      const navH = await c.eval(`document.getElementById('sidebarNav').scrollHeight`);
      ck(`F-219 A8 ${v.name}: nav drawer shows all 11 entries within two screens`, navH <= 2 * v.h, String(navH));
      await click(c, await rect(c, '#sidebarNav .nav-item[data-entry="sql"]'), true);
      await settle(c);
      const pillBar = await c.eval(`(()=>{const b=document.getElementById('subViewBar'); const cs=getComputedStyle(b); const r=b.getBoundingClientRect(); return {wrap:cs.flexWrap, ox:cs.overflowX, h:r.height, sw:b.scrollWidth, cw:b.clientWidth};})()`);
      ck(`F-219 A8 ${v.name}: pills row scrolls sideways without wrapping`, pillBar.wrap === 'nowrap' && pillBar.h <= 60 && pillBar.sw > pillBar.cw, JSON.stringify(pillBar));
    }

    // A6: real click on "Open in World" from continent record opens World with studio pill selected.
    await goto(c, `${BASE}?r=continent:continent-01-hearthbloom-basin`);
    await waitFor(c, `!!document.getElementById('recordOpenLink')`, 20000);
    ck(`F-219 A6 ${v.name}: continent record shows "Open in World"`,
      (await c.eval(`document.getElementById('recordOpenLink').textContent.trim()`)) === 'Open in World');
    await click(c, await rect(c, '#recordOpenLink'), v.touch);
    await waitFor(c, `typeof DATA !== 'undefined' && !!DATA && CURRENT_TAB==='studio' && !document.getElementById('recordPage')`, 20000);
    await settle(c);
    o = await c.eval(open);
    ck(`F-219 A6 ${v.name}: clicking "Open in World" opens World with studio pill selected`, o.entry === 'World' && o.pill === 'studio', JSON.stringify(o));
```

  also in Task 1's A5 block, assert the active entry is `'World'` (`o = await c.eval(open); ck(\`F-219 A5 ${v.name}: clicking district count highlights World\`, o.entry === 'World' && o.pill === 'studio', JSON.stringify(o));`); change the existing R7 check so it reads the entry label: in the `ck(\`R7 ${v.name}: related records are grouped, with an "Open in" link\`` line replace `/^Open in /.test(` with `/^Open in World$/.test(`; and add a desktop A10 top-bar check across `1024`, `1280` and `1440` px (with `#topbarStatus` set to `'Editable · atlas-edit.joymify.local.com'`) asserting zero overlap between `.topbar__start` and `.topbar__end`, `#topbarStatus` untruncated, `#globalSearch` width `>= 200` at `1280` px, and single-row `.topbar` at `1280` and `1440` px.

- [ ] **Step 2: Run the probe (Task 1 Step 6 commands), expect the A1, A2, A4 and R7 checks FAIL** (the sidebar has 29 rows, there is no `data-tab-pill`).

- [ ] **Step 3: Replace the whole `NAV_GROUPS` table** (from `const NAV_GROUPS = [` through its `];`) with:

```js
// One sidebar entry per group; its items are that entry's sub-view pills. Tab ids are the old
// ones, so every old ?tab=<id> link still opens the same content (F-219).
const NAV_GROUPS = [
  { section: 'Home', items: [
      { id: 'home', label: 'Home' },
  ] },
  { section: 'World', items: [
      { id: 'studio', label: 'World studio' },
      { id: 'world', label: 'World map' },
      { id: 'maps', label: 'Map directory' },
      { id: 'map-sheets', label: 'Map sheets', panel: true },
  ] },
  { section: 'Monsters', items: [
      { id: 'mobs', label: 'Monsters' },
      { id: 'bestiary', label: 'Bestiary' },
  ] },
  { section: 'Items and cards', items: [
      { id: 'gear', label: 'Items and cards' },
  ] },
  { section: 'Jobs and skills', items: [
      { id: 'jobs', label: 'Jobs and skills' },
  ] },
  { section: 'Quests and dungeons', items: [
      { id: 'quests', label: 'Quests' },
      { id: 'dungeons', label: 'Dungeons' },
  ] },
  { section: 'Lore and canon', items: [
      { id: 'lore', label: 'Lore', panel: true },
      { id: 'races', label: 'Races' },
  ] },
  { section: 'Art', items: [
      { id: 'concept-arts', label: 'Concept art', panel: true },
      { id: 'art', label: 'Art library', panel: true },
  ] },
  { section: 'Assets and audio', items: [
      { id: 'assets', label: 'Assets', panel: true },
      { id: 'audio', label: 'Audio', panel: true },
      { id: 'coverage', label: 'Coverage', panel: true },
  ] },
  { section: 'Tools', items: [
      { id: 'sql', label: 'SQL' },
      { id: 'combat-lab', label: 'Combat lab', panel: true },
      { id: 'docs', label: 'Docs' },
      { id: 'elements', label: 'Elements' },
      { id: 'siege', label: 'Siege' },
      { id: 'enchant', label: 'Enchant' },
      { id: 'brushes', label: 'Brushes' },
      { id: 'map-builder', label: 'Map builder', panel: true },
      { id: 'forge', label: 'Art forge', panel: true },
      { id: 'review', label: 'Review inbox' },
  ] },
  { section: 'Archive (old concept)', items: [
      { id: 'story', label: 'Story' },
  ] },
];
```

  Delete `atlasPanelCount()` and its two comment lines (no reader is left: `grep -n "atlasPanelCount\|countKey" scripts/atlas_world_web/frontend/*.js` must print nothing), and delete the line `window.addEventListener('atlas-panels-updated', () => { if (DATA) renderSidebar(); });` (it only refreshed the count chips).

- [ ] **Step 4: Replace `renderSubViewBar()` and `renderSidebar()`** with:

```js
function renderSubViewBar() {
  const bar = document.getElementById('subViewBar');
  if (!bar) return;
  const group = navGroupOf(CURRENT_TAB);
  const tabs = group && group.items.length > 1 ? group.items : [];
  const cfg = ATLAS_SUBVIEWS[CURRENT_TAB];
  if (!tabs.length && !cfg) { bar.hidden = true; bar.innerHTML = ''; return; }
  const cur = cfg ? (ATLAS_PARAMS.view || cfg.dflt) : '';
  const pill = (attr, on, click, label) =>
    `<button type="button" class="joy-button joy-button--sm ${on ? 'joy-button--solid' : 'joy-button--outline'}" ${attr} aria-pressed="${on}" onclick="${click}">${label}</button>`;
  bar.hidden = false;
  bar.innerHTML =
    tabs.map(it => pill(`data-tab-pill="${it.id}"`, it.id === CURRENT_TAB, `switchTab('${it.id}')`, it.label)).join('') +
    (tabs.length && cfg ? '<span class="subview-bar__sep" aria-hidden="true"></span>' : '') +
    (cfg ? cfg.views.map(([id, label]) => pill(`data-subview="${id}"`, id === cur, `setSubView('${id}')`, label)).join('') : '');
}
```

```js
function renderSidebar() {
  if (!DATA) return;
  const cur = navGroupOf(CURRENT_TAB);
  document.getElementById('sidebarNav').innerHTML = NAV_GROUPS.map(g => {
    const first = g.items[0].id;
    return `<div class="nav-item ${g === cur ? 'active' : ''}" role="button" tabindex="0" data-entry="${first}" ${g === cur ? 'aria-current="page"' : ''} onclick="switchTab('${first}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('${first}')}"><span>${g.section}</span></div>`;
  }).join('');
}
```

  In `02c_records_search.js` replace the body of `recordEntryLabel(viewUrl)` with:

```js
  const group = navGroupOf(new URLSearchParams((viewUrl.split('?')[1] || '')).get('tab'));
  return group ? group.section : 'image';
```

- [ ] **Step 5: CSS.** Apply the sidebar, pills and top bar blocks of `design-brief.md` to `01_shell_and_styles.html`. The `.nav-section` rule goes if `grep -n "nav-section\"" scripts/atlas_world_web/frontend/` shows no user (`.nav-section-count` stays: the record page uses it).

- [ ] **Step 6: Follow the readers.** `scripts/tests/e2e/atlas-upright-toggle.e2e.mjs:141`: `'Lore and History'` becomes `'Lore and canon'`; `:144`: `'Top-Down World Studio'` becomes `'World'`. `scripts/tests/e2e/atlas-web-tabs.e2e.mjs:139`: click `'Tools'` in `navSel` and then `#subViewBar [data-tab-pill="map-builder"]`. `scripts/atlas_world_web/catalog_index.py:32` comment: "Tab ids are the item ids in NAV_GROUPS". Then `grep -rn "Monster Detail\|Item & Card DB\|Database Hub\|Review Gate Inbox" scripts atelier/atlas-world-panels tests --include="*.mjs" --include="*.js" --include="*.py" | grep -v node_modules` must print nothing that is a test or probe selector.

- [ ] **Step 7: Run everything this change can reach.**

```bash
pkill -f "catalog_explorer_web.py --port 8791"; python3 scripts/catalog_explorer_web.py --port 8791 > /tmp/f219-8791.log 2>&1 &
curl -s --retry 30 --retry-delay 1 --retry-connrefused -o /dev/null http://127.0.0.1:8791/
rtk proxy node scripts/probes/atlas_records_probe.mjs --url http://127.0.0.1:8791/ | grep -E "FAIL|assertions"
rtk proxy node scripts/probes/atlas_phone_touch_audit.mjs --url http://127.0.0.1:8791/ | tail -3
python3 scripts/probes/atlas_ux_probe.py | tail -3
python3 -m unittest tests/test_studio_web_perspectives.py 2>&1 | tail -3
(cd atelier/atlas-world-panels && rtk proxy node --test "tests/*.test.mjs" > /tmp/f219-p.out 2>&1; grep -E "^ℹ (pass|fail)" /tmp/f219-p.out)
(cd scripts && rtk proxy node --test "tests/atlas-web-*.test.mjs" tests/catalog-records.test.mjs > /tmp/f219-s.out 2>&1; grep -E "^ℹ (pass|fail)" /tmp/f219-s.out)
python3 scripts/lint_file_size.py | tail -1
pkill -f "catalog_explorer_web.py --port 8791"
```

  Expected: every probe line PASS, `ℹ fail 0` twice, `OK`, `overall_passed: true`. A test that fails because it read a deleted label or `countKey` is updated to the new table; a registered check is never removed or weakened.

- [ ] **Step 8: README.** In `README.md`, in the section that describes the catalog explorer / edit host, state: the sidebar has 11 entries (list them), old tabs are pills under their entry and `?tab=<old id>` links still work, Home shows record counts, new route `GET /api/record-counts`.

- [ ] **Step 9: Commit.** `git add scripts README.md && git commit -m "feat(explorer): sidebar from 31 tabs to 11 entries, old tabs become pills (F-219)"`

---

### Task 3: Look at it, critique, gate (controller, not a worker)

- [ ] **Step 1:** Restart the edit host from this worktree on `:8791`. Run `node ~/.claude/skills/ui-visual-verify/shoot.mjs` at phone 390x844 and desktop 1280x800 for `?tab=home`, `?tab=studio`, `?tab=sql` (Tools, 10 pills), `?tab=story` (Archive) and the phone nav drawer open; `Read` every image.
- [ ] **Step 2:** Spec A10: measure the top bar on `http://atlas-edit.joymify.local.com/` (after pointing the edit host at this worktree) at 1024, 1280, 1440 px: no control overlaps another, at least 200 px of the search box is visible at 1280 px.
- [ ] **Step 3:** `impeccable critique` on the real screenshots -> `critique.md` in this feature folder; fix every P0/P1; re-shoot.
- [ ] **Step 4:** ONE independent review of `git diff <base>..HEAD` (agy, `gemini-4-argon`, scope: spec A1-A6, A8-A10, XSS through `innerHTML` in the new renderers, tests that cannot fail, anything still reading the old labels). One fix round for HIGH findings; MEDIUM/LOW to the backlog.
- [ ] **Step 5:** `psrw ship` from this worktree (no pipe). Then confirm on the real surface: `curl -s http://atlas-world.joymify.local.com/api/record-counts | head -c 200`, restart the edit host from `_release`, open `http://atlas-edit.joymify.local.com/?tab=home` and send the owner that link with phone and desktop screenshots.

## Self-review (done while writing)

- Spec coverage: A1, A2, A4 -> Task 2 Step 1; A3, A5 -> Task 1 Steps 1 and 5; A6 -> Task 2 Step 1 (R7 check reads "Open in World"); A8, A10 -> Task 0 and Task 3; A9 -> Task 3 Step 5. A7 is deferred in the spec.
- Names used across tasks: `navGroupOf`, `normalizeTab`, `renderHome`, `HOME_COUNTS`, `data-entry`, `data-tab-pill`, `data-kind`, `.home-count__n`: each is defined in exactly one step.
- The tab count in the A4 check is 29: 1 + 4 + 2 + 1 + 1 + 2 + 2 + 2 + 3 + 10 + 1 (Home through Archive). Today's table has 30 ids; `sim` and `overview` go, `home` comes.
