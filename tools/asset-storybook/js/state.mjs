// Shared config constants + mutable app state for the asset storybook.
// Split out of index.html's single inline <script> (Task 9) -- moved
// verbatim from the top of that script; see index.html's git history
// for the original single-file version.

export const MANIFEST_URL = "../../game-client/assets/manifest.json";
export const CATALOG_MANIFEST_URL =
  "../../game-client/assets/catalog-manifest.json";
export const AUDIO_MANIFEST_URL =
  "../../game-client/assets/audio-manifest.json";
export const MUSIC_MANIFEST_URL =
  "../../game-client/assets/music-manifest.json";
export const ART_MANIFEST_URL =
  "../../game-client/assets/art/art-manifest.json";
export const ART_GROUPS_URL = "../../game-client/assets/art/art-groups.json";
// Fallback preserves the pre-T0 behaviour if the registry is unavailable,
// so a missing file degrades the section rather than breaking the page.
export const ART_GROUPS_FALLBACK = [
  { id: "cast", label: "Cast" },
  { id: "race", label: "Races" },
  { id: "class", label: "Classes" },
];
export const RENDER_SPEC_URL = "../../game-client/assets/render-spec.json";
export const ASSET_KEYS_URL = "../../colyseus-server/generated/asset-keys.json";
export const AUDIO_INDEX_URL = "./audio-index.json";
export const ASSET_ROOT = "../../game-client/"; // scene/stream paths are "res://assets/..." relative to game-client/
export const RAW_AUDIO_ROOT = "../../game-client/assets/audio/"; // baked SFX the game ships (audio-index.json lists this dir)
export const ART_ROOT = "../../game-client/assets/art/"; // concept-art PNGs are plain files, not res:// scene/stream paths (art-manifest.json "file" is relative to this dir — mirrors RAW_AUDIO_ROOT)

export const SFX_CLASS = "sfx"; // synthetic class for the audio soundboard (not present in any manifest)
export const MUSIC_CLASS = "music"; // synthetic class for the BGM section (music-manifest.json)
export const ART_CLASS = "art"; // synthetic class for the aggregate Concept Art entry (art-manifest.json)
// Per-group art sections/sidebar items use "art:<groupId>" as their
// class — populated from art-groups.json (or its fallback) once
// fetched in init(), and read by classLabel() below. Keeps classLabel
// a pure lookup instead of threading the registry through every call.
export const ART_GROUP_LABELS = new Map();
// Task 8 — tab layer over the art groups. activeArtTab is the
// currently selected group id (defaults to the first non-empty
// group at init); artFilterText is the free-text filter, combined
// with the tabs. Both are pure UI state: applyArtTabFilter() below
// only ever toggles section/card `style.display`, never re-buckets,
// re-fetches, or touches `health` — so the aggregate health stays the
// sum of every group's regardless of what's currently hidden.
// activeArtTab/artFilterText moved into one mutable, exported object
// (rather than two top-level `let` bindings) because both are reassigned
// from three different modules (js/art-tabs.mjs, js/sidebar.mjs,
// js/main.mjs) -- an ES module cannot reassign another module's `let`
// export, it can only mutate a shared object's properties. This is the
// one place the module split required more than moving code verbatim;
// every read/write site was updated identically (activeArtTab ->
// artTabState.activeArtTab, artFilterText -> artTabState.artFilterText).
export const artTabState = { activeArtTab: null, artFilterText: "" };
export const COVERAGE_CLASS = "coverage"; // synthetic class for unmapped-codegen-key cards (§8 Phase 1c)
// synthetic class for the embedded combat balance lab (tools/combat-lab).
// Not an asset — it has no manifest entry, no health, no renderer. It is
// here because the storybook is where the team already looks.
export const COMBAT_CLASS = "combat";

// synthetic class for the embedded story surfaces (I-082): the story-explorer
// reader + graph and the Undertow novel. Like COMBAT_CLASS above it is not an
// asset — no manifest entry, no renderer, no per-view health.
export const STORY_CLASS = "story";
export const STORY_VIEWS_URL = "./story-views.json";
// Fallback mirrors ART_GROUPS_FALLBACK: a missing/unreadable registry degrades
// the section to the three known views instead of breaking the page.
export const STORY_VIEWS_FALLBACK = [
  { id: "reader", label: "Reader", src: "../story-explorer/reader.html" },
  { id: "graph", label: "Graph", src: "../story-explorer/index.html" },
  {
    id: "novel",
    label: "Undertow",
    src: "../../docs/story/undertow/novel-illustrated-edition.html",
  },
];

// health[kind] = { total, ok, err } — updated as models/audio finish loading,
// sidebar badges re-render on every update.
export const health = {};
