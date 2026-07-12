using Godot;
using AtlasWorld.Client.Net;

namespace AtlasWorld.Client.Input
{
    /// <summary>
    /// Desktop keyboard controller: WASD / arrows → a normalized move vector →
    /// <see cref="InputSender.SendMove"/>, send-on-change only (the server holds the last
    /// input until it changes). Sends INTENTS only — never a position.
    ///
    /// TODO (Phase B2, STRETCH): migrate to Godot InputMap actions so keyboard / gamepad
    /// / touch resolve to the same intents, and add a touch-only VirtualJoystick.tscn for
    /// mobile that feeds the same SendMove. Kept as raw physical-key polling here (the
    /// spike-proven path) to carry the vertical slice without InputMap project config.
    /// </summary>
    public sealed partial class PlayerController : Node
    {
        private readonly InputSender _input;
        private float _lastVx;
        private float _lastVy;
        private bool _hasSent;

        private static readonly Key[] Left = { Key.A, Key.Left };
        private static readonly Key[] Right = { Key.D, Key.Right };
        private static readonly Key[] Up = { Key.W, Key.Up };
        private static readonly Key[] Down = { Key.S, Key.Down };

        public PlayerController(InputSender input)
        {
            _input = input;
        }

        public override void _Process(double delta)
        {
            float vx = 0f, vy = 0f;
            if (AnyPressed(Left)) vx -= 1f;
            if (AnyPressed(Right)) vx += 1f;
            if (AnyPressed(Up)) vy -= 1f;
            if (AnyPressed(Down)) vy += 1f;

            if (vx != 0f && vy != 0f) // normalize diagonals
            {
                vx *= 0.7071f;
                vy *= 0.7071f;
            }

            if (!_hasSent || vx != _lastVx || vy != _lastVy)
            {
                _hasSent = true;
                _lastVx = vx;
                _lastVy = vy;
                _input.SendMove(vx, vy);
            }
        }

        // Discrete actions — skills (1-4 + Shift dash) and respawn (R). Edge-triggered
        // so each key press fires once. Intents only; the server owns all outcomes.
        public override void _UnhandledInput(InputEvent @event)
        {
            if (@event is not InputEventKey k || !k.Pressed || k.Echo)
                return;

            switch (k.PhysicalKeycode)
            {
                case Key.Key1: _input.SendCastSkill("skill_1"); break;
                case Key.Key2: _input.SendCastSkill("skill_2"); break;
                case Key.Key3: _input.SendCastSkill("skill_3"); break;
                case Key.Key4: _input.SendCastSkill("skill_4"); break;
                case Key.Shift: _input.SendCastSkill("skill_dash"); break;
                case Key.R: _input.SendRespawn(); break;
            }
        }

        private static bool AnyPressed(Key[] keys)
        {
            foreach (Key k in keys)
                if (Godot.Input.IsPhysicalKeyPressed(k))
                    return true;
            return false;
        }
    }
}
