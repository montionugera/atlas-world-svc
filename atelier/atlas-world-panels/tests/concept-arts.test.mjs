// Concept Arts Model & Verification Gate tests.
// Pins schema compliance, file existence, size/dimension limits, zone resolution,
// name-map / real-game title bans, filtering, grouping, and deep-link generation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SCHEMA_CATEGORIES,
  SCHEMA_FIELDS,
  SCHEMA_TOOLS,
  buildConceptArtDeepLink,
  extractHeroKeyArt,
  filterConceptArts,
  groupConceptArtsByCategory,
  groupConceptArtsByZone,
  loadStudioNodeIds,
  parseConceptArtParams,
  parseWebpDimensions,
  resolveZoneName,
  runConceptArtsGate,
  validateConceptArtItem,
} from "../js/concept-arts-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const REAL_INDEX_PATH = resolve(ROOT, "content/concept-art/index.json");
const REAL_STUDIO_DIR = resolve(ROOT, "content/studio");

test("schema constants are properly defined", () => {
  assert.ok(Array.isArray(SCHEMA_FIELDS));
  assert.ok(SCHEMA_FIELDS.includes("id"));
  assert.ok(SCHEMA_FIELDS.includes("title"));
  assert.ok(SCHEMA_FIELDS.includes("category"));
  assert.ok(SCHEMA_FIELDS.includes("zoneId"));
  assert.ok(SCHEMA_FIELDS.includes("loreRef"));
  assert.ok(SCHEMA_FIELDS.includes("caption"));
  assert.ok(SCHEMA_FIELDS.includes("file"));
  assert.ok(SCHEMA_FIELDS.includes("thumb"));
  assert.ok(SCHEMA_FIELDS.includes("prompt"));
  assert.ok(SCHEMA_FIELDS.includes("tool"));
  assert.ok(SCHEMA_FIELDS.includes("rights"));
  assert.ok(SCHEMA_FIELDS.includes("verdict"));

  assert.deepEqual(SCHEMA_CATEGORIES, [
    "key-art",
    "town",
    "zone",
    "dungeon",
    "character",
    "mob",
    "boss",
    "item",
  ]);
});

test("loadStudioNodeIds discovers real studio nodes", () => {
  const nodes = loadStudioNodeIds(REAL_STUDIO_DIR);
  assert.ok(nodes instanceof Map);
  assert.ok(nodes.size > 50, `Expected > 50 studio nodes, found ${nodes.size}`);
  assert.ok(nodes.has("town-flywheel-governor-hub"));
  assert.equal(nodes.get("town-flywheel-governor-hub"), "Flywheel-Governor Hub");
});

test("resolveZoneName maps studio node id to human name", () => {
  const nodeMap = new Map([
    ["town-flywheel-governor-hub", "Flywheel-Governor Hub"],
    ["hunting-area-gyroscope-rim-overlook", "Gyroscope-Rim Overlook"],
  ]);
  assert.equal(resolveZoneName("town-flywheel-governor-hub", nodeMap), "Flywheel-Governor Hub");
  assert.equal(resolveZoneName("unknown-zone-id", nodeMap), "unknown-zone-id");
  assert.equal(resolveZoneName("", nodeMap), "");
  assert.equal(resolveZoneName(null, nodeMap), "");
});

test("extractHeroKeyArt selects key-art items first", () => {
  const items = [
    { id: "town-1", category: "town", title: "Town 1" },
    { id: "hero-1", category: "key-art", title: "Hero Art" },
    { id: "hero-2", category: "key-art", title: "Second Hero Art" },
  ];
  const hero = extractHeroKeyArt(items);
  assert.equal(hero.id, "hero-1");

  const noHero = extractHeroKeyArt([{ id: "town-1", category: "town" }]);
  assert.equal(noHero, null);

  assert.equal(extractHeroKeyArt([]), null);
});

