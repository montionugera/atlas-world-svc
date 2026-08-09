import { resolveSceneSrc, filenameOf } from "./utils.mjs";
import { bumpHealth } from "./health.mjs";

// ---------- render-type resolution (§4.1) ----------
//
// Mirrored byte-for-byte in scripts/check_asset_manifest.mjs so the
// gate and this page can never disagree on what a given entry renders
// as. `render` is optional and authoritative when present; otherwise
// resolve by kind-default → extension-sniff → "unknown".

function primaryPath(entry) {
  return entry.scene ?? entry.stream ?? "";
}

export function resolveRender(entry, spec) {
  if (entry.render) return entry.render; // 1. explicit — authoritative
  if (entry.kind && spec.kindDefaultRender[entry.kind])
    return spec.kindDefaultRender[entry.kind]; // 2. unambiguous kind default
  const path = primaryPath(entry);
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return spec.extRender[ext] || "unknown"; // 3. ext sniff → 4. unknown
}

// ---------- shared card chrome ----------
//
// Every render-type builder returns just the `.viewport` contents;
// this wraps it in the same key/filename/badges footer every card has
// always had, so plugging in a new renderer never touches this shell.

function buildCardShell(key, entry, render, viewportEl) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.kind = entry.kind || "unknown";
  card.dataset.render = render;
  card.appendChild(viewportEl);

  const meta = document.createElement("div");
  meta.className = "meta";

  const keyEl = document.createElement("p");
  keyEl.className = "key";
  keyEl.textContent = key;

  const fileEl = document.createElement("p");
  fileEl.className = "filename";
  fileEl.textContent = filenameOf(primaryPath(entry));
  const sizeEl = document.createElement("span");
  sizeEl.className = "filesize";
  fileEl.appendChild(sizeEl);

  const badges = document.createElement("div");
  badges.className = "badges";

  const tierBadge = document.createElement("span");
  tierBadge.className = "badge tier-" + (entry.tier || "unknown");
  tierBadge.textContent = entry.tier || "unknown tier";
  badges.appendChild(tierBadge);

  const kindBadge = document.createElement("span");
  kindBadge.className = "badge kind";
  kindBadge.textContent = entry.kind || "unknown kind";
  badges.appendChild(kindBadge);

  const licenseBadge = document.createElement("span");
  licenseBadge.className = "badge license";
  licenseBadge.textContent = entry.license || "unknown license";
  badges.appendChild(licenseBadge);

  meta.appendChild(keyEl);
  meta.appendChild(fileEl);
  meta.appendChild(badges);

  card.appendChild(meta);
  return card;
}

// ---------- render-type registry ----------
//
// render-type → builder(key, entry, render) → viewport element.
// Plugging in a new renderer = one row in render-spec.json (so the
// gate validates it too) + one build fn registered here — no other
// code path changes.
//
// `audio` is deliberately NOT in this map: buildAudio() builds the
// whole SFX section from the raw audio-index.json pack listing (a
// bespoke, whole-pack browser, not a per-entry card — §5's decision to
// keep the raw-pack view alive rather than shrink it to the 3 curated
// audio-manifest.json entries), so its signature doesn't match the
// single-entry builder(key, entry, render) contract every RENDERERS
// entry must honor. It's called directly from init() instead.

const RENDERERS = {
  model3d: buildModel3d,
  image: buildImage,
  spritesheet: buildSpritesheet,
  ninepatch: buildNinePatch,
  tileset: buildTileset,
  theme: buildTheme,
  __unknown: buildUnknown,
};

export function renderEntry(key, entry, spec, healthKey) {
  const render = resolveRender(entry, spec);
  const build = RENDERERS[render] || RENDERERS.__unknown;
  // healthKey === null means "this is an overlay mount, not a grid card".
  // Grid health is owned by the thumbnail preload in VirtualGrid.mjs, so an
  // overlay open must not add to any class's totals.
  const viewportEl = build(key, entry, healthKey || "__overlay");
  return buildCardShell(key, entry, render, viewportEl);
}

// ---------- 3D character cards (with animation dropdown) ----------

// Perf: with one WebGL renderer per card, 8+ cards animating and
// auto-rotating at once melt the page. Cards load as posed stills;
// only the HOVERED card animates + turntables, and anything scrolled
// off-screen is force-paused (same hover-to-play convention as SFX).
const mvVisibility = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const mv = e.target.querySelector("model-viewer");
      if (mv && !e.isIntersecting) {
        mv.pause();
        mv.removeAttribute("auto-rotate");
      }
    }
  },
  { threshold: 0.05 },
);

