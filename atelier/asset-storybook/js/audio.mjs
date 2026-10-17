import { resolveSceneSrc, filenameOf } from "./utils.mjs";
import { bumpHealth } from "./health.mjs";
import { SFX_CLASS, MUSIC_CLASS, RAW_AUDIO_ROOT } from "./state.mjs";

// ---------- soundboard ----------

// Playback uses the WebAudio API (decodeAudioData + AudioBufferSourceNode)
// rather than a native <audio> element. The element's resource-loading
// path stalls indefinitely against a bare static file server that ignores
// HTTP Range requests (e.g. `python3 -m http.server`, used for local
// verification) — readyState never leaves HAVE_NOTHING. Fetching the whole
// file and decoding it into an AudioBuffer sidesteps that entirely and
// gives sample-accurate looping for the short one-shot SFX.
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Browsers gate audio behind a user gesture: the context starts
// "suspended" until the first interaction. Resume it on the first pointer
// or key event anywhere on the page so hover-to-play works thereafter.
function primeAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();
}
window.addEventListener("pointerdown", primeAudio);
window.addEventListener("keydown", primeAudio);

async function loadAudioBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const bytes = await res.arrayBuffer();
  return getAudioCtx().decodeAudioData(bytes);
}

// Cap concurrent fetch+decode so the SFX pack doesn't starve the character
// glTF loads for bandwidth/CPU on first paint. Small batches, not one
// big fan-out.
const AUDIO_DECODE_CONCURRENCY = 4;
let activeDecodes = 0;
const decodeQueue = [];

function scheduleDecode(task) {
  decodeQueue.push(task);
  pumpDecodeQueue();
}

function pumpDecodeQueue() {
  while (activeDecodes < AUDIO_DECODE_CONCURRENCY && decodeQueue.length > 0) {
    const task = decodeQueue.shift();
    activeDecodes++;
    task().finally(() => {
      activeDecodes--;
      pumpDecodeQueue();
    });
  }
}

export function buildAudio(audioFiles, audioManifestEntries) {
  // Map raw filename -> [{ eventKey, license }] for the curated event keys
  // in audio-manifest.json, so rows can be visually distinguished.
  const mappedByFile = new Map();
  for (const [eventKey, entry] of Object.entries(audioManifestEntries)) {
    if (!entry || typeof entry.stream !== "string") continue;
    const file = filenameOf(entry.stream);
    if (!mappedByFile.has(file)) mappedByFile.set(file, []);
    mappedByFile.get(file).push({ eventKey, license: entry.license });
  }

  const board = document.createElement("div");
  board.className = "soundboard";

  // Decode is deferred: nothing is fetched/decoded until the soundboard
  // nears the viewport (IntersectionObserver below) or a tile is
  // hovered/focused (play() → ensureDecode()). Keeps the whole SFX pack off the
  // first-paint budget. `warmups` collects each tile's idempotent
  // decode-kickoff so the observer can warm the whole pack at once.
  const warmups = [];

  for (const file of audioFiles) {
    const mapped = mappedByFile.get(file.name) || [];
    const tile = document.createElement("div");
    tile.className = "sound-tile" + (mapped.length > 0 ? " mapped" : "");
    tile.tabIndex = 0;
    tile.title = "Hover to preview (loops) · click to pin";

    // top: equalizer glyph (animates while playing) + health dot
    const top = document.createElement("div");
    top.className = "tile-top";
    const wave = document.createElement("div");
    wave.className = "wave";
    for (let i = 0; i < 4; i++)
      wave.appendChild(document.createElement("span"));
    top.appendChild(wave);
    const state = document.createElement("span");
    state.className = "sound-state";
    top.appendChild(state);
    tile.appendChild(top);

    const nameEl = document.createElement("div");
    nameEl.className = "sound-name";
    nameEl.textContent = file.name;
    tile.appendChild(nameEl);

    // bottom: size + first mapped event key (title lists all)
    const bot = document.createElement("div");
    bot.className = "tile-bot";
    const sizeEl = document.createElement("span");
    sizeEl.className = "sound-size";
    sizeEl.textContent = file.bytes
      ? (file.bytes / 1024).toFixed(1) + " KB"
      : "";
    bot.appendChild(sizeEl);
    if (mapped.length > 0) {
      const keyEl = document.createElement("span");
      keyEl.className = "event-key";
      keyEl.textContent =
        mapped.length > 1
          ? mapped[0].eventKey + " +" + (mapped.length - 1)
          : mapped[0].eventKey;
      keyEl.title = mapped
        .map((m) => m.eventKey + (m.license ? " (" + m.license + ")" : ""))
        .join(", ");
      bot.appendChild(keyEl);
    }
    tile.appendChild(bot);

    // Playback engine: an AudioBuffer decoded once, replayed via a fresh
    // AudioBufferSourceNode each time (source nodes are single-use).
    // Looped so a short SFX stays audible while the pointer rests.
    let buffer = null;
    let source = null;
    let pinned = false;

    function stopSource() {
      if (source) {
        try {
          source.stop();
        } catch (e) {
          /* already stopped — ignore */
        }
        source.disconnect();
        source = null;
      }
    }

    function play() {
      ensureDecode(); // decode-on-demand: first hover kicks the fetch
      if (!buffer) return;
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") ctx.resume();
      stopSource();
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ctx.destination);
      source.start();
      tile.classList.add("playing");
    }

    function stop() {
      stopSource();
      tile.classList.remove("playing");
    }

    tile.addEventListener("mouseenter", play);
    tile.addEventListener("mouseleave", () => {
      if (!pinned) stop();
    });
    tile.addEventListener("focus", play);
    tile.addEventListener("blur", () => {
      if (!pinned) stop();
    });
    // Click pins the loop so it keeps playing after the mouse leaves;
    // click again to release (keeps playing if still hovered).
    tile.addEventListener("click", () => {
      pinned = !pinned;
      tile.classList.toggle("pinned", pinned);
      if (pinned) play();
      else if (!tile.matches(":hover")) stop();
    });
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tile.click();
      }
    });

    // Idempotent decode-kickoff: the first call (from hover/focus or the
    // section-visible observer) queues the fetch+decode; later calls are
    // no-ops. Guarded by `decodeStarted` so a hover mid-decode can't
    // double-fetch.
    let decodeStarted = false;
    function ensureDecode() {
      if (decodeStarted) return;
      decodeStarted = true;
      scheduleDecode(() =>
        loadAudioBuffer(RAW_AUDIO_ROOT + file.name)
          .then((decoded) => {
            buffer = decoded;
            state.classList.add("ok");
            bumpHealth(SFX_CLASS, { ok: 1 });
            // If the user is already hovering/pinned while it decoded.
            if (pinned || tile.matches(":hover")) play();
          })
          .catch((err) => {
            state.classList.add("err");
            bumpHealth(SFX_CLASS, { err: 1 });
            console.error(
              "[asset-storybook] audio decode failed:",
              file.name,
              err,
            );
          }),
      );
    }
    warmups.push(ensureDecode);

    board.appendChild(tile);
  }

  // Warm the whole pack once the soundboard scrolls near the viewport, so
  // the first hover after arriving is instant. Until then, zero SFX are
  // fetched — the section can sit below 55 model cards untouched.
  const warmObserver = new IntersectionObserver(
    (entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        obs.disconnect();
        for (const warm of warmups) warm();
      }
    },
    { rootMargin: "200px" },
  );
  warmObserver.observe(board);

  return board;
}