test("filterConceptArts filters by category, zone, and search text", () => {
  const items = [
    {
      id: "flywheel-hub",
      title: "Flywheel-Governor Hub Citadel",
      category: "town",
      zoneId: "town-flywheel-governor-hub",
      caption: "A brass citadel perched over churning steam vents.",
      prompt: "Centrifugal steam turbine city architecture, high detail.",
    },
    {
      id: "kinetic-vault",
      title: "Kinetic Ballast Vault",
      category: "dungeon",
      zoneId: "dungeon-kinetic-ballast-vault",
      caption: "Subterranean clockwork labyrinth of heavy pendulum counterweights.",
      prompt: "Clockwork dungeon interior with giant moving gears and chains.",
    },
    {
      id: "cinder-matriarch",
      title: "Cinder-Vixen Matriarch",
      category: "boss",
      zoneId: "",
      caption: "Vitrified ember beast stalking the volcanic ash verges.",
      prompt: "Vitrified kiln beast glowing with amber glaze.",
    },
  ];

  // Category filter
  assert.equal(filterConceptArts(items, { category: "town" }).length, 1);
  assert.equal(filterConceptArts(items, { category: "dungeon" }).length, 1);
  assert.equal(filterConceptArts(items, { category: "all" }).length, 3);

  // Zone filter
  assert.equal(filterConceptArts(items, { zone: "town-flywheel-governor-hub" }).length, 1);
  assert.equal(filterConceptArts(items, { zone: "nonexistent" }).length, 0);

  // Search filter (matches title, caption, prompt, category, id)
  assert.equal(filterConceptArts(items, { text: "citadel" }).length, 1);
  assert.equal(filterConceptArts(items, { text: "ballast" }).length, 1);
  assert.equal(filterConceptArts(items, { text: "clockwork" }).length, 1);
  assert.equal(filterConceptArts(items, { text: "vitrified" }).length, 1);
  assert.equal(filterConceptArts(items, { text: "NO_MATCH" }).length, 0);

  // Combined
  assert.equal(
    filterConceptArts(items, { category: "town", zone: "town-flywheel-governor-hub", text: "steam" }).length,
    1,
  );
  assert.equal(
    filterConceptArts(items, { category: "dungeon", zone: "town-flywheel-governor-hub" }).length,
    0,
  );
});

test("groupConceptArtsByCategory groups in canon category order", () => {
  const items = [
    { id: "boss-1", category: "boss" },
    { id: "town-1", category: "town" },
    { id: "town-2", category: "town" },
    { id: "key-1", category: "key-art" },
  ];
  const groups = groupConceptArtsByCategory(items);
  assert.ok(Array.isArray(groups));
  assert.equal(groups[0].category, "key-art");
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[1].category, "town");
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[2].category, "boss");
  assert.equal(groups[2].items.length, 1);
});

test("groupConceptArtsByZone groups items by zone name", () => {
  const nodeMap = new Map([["town-a", "Town Alpha"], ["zone-b", "Zone Beta"]]);
  const items = [
    { id: "1", zoneId: "town-a" },
    { id: "2", zoneId: "zone-b" },
    { id: "3", zoneId: "town-a" },
    { id: "4", zoneId: "" },
  ];
  const groups = groupConceptArtsByZone(items, (id) => resolveZoneName(id, nodeMap));
  assert.ok(groups.length >= 3);
  const townGroup = groups.find((g) => g.zoneId === "town-a");
  assert.ok(townGroup);
  assert.equal(townGroup.zoneName, "Town Alpha");
  assert.equal(townGroup.items.length, 2);

  const unassigned = groups.find((g) => g.zoneId === "");
  assert.ok(unassigned);
  assert.equal(unassigned.zoneName, "World & General");
});

test("deep link helpers generate and parse params from URLSearchParams, string, and plain ATLAS_PARAMS object", () => {
  const link = buildConceptArtDeepLink({ category: "town", zone: "zone-1", id: "art-1" });
  assert.equal(link, "?tab=concept-arts&category=town&zone=zone-1&id=art-1");

  const parsed = parseConceptArtParams(new URLSearchParams("tab=concept-arts&category=dungeon&id=art-99"));
  assert.equal(parsed.category, "dungeon");
  assert.equal(parsed.zone, "");
  assert.equal(parsed.id, "art-99");

  // Plain object from registry.mjs (ATLAS_PARAMS) must not throw p.get is not a function
  const emptyObjParsed = parseConceptArtParams({});
  assert.deepEqual(emptyObjParsed, { category: "", zone: "", id: "", search: "" });

  const populatedObjParsed = parseConceptArtParams({
    category: "town",
    zone: "town-lantern-hollow",
    id: "town-lantern-hollow-gate-approach",
    search: "lantern",
  });
  assert.deepEqual(populatedObjParsed, {
    category: "town",
    zone: "town-lantern-hollow",
    id: "town-lantern-hollow-gate-approach",
    search: "lantern",
  });

  assert.deepEqual(parseConceptArtParams(null), { category: "", zone: "", id: "", search: "" });
});

