// atelier/asset-storybook/js/panzoom.mjs — F-052 Task 16.
//
// The wheel-zoom + drag-pan viewer, extracted from maps.mjs's module-level
// singleton (F-044) into a factory so map-builder.mjs's Review screen can run
// two independent, LINKED instances side by side (draft pane + current
// pane) — the singleton in maps.mjs only ever needed one.
//
// The maths below (MIN_SCALE/MAX_SCALE, applyTransform, the wheel zoom-
// toward-cursor solve, the pointer drag translate) is moved VERBATIM from
// maps.mjs, not rewritten — see task-16-brief.md Step 3/7: a line-by-line
// regression check against the pre-move version is part of the phase gate,
// and rewriting it in the same pass would confound that check. The only
// additions are the factory closure itself and the on("change") wiring
// `linkPanZoom` needs, which maps.mjs's singleton never had.

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

/**
 * One pan/zoom instance bound to a `stage` (the pointer/wheel target — needs
 * `position: relative` or similar and `overflow: hidden`) and an `img`
 * inside it (`position: absolute`, `transform-origin: 0 0`). Independent of
 * any other instance unless linked with `linkPanZoom`.
 */
export function createPanZoom({ stage, img }) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginTx = 0;
  let dragOriginTy = 0;
  const changeListeners = [];

  function applyTransform() {
    img.style.transform =
      "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
  }

  function getTransform() {
    return { scale, tx, ty };
  }

  function emitChange() {
    const t = getTransform();
    for (const fn of changeListeners) fn(t);
  }

  function setTransform(t) {
    scale = t.scale;
    tx = t.tx;
    ty = t.ty;
    applyTransform();
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
    emitChange();
  }

  function setSrc(url) {
    img.src = url;
  }

  function onWheel(ev) {
    ev.preventDefault();
    const rect = stage.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const prevScale = scale;
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    // Zoom toward the cursor: keep the point under the cursor stationary by
    // solving for the translate that leaves (cx,cy) mapped to the same image
    // point before and after the scale change.
    tx = cx - ((cx - tx) / prevScale) * scale;
    ty = cy - ((cy - ty) / prevScale) * scale;
    applyTransform();
    emitChange();
  }

  function onPointerDown(ev) {
    dragging = true;
    dragStartX = ev.clientX;
    dragStartY = ev.clientY;
    dragOriginTx = tx;
    dragOriginTy = ty;
    stage.setPointerCapture(ev.pointerId);
    stage.style.cursor = "grabbing";
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    tx = dragOriginTx + (ev.clientX - dragStartX);
    ty = dragOriginTy + (ev.clientY - dragStartY);
    applyTransform();
    emitChange();
  }

  function onPointerUp(ev) {
    dragging = false;
    try {
      stage.releasePointerCapture(ev.pointerId);
    } catch (e) {
      /* already released — ignore */
    }
    stage.style.cursor = "grab";
  }

  function on(type, fn) {
    if (type !== "change") throw new Error(`panzoom: unknown event ${type}`);
    changeListeners.push(fn);
  }

  stage.style.cursor = "grab";
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);

  // No destroy(): both consumers (Map Sheets overlay, Review screen) keep
  // their instances for the page's lifetime, so a teardown had no caller.
  return { setSrc, reset, getTransform, setTransform, on };
}

/**
 * Mirrors `change` events between two pan-zoom instances both ways, guarded
 * against re-entrant echo (`setTransform` doesn't itself emit — only the
 * user-driven wheel/drag handlers do — but the guard is cheap insurance
 * against a future caller assuming otherwise). Used by the Review screen's
 * side-by-side viewer so panning/zooming one pane moves the other in lockstep.
 */
export function linkPanZoom(a, b) {
  let syncing = false;
  a.on("change", (t) => {
    if (syncing) return;
    syncing = true;
    b.setTransform(t);
    syncing = false;
  });
  b.on("change", (t) => {
    if (syncing) return;
    syncing = true;
    a.setTransform(t);
    syncing = false;
  });
}
