// Zone BGM Model & Crossfade State Machine
// Owns zone-to-track resolution, volume management, and crossfade transitions.

export function resolveZoneKind(nodeOrZone) {
  if (!nodeOrZone) return "world";

  // If passed an object, inspect its properties
  if (typeof nodeOrZone === "object") {
    // 1. Boss room / encounter detection
    if (
      nodeOrZone.node_type === "boss" ||
      nodeOrZone.kind === "boss" ||
      nodeOrZone.type === "boss" ||
      nodeOrZone.room_type === "boss" ||
      nodeOrZone.is_boss_room === true ||
      nodeOrZone.is_boss_arena === true
    ) {
      return "boss";
    }

    if (Array.isArray(nodeOrZone.key_mobs)) {
      const hasBossMob = nodeOrZone.key_mobs.some((m) =>
        /\[(Raid Boss|MVP|Mini-Boss)\]|Sovereign|Apostle|Warden/i.test(String(m)),
      );
      if (hasBossMob) return "boss";
    }

    if (
      nodeOrZone.name &&
      /(Boss Rotunda|Sanctum Throne|Apex Sovereign|God-Seal Sanctum)/i.test(
        nodeOrZone.name,
      )
    ) {
      return "boss";
    }

    // 2. Real node data type field (never guessed from id strings when type exists)
    const typeField =
      nodeOrZone.node_type ||
      nodeOrZone.actionType ||
      nodeOrZone.kind ||
      nodeOrZone.type;

    if (typeField) {
      if (typeField === "town") return "town";
      if (
        typeField === "hunting_area" ||
        typeField === "field" ||
        typeField === "fortress"
      ) {
        return "field";
      }
      if (typeField === "dungeon" || typeField === "catacomb") return "dungeon";
      if (typeField === "boss") return "boss";
      if (typeField === "world") return "world";
    }
  }

  return "world";
}

export function resolveTrackForZone(nodeOrZone, bgmConfig, nodesLookup = {}) {
  if (!bgmConfig || !Array.isArray(bgmConfig.tracks)) {
    return null;
  }

  const tracksById = new Map();
  for (const t of bgmConfig.tracks) {
    if (t && t.id) tracksById.set(t.id, t);
  }

  let zoneId = "";
  let targetObj = null;

  if (typeof nodeOrZone === "string") {
    zoneId = nodeOrZone;
    targetObj =
      nodesLookup[zoneId] ||
      nodesLookup[zoneId.replace(/^zone-/, "")] ||
      null;
  } else if (nodeOrZone && typeof nodeOrZone === "object") {
    zoneId =
      nodeOrZone.id ||
      nodeOrZone.room_id ||
      nodeOrZone.zone_id ||
      nodeOrZone.nodeId ||
      "";
    targetObj = nodeOrZone;
  }

  // 1. Determine zone kind from node data
  const effectiveObj = targetObj || (typeof nodeOrZone === "object" ? nodeOrZone : null);
  const kind = resolveZoneKind(effectiveObj);

  // 2. Exact zone override in bgmConfig.zones
  if (bgmConfig.zones && zoneId) {
    const overrideId =
      bgmConfig.zones[zoneId] ||
      bgmConfig.zones[zoneId.replace(/^zone-/, "")] ||
      bgmConfig.zones["zone-" + zoneId];
    if (overrideId && tracksById.has(overrideId)) {
      return {
        track: tracksById.get(overrideId),
        kind: kind !== "world" ? kind : "override",
        reason: "zone_override",
        zoneId,
      };
    }
  }

  // 2b. Dungeon rooms are not studio nodes, so they have their own map
  const roomTrackId = bgmConfig.rooms?.[nodeOrZone?.room_id];
  if (roomTrackId && tracksById.has(roomTrackId)) {
    return {
      track: tracksById.get(roomTrackId),
      kind,
      reason: "room_override",
      zoneId,
    };
  }

  // 3. Defaults for that zone kind
  const defaults = bgmConfig.defaults || {};
  let targetTrackId = defaults[kind];

  if (!targetTrackId || !tracksById.has(targetTrackId)) {
    targetTrackId = defaults.world || bgmConfig.tracks[0]?.id;
  }

  const track = tracksById.get(targetTrackId) || bgmConfig.tracks[0] || null;
  return {
    track,
    kind,
    reason: "default_kind",
    zoneId,
  };
}

