using System;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Iconic Ragnarok bottom-screen dual EXP bar (Base Lv &amp; Job Lv) with 10%-tick graduations.
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

            if (_baseBar != null)
            {
                var ticks = new ExpBarTickOverlay { MouseFilter = MouseFilterEnum.Ignore };
                ticks.SetAnchorsPreset(LayoutPreset.FullRect);
                _baseBar.AddChild(ticks);
            }
            if (_jobBar != null)
            {
                var ticks = new ExpBarTickOverlay { MouseFilter = MouseFilterEnum.Ignore };
                ticks.SetAnchorsPreset(LayoutPreset.FullRect);
                _jobBar.AddChild(ticks);
            }

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

        private sealed partial class ExpBarTickOverlay : Control
        {
            public override void _Draw()
            {
                Vector2 sz = Size;
                if (sz.X <= 10f || sz.Y <= 2f)
                    return;

                // Top specular gloss strip
                DrawRect(new Rect2(0f, 0f, sz.X, sz.Y * 0.30f), new Color(1f, 1f, 1f, 0.14f), true);

                // 10% graduation tick marks across the EXP bar (ROO signature detail)
                for (int i = 1; i <= 9; i++)
                {
                    float x = sz.X * (i / 10.0f);
                    DrawLine(new Vector2(x, 1f), new Vector2(x, sz.Y - 1f), new Color(0f, 0f, 0f, 0.45f), 1.0f);
                }
            }
        }
    }
}
