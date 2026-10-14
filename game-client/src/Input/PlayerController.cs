using Godot;
using AtlasWorld.Client.Net;

namespace AtlasWorld.Client.Input
{
    /// <summary>
    /// Desktop keyboard controller: WASD / arrows → a normalized move vector →
    /// <see cref="InputSender.SendMove"/>, send-on-change only (the server holds the last
    /// input until it changes). Sends INTENTS only — never a position.
    ///
    /// Includes UI Focus Guard: when chat or form input has focus, movement and skill
    /// triggers are suppressed.
    /// </summary>
    public sealed partial class PlayerController : Node
    {
        private readonly InputSender _input;
        private readonly World.EntityManager _entities;

        // Headless probe (ATLAS_DEBUG_MOVE=1): behave exactly as if →/D were held, so
        // measurements exercise the real input path (send-on-change + intent gate).
        private readonly bool _debugAutoMove = OS.GetEnvironment("ATLAS_DEBUG_MOVE") == "1";
        private float _lastVx;
        private float _lastVy;
        private bool _hasSent;

        private static readonly Key[] Left = { Key.A, Key.Left };
        private static readonly Key[] Right = { Key.D, Key.Right };
        private static readonly Key[] Up = { Key.W, Key.Up };
        private static readonly Key[] Down = { Key.S, Key.Down };

        public PlayerController(InputSender input, World.EntityManager entities)
        {
            _input = input;
            _entities = entities;
        }

        /// <summary>
        /// Called by GameRoot on every (re)join: sends before a room exists are silently
        /// dropped (Room?.Send), and a fresh room starts with zero input server-side — so
        /// forget the dedup state and let the next frame re-send the current intent.
        /// </summary>
        public void NotifyJoined() => _hasSent = false;

        public override void _Process(double delta)
        {
            // Gate input: If any UI form input (LineEdit, TextEdit) has focus, suppress gameplay movement
            var focusOwner = GetViewport()?.GuiGetFocusOwner();
            if (focusOwner is LineEdit or TextEdit)
            {
                if (_hasSent && (_lastVx != 0f || _lastVy != 0f))
                {
                    _entities.SetLocalMoveHeld(false);
                    _lastVx = 0f;
                    _lastVy = 0f;
                    _input.SendMove(0f, 0f);
                }
                return;
            }

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

            if (_debugAutoMove)
            {
                vx = 1f;
                vy = 0f;
            }

            // Local intent gates the own player's dead reckoning (instant stop on release).
            _entities.SetLocalMoveHeld(vx != 0f || vy != 0f);

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
            var focusOwner = GetViewport()?.GuiGetFocusOwner();
            if (focusOwner is LineEdit or TextEdit)
                return;

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
