// F-053 Phase 1 — smoke scenarios for the Forge tab. Each scenario gets a
// fresh browser context (own localStorage) and a cold load of the storybook.
// `server` configures the local server: fail = repo paths answered 404,
// override = repo path -> file served instead. Expressions run in the page.

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
    async steps({ waitFor, evaluate, reload }) {
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
        `document.querySelector('.forge-orders-saved')?.textContent === 'saved in this browser'`,
        '"saved in this browser"',
      );
      await reload();
      await waitFor(
        `[...document.querySelectorAll('.forge-order')].some((o) => o.textContent.includes('smoke: re-run'))`,
        "the work order is still listed after a reload",
      );
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
];
