using System;
using Godot;
using AtlasWorld.Client.Meta;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Interactive MMORPG Codex &amp; War of Emperium (GvG Castle Siege) Command Panel inside <see cref="MetaShell"/>.
    /// Displays live data from <see cref="MmorpgGrowthManager"/> (<c>contracts/content/*.json</c>):
    /// 1. Dual-Track Base/Job Progression, Equipment Refine (+0..+15 with 3-attempt pity), &amp; Socketed Cards
    /// 2. Adventurer Handbook Milestones (Bestiary Kill Tiers, Card Deposits, Scenic Vista Unlocks)
    /// 3. War of Emperium Castle Siege Command (<c>castle_valkyrie_01</c> — Kriemhild) with interactive buttons
    /// </summary>
    public sealed partial class HandbookSiegePanel : MetaPanel
    {
        private MmorpgGrowthManager? _growth;
        private Action<string>? _onActionBanner;

        private Label _jobSummaryLabel = null!;
        private Label _refineSummaryLabel = null!;
        private VBoxContainer _handbookList = null!;
        private Label _siegeTitleLabel = null!;
        private Label _siegeStatusLabel = null!;
        private Label _siegeRewardLabel = null!;
        private ProgressBar _emperiumHpBar = null!;

        public void BindGrowthManager(MmorpgGrowthManager growth, Action<string>? onActionBanner = null)
        {
            _growth = growth;
            _onActionBanner = onActionBanner;
            if (IsNodeReady())
            {
                Render();
            }
        }

        protected override void OnPanelReady()
        {
            AddTitle("Handbook & WoE Siege");

            // 1. Character Job, Refine & Card Summary Card
            var growthCard = new PanelContainer { ThemeTypeVariation = Design.Variants.Card, SizeFlagsHorizontal = SizeFlags.ExpandFill };
            var growthBox = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            growthBox.AddThemeConstantOverride("separation", Design.Space.S2);
            growthCard.AddChild(growthBox);

            growthBox.AddChild(new Label { Text = "Dual-Track Growth & Equipment", ThemeTypeVariation = Design.Variants.Subheading });
            _jobSummaryLabel = new Label { Text = "Base Lv.12 / Job Lv.15 (Swordman)", ThemeTypeVariation = Design.Variants.Body };
            growthBox.AddChild(_jobSummaryLabel);

            _refineSummaryLabel = new Label { Text = "Refine +0 | WpnCard: Empty | ArmCard: Empty", ThemeTypeVariation = Design.Variants.Caption };
            growthBox.AddChild(_refineSummaryLabel);

            var actionRow = new HBoxContainer();
            actionRow.AddThemeConstantOverride("separation", Design.Space.S3);
            growthBox.AddChild(actionRow);

            var jobBtn = new Button
            {
                Text = "Cycle Job Class",
                ThemeTypeVariation = Design.Variants.GhostButton,
                CustomMinimumSize = new Vector2(140, 36)
            };
            jobBtn.Pressed += () =>
            {
                if (_growth == null) return;
                string nextJob = _growth.CycleNextJobClass();
                _onActionBanner?.Invoke($"[Job Change] Switched to {nextJob} (Weapon: {_growth.EquippedWeaponKind})!");
                Render();
            };
            actionRow.AddChild(jobBtn);

            var refineBtn = new Button
            {
                Text = "Refine Weapon +1",
                ThemeTypeVariation = Design.Variants.PrimaryButton,
                CustomMinimumSize = new Vector2(150, 36)
            };
            refineBtn.Pressed += () =>
            {
                if (_growth == null) return;
                _growth.AttemptRefineWeapon(out string msg);
                _onActionBanner?.Invoke(msg);
                Render();
            };
            actionRow.AddChild(refineBtn);

            var cardBtn = new Button
            {
                Text = "Socket Next Card",
                ThemeTypeVariation = Design.Variants.GhostButton,
                CustomMinimumSize = new Vector2(150, 36)
            };
            cardBtn.Pressed += () =>
            {
                if (_growth == null) return;
                _growth.CycleNextSocketedCard(out string msg);
                _onActionBanner?.Invoke(msg);
                Render();
            };
            actionRow.AddChild(cardBtn);

            Content.AddChild(growthCard);

            // 2. Adventurer Handbook Section
            var hbCard = new PanelContainer { ThemeTypeVariation = Design.Variants.Card, SizeFlagsHorizontal = SizeFlags.ExpandFill };
            var hbBox = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            hbBox.AddThemeConstantOverride("separation", Design.Space.S2);
            hbCard.AddChild(hbBox);

            hbBox.AddChild(new Label { Text = "Adventurer Handbook Milestones (Permanent Account Stats)", ThemeTypeVariation = Design.Variants.Subheading });
            _handbookList = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            _handbookList.AddThemeConstantOverride("separation", Design.Space.S1);
            hbBox.AddChild(_handbookList);
            Content.AddChild(hbCard);

            // 3. War of Emperium (GvG Castle Siege) Section
            var woeCard = new PanelContainer { ThemeTypeVariation = Design.Variants.Card, SizeFlagsHorizontal = SizeFlags.ExpandFill };
            var woeBox = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            woeBox.AddThemeConstantOverride("separation", Design.Space.S2);
            woeCard.AddChild(woeBox);

            _siegeTitleLabel = new Label { Text = "War of Emperium — Kriemhild (Valkyrie Realm)", ThemeTypeVariation = Design.Variants.Subheading };
            woeBox.AddChild(_siegeTitleLabel);

            _siegeStatusLabel = new Label { Text = "Owner: Valkyrie Vanguard [DEF] | Barricades: 4/4", ThemeTypeVariation = Design.Variants.Body };
            woeBox.AddChild(_siegeStatusLabel);

            _emperiumHpBar = new ProgressBar { MinValue = 0, MaxValue = 120000, Value = 120000, ShowPercentage = false };
            _emperiumHpBar.CustomMinimumSize = new Vector2(0, 14);
            woeBox.AddChild(_emperiumHpBar);

            _siegeRewardLabel = new Label
            {
                Text = "Rules: 60% PvP Damage Scaling | Holy Emperium takes Normal Attacks ONLY | Rewards: 4 Daily Chests + 'guild_abyss_valkyrie'",
                ThemeTypeVariation = Design.Variants.Caption
            };
            woeBox.AddChild(_siegeRewardLabel);

            var siegeBtnRow = new HBoxContainer();
            siegeBtnRow.AddThemeConstantOverride("separation", Design.Space.S3);
            woeBox.AddChild(siegeBtnRow);

            var breachBtn = new Button
            {
                Text = "Siege Normal Strike",
                ThemeTypeVariation = Design.Variants.PrimaryButton,
                CustomMinimumSize = new Vector2(165, 36)
            };
            breachBtn.Pressed += () =>
            {
                if (_growth == null) return;
                bool hadBarricades = _growth.SiegeBarricadesRemaining > 0;
                _growth.ApplySiegeAttack(
                    rawDamage: hadBarricades ? 80_000L : 65_000L,
                    isSkillAttack: false,
                    attackElement: "Neutral",
                    attackerGuild: "Freja Knights [ATK]",
                    out string siegeMsg);
                _onActionBanner?.Invoke(siegeMsg);
                Render();
            };
            siegeBtnRow.AddChild(breachBtn);

            var testSkillImmuneBtn = new Button
            {
                Text = "Test Skill on Emperium",
                ThemeTypeVariation = Design.Variants.GhostButton,
                CustomMinimumSize = new Vector2(175, 36)
            };
            testSkillImmuneBtn.Pressed += () =>
            {
                if (_growth == null) return;
                _growth.ApplySiegeAttack(
                    rawDamage: 120_000L,
                    isSkillAttack: true,
                    attackElement: "Fire",
                    attackerGuild: "Freja Knights [ATK]",
                    out string siegeMsg);
                _onActionBanner?.Invoke(siegeMsg);
                Render();
            };
            siegeBtnRow.AddChild(testSkillImmuneBtn);

            Content.AddChild(woeCard);
            Render();
        }

        public override void Refresh()
        {
            Render();
        }

        private void Render()
        {
            if (_growth == null || _jobSummaryLabel == null)
                return;

            var skills = _growth.GetCurrentJobSkills();
            _jobSummaryLabel.Text =
                $"Base Lv.{_growth.BaseLevel} ({_growth.BaseExpPercent:0.0}%)  ·  Job Lv.{_growth.JobLevel}/{_growth.MaxJobLevelForCurrentJob} ({_growth.CurrentJobDisplayName})  ·  Weapon: {_growth.EquippedWeaponKind}  ·  Skills: {skills[0].ButtonLabel}/{skills[1].ButtonLabel}/{skills[2].ButtonLabel}";
            _refineSummaryLabel.Text = _growth.FormatGrowthSummaryLine();

            foreach (Node child in _handbookList.GetChildren())
                child.QueueFree();

            foreach (var entry in _growth.Handbook)
            {
                int prog = entry.TargetId switch
                {
                    "forest_slime" => _growth.HandbookSlimeKills,
                    "boar" => _growth.HandbookBoarKills,
                    "prontera_south_field" => _growth.HandbookWatchtowerVistaUnlocked ? 1 : 0,
                    _ => 0
                };
                string line = $"• [{entry.Category.ToUpperInvariant()}] {entry.Title} — Progress: {prog}";
                _handbookList.AddChild(new Label { Text = line, ThemeTypeVariation = Design.Variants.Body });
            }

            var castle = _growth.ActiveCastle;
            _siegeTitleLabel.Text = $"War of Emperium — {castle.Name} (Captures: {_growth.CastleCaptureCount})";
            _siegeStatusLabel.Text = _growth.FormatSiegeStatusLine();
            _emperiumHpBar.MaxValue = Math.Max(1, castle.Emperium.Hp);
            _emperiumHpBar.Value = Mathf.Clamp(_growth.EmperiumHp, 0, castle.Emperium.Hp);
        }
    }
}
