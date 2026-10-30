// Zone BGM Web Mini-Player
// Provides persistent BGM playback with crossfades when navigating zones.

import {
  CrossfadeController,
  resolveTrackForZone,
  resolveZoneKind,
} from "./zone-bgm-model.mjs";

const BGM_CONFIG_URL = "/content/concept-art/bgm.json";
const STORAGE_KEY_ENABLED = "atlas-bgm-enabled";
const STORAGE_KEY_VOLUME = "atlas-bgm-volume";

let controller = null;
let containerEl = null;
let playBtn = null;
let muteBtn = null;
let titleEl = null;
let subEl = null;
let volumeEl = null;
let currentZoneName = "";
let cachedStudioNodes = {};

function readLocalStorage(key, defaultVal) {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return JSON.parse(val);
  } catch (e) {
    /* ignore security or private mode errors */
  }
  return defaultVal;
}

function writeLocalStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    /* ignore storage full or quota errors */
  }
}

function formatZoneName(rawId) {
  if (!rawId) return "World";
  const cleaned = String(rawId).replace(/^(zone-|town-|hunting-area-|dungeon-)/, "");
  return cleaned
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getNodesLookup() {
  const lookup = { ...cachedStudioNodes };
  try {
    const sp = window.DATA && window.DATA.studioPerspectives;
    if (sp && Array.isArray(sp.nodes)) {
      for (const n of sp.nodes) {
        if (n && n.id) lookup[n.id] = n;
      }
    }
  } catch (e) {
    /* ignore */
  }
  return lookup;
}

function getActiveZoneInfo() {
  const hash = (window.location && window.location.hash) ? window.location.hash.slice(1) : "";
  const search = (window.location && window.location.search) ? window.location.search.slice(1) : "";
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);

  // 1. Explicit ?zone= or #zone=
  const zoneParam =
    hashParams.get("zone") ||
    searchParams.get("zone") ||
    (window.ATLAS_PARAMS && window.ATLAS_PARAMS.zone);
  if (zoneParam) {
    return { id: zoneParam, name: formatZoneName(zoneParam) };
  }

  // 2. Tab-specific zone resolutions
  const tab =
    hashParams.get("tab") ||
    searchParams.get("tab") ||
    window.CURRENT_TAB ||
    "";

  if (tab === "studio") {
    const node =
      hashParams.get("node") ||
      hashParams.get("map") ||
      searchParams.get("node") ||
      searchParams.get("map") ||
      window.STUDIO_SELECTED_NODE_ID;
    if (node) return { id: node, name: formatZoneName(node) };
  }

  if (tab === "world" || tab === "maps") {
    const store = window.ATLAS_STATE_STORE;
    const dungeonId =
      (store && store.activeDungeonId) ||
      hashParams.get("dungeon") ||
      searchParams.get("dungeon");
    if (dungeonId) {
      return { id: dungeonId, name: formatZoneName(dungeonId) };
    }
    const fieldId =
      (store && store.activeFieldOrFortId) ||
      hashParams.get("field") ||
      searchParams.get("field");
    if (fieldId) {
      return { id: fieldId, name: formatZoneName(fieldId) };
    }
    const townId =
      (store && store.activeTownId) ||
      hashParams.get("town") ||
      searchParams.get("town");
    if (townId) {
      return { id: townId, name: formatZoneName(townId) };
    }
  }

  // 3. Fallbacks to current globals or defaults
  if (window.STUDIO_SELECTED_NODE_ID) {
    return {
      id: window.STUDIO_SELECTED_NODE_ID,
      name: formatZoneName(window.STUDIO_SELECTED_NODE_ID),
    };
  }

  return { id: "town-lantern-hollow", name: "Lantern Hollow" };
}

function checkAudioTabConflict() {
  if (!controller) return;
  const isAudioPlaying = Boolean(
    document.querySelector(".sound-tile.playing"),
  );
  controller.setExternalAudioPlaying(isAudioPlaying);
}

function updateUi(ctrl) {
  if (!containerEl || !ctrl) return;

  const isEnabled = ctrl.isEnabled();
  const track = ctrl.getCurrentTrack();
  const playbackState = ctrl.getPlaybackState();
  const hasError = ctrl.hasError();

  if (playBtn) {
    playBtn.textContent = isEnabled && playbackState !== "paused" ? "⏸" : "▶";
    playBtn.title = isEnabled ? "Pause BGM" : "Play BGM";
    playBtn.setAttribute("aria-label", isEnabled ? "Pause BGM" : "Play BGM");
  }

  if (muteBtn) {
    muteBtn.textContent = ctrl.isMuted() ? "🔇" : "🔊";
    muteBtn.title = ctrl.isMuted() ? "Unmute" : "Mute";
  }

  if (volumeEl) {
    volumeEl.value = ctrl.getVolume();
  }

  if (titleEl) {
    titleEl.textContent = track ? track.title : "No Track";
  }

  if (subEl) {
    if (hasError) {
      subEl.textContent = ctrl.getErrorMessage() || "Audio error";
      subEl.classList.add("err");
    } else if (!isEnabled) {
      subEl.textContent = "Zone music is off · press ▶";
      subEl.classList.remove("err");
    } else if (playbackState === "paused") {
      subEl.textContent = "Paused (Audio tab active)";
      subEl.classList.remove("err");
    } else {
      const zName = currentZoneName || "World Zone";
      const mood = (track && track.mood) ? ` · ${track.mood}` : "";
      subEl.textContent = `${zName}${mood}`;
      subEl.classList.remove("err");
    }
  }
}

