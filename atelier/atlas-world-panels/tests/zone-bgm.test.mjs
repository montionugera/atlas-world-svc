import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveZoneKind,
  resolveTrackForZone,
  CrossfadeController,
  loadBgmConfig,
} from "../js/zone-bgm-model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SB = resolve(HERE, "..");
const REPO = resolve(SB, "../..");

function findFilesRecursive(dir, ext) {
  let results = [];
  if (!existsSync(dir)) return results;
  const list = readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFilesRecursive(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Injected fake clock
class FakeClock {
  constructor() {
    this.currentTime = 0;
    this.timers = [];
    this.nextId = 1;
  }
  now() {
    return this.currentTime;
  }
  setTimeout(fn, ms) {
    const id = this.nextId++;
    this.timers.push({ id, runAt: this.currentTime + ms, fn, interval: false });
    return id;
  }
  setInterval(fn, ms) {
    const id = this.nextId++;
    this.timers.push({ id, runAt: this.currentTime + ms, fn, interval: true, ms });
    return id;
  }
  clearTimeout(id) {
    this.timers = this.timers.filter((t) => t.id !== id);
  }
  clearInterval(id) {
    this.clearTimeout(id);
  }
  tick(ms) {
    const target = this.currentTime + ms;
    while (true) {
      const ready = this.timers
        .filter((t) => t.runAt <= target)
        .sort((a, b) => a.runAt - b.runAt)[0];
      if (!ready) break;
      this.currentTime = ready.runAt;
      if (ready.interval) {
        ready.runAt += ready.ms;
      } else {
        this.timers = this.timers.filter((t) => t.id !== ready.id);
      }
      ready.fn();
    }
    this.currentTime = target;
  }
}

// Injected fake audio player
class FakeAudio {
  constructor(src) {
    this.src = src;
    this.volume = 1;
    this.paused = true;
    this.loop = true;
    this.currentTime = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.events = {};
  }
  play() {
    this.paused = false;
    this.playCount++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.pauseCount++;
  }
  addEventListener(event, fn) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter((f) => f !== fn);
    }
  }
  trigger(event, data) {
    const list = this.events[event] || [];
    list.forEach((fn) => fn(data || { type: event, target: this }));
  }
}

