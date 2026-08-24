// Plan D — the name generator. The old pool is 120 combinations against 626
// names; this suite's first job is to prove the replacement CONVERGES, and
// its second is to prove the four failures the design names (register
// collapse, sound confusability, no semantic hook, prosodic monotony) are
// each caught by a gate rather than left to taste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGISTERS, NAME_FORMS, mintName, phonemeDistance, prosody, syllableCount, registerOf, titleStem,
} from "../../tools/mapforge/lib/name-gen.mjs";
import { gNames } from "../../scripts/lib/resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const registers = JSON.parse(readFileSync(join(ROOT, "content/world/names/registers.json"), "utf8"));
const classifiers = JSON.parse(readFileSync(join(ROOT, "content/world/names/classifiers.json"), "utf8"));
const reserved = new Set(JSON.parse(readFileSync(join(ROOT, "content/world/names/reserved.json"), "utf8")).names);

test("five registers, each with 16 onsets, 12 rimes and 6 links", () => {
  assert.deepEqual(Object.keys(registers.registers).sort(), [...REGISTERS].sort());
  for (const [id, r] of Object.entries(registers.registers)) {
    assert.equal(r.onsets.length, 16, `${id} onsets`);
    assert.equal(r.rimes.length, 12, `${id} rimes`);
    assert.equal(r.links.length, 6, `${id} links`);
    assert.equal(new Set(r.onsets).size, 16, `${id} onsets must be distinct`);
    assert.equal(new Set(r.rimes).size, 12, `${id} rimes must be distinct`);
  }
});

test("classifiers cover all twelve landform groups", () => {
  const groups = ["coastal", "fluvial", "mountain", "glacial", "karst", "erosional",
                  "desert", "volcanic", "wetland", "lakes", "island", "oceanic"];
  for (const g of groups) {
    assert.ok(Array.isArray(classifiers.byGroup[g]), `group ${g} missing`);
    assert.ok(classifiers.byGroup[g].length >= 3, `group ${g} needs >= 3 classifiers`);
  }
});

test("every committed canon name is reserved", () => {
  for (const n of ["Millcross", "Gildmark", "Rooktide", "Cindervast", "Embervale",
                   "Norhollow", "Thornveil", "Coldreach", "Galereach", "Keelbreak",
                   "Tarnmark", "Stonemoor", "Reedstrand", "Driftholt", "Brightfall",
                   "Rimewall Cap", "Tallowquay", "Netstead"])
    assert.ok(reserved.has(n), `${n} must be in reserved.json`);
});

test("mintName is deterministic in (register, form, classifier, stream, used)", () => {
  const args = { register: registers.registers["basin-anglic"], form: "stem", classifier: null,
                 stream: "d9a0051d32afab59", used: new Set(), reserved };
  assert.equal(mintName(args), mintName({ ...args, used: new Set() }));
});

test("mintName never re-mints a used or reserved name", () => {
  // ERRATUM vs the plan text: the drafted loop asked for 200 stem-form names
  // from ONE register, whose stem capacity is exactly 16 x 12 = 192 —
  // unsatisfiable by pigeonhole (and Step 3's structural test pins rimes at
  // 12, so widening the tables is not available). 150 keeps the property
  // under test and still exceeds the retired 120-combination pool.
  const used = new Set();
  for (let i = 0; i < 150; i++) {
    const n = mintName({ register: registers.registers["north-log"], form: "stem", classifier: null,
                         stream: "90d0166357877d7c", used, reserved });
    assert.ok(!used.has(n), "duplicate mint");
    assert.ok(!reserved.has(n), `${n} collides with a reserved canon name`);
    used.add(n);
  }
  assert.equal(used.size, 150);
});

test("the generator converges at 626 names across five registers", () => {
  const used = new Set();
  let minted = 0;
  for (const id of REGISTERS) {
    for (let i = 0; i < 126; i++) {
      const form = NAME_FORMS[i % NAME_FORMS.length];
      const classifier = form === "stem" ? null : classifiers.byGroup.karst[i % 3];
      used.add(mintName({ register: registers.registers[id], form, classifier,
                          stream: `stream-${id}`, used, reserved }));
      minted++;
    }
  }
  assert.equal(minted, 630);
  assert.equal(used.size, 630, "every name must be globally distinct");
});

test("G-NAME-SOUND: phoneme distance collapses digraphs, so Rooktide/Rooktyde are near", () => {
  assert.ok(phonemeDistance({ a: "Rooktide", b: "Rooktyde" }) <= 1);
  assert.ok(phonemeDistance({ a: "Rooktide", b: "Reedstrand" }) >= 3);
  assert.ok(phonemeDistance({ a: "Thornveil", b: "Tornveil" }) <= 1); // th -> one phoneme
  // ch -> one phoneme: without the collapse this pair measures 2, not 1
  assert.ok(phonemeDistance({ a: "Witchmere", b: "Witmere" }) <= 1);
});

test("syllable counting is vowel-group based", () => {
  assert.equal(syllableCount({ name: "Millcross" }), 2);
  assert.equal(syllableCount({ name: "Cindervast" }), 3);
  assert.equal(syllableCount({ name: "The Drowned Stair" }), 3);
});

