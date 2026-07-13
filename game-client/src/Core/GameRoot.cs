using Godot;
using Colyseus;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Net;
using AtlasWorld.Client.World;
using AtlasWorld.Client.Input;
using AtlasWorld.Client.UI.Panels;
using AtlasWorld.Client.Content;

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

        private Config _config = null!;
        private EntityManager _entities = null!;
        private ColyseusConnection _connection = null!;
        private EntitySync _sync = null!;
        private InputSender _inputSender = null!;
        private MapVisuals _mapVisuals = null!;
        private MapPickerPanel _mapPicker = null!;
        private PlayerController _playerController = null!;

        public override void _Ready()
        {
            // Env-gated offline verify probe (ATLAS_VERIFY_MANIFEST=1): exercises the
            // AssetManifest loader against fixtures, prints PASS/FAIL, and quits BEFORE
            // any networking. Lets CI/headless prove the loader without a live server.
            if (OS.GetEnvironment("ATLAS_VERIFY_MANIFEST") == "1")
            {
                int code = ManifestVerify.Run();
                GetTree().Quit(code);
                return;
            }

            // Env-gated offline verify probe (ATLAS_VERIFY_REGISTRY=1): exercises the
            // AssetRegistry three-tier resolve against fixtures, prints PASS/FAIL, and quits
            // BEFORE any networking. Proves bespoke→seed→capsule fallback without a server.
            if (OS.GetEnvironment("ATLAS_VERIFY_REGISTRY") == "1")
            {
                int code = RegistryVerify.Run();
                GetTree().Quit(code);
                return;
            }

            // Env-gated offline verify probe (ATLAS_VERIFY_ENTITYVIEW=1): spawns entities via
            // the real EntityManager and proves the specific server type id is threaded into
            // AssetRegistry.Resolve (capsule fallback under the empty manifest), then quits
            // BEFORE any networking. Proves Task 4 wiring without a live server.
            if (OS.GetEnvironment("ATLAS_VERIFY_ENTITYVIEW") == "1")
            {
                int code = EntityViewVerify.Run(this);
                GetTree().Quit(code);
                return;
            }

            // Env-gated offline verify probe (ATLAS_VERIFY_ANIM=1): drives AnimationController
            // with synthetic synced states against a real seed glTF's AnimationPlayer, asserts
            // the expected clip is playing for idle/walk/sprint/attack/die, then quits BEFORE
            // any networking. Proves the character animation PoC without a live server.
            if (OS.GetEnvironment("ATLAS_VERIFY_ANIM") == "1")
            {
                int code = AnimationVerify.Run(this);
                GetTree().Quit(code);
                return;
            }

            _config = Config.Load();
            GD.Print($"[GameRoot] endpoint={_config.ColyseusEndpoint} room={_config.RoomName} map={_config.MapId}");

            var camera = GetNode<Camera3D>(CameraPath);

            // World
            _mapVisuals = new MapVisuals { Name = "MapVisuals" };
            AddChild(_mapVisuals);
            _entities = new EntityManager { Name = "EntityManager" };
            AddChild(_entities);
            AddChild(new CameraRig(camera, _entities) { Name = "CameraRig" });

            // Net
            _connection = new ColyseusConnection(_config) { Name = "ColyseusConnection" };
            AddChild(_connection);
            _sync = new EntitySync(_entities);
            _inputSender = new InputSender(_connection);

            // Input
            _playerController = new PlayerController(_inputSender, _entities) { Name = "PlayerController" };
            AddChild(_playerController);

            // Meta UI (B2). The MetaGateway autoload owns all Nakama awaiting; MetaShell is
            // a pure signal-driven overlay. Toggle with Tab, close with Esc.
            AddChild(new MetaShell());

            // Map picker (react debug client parity): pick a map, Join switches rooms.
            _mapPicker = new MapPickerPanel();
            _mapPicker.JoinRequested += _connection.SwitchMap;
            AddChild(_mapPicker);

            // On every (re)connect: reset the entity pool, then (re)wire schema callbacks.
            _connection.Connected += OnConnected;

            _connection.BeginConnect();

            StartBootstrapCountLog();
            StartDebugShot();
            StartDebugSwitchMap();
        }

        private void OnConnected(Room<GameState> room)
        {
            _entities.Reset();
            _sync.Bind(room);

            // Rooms are 1-client (joinOrCreate always creates ours), so the mapId we
            // requested IS the room's map — rebuild ground detail + picker state from it.
            _mapVisuals.Rebuild(_connection.MapId);
            _mapPicker.SetCurrent(_connection.MapId);
            _playerController.NotifyJoined(); // re-send current input intent to the new room

            // ATLAS_DEBUG_MOVE (headless probes) is handled by PlayerController: it fakes a
            // held right-arrow so the full input path (send + local intent gate) is exercised.
        }

        // Gated visual probe (ATLAS_DEBUG_SHOT=/path.png): saves the rendered viewport
        // ~6s in, so map/entity rendering can be verified without screen-capture perms.
        private void StartDebugShot()
        {
            string path = OS.GetEnvironment("ATLAS_DEBUG_SHOT");
            if (string.IsNullOrEmpty(path))
                return;
            double delay = double.TryParse(OS.GetEnvironment("ATLAS_DEBUG_SHOT_DELAY"), out double d) ? d : 6.0;
            GetTree().CreateTimer(delay).Timeout += () =>
            {
                Image img = GetViewport().GetTexture().GetImage();
                Error err = img.SavePng(path);
                GD.Print($"[GameRoot] ATLAS_DEBUG_SHOT saved={err == Error.Ok} path={path}");
            };
        }

        // Gated switch probe (ATLAS_DEBUG_SWITCHMAP=<mapId>): drives the same path as the
        // picker's Join button ~8s in, to exercise leave→rejoin headlessly.
        private void StartDebugSwitchMap()
        {
            string mapId = OS.GetEnvironment("ATLAS_DEBUG_SWITCHMAP");
            if (string.IsNullOrEmpty(mapId))
                return;
            GetTree().CreateTimer(8.0).Timeout += () =>
            {
                GD.Print($"[GameRoot] ATLAS_DEBUG_SWITCHMAP → {mapId}");
                _connection.SwitchMap(mapId);
            };
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