describe("Zone BGM Configuration and Track Resolution", () => {
  const bgmJsonPath = join(REPO, "content/concept-art/bgm.json");

  it("content/concept-art/bgm.json exists and conforms to slice/web-contract.md", () => {
    assert.ok(existsSync(bgmJsonPath), "bgm.json must exist at content/concept-art/bgm.json");
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    assert.equal(config.version, 1);
    assert.ok(Array.isArray(config.tracks), "tracks must be an array");
    assert.ok(config.tracks.length >= 7, "must contain at least the 7 game client tracks");
    assert.ok(config.defaults, "defaults object must exist");
    assert.ok(config.defaults.town, "defaults.town must exist");
    assert.ok(config.defaults.field, "defaults.field must exist");
    assert.ok(config.defaults.dungeon, "defaults.dungeon must exist");
    assert.ok(config.defaults.boss, "defaults.boss must exist");
    assert.ok(config.defaults.world, "defaults.world must exist");
    assert.ok(config.zones, "zones map must exist");
  });

  it("every track file in bgm.json exists on disk", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    for (const track of config.tracks) {
      assert.ok(track.id, "track must have an id");
      assert.ok(track.file, `track ${track.id} must have a file`);
      assert.ok(track.title, `track ${track.id} must have a title`);
      const relPath = track.file.replace(/^\//, "");
      const absPath = join(REPO, relPath);
      assert.ok(
        existsSync(absPath),
        `track file for ${track.id} must exist at ${absPath}`,
      );
    }
  });

  it("gives town-lantern-hollow its own town track", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    const nodePath = join(
      REPO,
      "content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/town-lantern-hollow.json",
    );
    const node = JSON.parse(readFileSync(nodePath, "utf8"));
    const resolved = resolveTrackForZone(node, config);
    assert.ok(resolved, "must resolve to a track");
    assert.equal(resolved.track.id, "town-lantern-hollow");
    assert.equal(resolved.kind, "town");
  });

  it("gives hunting-area-clover-south-gate its own field track", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    const nodePath = join(
      REPO,
      "content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/hunting-area-clover-south-gate.json",
    );
    const node = JSON.parse(readFileSync(nodePath, "utf8"));
    const resolved = resolveTrackForZone(node, config);
    assert.ok(resolved, "must resolve to a track");
    assert.equal(resolved.track.id, "hunting-clover-south-gate");
    assert.equal(resolved.kind, "field");
  });

  it("gives dungeon-kiln-cellar its own dungeon track", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    const nodePath = join(
      REPO,
      "content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/dungeon-kiln-cellar.json",
    );
    const node = JSON.parse(readFileSync(nodePath, "utf8"));
    const resolved = resolveTrackForZone(node, config);
    assert.ok(resolved, "must resolve to a track");
    assert.equal(resolved.track.id, "dungeon-kiln-cellar");
    assert.equal(resolved.kind, "dungeon");
  });

  it("keeps the slice zone and room bindings the owner asked for", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    assert.deepEqual(config.zones, {
      "town-lantern-hollow": "town-lantern-hollow",
      "hunting-area-clover-south-gate": "hunting-clover-south-gate",
      "dungeon-kiln-cellar": "dungeon-kiln-cellar",
    });
    assert.deepEqual(config.rooms, { "kc-b3-r2": "boss-kiln" });
  });

  it("gives the Kiln Cellar boss room its own boss track", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    const bossRoom = {
      room_id: "kc-b3-r2",
      name: "Inner Seal Rotunda (Queen Ant & Apostle Volcanor Sanctum)",
      key_mobs: ["[Raid Boss] Discarded Kiln-Guardian", "[MVP] Queen Ant Volcanor-Brood Mother"],
    };
    const resolved = resolveTrackForZone(bossRoom, config);
    assert.ok(resolved, "must resolve to a track");
    assert.equal(resolved.track.id, "boss-kiln");
    assert.equal(resolved.kind, "boss");
  });

  it("respects exact zone override in bgm.json zones map", () => {
    const config = {
      version: 1,
      tracks: [
        { id: "custom-track", file: "/game-client/assets/music/town_hero_suite.ogg", title: "Custom" },
        { id: "def-town", file: "/game-client/assets/music/town_hero_suite.ogg", title: "Town" },
      ],
      defaults: { town: "def-town", field: "def-town", dungeon: "def-town", boss: "def-town", world: "def-town" },
      zones: { "town-lantern-hollow": "custom-track" },
    };
    const node = { id: "town-lantern-hollow", node_type: "town" };
    const resolved = resolveTrackForZone(node, config);
    assert.equal(resolved.track.id, "custom-track");
  });

  it("derives zone kind from real node data type field, never guesses from id string", () => {
    const config = {
      version: 1,
      tracks: [
        { id: "town-trk", file: "/game-client/assets/music/town_hero_suite.ogg", title: "Town" },
        { id: "dungeon-trk", file: "/game-client/assets/music/dungeon_subspace.mp3", title: "Dungeon" },
      ],
      defaults: { town: "town-trk", field: "town-trk", dungeon: "dungeon-trk", boss: "dungeon-trk", world: "town-trk" },
      zones: {},
    };
    // Node id looks like dungeon, but node_type says town:
    const trickyNode = { id: "dungeon-misleading-name", node_type: "town" };
    const resolved = resolveTrackForZone(trickyNode, config);
    assert.equal(resolved.kind, "town");
    assert.equal(resolved.track.id, "town-trk");
  });

  it("every studio node resolves to a valid track", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    const nodeFiles = findFilesRecursive(join(REPO, "content/studio/nodes"), ".json");
    assert.ok(nodeFiles.length > 50, "must test against all real studio nodes");

    const lookup = {};
    const nodes = [];
    for (const f of nodeFiles) {
      const doc = JSON.parse(readFileSync(f, "utf8"));
      lookup[doc.id] = doc;
      nodes.push(doc);
    }

    for (const node of nodes) {
      // 1. Resolve from node object
      const resFromObj = resolveTrackForZone(node, config, lookup);
      assert.ok(resFromObj && resFromObj.track, `Node ${node.id} must resolve from object`);
      assert.ok(resFromObj.track.id, `Node ${node.id} must have a track id`);
      assert.ok(resFromObj.track.file, `Node ${node.id} must have a track file`);

      // 2. Resolve from node id string
      const resFromId = resolveTrackForZone(node.id, config, lookup);
      assert.ok(resFromId && resFromId.track, `Node ${node.id} must resolve from id`);
      assert.equal(resFromId.track.id, resFromObj.track.id, `Node ${node.id} resolution must match`);
    }
  });

  it("validates bgm.json track sources, .ogg contract paths, zones studio node keys, and no unused tracks", () => {
    const config = JSON.parse(readFileSync(bgmJsonPath, "utf8"));
    const nodeFiles = findFilesRecursive(join(REPO, "content/studio/nodes"), ".json");
    const studioNodeIds = new Set(
      nodeFiles.map((f) => JSON.parse(readFileSync(f, "utf8")).id).filter(Boolean),
    );
    const trackIds = new Set();

    for (const track of config.tracks) {
      assert.ok(
        ["existing-game-track", "google-ai"].includes(track.source),
        `Track ${track.id} has invalid source "${track.source}"`,
      );
      assert.ok(typeof track.mood === "string" && track.mood.trim().length > 0, `Track ${track.id} must have mood`);
      if (track.source === "google-ai" || track.file.startsWith("/content/concept-art/bgm/")) {
        assert.match(
          track.file,
          /^\/content\/concept-art\/bgm\/[a-z0-9-]+\.ogg$/,
          `Generated BGM track ${track.id} must be /content/concept-art/bgm/<id>.ogg, got ${track.file}`,
        );
      } else {
        assert.match(
          track.file,
          /^\/game-client\/assets\/music\/[a-z0-9_.-]+\.(mp3|ogg)$/,
          `Game track ${track.id} must be under /game-client/assets/music/, got ${track.file}`,
        );
      }
      trackIds.add(track.id);
    }

    const referencedTracks = new Set();
    for (const [kind, tid] of Object.entries(config.defaults || {})) {
      assert.ok(trackIds.has(tid), `defaults.${kind} references unknown track "${tid}"`);
      referencedTracks.add(tid);
    }
    for (const [zoneKey, tid] of Object.entries(config.zones || {})) {
      assert.ok(
        studioNodeIds.has(zoneKey),
        `zones key "${zoneKey}" must be a real studio node id in content/studio/nodes/`,
      );
      assert.ok(trackIds.has(tid), `zones["${zoneKey}"] references unknown track "${tid}"`);
      referencedTracks.add(tid);
    }
    const atlasText = readFileSync(join(REPO, "content/studio/t_shaped_world_atlas.json"), "utf8");
    for (const [roomId, tid] of Object.entries(config.rooms || {})) {
      assert.ok(atlasText.includes(`"${roomId}"`), `rooms key "${roomId}" must be a real atlas room id`);
      assert.ok(trackIds.has(tid), `rooms["${roomId}"] references unknown track "${tid}"`);
      referencedTracks.add(tid);
    }

    for (const track of config.tracks) {
      if (track.source === "google-ai") {
        assert.ok(
          referencedTracks.has(track.id),
          `google-ai track "${track.id}" must be referenced in defaults, zones or rooms (not dead/unused)`,
        );
      }
    }
  });
});

