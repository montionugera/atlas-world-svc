using Godot;

namespace AtlasWorld.Client.UI
{
    /// <summary>
    /// Constructs the Atlas <see cref="Theme"/> entirely from <see cref="Design"/> tokens.
    /// Because every colour / spacing / radius comes from the token module, the produced
    /// styleboxes can never drift from the palette. <see cref="Build"/> returns an
    /// in-memory Theme (used at runtime by the shell); <see cref="ThemeGeneratorTool"/>
    /// saves the same Theme to <c>res://ui/atlas_theme.tres</c> as an inspectable artifact.
    ///
    /// The two user-mandated widgets — <b>Button</b> (Primary/Ghost/Danger, all of
    /// normal/hover/pressed/focus/disabled) and <b>LineEdit</b> (normal + gold focus ring
    /// + caret) — are styled in full below.
    /// </summary>
    public static class ThemeBuilder
    {
        public static Theme Build()
        {
            var theme = new Theme();

            StyleDefaultControls(theme);
            StyleLabels(theme);
            StylePanels(theme);
            StyleButtons(theme);
            StyleLineEdit(theme);
            StyleScrollAndSeparators(theme);

            return theme;
        }

        // ---- StyleBox helpers ----------------------------------------------------------
        private static StyleBoxFlat Filled(Color bg, int radius, Color? border = null, int borderWidth = 0)
        {
            var sb = new StyleBoxFlat
            {
                BgColor = bg,
                CornerRadiusTopLeft = radius,
                CornerRadiusTopRight = radius,
                CornerRadiusBottomLeft = radius,
                CornerRadiusBottomRight = radius,
                ContentMarginLeft = Design.Space.S4,
                ContentMarginRight = Design.Space.S4,
                ContentMarginTop = Design.Space.S3,
                ContentMarginBottom = Design.Space.S3,
            };
            if (border.HasValue && borderWidth > 0)
            {
                sb.BorderColor = border.Value;
                sb.SetBorderWidthAll(borderWidth);
            }
            return sb;
        }

        private static StyleBoxFlat Empty()
        {
            var sb = new StyleBoxFlat { BgColor = new Color(0, 0, 0, 0) };
            sb.SetContentMarginAll(0);
            return sb;
        }

        // ---- Base Control defaults -----------------------------------------------------
        private static void StyleDefaultControls(Theme theme)
        {
            theme.DefaultFontSize = Design.Type.Body;
        }

        // ---- Labels (Display / Heading / Subheading / Body / Caption / Value) ----------
        private static void StyleLabels(Theme theme)
        {
            void Variant(string name, int size, Color color)
            {
                theme.SetTypeVariation(name, "Label");
                theme.SetFontSize("font_size", name, size);
                theme.SetColor("font_color", name, color);
            }

            // Base Label colour.
            theme.SetColor("font_color", "Label", Design.Colors.TextPrimary);

            Variant(Design.Variants.Display, Design.Type.Display, Design.Colors.TextPrimary);
            Variant(Design.Variants.Heading, Design.Type.H1, Design.Colors.TextPrimary);
            Variant(Design.Variants.Subheading, Design.Type.H2, Design.Colors.TextPrimary);
            Variant(Design.Variants.Body, Design.Type.Body, Design.Colors.TextSecondary);
            Variant(Design.Variants.Caption, Design.Type.Caption, Design.Colors.TextMuted);
            Variant(Design.Variants.Value, Design.Type.Value, Design.Colors.Primary);
        }

        // ---- Panels (Card / Well) ------------------------------------------------------
        private static void StylePanels(Theme theme)
        {
            // Base PanelContainer = the shell surface.
            theme.SetStylebox("panel", "PanelContainer",
                Filled(Design.Colors.Surface, Design.Radius.R2));

            theme.SetTypeVariation(Design.Variants.Card, "PanelContainer");
            theme.SetStylebox("panel", Design.Variants.Card,
                Filled(Design.Colors.SurfaceVariant, Design.Radius.R2, Design.Colors.Border, 1));

            theme.SetTypeVariation(Design.Variants.Well, "PanelContainer");
            theme.SetStylebox("panel", Design.Variants.Well,
                Filled(Design.Colors.Well, Design.Radius.R2, Design.Colors.Border, 1));

            // Plain Panel node too (used for scrim / backdrops).
            theme.SetStylebox("panel", "Panel", Filled(Design.Colors.Background, 0));
        }

