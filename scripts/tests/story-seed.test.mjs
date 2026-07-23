// F-012 Task 7: the seed multi-arc epic is the end-to-end proof that the
// whole story-graph pipeline (schema -> refs -> unlockedBy DAG -> coherence ->
// static graph) is fully wired and fully satisfied by real content/story/*.json
// data, not just by scripts/tests/ fixtures. Before this task, the real tree
// has 4 orphan WARNs (2 characters, 2 factions under-referenced) which
// --require-complete escalates to FAILs — this test is written FIRST and is
// expected to fail until the seed epic (Task 7 Step 3) closes every orphan.
//
// F-016 (Undertow) Task 2 update: the seed epic's own orphans were closed
// (this file's tests reflected that for a while), but Task 2 of the Undertow
// plan deliberately reopens the orphan count by minting 15 world-foundation
// characters ahead of the quests/events/dialogue that will reference them in
// Tasks 3-8 — see the "content gate --require-complete" test below, which
// pins the exact expected mid-epic orphan set instead of asserting a clean
// --require-complete pass. That clean-pass assertion returns once Undertow
// Task 9 (final coherence pass) closes every orphan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Run a node script against the real (committed) content tree and report
// {status, output} instead of throwing on non-zero exit, so a FAIL shows the
// gate's own WARN/FAIL lines in the assertion message rather than just "exit 1".
function run(scriptRelPath, args = []) {
  try {
    const output = execFileSync(process.execPath, [join(ROOT, scriptRelPath), ...args], {
      encoding: "utf8",
      cwd: ROOT,
    });
    return { status: 0, output };
  } catch (e) {
    return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("content gate is green on the real tree (no --require-complete)", () => {
  const { status, output } = run("scripts/check_content.mjs");
  assert.equal(status, 0, `expected exit 0, got ${status}:\n${output}`);
  assert.match(output, /0 failures/);
});

// F-016 (Undertow) Task 2 deliberately reintroduces orphans: the plan's
// world-foundation task (acts/regions/factions/characters + canon.md) mints
// 15 new characters before any quest/event/dialogue references them — the
// Global Constraints section calls this out explicitly ("Orphan WARNs are
// expected mid-plan ... must ALL be resolved by Task 9"). Until Undertow
// Task 9 closes them, --require-complete legitimately fails; this test pins
// the *exact* expected orphan set so any *additional*, unplanned orphan
// still fails the test loudly instead of being silently absorbed.
//
// Task 3 (act 1 starter arcs) de-orphans 3 of the 15: char-war-countess and
// char-speaker-of-norhollow become quest givers, char-widow-of-the-first-
// caravan is now involved in event-first-caravan-burns.
//
// Task 4 (act 2 — the war comes home) de-orphans 1 more: char-farrow-the-
// forward becomes a quest giver (quest-hold-the-ford) and dies in
// event-farrow-falls.
//
// Task 5 (act 3 — the ledger game) de-orphans 5 more: char-warden-bright and
// char-clerk-of-gildmark become quest givers (arc-ledger-game's 4-quest
// chain), char-the-broker is involved in event-ledger-lifted,
// char-clerk-of-gildmark and char-thornveil-war-speaker die in
// event-clerk-silenced / event-warspeaker-falls, and char-the-ash-prophet
// becomes a dialogue speaker (dlg-ash-prophet-sermon).
//
// Task 6 (act 4 — the truth arrives late) de-orphans 3 more: char-iron-
// regent is involved in event-relic-deal-struck, char-the-bell-keeper is
// involved in / speaks dlg-bell-keeper-confession for event-bells-ring-true,
// and char-mirelle is involved in event-bells-ring-true and speaks
// dlg-mirelle-freed. char-quartermaster also dies here
// (event-quartermaster-falls) but was never orphaned.
const EXPECTED_MID_EPIC_ORPHAN_CHARACTERS = [
  "char-elder-of-rooktide",
  "char-liss-of-embervale",
  "char-joren-of-norhollow",
];

test("content gate --require-complete: exactly the Undertow T2 world-foundation orphans fail (no more, no fewer)", () => {
  const { status, output } = run("scripts/check_content.mjs", ["--require-complete"]);
  assert.equal(status, 1, `expected exit 1 (mid-epic orphans pending Undertow Task 9), got ${status}:\n${output}`);
  assert.match(output, new RegExp(`${EXPECTED_MID_EPIC_ORPHAN_CHARACTERS.length} failures`));
  for (const id of EXPECTED_MID_EPIC_ORPHAN_CHARACTERS) {
    assert.match(output, new RegExp(`character "${id}" is referenced by no quest, faction, event, or dialogue \\(orphan\\)`));
  }
  // No orphan factions expected: every new faction is de-orphaned by at
  // least one character's `faction` field (see checkStoryCoherence()).
  assert.doesNotMatch(output, /faction ".*" is referenced by no quest, character, or event \(orphan\)/);
});

test("docs/story/story-graph.md is in sync with the seed epic (no drift)", () => {
  const { status, output } = run("scripts/gen_story_graph.mjs", ["--check"]);
  assert.equal(status, 0, `expected exit 0, got ${status}:\n${output}`);
});

test("the seed epic exercises every kind and every unlockedBy/edge shape (5 arcs, valid cross-arc chain)", () => {
  const readStory = (f) => JSON.parse(readFileSync(join(ROOT, `content/story/${f}`), "utf8"));
  const acts = readStory("acts.json");
  const arcs = readStory("arcs.json");
  const quests = readStory("quests.json");
  const events = readStory("events.json");
  const dialogue = readStory("dialogue.json");
  const lore = readStory("lore.json");
  const characters = readStory("characters.json");

  // F-016 (Undertow) Task 3: act 1 now hosts 3 parallel starter arcs
  // (Millcross's arc-meadow-awakening, plus arc-embervale-outskirts and
  // arc-norhollow-outskirts) per spec §3 — so arc.actId is no longer unique
  // across arcs; the invariant this test actually cares about is the
  // cross-arc unlockedBy chain into a later act, checked below.
  //
  // F-016 (Undertow) Task 4: act 2 adds its own arc-war-comes-home.
  // F-016 (Undertow) Task 5: act 3 adds its own arc-ledger-game.
  // F-016 (Undertow) Task 6: act 4 adds its own arc-truth-arrives-late.
  assert.equal(
    arcs.length,
    7,
    "expected 7 arcs total after Undertow Task 6 (2 seed + 2 act-1 starters + 1 act-2 arc + 1 act-3 arc + 1 act-4 arc)"
  );
  assert.ok(quests.length >= 4, "expected at least 4 quests total");
  assert.ok(events.length >= 2, "expected at least 2 events (events.json was empty before Task 7)");
  assert.ok(dialogue.length >= 2, "expected at least 2 dialogue nodes (dialogue.json was empty before Task 7)");
  assert.ok(lore.length >= 2, "expected at least 2 lore fragments (Narrative System v2 Task 3 seed thread)");

  // Narrative System v2 Task 3: char-ashfang-alpha (the Twin-Strike) dies in
  // event-twin-strike-falls — proves the seed exercises character fates.
  const alpha = characters.find((c) => c.id === "char-ashfang-alpha");
  assert.ok(alpha, "expected char-ashfang-alpha in the seed");
  assert.equal(alpha.status, "dead", "expected char-ashfang-alpha to be dead");
  assert.equal(alpha.diedAt, "event-twin-strike-falls", "expected char-ashfang-alpha.diedAt to resolve to its death event");

  // At least one quest's unlockedBy quest-* chain must reach into a
  // *different* arc than the one it started in — proves the "valid
  // unlockedBy chain across arcs" requirement, not just disconnected arcs.
  //
  // F-016 (Undertow) Task 5: previously this test located its starting quest
  // by picking "the highest-order arc" and asserting its chain reaches
  // another arc. That assumption broke the moment a later, higher-order arc
  // (arc-ledger-game, act-3) was added whose own internal quest chain stays
  // self-contained (its first quest is gated by `act-3` + an event, not a
  // quest-*). The invariant this test actually cares about — that some
  // cross-arc quest chain exists in the graph at all — doesn't depend on
  // *which* arc demonstrates it, so the search now scans every quest instead
  // of hardcoding "the second arc".
  const questById = new Map(quests.map((q) => [q.id, q]));
  const questUnlockId = (q) => (q.unlockedBy ?? []).find((id) => id.startsWith("quest-"));

  const chainReachesOtherArc = (startQuest) => {
    let cur = startQuest;
    const seen = new Set();
    while (questUnlockId(cur)) {
      assert.ok(!seen.has(cur.id), `unlockedBy cycle at ${cur.id}`);
      seen.add(cur.id);
      const next = questById.get(questUnlockId(cur));
      assert.ok(next, "unlockedBy quest-* entry must resolve to a real quest");
      if (next.arcId !== startQuest.arcId) return true;
      cur = next;
    }
    return false;
  };

  const crossArcQuest = quests.find((q) => questUnlockId(q) && chainReachesOtherArc(q));
  assert.ok(crossArcQuest, "expected at least one quest with a quest-* unlockedBy chain reaching into another arc");

  // event.triggeredBy and dialogue.context together exercise both allowed
  // dialogue.context target kinds (quest and event).
  assert.ok(events.some((e) => e.triggeredBy), "expected at least one event.triggeredBy");
  const contextKinds = new Set(
    dialogue.map((d) => (d.context?.startsWith("event-") ? "event" : d.context?.startsWith("quest-") ? "quest" : undefined))
  );
  assert.ok(contextKinds.has("quest"), "expected a dialogue.context pointing at a quest");
  assert.ok(contextKinds.has("event"), "expected a dialogue.context pointing at an event");
});
