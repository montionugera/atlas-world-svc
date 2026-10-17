using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Complete mobile action cluster and HUD controls.
    /// Manages the Virtual Thumbstick (bottom-left) and Action Buttons (bottom-right).
    /// Includes quick potion slots (HP/SP), target switch, and ROX Auto-Combat toggle.
    /// </summary>
    public partial class MobileControlsOverlay : Control
    {
        [Signal]
        public delegate void MoveIntentChangedEventHandler(Vector2 move);

        [Signal]
        public delegate void ActionTriggeredEventHandler(string action);

        [Export] public VirtualJoystick Joystick = null!;
        [Export] public SkillButton AttackBtn = null!;
        [Export] public SkillButton Skill1Btn = null!;
        [Export] public SkillButton Skill2Btn = null!;
        [Export] public SkillButton Skill3Btn = null!;
        [Export] public SkillButton DashBtn = null!;
        [Export] public SkillButton PotionHpBtn = null!;
        [Export] public SkillButton PotionSpBtn = null!;
        [Export] public SkillButton TargetBtn = null!;
        [Export] public SkillButton AutoBtn = null!;

        public override void _Ready()
        {
            MouseFilter = MouseFilterEnum.Ignore;

            if (Joystick != null)
            {
                Joystick.JoystickMoved += dir => EmitSignal(SignalName.MoveIntentChanged, dir);
            }

            WireButton(AttackBtn);
            WireButton(Skill1Btn);
            WireButton(Skill2Btn);
            WireButton(Skill3Btn);
            WireButton(DashBtn);
            WireButton(PotionHpBtn);
            WireButton(PotionSpBtn);
            WireButton(TargetBtn);
            WireButton(AutoBtn);
        }

        private void WireButton(SkillButton? btn)
        {
            if (btn == null) return;
            btn.SkillPressed += skillId =>
            {
                GD.Print($"[MobileControls] Action pressed: {skillId}");
                EmitSignal(SignalName.ActionTriggered, skillId);
            };
        }
    }
}