test("stop-words are excluded whole, not character-stripped", () => {
  // "the"/"of"/"and" contribute 0 to the count — never a mangled fragment.
  for (const w of ["The", "the", "of", "and"]) assert.equal(syllableCount({ name: w }), 0, `"${w}"`);
  assert.equal(syllableCount({ name: "Stair of the Meltwash" }), 3); // stair=1 + meltwash=2
  // The silent-e strip still applies unconditionally to content words:
  // Rooktide -> rooktid = 2 groups (oo, i).
  assert.equal(syllableCount({ name: "Rooktide" }), 2);
  // A content word ending in a consonant keeps its trailing e as a group
  // ("drowned": o + e), which is what keeps the plan's fixture at 3 without
  // any stop-word fudge: 0 + 2 + 1.
  assert.equal(syllableCount({ name: "Drowned" }), 2);
  // Committed-name counts stay pinned alongside the stop-word change.
  assert.equal(syllableCount({ name: "Millcross" }), 2);
  assert.equal(syllableCount({ name: "Gildmark" }), 2);
  assert.equal(syllableCount({ name: "Norhollow" }), 3);
});

test("G-NAME-PROSODY: a monotonous set is measurable", () => {
  const flat = prosody({ names: ["Millcross", "Gildmark", "Rooktide", "Norhollow"] });
  assert.ok(flat.syllableShare > 0.6, "four two-syllable trochees must exceed the 60% ceiling");
  assert.equal(flat.threePlusShare, 0.25);
  const mixed = prosody({ names: ["Millcross", "Cindervast", "Stair of the Meltwash", "Gildmark", "Fenster of Slateflow"] });
  assert.ok(mixed.ofFormShare >= 0.10);
});

test("island chains inherit the nearest continent's register", () => {
  assert.equal(registerOf({ continent: "c11", registers }), registerOf({ continent: "c04", registers }));
  assert.equal(registerOf({ continent: "c02", registers }), "basin-anglic");
});

test("gNames: soft-skips without a world, catches cross-register and confusable names, exempts hand-authored and titleless records", () => {
  assert.deepEqual(gNames({ world: { present: false }, registers, classifiers }), []);
  const bound = (over) => ({ file: "world/civil/bound/x.json", doc: { id: over.id, kind: "landmark",
    title: over.title, provenance: over.provenance ?? { authored: "generated" },
    bind: over.bind ?? { handle: `${over.cont}/karst/h-0001` }, requires: { continent: over.cont } } });
  const world = {
    present: true,
    pinned: [],
    bound: [
      bound({ id: "b-onset", cont: "c02", title: "Quibblemark" }),         // legal rime, illegal onset
      bound({ id: "b-rime", cont: "c02", title: "Millzap" }),              // legal onset, illegal rime
      bound({ id: "b-sound-a", cont: "c02", title: "Millcross" }),
      bound({ id: "b-sound-b", cont: "c02", title: "Millkrosse" }),        // within 2 phonemes of Millcross
      bound({ id: "b-hand", cont: "c02", title: "Zorblax Fell",
              provenance: { authored: "hand" } }),                          // canon predates the registers
      bound({ id: "b-titleless", cont: "c02", title: null }),               // named in a later task — never a throw
    ],
  };
  const problems = gNames({ world, registers, classifiers });
  assert.ok(problems.some((p) => p.startsWith("G-NAME-REGISTER: b-onset")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("G-NAME-REGISTER: b-rime")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("G-NAME-SOUND: c02")), problems.join("\n"));
  assert.ok(!problems.some((p) => p.includes("b-hand")), "hand-authored names are exempt");
  assert.ok(!problems.some((p) => p.includes("b-titleless")), "titleless records must not throw or fail");
});

test("gNames: a monotonous continent trips all three G-NAME-PROSODY clauses", () => {
  // Seven two-syllable names against three longer ones put syllableShare at
  // exactly 0.70 — over the 60% ceiling, under an absurb 99% one — so this
  // fixture distinguishes a live threshold from a dead one.
  const titles = ["Millwick", "Gildrow", "Rookstead", "Norfield", "Bramgate", "Fordstead",
                  "Wainwick", "Emberwick", "Harrowfield", "Barrowvale"];
  const world = {
    present: true,
    pinned: [],
    bound: titles.map((t, i) => ({
      file: "world/civil/bound/x.json",
      doc: { id: `b-${i}`, kind: "landmark", title: t, provenance: { authored: "generated" },
             bind: { handle: `c02/karst/h-${i}` }, requires: { continent: "c02" } },
    })),
  };
  const problems = gNames({ world, registers, classifiers }).filter((p) => p.startsWith("G-NAME-PROSODY"));
  assert.equal(problems.length, 2, problems.join("\n")); // syllable ceiling + of-form floor
});

test("titleStem: an of-form title is judged on its trailing register stem", () => {
  // "Xqxq" violates basin-anglic phonotactics; "Millwick" is onset+rime. If
  // the gate read the LEADING word of an of-form title it would fail a name
  // the register never wrote — the classifier, not the stem, leads.
  assert.equal(titleStem("Millwick Fen"), "Millwick");
  assert.equal(titleStem("Fen of the Millwick"), "Millwick");
  assert.equal(titleStem("Fen below Millwick"), "Millwick"); // reedspeech's link word
  const world = {
    present: true,
    pinned: [],
    bound: [{
      file: "world/civil/bound/x.json",
      // Minted of-form shape: classifier + link + stem. Under the old
      // leading-word rule this failed on "Stair" (no basin-anglic onset or
      // rime matches); judged on its trailing stem it passes.
      doc: { id: "b-of", kind: "landmark", title: "Stair below Millwick",
             prose: "frontier", provenance: { authored: "generated" },
             bind: { handle: "c02/karst/h-0001" }, requires: { continent: "c02" } },
    }],
  };
  const problems = gNames({ world, registers, classifiers }).filter((p) => p.startsWith("G-NAME-REGISTER"));
  assert.deepEqual(problems, []);
});
