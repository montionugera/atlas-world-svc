using System;
using System.Globalization;
using AtlasWorld.Client.Net;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Maps a live server entity to the stable registry key form that the contracts codegen
    /// emits into <c>asset-keys.json</c> and that the manifest is keyed by:
    /// <c>mob:&lt;mobTypeId&gt;</c>, <c>projectile:&lt;type&gt;</c>, <c>zone:&lt;effectType&gt;</c>,
    /// and the fixed <c>player</c> / <c>npc</c> (no per-entity subtype).
    /// </summary>
    public static class EntityKeys
    {
        public const string Player = "player";
        public const string Npc = "npc";

        private static readonly string[] SeedMobArchetypes =
        {
            "mob:balanced",
            "mob:aggressive",
            "mob:defensive",
            "mob:double_attacker",
            "mob:hybrid",
            "mob:spear_thrower"
        };

        public static string Mob(string mobTypeId) => "mob:" + Safe(mobTypeId);
        public static string Projectile(string type) => "projectile:" + Safe(type);
        public static string Zone(string effectType) => "zone:" + Safe(effectType);

        /// <summary>
        /// Maps server-rs bestiary IDs (e.g. <c>mob-veil-spearling</c>, <c>mob-bramble-drake</c>,
        /// <c>mob-ashfield-crawler</c>) or direct mob keys to the 6 real 3D character entries in
        /// <c>assets/manifest.json</c> so every live server-rs mob renders as a 3D rigged character.
        /// </summary>
        public static string ServerRsMob(string? mobType)
        {
            string s = mobType ?? "";
            switch (s)
            {
                case "mob-veil-spearling":
                case "veil_spearling":
                case "spear_thrower":
                    return "mob:spear_thrower";
                case "mob-bramble-drake":
                case "bramble_drake":
                case "mob-thorncrown-drake":
                case "thorncrown_drake":
                case "mob-bramble-mother":
                case "aggressive":
                    return "mob:aggressive";
                case "mob-bramble-warden":
                case "bramble_warden":
                case "defensive":
                    return "mob:defensive";
                case "mob-millpond-gnawer":
                case "millpond_gnawer":
                case "mob-ashvale-carrion-hound":
                case "double_attacker":
                    return "mob:double_attacker";
                case "mob-tallgrass-tick":
                case "tallgrass_tick":
                case "hybrid":
                    return "mob:hybrid";
                case "mob-bramble-stalker":
                case "bramble_stalker":
                case "balanced":
                case "":
                    return "mob:balanced";
                default:
                    // Deterministically bucket any other server-rs bestiary ID ("mob-*") into the 6 3D character rigs
                    uint hash = PacketCodec.Fnv1a32(s);
                    return SeedMobArchetypes[hash % (uint)SeedMobArchetypes.Length];
            }
        }

        /// <summary>
        /// Maps server-rs projectile types (e.g. <c>spear</c>, <c>meteor</c>, <c>precision</c>)
        /// to the 3D VFX entries in <c>assets/manifest.json</c>.
        /// </summary>
        public static string ServerRsProjectile(string? projType) => (projType ?? "") switch
        {
            "spear" => "projectile:spear",
            "precision" or "arrow" => "projectile:arrow",
            "meteor" or "blizzard" or "thunder" => "projectile:magicSpear",
            "dash" or "melee" => "projectile:melee",
            _ => "projectile:spear",
        };

        public static string FormatMobDisplayName(string? mobType)
        {
            string s = mobType ?? "";
            switch (s)
            {
                case "mob-veil-spearling":
                case "spear_thrower":
                    return "Lv.56 Veil Spearling";
                case "mob-bramble-drake":
                case "bramble_drake":
                    return "Lv.60 Bramble Drake";
                case "mob-thorncrown-drake":
                case "thorncrown_drake":
                    return "Lv.62 Thorncrown Drake";
                case "mob-bramble-warden":
                case "defensive":
                    return "Lv.58 Bramble Warden";
                case "mob-millpond-gnawer":
                case "double_attacker":
                    return "Lv.54 Millpond Gnawer";
                case "mob-tallgrass-tick":
                case "hybrid":
                    return "Lv.52 Tallgrass Caster";
                case "mob-bramble-stalker":
                case "balanced":
                case "":
                    return "Lv.55 Bramble Stalker";
                default:
                    string cleaned = s.StartsWith("mob-", StringComparison.Ordinal) ? s.Substring(4) : s;
                    cleaned = cleaned.Replace('-', ' ').Replace('_', ' ');
                    return $"Lv.55 {CultureInfo.InvariantCulture.TextInfo.ToTitleCase(cleaned)}";
            }
        }

        public static string FormatMobBadge(string? mobType)
        {
            string s = mobType ?? "";
            if (s.Contains("drake", StringComparison.OrdinalIgnoreCase) ||
                s.Contains("mother", StringComparison.OrdinalIgnoreCase) ||
                s.Contains("matriarch", StringComparison.OrdinalIgnoreCase) ||
                s == "aggressive")
            {
                return "MVP Boss";
            }
            if (s.Contains("warden", StringComparison.OrdinalIgnoreCase) ||
                s.Contains("spearling", StringComparison.OrdinalIgnoreCase) ||
                s.Contains("sentinel", StringComparison.OrdinalIgnoreCase) ||
                s == "spear_thrower" || s == "defensive")
            {
                return "Elite Mob";
            }
            return "Field Mob";
        }

        public static string FormatMobElement(string? mobType) => (mobType ?? "") switch
        {
            var s when s.Contains("drake", StringComparison.OrdinalIgnoreCase) => "Fire / Dragon",
            var s when s.Contains("spear", StringComparison.OrdinalIgnoreCase) => "Wind / Brute",
            var s when s.Contains("warden", StringComparison.OrdinalIgnoreCase) => "Earth / Formless",
            var s when s.Contains("gnawer", StringComparison.OrdinalIgnoreCase) || s.Contains("hound", StringComparison.OrdinalIgnoreCase) => "Water / Beast",
            var s when s.Contains("tick", StringComparison.OrdinalIgnoreCase) || s.Contains("crawler", StringComparison.OrdinalIgnoreCase) => "Shadow / Insect",
            _ => "Earth / Undead",
        };

        private static string Safe(string s) => s ?? "";
    }
}
