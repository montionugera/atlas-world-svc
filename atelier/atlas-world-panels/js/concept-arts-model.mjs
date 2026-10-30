// Concept Arts Data Model, Validation Gate, and Query Utilities.
// Pure logic module used by both browser panels and Node.js test gates.

let nodeFs = null;
let nodePath = null;
if (typeof process !== "undefined" && process?.versions?.node) {
  try {
    nodeFs = await import("node:fs");
    nodePath = await import("node:path");
  } catch {
    // Non-node runtime
  }
}

export const SCHEMA_FIELDS = [
  "id",
  "title",
  "category",
  "zoneId",
  "loreRef",
  "caption",
  "file",
  "thumb",
  "prompt",
  "tool",
  "rights",
  "verdict",
];

export const SCHEMA_CATEGORIES = [
  "key-art",
  "town",
  "zone",
  "dungeon",
  "character",
  "mob",
  "boss",
  "item",
];

export const CATEGORY_LABELS = {
  "key-art": "Key Art",
  town: "Towns",
  zone: "Zones & Fields",
  dungeon: "Dungeons",
  character: "Characters",
  mob: "Monsters & Mobs",
  boss: "Bosses",
  item: "Items & Relics",
};

export const SCHEMA_TOOLS = ["nano-banana", "google-flow", "asset-studio"];
export const SCHEMA_VERDICTS = ["unreviewed", "approve", "reject", "rebuild"];

export const MAX_FILE_BYTES = 400 * 1024; // 400 KB
export const MAX_IMAGE_LONGEST_SIDE = 1600; // 1600 px
export const MAX_THUMB_WIDTH = 480; // 480 px

// Superseded Undertow canon terms forbidden by web-contract.md
export const FORBIDDEN_SUPERSEDED_CANON = [
  "undertow",
  "millcross",
  "cindervast",
  "thornveil",
];

// Real game titles and benchmarks forbidden in player-facing copy and prompts
export const FORBIDDEN_REAL_GAME_TITLES = [
  "ragnarok online global",
  "ragnarok online",
  "ragnarok",
  "lineage ii",
  "lineage 2",
  "lineage",
  "genshin impact",
  "genshin",
  "one piece",
  "world of warcraft",
  "final fantasy",
];

// Fallback list of name-map old keys to ban (synced with name-map.json)
export const NAME_MAP_OLD_KEYS = [
  "Keltir",
  "Prairie Keltir",
  "Young Prairie Keltir",
  "Dominant Prairie Keltir",
  "Elpy",
  "Grey Elpy",
  "Gludin",
  "Talking Island",
  "Queen Ant",
  "Ant Nest",
  "Adena",
  "Soulshot",
  "Spiritshot",
  "Einhovant",
  "Biotin",
  "Roxxy",
  "Gilbert",
  "Altran",
  "Lector",
  "Silvia",
  "Bitz",
  "Dre Vanul",
  "Vanul",
  "Cedric",
  "Rant",
  "Leon",
  "Arnold",
  "Ambra",
  "Bixon",
  "Siff",
  "Tunath",
  "Muertos",
  "Nahir",
  "Monster Eye",
  "Elven Ruins",
  "Elven Long Sword",
  "Staff of Life",
  "Manticore",
  "Salamander",
  "Undine",
  "Orichalcum",
  "Soul Crystal",
  "Tontatta",
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks text for forbidden terms (name-map keys or real game titles) with word boundaries.
 * @param {string} text
 * @param {string[]} terms
 * @returns {string|null} The matched forbidden term, or null
 */
export function findForbiddenTerm(text, terms) {
  if (!text || typeof text !== "string") return null;
  for (const term of terms) {
    if (!term) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (pattern.test(text)) {
      return term;
    }
  }
  return null;
}

/**
 * Pure JS parser for WebP image dimensions from file Buffer.
 * Supports VP8 (lossy), VP8L (lossless), and VP8X (extended).
 * @param {Buffer} buf
 * @returns {{ width: number, height: number }|null}
 */
export function parseWebpDimensions(buf) {
  if (!buf || buf.length < 30) return null;
  const riff = buf.toString("ascii", 0, 4);
  const webp = buf.toString("ascii", 8, 12);
  if (riff !== "RIFF" || webp !== "WEBP") return null;
  const chunkType = buf.toString("ascii", 12, 16);

  if (chunkType === "VP8 ") {
    // Lossy VP8: dimensions in 14-bit unsigned ints at bytes 26-29
    const width = (buf[26] | (buf[27] << 8)) & 0x3fff;
    const height = (buf[28] | (buf[29] << 8)) & 0x3fff;
    return { width, height };
  } else if (chunkType === "VP8L") {
    // Lossless VP8L: 14 bits width-1, 14 bits height-1 at bytes 21-24
    const b0 = buf[21],
      b1 = buf[22],
      b2 = buf[23],
      b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  } else if (chunkType === "VP8X") {
    // Extended VP8X: 24 bits width-1 at 24..26, 24 bits height-1 at 27..29
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  return null;
}

/**
 * Recursively discovers studio nodes from content/studio/nodes directory.
 * @param {string} studioDir Path to content/studio
 * @returns {Map<string, string>} Map of nodeId -> nodeName
 */
export function loadStudioNodeIds(studioDir) {
  const nodes = new Map();
  const fs = nodeFs;
  const path = nodePath;
  if (!fs || !path) return nodes;

  const nodesDir = path.resolve(studioDir, "nodes");
  if (!fs.existsSync(nodesDir)) return nodes;

  function walk(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".json")) {
        try {
          const doc = JSON.parse(fs.readFileSync(full, "utf8"));
          if (doc.id) {
            nodes.set(doc.id, doc.name || doc.id);
          }
        } catch {
          // ignore corrupted or non-node json files
        }
      }
    }
  }

  walk(nodesDir);
  return nodes;
}

