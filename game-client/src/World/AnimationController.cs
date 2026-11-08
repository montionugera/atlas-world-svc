using System;
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
    public sealed partial class AnimationController
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
        // F-186: upper-body attack layer blend timings while moving (walk/run).
        private const double UpperBodyAttackBlendInSec = 0.10;
        private const double UpperBodyAttackBlendOutSec = 0.15;

        /// <summary>Shared default clip map — the same AnimationPlayer clip set ships on all 8 Kenney seed models.</summary>
        public static readonly IReadOnlyDictionary<string, string> DefaultClipMap = new Dictionary<string, string>
        {
            [StateIdle] = "idle",
            [StateWalk] = "walk",
            [StateRun] = "sprint",
            [StateAttack] = "attack-melee-right",
            [StateDeath] = "die",
        };

        // F-184: world m/s. The player runs at 3 m/s now (was 20), so the old 0.2 / 8 cut-offs
        // are scaled by the same 0.15 factor as the server (SPEED_SCALE): 0.03 / 2.4 (allowing walk up to 2.2 m/s).
        private const float WalkSpeedThreshold = 0.03f;
        private const float SprintSpeedThreshold = 2.4f;

        private const double LoopBlendSec = 0.15;
        private const double OneShotBlendSec = 0.05;

        /// <summary>Combat-event SFX keys — see <c>assets/audio-manifest.json</c>.</summary>
        private const string SfxAttack = "sfx:attack";
        private const string SfxDeath = "sfx:death";

        private readonly AnimationPlayer? _player;
        private readonly Skeleton3D? _skeleton;
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
            _skeleton = FindSkeleton(modelRoot);
            _clipMap = PreferPipelineNames(MergeClipMap(clipOverrides), clipOverrides);
            IsCombatMapped = clipOverrides != null &&
                clipOverrides.TryGetValue(StateCombatIdle, out string? ci) && !string.IsNullOrEmpty(ci);
            _attackClips = clipVariants != null && clipVariants.TryGetValue(StateAttack, out IReadOnlyList<string>? v) && v.Count > 0
                ? v
                : new[] { _clipMap[StateAttack] };

            if (_player != null)
                ConfigureLoopModes();
            if (_modelRoot != null && _skeleton != null && _player != null)
                AttachUpperBodyDriver(_modelRoot);
        }

        /// <summary>True when the manifest entry maps combat_idle; only then does the combat path run.</summary>
        public bool IsCombatMapped { get; }
        /// <summary>Client-side stance flag (F-174): set from the entity having a server target_id.</summary>
        public bool InCombat { get; set; }
        public string CurrentState => _lastState;
        public string CurrentClip { get; private set; } = "";
        public double LastBlendSec { get; private set; }
        /// <summary>F-186: True when an attack clip is playing on the upper-body layer over walk/run locomotion.</summary>
        public bool IsUpperBodyAttackActive { get; private set; }
        public string UpperBodyAttackClip { get; private set; } = "";
        public double UpperBodyAttackTime { get; private set; }
        public double UpperBodyAttackLength { get; private set; }
        /// <summary>Queue one attack one-shot; variants rotate. No server signal for remote entities yet (I-255).</summary>
        public void Attack() => _pendingAttack = true;
        /// <summary>Hold or release the block loop while InCombat. No server signal yet (I-255).</summary>
        public void Block(bool active = true) => _blocking = active;
        /// <summary>Queue one hit one-shot (wired from GameEvent.Hit).</summary>
        public void Hit() => _pendingHit = true;

        public bool HasPlayer => _player != null;
        public bool EnableStateAudio { get; set; } = false;
        /// <summary>
        /// When true, replaces the wide-stance boxing idle with an upright feminine relaxed standing posture
        /// (when not in combat) and applies arm adduction, narrower leg tracking, feminine hip sway, and
        /// exponential quaternion smoothing during walk/run locomotion.
        /// </summary>
        public bool UseFeminineRelaxedPosture { get; set; } = false;
        /// <summary>
        /// When true, _player.CallbackModeProcess is set to Manual and Tick(delta) advances _player,
        /// ApplyRelaxedLocomotionPosture, and AdvanceUpperBody deterministically in one call.
        /// </summary>
        public bool IsManualTickEnabled { get; private set; } = false;

        public void EnableManualTick(bool enabled = true)
        {
            IsManualTickEnabled = enabled;
            if (_player != null && GodotObject.IsInstanceValid(_player))
            {
                _player.CallbackModeProcess = enabled
                    ? AnimationMixer.AnimationCallbackModeProcess.Manual
                    : AnimationMixer.AnimationCallbackModeProcess.Idle;
            }
        }

        /// <summary>
        /// Deterministically advances AnimationPlayer, applies feminine relaxed posture / locomotion smoothing,
        /// and blends any active upper-body attack in exact sequential order.
        /// </summary>
        public void Tick(double delta)
        {
            if (_player != null && GodotObject.IsInstanceValid(_player) && IsManualTickEnabled)
            {
                double remaining = Math.Max(0.0, delta);
                if (remaining == 0.0)
                {
                    _player.Advance(0.0);
                }
                else
                {
                    while (remaining > 1e-6)
                    {
                        double step = Math.Min(remaining, 0.04);
                        _player.Advance(step);
                        remaining -= step;
                    }
                }
            }
            if (UseFeminineRelaxedPosture)
            {
                ApplyRelaxedLocomotionPosture(delta);
            }
            if (IsUpperBodyAttackActive)
            {
                AdvanceUpperBody(delta);
            }
        }

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

        // Priority: death > running one-shot > hit > attack (upper-body when moving, full-body when still) > locomotion > stance.
        private string ResolveCombatState(bool isAlive, Vector3 velocity, ref bool restart)
        {
            if (!isAlive)
            {
                _oneShotState = null;
                ClearUpperBodyAttack();
                return StateDeath;
            }
            float speed = velocity.Length();
            bool isMoving = speed >= WalkSpeedThreshold;

            if (_oneShotState != null)
            {
                if (_oneShotState == StateAttack && isMoving && _oneShotClip != null)
                {
                    PromoteOneShotToUpperBody(_oneShotClip, _player?.CurrentAnimationPosition ?? 0.0);
                    _oneShotState = null;
                }
                else if (OneShotPlaying())
                {
                    return _oneShotState;
                }
                else
                {
                    _oneShotState = null;
                }
            }
            if (_pendingHit)
            {
                _pendingHit = false;
                ClearUpperBodyAttack();
                if (HasClip(StateHit))
                    return StartOneShot(StateHit, ref restart);
            }
            if (_pendingAttack)
            {
                _pendingAttack = false;
                if (isMoving)
                {
                    StartUpperBodyAttack();
                }
                else
                {
                    return StartOneShot(StateAttack, ref restart);
                }
            }

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

        private void StartUpperBodyAttack()
        {
            if (_player == null || _attackClips.Count == 0)
                return;
            string clip = _attackClips[_attackIndex++ % _attackClips.Count];
            if (!_player.HasAnimation(clip))
                return;
            IsUpperBodyAttackActive = true;
            UpperBodyAttackClip = clip;
            UpperBodyAttackTime = 0.0;
            UpperBodyAttackLength = _player.GetAnimation(clip).Length;
            LastBlendSec = UpperBodyAttackBlendInSec;
            FireAudioForState(StateAttack);
            ApplyUpperBodyPose();
        }

        private void PromoteOneShotToUpperBody(string clip, double currentTime)
        {
            if (_player == null || !_player.HasAnimation(clip))
                return;
            IsUpperBodyAttackActive = true;
            UpperBodyAttackClip = clip;
            UpperBodyAttackTime = Math.Clamp(currentTime, 0.0, _player.GetAnimation(clip).Length);
            UpperBodyAttackLength = _player.GetAnimation(clip).Length;
            LastBlendSec = UpperBodyAttackBlendInSec;
        }

        public void ClearUpperBodyAttack()
        {
            IsUpperBodyAttackActive = false;
            UpperBodyAttackClip = "";
            UpperBodyAttackTime = 0.0;
            UpperBodyAttackLength = 0.0;
        }

        /// <summary>
        /// Advances the active upper-body attack clip by <paramref name="delta"/> seconds and blends
        /// its upper-body bone rotations over the current lower-body locomotion pose.
        /// </summary>
        public void AdvanceUpperBody(double delta)
        {
            if (!IsUpperBodyAttackActive)
                return;
            UpperBodyAttackTime += Math.Max(0.0, delta);
            if (UpperBodyAttackTime >= UpperBodyAttackLength)
            {
                ClearUpperBodyAttack();
                return;
            }
            ApplyUpperBodyPose();
        }

        /// <summary>Seeks the active upper-body attack clip to <paramref name="timeSec"/> and applies its pose immediately.</summary>
        public void SeekUpperBody(double timeSec)
        {
            if (!IsUpperBodyAttackActive || UpperBodyAttackLength <= 0.0)
                return;
            UpperBodyAttackTime = Math.Clamp(timeSec, 0.0, UpperBodyAttackLength);
            ApplyUpperBodyPose();
        }

        public void ApplyUpperBodyPose()
        {
            if (!IsUpperBodyAttackActive || _player == null || _skeleton == null)
                return;
            if (!GodotObject.IsInstanceValid(_player) || !GodotObject.IsInstanceValid(_skeleton))
                return;
            if (!_player.HasAnimation(UpperBodyAttackClip))
                return;

            Animation? anim = _player.GetAnimation(UpperBodyAttackClip);
            if (anim == null)
                return;

            float weight = ComputeUpperBodyWeight(UpperBodyAttackTime, UpperBodyAttackLength);
            int trackCount = anim.GetTrackCount();
            for (int t = 0; t < trackCount; t++)
            {
                if (anim.TrackGetType(t) != Animation.TrackType.Rotation3D || anim.TrackGetKeyCount(t) == 0)
                    continue;
                NodePath path = anim.TrackGetPath(t);
                if (path.GetSubNameCount() == 0)
                    continue;
                string boneName = path.GetSubName(0).ToString();
                if (!IsUpperBodyBone(boneName))
                    continue;
                int boneIdx = _skeleton.FindBone(boneName);
                if (boneIdx < 0)
                    continue;

                Quaternion baseRot = _skeleton.GetBonePoseRotation(boneIdx);
                Quaternion atkRot = anim.RotationTrackInterpolate(t, UpperBodyAttackTime);
                if (!baseRot.IsFinite() || baseRot.LengthSquared() < 1e-6f ||
                    !atkRot.IsFinite() || atkRot.LengthSquared() < 1e-6f)
                    continue;
                _skeleton.SetBonePoseRotation(boneIdx, baseRot.Normalized().Slerp(atkRot.Normalized(), weight));
            }
        }

        private static float ComputeUpperBodyWeight(double time, double length)
        {
            if (length <= 0.001)
                return 0f;
            float fadeIn = UpperBodyAttackBlendInSec > 0.0
                ? Mathf.Clamp((float)(time / UpperBodyAttackBlendInSec), 0.25f, 1.0f)
                : 1.0f;
            double remaining = Math.Max(0.0, length - time);
            float fadeOut = UpperBodyAttackBlendOutSec > 0.0
                ? Mathf.Clamp((float)(remaining / UpperBodyAttackBlendOutSec), 0.0f, 1.0f)
                : 1.0f;
            return Math.Min(fadeIn, fadeOut);
        }

        /// <summary>
        /// Portable upper/lower-body split across Meshy, Mixamo, KayKit, Linde Folk (Elf), and Silme Seer rigs:
        /// Lower body (Hips/Pelvis/Root + Legs/Feet/Toes + hem chains) stays driven by walk/run locomotion;
        /// Upper body (Spine/Chest/Torso, Neck/Head, Shoulders/Arms/Hands, weapon sockets, hair/cape/ear chains)
        /// blends the attack animation.
        /// </summary>
        public static bool IsUpperBodyBone(string boneName)
        {
            if (string.IsNullOrEmpty(boneName))
                return false;
            string lower = boneName.ToLowerInvariant();
            if (lower == "hips" || lower == "mixamorig_hips" || lower == "mixamorig:hips" ||
                lower == "pelvis" || lower == "root")
                return false;
            if (lower.Contains("upleg") || lower.Contains("leg") || lower.Contains("foot") ||
                lower.Contains("toe") || lower.Contains("thigh") || lower.Contains("calf") ||
                lower.Contains("ankle") || lower.StartsWith("sec_hem_"))
                return false;
            return true;
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

        private static Skeleton3D? FindSkeleton(Node node)
        {
            if (node is Skeleton3D skel)
                return skel;
            foreach (Node child in node.GetChildren())
            {
                Skeleton3D? found = FindSkeleton(child);
                if (found != null)
                    return found;
            }
            return null;
        }

        private void AttachUpperBodyDriver(Node3D modelRoot)
        {
            if (modelRoot.GetNodeOrNull("UpperBodyLayerDriver") != null)
                return;
            var driver = new UpperBodyLayerDriver(this)
            {
                Name = "UpperBodyLayerDriver",
                ProcessPriority = 100,
                ProcessPhysicsPriority = 100,
            };
            modelRoot.AddChild(driver);
        }

        /// <summary>
        /// Retained for API compatibility; locomotion and idle now play baked human preset clips
        /// (Idle_4, Walking_Woman, run_fast_9) directly from AnimationPlayer without procedural sine-wave overrides.
        /// </summary>
        public void ApplyRelaxedLocomotionPosture(double delta)
        {
            _ = delta;
        }
    }
}
