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
  TAXONOMY_URL,
  taxonomyState,
  THUMB_INDEX_URL,
  REVIEW_QUEUE_URL,
  REJECTED_CLASS,
  REBUILD_CLASS,
  UNREVIEWED_CLASS,
  fetchJson,
} from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { resolveRender } from "./renderers.mjs";
import { bucketArtEntries } from "./art.mjs";
import { classLabel, buildSidebarItem } from "./sidebar.mjs";
import { loadTaxonomy, groupEntries } from "./data/taxonomy.mjs";
import { loadThumbIndex, thumbUrlFor } from "./data/thumbs.mjs";
import { buildCard } from "./view/Card.mjs";
import { VirtualGrid, preloadThumbnails } from "./view/VirtualGrid.mjs";
import { openDetail } from "./view/DetailOverlay.mjs";
import { initReview } from "./review/ui.mjs";
import { mountVerdictFilters } from "./review/filters.mjs";
import { mountBespokeSections } from "./view/sections.mjs";
import { mountCombatLab, mountCombatNav } from "./combat-lab.mjs";
import { mountStory, mountStoryNav } from "./story.mjs";
import { mountForge, mountForgeNav } from "./forge/nav.mjs";

async function init() {
  const main = document.getElementById("main");
  const sidebarNav = document.getElementById("sidebar-nav");

  let manifest,
    catalogManifest,
    audioManifest,
    musicManifest,
    renderSpec,
    audioIndex,
    taxonomyJson;
  try {
    [
      manifest,
      catalogManifest,
      audioManifest,
      musicManifest,
      renderSpec,
      audioIndex,
      taxonomyJson,
    ] = await Promise.all([
      fetchJson(MANIFEST_URL, "manifest"),
      fetchJson(CATALOG_MANIFEST_URL, "catalog-manifest"),
      fetchJson(AUDIO_MANIFEST_URL, "audio-manifest"),
      fetchJson(MUSIC_MANIFEST_URL, "music-manifest"),
      fetchJson(RENDER_SPEC_URL, "render-spec"),
      fetchJson(AUDIO_INDEX_URL, "audio-index"),
      fetchJson(TAXONOMY_URL, "asset-taxonomy"),
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
    // Nor does the forge dashboard (F-050) — its data is the run ledgers.
    mountForgeNav(sidebarNav);
    mountForge(main);
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

  // .thumbs/index.json is fetched NON-critically: a checkout that has never
  // run scripts/bake_thumbnails.mjs should still render the page (with LOUD
  // "no baked thumbnail" cards) rather than a blank screen. Guard (U) is what
  // makes a missing thumbnail a build failure; the page only has to degrade.
  let thumbIndex = new Map();
  try {
    thumbIndex = loadThumbIndex(
      await fetchJson(THUMB_INDEX_URL, "thumb-index"),
    );
  } catch (err) {
    console.warn(
      "[asset-storybook] .thumbs/index.json unavailable — run `node scripts/bake_thumbnails.mjs`:",
      err,
    );
  }

  // Review layer (Phase 4). content/review-queue.json is the COMMITTED source
  // of truth; localStorage holds only unsaved marks. Non-critical: a repo with
  // no queue file yet simply starts with zero verdicts.
  let reviewQueue = { version: 1, verdicts: {} };
  try {
    reviewQueue = await fetchJson(REVIEW_QUEUE_URL, "review-queue");
  } catch (err) {
    console.warn(
      "[asset-storybook] review-queue.json unavailable — starting with no verdicts:",
      err,
    );
  }
  initReview(reviewQueue);

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

  // Sections are keyed by manifest `kind` through content/asset-taxonomy.json
  // (F-038). taxonomy.json is fetched with the critical manifests above, so a
  // missing registry is a hard failure here rather than a silent fall-through
  // to munged labels — which is the whole point of the registry.
  taxonomyState.taxonomy = loadTaxonomy(taxonomyJson);
  const groups = groupEntries(entries, taxonomyState.taxonomy);

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
  // Forge (F-050) sits with the other non-asset sections near the top.
  mountForgeNav(sidebarNav);

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
  const gridsBySection = new Map();

  // --- one virtualized section per taxonomy section. Cards are baked
  //     thumbnails (js/view/Card.mjs); the live renderers in renderers.mjs
  //     now run only inside the detail overlay, one at a time. An asset with
  //     no baked thumbnail still gets a LOUD red card rather than a blank
  //     one — guard (U) fails the build before that can reach anyone. ---
  for (const [groupKey, list] of groups) {
    const section = document.createElement("section");
    section.className = "kind-section";
    section.id = "section-" + groupKey;
    section.dataset.kind = groupKey;

    const h2 = document.createElement("h2");
    h2.textContent = classLabel(groupKey) + " (" + list.length + ")";
    section.appendChild(h2);

    const gridHost = document.createElement("div");
    section.appendChild(gridHost);
    // Attach BEFORE constructing the grid: VirtualGrid measures clientWidth to
    // derive its column count, and a detached element reports 0 — which yields
    // one column, a wrong height, and a getBoundingClientRect() of all zeros,
    // so nothing ever falls inside the visible range. Symptom is an empty grid.
    main.appendChild(section);

    // One VirtualGrid per section. Only the rows near the viewport are ever
    // in the DOM, so a 283-card section costs the same as a 5-card one.
    const grid = new VirtualGrid({
      container: gridHost,
      items: list,
      rowHeight: 340,
      minColumnWidth: 260,
      buildCard: ([key, entry]) =>
        buildCard(key, entry, {
          thumbIndex,
          sectionId: groupKey,
          onOpen: (k) =>
            openDetail({
              items: list,
              index: list.findIndex(([kk]) => kk === k),
              renderSpec,
            }),
        }),
    });
    gridsBySection.set(groupKey, grid);

    // Health is counted over the FULL list via a bounded preload, never over
    // mounted cards — a virtualized card that scrolls away is removed from the
    // DOM, and card-driven counting would drift on every scroll. This is also
    // what finally lets a class settle: every item reports exactly once.
    preloadThumbnails(
      list.map(([, entry]) =>
        thumbUrlFor(entry.scene ?? entry.stream ?? "", thumbIndex),
      ),
      {
        onOk: () => bumpHealth(groupKey, { ok: 1 }),
        onErr: () => bumpHealth(groupKey, { err: 1 }),
      },
    );
  }

  mountVerdictFilters({
    sidebarNav,
    groups,
    gridsBySection,
    totalItems: entries.length,
  });

  mountCombatLab(main);
  await mountStory(main);
  mountForge(main);

  mountBespokeSections({
    main,
    audioFiles,
    audioManifest,
    musicEntries,
    musicCount,
    artCount,
    artBuckets,
    missingKeys,
  });
}

init();