describe("CrossfadeController State Machine", () => {
  function createController(config, options = {}) {
    const clock = new FakeClock();
    const createdAudio = [];
    const audioFactory = (src) => {
      const a = new FakeAudio(src);
      createdAudio.push(a);
      return a;
    };
    const ctrl = new CrossfadeController({
      config,
      clock,
      audioFactory,
      fadeDurationMs: 1500,
      initialVolume: 0.8,
      ...options,
    });
    return { ctrl, clock, createdAudio };
  }

  const sampleConfig = {
    version: 1,
    tracks: [
      { id: "track-a", file: "/music/a.ogg", title: "Track A" },
      { id: "track-b", file: "/music/b.ogg", title: "Track B" },
      { id: "track-c", file: "/music/c.ogg", title: "Track C" },
    ],
    defaults: {
      town: "track-a",
      field: "track-b",
      dungeon: "track-c",
      boss: "track-c",
      world: "track-a",
    },
    zones: {},
  };

  it("is off by default until enabled/played", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    assert.equal(ctrl.isEnabled(), false, "should be disabled initially");
    ctrl.requestZone({ id: "town-1", node_type: "town" });
    clock.tick(2000);
    assert.equal(createdAudio.length, 0, "no audio should play when disabled");
    assert.equal(ctrl.getPlaybackState(), "off");
  });

  it("crossfades smoothly to target volume over ~1.5s when enabled", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });

    assert.equal(createdAudio.length, 1);
    const audioA = createdAudio[0];
    assert.equal(audioA.src, "/music/a.ogg");
    assert.equal(audioA.paused, false);

    // Initial fade in start
    assert.ok(audioA.volume <= 0.1, "starts at or near 0 volume");

    // Halfway through 1500ms fade (750ms)
    clock.tick(750);
    assert.ok(audioA.volume > 0.3 && audioA.volume < 0.6, `volume should be mid-fade, got ${audioA.volume}`);

    // End of 1500ms fade
    clock.tick(750);
    assert.ok(Math.abs(audioA.volume - 0.8) < 0.05, `volume should reach target 0.8, got ${audioA.volume}`);
    assert.equal(ctrl.getPlaybackState(), "playing");
  });

  it("crossfades from one track to another over 1.5s", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });
    clock.tick(1500); // Track A is now fully playing at 0.8

    const audioA = createdAudio[0];
    assert.equal(audioA.src, "/music/a.ogg");

    // Transition to field
    ctrl.requestZone({ id: "field-1", node_type: "hunting_area" });
    assert.equal(createdAudio.length, 2);
    const audioB = createdAudio[1];
    assert.equal(audioB.src, "/music/b.ogg");
    assert.equal(audioB.paused, false);

    // Midpoint: 750ms
    clock.tick(750);
    assert.ok(audioA.volume < 0.5, `audioA fading out, got ${audioA.volume}`);
    assert.ok(audioB.volume > 0.3, `audioB fading in, got ${audioB.volume}`);
    assert.equal(audioA.paused, false);

    // Fade complete: 1500ms
    clock.tick(750);
    assert.ok(Math.abs(audioB.volume - 0.8) < 0.05, `audioB reached target 0.8, got ${audioB.volume}`);
    assert.equal(audioA.paused, true, "outgoing audioA must be paused/stopped");
    assert.equal(audioA.volume, 0, "outgoing audioA volume must be 0");
  });

  it("does NOT restart playback when entering another zone with the same track", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });
    clock.tick(1500);

    const audioA = createdAudio[0];
    audioA.currentTime = 42.5;
    const playCountBefore = audioA.playCount;

    // Moving to another town that maps to the same Track A
    ctrl.requestZone({ id: "town-2", node_type: "town" });
    clock.tick(1500);

    assert.equal(createdAudio.length, 1, "no second audio instance created");
    assert.equal(audioA.currentTime, 42.5, "currentTime must not be reset");
    assert.equal(audioA.playCount, playCountBefore, "play() must not be called again");
  });

  it("rapid zone clicks settle on the last one without audio collision or leak", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);

    // Start with Town
    ctrl.requestZone({ id: "town-1", node_type: "town" }); // Track A
    clock.tick(200);

    // Rapid click: Field (Track B)
    ctrl.requestZone({ id: "field-1", node_type: "hunting_area" }); // Track B
    clock.tick(200);

    // Rapid click: Dungeon (Track C)
    ctrl.requestZone({ id: "dungeon-1", node_type: "dungeon" }); // Track C
    clock.tick(200);

    // Rapid click: Back to Field (Track B)
    ctrl.requestZone({ id: "field-2", node_type: "hunting_area" }); // Track B
    
    // Let crossfade settle
    clock.tick(2000);

    // Current active track must be Track B
    assert.equal(ctrl.getCurrentTrack().id, "track-b");
    const activeAudios = createdAudio.filter((a) => !a.paused && a.volume > 0);
    assert.equal(activeAudios.length, 1, "exactly one audio must be active");
    assert.equal(activeAudios[0].src, "/music/b.ogg");
    assert.ok(Math.abs(activeAudios[0].volume - 0.8) < 0.05);

    // All superseded audios must be paused and volume 0
    const stoppedAudios = createdAudio.filter((a) => a !== activeAudios[0]);
    for (const a of stoppedAudios) {
      assert.equal(a.paused, true, `superseded audio ${a.src} must be paused`);
      assert.equal(a.volume, 0, `superseded audio ${a.src} volume must be 0`);
    }
  });

  it("mute and volume adjustments work as expected", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });
    clock.tick(1500);

    const audio = createdAudio[0];
    assert.ok(Math.abs(audio.volume - 0.8) < 0.05);

    // Change volume
    ctrl.setVolume(0.5);
    clock.tick(100);
    assert.ok(Math.abs(audio.volume - 0.5) < 0.05);

    // Mute
    ctrl.setMuted(true);
    clock.tick(100);
    assert.equal(audio.volume, 0, "muted audio volume must be 0");
    assert.equal(ctrl.isMuted(), true);

    // Unmute restores volume
    ctrl.setMuted(false);
    clock.tick(100);
    assert.ok(Math.abs(audio.volume - 0.5) < 0.05, "unmute must restore volume");
  });

  it("pauses when audio tab is active and resumes when inactive", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });
    clock.tick(1500);

    const audio = createdAudio[0];
    assert.equal(audio.paused, false);

    // Audio tab plays
    ctrl.setExternalAudioPlaying(true);
    clock.tick(100);
    assert.equal(audio.paused, true, "BGM must pause when external audio tab plays");

    // Audio tab stops
    ctrl.setExternalAudioPlaying(false);
    clock.tick(100);
    assert.equal(audio.paused, false, "BGM must resume when external audio tab stops");
  });

  it("handles missing or failing audio file without throwing", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });

    const audio = createdAudio[0];
    // Simulate error event from missing file
    audio.trigger("error", { message: "404 Not Found" });
    clock.tick(100);

    assert.equal(ctrl.hasError(), true, "controller must register error state");
    assert.ok(ctrl.getErrorMessage(), "controller must provide error message");
  });

  it("muting or changing volume during a 1.5s fade is never overwritten by stale targetVol", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });

    const audio = createdAudio[0];
    clock.tick(200);
    assert.ok(audio.volume > 0, "audio has started fading in");

    // User mutes 200ms into the 1500ms fade
    ctrl.setMuted(true);
    assert.equal(audio.volume, 0, "muting mid-fade must immediately silence activeAudio");

    // Advance past the remainder of the 1500ms fade
    clock.tick(1500);
    assert.equal(ctrl.isMuted(), true);
    assert.equal(audio.volume, 0, "tickFade must not overwrite muted audio with stale targetVol");

    // Unmute and start a crossfade to Track B, then adjust volume mid-crossfade
    ctrl.setMuted(false);
    assert.ok(Math.abs(audio.volume - 0.8) < 0.05);
    ctrl.requestZone({ id: "field-1", node_type: "hunting_area" });
    const audioB = createdAudio[1];
    clock.tick(300);
    ctrl.setVolume(0.35);
    clock.tick(1500);
    assert.ok(Math.abs(audioB.volume - 0.35) < 0.02, `expected 0.35 after fade, got ${audioB.volume}`);
  });

  it("resumes outgoing Track A at its currentTime when switching A -> B -> A mid-crossfade", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" }); // Track A
    clock.tick(1500);

    const audioA = createdAudio[0];
    audioA.currentTime = 42.5;

    // Switch to Track B briefly (100ms into 1500ms crossfade)
    ctrl.requestZone({ id: "field-1", node_type: "hunting_area" }); // Track B
    clock.tick(100);
    assert.equal(createdAudio.length, 2);

    // Switch back to Track A before Track A finished fading out
    ctrl.requestZone({ id: "town-1", node_type: "town" }); // Track A
    clock.tick(1500);

    assert.equal(createdAudio.length, 2, "must reuse outgoing Track A audio instance instead of recreating");
    assert.equal(audioA.currentTime, 42.5, "Track A must resume from 42.5s rather than resetting to 0");
    assert.equal(audioA.paused, false);
    assert.ok(Math.abs(audioA.volume - 0.8) < 0.05);
    assert.equal(createdAudio[1].paused, true, "Track B must be paused after fading out");
  });

  it("pausing for external audio during a crossfade stops the fade timer cleanly", () => {
    const { ctrl, clock, createdAudio } = createController(sampleConfig);
    ctrl.setEnabled(true);
    ctrl.requestZone({ id: "town-1", node_type: "town" });
    clock.tick(1500);

    ctrl.requestZone({ id: "field-1", node_type: "hunting_area" });
    clock.tick(200);
    ctrl.setExternalAudioPlaying(true);

    const audioA = createdAudio[0];
    const audioB = createdAudio[1];
    assert.equal(audioA.paused, true);
    assert.equal(audioB.paused, true);

    clock.tick(2000);
    assert.equal(ctrl.getPlaybackState(), "paused");

    ctrl.setExternalAudioPlaying(false);
    assert.equal(audioB.paused, false);
    assert.ok(Math.abs(audioB.volume - 0.8) < 0.05);
  });
});