        // ---- Buttons: 3 variants x {normal,hover,pressed,focus,disabled} ---------------
        private static void StyleButtons(Theme theme)
        {
            // Base Button = neutral surface button (fallback for un-varied buttons).
            ApplyButtonStates(
                theme, "Button",
                normal: Design.Colors.SurfaceVariant,
                hover: Design.Colors.Border,
                pressed: Design.Colors.Surface,
                disabled: new Color(Design.Colors.SurfaceVariant, 0.4f),
                textNormal: Design.Colors.TextPrimary,
                textDisabled: Design.Colors.TextDisabled,
                borderNormal: Design.Colors.Border,
                borderWidth: 1);

            // PRIMARY — solid gold, dark ink. The main CTA.
            theme.SetTypeVariation(Design.Variants.PrimaryButton, "Button");
            ApplyButtonStates(
                theme, Design.Variants.PrimaryButton,
                normal: Design.Colors.Primary,
                hover: Design.Colors.PrimaryHover,
                pressed: Design.Colors.PrimaryPressed,
                disabled: new Color(Design.Colors.Primary, 0.35f),
                textNormal: Design.Colors.OnPrimary,
                textDisabled: new Color(Design.Colors.OnPrimary, 0.55f),
                borderNormal: Design.Colors.Primary,
                borderWidth: 0);

            // GHOST — transparent with a bronze outline; fills faintly on hover.
            theme.SetTypeVariation(Design.Variants.GhostButton, "Button");
            ApplyButtonStates(
                theme, Design.Variants.GhostButton,
                normal: new Color(0, 0, 0, 0),
                hover: new Color(Design.Colors.Secondary, 0.16f),
                pressed: new Color(Design.Colors.Secondary, 0.28f),
                disabled: new Color(0, 0, 0, 0),
                textNormal: Design.Colors.TextPrimary,
                textDisabled: Design.Colors.TextDisabled,
                borderNormal: Design.Colors.BorderStrong,
                borderWidth: 1);

            // DANGER — muted red, brightens on hover.
            theme.SetTypeVariation(Design.Variants.DangerButton, "Button");
            ApplyButtonStates(
                theme, Design.Variants.DangerButton,
                normal: new Color(Design.Colors.Danger, 0.85f),
                hover: Design.Colors.Danger,
                pressed: new Color(Design.Colors.Danger, 0.7f),
                disabled: new Color(Design.Colors.Danger, 0.3f),
                textNormal: Design.Colors.OnDanger,
                textDisabled: new Color(Design.Colors.OnDanger, 0.55f),
                borderNormal: new Color(0, 0, 0, 0),
                borderWidth: 0);
        }

        private static void ApplyButtonStates(
            Theme theme, string type,
            Color normal, Color hover, Color pressed, Color disabled,
            Color textNormal, Color textDisabled,
            Color borderNormal, int borderWidth)
        {
            StyleBoxFlat Make(Color bg) =>
                Filled(bg, Design.Radius.R1, borderNormal, borderWidth);

            theme.SetStylebox("normal", type, Make(normal));
            theme.SetStylebox("hover", type, Make(hover));
            theme.SetStylebox("pressed", type, Make(pressed));
            theme.SetStylebox("disabled", type, Make(disabled));

            // Focus: same radius, a gold focus ring on top (keyboard/controller a11y).
            var focus = Filled(new Color(0, 0, 0, 0), Design.Radius.R1, Design.Colors.FocusRing, 2);
            theme.SetStylebox("focus", type, focus);

            theme.SetColor("font_color", type, textNormal);
            theme.SetColor("font_hover_color", type, textNormal);
            theme.SetColor("font_pressed_color", type, textNormal);
            theme.SetColor("font_focus_color", type, textNormal);
            theme.SetColor("font_disabled_color", type, textDisabled);
            theme.SetFontSize("font_size", type, Design.Type.Body);
        }

        // ---- LineEdit: normal + gold focus ring + caret --------------------------------
        private static void StyleLineEdit(Theme theme)
        {
            var normal = Filled(Design.Colors.Well, Design.Radius.R1, Design.Colors.Border, 1);
            normal.ContentMarginLeft = Design.Space.S3;
            normal.ContentMarginRight = Design.Space.S3;
            normal.ContentMarginTop = Design.Space.S2;
            normal.ContentMarginBottom = Design.Space.S2;
            theme.SetStylebox("normal", "LineEdit", normal);

            // Focus: gold 2px ring — the signature Warm-Sand focus treatment.
            var focus = Filled(Design.Colors.Well, Design.Radius.R1, Design.Colors.FocusRing, 2);
            focus.ContentMarginLeft = Design.Space.S3;
            focus.ContentMarginRight = Design.Space.S3;
            focus.ContentMarginTop = Design.Space.S2;
            focus.ContentMarginBottom = Design.Space.S2;
            theme.SetStylebox("focus", "LineEdit", focus);

            var readOnly = Filled(new Color(Design.Colors.Well, 0.6f), Design.Radius.R1, Design.Colors.Border, 1);
            theme.SetStylebox("read_only", "LineEdit", readOnly);

            theme.SetColor("font_color", "LineEdit", Design.Colors.TextPrimary);
            theme.SetColor("font_placeholder_color", "LineEdit", Design.Colors.TextMuted);
            theme.SetColor("font_selected_color", "LineEdit", Design.Colors.OnPrimary);
            theme.SetColor("selection_color", "LineEdit", new Color(Design.Colors.Primary, 0.45f));
            theme.SetColor("caret_color", "LineEdit", Design.Colors.Primary);
            theme.SetColor("clear_button_color", "LineEdit", Design.Colors.TextSecondary);
            theme.SetConstant("caret_width", "LineEdit", 2);
            theme.SetConstant("minimum_character_width", "LineEdit", 4);
            theme.SetFontSize("font_size", "LineEdit", Design.Type.Body);
        }

        // ---- ScrollContainer + separators ----------------------------------------------
        private static void StyleScrollAndSeparators(Theme theme)
        {
            var sep = new StyleBoxFlat { BgColor = Design.Colors.Border };
            sep.SetContentMarginAll(0);
            sep.SetBorderWidthAll(0);
            theme.SetStylebox("separator", "HSeparator", sep);
            theme.SetConstant("separation", "HSeparator", 2);

            var progressBg = Filled(Design.Colors.Well, Design.Radius.R1, Design.Colors.Border, 1);
            var progressFill = Filled(Design.Colors.Primary, Design.Radius.R1);
            theme.SetStylebox("background", "ProgressBar", progressBg);
            theme.SetStylebox("fill", "ProgressBar", progressFill);
            theme.SetColor("font_color", "ProgressBar", Design.Colors.TextPrimary);
        }
    }
}
