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

        private ProgressBar _hpBar = null!;
        private Label _nameLabel = null!;
        private Label _hpLabel = null!;
        private Label _segmentLabel = null!;
        private Control _avatarCircle = null!;
        private float _hitFlash = 0f;

        public override void _Ready()
        {
            CustomMinimumSize = new Vector2(380, 56);

            _hpBar = GetNodeOrNull<ProgressBar>("Container/BarBox/HpBar")!;
            _nameLabel = GetNodeOrNull<Label>("Container/BarBox/InfoRow/NameLabel")!;
            _hpLabel = GetNodeOrNull<Label>("Container/BarBox/HpBar/HpLabel")!;
            _segmentLabel = GetNodeOrNull<Label>("Container/BarBox/InfoRow/SegmentLabel")!;
            _avatarCircle = GetNodeOrNull<Control>("Container/AvatarFrame")!;

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
                _nameLabel.Text = $"{TargetName}  [{TitleBadge}]";
            }

            if (_hpBar != null)
            {
                _hpBar.MaxValue = MaxHp;
                _hpBar.Value = CurrentHp;
            }

            if (_hpLabel != null)
            {
                float pct = MaxHp > 0 ? (float)CurrentHp / MaxHp * 100f : 0f;
                _hpLabel.Text = $"{CurrentHp:N0} / {MaxHp:N0} ({pct:0.0}%)";
            }

            if (_segmentLabel != null)
            {
                _segmentLabel.Text = $"x{BarSegments}  [{ElementType}]";
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
    }
}
