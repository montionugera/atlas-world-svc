import {
  MANIFEST_URL,
  CATALOG_MANIFEST_URL,
  AUDIO_MANIFEST_URL,
  MUSIC_MANIFEST_URL,
  ART_MANIFEST_URL,
  ART_GROUPS_URL,
  RENDER_SPEC_URL,
  ASSET_KEYS_URL,
  AUDIO_INDEX_URL,
  SFX_CLASS,
  MUSIC_CLASS,
  ART_CLASS,
  ART_GROUP_LABELS,
  COVERAGE_CLASS,
  artTabState,
} from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { resolveRender, renderEntry } from "./renderers.mjs";
import { buildAudio, buildMusic } from "./audio.mjs";
import { bucketArtEntries, buildArtGroupSection } from "./art.mjs";
import { buildArtTabBar, applyArtTabFilter } from "./art-tabs.mjs";
import { classLabel, buildSidebarItem, groupByRender } from "./sidebar.mjs";
import { buildCoverageSection } from "./coverage.mjs";
import { mountCombatLab, mountCombatNav } from "./combat-lab.mjs";
import { mountStory, mountStoryNav } from "./story.mjs";

async function fetchJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(label + ": HTTP " + res.status);
  return res.json();
}

async function init() {
  const main = document.getElementById("main");
  const sidebarNav = document.getElementById("sidebar-nav");

  let manifest,
    catalogManifest,
    audioManifest,
    musicManifest,
    renderSpec,
    audioIndex;
  try {
    [
      manifest,
      catalogManifest,
      audioManifest,
      musicManifest,
      renderSpec,
      audioIndex,
    ] = await Promise.all([
      fetchJson(MANIFEST_URL, "manifest"),
      fetchJson(CATALOG_MANIFEST_URL, "catalog-manifest"),
      fetchJson(AUDIO_MANIFEST_URL, "audio-manifest"),
      fetchJson(MUSIC_MANIFEST_URL, "music-manifest"),
      fetchJson(RENDER_SPEC_URL, "render-spec"),
      fetchJson(AUDIO_INDEX_URL, "audio-index"),
    ]);
  } catch (err) {
    main.innerHTML =
      '<div class="empty-state">Failed to load manifests: ' +
      String(err) +
      "</div>";
    console.error("[asset-storybook] manifest fetch failed:", err);
    // The combat lab does not depend on any manifest — keep it reachable.
    mountCombatNav(sidebarNav);
    mountCombatLab(main);
    // Story doesn't either (I-082) — same reason, same treatment.
    mountStoryNav(sidebarNav);
    await mountStory(main);
    return;
  }

  // asset-keys.json only powers the Coverage panel — its absence
  // shouldn't take down the rest of the page, so it's fetched
  // independently of the critical Promise.all above.
  let assetKeys = null;
  try {
    assetKeys = await fetchJson(ASSET_KEYS_URL, "asset-keys");
  } catch (err) {
    console.warn(
      "[asset-storybook] asset-keys.json unavailable — Coverage panel disabled:",
      err,
    );
  }

  // art-manifest.json (Concept Art) is curated and optional the same
  // way — a missing file disables the section instead of the page.
  let artManifest = null;
  try {
    artManifest = await fetchJson(ART_MANIFEST_URL, "art-manifest");
  } catch (err) {
    console.warn(
      "[asset-storybook] art-manifest.json unavailable — Concept Art section disabled:",
      err,
    );
  }

  // art-groups.json declares section order/labels; a missing/unreadable
  // registry falls back to the hardcoded cast/race/class order so the
  // page degrades instead of breaking.
  let artGroups = null;
  try {
    artGroups = await fetchJson(ART_GROUPS_URL, "art-groups");
  } catch (err) {
    console.warn(
      "[asset-storybook] art-groups.json unavailable — falling back to cast/race/class order:",
      err,
    );
  }

  // manifest.json (codegen-keyed) + catalog-manifest.json (curated) —
  // merged into one entry list the same way the storybook has always
  // treated "everything with a scene/stream" (§4.4: keyspaces are
  // disjoint by construction, enforced by the drift-gate's guard G).
  const entries = [
    ...Object.entries(manifest.entries || {}),
    ...Object.entries(catalogManifest.entries || {}),
  ];
  document.getElementById("stat-version").textContent = manifest.version ?? "?";
  document.getElementById("stat-total").textContent = entries.length;

  const characterEntries = entries.filter(([, e]) => e.kind === "character");
  document.getElementById("stat-characters").textContent =
    characterEntries.length;

  const iconEntries = entries.filter(
    ([, e]) => resolveRender(e, renderSpec) === "image",
  );
  document.getElementById("stat-icons").textContent = iconEntries.length;

  const audioFiles = audioIndex.files || [];
  document.getElementById("stat-sounds").textContent = audioFiles.length;

  const musicEntries = (musicManifest && musicManifest.entries) || {};
  const musicCount = Object.keys(musicEntries).length;

  const artEntries = (artManifest && artManifest.entries) || {};
  const artCount = Object.keys(artEntries).length;
  const artBuckets = bucketArtEntries(artEntries, artGroups);
  for (const g of artBuckets.order) {
    ART_GROUP_LABELS.set(g.id, g.label || g.id);
  }

  const groups = groupByRender(entries, renderSpec);

  const missingKeys = [];
  if (assetKeys) {
    const entryIds = new Set(entries.map(([key]) => key));
    for (const k of assetKeys.keys || []) {
      if (k && k.id && !entryIds.has(k.id)) missingKeys.push(k);
    }
  }

  // --- sidebar: "All" + one item per render-type present + SFX + Coverage ---
  const allBtn = buildSidebarItem(
    "all",
    entries.length + audioFiles.length + musicCount + artCount,
  );
  allBtn.classList.add("active");
  sidebarNav.appendChild(allBtn);

  // Combat lab goes directly under All, not at the end: it is not an asset
  // class, and the asset list is long enough that the last entry falls
  // below the fold on a short window.
  mountCombatNav(sidebarNav);
  mountStoryNav(sidebarNav);

  for (const groupKey of groups.keys()) {
    initHealth(groupKey, groups.get(groupKey).length);
    sidebarNav.appendChild(
      buildSidebarItem(groupKey, groups.get(groupKey).length),
    );
    renderSidebarBadge(groupKey);
  }

  if (audioFiles.length > 0) {
    initHealth(SFX_CLASS, audioFiles.length);
    sidebarNav.appendChild(buildSidebarItem(SFX_CLASS, audioFiles.length));
    renderSidebarBadge(SFX_CLASS);
  }

  if (musicCount > 0) {
    initHealth(MUSIC_CLASS, musicCount);
    sidebarNav.appendChild(buildSidebarItem(MUSIC_CLASS, musicCount));
    renderSidebarBadge(MUSIC_CLASS);
  }

  if (artCount > 0) {
    // Aggregate "Concept Art" entry first, then one entry per
    // non-empty group in registry order, then unregistered groups —
    // so the user gets Mobs/Bosses/etc. as their own jump targets
    // instead of one 90-entry bucket to scroll through.
    initHealth(ART_CLASS, artCount);
    sidebarNav.appendChild(buildSidebarItem(ART_CLASS, artCount));
    renderSidebarBadge(ART_CLASS);

    for (const g of artBuckets.order) {
      const list = artBuckets.buckets.get(g.id);
      if (!list || list.length === 0) continue;
      const cls = ART_CLASS + ":" + g.id;
      initHealth(cls, list.length);
      sidebarNav.appendChild(buildSidebarItem(cls, list.length));
      renderSidebarBadge(cls);
    }

    for (const [gid, list] of [...artBuckets.unregistered].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const cls = ART_CLASS + ":" + gid;
      initHealth(cls, list.length);
      sidebarNav.appendChild(buildSidebarItem(cls, list.length));
      renderSidebarBadge(cls);
    }
  }

  if (missingKeys.length > 0) {
    initHealth(COVERAGE_CLASS, missingKeys.length);
    sidebarNav.appendChild(
      buildSidebarItem(COVERAGE_CLASS, missingKeys.length),
    );
    for (const k of missingKeys) bumpHealth(COVERAGE_CLASS, { err: 1 });
  }

  main.innerHTML = "";

  // --- render-type sections — every group renders through the
  //     registry now; no more silent "no renderer wired up" text.
  //     A render-type nobody's implemented a builder for yet falls
  //     through renderEntry() to buildUnknown() and shows up as its
  //     own LOUD-red section instead of vanishing (§1 goal 4). ---
  for (const [groupKey, list] of groups) {
    const section = document.createElement("section");
    section.className = "kind-section";
    section.id = "section-" + groupKey;
    section.dataset.kind = groupKey;

    const h2 = document.createElement("h2");
    h2.textContent = classLabel(groupKey) + " (" + list.length + ")";
    section.appendChild(h2);

    const grid = document.createElement("div");
    grid.className = "grid";
    for (const [key, entry] of list) {
      grid.appendChild(renderEntry(key, entry, renderSpec, groupKey));
    }
    section.appendChild(grid);
    main.appendChild(section);
  }

  mountCombatLab(main);
  await mountStory(main);

  // --- soundboard section (bespoke, driven by audio-index.json — not
  //     the registry; see the RENDERERS comment above) ---
  if (audioFiles.length > 0) {
    const section = document.createElement("section");
    section.className = "kind-section";
    section.id = "section-" + SFX_CLASS;
    section.dataset.kind = SFX_CLASS;

    const h2 = document.createElement("h2");
    h2.textContent = "SFX (" + audioFiles.length + ")";
    section.appendChild(h2);

    const note = document.createElement("p");
    note.className = "empty-state";
    note.style.padding = "0 0 1rem";
    note.style.textAlign = "left";
    const mappedCount = Object.keys(audioManifest.entries || {}).length;
    note.textContent =
      "Baked SFX the game ships, from game-client/assets/audio/ (CC0 — Kenney Impact Sounds + RPG Audio). " +
      mappedCount +
      " of " +
      audioFiles.length +
      " are wired to gameplay events (audio-manifest.json) — highlighted below. Hover a tile to preview (loops); click to pin.";
    section.appendChild(note);

    section.appendChild(buildAudio(audioFiles, audioManifest.entries || {}));
    main.appendChild(section);
  }

  // --- music (BGM) section, driven by music-manifest.json ---
  if (musicCount > 0) {
    const section = document.createElement("section");
    section.className = "kind-section";
    section.id = "section-" + MUSIC_CLASS;
    section.dataset.kind = MUSIC_CLASS;

    const h2 = document.createElement("h2");
    h2.textContent = "Music (" + musicCount + ")";
    section.appendChild(h2);

    const note = document.createElement("p");
    note.className = "empty-state";
    note.style.padding = "0 0 1rem";
    note.style.textAlign = "left";
    note.textContent =
      "Background music from game-client/assets/music-manifest.json (CC0 / CC-BY-4.0). " +
      "Each tile shows its license and, for CC-BY, the required attribution. Hover to preview (loops); click to pin.";
    section.appendChild(note);

    section.appendChild(buildMusic(musicEntries));
    main.appendChild(section);
  }

  // --- concept art: tab bar (Task 8) + one <section> per non-empty
  //     group instead of a single "Concept Art" bucket holding all of
  //     them (see buildArtGroupSection). The tab bar is mounted first
  //     so it lands above the group sections in the DOM; artTabState.activeArtTab
  //     defaults to the first tab (same order the sections use — the
  //     registry order in artBuckets.order, filtered to non-empty
  //     groups) and applyArtTabFilter() below hides the rest. ---
  if (artCount > 0) {
    const artTabs = [];
    for (const g of artBuckets.order) {
      const list = artBuckets.buckets.get(g.id);
      if (!list || list.length === 0) continue;
      artTabs.push({
        id: g.id,
        label: g.label || g.id,
        count: list.length,
      });
    }
    for (const [gid, list] of [...artBuckets.unregistered].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      artTabs.push({
        id: gid,
        label: gid + " (unregistered)",
        count: list.length,
      });
    }
    artTabState.activeArtTab = artTabs.length > 0 ? artTabs[0].id : null;
    main.appendChild(buildArtTabBar(artTabs));

    for (const g of artBuckets.order) {
      const list = artBuckets.buckets.get(g.id);
      if (!list || list.length === 0) continue;
      main.appendChild(buildArtGroupSection(g.id, g.label || g.id, list));
    }

    for (const [gid, list] of [...artBuckets.unregistered].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      main.appendChild(
        buildArtGroupSection(gid, gid + " (unregistered)", list),
      );
    }

    applyArtTabFilter();
  }

  // --- coverage panel: codegen keys with no manifest entry ---
  if (missingKeys.length > 0) {
    main.appendChild(buildCoverageSection(missingKeys));
  }
}

init();
