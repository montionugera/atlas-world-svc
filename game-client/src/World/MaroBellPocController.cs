using System;
using System.Linq;
using Godot;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Audio;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// POC-01: Wonder — The Road to the Great Bell (00:00–02:30).
    /// Manages arrival reveal composition validation, South Gate Pip/Reed/Tovin NPCs,
    /// non-intrusive objective pill &amp; dialogue toast UI, and environmental audio cues.
    /// </summary>
    public sealed partial class MaroBellPocController : Node3D
    {
        public static readonly Vector3 ArrivalSpawnWorld = new(0f, 0f, 71f);
        public static readonly Vector3 GreatBellWorld = new(0f, 14f, -66f);
        public static readonly Vector3 PipWorldPos = new(-3.0f, 0f, 60.0f);
        public static readonly Vector3 ReedWorldPos = new(3.0f, 0f, 62.0f);
        public static readonly Vector3 TovinWorldPos = new(4.5f, 0f, -50.0f);
        public const float InteractionRadiusMeters = 3.8f;

        public readonly record struct RevealCompositionReport(
            bool HasForegroundLanterns,
            bool RoadCorridorClear,
            bool GreatBellLineOfSightClear,
            bool HasFlankingPorcelainRibs)
        {
            public bool IsValid => HasForegroundLanterns && RoadCorridorClear && GreatBellLineOfSightClear && HasFlankingPorcelainRibs;
        }

        public string ActiveBeat { get; private set; } = "POC-01";
        public bool PipGreeted { get; private set; }
        public string ObjectiveText { get; private set; } = "Follow the Lantern Road & speak with Pip [F]";
        public string LastDialogueLine { get; private set; } = "";
        public int EnvironmentalAudioEventsPlayed { get; private set; }

        public EntityView? PipView { get; private set; }
        public EntityView? ReedView { get; private set; }
        public EntityView? TovinView { get; private set; }

        private CanvasLayer? _uiLayer;
        private PanelContainer? _objectivePanel;
        private Label? _objectiveLabel;
        private PanelContainer? _dialoguePanel;
        private Label? _dialogueLabel;

        private double _footstepTimer = 0.0;
        private bool _reedBarkPlayed = false;
        private bool _tovinBarkPlayed = false;

        public static RevealCompositionReport EvaluateGreatBellRevealComposition(UnifiedMapDocument doc, Vector3 spawnPos)
        {
            bool hasForegroundLanterns =
                doc.Structures.Any(s => s.Id == "lantern-01" && Mathf.Abs(s.X) <= 5f && s.Z >= 50f && s.Z <= 65f) &&
                doc.Structures.Any(s => s.Id == "lantern-02" && Mathf.Abs(s.X) <= 5f && s.Z >= 45f && s.Z <= 60f);

            bool roadCorridorClear = !doc.StaticObstacles.Any(obs =>
                obs.MinX <= 40f && obs.MaxX >= 40f && obs.MinY <= 151f && obs.MaxY >= 140f);

            var bell = doc.Structures.FirstOrDefault(s => s.Id == "great-bell");
            bool bellValid = bell != null && Mathf.IsEqualApprox(bell.Z, -66f) && (bell.Hover + bell.Size.Y * 0.5f >= 12f);
            bool centralClear = !doc.Structures.Any(s =>
                s.Solid && Mathf.Abs(s.X) <= 2.5f && s.Z > -60f && s.Z < 71f && (s.Hover + s.Size.Y > 8.0f));
            bool greatBellLineOfSightClear = bellValid && centralClear;

            bool hasFlankingPorcelainRibs =
                doc.Structures.Count(s => s.Id.StartsWith("porcelain-rib-") && Mathf.Abs(s.X) >= 30f) >= 6;

            return new RevealCompositionReport(
                hasForegroundLanterns,
                roadCorridorClear,
                greatBellLineOfSightClear,
                hasFlankingPorcelainRibs);
        }

        public void Initialize(UnifiedMapDocument doc)
        {
            SpawnNpcs();
            BuildUi();
            PlayEnvironmentalIntroAudio();
        }

        private void SpawnNpcs()
        {
            string pipKey = "npc";
            if (AssetRegistry.Instance != null)
            {
                AssetRegistry.Instance.Resolve(PipelineCharVerify.MaroGirlKey, out ResolveTier pipTier);
                if (pipTier == ResolveTier.Bespoke)
                    pipKey = PipelineCharVerify.MaroGirlKey;
            }

            string reedKey = "npc";
            if (AssetRegistry.Instance != null)
            {
                AssetRegistry.Instance.Resolve(PipelineCharVerify.Key, out ResolveTier reedTier);
                if (reedTier == ResolveTier.Bespoke)
                    reedKey = PipelineCharVerify.Key;
            }

            string tovinKey = "npc";

            // 1. Pip
            PipView = new EntityView(EntityKind.Npc, pipKey);
            PipView.Root.Name = "npc-pip";
            PipView.Root.Position = PipWorldPos;
            AddChild(PipView.Root);
            PipView.Root.LookAt(PipWorldPos + new Vector3(0f, 0f, 1f), Vector3.Up);
            AttachNpcLabel(PipView.Root, "[Traveller] Pip\n[F] Speak");
            PipView.Animation.Update(true, Vector3.Zero);

            // 2. Reed
            ReedView = new EntityView(EntityKind.Npc, reedKey);
            ReedView.Root.Name = "npc-reed";
            ReedView.Root.Position = ReedWorldPos;
            AddChild(ReedView.Root);
            ReedView.Root.LookAt(ReedWorldPos + new Vector3(-1f, 0f, 0f), Vector3.Up);
            AttachNpcLabel(ReedView.Root, "[Gatekeeper] Reed");
            ReedView.Animation.Update(true, Vector3.Zero);

            // 3. Tovin
            TovinView = new EntityView(EntityKind.Npc, tovinKey);
            TovinView.Root.Name = "npc-tovin";
            TovinView.Root.Position = TovinWorldPos;
            AddChild(TovinView.Root);
            TovinView.Root.LookAt(TovinWorldPos + new Vector3(0f, 0f, -1f), Vector3.Up);
            AttachNpcLabel(TovinView.Root, "[Record Keeper] Tovin");
            TovinView.Animation.Update(true, Vector3.Zero);
        }

        private static void AttachNpcLabel(Node3D root, string labelText)
        {
            var existing = root.GetNodeOrNull<Label3D>("OverheadNameplate");
            if (existing != null)
            {
                existing.Text = labelText;
                existing.Visible = true;
            }
            else
            {
                var label = new Label3D
                {
                    Name = "OverheadNameplate",
                    Text = labelText,
                    Position = new Vector3(0f, 1.35f, 0f),
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    FontSize = 14,
                    OutlineSize = 4,
                    OutlineModulate = Colors.Black,
                    Modulate = Colors.White,
                };
                root.AddChild(label);
            }
        }

        private void BuildUi()
        {
            if (_uiLayer != null && GodotObject.IsInstanceValid(_uiLayer))
            {
                _uiLayer.QueueFree();
            }

            _uiLayer = new CanvasLayer
            {
                Name = "PocUiLayer",
                Layer = 12,
            };
            AddChild(_uiLayer);

            var rootControl = new Control
            {
                Name = "PocUiRoot",
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            rootControl.SetAnchorsPreset(Control.LayoutPreset.FullRect);
            _uiLayer.AddChild(rootControl);

            // Objective Pill (Top-Center)
            _objectivePanel = new PanelContainer
            {
                Name = "ObjectivePill",
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            _objectivePanel.SetAnchorsPreset(Control.LayoutPreset.CenterTop);
            _objectivePanel.GrowHorizontal = Control.GrowDirection.Both;
            _objectivePanel.Position = new Vector2(0, 20);

            var objStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.08f, 0.10f, 0.14f, 0.88f),
                BorderColor = new Color(0.85f, 0.65f, 0.25f, 0.85f),
                BorderWidthLeft = 1,
                BorderWidthTop = 1,
                BorderWidthRight = 1,
                BorderWidthBottom = 1,
                CornerRadiusTopLeft = 12,
                CornerRadiusTopRight = 12,
                CornerRadiusBottomLeft = 12,
                CornerRadiusBottomRight = 12,
                ContentMarginLeft = 16,
                ContentMarginRight = 16,
                ContentMarginTop = 6,
                ContentMarginBottom = 6,
            };
            _objectivePanel.AddThemeStyleboxOverride("panel", objStyle);

            _objectiveLabel = new Label
            {
                Name = "ObjectiveLabel",
                Text = ObjectiveText,
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            _objectiveLabel.AddThemeFontSizeOverride("font_size", 13);
            _objectiveLabel.AddThemeColorOverride("font_color", new Color(0.96f, 0.94f, 0.88f));
            _objectivePanel.AddChild(_objectiveLabel);
            rootControl.AddChild(_objectivePanel);

            // Dialogue Toast (Bottom-Center)
            _dialoguePanel = new PanelContainer
            {
                Name = "DialogueToast",
                MouseFilter = Control.MouseFilterEnum.Ignore,
                Visible = !string.IsNullOrEmpty(LastDialogueLine),
            };
            _dialoguePanel.SetAnchorsPreset(Control.LayoutPreset.CenterBottom);
            _dialoguePanel.GrowHorizontal = Control.GrowDirection.Both;
            _dialoguePanel.GrowVertical = Control.GrowDirection.Begin;
            _dialoguePanel.Position = new Vector2(0, -60);

            var diaStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.06f, 0.08f, 0.12f, 0.92f),
                BorderColor = new Color(0.35f, 0.50f, 0.70f, 0.75f),
                BorderWidthLeft = 1,
                BorderWidthTop = 1,
                BorderWidthRight = 1,
                BorderWidthBottom = 1,
                CornerRadiusTopLeft = 8,
                CornerRadiusTopRight = 8,
                CornerRadiusBottomLeft = 8,
                CornerRadiusBottomRight = 8,
                ContentMarginLeft = 20,
                ContentMarginRight = 20,
                ContentMarginTop = 10,
                ContentMarginBottom = 10,
            };
            _dialoguePanel.AddThemeStyleboxOverride("panel", diaStyle);

            _dialogueLabel = new Label
            {
                Name = "DialogueLabel",
                Text = LastDialogueLine,
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            _dialogueLabel.AddThemeFontSizeOverride("font_size", 14);
            _dialogueLabel.AddThemeColorOverride("font_color", new Color(0.98f, 0.98f, 1.0f));
            _dialoguePanel.AddChild(_dialogueLabel);
            rootControl.AddChild(_dialoguePanel);
        }

        private void PlayEnvironmentalIntroAudio()
        {
            AudioRegistry.Instance?.Play("sfx:bell_resonance", GreatBellWorld);
            AudioRegistry.Instance?.Play("sfx:wind_ambient", ArrivalSpawnWorld);
            EnvironmentalAudioEventsPlayed += 2;
        }

        public void StepPlayer(Vector3 playerPos, bool isMoving, double deltaSec)
        {
            if (isMoving)
            {
                _footstepTimer += deltaSec;
                if (_footstepTimer >= 0.42)
                {
                    _footstepTimer = 0.0;
                    AudioRegistry.Instance?.Play("sfx:footstep", playerPos);
                    EnvironmentalAudioEventsPlayed++;
                }
            }
            else
            {
                _footstepTimer = 0.0;
            }

            if (!PipGreeted && playerPos.DistanceTo(PipWorldPos) <= InteractionRadiusMeters)
            {
                InteractWithPip();
            }
            else if (!_reedBarkPlayed && playerPos.DistanceTo(ReedWorldPos) <= 4.0f)
            {
                _reedBarkPlayed = true;
                SetDialogue("Reed: Evening wind's coming down from the ribs. Keep to the lantern road, traveller.");
            }
            else if (!_tovinBarkPlayed && playerPos.DistanceTo(TovinWorldPos) <= 4.0f)
            {
                _tovinBarkPlayed = true;
                SetDialogue("Tovin: Sixty-five winters I've kept the kiln ledgers, and never has the brass hummed like this...");
            }
        }

        public bool InteractWithPip()
        {
            PipGreeted = true;
            ActiveBeat = "POC-01";
            LastDialogueLine = "Pip: You made it through the valley gate! Look up ahead—that's the Great Bell of Maro. Come on, Amber's waiting by the lantern workshop!";
            ObjectiveText = "Visit Amber at the Lantern Workshop (Market Bend)";

            if (_objectiveLabel != null)
                _objectiveLabel.Text = ObjectiveText;

            SetDialogue(LastDialogueLine);

            AudioRegistry.Instance?.Play("sfx:chime_soft", PipWorldPos);
            EnvironmentalAudioEventsPlayed++;
            return true;
        }

        public bool TryInteractNearest(Vector3 playerPos)
        {
            if (playerPos.DistanceTo(PipWorldPos) <= InteractionRadiusMeters)
            {
                return InteractWithPip();
            }
            if (playerPos.DistanceTo(ReedWorldPos) <= 4.0f)
            {
                SetDialogue("Reed: Evening wind's coming down from the ribs. Keep to the lantern road, traveller.");
                return true;
            }
            if (playerPos.DistanceTo(TovinWorldPos) <= 4.0f)
            {
                SetDialogue("Tovin: Sixty-five winters I've kept the kiln ledgers, and never has the brass hummed like this...");
                return true;
            }
            return false;
        }

        private void SetDialogue(string text)
        {
            LastDialogueLine = text;
            if (_dialogueLabel != null)
                _dialogueLabel.Text = text;
            if (_dialoguePanel != null)
                _dialoguePanel.Visible = !string.IsNullOrEmpty(text);
        }

        public override void _PhysicsProcess(double delta)
        {
            PipView?.Animation.Update(true, Vector3.Zero);
            ReedView?.Animation.Update(true, Vector3.Zero);
            TovinView?.Animation.Update(true, Vector3.Zero);
        }
    }
}
