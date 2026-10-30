// Lore & History panel test suite — verifies lore model, name-mapping, and real content parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NAME_MAP,
  applyNameMap,
  buildLoreModel,
  matchConceptArt,
  CHAPTERS,
} from "../js/lore-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

// Load real content files
const worldHistory = readJson("content/studio/world_history_and_concept.json");
const atlas = readJson("content/studio/t_shaped_world_atlas.json");
const continents = [
  readJson("content/studio/continents/continent-01-hearthbloom-basin.json"),
  readJson("content/studio/continents/continent-02-clockwork-steppe.json"),
  readJson("content/studio/continents/continent-03-shattered-halo.json"),
];
const conceptArtIndex = existsSync(resolve(ROOT, "content/concept-art/index.json"))
  ? readJson("content/concept-art/index.json")
  : { version: 1, items: [] };

// Recursive helper to check for 'undefined' or renamed-away names
function collectStrings(obj, strings = []) {
  if (obj === null || obj === undefined) return strings;
  if (typeof obj === "string") {
    strings.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) collectStrings(item, strings);
  } else if (typeof obj === "object") {
    for (const val of Object.values(obj)) collectStrings(val, strings);
  }
  return strings;
}

test("NAME_MAP contains all 43 replacement mappings", () => {
  assert.ok(typeof NAME_MAP === "object" && NAME_MAP !== null);
  const keys = Object.keys(NAME_MAP);
  assert.equal(keys.length, 43);
  assert.equal(NAME_MAP["Talking Island"], "Lantern Cradle");
  assert.equal(NAME_MAP["Queen Ant"], "Ash-Brood Matriarch");
  assert.equal(NAME_MAP["Keltir"], "Cinder-Vixen");
  assert.equal(NAME_MAP["Prairie Keltir"], "Clover Cinder-Vixen");
  assert.equal(NAME_MAP["Tontatta"], "dwarf");
  assert.equal(NAME_MAP["Adena"], "Hearth-Mark");
  assert.equal(NAME_MAP["Soulshot"], "Hearth-Spark Charge");
  assert.equal(NAME_MAP["Spiritshot"], "Glaze-Resonance Charge");
  assert.equal(NAME_MAP["Elven Ruins"], "First-Kiln Vaults");
});

test("applyNameMap substitutes old names with word boundaries and length precedence", () => {
  assert.equal(
    applyNameMap("Kiln-Saint Pyraea — Queen Ant Ash-Brood Sovereign"),
    "Kiln-Saint Pyraea — Ash-Brood Matriarch Sovereign",
  );
  assert.equal(
    applyNameMap("Talking Island Elven Ruins Stele — Einhovant's First Chronomancy Tablet"),
    "Lantern Cradle First-Kiln Vaults Stele — Solenne's First Chronomancy Tablet",
  );
  assert.equal(
    applyNameMap("Young Prairie Keltir hunts with Prairie Keltir and Keltir"),
    "Cinder-Vixen Kit hunts with Clover Cinder-Vixen and Cinder-Vixen",
  );
  assert.equal(
    applyNameMap("Dwarf (Tontatta-Lineage Micro-Titans)"),
    "Dwarf (Root-Forged Micro-Titans)",
  );
  assert.equal(applyNameMap(null), "");
  assert.equal(applyNameMap(undefined), "");
  assert.equal(applyNameMap("Untouched string without old names"), "Untouched string without old names");
});

