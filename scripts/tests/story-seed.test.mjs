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
// plan deliberately reopened the orphan count by minting 15 world-foundation
// characters ahead of the quests/events/dialogue that would reference them in
// Tasks 3-7. Tasks 3-6 de-orphaned all but 3 (see the "content gate
// --require-complete" test below); Task 7 (act 5 — the undertow) closes the
// last 3, so that test now pins a clean --require-complete pass again, ahead
// of Undertow Task 9 (final coherence pass), which has no orphans left to do.
//
// F-043 update: story orphans are STILL all closed (this file's invariant),
// but --require-complete stopped exiting 0 again for an unrelated reason —
// F-043's promotion seeded 4 continents with no region children yet, and
// that trips the SPINE completeness gate, not the story one. See the test
// below for the exact pin.
//
// F-043 gate amendment (this commit): those 4 continents
// (n-brightfall, n-driftholt, n-reedstrand, n-rimewall-cap) are mariners'
// chart entries (`lore.reported: true`) — unsurveyed by spec, so childless is
// correct, not an outstanding gap. checkSpineComplete now recognizes
// lore.reported and steps a childless trunk-tier node down from FAIL to WARN
// instead of erroring. The gate is green again; the test below now pins a
// clean exit 0 with zero FAILs, and pins the 4 new WARN lines by exact text
// so the reported-childless state stays covered.
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

test("content gate on the real tree: zero failures — Task 9/14 re-homed the zone/town orphans, R-B closed the last one", () => {
  // Plan D Task 11 cutover: content/world/resolved/ is the gate's only
  // geography source, so the ten legacy zone records, the bestiary placement
  // and the town plan orphaned LOUDLY until re-homed. Task 9/14 re-homed the
  // zone and town records; R-B (owner ruling, 2026-08-29) closed the last
  // one, bestiary/placement-thornveil.json's un-re-homable join, as a
  // committed exemption (WARN) rather than a silenced FAIL. Any FAIL line at
  // all is a regression this test still catches.
  const { status, output } = run("scripts/check_content.mjs");
  assert.equal(status, 0, output);
  const fails = output.split("\n").filter((l) => l.startsWith("FAIL "));
  assert.deepEqual(fails, [], `expected zero failures:\n${fails.join("\n")}`);
  assert.match(output, /[1-9]\d* nodes/);
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
//
// Task 7 (act 5 — the undertow) de-orphans the last 3: char-elder-of-rooktide
// becomes the giver of quest-the-brokers-ledger and quest-the-first-crossing,
// and char-liss-of-embervale / char-joren-of-norhollow are both `involves` on
// event-the-first-crossing. That closes every character orphan ahead of
// schedule — Task 9's "final coherence pass" no longer has any orphan left to
// sweep, so this test now pins a clean --require-complete pass instead of an
// expected mid-epic orphan set.
// F-043 ("the wider world", commit 415a765) panel-promoted 4 new continents
// (n-brightfall, n-driftholt, n-reedstrand, n-rimewall-cap) that have no
// region children yet (they were seeded and hand-polished by the naming/
// canon/systems panel, but tiling their interiors is out of scope for this
// promotion). checkSpineComplete's TRUNK_TIERS rule ("a continent may not be
// empty") escalates that from a WARN to a FAIL under --require-complete, so
// the gate no longer exits 0 — the STORY-orphan invariant this test exists
// to protect is untouched (still 0 orphan lines); the new exit code comes
// entirely from spine-completeness, a different gate. Pinned by exact FAIL
// count and exact text so a real regression (a 5th failure, a changed id, or
// a re-opened orphan) still fails this test loudly.
test("content gate --require-complete: zero failures; no continent is incomplete", () => {
  // Plan D Task 11: same orphan window as above, now closed the same way —
  // pin that no failure (of any shape) has joined it.
  const { status, output } = run("scripts/check_content.mjs", ["--require-complete"]);
  assert.equal(status, 0, output);
  assert.doesNotMatch(output, /^FAIL /m);
  // PLAN E (E-C3): F-043's four "childless by design" WARNs are GONE, and that
  // is the constraint working rather than a rule going quiet. Post-redraw all
  // 13 continents are childless — their regions are fabric rows, not nodes —
  // and checkSpineComplete now settles a continent through its
  // provenance.generator.fabric pin instead. So the assertion is inverted with
  // its reason attached: NO continent may appear in a completeness line at all.
  // Because a `doesNotMatch` passes just as happily when the rule is deleted,
  // the two surviving region WARNs are asserted positively beside it — they are
  // the proof G-SPINE-COMPLETE still runs and still prints. Those two are
  // n-thornveil and n-northern-icefield, the only region NODES E-C4 keeps.
  const completeness = output.split("\n").filter((l) => l.includes("G-SPINE-COMPLETE"));
  assert.deepEqual(completeness.filter((l) => l.includes("(tier continent)")), [],
    `a continent lost its fabric-pin completeness:\n${completeness.join("\n")}`);
  assert.match(output, /WARN {2}G-SPINE-COMPLETE: "n-thornveil" \(tier region\) has no children yet/);
  assert.match(output, /WARN {2}G-SPINE-COMPLETE: "n-northern-icefield" \(tier region\) has no children yet/);
  assert.doesNotMatch(output, /character ".*" is referenced by no quest, faction, event, or dialogue \(orphan\)/);
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
  // F-016 (Undertow) Task 7: act 5 adds its own arc-the-undertow.
  // F-016 (Undertow) Task 8: side packs add arc-small-mercies (act 2) and
  // arc-embers-that-remain (act 4).
  assert.equal(
    arcs.length,
    10,
    "expected 10 arcs total after Undertow Task 8 (2 seed + 2 act-1 starters + 1 act-2 arc + 1 act-3 arc + 1 act-4 arc + 1 act-5 arc + 2 side-quest arcs)"
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
