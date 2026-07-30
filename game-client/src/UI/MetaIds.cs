using System;
using System.Collections.Generic;

namespace AtlasWorld.Client.UI
{
    /// <summary>
    /// Byte-for-byte mirror of <c>contracts/src/meta/ids.ts</c> (there is no build-time
    /// link, so any change server-side must be hand-mirrored here — same contract the
    /// Flutter client honoured). Plus a small client-side content catalog mirrored from
    /// <c>contracts/content/*.json</c> for display names / rarity, and a quest display-name
    /// map (QuestDef has no <c>name</c> field on the wire).
    /// </summary>
    public static class MetaIds
    {
        public static class Collections
        {
            public const string Profile = "profile";
            public const string Inventory = "inventory";
            public const string Equipment = "equipment";
            public const string Skills = "skills";
            public const string Quests = "quests";
        }

        public const string StorageKey = "main";

        public static class Rpc
        {
            // get_loadout is intentionally omitted: it is S2S-only and MUST NOT be called
            // by a client session (Nakama throws). The Loadout screen reads storage docs.
            public const string ReportMatchEvents = "report_match_events";
            public const string EquipItem = "equip_item";
            public const string AllocateStats = "allocate_stats";
            public const string SetSkillLoadout = "set_skill_loadout";
            public const string AcceptQuest = "accept_quest";
            public const string ClaimQuestReward = "claim_quest_reward";
        }

        public const int MaxSkillLoadout = 4;

        /// <summary>Pinned level curve, mirrors nakama/src/leveling.ts: 100 * level.</summary>
        public static int XpToNext(int level) => 100 * level;
    }

    /// <summary>Minimal item definition mirrored from contracts/content/items.json.</summary>
    public sealed record ItemDef(string Id, string Name, string Kind, bool Stackable, int PAtk = 0, int MAtk = 0, string? AtkStat = null);

    /// <summary>Minimal skill definition mirrored from contracts/content/skills.json.</summary>
    public sealed record SkillDef(string Id, string Name, int MaxLevel);

    /// <summary>
    /// Hand-mirrored client catalog (drift risk noted — see MetaIds summary). Used only
    /// for display names / rarity; the server remains the authority on effects.
    /// </summary>
    public static class Catalog
    {
        public static readonly Dictionary<string, ItemDef> ItemsById = new()
        {
            ["basic_sword"] = new("basic_sword", "Basic Sword", "weapon", false, 10, 0, "str"),
            ["magic_staff"] = new("magic_staff", "Magic Staff", "weapon", false, 2, 15, "int"),
            ["great_bow"] = new("great_bow", "Great Bow", "weapon", false, 16, 0, "dex"),
            ["dagger"] = new("dagger", "Dagger", "weapon", false, 6, 0, "str"),
            ["scythe"] = new("scythe", "Scythe", "weapon", false, 18, 0, "str"),
            ["potion_minor"] = new("potion_minor", "Minor Healing Potion", "consumable", true),
            ["leather_armor"] = new("leather_armor", "Leather Armor", "armor", false),
            ["iron_ore"] = new("iron_ore", "Iron Ore", "material", true),
        };

        public static readonly Dictionary<string, SkillDef> SkillsById = new()
        {
            ["power_strike"] = new("power_strike", "Power Strike", 5),
            ["fireball"] = new("fireball", "Fireball", 5),
            ["iron_skin"] = new("iron_skin", "Iron Skin", 3),
            ["cleave"] = new("cleave", "Cleave", 5),
        };

        /// <summary>QuestDef carries no name on the wire — client supplies display names.</summary>
        public static readonly Dictionary<string, string> QuestDisplay = new()
        {
            ["q_boar_5"] = "Slay 5 Boars",
            ["q_gather_ore"] = "Gather 10 Iron Ore",
            ["q_explore_forest"] = "Explore the Forest",
        };

        public static string ItemName(string itemId) =>
            ItemsById.TryGetValue(itemId, out ItemDef? d) ? d.Name : itemId;

        public static string SkillName(string skillId) =>
            SkillsById.TryGetValue(skillId, out SkillDef? d) ? d.Name : skillId;

        public static string QuestName(string questId) =>
            QuestDisplay.TryGetValue(questId, out string? n) ? n : questId;

        /// <summary>Infer the equip slot for a unique item from its kind (equip_item payload).</summary>
        public static string? SlotForItem(string itemId)
        {
            if (!ItemsById.TryGetValue(itemId, out ItemDef? d)) return null;
            return d.Kind switch
            {
                "weapon" => "weapon",
                "armor" => "armor",
                "accessory" => "accessory",
                _ => null, // consumable / material are not equippable
            };
        }
    }

    /// <summary>
    /// Derived combat stats — C# port of contracts/src/meta/derivedStats.ts.
    ///
    /// Multiplicative: grow(level) enters atk, def and maxHealth as exactly ONE factor,
    /// so it cancels out of the attack/defence ratio. Offence reads exactly ONE primary
    /// stat, chosen by the equipped weapon's AtkStat (bow -> dex, casting -> int,
    /// blade -> str). Both defences come off vit alone.
    ///
    /// There is NO codegen between this and the TypeScript original — change both
    /// together, or the Loadout screen shows stats the server does not agree with.
    /// The constants are solved from an anchor (level 1, all primaries 1, basic_sword
    /// reproduces the pre-F018 numbers); do not tune them here.
    ///
    /// Returns doubles, not ints: the formula produces fractional values and truncating
    /// them would make this readout disagree with the server.
    /// </summary>
    public static class MetaFormulas
    {
        const double Growth = 1.045, StatCoef = 0.5, StatMax = 99;
        const double BaseHp = 108.9, BaseAtk = 19.602, BaseDef = 5.94;
        const double GearReference = 18, UnarmedGear = 0.25;

        static double Share(double p) => Math.Min(StatMax, Math.Max(1, p)) / StatMax;

        public static (double maxHealth, double pAtk, double mAtk, double pDef, double mDef, double maxMoveSpeed)
            Derived(int level, double str, double agi, double @int, double vit, double dex, string? weaponItemId)
        {
            // Unarmed: str, fully physical, and strictly worse than any weapon.
            double gear = UnarmedGear, rho = 1, offStat = str;

            if (weaponItemId != null
                && Catalog.ItemsById.TryGetValue(weaponItemId, out ItemDef? w)
                && w.Kind == "weapon"
                && w.AtkStat != null)
            {
                double total = w.PAtk + w.MAtk;
                if (total > 0)
                {
                    gear = total / GearReference;
                    rho = w.PAtk / total;
                }
                offStat = w.AtkStat switch { "dex" => dex, "int" => @int, _ => str };
            }

            double grow = Math.Pow(Growth, level - 1);
            double offMagnitude = 1 + 2 * StatCoef * Share(offStat);
            double defMagnitude = 1 + 2 * StatCoef * Share(vit);

            double atk = BaseAtk * grow * offMagnitude * gear;
            double def = BaseDef * grow * defMagnitude;

            return (
                maxHealth: BaseHp * grow * defMagnitude,
                // rho + (1-rho) sums to 1, so the two multipliers sum to 2 and total
                // offence is conserved across any channel split. A blade (rho 1) yields
                // mAtk of exactly 0 — intended: magic needs a magic weapon.
                pAtk: atk * 2 * rho,
                mAtk: atk * 2 * (1 - rho),
                pDef: def,
                mDef: def,
                // Additive on purpose: move speed is on neither side of the attack/
                // defence ratio, so it already cancels.
                maxMoveSpeed: 20 + 0.2 * agi);
        }
    }
}