test("buildLoreModel produces structured model from REAL content files", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  assert.ok(model, "Model should be created");
  assert.ok(model.premise, "Premise chapter present");
  assert.ok(model.epochs, "Epochs chapter present");
  assert.ok(model.gods, "Gods chapter present");
  assert.ok(model.races, "Races chapter present");
  assert.ok(model.continents, "Continents chapter present");
  assert.ok(model.bossLadder, "Boss ladder chapter present");
  assert.ok(model.mysteries, "Mysteries chapter present");

  // Premise verification
  assert.ok(model.premise.playerIdentity.length > 0);
  assert.ok(model.premise.whyEnterWorld.length > 0);
  assert.ok(model.premise.incitingPhenomenon.length > 0);

  // 4 Epochs verification
  assert.equal(model.epochs.length, 4, "Must have exactly 4 epochs (1.1 to 1.4)");
  const epochCodes = model.epochs.map((e) => e.chapterCode);
  assert.deepEqual(epochCodes, ["1.1", "1.2", "1.3", "1.4"]);
  for (const ep of model.epochs) {
    assert.ok(ep.name.length > 0);
    assert.ok(ep.coreRationale.length > 0);
    assert.ok(Array.isArray(ep.worldScars));
  }

  // 9 Gods verification (1 Architect + 8 Sealed Gods)
  assert.equal(model.gods.all.length, 9, "Must have exactly 9 gods");
  assert.equal(model.gods.architect.id, "god-the-architect");
  assert.equal(model.gods.architect.name, "Aethelgard, The Architect");
  assert.equal(model.gods.sealedGods.length, 8, "Must have 8 sealed gods");
  for (const god of model.gods.all) {
    assert.ok(god.name.length > 0, `God ${god.id} has non-empty name`);
    assert.ok(god.title.length > 0, `God ${god.id} has non-empty title`);
    assert.ok(god.domain.length > 0, `God ${god.id} has non-empty domain`);
    assert.ok(god.sealStatus.length > 0, `God ${god.id} has non-empty sealStatus`);
    assert.ok(god.mvpApostleTitle.length > 0, `God ${god.id} has non-empty mvpApostleTitle`);
    assert.ok(god.geographicalScar.length > 0, `God ${god.id} has non-empty geographicalScar`);
    assert.ok(god.architecturalImprint.length > 0, `God ${god.id} has non-empty architecturalImprint`);
  }

  // 6 Races verification
  assert.equal(model.races.length, 6, "Must have exactly 6 mortal races");
  const expectedRaces = [
    "race-human-demi-human",
    "race-dwarf",
    "race-ogre-orc",
    "race-furral",
    "race-lunar",
    "race-dark-lunar",
  ];
  assert.deepEqual(
    model.races.map((r) => r.id),
    expectedRaces,
  );
  for (const race of model.races) {
    assert.ok(race.name.length > 0);
    assert.ok(race.homeTownId.length > 0);
    assert.ok(race.homeTownName.length > 0);
    assert.ok(race.archetypeRef.length > 0);
    assert.ok(Array.isArray(race.farmingResources) && race.farmingResources.length > 0);
    assert.ok(race.combatTrait.length > 0);
    assert.ok(race.nichedStory.length > 0);
  }

  // 3 Continents verification
  assert.equal(model.continents.length, 3, "Must have exactly 3 continents");
  const expectedContinents = [
    "continent-01-hearthbloom-basin",
    "continent-02-clockwork-steppe",
    "continent-03-shattered-halo",
  ];
  assert.deepEqual(
    model.continents.map((c) => c.id),
    expectedContinents,
  );
  for (const cont of model.continents) {
    assert.ok(cont.name.length > 0);
    assert.ok(cont.levelBand.length > 0);
    assert.ok(cont.coreRationale.length > 0);
    assert.ok(cont.causalSummary.length > 0);
    assert.ok(Array.isArray(cont.warScars) && cont.warScars.length > 0);
    assert.ok(cont.climateProfile.macroBiome.length > 0);
    assert.ok(cont.civilizationStyle.cultureArchetype.length > 0);
    assert.ok(Array.isArray(cont.travelLinks));
  }

  // Boss Hierarchy verification
  assert.equal(
    model.bossLadder.strictOrderLaw,
    "GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB",
  );
  assert.equal(model.bossLadder.tiers.length, 4);
  assert.equal(model.bossLadder.chains.length, 6, "Must have 6 boss hierarchy chains from atlas");
  for (const chain of model.bossLadder.chains) {
    assert.ok(chain.godId.length > 0);
    assert.ok(chain.godName.length > 0);
    assert.ok(Array.isArray(chain.mvpApostles) && chain.mvpApostles.length > 0);
    assert.ok(Array.isArray(chain.raidBosses) && chain.raidBosses.length > 0);
    assert.ok(Array.isArray(chain.miniBosses) && chain.miniBosses.length > 0);
    assert.ok(Array.isArray(chain.minionFamilies) && chain.minionFamilies.length > 0);
  }

  // Mysteries verification
  assert.ok(model.mysteries.summary.length > 0);
  assert.ok(Array.isArray(model.mysteries.items) && model.mysteries.items.length >= 2);
  for (const item of model.mysteries.items) {
    assert.ok(item.title.length > 0);
    assert.ok(item.unansweredQuestion.length > 0);
  }
});