test("GATE: real content/concept-art/index.json passes the gate", () => {
  const raw = readFileSync(REAL_INDEX_PATH, "utf8");
  const doc = JSON.parse(raw);
  const result = runConceptArtsGate(doc, {
    baseDir: resolve(ROOT, "content/concept-art"),
    studioDir: REAL_STUDIO_DIR,
  });
  assert.equal(result.valid, true, `Real index.json must pass gate, errors: ${result.errors.join("; ")}`);
});

test("GATE: passes on an empty items list", () => {
  const doc = { version: 1, items: [] };
  const result = runConceptArtsGate(doc, {
    baseDir: resolve(ROOT, "content/concept-art"),
    studioDir: REAL_STUDIO_DIR,
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("GATE: fails when schema fields are missing or invalid", () => {
  const badItemMissingField = {
    id: "test-art-1",
    title: "Test Title",
    category: "town",
    // zoneId missing
    loreRef: "",
    caption: "A nice caption.",
    file: "images/test.webp",
    thumb: "thumbs/test.webp",
    prompt: "A test prompt.",
    tool: "nano-banana",
    rights: "concept-reference",
    verdict: "unreviewed",
  };

  const result = runConceptArtsGate(
    { version: 1, items: [badItemMissingField] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: true,
    },
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("missing required field: zoneId")));

  const badCategory = {
    ...badItemMissingField,
    zoneId: "",
    category: "invalid-category",
  };
  const resultCat = runConceptArtsGate(
    { version: 1, items: [badCategory] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: true,
    },
  );
  assert.equal(resultCat.valid, false);
  assert.ok(resultCat.errors.some((e) => e.includes("invalid category")));
});

test("GATE: fails on duplicate ids", () => {
  const itemA = {
    id: "duplicate-id",
    title: "Item A",
    category: "town",
    zoneId: "",
    loreRef: "",
    caption: "Caption A",
    file: "images/a.webp",
    thumb: "thumbs/a.webp",
    prompt: "Prompt A",
    tool: "nano-banana",
    rights: "concept-reference",
    verdict: "unreviewed",
  };
  const itemB = { ...itemA, title: "Item B" };

  const result = runConceptArtsGate(
    { version: 1, items: [itemA, itemB] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: true,
    },
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate id: duplicate-id")));
});

test("GATE: fails on non-empty zoneId that does not exist in content/studio", () => {
  const badZoneItem = {
    id: "bad-zone-item",
    title: "Bad Zone Item",
    category: "zone",
    zoneId: "fake-phantom-zone-id",
    loreRef: "",
    caption: "A phantom place.",
    file: "images/phantom.webp",
    thumb: "thumbs/phantom.webp",
    prompt: "An imaginary non-existent zone.",
    tool: "asset-studio",
    rights: "concept-reference",
    verdict: "unreviewed",
  };

  const result = runConceptArtsGate(
    { version: 1, items: [badZoneItem] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: true,
    },
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("unknown studio node id: fake-phantom-zone-id")));
});

test("GATE: passes when non-empty zoneId is a real studio node id", () => {
  const goodZoneItem = {
    id: "good-zone-item",
    title: "Good Zone Item",
    category: "town",
    zoneId: "town-flywheel-governor-hub",
    loreRef: "",
    caption: "A real canonical town.",
    file: "images/real.webp",
    thumb: "thumbs/real.webp",
    prompt: "A real canonical town prompt.",
    tool: "asset-studio",
    rights: "concept-reference",
    verdict: "unreviewed",
  };

  const result = runConceptArtsGate(
    { version: 1, items: [goodZoneItem] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: true,
    },
  );
  assert.equal(result.valid, true, `Expected valid, got: ${result.errors.join("; ")}`);
});

test("GATE: fails when title, caption, or prompt contains name-map old keys", () => {
  const badItems = [
    {
      id: "name-map-title",
      title: "Wild Keltir in the Field",
      category: "mob",
      zoneId: "",
      loreRef: "",
      caption: "A feral predator on the run.",
      prompt: "A wild canid beast.",
      tool: "google-flow",
      rights: "concept-reference",
      verdict: "unreviewed",
    },
    {
      id: "name-map-caption",
      title: "Old Harbor",
      category: "town",
      zoneId: "",
      loreRef: "",
      caption: "The port was once named Gludin in ancient tongues.",
      prompt: "Coastal harbor city.",
      tool: "google-flow",
      rights: "concept-reference",
      verdict: "unreviewed",
    },
    {
      id: "name-map-prompt",
      title: "Currency Pouch",
      category: "item",
      zoneId: "",
      loreRef: "",
      caption: "A purse of trade tokens.",
      prompt: "Pouch filled with gold Adena coins.",
      tool: "nano-banana",
      rights: "concept-reference",
      verdict: "unreviewed",
    },
  ];

  for (const item of badItems) {
    const result = runConceptArtsGate(
      { version: 1, items: [item] },
      {
        baseDir: resolve(ROOT, "content/concept-art"),
        studioDir: REAL_STUDIO_DIR,
        skipFileCheck: true,
      },
    );
    assert.equal(result.valid, false, `Item ${item.id} should fail for containing name-map old key`);
    assert.ok(result.errors.some((e) => e.includes("forbidden name-map key") || e.includes("forbidden")));
  }
});

test("GATE: fails when title, caption, or prompt contains real game titles", () => {
  const badItems = [
    {
      id: "game-title-ragnarok",
      title: "Ragnarok Online Inspired Warrior",
      category: "character",
      zoneId: "",
      loreRef: "",
      caption: "An adventurous fighter.",
      prompt: "Anime style swordsman.",
      tool: "google-flow",
      rights: "concept-reference",
      verdict: "unreviewed",
    },
    {
      id: "game-title-lineage",
      title: "High Gothic Fortress",
      category: "zone",
      zoneId: "",
      loreRef: "",
      caption: "Castle architecture resembling Lineage 2 siege keeps.",
      prompt: "Massive stone keep.",
      tool: "google-flow",
      rights: "concept-reference",
      verdict: "unreviewed",
    },
    {
      id: "game-title-genshin",
      title: "Verdant Highlands",
      category: "zone",
      zoneId: "",
      loreRef: "",
      caption: "Lush grassy slopes under bright sky.",
      prompt: "Stylized cel-shaded landscape in Genshin Impact aesthetic.",
      tool: "google-flow",
      rights: "concept-reference",
      verdict: "unreviewed",
    },
  ];

  for (const item of badItems) {
    const result = runConceptArtsGate(
      { version: 1, items: [item] },
      {
        baseDir: resolve(ROOT, "content/concept-art"),
        studioDir: REAL_STUDIO_DIR,
        skipFileCheck: true,
      },
    );
    assert.equal(result.valid, false, `Item ${item.id} should fail for containing real game title`);
    assert.ok(result.errors.some((e) => e.includes("forbidden real game title")));
  }
});

test("GATE: fails when file or thumb does not exist on disk", () => {
  const missingFilesItem = {
    id: "missing-files-item",
    title: "Missing Files",
    category: "town",
    zoneId: "",
    loreRef: "",
    caption: "This art file does not exist.",
    file: "images/does-not-exist.webp",
    thumb: "thumbs/does-not-exist.webp",
    prompt: "Prompt for missing art.",
    tool: "nano-banana",
    rights: "concept-reference",
    verdict: "unreviewed",
  };

  const result = runConceptArtsGate(
    { version: 1, items: [missingFilesItem] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: false,
    },
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("file not found")));
  assert.ok(result.errors.some((e) => e.includes("thumb not found")));
});

test("GATE: verifies file size limits and webp dimensions", () => {
  const tmpDir = resolve(ROOT, "atelier/atlas-world-panels/tests/.tmp-gate-test");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(tmpDir, "images"), { recursive: true });
  mkdirSync(join(tmpDir, "thumbs"), { recursive: true });

  try {
    // Create an oversized file (> 400 KB)
    const bigBuf = Buffer.alloc(450 * 1024);
    // Write fake webp header VP8X with dims 1200x800
    bigBuf.write("RIFF", 0, 4, "ascii");
    bigBuf.writeUInt32LE(bigBuf.length - 8, 4);
    bigBuf.write("WEBP", 8, 4, "ascii");
    bigBuf.write("VP8X", 12, 4, "ascii");
    bigBuf.writeUInt32LE(10, 16); // chunk size
    bigBuf.writeUInt8(0, 20); // flags
    // width 1200-1 = 1199 (0x04AF) at 24..26
    bigBuf.writeUInt8(0xaf, 24);
    bigBuf.writeUInt8(0x04, 25);
    bigBuf.writeUInt8(0x00, 26);
    // height 800-1 = 799 (0x031F) at 27..29
    bigBuf.writeUInt8(0x1f, 27);
    bigBuf.writeUInt8(0x03, 28);
    bigBuf.writeUInt8(0x00, 29);

    writeFileSync(join(tmpDir, "images/oversized.webp"), bigBuf);

    // Create a thumb with oversized width (> 480 px, e.g. 600 px)
    const bigThumbBuf = Buffer.alloc(2048);
    bigThumbBuf.write("RIFF", 0, 4, "ascii");
    bigThumbBuf.writeUInt32LE(bigThumbBuf.length - 8, 4);
    bigThumbBuf.write("WEBP", 8, 4, "ascii");
    bigThumbBuf.write("VP8X", 12, 4, "ascii");
    bigThumbBuf.writeUInt32LE(10, 16);
    // width 600-1 = 599 (0x0257) at 24..26
    bigThumbBuf.writeUInt8(0x57, 24);
    bigThumbBuf.writeUInt8(0x02, 25);
    bigThumbBuf.writeUInt8(0x00, 26);
    // height 400-1 = 399 (0x018F) at 27..29
    bigThumbBuf.writeUInt8(0x8f, 27);
    bigThumbBuf.writeUInt8(0x01, 28);
    bigThumbBuf.writeUInt8(0x00, 29);

    writeFileSync(join(tmpDir, "thumbs/wide-thumb.webp"), bigThumbBuf);

    const oversizedItem = {
      id: "oversized-item",
      title: "Oversized Item",
      category: "town",
      zoneId: "",
      loreRef: "",
      caption: "An oversized item test.",
      file: "images/oversized.webp",
      thumb: "thumbs/wide-thumb.webp",
      prompt: "A test prompt.",
      tool: "nano-banana",
      rights: "concept-reference",
      verdict: "unreviewed",
    };

    const result = runConceptArtsGate(
      { version: 1, items: [oversizedItem] },
      {
        baseDir: tmpDir,
        studioDir: REAL_STUDIO_DIR,
        skipFileCheck: false,
      },
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("exceeds max file size 400 KB")));
    assert.ok(result.errors.some((e) => e.includes("thumb width exceeds max 480 px")));
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("GATE: fails on invalid tool enum, superseded Undertow/Millcross canon, or invalid rights/verdict/paths", () => {
  const badToolAndCanonItem = {
    id: "bad-tool-canon",
    title: "Millcross Harbor Watch",
    category: "town",
    zoneId: "",
    loreRef: "",
    caption: "Welcome to Millcross in the Undertow canon.",
    file: "images/bad.webp",
    thumb: "thumbs/bad.webp",
    prompt: "A stormy port in Cindervast.",
    tool: "invalid-pirated-tool",
    rights: "concept-reference",
    verdict: "unreviewed",
  };

  const result = runConceptArtsGate(
    { version: 1, items: [badToolAndCanonItem] },
    {
      baseDir: resolve(ROOT, "content/concept-art"),
      studioDir: REAL_STUDIO_DIR,
      skipFileCheck: true,
    },
  );
  assert.equal(result.valid, false, "Must reject invalid tool and Undertow/Millcross canon");
  assert.ok(result.errors.some((e) => e.includes("invalid tool")));
  assert.ok(result.errors.some((e) => e.toLowerCase().includes("millcross") || e.toLowerCase().includes("undertow")));
});

test("concept-arts.mjs panel mounts with plain ATLAS_PARAMS object and renders hero, cards, and lightbox", async () => {
  const realDoc = JSON.parse(readFileSync(REAL_INDEX_PATH, "utf8"));

  function decodeEntities(str) {
    return String(str || "")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  const VOID_TAGS = new Set(["IMG", "INPUT", "BR", "HR", "META", "LINK"]);

  function parseHtmlInto(root, html) {
    const stack = [root];
    const tokenRe = /<!--[\s\S]*?-->|<\/([A-Za-z0-9-]+)\s*>|<([A-Za-z0-9-]+)((?:\s+[^\s/>=]+(?:=(?:"[^"]*"|'[^']*'|[^\s/>]+))?)*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = tokenRe.exec(html)) !== null) {
      const [, closeTag, openTag, attrStr, selfClose, textNode] = m;
      if (closeTag) {
        const upper = closeTag.toUpperCase();
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i].tagName === upper) {
            stack.length = i;
            break;
          }
        }
      } else if (openTag) {
        const el = new FakeElement(openTag);
        if (attrStr) {
          const attrRe = /([^\s/>=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g;
          let am;
          while ((am = attrRe.exec(attrStr)) !== null) {
            const k = am[1];
            const v = decodeEntities(am[2] ?? am[3] ?? am[4] ?? "");
            el.setAttribute(k, v);
          }
        }
        stack[stack.length - 1].appendChild(el);
        if (!selfClose && !VOID_TAGS.has(el.tagName)) {
          stack.push(el);
        }
      } else if (textNode) {
        const txt = decodeEntities(textNode);
        if (txt) {
          const t = new FakeElement("#text");
          t._textContent = txt;
          stack[stack.length - 1].appendChild(t);
        }
      }
    }
  }

  function matchesSingleSelector(node, sel) {
    if (!node || typeof node !== "object" || node.tagName === "#TEXT") return false;
    if (sel.startsWith("#")) return node.id === sel.slice(1);
    if (sel.startsWith("[") && sel.endsWith("]")) {
      const inner = sel.slice(1, -1);
      const eqIdx = inner.indexOf("=");
      if (eqIdx === -1) return inner in node.attributes;
      const k = inner.slice(0, eqIdx);
      const v = inner.slice(eqIdx + 1).replace(/^['"]|['"]$/g, "");
      return node.attributes[k] === v;
    }
    if (sel.startsWith(".")) {
      const reqClasses = sel.split(".").filter(Boolean);
      const nodeClasses = (node.className || "").split(/\s+/).filter(Boolean);
      return reqClasses.every((c) => nodeClasses.includes(c));
    }
    return (node.tagName || "").toLowerCase() === sel.toLowerCase();
  }

  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.className = "";
      this.id = "";
      this.value = "";
      this.href = "";
      this.src = "";
      this.alt = "";
      this.type = "";
      this.hidden = false;
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.children = [];
      this.parentNode = null;
      this.listeners = {};
      this._textContent = "";
      this._innerHTML = "";
      this.classList = {
        add: (...cls) => {
          const s = new Set(this.className.split(/\s+/).filter(Boolean));
          cls.forEach((c) => s.add(c));
          this.className = [...s].join(" ");
        },
        remove: (...cls) => {
          const s = new Set(this.className.split(/\s+/).filter(Boolean));
          cls.forEach((c) => s.delete(c));
          this.className = [...s].join(" ");
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
      return this._textContent + this.children.map((c) => c.textContent || "").join("");
    }
    set textContent(v) {
      this.children = [];
      this._textContent = v === null || v === undefined ? "" : String(v);
    }
    get innerHTML() {
      return this._innerHTML;
    }
    set innerHTML(val) {
      this._innerHTML = String(val || "");
      this.children = [];
      this._textContent = "";
      if (this._innerHTML) {
        parseHtmlInto(this, this._innerHTML);
      }
    }
    appendChild(ch) {
      if (ch && typeof ch === "object") {
        ch.parentNode = this;
        this.children.push(ch);
      }
      return ch;
    }
    replaceChildren(...nodes) {
      this.children = [];
      this._textContent = "";
      this._innerHTML = "";
      for (const n of nodes) this.appendChild(n);
    }
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    }
    setAttribute(k, v) {
      const str = String(v);
      this.attributes[k] = str;
      if (k === "class") this.className = str;
      else if (k === "id") this.id = str;
      else if (k === "value") this.value = str;
      else if (k === "href") this.href = str;
      else if (k === "src") this.src = str;
      else if (k === "alt") this.alt = str;
      else if (k === "type") this.type = str;
      else if (k.startsWith("data-")) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = str;
      }
    }
    getAttribute(k) {
      return this.attributes[k] ?? null;
    }
    addEventListener(ev, fn) {
      (this.listeners[ev] ||= []).push(fn);
    }
    querySelectorAll(sel) {
      const out = [];
      const visit = (n) => {
        if (!n || typeof n !== "object") return;
        if (matchesSingleSelector(n, sel)) out.push(n);
        for (const c of n.children || []) visit(c);
      };
      for (const c of this.children || []) visit(c);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
  }

  const host = new FakeElement("div");
  host.id = "panelHost";
  const body = new FakeElement("body");
  body.appendChild(host);
  const paramCalls = [];
  const switchedTabs = [];

  globalThis.document = {
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => (id === "panelHost" ? host : body.querySelector(`#${id}`)),
  };
  globalThis.window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    atlasSetParams: (patch, opts) => paramCalls.push({ patch, opts }),
    switchTab: (tab) => switchedTabs.push(tab),
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes("concept-art/index.json")) {
      return { ok: true, status: 200, json: async () => realDoc };
    }
    if (String(url).includes("/api/studio/perspectives")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          nodes: [{ id: "town-lantern-hollow", name: "Lantern Hollow" }],
          continents: [{ id: "continent-01-hearthbloom-basin", name: "Hearthbloom Basin" }],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  await import("../js/panels/concept-arts.mjs");
  await globalThis.window.ATLAS_PANELS.show("concept-arts", {});

  const panelEl = host.querySelectorAll("section").find((s) => s.dataset.panel === "concept-arts") || host;
  assert.equal(panelEl.querySelector(".error-banner"), null, "Must not render error banner when mounting with plain {} params");
  const container = panelEl.querySelector(".concept-arts-container");
  assert.ok(container, "renderUI() must mount .concept-arts-container");

  // Item 7: Hero key-art renders real first key-art item ("key-art-epoch-1-1-creation") with title, caption, image, and links (kills M3)
  const hero = panelEl.querySelector(".concept-hero");
  assert.ok(hero, "Must render .concept-hero section");
  assert.equal(hero.dataset.heroId, "key-art-epoch-1-1-creation", "Hero must render key-art-epoch-1-1-creation");
  const heroTitle = hero.querySelector(".concept-hero-title");
  assert.ok(heroTitle && heroTitle.textContent.includes("Epoch 1.1"), "Hero must render title text");
  assert.ok(hero.querySelector(".lore-link"), "Hero must render .lore-link");

  // Item 7: Grid renders all 24 cards from index.json with titles and badges (kills M3)
  const cards = panelEl.querySelectorAll(".concept-card");
  assert.equal(cards.length, 24, "Must render all 24 concept cards from index.json");
  assert.equal(cards.length, realDoc.items.length, "Must render a card for every item in index.json");
  for (const card of cards) {
    const titleEl = card.querySelector(".concept-card-title");
    const badgeEl = card.querySelector(".concept-badge");
    assert.ok(titleEl && titleEl.textContent.length > 0, `Card ${card.dataset.id} must render non-empty .concept-card-title`);
    assert.ok(badgeEl && badgeEl.textContent.length > 0, `Card ${card.dataset.id} must render non-empty .concept-badge`);
  }

  // Item 7: Clicking a card opens #conceptLightboxOverlay with title, prompt brief, and links (kills M3)
  paramCalls.length = 0;
  cards[0].listeners.click[0]();
  const overlay = body.querySelector("#conceptLightboxOverlay");
  assert.ok(overlay, "Clicking a card must open #conceptLightboxOverlay");
  const lbTitle = overlay.querySelector(".concept-lightbox-title");
  const lbPrompt = overlay.querySelector(".concept-prompt-body");
  const lbLoreLink = overlay.querySelector(".lore-link");
  assert.ok(lbTitle && lbTitle.textContent.length > 0, "Lightbox must render item title");
  assert.ok(lbPrompt && lbPrompt.textContent.length > 0, "Lightbox must render generation prompt");
  assert.ok(lbLoreLink, "Lightbox must render .lore-link");
  assert.equal(paramCalls.length, 1, "User-initiated openLightbox must push id param to URL");
  assert.equal(paramCalls[0].opts?.push, true);

  // Item 4.5: Clicking cross-link (.lore-link) prevents default full-page reload, closes lightbox, and routes in-app
  let defaultPrevented = false;
  lbLoreLink.listeners.click?.[0]?.({
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => {},
  });
  assert.equal(defaultPrevented, true, "Clicking .lore-link must call e.preventDefault() to prevent full page reload");
  assert.equal(body.querySelector("#conceptLightboxOverlay"), null, "Clicking .lore-link in lightbox must close lightbox");

  // Item 4.1: Search input syncs URL via updateParams({ search: ... }, { push: false }) (kills M4)
  paramCalls.length = 0;
  const searchInput = panelEl.querySelector(".concept-search-input");
  assert.ok(searchInput, "Must render .concept-search-input");
  searchInput.listeners.input[0]({ target: { value: "kiln cellar" } });
  const filteredCards = panelEl.querySelectorAll(".concept-card");
  assert.ok(filteredCards.length > 0 && filteredCards.length < 24, "Search input 'kiln cellar' must filter cards");
  assert.ok(
    paramCalls.some((c) => c.patch.search === "kiln cellar" && c.opts?.push === false),
    "Search input must call updateParams({ search: 'kiln cellar' }, { push: false })",
  );

  // Item 4.3 & 4.4: Deep-link show({ category, zone, search, id }) does not duplicate-push history on renderUI, and Back show({}) clears filters & closes lightbox
  paramCalls.length = 0;
  await globalThis.window.ATLAS_PANELS.show("concept-arts", {
    category: "town",
    zone: "town-lantern-hollow",
    search: "lantern",
    id: "town-lantern-hollow-meridian-plaza",
  });
  assert.ok(body.querySelector("#conceptLightboxOverlay"), "show({ id }) must open #conceptLightboxOverlay");
  assert.equal(
    paramCalls.filter((c) => c.patch.id === "town-lantern-hollow-meridian-plaza" && c.opts?.push === true).length,
    0,
    "Programmatic show({ id }) / renderUI() must not push duplicate history entry",
  );

  // Now simulate browser Back to ?tab=concept-arts (params = {})
  await globalThis.window.ATLAS_PANELS.show("concept-arts", {});
  assert.equal(body.querySelector("#conceptLightboxOverlay"), null, "Browser Back show({}) must close open lightbox");
  assert.equal(panelEl.querySelectorAll(".concept-card").length, 24, "Browser Back show({}) must clear category/zone/search filters and restore all 24 cards");
});

// Reads real pixel size from the WebP header, so an image saved under the wrong
// id (the shifted batch of 2026-10-31) fails on shape, not only on existence.
function webpSize(path) {
  const b = readFileSync(path);
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

test("GATE: every image on disk matches the orientation of its brief", () => {
  const dir = resolve(ROOT, "content/concept-art");
  const briefs = JSON.parse(readFileSync(join(dir, "art-briefs.json"), "utf8")).items;
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).items;
  assert.deepEqual(index.map((i) => i.id).sort(), briefs.map((b) => b.id).sort());
  for (const brief of briefs) {
    const [w, h] = webpSize(join(dir, "images", `${brief.id}.webp`));
    const [aw, ah] = brief.aspect.split(":").map(Number);
    if (aw === ah) continue;
    assert.equal(w > h, aw > ah, `${brief.id} is ${w}x${h}, brief asks for ${brief.aspect}`);
  }
});

test("character cards show the whole portrait instead of cropping it", () => {
  const css = readFileSync(resolve(ROOT, "atelier/atlas-world-panels/css/panels.css"), "utf8");
  assert.match(css, /\.concept-card\[data-category="character"\] \.concept-card-thumb-wrap img \{\s*object-fit: contain;/);
  const panel = readFileSync(resolve(ROOT, "atelier/atlas-world-panels/js/panels/concept-arts.mjs"), "utf8");
  assert.match(panel, /card\.dataset\.category = item\.category;/);
});