export function loadBgmConfig(raw) {
  if (typeof raw === "string") {
    return JSON.parse(raw);
  }
  return raw;
}

export class CrossfadeController {
  constructor(options = {}) {
    this.config = options.config || { tracks: [], defaults: {}, zones: {} };
    this.clock = options.clock || {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id),
    };
    this.audioFactory =
      options.audioFactory ||
      ((src) => {
        const a = new Audio(src);
        a.loop = true;
        return a;
      });
    this.fadeDurationMs = options.fadeDurationMs || 1500;
    this.targetVolume =
      typeof options.initialVolume === "number" ? options.initialVolume : 0.8;
    this.muted = !!options.initialMuted;
    this.enabled = !!options.initialEnabled;
    this.nodesLookup = options.nodesLookup || {};
    this.onStateChange = options.onStateChange || null;

    this.currentZone = null;
    this.currentTrack = null;
    this.activeAudio = null;
    this.outgoingAudio = null;
    this.outgoingTrack = null;
    this.fadeTimer = null;
    this.fadeProgress = 1;
    this.externalAudioPlaying = false;
    this.error = null;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(val) {
    const next = !!val;
    if (this.enabled === next) return;
    this.enabled = next;
    if (!this.enabled) {
      this._stopAllAudio();
    } else {
      if (this.currentZone) {
        this.requestZone(this.currentZone, { force: true });
      }
    }
    this._notify();
  }

  isMuted() {
    return this.muted;
  }

  setMuted(val) {
    this.muted = !!val;
    this._applyVolume();
    this._notify();
  }

