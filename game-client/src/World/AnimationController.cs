using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.Audio;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Drives a spawned character model's built-in glTF <see cref="AnimationPlayer"/> from
    /// the entity's SYNCED logical state (alive/dead, speed, attacking) — never from
    /// client input. One controller per <see cref="EntityView"/>, created alongside the
    /// view's visual root and updated every frame from <see cref="EntityManager"/>.
    ///
    /// <para>Clip resolution: a shared default logical-state → clip-name map (identical on
    /// every Kenney seed character — idle/walk/sprint/die/attack-melee-right) with an
    /// optional per-entry override threaded from the asset manifest's <c>anims</c> object
    /// (see <c>AssetEntry.Anims</c>). Resolution never throws — a clip missing on a given
    /// model logs ONE warning and that frame is a no-op; it does not fall back to a
    /// different clip.</para>
    ///
    /// <para>State is EDGE-TRIGGERED: <see cref="AnimationPlayer.Play"/> is only called when
    /// the logical state actually changes, so one-shot clips (die, attack) are not
    /// restarted every frame while the state persists, and looping clips (idle/walk/sprint)
    /// are left alone — untouched — once started.</para>
    ///
    /// <para>Positional combat SFX PoC: the SAME state-change edge that drives clip
    /// selection also fires <see cref="AudioRegistry.Play"/> for the attack/death states
    /// (<c>sfx:attack</c> / <c>sfx:death</c>) — no second edge-detector is built for
    /// audio. This fires even for entities with no <see cref="AnimationPlayer"/> (the
    /// procedural capsule tier), since the state machine itself doesn't need one; only
    /// the clip playback below does.</para>
    /// </summary>
    public sealed class AnimationController
    {
        private const string StateDeath = "death";
        private const string StateAttack = "attack";
        private const string StateRun = "run";
        private const string StateWalk = "walk";
        private const string StateIdle = "idle";

        /// <summary>Shared default clip map — the same AnimationPlayer clip set ships on all 8 Kenney seed models.</summary>
        public static readonly IReadOnlyDictionary<string, string> DefaultClipMap = new Dictionary<string, string>
        {
            [StateIdle] = "idle",
            [StateWalk] = "walk",
            [StateRun] = "sprint",
            [StateAttack] = "attack-melee-right",
            [StateDeath] = "die",
        };

        // World units/second. Server maxMoveSpeed defaults to 20 (see Player.ts /
        // Mob.ts) — these are coarse PoC thresholds, not per-entity-tuned against each
        // character's actual cap.
        private const float WalkSpeedThreshold = 0.2f;
        private const float SprintSpeedThreshold = 8f;

        private const double LoopBlendSec = 0.15;
        private const double OneShotBlendSec = 0.05;

        /// <summary>Combat-event SFX keys — see <c>assets/audio-manifest.json</c>.</summary>
        private const string SfxAttack = "sfx:attack";
        private const string SfxDeath = "sfx:death";

        private readonly AnimationPlayer? _player;
        private readonly IReadOnlyDictionary<string, string> _clipMap;
        private readonly HashSet<string> _warnedMissingClips = new();

        /// <summary>
        /// The view's visual root, kept ONLY to read a world position at the moment an
        /// audio-bearing state edge fires (see <see cref="FireAudioForState"/>). Not used
        /// for anything animation-related — <see cref="_player"/> already owns that.
        /// </summary>
        private readonly Node3D? _modelRoot;

        private string _lastState = "";

        /// <param name="modelRoot">The instantiated character node (the view's visual root).</param>
        /// <param name="clipOverrides">Optional per-entry overrides layered over <see cref="DefaultClipMap"/>.</param>
        public AnimationController(Node modelRoot, IReadOnlyDictionary<string, string>? clipOverrides = null)
        {
            _modelRoot = modelRoot as Node3D;
            _player = FindAnimationPlayer(modelRoot);
            _clipMap = MergeClipMap(clipOverrides);

            if (_player != null)
                ConfigureLoopModes();
        }

        /// <summary>
        /// True if a real <see cref="AnimationPlayer"/> was found under the model root.
        /// False (e.g. the procedural capsule fallback, which has no clips) makes
        /// <see cref="Update"/> a safe no-op — nothing throws.
        /// </summary>
        public bool HasPlayer => _player != null;

        /// <summary>
        /// Drive the animation from this frame's synced state. <paramref name="velocity"/>
        /// is the entity's world-space velocity (server vx/vy via <c>PoseSample.Vel</c>) —
        /// only its magnitude matters. Priority: dead &gt; attacking &gt; speed &gt; idle.
        /// </summary>
        public void Update(bool isAlive, Vector3 velocity, bool isAttacking = false)
        {
            string state = ResolveState(isAlive, velocity, isAttacking);
            if (state == _lastState)
                return; // edge-triggered: one-shots don't restart, loops keep looping

            _lastState = state;
            FireAudioForState(state); // same edge, independent of whether a clip exists

            if (_player == null || !GodotObject.IsInstanceValid(_player))
                return; // no AnimationPlayer (e.g. capsule fallback) — nothing left to do

            PlayState(state);
        }

        /// <summary>
        /// Positional combat SFX PoC: on the attack/death state edge, play the mapped
        /// event at the entity's current world position. Any other state (idle/walk/run)
        /// is not mapped and is a no-op. Safe if the <see cref="AudioRegistry"/> autoload
        /// isn't up yet (isolated/verify contexts) or the model root was freed.
        /// </summary>
        private void FireAudioForState(string state)
        {
            string? eventKey = state switch
            {
                StateAttack => SfxAttack,
                StateDeath => SfxDeath,
                _ => null,
            };
            if (eventKey == null)
                return;
            if (_modelRoot == null || !GodotObject.IsInstanceValid(_modelRoot))
                return;

            AudioRegistry.Instance?.Play(eventKey, _modelRoot.GlobalPosition);
        }

        private static string ResolveState(bool isAlive, Vector3 velocity, bool isAttacking)
        {
            if (!isAlive)
                return StateDeath;
            if (isAttacking)
                return StateAttack;

            float speed = velocity.Length();
            if (speed >= SprintSpeedThreshold)
                return StateRun;
            if (speed >= WalkSpeedThreshold)
                return StateWalk;
            return StateIdle;
        }

        private void PlayState(string state)
        {
            if (_player == null)
                return;
            if (!_clipMap.TryGetValue(state, out string? clip) || string.IsNullOrEmpty(clip))
                return; // no mapping for this state — safe no-op

            if (!_player.HasAnimation(clip))
            {
                if (_warnedMissingClips.Add(clip))
                    GD.PushWarning($"AnimationController: clip '{clip}' (state={state}) not found on model; skipping.");
                return;
            }

            double blend = state is StateDeath or StateAttack ? OneShotBlendSec : LoopBlendSec;
            _player.Play(clip, customBlend: blend);
        }

        /// <summary>Loop the gait clips (idle/walk/sprint); leave die/attack as one-shots that hold their last frame.</summary>
        private void ConfigureLoopModes()
        {
            SetLoopMode(StateIdle, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateWalk, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateRun, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateAttack, Animation.LoopModeEnum.None);
            SetLoopMode(StateDeath, Animation.LoopModeEnum.None);
        }

        private void SetLoopMode(string state, Animation.LoopModeEnum mode)
        {
            if (_player == null)
                return;
            if (!_clipMap.TryGetValue(state, out string? clip) || string.IsNullOrEmpty(clip))
                return;
            if (!_player.HasAnimation(clip))
                return; // missing clip on this model — nothing to configure, no warning here (PlayState warns)

            Animation? anim = _player.GetAnimation(clip);
            if (anim != null)
                anim.LoopMode = mode;
        }

        private static IReadOnlyDictionary<string, string> MergeClipMap(IReadOnlyDictionary<string, string>? overrides)
        {
            if (overrides == null || overrides.Count == 0)
                return DefaultClipMap;

            var merged = new Dictionary<string, string>(DefaultClipMap);
            foreach (KeyValuePair<string, string> kv in overrides)
                merged[kv.Key] = kv.Value;
            return merged;
        }

        /// <summary>Depth-first search for the model's AnimationPlayer — glTF imports nest it a level or two under the scene root.</summary>
        private static AnimationPlayer? FindAnimationPlayer(Node node)
        {
            if (node is AnimationPlayer player)
                return player;
            foreach (Node child in node.GetChildren())
            {
                AnimationPlayer? found = FindAnimationPlayer(child);
                if (found != null)
                    return found;
            }
            return null;
        }
    }
}
