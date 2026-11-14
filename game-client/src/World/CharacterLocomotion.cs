using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Camera-relative omnidirectional WASD locomotion math (Genshin Impact / FFXIV Standard / ROX style).
    /// Models in game-client face +Z in local space (yaw = 0 faces +Z, yaw = Pi faces -Z):
    /// Forward(yaw) = (Sin(yaw), 0, Cos(yaw)).
    /// - W / Up (forwardInput &gt; 0): moves away from camera into the scene (-Z when cameraYaw = 0).
    /// - S / Down (forwardInput &lt; 0): turns and moves toward camera (+Z when cameraYaw = 0).
    /// - D / Right (rightInput &gt; 0): turns and moves screen-right (+X when cameraYaw = 0).
    /// - A / Left (rightInput &lt; 0): turns and moves screen-left (-X when cameraYaw = 0).
    /// - Diagonals (W+D, W+A, S+D, S+A): normalized 45-degree camera-relative movement.
    /// Character facing yaw smoothly interpolates toward the world movement vector via LerpAngle.
    /// </summary>
    public static class CharacterLocomotion
    {
        public const float DefaultTurnSpeedRadPerSec = 14.0f;

        public readonly record struct StepResult(
            float NextYaw,
            Vector3 WorldDirection,
            bool IsMoving);

        public static Vector3 ForwardFromYaw(float yaw) =>
            new(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));

        public static StepResult Step(
            float currentYaw,
            float cameraYaw,
            float rightInput,
            float forwardInput,
            float dt,
            float turnSpeedRadPerSec = DefaultTurnSpeedRadPerSec)
        {
            Vector2 localMove = new(rightInput, -forwardInput);
            if (localMove.LengthSquared() <= 0.0001f)
            {
                return new StepResult(currentYaw, Vector3.Zero, IsMoving: false);
            }

            Vector2 worldXZ = localMove.Normalized().Rotated(-cameraYaw);
            Vector3 worldDir = new(worldXZ.X, 0f, worldXZ.Y);
            float targetYaw = Mathf.Atan2(worldDir.X, worldDir.Z);
            float nextYaw = Mathf.Wrap(
                Mathf.LerpAngle(currentYaw, targetYaw, Mathf.Clamp(dt * turnSpeedRadPerSec, 0f, 1f)),
                -Mathf.Pi,
                Mathf.Pi);

            return new StepResult(nextYaw, worldDir, IsMoving: true);
        }
    }
}
