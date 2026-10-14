using System;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Iconic Ragnarok bottom-screen dual EXP bar (Base Lv & Job Lv).
    /// Grounding widget spanning the bottom edge of the HUD.
    /// </summary>
    public partial class ExpBar : Control
    {
        [Export] public int BaseLevel { get; set; } = 90;
        [Export] public float BaseExpPercent { get; set; } = 78.4f;
        [Export] public int JobLevel { get; set; } = 50;
        [Export] public float JobExpPercent { get; set; } = 52.1f;

        private ProgressBar _baseBar = null!;
        private ProgressBar _jobBar = null!;
        private Label _baseLabel = null!;
        private Label _jobLabel = null!;

        public override void _Ready()
        {
            _baseBar = GetNodeOrNull<ProgressBar>("HBox/BaseContainer/BaseBar")!;
            _jobBar = GetNodeOrNull<ProgressBar>("HBox/JobContainer/JobBar")!;
            _baseLabel = GetNodeOrNull<Label>("HBox/BaseContainer/BaseLabel")!;
            _jobLabel = GetNodeOrNull<Label>("HBox/JobContainer/JobLabel")!;

            UpdateDisplay();
        }

        public void UpdateDisplay()
        {
            if (_baseBar != null) _baseBar.Value = BaseExpPercent;
            if (_jobBar != null) _jobBar.Value = JobExpPercent;

            if (_baseLabel != null)
                _baseLabel.Text = $"Base Lv.{BaseLevel}  [{BaseExpPercent:0.0}%]";

            if (_jobLabel != null)
                _jobLabel.Text = $"Job Lv.{JobLevel}  [{JobExpPercent:0.0}%]";
        }
    }
}
