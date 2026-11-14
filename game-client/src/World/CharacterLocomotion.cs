using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Character-relative WASD locomotion math, independent of camera orbit yaw.
    /// Models in game-client face +Z in local space (yaw = 0 faces +Z, yaw = Pi faces -Z):
    /// Forward(yaw) = (Sin(yaw), 0, Cos(yaw)).
    /// - W / Up (forwardInput &gt; 0): moves forward in the character's facing direction.
    /// - S / Down (forwardInput &lt; 0): steps backward opposite to facing while preserving facing yaw.
    /// - A / Left (turnInput &gt; 0): turns character left (yaw += turnSpeed * dt).
    /// - D / Right (turnInput &lt; 0): turns character right (yaw -= turnSpeed * dt).
    /// Camera rotation is completely decoupled from movement direction.
    /// </summary>
    public static class CharacterLocomotion
    {
        public const float DefaultTurnSpeedRadPerSec = 3.0f;

        public readonly record struct StepResult(
            float NextYaw,
            Vector3 WorldDirection,
            bool IsMovingForward,
            bool IsMovingBackward,
            bool IsTurning);

        public static Vector3 ForwardFromYaw(float yaw) =>
            new(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));

        public static StepResult Step(
            float currentYaw,
            float forwardInput,
            float turnInput,
            float dt,
            float turnSpeedRadPerSec = DefaultTurnSpeedRadPerSec)
        {
            bool turning = Mathf.Abs(turnInput) > 0.001f;
            float nextYaw = turning
                ? Mathf.Wrap(currentYaw + turnInput * turnSpeedRadPerSec * dt, -Mathf.Pi, Mathf.Pi)
                : currentYaw;

            Vector3 forward = ForwardFromYaw(nextYaw);
            if (forwardInput > 0.001f)
                return new StepResult(nextYaw, forward, IsMovingForward: true, IsMovingBackward: false, IsTurning: turning);
            if (forwardInput < -0.001f)
                return new StepResult(nextYaw, -forward, IsMovingForward: false, IsMovingBackward: true, IsTurning: turning);

            return new StepResult(nextYaw, Vector3.Zero, IsMovingForward: false, IsMovingBackward: false, IsTurning: turning);
        }
    }
}