describe("zone-bgm.mjs Browser Integration & Global Bindings", () => {
  it("starts disabled by default (no autoplay) and resolves studio/world zones via window globals", async () => {
    const config = JSON.parse(readFileSync(join(REPO, "content/concept-art/bgm.json"), "utf8"));
    const flywheelPath = join(
      REPO,
      "content/studio/nodes/continent-02-clockwork-steppe/district-flywheel-dynamo-canyon/town-flywheel-governor-hub.json",
    );
    const flywheelNode = JSON.parse(readFileSync(flywheelPath, "utf8"));
    const cloverPath = join(
      REPO,
      "content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/hunting-area-clover-south-gate.json",
    );
    const cloverNode = JSON.parse(readFileSync(cloverPath, "utf8"));

    class FakeEl {
      constructor(tag) {
        this.tagName = String(tag).toUpperCase();
        this.id = "";
        this.className = "";
        this.textContent = "";
        this.title = "";
        this.type = "";
        this.value = "";
        this.children = [];
        this.listeners = {};
        this.classList = { add: () => {}, remove: () => {} };
      }
      appendChild(c) {
        this.children.push(c);
        return c;
      }
      setAttribute() {}
      addEventListener(ev, fn) {
        (this.listeners[ev] ||= []).push(fn);
      }
    }

    const elementsById = new Map();
    const body = new FakeEl("body");
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
    };
    globalThis.MutationObserver = class {
      observe() {}
    };
    globalThis.Audio = FakeAudio;
    globalThis.document = {
      readyState: "complete",
      body,
      createElement: (tag) => new FakeEl(tag),
      getElementById: (id) => elementsById.get(id) || null,
      querySelector: () => null,
    };
    body.appendChild = (el) => {
      if (el.id) elementsById.set(el.id, el);
      return el;
    };

    const tatlas = JSON.parse(
      readFileSync(join(REPO, "content/studio/t_shaped_world_atlas.json"), "utf8"),
    );
    const kilnPath = join(
      REPO,
      "content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/dungeon-kiln-cellar.json",
    );
    const kilnNode = JSON.parse(readFileSync(kilnPath, "utf8"));
    const lanternPath = join(
      REPO,
      "content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/town-lantern-hollow.json",
    );
    const lanternNode = JSON.parse(readFileSync(lanternPath, "utf8"));

    globalThis.window = {
      location: { hash: "#tab=studio&node=town-flywheel-governor-hub", search: "?tab=studio" },
      DATA: {
        studioPerspectives: {
          nodes: [flywheelNode, cloverNode, kilnNode, lanternNode],
          tShapedWorldAtlas: tatlas,
        },
      },
      CURRENT_TAB: "studio",
      STUDIO_SELECTED_NODE_ID: "town-flywheel-governor-hub",
      STUDIO_MAP_SELECTED_POI: null,
      MAXION_SELECTED_TILE_ID: "freja-south-gate",
      ATLAS_PARAMS: {},
      ATLAS_STATE_STORE: {
        activeTownId: "town-lantern-hollow",
        activeFieldOrFortId: "zone-field-clover-south-gate",
        activeDungeonId: "",
        activeFloorId: "",
      },
      addEventListener: () => {},
    };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => config,
    });

    await import("../js/zone-bgm.mjs");
    await new Promise((r) => setTimeout(r, 20));

    assert.ok(globalThis.window.ATLAS_ZONE_BGM, "window.ATLAS_ZONE_BGM must be registered");
    const { controller, syncZone } = globalThis.window.ATLAS_ZONE_BGM;

    // Must mount #zoneBgmContainer with .zone-bgm-player into document.body (kills Mutation M6)
    const mountedContainer = globalThis.document.getElementById("zoneBgmContainer");
    assert.ok(mountedContainer, "#zoneBgmContainer must be mounted into document.body");
    assert.ok(
      mountedContainer.className.includes("zone-bgm-container"),
      "#zoneBgmContainer must have zone-bgm-container class",
    );
    assert.equal(mountedContainer.children.length, 1, "#zoneBgmContainer must contain .zone-bgm-player");
    assert.equal(mountedContainer.children[0].className, "zone-bgm-player");

    // Must be disabled by default (kills Mutation B3a)
    assert.equal(controller.isEnabled(), false, "BGM controller must be disabled by default on initial load");

    // Must resolve town-flywheel-governor-hub using window.DATA.studioPerspectives.nodes to defaults.town
    assert.equal(
      controller.getCurrentTrack()?.id,
      config.defaults.town,
      "town-flywheel-governor-hub must resolve to defaults.town ('town-hero-suite'), not 'world'",
    );

    // Switch to world tab where ATLAS_STATE_STORE.activeFieldOrFortId is real browser ID 'zone-field-clover-south-gate'
    globalThis.window.location.hash = "#tab=world";
    globalThis.window.location.search = "?tab=world";
    globalThis.window.CURRENT_TAB = "world";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "hunting-clover-south-gate",
      "world tab with real activeFieldOrFortId ('zone-field-clover-south-gate') must switch BGM to hunting-clover-south-gate",
    );

    // Shortened town zone_id (e.g. zone-town-porcelain-loom), fortress/harbor (zone-fortress-shanty-kiln), and catacomb (zone-catacomb-heretic-kiln)
    globalThis.window.ATLAS_STATE_STORE.activeFieldOrFortId = "";
    globalThis.window.ATLAS_STATE_STORE.activeTownId = "zone-town-porcelain-loom";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      config.defaults.town,
      "shortened town zone_id 'zone-town-porcelain-loom' must resolve to town track, not world",
    );

    globalThis.window.ATLAS_STATE_STORE.activeFieldOrFortId = "zone-fortress-shanty-kiln";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      config.defaults.field,
      "fortress zone_id 'zone-fortress-shanty-kiln' must resolve to field track, not world",
    );

    globalThis.window.ATLAS_STATE_STORE.activeFieldOrFortId = "";
    globalThis.window.ATLAS_STATE_STORE.activeDungeonId = "zone-catacomb-heretic-kiln";
    globalThis.window.ATLAS_STATE_STORE.activeFloorId = "B1";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      config.defaults.dungeon,
      "catacomb zone_id 'zone-catacomb-heretic-kiln' must resolve to dungeon track, not world",
    );

    // Kiln Cellar B1 -> dungeon-kiln-cellar, then B3 / kc-b3-r2 -> boss-kiln
    globalThis.window.ATLAS_STATE_STORE.activeDungeonId = "zone-dungeon-kiln-cellar";
    globalThis.window.ATLAS_STATE_STORE.activeFloorId = "B1";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "dungeon-kiln-cellar",
      "Kiln Cellar on floor B1 must resolve to dungeon-kiln-cellar",
    );

    globalThis.window.ATLAS_STATE_STORE.activeFloorId = "B3";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "boss-kiln",
      "Kiln Cellar on boss floor B3 (kc-b3-r2) must resolve to boss-kiln",
    );

    // Explicit ?zone=kc-b3-r2 must also resolve to boss-kiln
    globalThis.window.location.hash = "#zone=kc-b3-r2";
    globalThis.window.location.search = "?zone=kc-b3-r2";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "boss-kiln",
      "?zone=kc-b3-r2 must resolve to boss-kiln",
    );

    // ?tab=maps with tile= must resolve tile kind
    globalThis.window.location.hash = "#tab=maps&tile=town-lantern-hollow";
    globalThis.window.location.search = "?tab=maps&tile=town-lantern-hollow";
    globalThis.window.CURRENT_TAB = "maps";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "town-lantern-hollow",
      "?tab=maps&tile=town-lantern-hollow must resolve tile track",
    );

    // A selection that is not a map zone (e.g. a shop POI) must not hijack the music.
    const storeForSelection = globalThis.window.ATLAS_STATE_STORE;
    globalThis.window.location.hash = "#tab=world";
    globalThis.window.location.search = "?tab=world";
    globalThis.window.CURRENT_TAB = "world";
    Object.assign(storeForSelection, {
      activeDungeonId: "",
      activeFloorId: "",
      activeFieldOrFortId: "",
      activeTownId: "town-lantern-hollow",
    });
    globalThis.window.LAST_WORLD_TILE_ID = "shop-not-a-zone";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "town-lantern-hollow",
      "an unknown selection id must fall through to the active town",
    );

    // A dot picked on the map outranks the town behind it.
    globalThis.window.LAST_WORLD_TILE_ID = "hunting-area-clover-south-gate";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "hunting-clover-south-gate",
      "the map-dot selection must switch music to Clover",
    );
    globalThis.window.LAST_WORLD_TILE_ID = "";

    // A room selected in one dungeon must not carry into another dungeon.
    const otherDungeon = tatlas.multi_floor_dungeons.find(
      (d) => d.dungeon_id !== "zone-dungeon-kiln-cellar",
    );
    Object.assign(storeForSelection, {
      activeDungeonId: otherDungeon.dungeon_id,
      activeFloorId: otherDungeon.floors[0].floor_id,
    });
    globalThis.window.STUDIO_MAP_SELECTED_POI = { room_id: "kc-b3-r2" };
    syncZone();
    assert.notEqual(
      controller.getCurrentTrack()?.id,
      "boss-kiln",
      "kc-b3-r2 selected earlier must not play boss music in another dungeon",
    );
    globalThis.window.STUDIO_MAP_SELECTED_POI = null;

    // Floor-level boss music comes from bgm.json rooms, not from "last room of the floor".
    const savedRooms = controller.config.rooms;
    controller.config.rooms = {};
    Object.assign(storeForSelection, {
      activeDungeonId: "zone-dungeon-kiln-cellar",
      activeFloorId: "B3",
    });
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      "dungeon-kiln-cellar",
      "with no room mapped in bgm.json, B3 must play the dungeon track",
    );
    controller.config.rooms = savedRooms;
    Object.assign(storeForSelection, { activeDungeonId: "", activeFloorId: "" });

    // Without tShapedWorldAtlas, prefix stripping (replace(/^zone-/, "")) must still resolve zone-town-flywheel-governor-hub (kills Mutation M5)
    globalThis.window.DATA.studioPerspectives.tShapedWorldAtlas = null;
    globalThis.window.location.hash = "#tab=world";
    globalThis.window.location.search = "?tab=world";
    globalThis.window.CURRENT_TAB = "world";
    globalThis.window.ATLAS_STATE_STORE.activeDungeonId = "";
    globalThis.window.ATLAS_STATE_STORE.activeFieldOrFortId = "";
    globalThis.window.ATLAS_STATE_STORE.activeTownId = "zone-town-flywheel-governor-hub";
    syncZone();
    assert.equal(
      controller.getCurrentTrack()?.id,
      config.defaults.town,
      "zone-town-flywheel-governor-hub without tShapedWorldAtlas must resolve via ^zone- prefix stripping",
    );
  });

  it("02_state_and_composable_layers.js exposes ATLAS_PARAM_KEYS for lore/concept-arts and window getters for zone-bgm", () => {
    const src = readFileSync(
      join(REPO, "scripts/atlas_world_web/frontend/02_state_and_composable_layers.js"),
      "utf8",
    );
    for (const key of ["chapter", "ref", "category", "id", "search", "zone"]) {
      assert.match(
        src,
        new RegExp(`ATLAS_PARAM_KEYS\\s*=\\s*\\[[^\\]]*'${key}'`),
        `ATLAS_PARAM_KEYS must include '${key}'`,
      );
    }
    for (const globalProp of ["DATA", "CURRENT_TAB", "STUDIO_SELECTED_NODE_ID", "ATLAS_PARAMS", "ATLAS_STATE_STORE"]) {
      assert.match(
        src,
        new RegExp(`\\b${globalProp}\\s*:\\s*\\{\\s*get\\s*:`),
        `02_state_and_composable_layers.js must expose live window.${globalProp} getter`,
      );
    }
    const engines = readFileSync(
      join(REPO, "scripts/atlas_world_web/frontend/03_engines_ol_and_3d.js"),
      "utf8",
    );
    const body = (name) => engines.slice(engines.indexOf(`function ${name}(`)).split(/\n}\n/)[0];
    assert.match(body("selectAtlasZoneMark"), /window\.LAST_WORLD_TILE_ID\s*=\s*[^']/);
    assert.match(body("selectStudioMapPoi"), /window\.LAST_WORLD_TILE_ID\s*=\s*[^']/);
    assert.match(body("closeStudioMapPoi"), /window\.LAST_WORLD_TILE_ID\s*=\s*''/);
    assert.match(src, /addEventListener\('popstate',[^\n]*LAST_WORLD_TILE_ID\s*=\s*''/);
    const searchReMatch = src.match(/ATLAS_SEARCH_PARAM_RE\s*=\s*\/((?:\\.|[^/])+)\//);
    assert.ok(searchReMatch, "02_state_and_composable_layers.js must define ATLAS_SEARCH_PARAM_RE for multi-word search");
    const searchRe = new RegExp(searchReMatch[1]);
    assert.equal(searchRe.test("kiln cellar"), true, "ATLAS_SEARCH_PARAM_RE must allow multi-word search queries with spaces");
  });
});
