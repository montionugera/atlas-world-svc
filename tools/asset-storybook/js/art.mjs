import { ART_ROOT, ART_CLASS, ART_GROUPS_FALLBACK } from "./state.mjs";
import { filenameOf } from "./utils.mjs";
import { bumpHealth } from "./health.mjs";

// ---------- concept art (Cast / Races reference sheets) ----------
// Driven directly by art-manifest.json entries (not a directory
// listing, not the render registry — a bespoke curated file like
// music-manifest.json): each art:* entry is a static PNG with a
// group ("cast" | "race"), title, and note. Reuses .card/.meta for a
// consistent look; health is tracked the same way as every other
// synthetic class, just driven off <img> load/error instead of decode.
function buildArtCard(id, entry, groupClass) {
  const card = document.createElement("div");
  card.className = "card";
  // Task 8 filter: precomputed lowercase "title tags" haystack so
  // applyArtTabFilter() can match free text without re-reading the
  // manifest — title/tags are the two fields the filter searches.
  const tagText = Array.isArray(entry.tags) ? entry.tags.join(" ") : "";
  card.dataset.artSearch = (
    (entry.title || id) +
    " " +
    tagText
  ).toLowerCase();

  const viewport = document.createElement("div");
  viewport.className = "viewport art-viewport";

  const url = ART_ROOT + entry.file;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.title = "Open full-size";

  const img = document.createElement("img");
  img.src = url;
  img.loading = "lazy";
  img.alt = entry.title || id;
  // Each image load/error bumps both its own group's dot (groupClass,
  // e.g. "art:mob") and the aggregate "Concept Art" dot (ART_CLASS) —
  // the aggregate's health is the sum of every group's.
  img.addEventListener("load", () => {
    bumpHealth(groupClass, { ok: 1 });
    bumpHealth(ART_CLASS, { ok: 1 });
  });
  img.addEventListener("error", () => {
    bumpHealth(groupClass, { err: 1 });
    bumpHealth(ART_CLASS, { err: 1 });
  });

  link.appendChild(img);
  viewport.appendChild(link);
  card.appendChild(viewport);

  const meta = document.createElement("div");
  meta.className = "meta";

  const titleEl = document.createElement("p");
  titleEl.className = "key";
  titleEl.textContent = entry.title || id;
  meta.appendChild(titleEl);

  // Rich metadata (F-024) — all optional, rendered only when present.
  // description: readable body text.
  if (entry.description) {
    const descEl = document.createElement("p");
    descEl.className = "art-description";
    descEl.textContent = entry.description;
    meta.appendChild(descEl);
  }

  // tags: distinct visual chips, not a comma string.
  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    const tagsEl = document.createElement("div");
    tagsEl.className = "art-tags";
    for (const tag of entry.tags) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      tagsEl.appendChild(chip);
    }
    meta.appendChild(tagsEl);
  }

  // gen: compact labelled row (model · steps · cfg · seed), monospace,
  // visually secondary. Built from whichever fields are present so an
  // entry with a partial gen block never renders a dangling separator.
  if (entry.gen && typeof entry.gen === "object") {
    const parts = [];
    if (entry.gen.model) parts.push(entry.gen.model);
    if (entry.gen.steps !== undefined)
      parts.push(`${entry.gen.steps} steps`);
    if (entry.gen.cfg !== undefined) parts.push(`cfg ${entry.gen.cfg}`);
    if (entry.gen.seed !== undefined)
      parts.push(`seed ${entry.gen.seed}`);
    if (parts.length > 0) {
      const genEl = document.createElement("p");
      genEl.className = "art-gen";
      genEl.textContent = parts.join(" · ");
      meta.appendChild(genEl);
    }
  }

  // source: small reference line.
  if (entry.source) {
    const sourceEl = document.createElement("p");
    sourceEl.className = "art-source";
    sourceEl.textContent = entry.source;
    meta.appendChild(sourceEl);
  }

  const fileEl = document.createElement("p");
  fileEl.className = "filename";
  fileEl.textContent = filenameOf(entry.file);
  meta.appendChild(fileEl);

  if (entry.note) {
    const noteEl = document.createElement("p");
    noteEl.className = "filename";
    noteEl.textContent = entry.note;
    meta.appendChild(noteEl);
  }

  card.appendChild(meta);
  return card;
}

