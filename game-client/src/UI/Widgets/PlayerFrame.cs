using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Top-Left Player Status Frame aligned to the Joymify Design System & Ragnarok Origin style.
    /// Displays:
    /// - Circular character portrait frame
    /// - Level badge (Lv. 90 | Job 50) styled in brand gold
    /// - Character name & Job title
    /// - Dual Resource Bars: Ragnarok Crimson HpBar & Sapphire SpBar with numerical text
    /// </summary>
    public partial class PlayerFrame : Control
    {
        [Export] public Label NameLabel = null!;
        [Export] public Label LevelLabel = null!;
        [Export] public ProgressBar HpBar = null!;
        [Export] public Label HpText = null!;
        [Export] public ProgressBar SpBar = null!;
        [Export] public Label SpText = null!;

        public override void _Ready()
        {
            CustomMinimumSize = new Vector2(320, 88);
            MouseFilter = MouseFilterEnum.Ignore;

            SetStats(14850, 14850, 3200, 3200, 90, "Player (Knight)");
        }

        public void SetHp(int hp, int maxHp)
        {
            if (HpBar != null)
            {
                HpBar.MaxValue = maxHp;
                HpBar.Value = hp;
            }

            if (HpText != null)
            {
                HpText.Text = $"{hp:N0} / {maxHp:N0}";
            }
        }

        public void SetSp(int sp, int maxSp)
        {
            if (SpBar != null)
            {
                SpBar.MaxValue = maxSp;
                SpBar.Value = sp;
            }

            if (SpText != null)
            {
                SpText.Text = $"{sp:N0} / {maxSp:N0}";
            }
        }

        public void SetStats(int hp, int maxHp, int sp, int maxSp, int level, string name = "")
        {
            if (!string.IsNullOrEmpty(name) && NameLabel != null)
            {
                NameLabel.Text = name;
            }

            if (LevelLabel != null)
            {
                LevelLabel.Text = $"Lv.{level} | Job 50";
            }

            SetHp(hp, maxHp);
            SetSp(sp, maxSp);
        }
    }
}
