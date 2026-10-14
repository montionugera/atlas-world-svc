using System;
using System.IO;
using System.Text.Json;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Live in-game tuning drawer for rapid macOS &amp; mobile iteration (0s rebuild).
    /// Toggle with Backquote (`) / F10 or the left-side "TUNE [`]" pill below StatusLabel.
    /// Supports real-time sliders for Camera Pitch/Distance/FOV, Player Speed,
    /// Melee Auto-Approach Range, UI Safe-Area Inset, Action Cluster Scale,
    /// Auto-Combat toggle, and saves/hot-reloads <c>assets/tuning.json</c>.
    /// </summary>
    public sealed partial class DevTuningDrawer : Control
    {
        public sealed class TuningValues
        {
            public float CameraPitch { get; set; } = 0.56f;
            public float CameraDistance { get; set; } = 6.2f;
            public float CameraFov { get; set; } = 60.0f;
            public float PlayerSpeed { get; set; } = 4.6f;
            public float MeleeRange { get; set; } = 3.5f;
            public float SafeAreaInset { get; set; } = 18.0f;
            public float ActionClusterScale { get; set; } = 1.0f;
        }

        public event Action<TuningValues>? ValuesChanged;
        public event Action? AutoCombatToggleRequested;

        private readonly TuningValues _values = new();
        private PanelContainer _drawerPanel = null!;
        private Button _toggleButton = null!;
        private Label _statusText = null!;
        private string _diskJsonPath = "";
        private DateTime _lastFileWriteUtc = DateTime.MinValue;
        private double _fileWatchAccum = 0.0;
        private bool _suppressCallbacks = false;

        private HSlider? _pitchSlider;
        private Label? _pitchValueLabel;
        private HSlider? _distSlider;
        private Label? _distValueLabel;
        private HSlider? _fovSlider;
        private Label? _fovValueLabel;
        private HSlider? _speedSlider;
        private Label? _speedValueLabel;
        private HSlider? _rangeSlider;
        private Label? _rangeValueLabel;
        private HSlider? _insetSlider;
        private Label? _insetValueLabel;
        private HSlider? _scaleSlider;
        private Label? _scaleValueLabel;

        public TuningValues Current => _values;

        public override void _Ready()
        {
            SetAnchorsPreset(LayoutPreset.FullRect);
            MouseFilter = MouseFilterEnum.Ignore;

            _diskJsonPath = ProjectSettings.GlobalizePath("res://assets/tuning.json");
            LoadFromDisk(announce: false);

            // Left-side compact toggle pill right below StatusLabel (never overlaps TargetFrame)
            _toggleButton = new Button
            {
                Name = "DevTuneToggleBtn",
                Text = "⚙ TUNE [`]",
                CustomMinimumSize = new Vector2(92, 24),
                LayoutMode = 0,
                OffsetLeft = 18f,
                OffsetTop = 212f,
                OffsetRight = 110f,
                OffsetBottom = 236f
            };
            _toggleButton.AddThemeFontSizeOverride("font_size", 10);

            var pillStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.06f, 0.09f, 0.14f, 0.90f),
                BorderColor = new Color(0.95f, 0.82f, 0.38f, 0.88f),
                BorderWidthLeft = 1,
                BorderWidthTop = 1,
                BorderWidthRight = 1,
                BorderWidthBottom = 1,
                CornerRadiusTopLeft = 10,
                CornerRadiusTopRight = 10,
                CornerRadiusBottomLeft = 10,
                CornerRadiusBottomRight = 10
            };
            _toggleButton.AddThemeStyleboxOverride("normal", pillStyle);
            _toggleButton.Pressed += ToggleDrawer;
            AddChild(_toggleButton);

            // Collapsible drawer panel docked below TargetFrame on the upper-right / center-right
            _drawerPanel = new PanelContainer
            {
                Name = "DrawerPanel",
                Visible = OS.GetEnvironment("ATLAS_OPEN_TUNING") == "1",
                CustomMinimumSize = new Vector2(300, 290),
                LayoutMode = 1
            };
            _drawerPanel.LayoutMode = 0;
            _drawerPanel.OffsetLeft = 120f;
            _drawerPanel.OffsetTop = 212f;
            _drawerPanel.OffsetRight = 424f;
            _drawerPanel.OffsetBottom = 506f;

            var panelStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.05f, 0.07f, 0.11f, 0.94f),
                BorderColor = new Color(0.92f, 0.78f, 0.35f, 0.92f),
                BorderWidthLeft = 2,
                BorderWidthTop = 2,
                BorderWidthRight = 2,
                BorderWidthBottom = 2,
                CornerRadiusTopLeft = 10,
                CornerRadiusTopRight = 10,
                CornerRadiusBottomLeft = 10,
                CornerRadiusBottomRight = 10,
                ContentMarginLeft = 12,
                ContentMarginRight = 12,
                ContentMarginTop = 10,
                ContentMarginBottom = 10
            };
            _drawerPanel.AddThemeStyleboxOverride("panel", panelStyle);
            AddChild(_drawerPanel);

            var vbox = new VBoxContainer();
            vbox.AddThemeConstantOverride("separation", 5);
            _drawerPanel.AddChild(vbox);

            var title = new Label
            {
                Text = "LIVE TUNING (Hot-Reloads tuning.json)",
                HorizontalAlignment = HorizontalAlignment.Center
            };
            title.AddThemeFontSizeOverride("font_size", 11);
            title.AddThemeColorOverride("font_color", new Color(1.0f, 0.88f, 0.42f, 1f));
            vbox.AddChild(title);

            (_pitchSlider, _pitchValueLabel) = AddSliderRow(vbox, "Cam Pitch", 0.25f, 1.15f, 0.01f, _values.CameraPitch, v =>
            {
                _values.CameraPitch = v;
                NotifyChanged();
            });
            (_distSlider, _distValueLabel) = AddSliderRow(vbox, "Cam Dist", 3.5f, 11.0f, 0.1f, _values.CameraDistance, v =>
            {
                _values.CameraDistance = v;
                NotifyChanged();
            });
            (_fovSlider, _fovValueLabel) = AddSliderRow(vbox, "Cam FOV", 42.0f, 80.0f, 1.0f, _values.CameraFov, v =>
            {
                _values.CameraFov = v;
                NotifyChanged();
            });
            (_speedSlider, _speedValueLabel) = AddSliderRow(vbox, "Move Speed", 2.5f, 10.0f, 0.1f, _values.PlayerSpeed, v =>
            {
                _values.PlayerSpeed = v;
                NotifyChanged();
            });
            (_rangeSlider, _rangeValueLabel) = AddSliderRow(vbox, "Melee Range", 1.8f, 6.0f, 0.1f, _values.MeleeRange, v =>
            {
                _values.MeleeRange = v;
                NotifyChanged();
            });
            (_insetSlider, _insetValueLabel) = AddSliderRow(vbox, "Safe Inset", 8.0f, 56.0f, 1.0f, _values.SafeAreaInset, v =>
            {
                _values.SafeAreaInset = v;
                NotifyChanged();
            });
            (_scaleSlider, _scaleValueLabel) = AddSliderRow(vbox, "Skill Scale", 0.75f, 1.25f, 0.02f, _values.ActionClusterScale, v =>
            {
                _values.ActionClusterScale = v;
                NotifyChanged();
            });

            var btnRow = new HBoxContainer { Alignment = BoxContainer.AlignmentMode.Center };
            btnRow.AddThemeConstantOverride("separation", 8);
            vbox.AddChild(btnRow);

            var autoBtn = new Button { Text = "Toggle AUTO [Z]", CustomMinimumSize = new Vector2(92, 24) };
            autoBtn.AddThemeFontSizeOverride("font_size", 10);
            autoBtn.Pressed += () => AutoCombatToggleRequested?.Invoke();
            btnRow.AddChild(autoBtn);

            var saveBtn = new Button { Text = "Save JSON", CustomMinimumSize = new Vector2(78, 24) };
            saveBtn.AddThemeFontSizeOverride("font_size", 10);
            saveBtn.Pressed += SaveToDisk;
            btnRow.AddChild(saveBtn);

            var resetBtn = new Button { Text = "Reset", CustomMinimumSize = new Vector2(58, 24) };
            resetBtn.AddThemeFontSizeOverride("font_size", 10);
            resetBtn.Pressed += ResetDefaults;
            btnRow.AddChild(resetBtn);

            _statusText = new Label
            {
                Text = "Edit assets/tuning.json or drag sliders (0s rebuild)",
                HorizontalAlignment = HorizontalAlignment.Center
            };
            _statusText.AddThemeFontSizeOverride("font_size", 9);
            _statusText.AddThemeColorOverride("font_color", new Color(0.55f, 0.92f, 0.68f, 0.95f));
            vbox.AddChild(_statusText);
        }

        public void SetLeftInset(float leftInset)
        {
            if (_toggleButton != null)
            {
                _toggleButton.OffsetLeft = leftInset;
                _toggleButton.OffsetRight = leftInset + 92f;
            }
            if (_drawerPanel != null)
            {
                _drawerPanel.OffsetLeft = leftInset + 102f;
                _drawerPanel.OffsetRight = leftInset + 406f;
            }
        }

        public void ToggleDrawer()
        {
            if (_drawerPanel != null)
            {
                _drawerPanel.Visible = !_drawerPanel.Visible;
            }
        }

        public override void _Process(double delta)
        {
            _fileWatchAccum += delta;
            if (_fileWatchAccum < 0.25)
                return;
            _fileWatchAccum = 0.0;

            try
            {
                if (!string.IsNullOrEmpty(_diskJsonPath) && File.Exists(_diskJsonPath))
                {
                    DateTime writeUtc = File.GetLastWriteTimeUtc(_diskJsonPath);
                    if (_lastFileWriteUtc != DateTime.MinValue && writeUtc > _lastFileWriteUtc)
                    {
                        LoadFromDisk(announce: true);
                    }
                    _lastFileWriteUtc = writeUtc;
                }
            }
            catch
            {
                // Ignore transient file-write lock while editor saves
            }
        }

        private (HSlider slider, Label valLabel) AddSliderRow(
            VBoxContainer parent,
            string labelText,
            float min,
            float max,
            float step,
            float initial,
            Action<float> onChanged)
        {
            var row = new HBoxContainer();
            row.AddThemeConstantOverride("separation", 6);
            parent.AddChild(row);

            var lbl = new Label
            {
                Text = labelText,
                CustomMinimumSize = new Vector2(78, 18)
            };
            lbl.AddThemeFontSizeOverride("font_size", 10);
            row.AddChild(lbl);

            var slider = new HSlider
            {
                MinValue = min,
                MaxValue = max,
                Step = step,
                Value = initial,
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(125, 18)
            };
            row.AddChild(slider);

            var valLabel = new Label
            {
                Text = $"{initial:0.00}",
                CustomMinimumSize = new Vector2(40, 18),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            valLabel.AddThemeFontSizeOverride("font_size", 10);
            row.AddChild(valLabel);

            slider.ValueChanged += val =>
            {
                float fv = (float)val;
                valLabel.Text = $"{fv:0.00}";
                if (!_suppressCallbacks)
                {
                    onChanged(fv);
                }
            };

            return (slider, valLabel);
        }

        private void SyncSlidersFromValues()
        {
            _suppressCallbacks = true;
            if (_pitchSlider != null) _pitchSlider.Value = _values.CameraPitch;
            if (_pitchValueLabel != null) _pitchValueLabel.Text = $"{_values.CameraPitch:0.00}";
            if (_distSlider != null) _distSlider.Value = _values.CameraDistance;
            if (_distValueLabel != null) _distValueLabel.Text = $"{_values.CameraDistance:0.00}";
            if (_fovSlider != null) _fovSlider.Value = _values.CameraFov;
            if (_fovValueLabel != null) _fovValueLabel.Text = $"{_values.CameraFov:0.00}";
            if (_speedSlider != null) _speedSlider.Value = _values.PlayerSpeed;
            if (_speedValueLabel != null) _speedValueLabel.Text = $"{_values.PlayerSpeed:0.00}";
            if (_rangeSlider != null) _rangeSlider.Value = _values.MeleeRange;
            if (_rangeValueLabel != null) _rangeValueLabel.Text = $"{_values.MeleeRange:0.00}";
            if (_insetSlider != null) _insetSlider.Value = _values.SafeAreaInset;
            if (_insetValueLabel != null) _insetValueLabel.Text = $"{_values.SafeAreaInset:0.00}";
            if (_scaleSlider != null) _scaleSlider.Value = _values.ActionClusterScale;
            if (_scaleValueLabel != null) _scaleValueLabel.Text = $"{_values.ActionClusterScale:0.00}";
            _suppressCallbacks = false;
        }

        private void NotifyChanged()
        {
            ValuesChanged?.Invoke(_values);
        }

        private void ResetDefaults()
        {
            _values.CameraPitch = 0.56f;
            _values.CameraDistance = 6.2f;
            _values.CameraFov = 60.0f;
            _values.PlayerSpeed = 4.6f;
            _values.MeleeRange = 3.5f;
            _values.SafeAreaInset = 18.0f;
            _values.ActionClusterScale = 1.0f;
            SyncSlidersFromValues();
            NotifyChanged();
            if (_statusText != null) _statusText.Text = "Reset to default ROX mobile parameters";
        }

        public void LoadFromDisk(bool announce)
        {
            try
            {
                string json = "";
                if (!string.IsNullOrEmpty(_diskJsonPath) && File.Exists(_diskJsonPath))
                {
                    json = File.ReadAllText(_diskJsonPath);
                    _lastFileWriteUtc = File.GetLastWriteTimeUtc(_diskJsonPath);
                }
                else if (Godot.FileAccess.FileExists("res://assets/tuning.json"))
                {
                    using var f = Godot.FileAccess.Open("res://assets/tuning.json", Godot.FileAccess.ModeFlags.Read);
                    if (f != null) json = f.GetAsText();
                }

                if (string.IsNullOrWhiteSpace(json))
                    return;

                var loaded = JsonSerializer.Deserialize<TuningValues>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (loaded != null)
                {
                    _values.CameraPitch = loaded.CameraPitch;
                    _values.CameraDistance = loaded.CameraDistance;
                    _values.CameraFov = loaded.CameraFov;
                    _values.PlayerSpeed = loaded.PlayerSpeed;
                    _values.MeleeRange = loaded.MeleeRange;
                    _values.SafeAreaInset = loaded.SafeAreaInset;
                    _values.ActionClusterScale = loaded.ActionClusterScale;
                    SyncSlidersFromValues();
                    NotifyChanged();
                    if (announce && _statusText != null)
                    {
                        _statusText.Text = $"Hot-reloaded tuning.json ({DateTime.Now:HH:mm:ss})";
                    }
                }
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[DevTuningDrawer] Failed to load tuning.json: {ex.Message}");
            }
        }

        private void SaveToDisk()
        {
            try
            {
                string json = JsonSerializer.Serialize(_values, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                if (!string.IsNullOrEmpty(_diskJsonPath))
                {
                    File.WriteAllText(_diskJsonPath, json);
                    _lastFileWriteUtc = File.GetLastWriteTimeUtc(_diskJsonPath);
                    if (_statusText != null)
                    {
                        _statusText.Text = $"Saved to assets/tuning.json ({DateTime.Now:HH:mm:ss})";
                    }
                }
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[DevTuningDrawer] Failed to save tuning.json: {ex.Message}");
            }
        }
    }
}
