using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.Audio
{
    /// <summary>
    /// Autoload that turns a combat SFX event key (<c>sfx:attack</c>, <c>sfx:hit</c>,
    /// <c>sfx:death</c>) into a played sound. Loads a SEPARATE manifest from the render
    /// asset pipeline (<see cref="AudioManifest"/>, <c>assets/audio-manifest.json</c>) —
    /// same "never empty, never throw" resolution philosophy as
    /// <c>Content.AssetRegistry</c>, but for one-shot SFX instead of scenes.
    ///
    /// <para>An unknown event key or an unloadable stream is NOT an error: it logs one
    /// <see cref="GD.PushWarning"/> per distinct missing key and the call becomes a
    /// silent no-op. Callers (<see cref="World.AnimationController"/>'s edge-triggered
    /// state changes, <see cref="World.EntityView"/>'s HP-decrease check) call
    /// <c>AudioRegistry.Instance?.Play(...)</c> so a not-yet-ready autoload is equally
    /// safe.</para>
    ///
    /// <para>Players are one-shot: each <see cref="Play"/>/<see cref="Play2D"/> call
    /// spawns its own <see cref="AudioStreamPlayer3D"/>/<see cref="AudioStreamPlayer"/>,
    /// parented under this autoload, freed automatically when playback finishes — no
    /// pool bookkeeping needed for a PoC's sparse combat-event cadence.</para>
    /// </summary>
    public sealed partial class AudioRegistry : Node
    {
        /// <summary>Default manifest the autoload binds on <see cref="_Ready"/>.</summary>
        public const string DefaultManifestPath = "res://assets/audio-manifest.json";

        /// <summary>
        /// The live autoload instance (set in <see cref="_Ready"/>). Null until the
        /// autoload is ready; verify probes construct their own instance rather than
        /// relying on it.
        /// </summary>
        public static AudioRegistry? Instance { get; private set; }

        private AudioManifest? _manifest;
        private readonly Dictionary<string, AudioStream> _streamCache = new();
        private readonly HashSet<string> _warnedMissing = new();

        public override void _Ready()
        {
            Instance = this;
            LoadManifest(DefaultManifestPath);
        }

        /// <summary>
        /// (Re)bind the manifest from a <c>res://…</c> path. A malformed or missing
        /// manifest is not fatal — it is logged and the registry then resolves every
        /// event key to "no sound" (never throws). Exposed so verify probes can inject a
        /// fixture manifest without a live autoload.
        /// </summary>
        public void LoadManifest(string resPath)
        {
            _streamCache.Clear();
            _warnedMissing.Clear();
            try
            {
                _manifest = AudioManifest.Load(resPath);
            }
            catch (AudioManifestException ex)
            {
                GD.PushWarning(
                    $"AudioRegistry: manifest '{resPath}' failed to load ({ex.Message}); no SFX will play.");
                _manifest = null;
            }
        }

        /// <summary>
        /// Resolve an event key to its <see cref="AudioStream"/>. Returns null (and warns
        /// once per distinct missing key) if the manifest has no entry, the entry's
        /// stream path is blank, or the resource fails to load. Never throws.
        /// </summary>
        public AudioStream? ResolveStream(string eventKey)
        {
            if (_streamCache.TryGetValue(eventKey, out AudioStream? cached))
                return cached;

            if (_manifest == null || !_manifest.TryGet(eventKey, out AudioEntry entry))
            {
                WarnMissing(eventKey, "no manifest entry");
                return null;
            }

            if (string.IsNullOrEmpty(entry.Stream) || !ResourceLoader.Exists(entry.Stream))
            {
                WarnMissing(eventKey, $"stream '{entry.Stream}' not found");
                return null;
            }

            var stream = ResourceLoader.Load<AudioStream>(entry.Stream);
            if (stream == null)
            {
                WarnMissing(eventKey, $"stream '{entry.Stream}' failed to load");
                return null;
            }

            _streamCache[eventKey] = stream;
            return stream;
        }

        /// <summary>
        /// Play a positional one-shot for a combat event at a world position. Returns the
        /// spawned <see cref="AudioStreamPlayer3D"/> (mainly so verify probes can assert
        /// on it) or null if the event key/stream could not be resolved — in which case
        /// nothing is spawned and nothing throws.
        /// </summary>
        public AudioStreamPlayer3D? Play(string eventKey, Vector3 worldPos)
        {
            AudioStream? stream = ResolveStream(eventKey);
            if (stream == null)
                return null;

            var player = new AudioStreamPlayer3D { Stream = stream };
            AddChild(player);
            player.GlobalPosition = worldPos;
            player.Finished += () => FreeIfValid(player);
            player.Play();
            return player;
        }

        /// <summary>
        /// Play a non-positional one-shot (UI-style) for an event key. Returns the
        /// spawned <see cref="AudioStreamPlayer"/> or null if unresolved.
        /// </summary>
        public AudioStreamPlayer? Play2D(string eventKey)
        {
            AudioStream? stream = ResolveStream(eventKey);
            if (stream == null)
                return null;

            var player = new AudioStreamPlayer { Stream = stream };
            AddChild(player);
            player.Finished += () => FreeIfValid(player);
            player.Play();
            return player;
        }

        private static void FreeIfValid(Node player)
        {
            if (GodotObject.IsInstanceValid(player))
                player.QueueFree();
        }

        private void WarnMissing(string eventKey, string reason)
        {
            if (_warnedMissing.Add(eventKey))
                GD.PushWarning($"AudioRegistry: event '{eventKey}' unavailable ({reason}); skipping SFX.");
        }
    }
}
