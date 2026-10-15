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
        private readonly Node3D? _modelRoot;

        private string _lastState = "";

        public AnimationController(Node modelRoot, IReadOnlyDictionary<string, string>? clipOverrides = null)
        {
            _modelRoot = modelRoot as Node3D;
            _player = FindAnimationPlayer(modelRoot);
            _clipMap = MergeClipMap(clipOverrides);

            if (_player != null)
                ConfigureLoopModes();
        }

        public bool HasPlayer => _player != null;
        public bool EnableStateAudio { get; set; } = false;

        public void Update(bool isAlive, Vector3 velocity, bool isAttacking = false)
        {
            string state = ResolveState(isAlive, velocity, isAttacking);
            if (state == _lastState)
                return;

            _lastState = state;
            FireAudioForState(state);

            if (_player == null || !GodotObject.IsInstanceValid(_player))
                return;

            PlayState(state);
        }

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
            if (!EnableStateAudio || _modelRoot == null || !GodotObject.IsInstanceValid(_modelRoot))
                return;
            if (!_modelRoot.IsInsideTree() || !_modelRoot.IsVisibleInTree())
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
            if (_player.GetAnimationList().Length == 0)
                return; // Model has an empty AnimationPlayer node with no embedded clips
            if (!_clipMap.TryGetValue(state, out string? clip) || string.IsNullOrEmpty(clip))
                return;

            if (!_player.HasAnimation(clip))
            {
                // Check common KayKit / Kenney casing fallback before warning
                string? altClip = state switch
                {
                    StateIdle => _player.HasAnimation("Idle") ? "Idle" :
                                 _player.HasAnimation("Idle_A") ? "Idle_A" :
                                 _player.HasAnimation("Melee_Unarmed_Idle") ? "Melee_Unarmed_Idle" :
                                 _player.HasAnimation("idle") ? "idle" : null,
                    StateWalk => _player.HasAnimation("Walking_A") ? "Walking_A" :
                                 _player.HasAnimation("walk") ? "walk" : null,
                    StateRun => _player.HasAnimation("Running_A") ? "Running_A" :
                                _player.HasAnimation("sprint") ? "sprint" : null,
                    StateAttack => _player.HasAnimation("1H_Melee_Attack_Slice_Diagonal") ? "1H_Melee_Attack_Slice_Diagonal" :
                                   _player.HasAnimation("Melee_1H_Attack_Slice_Diagonal") ? "Melee_1H_Attack_Slice_Diagonal" :
                                   _player.HasAnimation("Melee_1H_Attack_Chop") ? "Melee_1H_Attack_Chop" :
                                   _player.HasAnimation("Throw") ? "Throw" :
                                   _player.HasAnimation("attack-melee-right") ? "attack-melee-right" : null,
                    StateDeath => _player.HasAnimation("Death_A") ? "Death_A" :
                                  _player.HasAnimation("die") ? "die" : null,
                    _ => null
                };

                if (altClip != null && clip == DefaultClipMap.GetValueOrDefault(state))
                {
                    clip = altClip;
                }
                else
                {
                    if (_warnedMissingClips.Add(clip))
                        GD.PushWarning($"AnimationController: clip '{clip}' (state={state}) not found on model; skipping.");
                    return;
                }
            }

            double blend = state is StateDeath or StateAttack ? OneShotBlendSec : LoopBlendSec;
            _player.Play(clip, customBlend: blend);
        }

        private void ConfigureLoopModes()
        {
            SetLoopMode(StateIdle, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateWalk, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateRun, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateAttack, Animation.LoopModeEnum.None);
            SetLoopMode(StateDeath, Animation.LoopModeEnum.None);

            // Also ensure KayKit clip names loop if present on the player
            SetRawClipLoop("Idle", Animation.LoopModeEnum.Linear);
            SetRawClipLoop("Idle_A", Animation.LoopModeEnum.Linear);
            SetRawClipLoop("Melee_Unarmed_Idle", Animation.LoopModeEnum.Linear);
            SetRawClipLoop("Walking_A", Animation.LoopModeEnum.Linear);
            SetRawClipLoop("Running_A", Animation.LoopModeEnum.Linear);
        }

        private void SetLoopMode(string state, Animation.LoopModeEnum mode)
        {
            if (_player == null)
                return;
            if (!_clipMap.TryGetValue(state, out string? clip) || string.IsNullOrEmpty(clip))
                return;
            SetRawClipLoop(clip, mode);
        }

        private void SetRawClipLoop(string clip, Animation.LoopModeEnum mode)
        {
            if (_player == null || !_player.HasAnimation(clip))
                return;
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
