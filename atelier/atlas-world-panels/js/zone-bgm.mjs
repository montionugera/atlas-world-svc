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
        if (n && n.id) {
          lookup[n.id] = n;
          if (n.map_id && !lookup[n.map_id]) {
            lookup[n.map_id] = n;
          }
        }
      }
    }
    const tatlas = sp && sp.tShapedWorldAtlas;
    if (tatlas && typeof tatlas === "object") {
      const registerBlueprintList = (list, fallbackType) => {
        if (!Array.isArray(list)) return;
        for (const entry of list) {
          if (!entry || typeof entry !== "object") continue;
          const zid = entry.zone_id || entry.dungeon_id || entry.id;
          const snid = entry.studio_node_id;
          const studioNode = (snid && lookup[snid]) || (zid && lookup[zid]) || null;
          const resolved = studioNode
            ? { ...studioNode, node_type: studioNode.node_type || fallbackType }
            : {
                id: snid || zid,
                zone_id: zid,
                studio_node_id: snid,
                name: entry.name || entry.town_name || formatZoneName(zid || snid),
                node_type: fallbackType,
              };
          if (zid) lookup[zid] = resolved;
          if (snid && !lookup[snid]) lookup[snid] = resolved;
        }
      };

      const zdir = tatlas.t_breadth_zone_directory || {};
      registerBlueprintList(zdir.starting_towns, "town");
      registerBlueprintList(zdir.other_castle_and_hub_towns, "town");
      registerBlueprintList(tatlas.town_blueprints, "town");
      registerBlueprintList(zdir.fields_and_hunting_areas, "hunting_area");
      registerBlueprintList(tatlas.field_tactical_blueprints, "hunting_area");
      registerBlueprintList(zdir.harbors_clanhalls_and_forts, "fortress");
      registerBlueprintList(tatlas.fortress_blueprints, "fortress");
      registerBlueprintList(zdir.regular_dungeons, "dungeon");
      registerBlueprintList(zdir.seven_signs_seal_catacombs, "dungeon");
      registerBlueprintList(tatlas.multi_floor_dungeons, "dungeon");

      if (Array.isArray(tatlas.multi_floor_dungeons)) {
        for (const dng of tatlas.multi_floor_dungeons) {
          if (!dng || !Array.isArray(dng.floors)) continue;
          for (const fl of dng.floors) {
            if (!fl || !Array.isArray(fl.rooms)) continue;
            for (const rm of fl.rooms) {
              if (rm && rm.room_id) {
                lookup[rm.room_id] = {
                  ...rm,
                  id: rm.room_id,
                  room_id: rm.room_id,
                };
              }
            }
          }
        }
      }
    }
    if (typeof window.getAllWorldTiles === "function") {
      for (const tile of window.getAllWorldTiles() || []) {
        if (tile && tile.id && !lookup[tile.id]) {
          lookup[tile.id] = {
            id: tile.id,
            name: tile.name,
            kind: tile.kind,
            node_type: tile.kind,
          };
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return lookup;
}

function findNode(lookup, id) {
  return (
    lookup[id] ||
    lookup[id.replace(/^zone-field-/, "hunting-area-")] ||
    lookup[id.replace(/^zone-/, "")]
  );
}

function resolveActiveDungeonRoom(dungeonId, floorId) {
  if (!dungeonId) return "";
  const tatlas = window.DATA?.studioPerspectives?.tShapedWorldAtlas;
  const dng = (tatlas?.multi_floor_dungeons || []).find(
    (d) =>
      d &&
      (d.dungeon_id === dungeonId ||
        d.studio_node_id === dungeonId ||
        d.dungeon_id === "zone-" + dungeonId),
  );
  const floors = Array.isArray(dng?.floors) ? dng.floors : [];

  // A selected room only counts inside the dungeon that owns it.
  const poi = window.STUDIO_MAP_SELECTED_POI;
  const poiRoom =
    poi?.room_id ||
    (typeof poi?.address === "string" && poi.address.match(/\(([a-z0-9-]+-r\d+)\)/i)?.[1]);
  if (poiRoom && floors.some((f) => f?.rooms?.some((r) => r?.room_id === poiRoom))) {
    return String(poiRoom);
  }

  // Otherwise a floor plays a room's track only if bgm.json maps a room on that floor.
  const floor = floors.find(
    (f) => f && floorId && String(f.floor_id).toUpperCase() === String(floorId).toUpperCase(),
  );
  const musicRooms = controller?.config?.rooms || {};
  const mapped = (floor?.rooms || []).find((r) => r?.room_id && musicRooms[r.room_id]);
  return mapped ? String(mapped.room_id) : "";
}

function getActiveZoneInfo() {
  const hash = (window.location && window.location.hash) ? window.location.hash.slice(1) : "";
  const search = (window.location && window.location.search) ? window.location.search.slice(1) : "";
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);

  const explicitRoom =
    hashParams.get("room") ||
    searchParams.get("room") ||
    (window.ATLAS_PARAMS && window.ATLAS_PARAMS.room) ||
    "";

  // 1. Explicit ?zone= or #zone=
  const zoneParam =
    hashParams.get("zone") ||
    searchParams.get("zone") ||
    (window.ATLAS_PARAMS && window.ATLAS_PARAMS.zone);
  if (zoneParam) {
    return {
      id: zoneParam,
      room_id: explicitRoom || undefined,
      name: formatZoneName(zoneParam),
    };
  }

  // 2. Tab-specific zone resolutions
  const tab =
    hashParams.get("tab") ||
    searchParams.get("tab") ||
    window.CURRENT_TAB ||
    "";

  const store = window.ATLAS_STATE_STORE;
  const activeFloorId =
    (store && store.activeFloorId) ||
    hashParams.get("floor") ||
    searchParams.get("floor") ||
    "";

  if (tab === "maps") {
    const tileId =
      hashParams.get("tile") ||
      searchParams.get("tile") ||
      window.MAXION_SELECTED_TILE_ID;
    if (tileId) {
      return { id: tileId, name: formatZoneName(tileId) };
    }
  }

  if (tab === "studio") {
    const dngParam = hashParams.get("dungeon") || searchParams.get("dungeon");
    if (dngParam) {
      const roomId = explicitRoom || resolveActiveDungeonRoom(dngParam, activeFloorId);
      return {
        id: dngParam,
        room_id: roomId || undefined,
        name: formatZoneName(dngParam),
      };
    }
    const node =
      hashParams.get("node") ||
      hashParams.get("map") ||
      searchParams.get("node") ||
      searchParams.get("map") ||
      window.STUDIO_SELECTED_NODE_ID;
    if (node) {
      const roomId =
        explicitRoom ||
        (store && store.activeDungeonId
          ? resolveActiveDungeonRoom(store.activeDungeonId, activeFloorId)
          : "");
      return {
        id: node,
        room_id: roomId || undefined,
        name: formatZoneName(node),
      };
    }
  }

  if (tab === "world" || tab === "maps") {
    const pickedId = window.LAST_WORLD_TILE_ID;
    if (pickedId && findNode(getNodesLookup(), pickedId)) {
      return { id: pickedId, name: formatZoneName(pickedId) };
    }
    const dungeonId =
      (store && store.activeDungeonId) ||
      hashParams.get("dungeon") ||
      searchParams.get("dungeon");
    if (dungeonId) {
      const roomId = explicitRoom || resolveActiveDungeonRoom(dungeonId, activeFloorId);
      return {
        id: dungeonId,
        room_id: roomId || undefined,
        name: formatZoneName(dungeonId),
      };
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
    const tileId =
      hashParams.get("tile") ||
      searchParams.get("tile") ||
      window.MAXION_SELECTED_TILE_ID;
    if (tileId) {
      return { id: tileId, name: formatZoneName(tileId) };
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

  const baseNode = (info.room_id && lookup[info.room_id]) || findNode(lookup, info.id) || info;
  const targetNode =
    info.room_id && baseNode && typeof baseNode === "object" && !baseNode.room_id
      ? { ...baseNode, room_id: info.room_id }
      : baseNode;
  if (targetNode && targetNode.name) {
    currentZoneName = targetNode.name;
  }
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
