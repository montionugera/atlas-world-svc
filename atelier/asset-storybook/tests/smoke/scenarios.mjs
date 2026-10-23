// F-053 Phase 1 / SSOT merge W3 — smoke scenarios for the atlas-world panels. Each scenario gets
// a fresh browser context (own localStorage) and a cold load of `path` (default /?tab=forge) on
// the real catalog_explorer_web.py. `server` configures the per-scenario proxy: fail = repo paths
// answered 404, override = repo path -> file served instead. `writes: true` allows non-GET
// requests (their target is a temp copy of review-queue.json, never the repo). Expressions run in
// the page; `readQueue()` reads that temp copy and `requests(pred)` filters the proxy's log.

export const SCENARIOS = [
  {
    name: "forge-rows",
    async steps({ waitFor, evaluate, expectedBriefs }) {
      await waitFor(
        `document.querySelectorAll('.forge-pipeline-row').length === ${expectedBriefs}`,
        `${expectedBriefs} pipeline rows (one per forge-briefs-index.json brief)`,
      );
      const s = await evaluate(`(() => ({
        errors: document.querySelectorAll('.forge-rows [data-error]').length,
        display: getComputedStyle(document.querySelector('.forge-rows')).display,
        noLedger: document.querySelectorAll('.forge-pipeline-row[data-state="no-ledger"]').length,
        noLedgerText: [...document.querySelectorAll('.forge-pipeline-row[data-state="no-ledger"]')].every((r) => r.textContent.includes('no ledger yet')),
        ledgered: document.querySelectorAll('.forge-pipeline-row[data-state="ledger"]').length,
      }))()`);
      if (s.errors !== 0) throw new Error(`${s.errors} [data-error] rows on committed data`);
      if (s.display !== "flex") throw new Error(`.forge-rows display is "${s.display}", not "flex": Forge CSS is dead (C0.1)`);
      if (s.ledgered < 1) throw new Error("no ledgered pipeline row");
      if (!s.noLedgerText) throw new Error('a no-ledger row lacks "no ledger yet"');
    },
  },
  {
    name: "forge-detail",
    async steps({ waitFor, evaluate }) {
      await waitFor(`!!document.querySelector('.forge-card')`, "a forge card");
      await evaluate(`document.querySelector('.forge-card').click()`);
      await waitFor(
        `(() => { const o = document.getElementById('detail-overlay'); return !!o && !o.hidden && getComputedStyle(o).position === 'fixed'; })()`,
        "run detail overlay open and position:fixed",
      );
    },
  },
  {
    name: "forge-workorder-persists",
    writes: true,
    async steps({ waitFor, evaluate, reload, readQueue }) {
      await waitFor(`!!document.querySelector('.forge-rerun')`, "a re-run button");
      await evaluate(`document.querySelector('.forge-rerun').click()`);
      await evaluate(`document.querySelector('.forge-order-submit').click()`);
      await waitFor(
        `(() => { const e = document.querySelector('.forge-order-error'); return !!e && !e.hidden && e.textContent === 'reason required'; })()`,
        '"reason required" on an empty reason',
      );
      await evaluate(`(() => {
        document.querySelector('.forge-order-reason').value = 'smoke: re-run';
        document.querySelector('.forge-order-submit').click();
      })()`);
      await waitFor(
        `/1 draft not yet saved to review-queue\\.json/.test(document.querySelector('.forge-orders-saved')?.textContent || '')`,
        'the order shown as an unsaved draft',
      );
      if (readQueue().workOrders.length !== 0) throw new Error("a draft reached review-queue.json before Save");
      await reload();
      await waitFor(
        `[...document.querySelectorAll('.forge-order')].some((o) => o.textContent.includes('smoke: re-run'))`,
        "the draft is still listed after a reload (browser buffer)",
      );
      await waitFor(`!!document.querySelector('[data-act="save-work-orders"]:not([disabled])')`, "an enabled Save button");
      await evaluate(`document.querySelector('[data-act="save-work-orders"]').click()`);
      await waitFor(
        `!document.querySelector('.forge-orders-saved')?.textContent && ![...document.querySelectorAll('.forge-order')].some((o) => o.textContent.includes('draft — not saved'))`,
        "the draft promoted to a saved order",
      );
      const saved = readQueue().workOrders.filter((w) => w.reason === "smoke: re-run");
      if (saved.length !== 1) throw new Error(`expected 1 saved work order, found ${saved.length}`);
      if (!/^wo-\d{4}$/.test(saved[0].id)) throw new Error(`server-assigned id is "${saved[0].id}", not wo-NNNN`);
    },
  },
  {
    name: "ledger-malformed",
    server: { override: { "atelier/art-forge/runs/A1-ART-02.json": "fixtures/ledger-malformed.json" } },
    async steps({ waitFor, expectedBriefs }) {
      await waitFor(
        `[...document.querySelectorAll('.forge-pipeline-row[data-error]')].some((r) => /ledger A1-ART-02\\.json unreadable \\(line 3\\)/.test(r.textContent))`,
        '"ledger A1-ART-02.json unreadable (line 3)" row',
      );
      await waitFor(
        `document.querySelectorAll('.forge-pipeline-row').length === ${expectedBriefs}`,
        "the other briefs still render",
      );
    },
  },
  {
    name: "runs-not-packaged",
    server: { fail: ["atelier/art-forge/runs/_index.json"] },
    async steps({ waitFor }) {
      await waitFor(
        `(document.querySelector('.forge-rows')?.textContent || '').includes('not packaged in this image: atelier/art-forge/runs/_index.json')`,
        '"not packaged in this image" empty state',
      );
    },
  },
  {
    name: "audio-tab-switch-persists",
    path: "/?tab=audio",
    async steps({ waitFor, evaluate, requests }) {
      await waitFor(`document.querySelectorAll('[data-panel="audio"] .sound-tile').length > 0`, "SFX tiles in the audio panel");
      await evaluate(`document.querySelector('[data-panel="audio"] .sound-tile').__smokeMark = 'kept'`);
      await evaluate(`window.switchTab('gear')`);
      await waitFor(`document.querySelector('[data-panel="audio"]').hidden === true`, "the audio panel hidden after switching to gear");
      await evaluate(`window.switchTab('audio')`);
      await waitFor(`document.querySelector('[data-panel="audio"]').hidden === false`, "the audio panel visible again");
      const kept = await evaluate(`document.querySelector('[data-panel="audio"] .sound-tile').__smokeMark`);
      if (kept !== "kept") throw new Error("the audio panel was re-mounted on the round trip (its tiles are new DOM)");
      const fetched = requests((r) => r.path === "atelier/asset-storybook/audio-index.json").length;
      if (fetched !== 1) throw new Error(`audio-index.json fetched ${fetched}x across the round trip, expected exactly 1`);
      await evaluate(`document.querySelector('[data-panel="audio"] [data-mode="music"]').click()`);
      await waitFor(`!document.querySelector('[data-panel="audio"] #section-music').hidden`, "the Music board after clicking Music");
    },
  },
  {
    name: "assets-model-viewer-loads",
    path: "/?tab=assets&key=mob:aggressive",
    async steps({ waitFor, evaluate, requests }) {
      await waitFor(
        `(() => { const o = document.getElementById('detail-overlay'); return !!o && !o.hidden && !!o.querySelector('model-viewer'); })()`,
        "the detail overlay open on mob:aggressive with a <model-viewer>",
      );
      await waitFor(`!!customElements.get('model-viewer')`, "<model-viewer> defined from the vendored script");
      const src = await evaluate(`document.querySelector('#detail-overlay model-viewer').getAttribute('src') || ''`);
      if (!/\.glb(\?|$)/.test(src)) throw new Error(`model-viewer src is "${src}", not a .glb`);
      const vendor = requests((r) => r.path === "vendor/model-viewer.min.js");
      if (!vendor.length || vendor.some((r) => r.status !== 200)) throw new Error(`vendored model-viewer not served 200: ${JSON.stringify(vendor)}`);
      // A CDN fetch bypasses the proxy, so the proxy log cannot see it — ask the page.
      const cdn = await evaluate(`performance.getEntriesByType('resource').filter((e) => /unpkg\\.com|jsdelivr|cdnjs/.test(e.name)).map((e) => e.name)`);
      if (cdn.length) throw new Error(`the page fetched from a CDN instead of /vendor/: ${cdn.join(", ")}`);
    },
  },
  {
    name: "review-verdict-roundtrip",
    path: "/?tab=review&view=verdicts",
    writes: true,
    async steps({ waitFor, evaluate, readQueue }) {
      await waitFor(`!!document.querySelector('[data-panel="review-verdicts"] .card[data-key] .verdict-btn-reject')`, "an asset card with a reject button");
      const key = await evaluate(`document.querySelector('[data-panel="review-verdicts"] .card[data-key]').dataset.key`);
      const proposalsBefore = JSON.stringify(readQueue().proposals ?? null);
      await evaluate(`document.querySelector('[data-panel="review-verdicts"] .card[data-key] .verdict-btn-reject').click()`);
      await waitFor(`!!document.querySelector('[data-panel="review-verdicts"] .verdict-note')`, "the note editor");
      await evaluate(`(() => {
        document.querySelector('[data-panel="review-verdicts"] .verdict-note').value = 'smoke: reject';
        document.querySelector('[data-panel="review-verdicts"] .verdict-btn-save').click();
      })()`);
      const deadline = Date.now() + 15000;
      let saved = null;
      while (Date.now() < deadline && !saved) {
        saved = readQueue().verdicts?.[key] || null;
        if (!saved) await new Promise((r) => setTimeout(r, 200));
      }
      if (!saved) throw new Error(`verdict for ${key} never reached review-queue.json`);
      if (saved.verdict !== "reject" || saved.note !== "smoke: reject") throw new Error(`saved verdict is ${JSON.stringify(saved)}`);
      if (JSON.stringify(readQueue().proposals ?? null) !== proposalsBefore) throw new Error("saving a verdict changed proposals");
      await evaluate(`document.querySelector('[data-panel="review-verdicts"] .card[data-key="${key}"] .verdict-btn-clear').click()`);
      const gone = Date.now() + 15000;
      while (Date.now() < gone && readQueue().verdicts?.[key]) await new Promise((r) => setTimeout(r, 200));
      if (readQueue().verdicts?.[key]) throw new Error(`clearing ${key} never removed it from review-queue.json`);
    },
  },
  {
    name: "map-builder-down-banner",
    path: "/?tab=map-builder",
    async steps({ waitFor, evaluate, requests }) {
      await waitFor(
        `(document.querySelector('[data-panel="map-builder"]')?.textContent || '').includes('Builder service not running')`,
        '"Builder service not running" while the Map Builder is down',
      );
      await waitFor(`!!document.querySelector('[data-panel="map-builder"] [data-map-builder-recheck]')`, 'the "Check again" button');
      const up = requests((r) => r.path.startsWith("api/map-builder/") && r.status === 503);
      if (!up.length) throw new Error("expected the proxy to answer 503 MAP_BUILDER_DOWN for /api/map-builder/*");
    },
  },
];
