using System;
using Godot;
using AtlasWorld.Client.Meta;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Dual-state responsive mobile Chat Box widget aligned to the Joymify Design System.
    /// Supports:
    /// - Collapsed Mode: Compact 1-2 line ticker banner on the bottom center (ChatTicker variant)
    /// - Expanded Mode: Full channel modal dialog (ModalDialog variant)
    /// - Mobile Virtual Keyboard height offset (lifts the chat box above the OS keyboard)
    /// - Zero hardcoded colors, 100% NativeAOT safe
    /// </summary>
    public partial class ChatBox : Control
    {
        [Export] public Control ExpandedPanel = null!;
        [Export] public Control CollapsedTicker = null!;
        [Export] public Label TickerLabel = null!;
        [Export] public Button ExpandButton = null!;
        [Export] public Button CollapseButton = null!;
        [Export] public RichTextLabel MessagesLabel = null!;
        [Export] public LineEdit InputField = null!;
        [Export] public Button SendButton = null!;

        [Signal]
        public delegate void MessageSentEventHandler(string content);

        [Signal]
        public delegate void ChatStateChangedEventHandler(bool isExpanded);

        private float _baseBottomOffset;
        public bool IsExpanded { get; private set; } = false;

        public override void _Ready()
        {
            if (InputField != null)
            {
                InputField.TextSubmitted += OnTextSubmitted;
                InputField.ClearButtonEnabled = true;
                InputField.VirtualKeyboardType = LineEdit.VirtualKeyboardTypeEnum.Default;
            }

            if (SendButton != null)
            {
                SendButton.ThemeTypeVariation = Design.Variants.PrimaryButton;
                SendButton.Pressed += OnSendPressed;
            }

            if (ExpandButton != null)
            {
                ExpandButton.ThemeTypeVariation = Design.Variants.GhostButton;
                ExpandButton.Pressed += () => SetExpanded(true);
            }

            if (CollapseButton != null)
            {
                CollapseButton.ThemeTypeVariation = Design.Variants.GhostButton;
                CollapseButton.Pressed += () => SetExpanded(false);
            }

            if (TickerLabel != null)
            {
                TickerLabel.AddThemeColorOverride("font_color", Design.Colors.TextPrimary);
            }

            if (CollapsedTicker != null)
            {
                CollapsedTicker.GuiInput += @event =>
                {
                    if (@event is InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left } ||
                        @event is InputEventScreenTouch { Pressed: true })
                    {
                        SetExpanded(true);
                    }
                };
            }

            _baseBottomOffset = Position.Y;
            SetExpanded(false);

            // Welcome announcement
            AppendSystemMessage("Atlas World Chat Ready. Tap chat bar or press Enter to talk.");
        }

        public void SetExpanded(bool expanded)
        {
            IsExpanded = expanded;
            if (ExpandedPanel != null)
            {
                ExpandedPanel.Visible = expanded;
            }
            if (CollapsedTicker != null)
            {
                CollapsedTicker.Visible = !expanded;
            }

            if (!expanded && InputField != null)
            {
                InputField.ReleaseFocus();
            }

            MetaGateway.CapturesInput = expanded;
            EmitSignal(SignalName.ChatStateChanged, expanded);
        }

        public override void _Process(double delta)
        {
            if (!IsExpanded) return;

            // Dynamically adjust for mobile on-screen keyboard
            if (OS.HasFeature("mobile"))
            {
                int keyboardHeight = DisplayServer.VirtualKeyboardGetHeight();
                if (keyboardHeight > 0)
                {
                    Vector2 windowSize = DisplayServer.WindowGetSize();
                    float scale = windowSize.Y > 0 ? GetViewportRect().Size.Y / windowSize.Y : 1.0f;
                    Position = new Vector2(Position.X, _baseBottomOffset - (keyboardHeight * scale));
                }
                else
                {
                    Position = new Vector2(Position.X, _baseBottomOffset);
                }
            }
        }

        private void OnTextSubmitted(string text) => Submit();
        private void OnSendPressed() => Submit();

        public void Submit()
        {
            if (InputField == null) return;
            string text = InputField.Text.Trim();
            if (string.IsNullOrEmpty(text))
            {
                InputField.ReleaseFocus();
                return;
            }

            AppendPlayerMessage("You", text);
            EmitSignal(SignalName.MessageSent, text);

            InputField.Clear();
            InputField.ReleaseFocus();
        }

        public void AppendPlayerMessage(string sender, string message)
        {
            string timeStr = DateTime.Now.ToString("HH:mm");
            string line = $"[color=#{Design.Palette.Sand400.ToHtml(false)}][{timeStr}][/color] [color=#{Design.Palette.Gold400.ToHtml(false)}]{sender}:[/color] {message}\n";

            if (MessagesLabel != null)
            {
                MessagesLabel.Text += line;
            }
            if (TickerLabel != null)
            {
                TickerLabel.Text = $"{sender}: {message}";
            }
        }

        public void AppendSystemMessage(string message)
        {
            string timeStr = DateTime.Now.ToString("HH:mm");
            string line = $"[color=#{Design.Palette.Sand400.ToHtml(false)}][{timeStr}][/color] [color=#{Design.Palette.Info.ToHtml(false)}][System][/color] {message}\n";

            if (MessagesLabel != null)
            {
                MessagesLabel.Text += line;
            }
            if (TickerLabel != null)
            {
                TickerLabel.Text = $"[System] {message}";
            }
        }
    }
}
