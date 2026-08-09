// Verdict controls, export bar and compare tray (F-038 Phase 4).
//
// The DOM half of the review layer; all the rules live in ./store.mjs, which is
// pure and tested. This module owns localStorage, the export download, and the
// per-card chrome.

import { createStore } from "./store.mjs";

const LS_KEY = "atlas-storybook-review-buffer-v1";

let store = null;
const pinned = new Map(); // key -> { key, thumbUrl }

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch (e) {
    console.warn("[asset-storybook] unreadable review buffer, starting empty");
    return {};
  }
}

export function initReview(committed) {
  store = createStore({
    committed,
    local: readLocal(),
    persist: (buffer) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(buffer));
      } catch (e) {
        console.error("[asset-storybook] could not persist review buffer:", e);
      }
    },
  });
  ensureBar();
  return store;
}

export function getStore() {
  return store;
}

// ---------- per-card verdict chrome ----------

function paintCard(card, key) {
  const rec = store.get(key);
  card.classList.toggle("verdict-reject", rec?.verdict === "reject");
  card.classList.toggle("verdict-rebuild", rec?.verdict === "rebuild");
  const badge = card.querySelector(".verdict-badge");
  if (badge) {
    badge.textContent = rec ? rec.verdict : "";
    badge.title = rec ? rec.note : "";
    badge.hidden = !rec;
  }
}

// A verdict without a note is refused by the store, which THROWS. The UI must
// surface that rather than swallow it — a silently dropped verdict is worse
// than no verdict, because the reviewer believes the asset is filed.
//
// Deliberately NOT window.prompt/alert: a modal dialog blocks the page (and
// any automation driving it), and it cannot show the note you already wrote.
// An inline editor keeps the card visible while you type the reason.
function openNoteEditor(card, key, verdict) {
  card.querySelector(".verdict-editor")?.remove();

  const existing = store.get(key);
  const box = document.createElement("div");
  box.className = "verdict-editor";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "verdict-note";
  input.placeholder = `why ${verdict}? (required)`;
  input.value = existing?.note || "";

  const err = document.createElement("p");
  err.className = "verdict-error";
  err.hidden = true;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "verdict-btn verdict-btn-save";
  save.textContent = "save";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "verdict-btn";
  cancel.textContent = "cancel";

  function commit() {
    try {
      store.set(key, verdict, input.value);
    } catch (e) {
      err.textContent = String(e.message || e);
      err.hidden = false;
      input.focus();
      return;
    }
    box.remove();
    paintCard(card, key);
    refreshBar();
    document.dispatchEvent(new CustomEvent("storybook:verdict-change"));
  }

  save.addEventListener("click", (e) => {
    e.stopPropagation();
    commit();
  });
  cancel.addEventListener("click", (e) => {
    e.stopPropagation();
    box.remove();
  });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    if (e.key === "Escape") box.remove();
  });
  box.addEventListener("click", (e) => e.stopPropagation());

  const row = document.createElement("div");
  row.className = "verdict-editor-row";
  row.appendChild(save);
  row.appendChild(cancel);

  box.appendChild(input);
  box.appendChild(err);
  box.appendChild(row);
  card.appendChild(box);
  input.focus();
}

export function attachVerdictControls(card, key) {
  if (!store) return;

  const bar = document.createElement("div");
  bar.className = "verdict-bar";

  for (const verdict of ["reject", "rebuild"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "verdict-btn verdict-btn-" + verdict;
    btn.textContent = verdict;
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // never open the detail overlay from these
      openNoteEditor(card, key, verdict);
    });
    bar.appendChild(btn);
  }

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "verdict-btn verdict-btn-clear";
  clear.textContent = "clear";
  clear.title = "Remove this verdict";
  clear.addEventListener("click", (e) => {
    e.stopPropagation();
    store.clear(key);
    paintCard(card, key);
    refreshBar();
    document.dispatchEvent(new CustomEvent("storybook:verdict-change"));
  });
  bar.appendChild(clear);

  const badge = document.createElement("span");
  badge.className = "verdict-badge";
  badge.hidden = true;
  card.appendChild(badge);

  card.appendChild(bar);
  paintCard(card, key);

  // Shift-click pins into the compare tray instead of opening the overlay.
  card.addEventListener(
    "click",
    (e) => {
      if (!e.shiftKey) return;
      e.stopPropagation();
      e.preventDefault();
      togglePin(card, key);
    },
    true,
  );
}

// ---------- compare tray (ephemeral, session-only) ----------

const MAX_PINS = 6;

function togglePin(card, key) {
  if (pinned.has(key)) pinned.delete(key);
  else {
    if (pinned.size >= MAX_PINS) return;
    const img = card.querySelector(".thumb-viewport img");
    pinned.set(key, { key, thumbUrl: img ? img.src : null });
  }
  refreshTray();
}

function refreshTray() {
  const tray = document.getElementById("compare-tray");
  if (!tray) return;
  tray.hidden = pinned.size === 0;
  const strip = tray.querySelector(".tray-strip");
  strip.innerHTML = "";
  for (const { key, thumbUrl } of pinned.values()) {
    const cell = document.createElement("div");
    cell.className = "tray-cell";
    if (thumbUrl) {
      const img = document.createElement("img");
      img.src = thumbUrl;
      img.alt = key;
      cell.appendChild(img);
    }
    const label = document.createElement("span");
    label.textContent = key;
    cell.appendChild(label);
    cell.title = "Click to unpin";
    cell.addEventListener("click", () => {
      pinned.delete(key);
      refreshTray();
      document.dispatchEvent(new CustomEvent("storybook:verdict-change"));
    });
    strip.appendChild(cell);
  }
  tray.querySelector(".tray-count").textContent =
    pinned.size + " pinned · shift-click a card to pin · click a tile to unpin";
}

// ---------- export bar ----------

function ensureBar() {
  if (document.getElementById("review-bar")) return;

  const bar = document.createElement("div");
  bar.id = "review-bar";
  bar.className = "review-bar";
  bar.hidden = true;
  bar.innerHTML = `
    <span class="review-count"></span>
    <button type="button" class="review-btn" data-act="export">Export review-queue.json</button>
    <button type="button" class="review-btn" data-act="copy">Copy JSON</button>`;
  document.body.appendChild(bar);

  bar.addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act === "export") downloadQueue();
    if (act === "copy") copyQueue();
  });

  const tray = document.createElement("div");
  tray.id = "compare-tray";
  tray.className = "compare-tray";
  tray.hidden = true;
  tray.innerHTML = `<div class="tray-count"></div><div class="tray-strip"></div>`;
  document.body.appendChild(tray);

  refreshBar();
}

export function refreshBar() {
  const bar = document.getElementById("review-bar");
  if (!bar || !store) return;
  const n = store.unsavedCount();
  bar.hidden = n === 0;
  bar.querySelector(".review-count").textContent =
    n + (n === 1 ? " unsaved mark" : " unsaved marks");
}

function downloadQueue() {
  const blob = new Blob([store.exportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "review-queue.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function copyQueue() {
  try {
    await navigator.clipboard.writeText(store.exportJson());
  } catch (e) {
    console.error("[asset-storybook] clipboard write failed:", e);
  }
}