function syncZone() {
  if (!controller) return;
  const info = getActiveZoneInfo();
  currentZoneName = info.name;

  const lookup = getNodesLookup();
  controller.nodesLookup = lookup;

  const targetNode = lookup[info.id] || lookup[info.id.replace(/^zone-/, "")] || info;
  controller.requestZone(targetNode);
  updateUi(controller);
}

function createMiniPlayerDom() {
  if (document.getElementById("zoneBgmContainer")) return;

  containerEl = document.createElement("div");
  containerEl.id = "zoneBgmContainer";
  containerEl.className = "atlas-panel zone-bgm-container";

  const player = document.createElement("div");
  player.className = "zone-bgm-player";

  playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "zone-bgm-btn";
  playBtn.textContent = "▶";
  playBtn.title = "Play BGM";
  playBtn.addEventListener("click", () => {
    if (!controller) return;
    const next = !controller.isEnabled();
    controller.setEnabled(next);
    writeLocalStorage(STORAGE_KEY_ENABLED, next);
    updateUi(controller);
  });

  const info = document.createElement("div");
  info.className = "zone-bgm-info";

  titleEl = document.createElement("div");
  titleEl.className = "zone-bgm-title";
  titleEl.textContent = "Atlas BGM";

  subEl = document.createElement("div");
  subEl.className = "zone-bgm-sub";
  subEl.textContent = "Zone music is off · press ▶";

  info.appendChild(titleEl);
  info.appendChild(subEl);

  muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "zone-bgm-btn";
  muteBtn.textContent = "🔊";
  muteBtn.title = "Mute";
  muteBtn.addEventListener("click", () => {
    if (!controller) return;
    controller.setMuted(!controller.isMuted());
    updateUi(controller);
  });

  volumeEl = document.createElement("input");
  volumeEl.type = "range";
  volumeEl.className = "zone-bgm-volume";
  volumeEl.min = "0";
  volumeEl.max = "1";
  volumeEl.step = "0.05";
  volumeEl.value = "0.8";
  volumeEl.title = "Volume";
  volumeEl.addEventListener("input", (e) => {
    if (!controller) return;
    const v = parseFloat(e.target.value);
    controller.setVolume(v);
    writeLocalStorage(STORAGE_KEY_VOLUME, v);
    updateUi(controller);
  });

  player.appendChild(playBtn);
  player.appendChild(info);
  player.appendChild(muteBtn);
  player.appendChild(volumeEl);
  containerEl.appendChild(player);

  document.body.appendChild(containerEl);
}

async function init() {
  if (typeof document === "undefined") return;

  createMiniPlayerDom();

  const savedEnabled = readLocalStorage(STORAGE_KEY_ENABLED, false);
  const savedVolume = readLocalStorage(STORAGE_KEY_VOLUME, 0.8);

  try {
    const res = await fetch(BGM_CONFIG_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const config = await res.json();

    if (Object.keys(getNodesLookup()).length === 0) {
      try {
        const spRes = await fetch("/api/studio/perspectives");
        if (spRes && spRes.ok) {
          const spData = await spRes.json();
          if (spData && Array.isArray(spData.nodes)) {
            for (const n of spData.nodes) {
              if (n && n.id) cachedStudioNodes[n.id] = n;
            }
          }
        }
      } catch {
        /* ignore fallback perspectives fetch error */
      }
    }

    controller = new CrossfadeController({
      config,
      initialEnabled: savedEnabled,
      initialVolume: savedVolume,
      fadeDurationMs: 1500,
      nodesLookup: getNodesLookup(),
      onStateChange: (ctrl) => updateUi(ctrl),
    });

    window.ATLAS_ZONE_BGM = {
      controller,
      syncZone,
      setEnabled: (v) => controller.setEnabled(v),
    };

    syncZone();
    updateUi(controller);

    // Watch for external audio playback on the audio tab
    const audioConflictObserver = new MutationObserver(() => {
      checkAudioTabConflict();
    });
    audioConflictObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    // Listen to zone and state changes
    window.addEventListener("atlas-zone-change", syncZone);
    window.addEventListener("hashchange", syncZone);
    window.addEventListener("popstate", syncZone);
    window.addEventListener("atlas-panels-ready", syncZone);
    window.addEventListener("atlas-panels-updated", syncZone);
  } catch (err) {
    if (subEl) {
      subEl.textContent = "Failed to load BGM config";
      subEl.classList.add("err");
    }
    console.error("[zone-bgm] failed to initialize:", err);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
