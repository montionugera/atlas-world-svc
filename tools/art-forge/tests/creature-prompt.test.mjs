import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCreaturePrompt, loadForge } from "../generate/charsheet.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FORGE_DIR = path.resolve(HERE, "..");

const BUNDLE = {
  styleLaws: {
    positive: ["crisp flat 2D anime illustration"],
    negative: ["NOT 3D render"],
    styleClause: ["RO proportion", "Genshin-detail"],
  },
  creatures: {
    "mob-bramble-stalker": { clause: "a bundle of green cane", silhouette: "sil-assassin" },
  },
};

test("the creature clause appears in the prompt", () => {
  assert.match(buildCreaturePrompt("mob-bramble-stalker", BUNDLE), /green cane/);
});

test("styleClause is appended LAST — after the creature clause (F-024 law)", () => {
  const p = buildCreaturePrompt("mob-bramble-stalker", BUNDLE);
  assert.ok(
    p.indexOf("green cane") < p.indexOf("RO proportion"),
    "style words must come after the creature clause",
  );
});

test("the style-laws positive opener still comes first", () => {
  const p = buildCreaturePrompt("mob-bramble-stalker", BUNDLE);
  assert.ok(p.startsWith("crisp flat 2D anime illustration"));
});

test("an unknown design id throws rather than silently generating junk", () => {
  assert.throws(() => buildCreaturePrompt("mob-nope", BUNDLE), /mob-nope/);
});

test("an entry with no clause throws — a silhouette alone is not a prompt", () => {
  const bad = { ...BUNDLE, creatures: { "mob-x": { silhouette: "sil-assassin" } } };
  assert.throws(() => buildCreaturePrompt("mob-x", bad), /clause/);
});

// --- the committed module itself -------------------------------------------

test("creature-identity.json only names designs that exist in the bestiary", () => {
  const creatures = JSON.parse(
    fs.readFileSync(path.join(FORGE_DIR, "prompts", "creature-identity.json"), "utf8"),
  );
  const bestiary = JSON.parse(
    fs.readFileSync(path.resolve(FORGE_DIR, "../../content/bestiary/bestiary.json"), "utf8"),
  );
  const ids = new Set(bestiary.map((r) => r.id));
  for (const key of Object.keys(creatures)) {
    if (key.startsWith("_")) continue; // _note
    assert.ok(ids.has(key), `creature-identity.json names "${key}", which is not a bestiary design`);
  }
});

test("every creature entry names a silhouette that exists on the GPU box's input dir", () => {
  // The silhouettes live on mont-pc and cannot be stat()ed from here, so this
  // pins the CONFIRMED set (listed over SSH 2026-08-05) rather than guessing.
  // If a new anchor is added there, add it here on purpose.
  const CONFIRMED = new Set([
    "sil-archer", "sil-assassin", "sil-engineer", "sil-healer",
    "sil-mage", "sil-spearman", "sil-summoner", "sil-swordsman",
  ]);
  const creatures = JSON.parse(
    fs.readFileSync(path.join(FORGE_DIR, "prompts", "creature-identity.json"), "utf8"),
  );
  for (const [key, entry] of Object.entries(creatures)) {
    if (key.startsWith("_")) continue;
    assert.ok(
      CONFIRMED.has(entry.silhouette),
      `"${key}" names silhouette "${entry.silhouette}", which is not one of the eight confirmed anchors`,
    );
  }
});

test("loadForge exposes the creature module on the bundle", () => {
  const forge = loadForge({ profile: "character" });
  assert.ok(forge.creatures, "bundle.creatures missing");
  assert.ok(forge.creatures["mob-bramble-stalker"], "bramble-stalker missing from the bundle");
});
