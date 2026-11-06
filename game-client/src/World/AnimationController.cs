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
        public const string StateDeath = "death";
        public const string StateAttack = "attack";
        public const string StateRun = "run";
        public const string StateWalk = "walk";
        public const string StateIdle = "idle";
        public const string StateCombatIdle = "combat_idle";
        public const string StateBlock = "block";
        public const string StateHit = "hit";
        public const string StateReadyIn = "ready_in";
        public const string StateReadyOut = "ready_out";
        // F-174: a softer blend into attack, only for entries that map combat_idle.
        private const double CombatAttackBlendSec = 0.15;

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

        private readonly IReadOnlyList<string> _attackClips;
        private int _attackIndex;
        private string? _oneShotState;
        private string? _oneShotClip;
        private bool _pendingAttack;
        private bool _pendingHit;
        private bool _blocking;
        private bool _inStance;

        public AnimationController(Node modelRoot, IReadOnlyDictionary<string, string>? clipOverrides = null,
            IReadOnlyDictionary<string, IReadOnlyList<string>>? clipVariants = null)
        {
            _modelRoot = modelRoot as Node3D;
            _player = FindAnimationPlayer(modelRoot);
            _clipMap = PreferPipelineNames(MergeClipMap(clipOverrides), clipOverrides);
            IsCombatMapped = clipOverrides != null &&
                clipOverrides.TryGetValue(StateCombatIdle, out string? ci) && !string.IsNullOrEmpty(ci);
            _attackClips = clipVariants != null && clipVariants.TryGetValue(StateAttack, out IReadOnlyList<string>? v) && v.Count > 0
                ? v
                : new[] { _clipMap[StateAttack] };

            if (_player != null)
                ConfigureLoopModes();
        }

        /// <summary>True when the manifest entry maps combat_idle; only then does the combat path run.</summary>
        public bool IsCombatMapped { get; }
        /// <summary>Client-side stance flag (F-174): set from the entity having a server target_id.</summary>
        public bool InCombat { get; set; }
        public string CurrentState => _lastState;
        public string CurrentClip { get; private set; } = "";
        public double LastBlendSec { get; private set; }
        /// <summary>Queue one attack one-shot; variants rotate. No server signal for remote entities yet (I-255).</summary>
        public void Attack() => _pendingAttack = true;
        /// <summary>Hold or release the block loop while InCombat. No server signal yet (I-255).</summary>
        public void Block(bool active = true) => _blocking = active;
        /// <summary>Queue one hit one-shot (wired from GameEvent.Hit).</summary>
        public void Hit() => _pendingHit = true;

        public bool HasPlayer => _player != null;
        public bool EnableStateAudio { get; set; } = false;

        public void Update(bool isAlive, Vector3 velocity, bool isAttacking = false)
        {
            if (IsCombatMapped)
            {
                UpdateCombat(isAlive, velocity);
                return;
            }
            string state = ResolveState(isAlive, velocity, isAttacking);
            if (state == _lastState)
                return;

            Enter(state);
        }

        private void UpdateCombat(bool isAlive, Vector3 velocity)
        {
            bool restart = false;
            string state = ResolveCombatState(isAlive, velocity, ref restart);
            if (state == _lastState && !restart)
                return;

            Enter(state);
        }

        private void Enter(string state)
        {
            _lastState = state;
            FireAudioForState(state);
            if (_player == null || !GodotObject.IsInstanceValid(_player))
                return;
            PlayState(state);
        }

        // Priority: death > running one-shot > hit > attack > locomotion > stance.
        private string ResolveCombatState(bool isAlive, Vector3 velocity, ref bool restart)
        {
            if (!isAlive)
            {
                _oneShotState = null;
                return StateDeath;
            }
            if (_oneShotState != null)
            {
                if (OneShotPlaying())
                    return _oneShotState;
                _oneShotState = null;
            }
            if (_pendingHit)
            {
                _pendingHit = false;
                if (HasClip(StateHit))
                    return StartOneShot(StateHit, ref restart);
            }
            if (_pendingAttack)
            {
                _pendingAttack = false;
                return StartOneShot(StateAttack, ref restart);
            }

            float speed = velocity.Length();
            if (speed >= SprintSpeedThreshold)
                return StateRun;
            if (speed >= WalkSpeedThreshold)
                return StateWalk;

            if (InCombat)
            {
                if (!_inStance)
                {
                    _inStance = true;
                    if (HasClip(StateReadyIn))
                        return StartOneShot(StateReadyIn, ref restart);
                }
                return _blocking && HasClip(StateBlock) ? StateBlock : StateCombatIdle;
            }
            if (_inStance)
            {
                _inStance = false;
                if (HasClip(StateReadyOut))
                    return StartOneShot(StateReadyOut, ref restart);
            }
            return StateIdle;
        }

        private string StartOneShot(string state, ref bool restart)
        {
            _oneShotState = state;
            restart = true;
            return state;
        }

        private bool OneShotPlaying() =>
            _player != null && _oneShotClip != null && _player.IsPlaying() && _player.CurrentAnimation == _oneShotClip;

        private bool HasClip(string state) =>
            _player != null && _clipMap.TryGetValue(state, out string? c) && !string.IsNullOrEmpty(c) && _player.HasAnimation(c);

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
            if (IsCombatMapped && state == StateAttack)
                clip = _attackClips[_attackIndex++ % _attackClips.Count];

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

            double blend = state switch
            {
                StateAttack => IsCombatMapped ? CombatAttackBlendSec : OneShotBlendSec,
                StateDeath or StateHit or StateReadyIn or StateReadyOut => OneShotBlendSec,
                _ => LoopBlendSec,
            };
            _player.Play(clip, customBlend: blend);
            LastBlendSec = blend;
            CurrentClip = clip;
            if (state is StateAttack or StateHit or StateReadyIn or StateReadyOut)
                _oneShotClip = clip;
        }

        private void ConfigureLoopModes()
        {
            SetLoopMode(StateIdle, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateWalk, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateRun, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateAttack, Animation.LoopModeEnum.None);
            SetLoopMode(StateDeath, Animation.LoopModeEnum.None);
            SetLoopMode(StateCombatIdle, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateBlock, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateHit, Animation.LoopModeEnum.None);
            SetLoopMode(StateReadyIn, Animation.LoopModeEnum.None);
            SetLoopMode(StateReadyOut, Animation.LoopModeEnum.None);
            foreach (string c in _attackClips)
                SetRawClipLoop(c, Animation.LoopModeEnum.None);

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

        /// <summary>
        /// A pipeline clip name wins over the Kenney default (run before sprint, death before die)
        /// when the manifest did not map that state itself and the player has the pipeline clip.
        /// </summary>
        private IReadOnlyDictionary<string, string> PreferPipelineNames(
            IReadOnlyDictionary<string, string> map, IReadOnlyDictionary<string, string>? overrides)
        {
            if (_player == null)
                return map;
            Dictionary<string, string>? copy = null;
            foreach ((string state, string pipelineClip) in new[] { (StateRun, "run"), (StateDeath, "death") })
            {
                bool mapped = overrides != null && overrides.ContainsKey(state);
                if (!mapped && _player.HasAnimation(pipelineClip))
                    (copy ??= new Dictionary<string, string>(map))[state] = pipelineClip;
            }
            return copy ?? map;
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
