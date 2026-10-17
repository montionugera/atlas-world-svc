using System;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Top-center target boss frame authentically matching Ragnarok Origin (ROX) boss display.
    /// Reference: Lv.60 Drake with segmented HP bar, element badge, and MVP boss insignia.
    /// </summary>
    public partial class TargetFrame : Control
    {
        [Signal] public delegate void TargetDismissedEventHandler();

        [Export] public string TargetName { get; set; } = "Lv.60 Drake";
        [Export] public string TitleBadge { get; set; } = "MVP Boss";
        [Export] public string ElementType { get; set; } = "Undead / Water";
        [Export] public long CurrentHp { get; set; } = 1280000;
        [Export] public long MaxHp { get; set; } = 1500000;
        [Export] public int BarSegments { get; set; } = 4;

        private ProgressBar? _hpBar;
        private Label? _nameLabel;
        private Label? _hpLabel;
        private Label? _segmentLabel;
        private Control? _avatarCircle;
        private float _hitFlash = 0f;

        public override void _Ready()
        {
            CustomMinimumSize = new Vector2(390, 58);

            _hpBar = GetNodeOrNull<ProgressBar>("Container/HBox/BarBox/HpBar")
                     ?? GetNodeOrNull<ProgressBar>("Container/BarBox/HpBar");
            _nameLabel = GetNodeOrNull<Label>("Container/HBox/BarBox/InfoRow/NameLabel")
                         ?? GetNodeOrNull<Label>("Container/BarBox/InfoRow/NameLabel");
            _hpLabel = GetNodeOrNull<Label>("Container/HBox/BarBox/HpBar/HpLabel")
                       ?? GetNodeOrNull<Label>("Container/BarBox/HpBar/HpLabel");
            _segmentLabel = GetNodeOrNull<Label>("Container/HBox/BarBox/InfoRow/SegmentLabel")
                            ?? GetNodeOrNull<Label>("Container/BarBox/InfoRow/SegmentLabel");
            _avatarCircle = GetNodeOrNull<Control>("Container/HBox/AvatarFrame")
                            ?? GetNodeOrNull<Control>("Container/AvatarFrame");

            if (_hpBar != null)
            {
                var overlay = new HpBarSegmentOverlay(this)
                {
                    Name = "SegmentOverlay",
                    MouseFilter = MouseFilterEnum.Ignore
                };
                overlay.SetAnchorsPreset(LayoutPreset.FullRect);
                _hpBar.AddChild(overlay);
            }

            UpdateDisplay();
        }

        public void ApplyDamage(long damage)
        {
            CurrentHp = Math.Max(0, CurrentHp - damage);
            _hitFlash = 0.25f;
            UpdateDisplay();

            // Subtle shake effect
            var tween = CreateTween();
            tween.TweenProperty(this, "position:y", Position.Y + 3f, 0.05);
            tween.TweenProperty(this, "position:y", Position.Y, 0.08);
        }

        public void UpdateDisplay()
        {
            if (_nameLabel != null)
            {
                string crownPrefix = TitleBadge.Contains("MVP") ? "♛ " : "◈ ";
                _nameLabel.Text = $"{crownPrefix}{TargetName}  [{TitleBadge}]";
            }

            if (_hpBar != null)
            {
                _hpBar.MaxValue = Math.Max(1, MaxHp);
                _hpBar.Value = Math.Clamp(CurrentHp, 0, MaxHp);
                _hpBar.GetNodeOrNull<Control>("SegmentOverlay")?.QueueRedraw();
            }

            if (_hpLabel != null)
            {
                float pct = MaxHp > 0 ? (float)CurrentHp / MaxHp * 100f : 0f;
                _hpLabel.Text = $"{CurrentHp:N0} / {MaxHp:N0} ({pct:0.0}%)";
            }

            if (_segmentLabel != null)
            {
                _segmentLabel.Text = $"[{ElementType}]  ×{BarSegments}";
            }

            QueueRedraw();
        }

        public override void _Process(double delta)
        {
            if (_hitFlash > 0f)
            {
                _hitFlash -= (float)delta;
                QueueRedraw();
            }
        }

        private sealed partial class HpBarSegmentOverlay : Control
        {
            private readonly TargetFrame _owner;

            public HpBarSegmentOverlay(TargetFrame owner)
            {
                _owner = owner;
            }

            public override void _Draw()
            {
                Vector2 sz = Size;
                if (sz.X <= 4f || sz.Y <= 4f)
                    return;

                // Top glossy specular highlight band across the boss HP bar
                DrawRect(new Rect2(2f, 1.5f, sz.X - 4f, sz.Y * 0.32f), new Color(1f, 1f, 1f, 0.18f), true);

                // Quarter segment notch dividers (ROO style)
                for (int i = 1; i <= 3; i++)
                {
                    float x = sz.X * (i / 4.0f);
                    DrawLine(new Vector2(x, 1f), new Vector2(x, sz.Y - 1f), new Color(0.05f, 0.02f, 0.02f, 0.55f), 1.2f);
                }

                if (_owner._hitFlash > 0f)
                {
                    float alpha = Mathf.Clamp(_owner._hitFlash * 2.2f, 0f, 0.55f);
                    DrawRect(new Rect2(Vector2.Zero, sz), new Color(1f, 0.92f, 0.75f, alpha), true);
                }
            }
        }
    }
}