function buildModel3d(key, entry, render) {
  const src = resolveSceneSrc(entry.scene);

  const viewport = document.createElement("div");
  viewport.className = "viewport";

  const mv = document.createElement("model-viewer");
  mv.setAttribute("src", src);
  mv.setAttribute("alt", key);
  mv.setAttribute("camera-controls", "");
  mv.setAttribute("shadow-intensity", "1");
  mv.setAttribute("exposure", "1");
  mv.setAttribute("environment-image", "neutral");
  // Pin the vertical FOV so our height-based framing (see frameByHeight
  // on load) sets the camera distance instead of model-viewer auto-zoom.
  mv.setAttribute("field-of-view", "30deg");

  viewport.addEventListener("mouseenter", () => {
    mv.setAttribute("auto-rotate", "");
    mv.play();
  });
  viewport.addEventListener("mouseleave", () => {
    mv.pause();
    mv.removeAttribute("auto-rotate");
  });
  mvVisibility.observe(viewport);

  const loadState = document.createElement("div");
  loadState.className = "load-state";
  loadState.textContent = "loading…";

  // Animation dropdown — populated from model-viewer's own
  // `availableAnimations` once the glTF has loaded. Defaults to "idle"
  // when present, else the first clip.
  const animPicker = document.createElement("div");
  animPicker.className = "anim-picker";
  const animSelect = document.createElement("select");
  animSelect.disabled = true;
  const placeholderOpt = document.createElement("option");
  placeholderOpt.textContent = "no clips";
  animSelect.appendChild(placeholderOpt);
  animPicker.appendChild(animSelect);

  animSelect.addEventListener("change", () => {
    mv.animationName = animSelect.value;
    mv.currentTime = 0;
    mv.play();
  });

  // Frame every character by HEIGHT, not by model-viewer's default
  // fit-the-bounding-sphere. Rest poses are inconsistent across the
  // catalog — some export A-pose (~2u wide), some T-pose (~5.7u wide) —
  // and auto-fit zooms out to the arm span, shrinking T-pose characters
  // to an unreadable blob. Sizing the camera distance from the model's
  // height instead makes every card read at the same scale; the wide
  // T-pose arms simply crop at the card edges.
  function frameByHeight() {
    const d = mv.getDimensions();
    const c = mv.getCameraTarget();
    if (!d || !(d.y > 0)) return;
    const fovRad = (30 * Math.PI) / 180; // matches field-of-view above
    const fill = 0.85; // model height fills ~85% of the viewport
    const radius = d.y / 2 / Math.tan(fovRad / 2) / fill;
    mv.cameraTarget = `${c.x}m ${c.y}m ${c.z}m`;
    mv.cameraOrbit = `0deg 82deg ${radius}m`;
    mv.jumpCameraToGoal();
  }

  mv.addEventListener("load", () => {
    loadState.textContent = "loaded ✓";
    loadState.classList.add("ok");
    bumpHealth(render, { ok: 1 });
    frameByHeight();

    const clips = mv.availableAnimations || [];
    animSelect.innerHTML = "";
    if (clips.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "no clips";
      animSelect.appendChild(opt);
      animSelect.disabled = true;
      return;
    }
    for (const clip of clips) {
      const opt = document.createElement("option");
      opt.value = clip;
      opt.textContent = clip;
      animSelect.appendChild(opt);
    }
    animSelect.disabled = false;
    const defaultClip = clips.includes("idle") ? "idle" : clips[0];
    animSelect.value = defaultClip;
    mv.animationName = defaultClip;
    mv.pause(); // posed still; hover (or the dropdown) starts playback
  });
  mv.addEventListener("error", (e) => {
    loadState.textContent = "load error";
    loadState.classList.add("err");
    bumpHealth(render, { err: 1 });
    console.error("[asset-storybook] model failed to load:", key, src, e);
  });

  viewport.appendChild(mv);
  viewport.appendChild(animPicker);
  viewport.appendChild(loadState);
  return viewport;
}

// ---------- 2D image cards (icons/sprites) ----------