  getVolume() {
    return this.targetVolume;
  }

  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, Number(vol) || 0));
    this.targetVolume = clamped;
    this._applyVolume();
    this._notify();
  }

  setExternalAudioPlaying(val) {
    const next = !!val;
    if (this.externalAudioPlaying === next) return;
    this.externalAudioPlaying = next;
    if (this.externalAudioPlaying) {
      if (this.fadeTimer) {
        this.clock.clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
      }
      this.fadeProgress = 1;
      if (this.activeAudio && !this.activeAudio.paused) {
        this.activeAudio.pause();
      }
      if (this.outgoingAudio) {
        if (!this.outgoingAudio.paused) {
          this.outgoingAudio.pause();
        }
        this.outgoingAudio.volume = 0;
        this.outgoingAudio = null;
        this.outgoingTrack = null;
      }
    } else {
      if (this.enabled && this.activeAudio && this.activeAudio.paused) {
        this._applyVolume();
        this.activeAudio.play().catch((err) => {
          this.error = err.message || String(err);
          this._notify();
        });
      }
    }
    this._notify();
  }

  hasError() {
    return !!this.error;
  }

  getErrorMessage() {
    return this.error;
  }

  clearError() {
    this.error = null;
    this._notify();
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  getCurrentZone() {
    return this.currentZone;
  }

  getPlaybackState() {
    if (!this.enabled) return "off";
    if (this.externalAudioPlaying) return "paused";
    if (this.outgoingAudio) return "fading";
    if (this.activeAudio && !this.activeAudio.paused) return "playing";
    return "idle";
  }

  requestZone(nodeOrZone, { force = false } = {}) {
    if (!nodeOrZone) return;
    this.currentZone = nodeOrZone;

    const res = resolveTrackForZone(nodeOrZone, this.config, this.nodesLookup);
    if (!res || !res.track) return;

    const nextTrack = res.track;

    // Same track: no restart!
    if (!force && this.currentTrack && this.currentTrack.id === nextTrack.id) {
      if (this.activeAudio && this.enabled && !this.externalAudioPlaying) {
        this._applyVolume();
      }
      return;
    }

    const previousTrack = this.currentTrack;
    this.currentTrack = nextTrack;
    if (!this.enabled) {
      this._notify();
      return;
    }

    this._startCrossfade(nextTrack, previousTrack);
    this._notify();
  }

  _getEffectiveVolume() {
    return this.muted ? 0 : this.targetVolume;
  }

  _applyVolume() {
    const vol = this._getEffectiveVolume();
    if (this.activeAudio) {
      if (this.muted || !this.fadeTimer) {
        this.activeAudio.volume = vol;
      } else {
        this.activeAudio.volume = vol * this.fadeProgress;
      }
    }
    if (this.outgoingAudio && this.muted) {
      this.outgoingAudio.volume = 0;
    }
  }

  _stopAllAudio() {
    if (this.fadeTimer) {
      this.clock.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.fadeProgress = 1;
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.volume = 0;
      this.activeAudio = null;
    }
    if (this.outgoingAudio) {
      this.outgoingAudio.pause();
      this.outgoingAudio.volume = 0;
      this.outgoingAudio = null;
      this.outgoingTrack = null;
    }
  }

  _startCrossfade(nextTrack, previousTrack = null) {
    if (this.fadeTimer) {
      this.clock.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }

    const previousAudio = this.activeAudio;
    let newAudio = null;

    // If nextTrack matches the currently fading-out outgoingAudio, reuse it so currentTime resumes
    if (
      this.outgoingAudio &&
      this.outgoingTrack &&
      this.outgoingTrack.id === nextTrack.id
    ) {
      newAudio = this.outgoingAudio;
      this.outgoingAudio = null;
      this.outgoingTrack = null;
      if (newAudio.paused && !this.externalAudioPlaying) {
        const p = newAudio.play();
        if (p && typeof p.catch === "function") {
          p.catch((err) => {
            this.error = err.message || String(err);
            this._notify();
          });
        }
      }
    } else {
      // Rapid click handling: settle immediately on newest track.
      // If an earlier outgoing audio was still fading, stop it immediately.
      if (this.outgoingAudio) {
        this.outgoingAudio.pause();
        this.outgoingAudio.volume = 0;
        this.outgoingAudio = null;
        this.outgoingTrack = null;
      }

      try {
        newAudio = this.audioFactory(nextTrack.file);
        newAudio.volume = 0;
        newAudio.loop = true;

        // Handle loading/playback errors gracefully without throwing
        const onError = () => {
          this.error = `Track error: ${nextTrack.title || nextTrack.id}`;
          this._notify();
        };
        if (typeof newAudio.addEventListener === "function") {
          newAudio.addEventListener("error", onError);
        }

        if (!this.externalAudioPlaying) {
          const p = newAudio.play();
          if (p && typeof p.catch === "function") {
            p.catch((err) => {
              this.error = err.message || String(err);
              this._notify();
            });
          }
        }
      } catch (err) {
        this.error = err.message || String(err);
        this._notify();
        return;
      }
    }

    this.activeAudio = newAudio;
    this.outgoingAudio = previousAudio;
    this.outgoingTrack = previousAudio ? previousTrack : null;

    const startTime = this.clock.now();
    const duration = this.fadeDurationMs;
    const startInVol = newAudio ? newAudio.volume : 0;
    const startOutVol = previousAudio ? previousAudio.volume : 0;
    const stepInterval = 50;
    this.fadeProgress = 0;

    const tickFade = () => {
      const elapsed = this.clock.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      this.fadeProgress = progress;
      const targetVol = this._getEffectiveVolume();

      // Incoming audio ramps startInVol -> targetVol (0 immediately if muted)
      if (this.activeAudio) {
        this.activeAudio.volume = this.muted
          ? 0
          : startInVol + (targetVol - startInVol) * progress;
      }

      // Outgoing audio ramps startOutVol -> 0 (0 immediately if muted)
      if (this.outgoingAudio) {
        this.outgoingAudio.volume = this.muted
          ? 0
          : Math.max(0, startOutVol * (1 - progress));
      }

      if (progress < 1) {
        this.fadeTimer = this.clock.setTimeout(tickFade, stepInterval);
      } else {
        // Crossfade complete
        if (this.outgoingAudio) {
          this.outgoingAudio.pause();
          this.outgoingAudio.volume = 0;
          this.outgoingAudio = null;
          this.outgoingTrack = null;
        }
        if (this.activeAudio) {
          this.activeAudio.volume = this._getEffectiveVolume();
        }
        this.fadeTimer = null;
        this.fadeProgress = 1;
        this._notify();
      }
    };

    tickFade();
  }

  _notify() {
    if (typeof this.onStateChange === "function") {
      this.onStateChange(this);
    }
  }
}
