using System;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Authentically styled mobile MMORPG floating combat text.
    /// Spawns animated popups for:
    /// - Hits & Criticals (e.g. 388, 299, CRIT! 1,520)
    /// - Skill Shouts (e.g. Auto Counter!, Meteor Strike!!, Blizzard!!)
    /// </summary>
    public partial class FloatingCombatText : Control
    {
        public static FloatingCombatText? Instance { get; private set; }

        public override void _Ready()
        {
            Instance = this;
            MouseFilter = MouseFilterEnum.Ignore;
        }

        public void SpawnDamage(Vector2 screenPos, long damage, bool isCrit = false)
        {
            var label = new Label();
            label.Text = isCrit ? $"CRIT! {damage:N0}" : damage.ToString();
            label.Position = screenPos + new Vector2((float)GD.RandRange(-20, 20), (float)GD.RandRange(-10, 10));
            label.ZIndex = 50;
            label.MouseFilter = MouseFilterEnum.Ignore;

            // Colors & Typography
            Color fontColor = isCrit ? new Color(1.0f, 0.25f, 0.25f, 1f) : new Color(1.0f, 0.88f, 0.25f, 1f);
            int fontSize = isCrit ? 22 : 16;

            label.AddThemeColorOverride("font_color", fontColor);
            label.AddThemeColorOverride("font_shadow_color", new Color(0f, 0f, 0f, 0.95f));
            label.AddThemeConstantOverride("shadow_offset_x", 2);
            label.AddThemeConstantOverride("shadow_offset_y", 2);
            label.AddThemeFontSizeOverride("font_size", fontSize);

            AddChild(label);

            // Pop & Float Tween
            label.Scale = new Vector2(0.5f, 0.5f);
            var tween = CreateTween();
            tween.SetParallel(true);
            tween.TweenProperty(label, "scale", new Vector2(1.25f, 1.25f), 0.12).SetTrans(Tween.TransitionType.Back).SetEase(Tween.EaseType.Out);
            tween.TweenProperty(label, "position:y", label.Position.Y - 55f, 0.75).SetTrans(Tween.TransitionType.Quad).SetEase(Tween.EaseType.Out);
            
            var fadeTween = CreateTween();
            fadeTween.TweenInterval(0.35);
            fadeTween.TweenProperty(label, "modulate:a", 0.0f, 0.40);
            fadeTween.TweenCallback(Callable.From(() => label.QueueFree()));
        }

        public void SpawnSkillShout(Vector2 screenPos, string skillName)
        {
            var label = new Label();
            label.Text = skillName;
            label.Position = screenPos + new Vector2(-60f, -40f);
            label.ZIndex = 50;
            label.MouseFilter = MouseFilterEnum.Ignore;

            label.AddThemeColorOverride("font_color", new Color(0.45f, 0.95f, 1.0f, 1f));
            label.AddThemeColorOverride("font_shadow_color", new Color(0.05f, 0.1f, 0.25f, 0.95f));
            label.AddThemeConstantOverride("shadow_offset_x", 2);
            label.AddThemeConstantOverride("shadow_offset_y", 2);
            label.AddThemeFontSizeOverride("font_size", 18);

            AddChild(label);

            label.Scale = new Vector2(0.6f, 0.6f);
            var tween = CreateTween();
            tween.SetParallel(true);
            tween.TweenProperty(label, "scale", Vector2.One, 0.15).SetTrans(Tween.TransitionType.Back).SetEase(Tween.EaseType.Out);
            tween.TweenProperty(label, "position:y", label.Position.Y - 45f, 0.9).SetTrans(Tween.TransitionType.Quad).SetEase(Tween.EaseType.Out);

            var fadeTween = CreateTween();
            fadeTween.TweenInterval(0.5);
            fadeTween.TweenProperty(label, "modulate:a", 0.0f, 0.4);
            fadeTween.TweenCallback(Callable.From(() => label.QueueFree()));
        }
    }
}
