// Audio panel — SSOT merge W0-6 (the go/no-go spike for the panel host).
//
// Wraps the existing WebAudio soundboards (js/audio.mjs buildAudio/buildMusic)
// unchanged. audio.mjs has no mount function of its own: it returns the board
// element, so this panel owns the three fetches main.mjs used to do for it and
// the SFX | Music switch. Decoded buffers live in the tiles' closures, so as
// long as the panel DOM stays mounted (registry.mjs hides/shows, never
// destroys) a tab round trip re-fetches and re-decodes nothing.
import { buildAudio, buildMusic } from "../audio.mjs";
import {
  AUDIO_INDEX_URL,
  AUDIO_MANIFEST_URL,
  MUSIC_MANIFEST_URL,
  fetchJson,
} from "../state.mjs";
import { register } from "./registry.mjs";

const MODES = ["sfx", "music"];
let root = null;
let counts = null; // {sfx, music} once mounted
let boards = {}; // mode → <section>
let buttons = {}; // mode → <button>

function note(text) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.style.padding = "0 0 1rem";
  p.style.textAlign = "left";
  p.textContent = text;
  return p;
}

function section(mode, title, blurb, board) {
  const s = document.createElement("section");
  s.className = "kind-section";
  s.id = "section-" + mode;
  s.dataset.kind = mode;
  const h2 = document.createElement("h2");
  h2.textContent = title;
  s.append(h2, note(blurb), board);
  return s;
}

function setMode(mode) {
  const active = MODES.includes(mode) ? mode : "sfx";
  for (const m of MODES) {
    boards[m].hidden = m !== active;
    buttons[m].classList.toggle("joy-button--solid", m === active);
    buttons[m].classList.toggle("joy-button--outline", m !== active);
    buttons[m].setAttribute("aria-pressed", String(m === active));
  }
  // A board that just became hidden must not keep a tile looping.
  silence(boards[active === "sfx" ? "music" : "sfx"]);
}

// Release anything audible inside `scope`: unpin pinned tiles (a click toggles
// the pin and stops the source when the pointer is elsewhere), then let hovered
// ones go. Tiles keep their decoded buffers.
function silence(scope) {
  scope.querySelectorAll(".sound-tile.pinned").forEach((t) => t.click());
  scope
    .querySelectorAll(".sound-tile.playing")
    .forEach((t) => t.dispatchEvent(new Event("mouseleave")));
}

function toolbar() {
  const bar = document.createElement("div");
  bar.className = "subview-bar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Soundboard");
  bar.style.padding = "0 0 .75rem";
  const labels = {
    sfx: "SFX (" + counts.sfx + ")",
    music: "Music (" + counts.music + ")",
  };
  for (const mode of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "joy-button joy-button--sm joy-button--outline";
    b.dataset.mode = mode;
    b.textContent = labels[mode];
    b.addEventListener("click", () => {
      setMode(mode);
      if (window.atlasSetParams)
        window.atlasSetParams({ mode }, { push: true });
    });
    buttons[mode] = b;
    bar.appendChild(b);
  }
  return bar;
}

register("audio", {
  async mount(el) {
    root = el;
    el.replaceChildren(note("Loading soundboard…"));
    const [audioIndex, audioManifest, musicManifest] = await Promise.all([
      fetchJson(AUDIO_INDEX_URL, "audio-index"),
      fetchJson(AUDIO_MANIFEST_URL, "audio-manifest"),
      fetchJson(MUSIC_MANIFEST_URL, "music-manifest"),
    ]);
    const files = audioIndex.files || [];
    const musicEntries = musicManifest.entries || {};
    const mapped = Object.keys(audioManifest.entries || {}).length;
    counts = {
      sfx: files.length,
      music: Object.values(musicEntries).filter(
        (e) => e && typeof e.stream === "string",
      ).length,
    };

    boards.sfx = section(
      "sfx",
      "SFX (" + counts.sfx + ")",
      "Baked SFX the game ships, from game-client/assets/audio/ (CC0 — Kenney Impact Sounds + RPG Audio). " +
        mapped +
        " of " +
        counts.sfx +
        " are wired to gameplay events (audio-manifest.json) — highlighted below. Hover a tile to preview (loops); click to pin.",
      buildAudio(files, audioManifest.entries || {}),
    );
    boards.music = section(
      "music",
      "Music (" + counts.music + ")",
      "Background music from game-client/assets/music-manifest.json (CC0 / CC-BY-4.0). " +
        "Each tile shows its license and, for CC-BY, the required attribution. Hover to preview (loops); click to pin.",
      buildMusic(musicEntries),
    );
    el.replaceChildren(toolbar(), boards.sfx, boards.music);
    setMode("sfx");
  },
  show(params) {
    if (boards.sfx) setMode(params && params.mode);
  },
  hide() {
    if (root) silence(root);
  },
  count() {
    return counts ? counts.sfx + counts.music : null;
  },
});
