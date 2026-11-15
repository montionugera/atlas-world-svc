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
        private readonly List<AudioStreamPlayer3D> _pool3D = new();
        private readonly List<AudioStreamPlayer> _pool2D = new();
        private const int MaxPoolSize = 16;
        private int _footstepVariantIndex = 0;
        private readonly System.Random _footstepRng = new(0x5F3759DF);
        private readonly int[][] _recentFootstepVariantsBySurface =
        {
            new[] { -1, -1, -1 }, // Stone = 0
            new[] { -1, -1, -1 }, // Dirt = 1
            new[] { -1, -1, -1 }, // Grass = 2
            new[] { -1, -1, -1 }, // Water = 3
            new[] { -1, -1, -1 }, // Glass = 4
        };
        private readonly int[] _recentFootstepCursorBySurface = new int[5];
        private static readonly string[] FootstepVariantKeys =
        {
            "sfx:footstep_1",
            "sfx:footstep_2",
            "sfx:footstep_3",
            "sfx:footstep_4",
            "sfx:footstep_5",
            "sfx:footstep_6",
            "sfx:footstep_7",
            "sfx:footstep_8",
        };

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
            if (eventKey == "sfx:footstep")
            {
                bool rightFoot = (_footstepVariantIndex & 1) != 0;
                return PlayFootstep(worldPos, rightFoot, isRunning: false, FootstepSurface.Stone);
            }

            AudioStream? stream = ResolveStream(eventKey);
            if (stream == null)
                return null;

            AudioStreamPlayer3D player = AcquirePlayer3D();
            player.Stream = stream;
            player.VolumeDb = 0.0f;
            player.PitchScale = 1.0f;
            player.UnitSize = 10.0f;
            player.MaxDb = 3.0f;
            player.GlobalPosition = worldPos;
            player.Play();
            return player;
        }

        /// <summary>
        /// Plays a natural, multi-sample footstep one-shot synced to left/right foot strikes,
        /// walk/run locomotion cadence, and ground surface material. Falls back to <c>sfx:footstep_1..8</c>
        /// and <c>sfx:footstep</c> if material-specific variant keys are not present in the active manifest.
        /// </summary>
        public AudioStreamPlayer3D? PlayFootstep(
            Vector3 worldPos,
            bool isRightFoot = false,
            bool isRunning = false,
            FootstepSurface surface = FootstepSurface.Stone)
        {
            _footstepVariantIndex++;
            int variantIdx = PickNonRepeatingFootstepVariant(surface);
            string surfaceToken = FootstepSurfaceMapper.ToEventToken(surface);
            string surfaceVariantKey = $"sfx:footstep_{surfaceToken}_{variantIdx + 1}";
            string fallbackVariantKey = FootstepVariantKeys[variantIdx];

            AudioStream? stream = null;
            if (_manifest != null && _manifest.TryGet(surfaceVariantKey, out _))
            {
                stream = ResolveStream(surfaceVariantKey);
            }
            if (stream == null && _manifest != null && _manifest.TryGet(fallbackVariantKey, out _))
            {
                stream = ResolveStream(fallbackVariantKey);
            }
            stream ??= ResolveStream("sfx:footstep");
            if (stream == null)
                return null;

            AudioStreamPlayer3D player = AcquirePlayer3D();
            player.Stream = stream;

            // Triangular organic random variation (centered at 0, range [-1, +1]) so consecutive
            // steps never sound like a periodic loop or a high-low-high-low clock pendulum.
            float triPitch = (float)(_footstepRng.NextDouble() - _footstepRng.NextDouble());
            float triVol = (float)(_footstepRng.NextDouble() - _footstepRng.NextDouble());
            float footBias = isRightFoot ? -0.012f : 0.012f;

            // Subtle per-surface volume and pitch trims
            (float volTrim, float pitchTrim) = surface switch
            {
                FootstepSurface.Dirt => (0.0f, 0.0f),
                FootstepSurface.Grass => (0.6f, 0.0f),
                FootstepSurface.Water => (0.0f, 0.0f),
                FootstepSurface.Glass => (0.5f, 0.03f),
                _ => (0.0f, 0.0f), // Stone
            };

            if (isRunning)
            {
                player.VolumeDb = -8.2f + (triVol * 1.1f) + volTrim;
                player.PitchScale = Mathf.Clamp(1.02f + footBias + (triPitch * 0.065f) + pitchTrim, 0.90f, 1.14f);
                player.UnitSize = 4.5f;
                player.MaxDb = -5.0f;
            }
            else
            {
                player.VolumeDb = -10.8f + (triVol * 1.2f) + volTrim;
                player.PitchScale = Mathf.Clamp(0.96f + footBias + (triPitch * 0.060f) + pitchTrim, 0.86f, 1.08f);
                player.UnitSize = 4.0f;
                player.MaxDb = -7.0f;
            }
            player.GlobalPosition = worldPos;
            player.Play();
            return player;
        }

        private int PickNonRepeatingFootstepVariant(FootstepSurface surface)
        {
            int sIdx = Mathf.Clamp((int)surface, 0, _recentFootstepVariantsBySurface.Length - 1);
            int[] recent = _recentFootstepVariantsBySurface[sIdx];
            int count = FootstepVariantKeys.Length;
            int candidate = _footstepRng.Next(count);
            for (int attempt = 0; attempt < 12; attempt++)
            {
                bool recentlyUsed = false;
                for (int i = 0; i < recent.Length; i++)
                {
                    if (recent[i] == candidate)
                    {
                        recentlyUsed = true;
                        break;
                    }
                }
                if (!recentlyUsed)
                    break;
                candidate = (candidate + 1 + _footstepRng.Next(count - 1)) % count;
            }
            recent[_recentFootstepCursorBySurface[sIdx]] = candidate;
            _recentFootstepCursorBySurface[sIdx] = (_recentFootstepCursorBySurface[sIdx] + 1) % recent.Length;
            return candidate;
        }

        private AudioStreamPlayer3D AcquirePlayer3D()
        {
            AudioStreamPlayer3D? player = null;
            for (int i = _pool3D.Count - 1; i >= 0; i--)
            {
                var p = _pool3D[i];
                if (!GodotObject.IsInstanceValid(p))
                {
                    _pool3D.RemoveAt(i);
                    continue;
                }
                if (!p.Playing)
                {
                    player = p;
                    break;
                }
            }

            if (player == null)
            {
                if (_pool3D.Count >= MaxPoolSize && GodotObject.IsInstanceValid(_pool3D[0]))
                {
                    player = _pool3D[0];
                    player.Stop();
                }
                else
                {
                    player = new AudioStreamPlayer3D();
                    AddChild(player);
                    _pool3D.Add(player);
                }
            }
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

            AudioStreamPlayer? player = null;
            for (int i = _pool2D.Count - 1; i >= 0; i--)
            {
                var p = _pool2D[i];
                if (!GodotObject.IsInstanceValid(p))
                {
                    _pool2D.RemoveAt(i);
                    continue;
                }
                if (!p.Playing)
                {
                    player = p;
                    break;
                }
            }

            if (player == null)
            {
                if (_pool2D.Count >= MaxPoolSize && GodotObject.IsInstanceValid(_pool2D[0]))
                {
                    player = _pool2D[0];
                    player.Stop();
                }
                else
                {
                    player = new AudioStreamPlayer();
                    AddChild(player);
                    _pool2D.Add(player);
                }
            }

            player.Stream = stream;
            player.Play();
            return player;
        }

        private void WarnMissing(string eventKey, string reason)
        {
            if (_warnedMissing.Add(eventKey))
                GD.PushWarning($"AudioRegistry: event '{eventKey}' unavailable ({reason}); skipping SFX.");
        }
    }
}
