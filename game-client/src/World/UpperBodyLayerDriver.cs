using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Top-level Godot Node that drives post-AnimationPlayer skeleton layers
    /// (feminine relaxed posture + upper-body moving attack blend) on every frame
    /// when AnimationController is not ticked manually by PlaytestSandboxRoot.
    /// </summary>
    public sealed partial class UpperBodyLayerDriver : Node
    {
        private readonly AnimationController? _controller;

        public UpperBodyLayerDriver() { }

        public UpperBodyLayerDriver(AnimationController controller)
        {
            _controller = controller;
        }

        public override void _Process(double delta)
        {
            if (_controller == null || _controller.IsManualTickEnabled)
                return;
            if (_controller.UseFeminineRelaxedPosture)
                _controller.ApplyRelaxedLocomotionPosture(delta);
            if (_controller.IsUpperBodyAttackActive)
                _controller.AdvanceUpperBody(delta);
            if (_controller.SecondarySpringLinkCount > 0)
            {
                Node3D? root = _controller.ModelRoot;
                if (root != null && GodotObject.IsInstanceValid(root))
                {
                    Camera3D? cam = GetViewport()?.GetCamera3D();
                    if (cam != null && cam.GlobalPosition.DistanceSquaredTo(root.GlobalPosition) > 16.0f * 16.0f)
                        return;
                }
                _controller.StepSecondarySprings(delta);
            }
        }
    }
}