/**
 * Resolves a zone id to its display name using studio nodes.
 * @param {string} zoneId
 * @param {Map<string, string>|Record<string, string>} studioNodes
 * @returns {string}
 */
export function resolveZoneName(zoneId, studioNodes) {
  if (!zoneId) return "";
  if (!studioNodes) return zoneId;
  if (studioNodes instanceof Map) {
    return studioNodes.get(zoneId) || zoneId;
  }
  return studioNodes[zoneId] || zoneId;
}

/**
 * Validates a single concept art item against the schema and gate invariants.
 * @param {any} item
 * @param {object} opts
 * @returns {string[]} List of error strings (empty if valid)
 */
export function validateConceptArtItem(item, opts = {}) {
  const errors = [];
  if (!item || typeof item !== "object") {
    return ["item is not an object"];
  }

  // 1. Schema fields existence check
  for (const field of SCHEMA_FIELDS) {
    if (!(field in item) || item[field] === undefined || item[field] === null) {
      errors.push(`item ${item.id || "unknown"}: missing required field: ${field}`);
    }
  }

  // 2. ID validation
  if (typeof item.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) {
    errors.push(`item ${item.id}: id must be kebab-case non-empty string`);
  }

  // 3. Category validation
  if (!SCHEMA_CATEGORIES.includes(item.category)) {
    errors.push(
      `item ${item.id}: invalid category "${item.category}". Must be one of: ${SCHEMA_CATEGORIES.join(", ")}`,
    );
  }

  // 4. Strings non-empty where required
  for (const strField of ["title", "caption", "file", "thumb", "prompt", "rights", "verdict"]) {
    if (typeof item[strField] !== "string" || !item[strField].trim()) {
      errors.push(`item ${item.id}: ${strField} must be a non-empty string`);
    }
  }

  // 4b. Tool, rights, verdict, and relative file path contract validation
  if (!SCHEMA_TOOLS.includes(item.tool)) {
    errors.push(
      `item ${item.id}: invalid tool "${item.tool}". Must be one of: ${SCHEMA_TOOLS.join(", ")}`,
    );
  }
  if (typeof item.rights === "string" && item.rights !== "concept-reference") {
    errors.push(`item ${item.id}: invalid rights "${item.rights}". Expected "concept-reference"`);
  }
  if (typeof item.verdict === "string" && !SCHEMA_VERDICTS.includes(item.verdict)) {
    errors.push(`item ${item.id}: invalid verdict "${item.verdict}"`);
  }
  if (typeof item.file === "string" && item.file.trim() && !/^images\/[a-z0-9._-]+\.webp$/i.test(item.file)) {
    errors.push(`item ${item.id}: invalid file path "${item.file}" (must be images/<name>.webp)`);
  }
  if (typeof item.thumb === "string" && item.thumb.trim() && !/^thumbs\/[a-z0-9._-]+\.webp$/i.test(item.thumb)) {
    errors.push(`item ${item.id}: invalid thumb path "${item.thumb}" (must be thumbs/<name>.webp)`);
  }

  // 5. Zone ID resolution check (if non-empty)
  if (item.zoneId && typeof item.zoneId === "string") {
    const studioNodes = opts.studioNodes;
    if (studioNodes) {
      const exists = studioNodes instanceof Map ? studioNodes.has(item.zoneId) : Boolean(studioNodes[item.zoneId]);
      if (!exists) {
        errors.push(`item ${item.id}: unknown studio node id: ${item.zoneId}`);
      }
    }
  }

  // 6. Forbidden name-map old keys check
  const nameMapKeys = opts.nameMapKeys || NAME_MAP_OLD_KEYS;
  for (const field of ["title", "caption", "prompt"]) {
    const match = findForbiddenTerm(item[field], nameMapKeys);
    if (match) {
      errors.push(
        `item ${item.id}: ${field} contains forbidden name-map key "${match}"`,
      );
    }
  }

  // 7. Forbidden real game titles check
  const realGameTitles = opts.realGameTitles || FORBIDDEN_REAL_GAME_TITLES;
  for (const field of ["title", "caption", "prompt"]) {
    const match = findForbiddenTerm(item[field], realGameTitles);
    if (match) {
      errors.push(
        `item ${item.id}: ${field} contains forbidden real game title "${match}"`,
      );
    }
  }

  // 7b. Forbidden superseded Undertow canon check
  const supersededCanon = opts.supersededCanon || FORBIDDEN_SUPERSEDED_CANON;
  for (const field of ["title", "caption", "prompt", "loreRef"]) {
    const match = findForbiddenTerm(item[field], supersededCanon);
    if (match) {
      errors.push(
        `item ${item.id}: ${field} contains forbidden superseded canon term "${match}"`,
      );
    }
  }

  // 8. Disk file existence and size/dimension limits check
  if (!opts.skipFileCheck && opts.baseDir) {
    const fs = opts.fs || nodeFs;
    const path = opts.path || nodePath;
    if (fs && path) {
      // Full image file
      const filePath = path.resolve(opts.baseDir, item.file || "");
      if (!fs.existsSync(filePath)) {
        errors.push(`item ${item.id}: full image file not found: ${item.file}`);
      } else {
        const st = fs.statSync(filePath);
        if (st.size > MAX_FILE_BYTES) {
          errors.push(
            `item ${item.id}: image file ${item.file} exceeds max file size 400 KB (${st.size} bytes)`,
          );
        }
        try {
          const buf = fs.readFileSync(filePath);
          const dims = parseWebpDimensions(buf);
          if (dims) {
            const longest = Math.max(dims.width, dims.height);
            if (longest > MAX_IMAGE_LONGEST_SIDE) {
              errors.push(
                `item ${item.id}: image ${item.file} longest side exceeds max ${MAX_IMAGE_LONGEST_SIDE} px (${dims.width}x${dims.height})`,
              );
            }
          }
        } catch (err) {
          errors.push(`item ${item.id}: unable to read image dimensions: ${err.message}`);
        }
      }

      // Thumb file
      const thumbPath = path.resolve(opts.baseDir, item.thumb || "");
      if (!fs.existsSync(thumbPath)) {
        errors.push(`item ${item.id}: thumb not found: ${item.thumb}`);
      } else {
        try {
          const buf = fs.readFileSync(thumbPath);
          const dims = parseWebpDimensions(buf);
          if (dims && dims.width > MAX_THUMB_WIDTH) {
            errors.push(
              `item ${item.id}: thumb width exceeds max ${MAX_THUMB_WIDTH} px (${dims.width} px)`,
            );
          }
        } catch (err) {
          errors.push(`item ${item.id}: unable to read thumb dimensions: ${err.message}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Gate runner for content/concept-art/index.json.
 * Validates the entire manifest document, ensuring unique IDs and schema invariants.
 * @param {any} doc
 * @param {object} opts
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function runConceptArtsGate(doc, opts = {}) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { valid: false, errors: ["index.json root is not an object"] };
  }
  if (doc.version !== 1) {
    errors.push(`expected version 1, got ${doc.version}`);
  }
  if (!Array.isArray(doc.items)) {
    return { valid: false, errors: ["items property must be an array"] };
  }

  // Prepare studio nodes map if studioDir provided and not explicitly passed
  let studioNodes = opts.studioNodes;
  if (!studioNodes && opts.studioDir) {
    studioNodes = loadStudioNodeIds(opts.studioDir);
  }

  const seenIds = new Set();
  for (const item of doc.items) {
    if (item && item.id) {
      if (seenIds.has(item.id)) {
        errors.push(`duplicate id: ${item.id}`);
      }
      seenIds.add(item.id);
    }
    const itemErrors = validateConceptArtItem(item, {
      ...opts,
      studioNodes,
    });
    errors.push(...itemErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Filters concept art items by category, zone, and search text.
 * @param {any[]} items
 * @param {object} filter
 * @returns {any[]}
 */
export function filterConceptArts(items, filter = {}) {
  if (!Array.isArray(items)) return [];
  const { category = "all", zone = "all", text = "", studioNodes = null } = filter;

  const searchTerms = text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return items.filter((item) => {
    // 1. Category filter
    if (category && category !== "all" && item.category !== category) {
      return false;
    }

    // 2. Zone filter
    if (zone && zone !== "all") {
      if ((item.zoneId || "") !== zone) return false;
    }

    // 3. Search text
    if (searchTerms.length > 0) {
      const zoneName = resolveZoneName(item.zoneId, studioNodes);
      const searchable = [
        item.title || "",
        item.caption || "",
        item.prompt || "",
        item.category || "",
        item.id || "",
        item.zoneId || "",
        zoneName || "",
        item.tool || "",
      ]
        .join(" ")
        .toLowerCase();

      for (const term of searchTerms) {
        if (!searchable.includes(term)) return false;
      }
    }

    return true;
  });
}

/**
 * Groups concept art items by category in canonical order.
 * @param {any[]} items
 * @returns {Array<{ category: string, label: string, items: any[] }>}
 */
export function groupConceptArtsByCategory(items) {
  if (!Array.isArray(items)) return [];
  const map = new Map();
  for (const cat of SCHEMA_CATEGORIES) {
    map.set(cat, []);
  }

  for (const item of items) {
    const cat = item.category;
    if (map.has(cat)) {
      map.get(cat).push(item);
    } else {
      if (!map.has("other")) map.set("other", []);
      map.get("other").push(item);
    }
  }

  const result = [];
  for (const [cat, list] of map.entries()) {
    if (list.length > 0) {
      result.push({
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        items: list,
      });
    }
  }
  return result;
}

/**
 * Groups concept art items by zone.
 * @param {any[]} items
 * @param {function} resolveNameFn
 * @returns {Array<{ zoneId: string, zoneName: string, items: any[] }>}
 */
export function groupConceptArtsByZone(items, resolveNameFn = (id) => id) {
  if (!Array.isArray(items)) return [];
  const map = new Map(); // zoneId -> items[]

  for (const item of items) {
    const zid = item.zoneId || "";
    if (!map.has(zid)) {
      map.set(zid, []);
    }
    map.get(zid).push(item);
  }

  const result = [];
  for (const [zid, list] of map.entries()) {
    const name = zid ? resolveNameFn(zid) || zid : "World & General";
    result.push({
      zoneId: zid,
      zoneName: name,
      items: list,
    });
  }

  // Sort: World & General last, others alphabetically
  result.sort((a, b) => {
    if (a.zoneId === "") return 1;
    if (b.zoneId === "") return -1;
    return a.zoneName.localeCompare(b.zoneName);
  });

  return result;
}

/**
 * Selects the primary hero key-art item from the list.
 * @param {any[]} items
 * @returns {any|null}
 */
export function extractHeroKeyArt(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const keyArt = items.find((it) => it.category === "key-art");
  return keyArt || null;
}

/**
 * Builds a deep link URL for the concept arts tab with query parameters.
 * @param {object} params
 * @returns {string}
 */
export function buildConceptArtDeepLink(params = {}) {
  const q = new URLSearchParams();
  q.set("tab", "concept-arts");
  if (params.category && params.category !== "all") {
    q.set("category", params.category);
  }
  if (params.zone && params.zone !== "all") {
    q.set("zone", params.zone);
  }
  if (params.id) {
    q.set("id", params.id);
  }
  return "?" + q.toString();
}

/**
 * Parses concept arts parameters from URLSearchParams, query string, or plain ATLAS_PARAMS object.
 * @param {URLSearchParams|string|Record<string, any>|null|undefined} searchParams
 * @returns {{ category: string, zone: string, id: string, search: string }}
 */
export function parseConceptArtParams(searchParams) {
  if (!searchParams) {
    return { category: "", zone: "", id: "", search: "" };
  }
  if (typeof searchParams === "string") {
    const p = new URLSearchParams(searchParams);
    return {
      category: p.get("category") || "",
      zone: p.get("zone") || "",
      id: p.get("id") || "",
      search: p.get("search") || "",
    };
  }
  if (typeof searchParams.get === "function") {
    return {
      category: searchParams.get("category") || "",
      zone: searchParams.get("zone") || "",
      id: searchParams.get("id") || "",
      search: searchParams.get("search") || "",
    };
  }
  if (typeof searchParams === "object") {
    return {
      category: typeof searchParams.category === "string" ? searchParams.category : "",
      zone: typeof searchParams.zone === "string" ? searchParams.zone : "",
      id: typeof searchParams.id === "string" ? searchParams.id : "",
      search: typeof searchParams.search === "string" ? searchParams.search : "",
    };
  }
  return { category: "", zone: "", id: "", search: "" };
}
