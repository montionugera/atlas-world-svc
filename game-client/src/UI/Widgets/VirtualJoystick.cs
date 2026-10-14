using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Smooth Virtual Thumbstick for mobile touch and mouse drag controls.
    /// Aligned to the Ragnarok / Joymify fantasy aesthetic:
    /// Translucent runic compass dial, gold cardinal markers, and glowing jewel knob.
    /// Clamps handle within a defined radius and outputs a normalized Vector2 direction.
    /// </summary>
    public partial class VirtualJoystick : Control
    {
        [Signal]
        public delegate void JoystickMovedEventHandler(Vector2 direction);

        [Export] public float DeadzoneRadius = 12f;
        [Export] public float ClampRadius = 75f;
        [Export] public Color BaseColor = new Color(0.06f, 0.09f, 0.14f, 0.38f);
        [Export] public Color BorderColor = new Color(0.85f, 0.72f, 0.38f, 0.65f);
        [Export] public Color HandleColor = new Color(0.22f, 0.38f, 0.62f, 0.88f);

        private Vector2 _handleOffset = Vector2.Zero;
        private bool _isPressed;
        private int _touchIndex = -1;
        private bool _usingMouse;

        public Vector2 Output { get; private set; } = Vector2.Zero;

        public override void _Ready()
        {
            CustomMinimumSize = new Vector2(ClampRadius * 2 + 24, ClampRadius * 2 + 24);
            MouseFilter = MouseFilterEnum.Stop;
        }

        public override void _GuiInput(InputEvent @event)
        {
            Vector2 center = Size * 0.5f;

            if (@event is InputEventScreenTouch touch)
            {
                if (touch.Pressed)
                {
                    if (_touchIndex == -1 && !_usingMouse)
                    {
                        _touchIndex = touch.Index;
                        _isPressed = true;
                        UpdateHandlePosition(touch.Position - center);
                        AcceptEvent();
                    }
                }
                else if (touch.Index == _touchIndex)
                {
                    ResetJoystick();
                    AcceptEvent();
                }
            }
            else if (@event is InputEventScreenDrag drag)
            {
                if (drag.Index == _touchIndex && !_usingMouse)
                {
                    UpdateHandlePosition(drag.Position - center);
                    AcceptEvent();
                }
            }
            else if (@event is InputEventMouseButton mouse && _touchIndex == -1)
            {
                if (mouse.ButtonIndex == MouseButton.Left)
                {
                    if (mouse.Pressed)
                    {
                        _isPressed = true;
                        _usingMouse = true;
                        UpdateHandlePosition(mouse.Position - center);
                        AcceptEvent();
                    }
                    else if (_usingMouse)
                    {
                        ResetJoystick();
                        AcceptEvent();
                    }
                }
            }
            else if (@event is InputEventMouseMotion motion && _usingMouse)
            {
                if (_isPressed)
                {
                    UpdateHandlePosition(motion.Position - center);
                    AcceptEvent();
                }
            }
        }

        private void UpdateHandlePosition(Vector2 rawOffset)
        {
            float dist = rawOffset.Length();
            if (dist > ClampRadius)
            {
                _handleOffset = rawOffset.Normalized() * ClampRadius;
            }
            else
            {
                _handleOffset = rawOffset;
            }

            if (dist < DeadzoneRadius)
            {
                Output = Vector2.Zero;
            }
            else
            {
                // Normalize between deadzone and clamp
                float normalizedDist = (dist - DeadzoneRadius) / (ClampRadius - DeadzoneRadius);
                Output = _handleOffset.Normalized() * Mathf.Clamp(normalizedDist, 0f, 1f);
            }

            EmitSignal(SignalName.JoystickMoved, Output);
            QueueRedraw();
        }

        private void ResetJoystick()
        {
            _isPressed = false;
            _touchIndex = -1;
            _usingMouse = false;
            _handleOffset = Vector2.Zero;
            Output = Vector2.Zero;
            EmitSignal(SignalName.JoystickMoved, Vector2.Zero);
            QueueRedraw();
        }

        public override void _Draw()
        {
            Vector2 center = Size * 0.5f;

            // 1. Translucent Runic Dial Disc
            DrawCircle(center, ClampRadius, BaseColor);

            // 2. Concentric Runic Rings
            DrawArc(center, ClampRadius, 0, Mathf.Tau, 48, BorderColor, 2.0f, true);
            DrawArc(center, ClampRadius * 0.72f, 0, Mathf.Tau, 36, new Color(BorderColor, 0.35f), 1.0f, true);
            DrawArc(center, DeadzoneRadius, 0, Mathf.Tau, 24, new Color(BorderColor, 0.25f), 1.0f, true);

            // 3. 4-Way Compass Cardinal Notches (N, S, E, W)
            float tickLen = 6f;
            Color tickColor = new Color(0.95f, 0.85f, 0.45f, 0.75f);
            DrawLine(center + new Vector2(0, -ClampRadius - 2), center + new Vector2(0, -ClampRadius + tickLen), tickColor, 2f, true);
            DrawLine(center + new Vector2(0, ClampRadius + 2), center + new Vector2(0, ClampRadius - tickLen), tickColor, 2f, true);
            DrawLine(center + new Vector2(-ClampRadius - 2, 0), center + new Vector2(-ClampRadius + tickLen, 0), tickColor, 2f, true);
            DrawLine(center + new Vector2(ClampRadius + 2, 0), center + new Vector2(ClampRadius - tickLen, 0), tickColor, 2f, true);

            // 4. Directional Line when dragging
            Vector2 handlePos = center + _handleOffset;
            if (_handleOffset.LengthSquared() > 10f)
            {
                DrawLine(center, handlePos, new Color(BorderColor, 0.45f), 2.0f, true);
            }

            // 5. Thumbstick Knob (Layered Jewel with Gold Rim)
            float handleRadius = _isPressed ? 26f : 22f;

            // Shadow
            DrawCircle(handlePos + new Vector2(0, 3), handleRadius, new Color(0f, 0f, 0f, 0.4f));

            // Outer metallic rim
            Color goldRim = _isPressed ? new Color(1f, 0.92f, 0.55f, 1f) : new Color(0.92f, 0.78f, 0.4f, 0.95f);
            DrawCircle(handlePos, handleRadius, goldRim);

            // Inner Jewel Core
            Color coreColor = _isPressed ? new Color(0.28f, 0.48f, 0.82f, 1f) : new Color(0.18f, 0.28f, 0.52f, 0.95f);
            DrawCircle(handlePos, handleRadius - 2.5f, coreColor);

            // Jewel Highlight Glint
            DrawCircle(handlePos + new Vector2(-handleRadius * 0.25f, -handleRadius * 0.25f), handleRadius * 0.35f, new Color(0.6f, 0.8f, 1f, 0.5f));
            DrawCircle(handlePos, 3f, new Color(1f, 0.95f, 0.8f, 0.9f));
        }
    }
}
