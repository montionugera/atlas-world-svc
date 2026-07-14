using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Free-orbit camera that follows our own player. Left-drag orbits, wheel zooms;
    /// each frame the orbit target eases onto the owned player's position (the world is
    /// 1000×1000 and players spawn far from the origin, so an origin-locked camera would
    /// show nothing). Extracted from the spike's Main.cs.
    ///
    /// <para>Default distance/pitch: entities DO correctly rotate to face their heading
    /// (<see cref="EntityView.ApplyPose"/> — verified this is never clobbered by
    /// <see cref="AnimationController"/>, and heading itself correctly tracks movement
    /// direction server-side). The old defaults (distance=14, pitch=0.5, a fairly distant,
    /// steep near-top-down view) rendered the Kenney character models small enough, and
    /// from a shallow enough angle, that the turn — while numerically correct — was not
    /// perceptible: the model's silhouette is dominated by a large dark hair/head blob
    /// that looks similar from many yaw angles at that scale. Bringing the camera closer
    /// and a bit more level makes the same, already-correct rotation visibly read as a
    /// turn. Still fully player-adjustable via the mouse wheel (<see cref="MinDistance"/>/
    /// <see cref="MaxDistance"/> unchanged).</para>
    /// </summary>
    public sealed partial class CameraRig : Node
    {
        private readonly Camera3D _camera;
        private readonly EntityManager _entities;

        private float _yaw = 0.6f;    // radians around world Y
        private float _pitch = 0.35f; // radians above the horizon
        private float _distance = 7f;
        private Vector3 _target = Vector3.Zero;
        private bool _dragging;
        private bool _hasCentered;

        private const float MinPitch = 0.05f;
        private const float MaxPitch = 1.5f;
        private const float MinDistance = 3f;
        private const float MaxDistance = 140f; // enough to see whole terrain zones on the 1000-map
        private const float OrbitSpeed = 0.01f;
        private const float ZoomStep = 1.5f;
        private const float FollowRate = 12f;

        public CameraRig(Camera3D camera, EntityManager entities)
        {
            _camera = camera;
            _entities = entities;
        }

        public override void _Ready() => UpdateCamera();

        public override void _UnhandledInput(InputEvent @event)
        {
            if (@event is InputEventMouseButton mb)
            {
                if (mb.ButtonIndex == MouseButton.Left)
                    _dragging = mb.Pressed;
                else if (mb.ButtonIndex == MouseButton.WheelUp && mb.Pressed)
                    Zoom(-ZoomStep);
                else if (mb.ButtonIndex == MouseButton.WheelDown && mb.Pressed)
                    Zoom(ZoomStep);
            }
            else if (@event is InputEventMouseMotion mm && _dragging)
            {
                _yaw -= mm.Relative.X * OrbitSpeed;
                _pitch = Mathf.Clamp(_pitch - mm.Relative.Y * OrbitSpeed, MinPitch, MaxPitch);
                UpdateCamera();
            }
        }

        public override void _Process(double delta)
        {
            if (!_entities.TryGetOwnPlayerFlatPosition(out Vector3 flat))
                return;

            if (!_hasCentered)
            {
                // Snap on first sight so we don't glide from the origin.
                _target = flat;
                _hasCentered = true;
                UpdateCamera();
                return;
            }

            float t = 1f - Mathf.Exp(-FollowRate * (float)delta);
            _target = _target.Lerp(flat, t);
            UpdateCamera();
        }

        private void Zoom(float delta)
        {
            _distance = Mathf.Clamp(_distance + delta, MinDistance, MaxDistance);
            UpdateCamera();
        }

        private void UpdateCamera()
        {
            if (!GodotObject.IsInstanceValid(_camera))
                return;
            Vector3 offset = new Vector3(
                Mathf.Cos(_pitch) * Mathf.Sin(_yaw),
                Mathf.Sin(_pitch),
                Mathf.Cos(_pitch) * Mathf.Cos(_yaw)) * _distance;
            _camera.Position = _target + offset;
            _camera.LookAt(_target, Vector3.Up);
        }
    }
}