test("Model contains NO 'undefined' strings anywhere", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  const allStrings = collectStrings(model);
  assert.ok(allStrings.length > 100, "Should have extracted strings from model");
  for (const str of allStrings) {
    assert.ok(
      !str.includes("undefined"),
      `Found forbidden 'undefined' string in model: "${str.slice(0, 80)}"`,
    );
    assert.ok(
      !str.includes("null") || str.includes("annul") || str.includes("nullify"),
      `Found suspicious 'null' in string: "${str.slice(0, 80)}"`,
    );
  }
});

test("Model contains NO renamed-away name from name-map.json in any output string", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  const allStrings = collectStrings(model);
  const oldNames = Object.keys(NAME_MAP);

  for (const str of allStrings) {
    for (const old of oldNames) {
      const regex = new RegExp(`\\b${old.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`);
      assert.ok(
        !regex.test(str),
        `Found renamed-away name "${old}" in model output: "${str}"`,
      );
    }
  }
});

test("matchConceptArt matches by loreRef and zoneId and handles empty index", () => {
  const sampleIndex = {
    version: 1,
    items: [
      {
        id: "art-architect-meridian",
        title: "The Prime Meridian",
        category: "key-art",
        zoneId: "town-lantern-hollow",
        loreRef: "god-the-architect",
        caption: "Aethelgard carving the first seal.",
        file: "images/art-architect-meridian.webp",
        thumb: "thumbs/art-architect-meridian.webp",
      },
      {
        id: "art-epoch-creation",
        title: "Creation Crucible",
        category: "key-art",
        zoneId: "",
        loreRef: "epoch-1-1-creation",
        caption: "The birth of the twelve lineages.",
        file: "images/art-epoch-creation.webp",
        thumb: "thumbs/art-epoch-creation.webp",
      },
    ],
  };

  const epochArt = matchConceptArt(sampleIndex, { loreRef: "epoch-1-1-creation" });
  assert.equal(epochArt.length, 1);
  assert.equal(epochArt[0].id, "art-epoch-creation");

  const godArt = matchConceptArt(sampleIndex, { loreRef: "god-the-architect" });
  assert.equal(godArt.length, 1);
  assert.equal(godArt[0].id, "art-architect-meridian");

  const zoneArt = matchConceptArt(sampleIndex, { zoneId: "town-lantern-hollow" });
  assert.equal(zoneArt.length, 1);

  // Empty index handling
  assert.deepEqual(matchConceptArt(null, { loreRef: "any" }), []);
  assert.deepEqual(matchConceptArt({ items: [] }, { loreRef: "any" }), []);
  assert.deepEqual(matchConceptArt(conceptArtIndex, { loreRef: "nonexistent-lore-ref" }), []);
  if (conceptArtIndex.items.length > 0) {
    const realEpochArt = matchConceptArt(conceptArtIndex, { loreRef: "epoch-1-1-creation" });
    assert.equal(realEpochArt.length, 1);
    assert.equal(realEpochArt[0].id, "key-art-epoch-1-1-creation");
  }
});