function buildImage(key, entry, render) {
  const src = resolveSceneSrc(entry.scene);

  const viewport = document.createElement("div");
  viewport.className = "viewport image-viewport";

  const img = document.createElement("img");
  img.setAttribute("alt", key);
  img.setAttribute("src", src);

  const loadState = document.createElement("div");
  loadState.className = "load-state";
  loadState.textContent = "loading…";

  img.addEventListener("load", () => {
    loadState.textContent = "loaded ✓";
    loadState.classList.add("ok");
    bumpHealth(render, { ok: 1 });
  });
  img.addEventListener("error", (e) => {
    loadState.textContent = "load error";
    loadState.classList.add("err");
    bumpHealth(render, { err: 1 });
    console.error("[asset-storybook] image failed to load:", key, src, e);
  });

  viewport.appendChild(img);
  viewport.appendChild(loadState);
  return viewport;
}

// ---------- spritesheet cards (SpriteFrames flipbook, Canvas2D + rAF) ----------
//
// Supports both spritesheet oneOf shapes render-spec.json validates
// (§4.2/§4.4):
//   - multi-clip: entry.frame + entry.animations[] (named clips, e.g.
//     idle/walk/attack — the Godot SpriteFrames model) — a clip
//     <select> mirrors the model3d anim dropdown exactly.
//   - single-grid: entry.frame + entry.frames (one uniform flipbook,
//     e.g. a particle effect) — normalized into a single synthetic
//     "default" clip so the same player/dropdown code path covers it.
// The third oneOf shape (`atlas`: an external atlas JSON file) has no
// seed asset in this phase and is intentionally NOT wired up — an
// entry using it renders a LOUD "unsupported" note instead of crashing
// or silently showing nothing (§1 goal 4).

function clipsFromEntry(entry) {
  if (Array.isArray(entry.animations) && entry.animations.length > 0) {
    return entry.animations.map((a) => ({
      name: a.name,
      row: a.row || 0,
      count: a.count,
      fps: a.fps || 12,
      loop: a.loop !== false,
    }));
  }
  if (entry.frame && entry.frames) {
    return [
      {
        name: "default",
        row: 0,
        count: entry.frames,
        fps: entry.fps || 12,
        loop: true,
      },
    ];
  }
  return null; // unsupported shape (e.g. `atlas`) — caller shows a note
}

function buildSpritesheet(key, entry, render) {
  const src = resolveSceneSrc(entry.scene);

  const viewport = document.createElement("div");
  viewport.className = "viewport image-viewport"; // reuse checkerboard bg

  const clips = clipsFromEntry(entry);
  if (!clips || !entry.frame) {
    const msg = document.createElement("div");
    msg.className = "unknown-msg";
    msg.textContent =
      "spritesheet: unsupported shape (atlas JSON not wired up yet)";
    viewport.appendChild(msg);
    bumpHealth(render, { err: 1 });
    return viewport;
  }

  const frameW = entry.frame.w;
  const frameH = entry.frame.h;

  const canvas = document.createElement("canvas");
  canvas.width = frameW;
  canvas.height = frameH;
  // Seed frames are tiny (32px) — scale the CSS box up so the flipbook
  // is actually legible in a card-sized viewport; the backing canvas
  // stays at native frame resolution and image-rendering:pixelated
  // (set on the shared `.viewport canvas` rule) keeps it crisp.
  const displayScale = Math.max(1, Math.floor(160 / Math.max(frameW, frameH)));
  canvas.style.width = frameW * displayScale + "px";
  canvas.style.height = frameH * displayScale + "px";
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const loadState = document.createElement("div");
  loadState.className = "load-state";
  loadState.textContent = "loading…";

  // Clip dropdown — mirrors the model3d anim-dropdown UX exactly
  // (same .anim-picker chrome, same top-left placement).
  const clipPicker = document.createElement("div");
  clipPicker.className = "anim-picker";
  const clipSelect = document.createElement("select");
  for (const clip of clips) {
    const opt = document.createElement("option");
    opt.value = clip.name;
    opt.textContent = clip.name;
    clipSelect.appendChild(opt);
  }
  clipSelect.disabled = clips.length <= 1;
  clipPicker.appendChild(clipSelect);

  let img = null;
  let cols = 1; // sheet columns, set on load; lets a clip span rows
  let currentClip = clips[0];
  let frameIndex = 0;
  let elapsed = 0;
  let lastTs = null;

  function draw() {
    if (!img) return;
    // Absolute frame position: a clip starts at its `row` and its frames
    // walk left-to-right, wrapping onto the next row. For single-row
    // clips (count ≤ cols, e.g. the sprite:slime idle/walk/attack rows)
    // this is identical to `srcX = frameIndex*frameW, srcY = row*frameH`;
    // for a whole-grid effect (e.g. a 64-frame explosion across 8 rows)
    // it walks the full sheet as one continuous flipbook.
    const abs = currentClip.row * cols + frameIndex;
    ctx.clearRect(0, 0, frameW, frameH);
    ctx.drawImage(
      img,
      (abs % cols) * frameW,
      Math.floor(abs / cols) * frameH,
      frameW,
      frameH,
      0,
      0,
      frameW,
      frameH,
    );
  }

  // Time-accumulator flipbook. Reschedules unconditionally (top of the
  // fn), advances frameIndex by however many whole frame-durations have
  // elapsed (a while-loop, so a long rAF gap still lands on the right
  // frame), and repaints EVERY tick — so the canvas is provably being
  // driven even when the frame index happens not to change.
  function step(ts) {
    requestAnimationFrame(step);
    if (!img) return;
    if (lastTs === null) lastTs = ts;
    elapsed += ts - lastTs;
    lastTs = ts;
    const frameDuration = 1000 / Math.max(1, currentClip.fps);
    while (elapsed >= frameDuration) {
      elapsed -= frameDuration;
      const next = frameIndex + 1;
      frameIndex =
        next >= currentClip.count
          ? currentClip.loop
            ? 0
            : currentClip.count - 1
          : next;
    }
    draw();
  }

  clipSelect.addEventListener("change", () => {
    currentClip = clips.find((c) => c.name === clipSelect.value) || clips[0];
    frameIndex = 0;
    elapsed = 0;
    lastTs = null;
    draw();
  });

  img = new Image();
  img.onload = () => {
    cols = Math.max(1, Math.floor(img.naturalWidth / frameW));
    loadState.textContent = "loaded ✓";
    loadState.classList.add("ok");
    bumpHealth(render, { ok: 1 });
    draw();
    requestAnimationFrame(step);
  };
  img.onerror = (e) => {
    loadState.textContent = "load error";
    loadState.classList.add("err");
    bumpHealth(render, { err: 1 });
    console.error("[asset-storybook] spritesheet failed to load:", key, src, e);
  };
  img.src = src;

  viewport.appendChild(canvas);
  viewport.appendChild(clipPicker);
  viewport.appendChild(loadState);
  return viewport;
}

