// The bespoke, non-grid sections: SFX, Music, Concept Art and Coverage.
//
// Each is driven by its own curated source rather than by the asset manifests,
// so none of them goes through the taxonomy/VirtualGrid path. Split out of
// init() (F-038 Task 13), which had grown to 522 lines doing fetching, stats,
// sidebar, grids, filters and all of these at once.

import { SFX_CLASS, MUSIC_CLASS, ART_CLASS, artTabState } from "../state.mjs";
import { buildAudio, buildMusic } from "../audio.mjs";
import { buildArtGroupSection } from "../art.mjs";
import { buildArtTabBar, applyArtTabFilter } from "../art-tabs.mjs";
import { buildCoverageSection } from "../coverage.mjs";

export function mountBespokeSections({
  main,
  audioFiles,
  audioManifest,
  musicEntries,
  musicCount,
  artCount,
  artBuckets,
  missingKeys,
}) {
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
