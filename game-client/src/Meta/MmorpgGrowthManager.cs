using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;

namespace AtlasWorld.Client.Meta
{
    public sealed class JobBonusStatsDef
    {
        [JsonPropertyName("str")] public int Str { get; set; }
        [JsonPropertyName("agi")] public int Agi { get; set; }
        [JsonPropertyName("vit")] public int Vit { get; set; }
        [JsonPropertyName("int")] public int Int { get; set; }
        [JsonPropertyName("dex")] public int Dex { get; set; }
    }

    public sealed class JobCatalogDef
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("tier")] public int Tier { get; set; }
        [JsonPropertyName("parentJobId")] public string? ParentJobId { get; set; }
        [JsonPropertyName("minBaseLevel")] public int MinBaseLevel { get; set; } = 1;
        [JsonPropertyName("maxJobLevel")] public int MaxJobLevel { get; set; } = 10;
        [JsonPropertyName("jobChangeQuestId")] public string? JobChangeQuestId { get; set; }
        [JsonPropertyName("primaryStats")] public List<string> PrimaryStats { get; set; } = new();
        [JsonPropertyName("allowedWeaponKinds")] public List<string> AllowedWeaponKinds { get; set; } = new();
        [JsonPropertyName("jobBonusAtMax")] public JobBonusStatsDef JobBonusAtMax { get; set; } = new();
        [JsonPropertyName("unlockedSkillIds")] public List<string> UnlockedSkillIds { get; set; } = new();
        [JsonPropertyName("assetStudioKey")] public string AssetStudioKey { get; set; } = "";
    }

    public sealed class ElementsCatalogDef
    {
        [JsonPropertyName("elements")] public List<string> Elements { get; set; } = new();
        [JsonPropertyName("damageMatrixPct")] public Dictionary<string, Dictionary<string, int>> DamageMatrixPct { get; set; } = new();
        [JsonPropertyName("weaponSizePenaltyPct")] public Dictionary<string, Dictionary<string, int>> WeaponSizePenaltyPct { get; set; } = new();
    }

    public sealed class JobSkillSlotDef
    {
        public int Slot { get; init; }
        public string Id { get; init; } = "";
        public string ShoutName { get; init; } = "";
        public string ButtonLabel { get; init; } = "";
        public string Element { get; init; } = "Neutral";
        public float DamageMultiplier { get; init; } = 2.0f;
        public int SpCost { get; init; } = 200;
        public float CooldownSec { get; init; } = 4.0f;
    }

    public sealed class CardCatalogDef
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("slot")] public string Slot { get; set; } = "weapon";
        [JsonPropertyName("mobId")] public string MobId { get; set; } = "";
        [JsonPropertyName("equipStats")] public Dictionary<string, int> EquipStats { get; set; } = new();
        [JsonPropertyName("handbookDepositStats")] public Dictionary<string, int> HandbookDepositStats { get; set; } = new();
        [JsonPropertyName("assetStudioKey")] public string AssetStudioKey { get; set; } = "";
    }

    public sealed class HandbookTierDef
    {
        [JsonPropertyName("requiredCount")] public int RequiredCount { get; set; } = 10;
        [JsonPropertyName("unlockNote")] public string UnlockNote { get; set; } = "";
        [JsonPropertyName("bonusStat")] public string BonusStat { get; set; } = "";
        [JsonPropertyName("bonusValue")] public int BonusValue { get; set; }
    }

    public sealed class HandbookCatalogDef
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("category")] public string Category { get; set; } = "";
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        [JsonPropertyName("targetId")] public string TargetId { get; set; } = "";
        [JsonPropertyName("tiers")] public List<HandbookTierDef> Tiers { get; set; } = new();
    }

    public sealed class QuestObjectiveDef
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "";
        [JsonPropertyName("targetId")] public string TargetId { get; set; } = "";
        [JsonPropertyName("required")] public int Required { get; set; } = 1;
    }

    public sealed class QuestRewardItemDef
    {
        [JsonPropertyName("itemId")] public string ItemId { get; set; } = "";
        [JsonPropertyName("qty")] public int Qty { get; set; } = 1;
    }

    public sealed class QuestRewardsDef
    {
        [JsonPropertyName("baseXp")] public int BaseXp { get; set; }
        [JsonPropertyName("jobXp")] public int JobXp { get; set; }
        [JsonPropertyName("unlockJobId")] public string? UnlockJobId { get; set; }
        [JsonPropertyName("unlockSkillId")] public string? UnlockSkillId { get; set; }
        [JsonPropertyName("reputation")] public int Reputation { get; set; }
        [JsonPropertyName("items")] public List<QuestRewardItemDef> Items { get; set; } = new();
    }

    public sealed class QuestBoardDef
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        [JsonPropertyName("category")] public string Category { get; set; } = "main_story";
        [JsonPropertyName("minBaseLevel")] public int MinBaseLevel { get; set; } = 1;
        [JsonPropertyName("requiredJobId")] public string? RequiredJobId { get; set; }
        [JsonPropertyName("giverNpcId")] public string GiverNpcId { get; set; } = "";
        [JsonPropertyName("zoneId")] public string ZoneId { get; set; } = "";
        [JsonPropertyName("repeatable")] public bool Repeatable { get; set; }
        [JsonPropertyName("objectives")] public List<QuestObjectiveDef> Objectives { get; set; } = new();
        [JsonPropertyName("rewards")] public QuestRewardsDef Rewards { get; set; } = new();

        public int KillGoal => Objectives.Count > 0 ? Math.Max(1, Objectives[0].Required) : 5;
        public string TargetText => Objectives.Count > 0
            ? $"Purge {Objectives[0].TargetId.Replace("mob-", "")}"
            : "Purge Freja Monsters";
    }

    /// <summary>
    /// Client-side MMORPG Growth, Job Progression, Equipment Refine (+0..+15), Monster Card Socketing,
    /// Adventurer Handbook passives, 10-Element/Size Counter Matrix &amp; Quest Board tracker backed directly by <c>contracts/content/*.json</c>.
    /// </summary>
    public sealed class MmorpgGrowthManager
    {
        public List<JobCatalogDef> Jobs { get; private set; } = new();
        public List<QuestBoardDef> Quests { get; private set; } = new();
        public List<CardCatalogDef> Cards { get; private set; } = new();
        public List<HandbookCatalogDef> Handbook { get; private set; } = new();
        public ElementsCatalogDef Elements { get; private set; } = new();

        public int BaseLevel { get; private set; } = 12;
        public int JobLevel { get; private set; } = 15;
        public int CurrentBaseExp { get; private set; } = 0;
        public int CurrentJobExp { get; private set; } = 0;
        public string CurrentJobId { get; private set; } = "swordman";
        public int ActiveQuestIndex { get; private set; } = 0;
        public int ActiveQuestProgress { get; private set; } = 0;

        // Phase 3: Equipment Refine (+0..+15), Monster Card Slots & Adventurer Handbook Milestones
        public int WeaponRefineLevel { get; private set; } = 0;
        public int WeaponRefinePityCount { get; private set; } = 0;
        public string? SocketedWeaponCardId { get; private set; } = null;
        public string? SocketedArmorCardId { get; private set; } = null;
        public HashSet<string> DepositedCardIds { get; } = new();
        public int HandbookSlimeKills { get; private set; } = 0;
        public int HandbookBoarKills { get; private set; } = 0;
        public bool HandbookWatchtowerVistaUnlocked { get; private set; } = false;

        private int _cardCycleIndex = -1;

        public void LoadCatalogs()
        {
            string repoRoot = ProjectSettings.GlobalizePath("res://..").TrimEnd('/', '\\');
            string jobsPath = Path.Combine(repoRoot, "contracts", "content", "jobs.json");
            string questsPath = Path.Combine(repoRoot, "contracts", "content", "quest_board.json");
            string cardsPath = Path.Combine(repoRoot, "contracts", "content", "cards.json");
            string handbookPath = Path.Combine(repoRoot, "contracts", "content", "handbook.json");
            string elementsPath = Path.Combine(repoRoot, "contracts", "content", "elements.json");

            try
            {
                if (File.Exists(jobsPath))
                {
                    Jobs = JsonSerializer.Deserialize<List<JobCatalogDef>>(File.ReadAllText(jobsPath)) ?? new();
                }
                if (File.Exists(questsPath))
                {
                    Quests = JsonSerializer.Deserialize<List<QuestBoardDef>>(File.ReadAllText(questsPath)) ?? new();
                }
                if (File.Exists(cardsPath))
                {
                    Cards = JsonSerializer.Deserialize<List<CardCatalogDef>>(File.ReadAllText(cardsPath)) ?? new();
                }
                if (File.Exists(handbookPath))
                {
                    Handbook = JsonSerializer.Deserialize<List<HandbookCatalogDef>>(File.ReadAllText(handbookPath)) ?? new();
                }
                if (File.Exists(elementsPath))
                {
                    Elements = JsonSerializer.Deserialize<ElementsCatalogDef>(File.ReadAllText(elementsPath)) ?? new();
                }
            }
            catch (Exception ex)
            {
                GD.PushWarning($"[MmorpgGrowthManager] Failed to load catalogs: {ex.Message}");
            }

            if (Jobs.Count == 0)
            {
                Jobs.Add(new JobCatalogDef { Id = "novice", Name = "Novice", Tier = 0, MinBaseLevel = 1, MaxJobLevel = 10 });
                Jobs.Add(new JobCatalogDef { Id = "swordman", Name = "Swordman", Tier = 1, ParentJobId = "novice", MinBaseLevel = 10, MaxJobLevel = 40 });
                Jobs.Add(new JobCatalogDef { Id = "knight", Name = "Knight", Tier = 2, ParentJobId = "swordman", MinBaseLevel = 40, MaxJobLevel = 50 });
            }

            if (Quests.Count == 0)
            {
                Quests.Add(new QuestBoardDef
                {
                    Id = "quest-main-01-freja-gate",
                    Title = "Ch.1 Midnight Bells",
                    Category = "main_story",
                    Objectives = new List<QuestObjectiveDef>
                    {
                        new() { Id = "obj-1", Type = "kill_mob", TargetId = "mob-emerald-slime", Required = 5 }
                    },
                    Rewards = new QuestRewardsDef { BaseXp = 220, JobXp = 140 }
                });
            }

            if (Cards.Count == 0)
            {
                Cards.Add(new CardCatalogDef
                {
                    Id = "card_boar",
                    Name = "Wild Boar Card",
                    Slot = "weapon",
                    MobId = "boar",
                    EquipStats = new Dictionary<string, int> { ["pAtkFlat"] = 8, ["str"] = 1 },
                    HandbookDepositStats = new Dictionary<string, int> { ["pAtkFlat"] = 2 }
                });
                Cards.Add(new CardCatalogDef
                {
                    Id = "card_skeleton_soldier",
                    Name = "Skeleton Soldier Card",
                    Slot = "weapon",
                    MobId = "skeleton_soldier",
                    EquipStats = new Dictionary<string, int> { ["critRatePct"] = 9, ["pAtkFlat"] = 10 },
                    HandbookDepositStats = new Dictionary<string, int> { ["pAtkFlat"] = 3 }
                });
            }
        }

        public JobCatalogDef CurrentJob =>
            Jobs.Find(j => j.Id == CurrentJobId) ?? Jobs[0];

        public string CurrentJobDisplayName => CurrentJob.Name;

        public string EquippedWeaponKind
        {
            get
            {
                var allowed = CurrentJob.AllowedWeaponKinds;
                return allowed.Count > 0 ? allowed[0] : "basic_sword";
            }
        }

        /// <summary>
        /// Evaluates the 10-Element counter percentage from <c>contracts/content/elements.json</c>
        /// (e.g. Fire vs Earth = 150%, Fire vs Water = 50%, Holy vs Undead = 150%).
        /// </summary>
        public int GetElementCounterPct(string attackElement, string targetElement)
        {
            string cleanTarget = targetElement.Split('/')[0].Trim();
            if (Elements.DamageMatrixPct.TryGetValue(attackElement, out var row) &&
                row.TryGetValue(cleanTarget, out int pct))
            {
                return pct;
            }
            return 100;
        }

        /// <summary>
        /// Evaluates the Weapon-vs-Monster-Size modifier percentage (<c>Small</c>, <c>Medium</c>, <c>Large</c>)
        /// from <c>contracts/content/elements.json</c>.
        /// </summary>
        public int GetWeaponSizePenaltyPct(string weaponKind, string targetSize)
        {
            if (Elements.WeaponSizePenaltyPct.TryGetValue(weaponKind, out var row) &&
                row.TryGetValue(targetSize, out int pct))
            {
                return pct;
            }
            return 100;
        }

        /// <summary>
        /// Returns the 3 active hotbar skill profiles for the current Job Class.
        /// </summary>
        public JobSkillSlotDef[] GetCurrentJobSkills() => GetJobSkillsForClass(CurrentJobId);

        public static JobSkillSlotDef[] GetJobSkillsForClass(string jobId) => jobId switch
        {
            "swordman" => new[]
            {
                new JobSkillSlotDef { Slot = 1, Id = "bash", ShoutName = "Bash!!", ButtonLabel = "BASH", Element = "Neutral", DamageMultiplier = 2.15f, SpCost = 180, CooldownSec = 3.5f },
                new JobSkillSlotDef { Slot = 2, Id = "magnum_break", ShoutName = "Magnum Break!! (Fire)", ButtonLabel = "MAGNUM", Element = "Fire", DamageMultiplier = 2.65f, SpCost = 260, CooldownSec = 5.5f },
                new JobSkillSlotDef { Slot = 3, Id = "endure", ShoutName = "Endure! (Holy Guard)", ButtonLabel = "ENDURE", Element = "Holy", DamageMultiplier = 1.85f, SpCost = 160, CooldownSec = 6.5f },
            },
            "mage" => new[]
            {
                new JobSkillSlotDef { Slot = 1, Id = "fire_bolt", ShoutName = "Fire Bolt!! (Fire)", ButtonLabel = "FIRE", Element = "Fire", DamageMultiplier = 2.85f, SpCost = 220, CooldownSec = 3.5f },
                new JobSkillSlotDef { Slot = 2, Id = "cold_bolt", ShoutName = "Cold Bolt!! (Water)", ButtonLabel = "COLD", Element = "Water", DamageMultiplier = 2.60f, SpCost = 220, CooldownSec = 4.5f },
                new JobSkillSlotDef { Slot = 3, Id = "lightning_bolt", ShoutName = "Lightning Bolt!! (Wind)", ButtonLabel = "THUNDER", Element = "Wind", DamageMultiplier = 2.70f, SpCost = 240, CooldownSec = 5.5f },
            },
            "archer" => new[]
            {
                new JobSkillSlotDef { Slot = 1, Id = "double_strafe", ShoutName = "Double Strafe!! (Wind)", ButtonLabel = "STRAFE", Element = "Wind", DamageMultiplier = 2.55f, SpCost = 190, CooldownSec = 3.0f },
                new JobSkillSlotDef { Slot = 2, Id = "arrow_shower", ShoutName = "Arrow Shower!! (Fire)", ButtonLabel = "SHOWER", Element = "Fire", DamageMultiplier = 2.40f, SpCost = 240, CooldownSec = 5.0f },
                new JobSkillSlotDef { Slot = 3, Id = "falcon_assault", ShoutName = "Falcon Assault!! (Holy)", ButtonLabel = "FALCON", Element = "Holy", DamageMultiplier = 2.85f, SpCost = 260, CooldownSec = 6.0f },
            },
            "knight" => new[]
            {
                new JobSkillSlotDef { Slot = 1, Id = "bowling_bash", ShoutName = "Bowling Bash!! (Fire)", ButtonLabel = "BOWL", Element = "Fire", DamageMultiplier = 3.30f, SpCost = 240, CooldownSec = 4.0f },
                new JobSkillSlotDef { Slot = 2, Id = "brandish_spear", ShoutName = "Brandish Spear!! (Holy)", ButtonLabel = "BRANDISH", Element = "Holy", DamageMultiplier = 3.45f, SpCost = 280, CooldownSec = 5.5f },
                new JobSkillSlotDef { Slot = 3, Id = "pierce", ShoutName = "Pierce!! (Anti-Large)", ButtonLabel = "PIERCE", Element = "Earth", DamageMultiplier = 3.10f, SpCost = 200, CooldownSec = 4.5f },
            },
            "wizard" => new[]
            {
                new JobSkillSlotDef { Slot = 1, Id = "meteor_storm", ShoutName = "Meteor Storm!! (Fire)", ButtonLabel = "METEOR", Element = "Fire", DamageMultiplier = 3.70f, SpCost = 260, CooldownSec = 4.5f },
                new JobSkillSlotDef { Slot = 2, Id = "storm_gust", ShoutName = "Storm Gust!! (Water)", ButtonLabel = "GUST", Element = "Water", DamageMultiplier = 3.50f, SpCost = 280, CooldownSec = 5.5f },
                new JobSkillSlotDef { Slot = 3, Id = "lord_of_vermilion", ShoutName = "Lord of Vermilion!! (Wind)", ButtonLabel = "VERMILION", Element = "Wind", DamageMultiplier = 3.55f, SpCost = 300, CooldownSec = 6.5f },
            },
            _ => new[]
            {
                new JobSkillSlotDef { Slot = 1, Id = "power_strike", ShoutName = "Power Strike!!", ButtonLabel = "STRIKE", Element = "Neutral", DamageMultiplier = 1.85f, SpCost = 140, CooldownSec = 3.0f },
                new JobSkillSlotDef { Slot = 2, Id = "ember_slash", ShoutName = "Ember Slash!! (Fire)", ButtonLabel = "EMBER", Element = "Fire", DamageMultiplier = 2.15f, SpCost = 180, CooldownSec = 4.5f },
                new JobSkillSlotDef { Slot = 3, Id = "holy_aid", ShoutName = "Holy Strike!! (Holy)", ButtonLabel = "HOLY", Element = "Holy", DamageMultiplier = 2.05f, SpCost = 160, CooldownSec = 5.0f },
            }
        };

        /// <summary>
        /// Calculates combat damage factoring in Base/Job Level, Weapon Refine (+0..+15), Socketed Cards,
        /// Handbook Passives, 10-Element Counter Matrix, and Weapon-vs-Monster-Size modifier.
        /// </summary>
        public (long finalDamage, int elemPct, int sizePct, string attackElement) CalculateSkillDamage(
            int skillSlot,
            string targetElement,
            string targetSize,
            out bool isCritical)
        {
            var skills = GetCurrentJobSkills();
            var skill = skills[Math.Clamp(skillSlot - 1, 0, skills.Length - 1)];

            float baseOffence = 180f + (BaseLevel * 18f) + (JobLevel * 9f) + (TotalBonusPAtk * 12f);
            float refineMult = 1.0f + (WeaponRefineLevel * 0.025f);
            int elemPct = GetElementCounterPct(skill.Element, targetElement);
            int sizePct = GetWeaponSizePenaltyPct(EquippedWeaponKind, targetSize);

            int critChancePct = 15 + TotalBonusCritPct;
            isCritical = (GD.Randi() % 100) < critChancePct;
            float critMult = isCritical ? 1.65f : 1.0f;

            float raw = baseOffence * refineMult * skill.DamageMultiplier * (elemPct / 100f) * (sizePct / 100f) * critMult;
            long finalDmg = Math.Max(1L, (long)Mathf.Round(raw));
            return (finalDmg, elemPct, sizePct, skill.Element);
        }

        public int MaxJobLevelForCurrentJob => CurrentJob.MaxJobLevel;

        public int QuestKillCount => ActiveQuestProgress;

        public QuestBoardDef ActiveQuest =>
            Quests.Count > 0 ? Quests[ActiveQuestIndex % Quests.Count] : new QuestBoardDef { Title = "Ch.1 Midnight Bells" };

        public int RequiredBaseExp =>
            Mathf.Max(50, Mathf.RoundToInt(50f * Mathf.Pow(1.115f, Mathf.Clamp(BaseLevel, 1, 99) - 1)));

        public int RequiredJobExp
        {
            get
            {
                var job = CurrentJob;
                float tierMult = job.Tier == 0 ? 0.65f : (job.Tier == 1 ? 1.0f : 1.45f);
                return Mathf.Max(20, Mathf.RoundToInt(35f * tierMult * Mathf.Pow(1.105f, Mathf.Clamp(JobLevel, 1, 50) - 1)));
            }
        }

        public float BaseExpPercent =>
            Mathf.Clamp(100f * CurrentBaseExp / Mathf.Max(1, RequiredBaseExp), 0f, 99.9f);

        public float JobExpPercent =>
            Mathf.Clamp(100f * CurrentJobExp / Mathf.Max(1, RequiredJobExp), 0f, 99.9f);

        public int ActiveQuestGoal => ActiveQuest.KillGoal;

        /// <summary>
        /// Success rate in basis points (10000 = 100%) for refining from <see cref="WeaponRefineLevel"/> to +1.
        /// +0 -> +4 is 100% safe; +4 -> +15 uses a 3-attempt guaranteed pity counter.
        /// </summary>
        public int NextRefineSuccessRateBps => WeaponRefineLevel switch
        {
            <= 3 => 10000,
            4 => 6000,
            5 => 5000,
            6 => 4000,
            7 => 3000,
            8 => 2500,
            9 => 2000,
            <= 14 => 1500,
            _ => 0
        };

        /// <summary>
        /// Attempts to refine the equipped weapon (+0..+15) using Oridecon &amp; deterministic pity rules.
        /// </summary>
        public bool AttemptRefineWeapon(out string refineMessage, int? deterministicRollBps = null)
        {
            if (WeaponRefineLevel >= 15)
            {
                refineMessage = "[Refine] Weapon is already at MAX Refine +15!";
                return false;
            }

            int roll = deterministicRollBps ?? (int)(GD.Randi() % 10000);
            int chance = NextRefineSuccessRateBps;
            bool triggeredPity = WeaponRefinePityCount >= 2;
            bool success = triggeredPity || roll < chance;

            if (success)
            {
                WeaponRefineLevel++;
                WeaponRefinePityCount = 0;
                string pityTag = triggeredPity ? " (PITY GUARANTEED!)" : "";
                refineMessage = $"[Refine] SUCCESS! Weapon refined to +{WeaponRefineLevel}{pityTag} (+{WeaponRefineLevel * 2.5f:0.0}% ATK)";
                return true;
            }

            WeaponRefinePityCount++;
            refineMessage = $"[Refine] Failed at +{WeaponRefineLevel} (Gear Safe — Pity {WeaponRefinePityCount}/3 toward guaranteed +{WeaponRefineLevel + 1})";
            return false;
        }

        /// <summary>
        /// Cycles through Monster Cards in <c>cards.json</c>, socketing the card into its equipment slot
        /// and depositing it into the Adventurer Handbook for permanent account bonuses.
        /// </summary>
        public CardCatalogDef CycleNextSocketedCard(out string cardMessage)
        {
            if (Cards.Count == 0)
            {
                LoadCatalogs();
            }

            _cardCycleIndex = (_cardCycleIndex + 1) % Cards.Count;
            var card = Cards[_cardCycleIndex];
            DepositedCardIds.Add(card.Id);

            if (card.Slot == "armor")
            {
                SocketedArmorCardId = card.Id;
            }
            else
            {
                SocketedWeaponCardId = card.Id;
            }

            cardMessage = $"[Card Socket] Socketed '{card.Name}' into [{card.Slot.ToUpperInvariant()}] & deposited to Handbook! ({FormatCardStats(card.EquipStats)})";
            return card;
        }

        public bool UnlockWatchtowerScenicVista(out string? vistaMessage)
        {
            if (HandbookWatchtowerVistaUnlocked)
            {
                vistaMessage = null;
                return false;
            }

            HandbookWatchtowerVistaUnlocked = true;
            vistaMessage = "[Adventurer Handbook] Discovered Scenic Vista: 'South Gate Watchtower Overlook' (Permanent MaxHP +25)!";
            return true;
        }

        public int UnlockedHandbookTierCount
        {
            get
            {
                int count = 0;
                foreach (var entry in Handbook)
                {
                    int progress = entry.TargetId switch
                    {
                        "forest_slime" => HandbookSlimeKills,
                        "boar" => HandbookBoarKills,
                        "prontera_south_field" => HandbookWatchtowerVistaUnlocked ? 1 : 0,
                        _ => 0
                    };
                    foreach (var tier in entry.Tiers)
                    {
                        if (progress >= tier.RequiredCount)
                            count++;
                    }
                }
                return count;
            }
        }

        public int TotalBonusPAtk
        {
            get
            {
                int bonus = WeaponRefineLevel * 7;
                foreach (var cid in new[] { SocketedWeaponCardId, SocketedArmorCardId })
                {
                    if (string.IsNullOrEmpty(cid)) continue;
                    var card = Cards.Find(c => c.Id == cid);
                    if (card != null && card.EquipStats.TryGetValue("pAtkFlat", out int v))
                        bonus += v;
                }
                foreach (string cid in DepositedCardIds)
                {
                    var card = Cards.Find(c => c.Id == cid);
                    if (card != null && card.HandbookDepositStats.TryGetValue("pAtkFlat", out int v))
                        bonus += v;
                }
                if (HandbookBoarKills >= 10) bonus += 1;
                if (HandbookBoarKills >= 100) bonus += 2;
                return bonus;
            }
        }

        public int TotalBonusMaxHp
        {
            get
            {
                int bonus = 0;
                foreach (var cid in new[] { SocketedWeaponCardId, SocketedArmorCardId })
                {
                    if (string.IsNullOrEmpty(cid)) continue;
                    var card = Cards.Find(c => c.Id == cid);
                    if (card != null && card.EquipStats.TryGetValue("maxHpFlat", out int v))
                        bonus += v;
                }
                foreach (string cid in DepositedCardIds)
                {
                    var card = Cards.Find(c => c.Id == cid);
                    if (card != null && card.HandbookDepositStats.TryGetValue("maxHpFlat", out int v))
                        bonus += v;
                }
                if (HandbookSlimeKills >= 10) bonus += 15;
                if (HandbookSlimeKills >= 500) bonus += 45;
                if (HandbookWatchtowerVistaUnlocked) bonus += 25;
                return bonus;
            }
        }

        public int TotalBonusCritPct
        {
            get
            {
                int bonus = 0;
                foreach (var cid in new[] { SocketedWeaponCardId, SocketedArmorCardId })
                {
                    if (string.IsNullOrEmpty(cid)) continue;
                    var card = Cards.Find(c => c.Id == cid);
                    if (card != null && card.EquipStats.TryGetValue("critRatePct", out int v))
                        bonus += v;
                }
                return bonus;
            }
        }

        public string ActiveWeaponCardName =>
            Cards.Find(c => c.Id == SocketedWeaponCardId)?.Name ?? "Empty Slot";

        public string ActiveArmorCardName =>
            Cards.Find(c => c.Id == SocketedArmorCardId)?.Name ?? "Empty Slot";

        public string FormatGrowthSummaryLine()
        {
            return $"Refine +{WeaponRefineLevel} (Pity {WeaponRefinePityCount}/3) | WpnCard: {ActiveWeaponCardName} | ArmCard: {ActiveArmorCardName} | Handbook: {UnlockedHandbookTierCount} Tiers (+{TotalBonusPAtk} ATK, +{TotalBonusMaxHp} HP, +{TotalBonusCritPct}% CRIT)";
        }

        private static string FormatCardStats(Dictionary<string, int> stats)
        {
            var parts = new List<string>();
            foreach (var kv in stats)
            {
                parts.Add($"{kv.Key} +{kv.Value}");
            }
            return string.Join(", ", parts);
        }

        public (bool baseLeveledUp, bool jobLeveledUp, string? autoPromotedJobName) GrantExp(int baseExp, int jobExp)
        {
            bool baseUp = false;
            bool jobUp = false;
            string? promotedName = null;

            CurrentBaseExp += Math.Max(0, baseExp);
            while (BaseLevel < 99 && CurrentBaseExp >= RequiredBaseExp)
            {
                CurrentBaseExp -= RequiredBaseExp;
                BaseLevel++;
                baseUp = true;
            }

            var job = CurrentJob;
            CurrentJobExp += Math.Max(0, jobExp);
            while (JobLevel < job.MaxJobLevel && CurrentJobExp >= RequiredJobExp)
            {
                CurrentJobExp -= RequiredJobExp;
                JobLevel++;
                jobUp = true;
            }

            // Auto-promote Novice -> Swordman at Job Lv 10, Swordman -> Knight at Job Lv 40
            if (CurrentJobId == "novice" && JobLevel >= 10 && BaseLevel >= 10)
            {
                CurrentJobId = "swordman";
                JobLevel = 1;
                CurrentJobExp = 0;
                promotedName = CurrentJob.Name;
            }
            else if (CurrentJobId == "swordman" && JobLevel >= 40 && BaseLevel >= 40)
            {
                CurrentJobId = "knight";
                JobLevel = 1;
                CurrentJobExp = 0;
                promotedName = CurrentJob.Name;
            }

            return (baseUp, jobUp, promotedName);
        }

        public bool GrantExp(int baseExp, int jobExp, out string? levelUpMessage)
        {
            var (baseUp, jobUp, promoted) = GrantExp(baseExp, jobExp);
            if (!string.IsNullOrEmpty(promoted))
            {
                levelUpMessage = $"JOB PROMOTED: {promoted.ToUpperInvariant()}!";
                return true;
            }
            if (baseUp && jobUp)
            {
                levelUpMessage = $"BASE LV.{BaseLevel} & JOB LV.{JobLevel} UP!";
                return true;
            }
            if (baseUp)
            {
                levelUpMessage = $"BASE LEVEL UP! (Lv.{BaseLevel})";
                return true;
            }
            if (jobUp)
            {
                levelUpMessage = $"JOB LEVEL UP! (Job {JobLevel})";
                return true;
            }
            levelUpMessage = null;
            return false;
        }

        public string CycleNextJobClass()
        {
            if (Jobs.Count == 0) return "Novice";
            int idx = Jobs.FindIndex(j => j.Id == CurrentJobId);
            int nextIdx = (idx + 1) % Jobs.Count;
            var nextJob = Jobs[nextIdx];
            CurrentJobId = nextJob.Id;
            BaseLevel = Math.Max(BaseLevel, nextJob.MinBaseLevel);
            JobLevel = Math.Clamp(JobLevel, 1, nextJob.MaxJobLevel);
            return nextJob.Name;
        }

        public (bool questCompleted, QuestBoardDef? completedQuest, string? unlockedJobName) RecordMonsterKill()
        {
            HandbookSlimeKills++;
            HandbookBoarKills++;
            ActiveQuestProgress++;

            var q = ActiveQuest;
            int goal = ActiveQuestGoal;
            if (ActiveQuestProgress < goal)
            {
                return (false, null, null);
            }

            ActiveQuestProgress = 0;
            ActiveQuestIndex = Quests.Count > 0 ? (ActiveQuestIndex + 1) % Quests.Count : 0;

            string? unlockedJobName = null;
            var (_, _, promoted) = GrantExp(q.Rewards.BaseXp, q.Rewards.JobXp);
            if (!string.IsNullOrEmpty(q.Rewards.UnlockJobId))
            {
                var unlockedJob = Jobs.Find(j => j.Id == q.Rewards.UnlockJobId);
                if (unlockedJob != null)
                {
                    CurrentJobId = unlockedJob.Id;
                    BaseLevel = Math.Max(BaseLevel, unlockedJob.MinBaseLevel);
                    JobLevel = 1;
                    CurrentJobExp = 0;
                    unlockedJobName = unlockedJob.Name;
                }
            }
            else if (promoted != null)
            {
                unlockedJobName = promoted;
            }

            return (true, q, unlockedJobName);
        }

        public bool RecordMonsterKill(out string? questCompletedMessage, out string? jobPromotionMessage)
        {
            var (completed, q, unlockedJob) = RecordMonsterKill();
            if (!completed || q == null)
            {
                questCompletedMessage = null;
                jobPromotionMessage = null;
                return false;
            }

            questCompletedMessage =
                $"[Quest] Completed '{q.Title}' [{q.Category}]! Reward: +{q.Rewards.BaseXp} Base EXP, +{q.Rewards.JobXp} Job EXP.";
            jobPromotionMessage = !string.IsNullOrEmpty(unlockedJob)
                ? $"JOB PROMOTED TO {unlockedJob.ToUpperInvariant()}!"
                : null;
            return true;
        }
    }
}