// ---------- nine-patch UI panel cards (Canvas2D 9-slice) ----------
//
// Draws the source PNG through the standard 9-slice algorithm (corners
// fixed, edges stretched along one axis, center stretched both axes)
// at a chosen demo size — a size <select> (same .anim-picker chrome as
// the clip/anim dropdowns) switches between native size and two
// stretched demo sizes so border-preserving behavior is actually
// visible, not just asserted (§8 Phase 2).

function drawNinePatch(ctx, img, margins, dw, dh) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const l = margins.l || 0;
  const t = margins.t || 0;
  const r = margins.r || 0;
  const b = margins.b || 0;
  const midSW = Math.max(0, iw - l - r);
  const midSH = Math.max(0, ih - t - b);
  const midDW = Math.max(0, dw - l - r);
  const midDH = Math.max(0, dh - t - b);

  ctx.clearRect(0, 0, dw, dh);
  ctx.imageSmoothingEnabled = false;

  // [sx, sy, sw, sh, dx, dy, dw, dh] for each of the 9 slices.
  const slices = [
    [0, 0, l, t, 0, 0, l, t], // top-left corner
    [l, 0, midSW, t, l, 0, midDW, t], // top edge
    [iw - r, 0, r, t, dw - r, 0, r, t], // top-right corner
    [0, t, l, midSH, 0, t, l, midDH], // left edge
    [l, t, midSW, midSH, l, t, midDW, midDH], // center
    [iw - r, t, r, midSH, dw - r, t, r, midDH], // right edge
    [0, ih - b, l, b, 0, dh - b, l, b], // bottom-left corner
    [l, ih - b, midSW, b, l, dh - b, midDW, b], // bottom edge
    [iw - r, ih - b, r, b, dw - r, dh - b, r, b], // bottom-right corner
  ];
  for (const [sx, sy, sw, sh, dx, dy, ddw, ddh] of slices) {
    if (sw <= 0 || sh <= 0 || ddw <= 0 || ddh <= 0) continue;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, ddw, ddh);
  }
}

const NINEPATCH_DEMO_SIZES = [
  { label: "native", w: null, h: null, scale: 1 },
  { label: "stretched 2×", w: null, h: null, scale: 2 },
  { label: "banner 220×72", w: 220, h: 72 },
];

