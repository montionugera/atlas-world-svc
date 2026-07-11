using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// A quest row: display name + status line, and (when claimable) a PrimaryButton that
    /// emits <see cref="ClaimPressedEventHandler"/> with the questId for <c>claim_quest_reward</c>.
    /// </summary>
    public sealed partial class QuestCard : PanelContainer
    {
        [Signal] public delegate void ClaimPressedEventHandler(string questId);

        private readonly string _questId;
        private readonly string _status;
        private readonly bool _claimable;

        public QuestCard(string questId, string status, bool claimable)
        {
            _questId = questId;
            _status = status;
            _claimable = claimable;
        }

        public override void _Ready()
        {
            ThemeTypeVariation = Design.Variants.Card;
            var row = new HBoxContainer();
            row.AddThemeConstantOverride("separation", Design.Space.S3);
            AddChild(row);

            var info = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            row.AddChild(info);
            info.AddChild(new Label { Text = Catalog.QuestName(_questId), ThemeTypeVariation = Design.Variants.Body });
            info.AddChild(new Label { Text = _status, ThemeTypeVariation = Design.Variants.Caption });

            if (_claimable)
            {
                var claim = new Button
                {
                    Text = "Claim",
                    ThemeTypeVariation = Design.Variants.PrimaryButton,
                    CustomMinimumSize = new Vector2(96, 36),
                };
                claim.Pressed += () => EmitSignal(SignalName.ClaimPressed, _questId);
                row.AddChild(claim);
            }
        }
    }
}