test("Continent cards match their concept art and Human/Dwarf race cards exclude town building art", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  // Direct loreRef match for each continent without ID-stripping cheat
  assert.equal(
    matchConceptArt(conceptArtIndex, { loreRef: "continent-01-hearthbloom-basin" })[0]?.id,
    "continent-hearthbloom-basin",
    "continent-hearthbloom-basin in index.json must have loreRef 'continent-01-hearthbloom-basin'",
  );
  assert.equal(
    matchConceptArt(conceptArtIndex, { loreRef: "continent-02-clockwork-steppe" })[0]?.id,
    "continent-clockwork-steppe",
    "continent-clockwork-steppe in index.json must have loreRef 'continent-02-clockwork-steppe'",
  );
  assert.equal(
    matchConceptArt(conceptArtIndex, { loreRef: "continent-03-shattered-halo" })[0]?.id,
    "continent-shattered-halo",
    "continent-shattered-halo in index.json must have loreRef 'continent-03-shattered-halo'",
  );

  assert.deepEqual(
    model.continents.map((c) => c.arts.length),
    [1, 1, 1],
    "Each of the 3 continents in Chapter 5 must match its continent concept art",
  );

  // God cards must not pull in continent landscape vistas
  for (const god of model.gods.all) {
    const godArtIds = god.arts.map((a) => a.id);
    assert.ok(
      !godArtIds.some((id) => id.startsWith("continent-")),
      `God card ${god.id} must not pull in continent landscape art: ${godArtIds.join(", ")}`,
    );
  }

  const humanArts = model.races[0].arts.map((a) => a.id);
  assert.ok(
    !humanArts.includes("town-lantern-hollow-hearth-forge"),
    "Human race card must not pull in Dwarf forgehouse art via shared home_town_id",
  );
  assert.ok(
    humanArts.includes("character-race-human-hearth-keeper"),
    "Human race card must include Human Hearth-Keeper portrait",
  );

  const dwarfArts = model.races[1].arts.map((a) => a.id);
  assert.deepEqual(
    dwarfArts,
    ["character-race-dwarf-kiln-artisan"],
    "Dwarf race card must only show Dwarf race portrait and not Human town building town-lantern-hollow-hearth-forge",
  );
});

test("Model contains NO real game/franchise titles, superseded Undertow canon, unmapped L2 names, or stuttered substitutions", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  const allStrings = collectStrings(model);
  const forbiddenCaseInsensitive = [
    "ragnarok online",
    "ragnarok",
    "lineage ii",
    "lineage 2",
    "genshin impact",
    "genshin",
    "one piece",
    "sulong",
    "mink",
    "electro",
    "sahaguin",
    "world of warcraft",
    "final fantasy",
    "undertow",
    "millcross",
    "cindervast",
    "thornveil",
    "cruma",
    "porta",
    "excuro",
    "catherok",
    "oriharukon",
  ];
  const forbiddenExactSubstrings = [
    "dwarf-Lineage",
    "dwarf Mighty",
    "Ash-Brood Matriarch Ash-Brood",
    "fenrir-kael",
    "Core — Prime Governor",
    "Core's Escapement Ring",
  ];

  for (const str of allStrings) {
    const isAssetIdOrPath = /^(?:images\/|thumbs\/)?character-race-furral-electro-scout(?:\.webp)?$/.test(str);
    for (const term of forbiddenCaseInsensitive) {
      if (term === "electro" && isAssetIdOrPath) continue;
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i");
      assert.ok(
        !regex.test(str),
        `Found forbidden term "${term}" in model output: "${str}"`,
      );
    }
    for (const sub of forbiddenExactSubstrings) {
      assert.ok(
        !str.includes(sub),
        `Found unpolished/stuttered substring "${sub}" in model output: "${str}"`,
      );
    }
  }

  // General token normalization edge cases (un-anchored mid-sentence, end-of-string, standalone tokens, concept-art sanitization)
  assert.ok(!/one piece/i.test(applyNameMap("Warriors inspired by One Piece.")));
  assert.ok(!/one piece/i.test(applyNameMap("Adapted from One Piece")));
  assert.equal(applyNameMap("a Tontatta Mighty blow"), "a Dwarven Mighty blow");
  assert.ok(!/\bmink\b/i.test(applyNameMap("agile Mink scouts")));
  assert.ok(!/\belectro\b/i.test(applyNameMap("channel bio-static Electro through fur")));
  assert.ok(!/\bsahaguin\b/i.test(applyNameMap("Pelagic Coral & Undertide Sahaguin")));
  assert.ok(!/\bcore\b/i.test(applyNameMap("Defeat Core in the inner ring")));
  for (const compound of [
    "B3 Core Sanctum",
    "Octagonal Telemetry Core",
    "Fortress Forge Core",
    "the Inner Seal-Core Rotunda",
    "[Mini-Boss] Core Firewall Praetor",
  ]) {
    assert.equal(applyNameMap(compound), compound, `compound name must survive: ${compound}`);
  }
  assert.equal(
    applyNameMap("[MVP] Core — Architect"),
    "[MVP] Prime Governor — Architect",
  );
  assert.equal(applyNameMap("First paragraph.\n\nSecond one."), "First paragraph.\n\nSecond one.");

  const dirtyArt = matchConceptArt(
    {
      items: [
        {
          id: "art-dirty",
          loreRef: "epoch-1-1-creation",
          title: "Prairie Keltir in Gludin",
          caption: "Inspired by One Piece and Mink tribes.",
        },
      ],
    },
    { loreRef: "epoch-1-1-creation" },
  );
  assert.equal(dirtyArt[0].title, "Clover Cinder-Vixen in Cinderport");
  assert.ok(!/one piece|mink/i.test(dirtyArt[0].caption));
});