function buildNinePatch(key, entry, render) {
  const src = resolveSceneSrc(entry.scene);
  const margins = entry.patchMargins || {};

  const viewport = document.createElement("div");
  viewport.className = "viewport image-viewport"; // reuse checkerboard bg

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  canvas.style.width = "64px";
  canvas.style.height = "64px";
  const ctx = canvas.getContext("2d");

  const loadState = document.createElement("div");
  loadState.className = "load-state";
  loadState.textContent = "loading…";

  const sizePicker = document.createElement("div");
  sizePicker.className = "anim-picker";
  const sizeSelect = document.createElement("select");
  for (const opt of NINEPATCH_DEMO_SIZES) {
    const o = document.createElement("option");
    o.value = opt.label;
    o.textContent = opt.label;
    sizeSelect.appendChild(o);
  }
  sizePicker.appendChild(sizeSelect);

  let img = null;

  function currentSize() {
    const chosen =
      NINEPATCH_DEMO_SIZES.find((o) => o.label === sizeSelect.value) ||
      NINEPATCH_DEMO_SIZES[0];
    if (!img) return { w: 64, h: 64 };
    if (chosen.w && chosen.h) return { w: chosen.w, h: chosen.h };
    return {
      w: img.naturalWidth * (chosen.scale || 1),
      h: img.naturalHeight * (chosen.scale || 1),
    };
  }

  function redraw() {
    if (!img) return;
    const { w, h } = currentSize();
    canvas.width = w;
    canvas.height = h;
    // Cap the on-screen box so a "banner" demo size doesn't blow out
    // the card's fixed aspect-ratio viewport; the canvas backing
    // store still holds the full stretched pixels.
    canvas.style.width = Math.min(w, 220) + "px";
    canvas.style.height = Math.min(h, 220) + "px";
    drawNinePatch(ctx, img, margins, w, h);
  }

  sizeSelect.addEventListener("change", redraw);

  img = new Image();
  img.onload = () => {
    loadState.textContent = "loaded ✓";
    loadState.classList.add("ok");
    bumpHealth(render, { ok: 1 });
    redraw();
  };
  img.onerror = (e) => {
    loadState.textContent = "load error";
    loadState.classList.add("err");
    bumpHealth(render, { err: 1 });
    console.error("[asset-storybook] ninepatch failed to load:", key, src, e);
  };
  img.src = src;

  viewport.appendChild(canvas);
  viewport.appendChild(sizePicker);
  viewport.appendChild(loadState);
  return viewport;
}

// ---------- Godot Theme cards (baked preview only) ----------
//
// `theme` never parses the .tres — Godot Theme resources have no
// browser-side reader, so the render is entirely the hand-baked
// `preview` PNG. Trustworthiness of that PNG is the drift-gate's job,
// not this page's: guard (F) fails the gate the moment the source
// .tres is newer than the baked preview (STALE), so by the time a
// card renders here the preview is gate-guaranteed fresh. Missing
// `preview` is itself a required-field gate failure (§4.2), so this
// branch is defense-in-depth, not the primary safety net.

function buildTheme(key, entry, render) {
  const viewport = document.createElement("div");
  viewport.className = "viewport image-viewport";

  if (!entry.preview) {
    const msg = document.createElement("div");
    msg.className = "unknown-msg";
    msg.textContent = "theme: no baked preview — cannot render";
    viewport.appendChild(msg);
    bumpHealth(render, { err: 1 });
    return viewport;
  }

  const src = resolveSceneSrc(entry.preview);
  const img = document.createElement("img");
  img.setAttribute("alt", key);
  img.setAttribute("src", src);

  const note = document.createElement("div");
  note.className = "static-preview-note";
  note.textContent = ".tres Theme — baked preview";

  const loadState = document.createElement("div");
  loadState.className = "load-state";
  loadState.textContent = "loading…";

  img.addEventListener("load", () => {
    loadState.textContent = "loaded ✓";
    loadState.classList.add("ok");
    bumpHealth(render, { ok: 1 });
  });
  img.addEventListener("error", (e) => {
    loadState.textContent = "load error";
    loadState.classList.add("err");
    bumpHealth(render, { err: 1 });
    console.error(
      "[asset-storybook] theme preview failed to load:",
      key,
      src,
      e,
    );
  });

  viewport.appendChild(img);
  viewport.appendChild(note);
  viewport.appendChild(loadState);
  return viewport;
}