// ---------- music (BGM) soundboard ----------
// Driven directly by music-manifest.json entries (not a directory
// listing like SFX): each music:* entry is a full track with its own
// license/author. Reuses the same WebAudio decode+loop engine as the
// SFX board (getAudioCtx / loadAudioBuffer / scheduleDecode), so the two
// stay consistent; the tile just carries a license·author badge instead
// of a mapped event key.
export function buildMusic(musicEntries) {
  const board = document.createElement("div");
  board.className = "soundboard";
  const warmups = [];

  for (const [key, entry] of Object.entries(musicEntries)) {
    if (!entry || typeof entry.stream !== "string") continue;

    const tile = document.createElement("div");
    tile.className = "sound-tile mapped";
    tile.tabIndex = 0;
    tile.title = "Hover to preview (loops) · click to pin";

    const top = document.createElement("div");
    top.className = "tile-top";
    const wave = document.createElement("div");
    wave.className = "wave";
    for (let i = 0; i < 4; i++)
      wave.appendChild(document.createElement("span"));
    top.appendChild(wave);
    const state = document.createElement("span");
    state.className = "sound-state";
    top.appendChild(state);
    tile.appendChild(top);

    const nameEl = document.createElement("div");
    nameEl.className = "sound-name";
    nameEl.textContent = key.replace(/^music:/, "");
    tile.appendChild(nameEl);

    // bottom: license token + author (CC-BY attribution), full source in title
    const bot = document.createElement("div");
    bot.className = "tile-bot";
    const licEl = document.createElement("span");
    licEl.className = "sound-size";
    licEl.textContent = entry.license || "?";
    bot.appendChild(licEl);
    if (entry.author) {
      const authEl = document.createElement("span");
      authEl.className = "event-key";
      authEl.textContent = entry.author;
      authEl.title = [entry.license, entry.author, entry.source]
        .filter(Boolean)
        .join(" · ");
      bot.appendChild(authEl);
    }
    tile.appendChild(bot);

    const url = resolveSceneSrc(entry.stream);
    let buffer = null;
    let source = null;
    let pinned = false;

    function stopSource() {
      if (source) {
        try {
          source.stop();
        } catch (e) {
          /* already stopped — ignore */
        }
        source.disconnect();
        source = null;
      }
    }

    function play() {
      ensureDecode();
      if (!buffer) return;
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") ctx.resume();
      stopSource();
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ctx.destination);
      source.start();
      tile.classList.add("playing");
    }

    function stop() {
      stopSource();
      tile.classList.remove("playing");
    }

    tile.addEventListener("mouseenter", play);
    tile.addEventListener("mouseleave", () => {
      if (!pinned) stop();
    });
    tile.addEventListener("focus", play);
    tile.addEventListener("blur", () => {
      if (!pinned) stop();
    });
    tile.addEventListener("click", () => {
      pinned = !pinned;
      tile.classList.toggle("pinned", pinned);
      if (pinned) play();
      else if (!tile.matches(":hover")) stop();
    });
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tile.click();
      }
    });

    let decodeStarted = false;
    function ensureDecode() {
      if (decodeStarted) return;
      decodeStarted = true;
      scheduleDecode(() =>
        loadAudioBuffer(url)
          .then((decoded) => {
            buffer = decoded;
            state.classList.add("ok");
            bumpHealth(MUSIC_CLASS, { ok: 1 });
            if (pinned || tile.matches(":hover")) play();
          })
          .catch((err) => {
            state.classList.add("err");
            bumpHealth(MUSIC_CLASS, { err: 1 });
            console.error("[asset-storybook] music decode failed:", key, err);
          }),
      );
    }
    warmups.push(ensureDecode);

    board.appendChild(tile);
  }

  const warmObserver = new IntersectionObserver(
    (entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        obs.disconnect();
        for (const warm of warmups) warm();
      }
    },
    { rootMargin: "200px" },
  );
  warmObserver.observe(board);

  return board;
}