test("lore.mjs panel mounts DOM, renders stat chips without raw HTML tags, and handles chapter/ref deep-links safely", async () => {
  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.className = "";
      this.id = "";
      this.type = "";
      this.hidden = false;
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.children = [];
      this.listeners = {};
      this._textContent = "";
      this.scrolledIntoView = false;
      this.classList = {
        add: (...cls) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          cls.forEach((c) => set.add(c));
          this.className = [...set].join(" ");
        },
        remove: (...cls) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          cls.forEach((c) => set.delete(c));
          this.className = [...set].join(" ");
        },
        toggle: (c, force) => {
          const has = this.className.split(/\s+/).filter(Boolean).includes(c);
          const next = force !== undefined ? Boolean(force) : !has;
          if (next) this.classList.add(c);
          else this.classList.remove(c);
          return next;
        },
        contains: (c) => this.className.split(/\s+/).filter(Boolean).includes(c),
      };
    }
    get textContent() {
      if (this.children.length === 0) return this._textContent;
      return this._textContent + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
    }
    set textContent(v) {
      this.children = [];
      this._textContent = v === null || v === undefined ? "" : String(v);
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === "string") {
          const t = new FakeElement("#text");
          t.textContent = n;
          this.children.push(t);
        } else if (n) {
          this.children.push(n);
        }
      }
    }
    replaceChildren(...nodes) {
      this.children = [];
      this._textContent = "";
      this.append(...nodes);
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }
    getAttribute(k) {
      return this.attributes[k] ?? null;
    }
    addEventListener(ev, fn) {
      (this.listeners[ev] ||= []).push(fn);
    }
    scrollIntoView() {
      this.scrolledIntoView = true;
    }
    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        if (!node || typeof node !== "object" || node.tagName === "#TEXT") return;
        if (matchesSelector(node, selector)) results.push(node);
        for (const ch of node.children || []) visit(ch);
      };
      for (const ch of this.children || []) visit(ch);
      return results;
    }
    querySelector(selector) {
      // Simulate real browser DOMException on unescaped '.' or ':' in #id selector
      if (/^#[A-Za-z0-9_-]*[.:]/.test(selector)) {
        throw new Error(`SyntaxError: '${selector}' is not a valid selector`);
      }
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  function matchesSelector(node, selector) {
    if (selector.startsWith("#")) {
      return node.id === selector.slice(1);
    }
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return (node.className || "").split(/\s+/).includes(cls);
    }
    return node.tagName.toLowerCase() === selector.toLowerCase();
  }

  const host = new FakeElement("div");
  host.id = "panelHost";
  const lastParams = [];

  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => (id === "panelHost" ? host : host.querySelector(`#${id}`)),
  };
  globalThis.window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    atlasSetParams: (patch) => lastParams.push(patch),
  };
  globalThis.fetch = async (url) => {
    const map = {
      "/content/studio/world_history_and_concept.json": worldHistory,
      "/content/studio/t_shaped_world_atlas.json": atlas,
      "/content/studio/continents/continent-01-hearthbloom-basin.json": continents[0],
      "/content/studio/continents/continent-02-clockwork-steppe.json": continents[1],
      "/content/studio/continents/continent-03-shattered-halo.json": continents[2],
      "/content/concept-art/index.json": conceptArtIndex,
    };
    if (url in map) {
      return { ok: true, status: 200, json: async () => map[url] };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  await import("../js/panels/lore.mjs");
  await globalThis.window.ATLAS_PANELS.show("lore", { chapter: "1.1" });
  const panelEl = host.querySelector("section") || host;
  const loreContainer = panelEl.querySelector(".lore-container");
  assert.ok(loreContainer, "renderLorePage must mount .lore-container and not fail on chapter=1.1");
  assert.equal(panelEl.querySelector(".lore-banner--error"), null, "must not show error banner on chapter=1.1");

  const statChips = panelEl.querySelectorAll(".lore-stat-chip");
  assert.equal(statChips.length, 6, "must render 6 stat chips");
  for (const chip of statChips) {
    assert.ok(!chip.textContent.includes("<strong>"), `stat chip must not render raw <strong> tag: ${chip.textContent}`);
    assert.ok(chip.querySelector("strong"), "stat chip must contain a child <strong> DOM element");
  }

  // Deep link via ref parameter (from Concept Arts lightbox)
  await globalThis.window.ATLAS_PANELS.show("lore", { ref: "dwarf" });
  const dwarfCard = panelEl.querySelector("#lore-ref-dwarf");
  assert.ok(dwarfCard, "must render #lore-ref-dwarf anchor on race card");
  assert.equal(dwarfCard.scrolledIntoView, true, "show({ ref: 'dwarf' }) must scroll to referenced lore card");

  // Item 1: Deep links for beast_animal_brute, mystery-*, and race-* resolve and scroll to specific DOM cards/steps
  dwarfCard.scrolledIntoView = false;
  await globalThis.window.ATLAS_PANELS.show("lore", { ref: "race-dwarf" });
  assert.equal(dwarfCard.scrolledIntoView, true, "show({ ref: 'race-dwarf' }) must resolve #lore-ref-dwarf and scroll into view");

  await globalThis.window.ATLAS_PANELS.show("lore", { ref: "beast_animal_brute" });
  const beastStep = panelEl.querySelector("#lore-ref-beast_animal_brute");
  assert.ok(beastStep, "must render #lore-ref-beast_animal_brute on Rank 4 field monster tier step");
  assert.equal(beastStep.scrolledIntoView, true, "show({ ref: 'beast_animal_brute' }) must scroll to #lore-ref-beast_animal_brute");

  await globalThis.window.ATLAS_PANELS.show("lore", { ref: "mystery-cardamom-caldera" });
  const mysteryCard = panelEl.querySelector("#lore-ref-mystery-cardamom-caldera");
  assert.ok(mysteryCard, "must render #lore-ref-mystery-cardamom-caldera on mystery card");
  assert.equal(mysteryCard.scrolledIntoView, true, "show({ ref: 'mystery-cardamom-caldera' }) must scroll to #lore-ref-mystery-cardamom-caldera");

  // Item 2: Clicking chapter nav button updates URL params via atlasSetParams (kills M1)
  const navBtns = panelEl.querySelectorAll(".lore-nav-btn");
  const godsBtn = navBtns.find((b) => b.dataset.chapter === "gods");
  const premiseBtn = navBtns.find((b) => b.dataset.chapter === "premise");
  assert.ok(godsBtn && premiseBtn, "must render gods and premise chapter nav buttons");
  godsBtn.listeners.click[0]();
  assert.equal(lastParams.length, 1, "clicking chapter nav button must call atlasSetParams");
  assert.deepEqual(lastParams[0], { tab: "lore", chapter: "gods", ref: null });
  assert.equal(godsBtn.classList.contains("is-active"), true, "gods button must be active after click");

  // Item 2: Browser Back to ?tab=lore (show("lore", {})) resets activeChapterId to "premise" (kills M2)
  const premiseSec = panelEl.querySelector("#lore-chapter-premise");
  premiseSec.scrolledIntoView = false;
  await globalThis.window.ATLAS_PANELS.show("lore", {});
  assert.equal(premiseBtn.classList.contains("is-active"), true, "show('lore', {}) must reset active chapter to premise");
  assert.equal(godsBtn.classList.contains("is-active"), false, "show('lore', {}) must deactivate previous chapter button");
  assert.equal(premiseSec.scrolledIntoView, true, "show('lore', {}) must scroll back to #lore-chapter-premise");
});

