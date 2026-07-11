namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// The ONLY class permitted to call <c>room.Send</c>. Its surface is exactly the
    /// set of message types the server's <c>PlayerInputHandler</c> registers — nothing
    /// here can send a position or an hp value, so server-authority holds by construction
    /// (the client sends input INTENTS only).
    ///
    /// Registered server contract (colyseus-server/.../PlayerInputHandler.ts):
    ///   player_input_move      { vx, vy }
    ///   player_input_action    { action, pressed, [skillId, x, y] }
    ///   player_toggle_bot      { enabled }
    ///   player_switch_weapon   { weaponId }
    ///   player_request_equipment  (no payload)
    ///   player_request_loadout    (no payload)
    /// </summary>
    public sealed class InputSender
    {
        private readonly ColyseusConnection _connection;

        public InputSender(ColyseusConnection connection)
        {
            _connection = connection;
        }

        /// <summary>Normalized move vector (server holds the last value until it changes).</summary>
        public void SendMove(float vx, float vy) =>
            _connection.Room?.Send("player_input_move", new { vx, vy });

        /// <summary>Discrete action press/release (e.g. an attack toggle).</summary>
        public void SendAction(string action, bool pressed) =>
            _connection.Room?.Send("player_input_action", new { action, pressed });

        /// <summary>Cast a skill at an optional world target (action = "useSkill").</summary>
        public void SendUseSkill(string skillId, float x, float y) =>
            _connection.Room?.Send("player_input_action",
                new { action = "useSkill", pressed = true, skillId, x, y });

        public void SendToggleBot(bool enabled) =>
            _connection.Room?.Send("player_toggle_bot", new { enabled });

        public void SendSwitchWeapon(string weaponId) =>
            _connection.Room?.Send("player_switch_weapon", new { weaponId });

        public void RequestEquipment() =>
            _connection.Room?.Send("player_request_equipment");

        public void RequestLoadout() =>
            _connection.Room?.Send("player_request_loadout");
    }
}
