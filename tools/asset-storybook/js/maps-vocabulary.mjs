import { REPO_ROOT_REL } from "./state.mjs";

/**
 * The map vocabulary panel (Plan B Task 11) — the Maps tab's reference card
 * for the ink and the marks.
 *
 * WHY IT EXISTS. Tasks 6-7 produced two vocabularies: 25 terrain fills
 * (draft.mjs LEGEND + PATTERNS) and 40 landform glyph families (glyphs.mjs
 * GLYPHS), bound to 170 landform types by content/world/lexicon/landforms.json.
 * All three are produced artifacts, and the standing rule (owner, 2026-08-15)
 * is that a produced artifact which cannot be VIEWED in a review surface is
 * not delivered. Before this panel they existed only as source: nobody could
 * see that a glyph family had drifted, or that a family was drawn but never
 * bound to a type, without reading the module.
 *
 * The counts are the review value, not decoration. A family bound to zero
 * types is drawn and unused; a lexicon row naming a family that does not
 * exist would be drawn as nothing at all. Both are flagged on the card.
 *
 * DEGRADATION. Everything is loaded lazily and every failure removes the
 * PANEL, never the tab — same contract as loadIndex()/loadLock() in maps.mjs.
 * That is not theoretical: tools/mapforge/ is NOT copied into the storybook
 * container by default, so the imports below 404 unless the Dockerfile ships
 * lib/ (it now does — see tools/asset-storybook/Dockerfile).
 */

/**
 * Repo-root-relative URL, resolved against the DOCUMENT, not this module.
 *
 * This is not a nicety. REPO_ROOT_REL is "../../", which is correct relative
 * to tools/asset-storybook/index.html — where maps.mjs uses it, for img.src
 * and fetch(), both of which the browser resolves against the document. A
 * dynamic `import()` does NOT: its specifier is resolved against the
 * IMPORTING MODULE's url, and this module lives one level deeper in js/. So
 * `import(REPO_ROOT_REL + "tools/mapforge/lib/draft.mjs")` asks for
 * `tools/tools/mapforge/lib/draft.mjs`, 404s, and the panel removes itself —
 * silently, because removing itself is the correct behaviour for a real
 * failure. OBSERVED in the browser 2026-08-21: three sheet cards, no panel,
 * and nothing in the console but a warn nobody was reading.
 *
 * Resolving against document.baseURI is also depth-independent: moving this
 * file cannot re-break it.
 */
export function repoUrl(path, baseUrl) {
  return new URL(
    REPO_ROOT_REL + path,
    baseUrl ||
      (typeof document !== "undefined"
        ? document.baseURI
        : "http://localhost/"),
  ).href;
}

/** Escape for text interpolated into innerHTML. Ids and labels are ours, but
 *  the lexicon is content and content is edited by hand. */
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

/**
 * Pure: turn the three vocabularies into the rows the panel renders.
 *
 * Never throws — a malformed or absent lexicon yields zero bindings and the
 * panel still shows the fills and the marks, which is the honest answer
 * ("nothing is bound") rather than a blank tab.
 */
export function buildVocabulary({ legend, glyphs, lexicon } = {}) {
  const rows = Array.isArray(lexicon) ? lexicon : [];
  const glyphIds =
    glyphs && typeof glyphs === "object" ? Object.keys(glyphs) : [];
  const known = new Set(glyphIds);

  const typesByGlyph = new Map();
  const danglingGlyphs = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.glyph !== "string")
      continue;
    if (!known.has(row.glyph)) danglingGlyphs.add(row.glyph);
    if (!typesByGlyph.has(row.glyph)) typesByGlyph.set(row.glyph, []);
    typesByGlyph.get(row.glyph).push(row.id);
  }

  const fills = (Array.isArray(legend) ? legend : []).map((r) => ({
    pattern: r.pattern,
    label: r.label,
    tier: r.tier,
  }));

  const marks = glyphIds.map((id) => {
    const bound = typesByGlyph.get(id) || [];
    return { id, types: bound.length, unbound: bound.length === 0 };
  });

  return {
    fills,
    marks,
    stats: {
      fills: fills.length,
      families: marks.length,
      types: rows.length,
      dungeonCapable: rows.filter((r) => r && r.dungeonCapable === true).length,
      unboundFamilies: marks.filter((m) => m.unbound).length,
      // A lexicon row naming a family glyphs.mjs does not define would draw
      // nothing. Zero is the only acceptable value; it is shown so it can be
      // seen to be zero.
      danglingGlyphs: [...danglingGlyphs].sort(),
    },
  };
}

