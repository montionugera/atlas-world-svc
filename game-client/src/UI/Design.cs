using Godot;

namespace AtlasWorld.Client.UI
{
    /// <summary>
    /// SINGLE SOURCE OF TRUTH for the Atlas meta-UI design system.
    ///
    /// Two ideas are fused here on purpose:
    ///  - VALUES = the Joymify fantasy brand (navy #1A2036, gold #FFD700, bronze #CD7F32).
    ///  - ARCHITECTURE = the zen-ui "Warm Sand" token structure: numbered colour scales
    ///    (navy900..navy500, gold400..gold600, ...), a 4px spacing base (S1..S6), a small
    ///    radius scale, a type-size scale, and *semantic aliases* (Background, Surface,
    ///    Primary, TextPrimary, ...) layered on top of the raw scales.
    ///
    /// Nothing in the UI reads a raw hex string. <see cref="ThemeBuilder"/> builds
    /// <c>atlas_theme.tres</c> FROM these tokens, so tokens and styleboxes can never
    /// disagree. Type-variation names are centralised in <see cref="Variants"/> so the
    /// theme and the widgets share one set of C# consts instead of stray string literals.
    /// </summary>
    public static class Design
    {
        // ---- Raw colour scales (zen-style numbered ramps, Joymify values) -------------
        public static class Palette
        {
            // Navy — the fantasy night backdrop family.
            public static readonly Color Navy900 = Color.FromHtml("0F1320");
            public static readonly Color Navy800 = Color.FromHtml("1A2036"); // brand base bg
            public static readonly Color Navy700 = Color.FromHtml("232A45");
            public static readonly Color Navy600 = Color.FromHtml("2E3757");
            public static readonly Color Navy500 = Color.FromHtml("3A4468");

            // Gold — primary accent / call-to-action.
            public static readonly Color Gold400 = Color.FromHtml("FFE24D");
            public static readonly Color Gold500 = Color.FromHtml("FFD700"); // brand gold
            public static readonly Color Gold600 = Color.FromHtml("E6C200");

            // Bronze — secondary accent / structural borders.
            public static readonly Color Bronze400 = Color.FromHtml("DDA05A");
            public static readonly Color Bronze500 = Color.FromHtml("CD7F32"); // brand bronze
            public static readonly Color Bronze600 = Color.FromHtml("A9662A");

            // Sand — warm neutral text ramp.
            public static readonly Color Sand50 = Color.FromHtml("F5EFE0");
            public static readonly Color Sand200 = Color.FromHtml("D8CFBB");
            public static readonly Color Sand400 = Color.FromHtml("A89F8B");
            public static readonly Color Sand600 = Color.FromHtml("6B6355");

            // Feedback.
            public static readonly Color Success = Color.FromHtml("4ADE80");
            public static readonly Color Danger = Color.FromHtml("F87171");
            public static readonly Color Warn = Color.FromHtml("FBBF24");
            public static readonly Color Info = Color.FromHtml("60A5FA");
        }

        // ---- Semantic aliases (what widgets actually reference) ------------------------
        public static class Colors
        {
            public static readonly Color Background = Palette.Navy800;
            public static readonly Color Surface = Palette.Navy700;
            public static readonly Color SurfaceVariant = Palette.Navy600;
            public static readonly Color Well = Palette.Navy900;
            public static Color Scrim => new Color(Palette.Navy900, 0.72f);

            public static readonly Color Primary = Palette.Gold500;
            public static readonly Color PrimaryHover = Palette.Gold400;
            public static readonly Color PrimaryPressed = Palette.Gold600;
            public static readonly Color OnPrimary = Palette.Navy900;

            public static readonly Color Secondary = Palette.Bronze500;
            public static readonly Color SecondaryHover = Palette.Bronze400;

            public static readonly Color TextPrimary = Palette.Sand50;
            public static readonly Color TextSecondary = Palette.Sand400;
            public static readonly Color TextMuted = Palette.Sand600;
            public static readonly Color TextDisabled = new Color(Palette.Sand400, 0.45f);

            public static readonly Color Border = Palette.Navy500;
            public static readonly Color BorderStrong = Palette.Bronze500;
            public static readonly Color FocusRing = Palette.Gold500;

            public static readonly Color Danger = Palette.Danger;
            public static readonly Color OnDanger = Palette.Navy900;
            public static readonly Color Success = Palette.Success;
        }

        // ---- Spacing (4px base) --------------------------------------------------------
        public static class Space
        {
            public const int S1 = 4;
            public const int S2 = 8;
            public const int S3 = 12;
            public const int S4 = 16;
            public const int S5 = 24;
            public const int S6 = 32;
        }

        // ---- Radii ---------------------------------------------------------------------
        public static class Radius
        {
            public const int R1 = 6;
            public const int R2 = 10;
            public const int R3 = 16;
        }

        // ---- Type scale ----------------------------------------------------------------
        public static class Type
        {
            public const int Display = 32;
            public const int H1 = 24;
            public const int H2 = 18;
            public const int Body = 15;
            public const int Caption = 13;
            public const int Value = 16;
        }

        // ---- Responsive ----------------------------------------------------------------
        /// <summary>Below this viewport width the shell uses a bottom tab bar; above, a nav rail.</summary>
        public const int NavBreakpointPx = 900;

        // ---- Theme type-variation names (shared by ThemeBuilder + widgets) -------------
        public static class Variants
        {
            // Button variants (base type "Button").
            public const string PrimaryButton = "PrimaryButton";
            public const string GhostButton = "GhostButton";
            public const string DangerButton = "DangerButton";

            // Panel variants (base type "PanelContainer").
            public const string Card = "Card";
            public const string Well = "Well";

            // Label variants (base type "Label").
            public const string Display = "Display";
            public const string Heading = "Heading";
            public const string Subheading = "Subheading";
            public const string Body = "Body";
            public const string Caption = "Caption";
            public const string Value = "Value";
        }

        // ---- Item rarity (client-side display only) ------------------------------------
        // NOTE (deviation, no-magic): ItemDef in contracts has NO rarity field. Rarity
        // here is a purely cosmetic client tier derived from item.kind so inventory tiles
        // can show coloured borders. It carries no gameplay meaning.
        public enum Rarity
        {
            Common,
            Uncommon,
            Rare,
            Epic,
            Legendary,
        }

        public static Color RarityColor(Rarity rarity) => rarity switch
        {
            Rarity.Common => Palette.Sand400,
            Rarity.Uncommon => Palette.Success,
            Rarity.Rare => Palette.Info,
            Rarity.Epic => Palette.Bronze400,
            Rarity.Legendary => Palette.Gold500,
            _ => Palette.Sand400,
        };

        /// <summary>Cosmetic rarity tier derived from an item kind (see Rarity note).</summary>
        public static Rarity RarityForKind(string? kind) => kind switch
        {
            "weapon" => Rarity.Rare,
            "armor" => Rarity.Uncommon,
            "accessory" => Rarity.Epic,
            "material" => Rarity.Common,
            "consumable" => Rarity.Common,
            _ => Rarity.Common,
        };
    }
}
