using Godot;
using Colyseus;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Net;
using AtlasWorld.Client.World;
using AtlasWorld.Client.Input;
using AtlasWorld.Client.UI.Panels;

namespace AtlasWorld.Client.Core
{
    /// <summary>
    /// Scene root and composition hub (the analog of the server's GameRoom.onCreate).
    /// Builds Config, the Colyseus connection + entity sync, the input path, the camera
    /// rig, and the Nakama meta seed, and wires their dependencies. Owns no gameplay
    /// logic itself.
    /// </summary>
    public sealed partial class GameRoot : Node3D
    {
        [Export] public NodePath CameraPath = "Camera3D";
        [Export] public NodePath GroundPath = "Ground";

        private Config _config = null!;
        private EntityManager _entities = null!;
        private ColyseusConnection _connection = null!;
        private EntitySync _sync = null!;
        private InputSender _inputSender = null!;

        public override void _Ready()
        {
            _config = Config.Load();
            GD.Print($"[GameRoot] endpoint={_config.ColyseusEndpoint} room={_config.RoomName}");

            var camera = GetNode<Camera3D>(CameraPath);
            var ground = GetNodeOrNull<MeshInstance3D>(GroundPath);

            // World
            _entities = new EntityManager { Name = "EntityManager" };
            AddChild(_entities);
            AddChild(new CameraRig(camera, _entities, ground) { Name = "CameraRig" });

            // Net
            _connection = new ColyseusConnection(_config) { Name = "ColyseusConnection" };
            AddChild(_connection);
            _sync = new EntitySync(_entities);
            _inputSender = new InputSender(_connection);

            // Input
            AddChild(new PlayerController(_inputSender) { Name = "PlayerController" });

            // Meta UI (B2). The MetaGateway autoload owns all Nakama awaiting; MetaShell is
            // a pure signal-driven overlay. Toggle with Tab, close with Esc.
            AddChild(new MetaShell());

            // On every (re)connect: reset the entity pool, then (re)wire schema callbacks.
            _connection.Connected += OnConnected;

            _connection.BeginConnect();

            StartBootstrapCountLog();
        }

        private void OnConnected(Room<GameState> room)
        {
            _entities.Reset();
            _sync.Bind(room);

            // Optional headless input round-trip probe (Gate B #4): the server logs a MOVE.
            if (OS.GetEnvironment("ATLAS_DEBUG_MOVE") == "1")
            {
                _inputSender.SendMove(1f, 0f);
                GD.Print("[GameRoot] ATLAS_DEBUG_MOVE sent player_input_move {vx:1,vy:0}");
            }
        }

        // Minimal decode-health readout: prints entity counts once, a few seconds in.
        // Re-verifies that the main-thread dispatch pump actually decodes GameState.
        private void StartBootstrapCountLog()
        {
            SceneTreeTimer timer = GetTree().CreateTimer(5.0);
            timer.Timeout += () =>
            {
                Room<GameState>? room = _connection.Room;
                GameState? st = room?.State;
                int p = st?.players?.Count ?? -1;
                int m = st?.mobs?.Count ?? -1;
                int n = st?.npcs?.Count ?? -1;
                int pr = st?.projectiles?.Count ?? -1;
                int z = st?.zoneEffects?.Count ?? -1;
                GD.Print($"[GameRoot] COUNTS players={p} mobs={m} npcs={n} " +
                         $"projectiles={pr} zoneEffects={z} rendered={_entities.Count}");
            };
        }
    }
}