// Classes (8 races x 8 jobs): id is "art:class-<race>-<job>", both
// single-token, so a fixed regex splits it cleanly. Race/job order
// below is the authoring order (art-manifest.json generation order),
// not alphabetical — any future race/job not in these lists still
// renders, just appended after the known ones instead of vanishing.
const CLASS_RACE_ORDER = [
  "human",
  "demon",
  "dwarf",
  "immortal",
  "elf",
  "dragon",
  "beastkin",
  "ogre",
];
const CLASS_JOB_ORDER = [
  "swordsman",
  "archer",
  "assassin",
  "spearman",
  "mage",
  "summoner",
  "engineer",
  "healer",
];

function cap(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Renders just the by-race body (h4 + grid per race) — no outer
// heading, since the caller's <section> h2 already carries the
// "Classes (N)" title (one section per group now, not one shared
// "Concept Art" section holding every group's own h3).
function buildArtClassesBody(classList, groupClass) {
  const byRace = new Map();
  for (const [id, entry] of classList) {
    const m = /^art:class-([a-z]+)-([a-z]+)$/.exec(id);
    const race = m ? m[1] : "other";
    if (!byRace.has(race)) byRace.set(race, []);
    byRace.get(race).push([id, entry]);
  }

  const races = CLASS_RACE_ORDER.filter((r) => byRace.has(r));
  for (const r of byRace.keys()) if (!races.includes(r)) races.push(r);

  const wrap = document.createElement("div");

  for (const race of races) {
    const list = byRace.get(race);
    list.sort((a, b) => {
      const ja = CLASS_JOB_ORDER.indexOf(a[0].split("-").pop());
      const jb = CLASS_JOB_ORDER.indexOf(b[0].split("-").pop());
      return (ja === -1 ? 999 : ja) - (jb === -1 ? 999 : jb);
    });

    const row = document.createElement("div");
    row.className = "art-race-row";

    const h4 = document.createElement("h4");
    h4.textContent = cap(race) + " (" + list.length + ")";
    row.appendChild(h4);

    const grid = document.createElement("div");
    grid.className = "grid";
    for (const [id, entry] of list)
      grid.appendChild(buildArtCard(id, entry, groupClass));
    row.appendChild(grid);

    wrap.appendChild(row);
  }

  return wrap;
}

// Buckets every art-manifest entry by its `group` field, in
// art-groups.json registry order (or ART_GROUPS_FALLBACK). Entries
// whose group isn't in the registry land in `unregistered` — never
// folded into Cast, since that hid every T1-T3 group behind the wrong
// heading before T0.
export function bucketArtEntries(artEntries, artGroups) {
  const order =
    artGroups &&
    Array.isArray(artGroups.groups) &&
    artGroups.groups.length
      ? artGroups.groups
      : ART_GROUPS_FALLBACK;

  const buckets = new Map(order.map((g) => [g.id, []]));
  const unregistered = new Map();

  for (const [id, entry] of Object.entries(artEntries)) {
    if (!entry || typeof entry.file !== "string") continue;
    const g = typeof entry.group === "string" ? entry.group : "cast";
    if (buckets.has(g)) {
      buckets.get(g).push([id, entry]);
    } else {
      if (!unregistered.has(g)) unregistered.set(g, []);
      unregistered.get(g).push([id, entry]);
    }
  }

  return { order, buckets, unregistered };
}

function buildArtGrid(list, groupClass) {
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const [id, entry] of list)
    grid.appendChild(buildArtCard(id, entry, groupClass));
  return grid;
}

// One <section class="kind-section"> per art group, so the sidebar can
// jump straight to Mobs/Bosses/etc. instead of scrolling through one
// 90-entry "Concept Art" bucket. `data-group="art"` (in addition to
// `data-kind`) lets the aggregate "Concept Art" sidebar entry reveal
// every group's section at once — see setActiveClass().
export function buildArtGroupSection(gid, label, list) {
  const cls = ART_CLASS + ":" + gid;
  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + cls;
  section.dataset.kind = cls;
  section.dataset.group = ART_CLASS;
  // Task 8: lets applyArtTabFilter() select "just this group's
  // section" without re-deriving gid from dataset.kind's "art:" prefix.
  section.dataset.artGroupId = gid;

  const h2 = document.createElement("h2");
  h2.textContent = label + " (" + list.length + ")";
  section.appendChild(h2);

  section.appendChild(
    gid === "class"
      ? buildArtClassesBody(list, cls)
      : buildArtGrid(list, cls),
  );

  return section;
}