test("CHAPTERS constant defines sticky navigation tabs", () => {
  assert.ok(Array.isArray(CHAPTERS));
  assert.ok(CHAPTERS.length >= 7);
  const ids = CHAPTERS.map((c) => c.id);
  assert.ok(ids.includes("premise"));
  assert.ok(ids.includes("epochs"));
  assert.ok(ids.includes("gods"));
  assert.ok(ids.includes("races"));
  assert.ok(ids.includes("continents"));
  assert.ok(ids.includes("bosses"));
  assert.ok(ids.includes("mysteries"));
});

test("buildLoreModel edge cases: null/missing inputs don't crash", () => {
  const fallback = buildLoreModel(null);
  assert.ok(fallback);
  assert.deepEqual(fallback.epochs, []);
  assert.deepEqual(fallback.races, []);
  assert.deepEqual(fallback.continents, []);
});

test("No empty cards: every card across all chapters has required fields populated", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  // Epoch cards
  for (const ep of model.epochs) {
    assert.ok(ep.name && ep.name.trim().length > 0, `Epoch ${ep.id} name is empty`);
    assert.ok(ep.coreRationale && ep.coreRationale.trim().length > 0, `Epoch ${ep.id} coreRationale is empty`);
    for (const sc of ep.worldScars) {
      assert.ok(sc.name && sc.name.trim().length > 0, `Scar in epoch ${ep.id} name is empty`);
      assert.ok(sc.description && sc.description.trim().length > 0, `Scar in epoch ${ep.id} description is empty`);
    }
  }

  // God cards
  for (const god of model.gods.all) {
    assert.ok(god.name && god.name.trim().length > 0, `God ${god.id} name is empty`);
    assert.ok(god.title && god.title.trim().length > 0, `God ${god.id} title is empty`);
    assert.ok(god.domain && god.domain.trim().length > 0, `God ${god.id} domain is empty`);
    assert.ok(god.coreRationale && god.coreRationale.trim().length > 0, `God ${god.id} coreRationale is empty`);
    assert.ok(god.geographicalScar && god.geographicalScar.trim().length > 0, `God ${god.id} geographicalScar is empty`);
    assert.ok(god.architecturalImprint && god.architecturalImprint.trim().length > 0, `God ${god.id} architecturalImprint is empty`);
    assert.ok(god.mvpApostleTitle && god.mvpApostleTitle.trim().length > 0, `God ${god.id} mvpApostleTitle is empty`);
  }

  // Race cards
  for (const race of model.races) {
    assert.ok(race.name && race.name.trim().length > 0, `Race ${race.id} name is empty`);
    assert.ok(race.homeTownName && race.homeTownName.trim().length > 0, `Race ${race.id} homeTownName is empty`);
    assert.ok(race.archetypeRef && race.archetypeRef.trim().length > 0, `Race ${race.id} archetypeRef is empty`);
    assert.ok(race.combatTrait && race.combatTrait.trim().length > 0, `Race ${race.id} combatTrait is empty`);
    assert.ok(race.nichedStory && race.nichedStory.trim().length > 0, `Race ${race.id} nichedStory is empty`);
    assert.ok(race.farmingResources.length > 0, `Race ${race.id} has no farming resources`);
  }

  // Continent cards
  for (const cont of model.continents) {
    assert.ok(cont.name && cont.name.trim().length > 0, `Continent ${cont.id} name is empty`);
    assert.ok(cont.levelBand && cont.levelBand.trim().length > 0, `Continent ${cont.id} levelBand is empty`);
    assert.ok(cont.coreRationale && cont.coreRationale.trim().length > 0, `Continent ${cont.id} coreRationale is empty`);
    assert.ok(cont.causalSummary && cont.causalSummary.trim().length > 0, `Continent ${cont.id} causalSummary is empty`);
    assert.ok(cont.climateProfile.macroBiome && cont.climateProfile.macroBiome.trim().length > 0, `Continent ${cont.id} macroBiome is empty`);
    assert.ok(cont.civilizationStyle.cultureArchetype && cont.civilizationStyle.cultureArchetype.trim().length > 0, `Continent ${cont.id} cultureArchetype is empty`);
    assert.ok(cont.warScars.length > 0, `Continent ${cont.id} has no war scars`);
  }

  // Boss Tiers & Chains
  for (const tier of model.bossLadder.tiers) {
    assert.ok(tier.name && tier.name.trim().length > 0, `Tier ${tier.rank} name is empty`);
    assert.ok(tier.cosmicRole && tier.cosmicRole.trim().length > 0, `Tier ${tier.rank} cosmicRole is empty`);
    assert.ok(tier.powerRelationship && tier.powerRelationship.trim().length > 0, `Tier ${tier.rank} powerRelationship is empty`);
    assert.ok(tier.lootTier && tier.lootTier.trim().length > 0, `Tier ${tier.rank} lootTier is empty`);
  }
  for (const ch of model.bossLadder.chains) {
    assert.ok(ch.godName && ch.godName.trim().length > 0, `Boss chain godName is empty`);
    assert.ok(ch.chapterEpoch && ch.chapterEpoch.trim().length > 0, `Boss chain chapterEpoch is empty`);
    assert.ok(ch.mvpApostles.length > 0, `Boss chain ${ch.godId} has no MVP apostles`);
    assert.ok(ch.raidBosses.length > 0, `Boss chain ${ch.godId} has no raid bosses`);
  }

  // Mysteries
  for (const item of model.mysteries.items) {
    assert.ok(item.title && item.title.trim().length > 0, `Mystery title is empty`);
    assert.ok(item.unansweredQuestion && item.unansweredQuestion.trim().length > 0, `Mystery unansweredQuestion is empty`);
    assert.ok(item.inWorldRumor && item.inWorldRumor.trim().length > 0, `Mystery inWorldRumor is empty`);
    assert.ok(item.visualSilhouette && item.visualSilhouette.trim().length > 0, `Mystery visualSilhouette is empty`);
  }
});

test("Mysteries keep teasing without revealing hidden answers", () => {
  const model = buildLoreModel({
    worldHistory,
    atlas,
    continents,
    conceptArtIndex,
  });

  for (const m of model.mysteries.items) {
    // Every unanswered question must actually be a question
    assert.ok(m.unansweredQuestion.endsWith("?"), `Mystery ${m.id} question should end with a question mark`);
    // Teaser wording check: never contains definitive spoiler indicators
    assert.ok(!m.unansweredQuestion.toLowerCase().includes("solution:"));
    assert.ok(!m.unansweredQuestion.toLowerCase().includes("spoiler:"));
  }
});