/** One fill swatch: parchment ground, then the real <pattern> over it. */
function fillCardHtml({ pattern, label, tier }, patternDefs, parchment) {
  const defs = patternDefs({ ids: [pattern] });
  return (
    `<figure class="card maps-vocab-card">` +
    `<svg class="maps-vocab-swatch" width="132" height="56" viewBox="0 0 132 56" role="img" aria-label="${esc(label)} fill">` +
    `<defs>${defs}</defs>` +
    `<rect width="132" height="56" fill="${esc(parchment)}"/>` +
    `<rect width="132" height="56" fill="url(#${esc(pattern)})"/>` +
    `<rect x="0.5" y="0.5" width="131" height="55" fill="none" stroke="#8a7f6c" stroke-width="1"/>` +
    `</svg>` +
    `<figcaption><p class="key">${esc(label)}</p>` +
    `<p class="filename">${esc(pattern)} · tier ${esc(tier)}</p></figcaption>` +
    `</figure>`
  );
}

/** One glyph family mark, drawn at the family-identity size. */
function markCardHtml({ id, types, unbound }, GLYPHS) {
  const d = GLYPHS[id]({ x: 32, y: 32, size: 34, seed: 1 });
  return (
    `<figure class="card maps-vocab-card${unbound ? " maps-vocab-warn" : ""}">` +
    `<svg class="maps-vocab-mark" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${esc(id)} glyph">` +
    `<path d="${esc(d)}" fill="none" stroke="#241f18" stroke-width="1.2" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>` +
    `<figcaption><p class="key">${esc(id)}</p>` +
    `<p class="filename">${types === 0 ? "no landform type uses this family" : types + (types === 1 ? " type" : " types")}</p>` +
    `</figcaption></figure>`
  );
}

function statsHtml(s) {
  const dangling = s.danglingGlyphs.length
    ? ` · <strong>${s.danglingGlyphs.length} lexicon rows name a family that does not exist: ` +
      `${esc(s.danglingGlyphs.join(", "))}</strong>`
    : "";
  return (
    `${s.fills} terrain fills · ${s.families} glyph families · ${s.types} landform types ` +
    `· ${s.dungeonCapable} dungeon-capable · ${s.unboundFamilies} families bound to no type${dangling}`
  );
}

function subHead(text) {
  const h = document.createElement("h3");
  h.className = "maps-vocab-subhead";
  h.textContent = text;
  return h;
}

/**
 * Mount the panel into `section`. Resolves once the panel is populated or
 * removed; it never rejects, so a caller can await it in a test without
 * arming an unhandled rejection.
 */
export async function mountVocabulary(section) {
  const ref = document.createElement("details");
  ref.className = "maps-ref";
  const sum = document.createElement("summary");
  sum.textContent =
    "Map vocabulary — terrain fills, glyph families and the landform lexicon";
  ref.appendChild(sum);
  const body = document.createElement("div");
  body.className = "maps-ref-body";
  ref.appendChild(body);
  section.appendChild(ref);

  try {
    const [draft, glyphMod, lexRes] = await Promise.all([
      import(repoUrl("tools/mapforge/lib/draft.mjs")),
      import(repoUrl("tools/mapforge/lib/glyphs.mjs")),
      fetch(repoUrl("content/world/lexicon/landforms.json")),
    ]);
    const lexicon = lexRes.ok ? await lexRes.json() : [];
    const { fills, marks, stats } = buildVocabulary({
      legend: draft.LEGEND,
      glyphs: glyphMod.GLYPHS,
      lexicon,
    });

    const line = document.createElement("p");
    line.className = "empty-state maps-vocab-stats";
    line.style.textAlign = "left";
    line.innerHTML = statsHtml(stats);
    body.appendChild(line);

    body.appendChild(subHead("Terrain fills (draft.mjs LEGEND)"));
    const fillGrid = document.createElement("div");
    fillGrid.className = "grid maps-vocab-grid";
    fillGrid.innerHTML = fills
      .map((f) => fillCardHtml(f, draft.patternDefs, draft.C.parchment))
      .join("");
    body.appendChild(fillGrid);

    body.appendChild(
      subHead(
        "Glyph families (glyphs.mjs GLYPHS), with the landform types bound to each",
      ),
    );
    const markGrid = document.createElement("div");
    markGrid.className = "grid maps-vocab-grid maps-vocab-marks";
    markGrid.innerHTML = marks
      .map((m) => markCardHtml(m, glyphMod.GLYPHS))
      .join("");
    body.appendChild(markGrid);
  } catch (err) {
    console.warn("[asset-storybook] map vocabulary panel unavailable:", err);
    ref.remove();
  }
}