// ---------- tileset cards (Canvas2D grid overlay) ----------
//
// Draws the raw tileset PNG 1:1 into a canvas and overlays a grid at the
// entry's tile size (render-spec.json requires `tileSize`; accepted as
// {w,h} or a single square number). Hovering a cell reports its
// (col,row) index + linear tile index via a small readout — col =
// floor(x/tileW), row = floor(y/tileH) — and clicking pins that readout
// so a specific tile index stays visible.

function tileDims(entry) {
  const ts = entry.tileSize;
  if (typeof ts === "number") return { w: ts, h: ts };
  if (ts && typeof ts === "object")
    return { w: ts.w || ts.width || 0, h: ts.h || ts.height || 0 };
  return { w: 0, h: 0 };
}

function buildTileset(key, entry, render) {
  const src = resolveSceneSrc(entry.scene);
  const { w: tileW, h: tileH } = tileDims(entry);

  const viewport = document.createElement("div");
  viewport.className = "viewport image-viewport";

  if (!tileW || !tileH) {
    const msg = document.createElement("div");
    msg.className = "unknown-msg";
    msg.textContent = "tileset: invalid tileSize";
    viewport.appendChild(msg);
    bumpHealth(render, { err: 1 });
    return viewport;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const loadState = document.createElement("div");
  loadState.className = "load-state";
  loadState.textContent = "loading…";

  // Cell-index readout — reuses the static-preview-note chrome (top-left
  // badge). Shows the tile under the cursor; a click pins it.
  const readout = document.createElement("div");
  readout.className = "static-preview-note";
  readout.textContent = "hover a tile";

  let img = null;
  let cols = 0;
  let rows = 0;
  let displayScale = 1;
  let pinned = false;

  function drawGrid() {
    if (!img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.strokeStyle = "rgba(124, 158, 255, 0.7)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) {
      const x = Math.min(c * tileW, img.naturalWidth) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, img.naturalHeight);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = Math.min(r * tileH, img.naturalHeight) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(img.naturalWidth, y);
      ctx.stroke();
    }
  }

  function reportAt(evt) {
    if (!img || pinned) return;
    const rect = canvas.getBoundingClientRect();
    const px = (evt.clientX - rect.left) / displayScale;
    const py = (evt.clientY - rect.top) / displayScale;
    const col = Math.floor(px / tileW);
    const row = Math.floor(py / tileH);
    if (col < 0 || row < 0 || col >= cols || row >= rows) {
      readout.textContent = "hover a tile";
      return;
    }
    readout.textContent =
      "tile [" + col + "," + row + "] · #" + (row * cols + col);
  }

  img = new Image();
  img.onload = () => {
    loadState.textContent = "loaded ✓";
    loadState.classList.add("ok");
    bumpHealth(render, { ok: 1 });
    cols = Math.max(1, Math.floor(img.naturalWidth / tileW));
    rows = Math.max(1, Math.floor(img.naturalHeight / tileH));
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    // scale the tiny source up so tiles are clickable in a card
    displayScale = Math.max(
      1,
      Math.floor(180 / Math.max(img.naturalWidth, img.naturalHeight)),
    );
    canvas.style.width = img.naturalWidth * displayScale + "px";
    canvas.style.height = img.naturalHeight * displayScale + "px";
    drawGrid();
  };
  img.onerror = (e) => {
    loadState.textContent = "load error";
    loadState.classList.add("err");
    bumpHealth(render, { err: 1 });
    console.error("[asset-storybook] tileset failed to load:", key, src, e);
  };
  img.src = src;

  canvas.addEventListener("mousemove", reportAt);
  canvas.addEventListener("click", (evt) => {
    pinned = !pinned;
    if (!pinned) reportAt(evt);
  });
  canvas.style.cursor = "crosshair";

  viewport.appendChild(canvas);
  viewport.appendChild(readout);
  viewport.appendChild(loadState);
  return viewport;
}

// ---------- __unknown renderer (LOUD failure card, never silent) ----------
//
// Fallback for any render-type with no registered builder — either
// resolveRender() fell all the way through to "unknown", or the entry
// named a render-type render-spec.json knows about but this page
// hasn't implemented a builder for yet (future phases). Either way,
// per §1 goal 4: never silently show nothing.

function buildUnknown(key, entry, render) {
  const viewport = document.createElement("div");
  viewport.className = "viewport unknown-viewport";

  const msg = document.createElement("div");
  msg.className = "unknown-msg";
  msg.textContent = 'no renderer for render="' + render + '"';
  viewport.appendChild(msg);

  // Synchronous, immediate failure — there's no async load to wait on.
  bumpHealth(render, { err: 1 });
  return viewport;
}
