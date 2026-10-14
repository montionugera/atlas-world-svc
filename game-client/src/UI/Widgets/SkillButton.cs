using System;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Authentically styled Ragnarok Origin (ROX) mobile action button.
    /// Features:
    /// - Multi-layered sculpted gold filigree bezel with cardinal stud rivets
    /// - Deep jewel-toned radial dome with glass specular shine
    /// - Crisp procedural vector iconography (Swords, Meteor, Blizzard, Shield, Wind, Flasks, Auto-Combat)
    /// - Dark radial cooldown sweep with digital countdown timer (e.g. 0.8s)
    /// - Clean ROX skill caption pill on mobile + optional desktop keybind hint badge on desktop
    /// - Touch/click reactive spring scaling & toggle active ring
    /// </summary>
    public partial class SkillButton : Control
    {
        [Signal] public delegate void SkillPressedEventHandler(string skillId);

        [Export] public string SkillId { get; set; } = "attack";
        [Export] public string LabelText { get; set; } = "ATK";
        [Export] public string KeybindText { get; set; } = "";
        [Export] public float Radius { get; set; } = 42.0f;
        [Export] public int StackCount { get; set; } = 0;
        [Export] public Color PrimaryColor { get; set; } = new Color(0.85f, 0.2f, 0.2f, 1f);

        private float _cooldownRemaining = 0f;
        private float _totalCooldown = 0f;
        private bool _isPressed = false;
        private bool _isToggledOn = false;
        private float _togglePulseTime = 0f;
        private double _lastFireTimeSec = -10.0;

        public bool IsReady => _cooldownRemaining <= 0f;
        public bool IsToggledOn => _isToggledOn;

        public void SetToggled(bool active)
        {
            if (_isToggledOn == active)
                return;
            _isToggledOn = active;
            QueueRedraw();
        }

        public void TriggerCooldown(float duration)
        {
            _totalCooldown = duration;
            _cooldownRemaining = duration;
            QueueRedraw();
        }

        public override void _Process(double delta)
        {
            bool needsRedraw = false;
            if (_cooldownRemaining > 0f)
            {
                _cooldownRemaining -= (float)delta;
                if (_cooldownRemaining < 0f) _cooldownRemaining = 0f;
                needsRedraw = true;
            }

            if (_isToggledOn)
            {
                _togglePulseTime += (float)delta;
                needsRedraw = true;
            }

            if (needsRedraw)
            {
                QueueRedraw();
            }
        }

        public override void _GuiInput(InputEvent @event)
        {
            bool press = false;

            if (@event is InputEventScreenTouch touch)
            {
                if (touch.Pressed)
                {
                    _isPressed = true;
                    press = true;
                }
                else
                {
                    _isPressed = false;
                }
                AcceptEvent();
                QueueRedraw();
            }
            else if (@event is InputEventMouseButton mouse && mouse.ButtonIndex == MouseButton.Left)
            {
                if (mouse.Pressed)
                {
                    _isPressed = true;
                    press = true;
                }
                else
                {
                    _isPressed = false;
                }
                AcceptEvent();
                QueueRedraw();
            }

            if (press && _cooldownRemaining <= 0f)
            {
                double now = Time.GetTicksMsec() / 1000.0;
                // Debounce synthesized touch/mouse double-events within 80ms
                if (now - _lastFireTimeSec > 0.08)
                {
                    _lastFireTimeSec = now;
                    EmitSignal(SignalName.SkillPressed, SkillId);
                }
            }
        }

        public override void _Draw()
        {
            Vector2 center = Size * 0.5f;
            float r = _isPressed ? Radius * 0.93f : Radius;

            // 1. Soft Ambient Drop Shadow
            DrawCircle(center + new Vector2(0, 5), r + 3f, new Color(0f, 0f, 0f, 0.55f));

            // 1b. Active Toggle Outer Glow Ring (for AUTO combat button)
            if (_isToggledOn)
            {
                float pulse = 0.65f + 0.35f * Mathf.Sin(_togglePulseTime * 6.0f);
                DrawArc(center, r + 6.5f, 0f, Mathf.Tau, 40, new Color(0.35f, 1.0f, 0.58f, pulse), 3.2f, true);
            }

            // 2. Sculpted Gold Bezel (Triple-layer metallic rim)
            Color goldRimDark = new Color(0.48f, 0.35f, 0.12f, 1f);
            Color goldRimMid = _isToggledOn ? new Color(0.38f, 0.96f, 0.55f, 1f) : new Color(0.86f, 0.70f, 0.28f, 1f);
            Color goldRimLight = new Color(1.0f, 0.94f, 0.62f, 1f);

            DrawCircle(center, r + 4.5f, goldRimDark);
            DrawCircle(center, r + 3.0f, goldRimMid);
            DrawCircle(center, r + 1.2f, goldRimLight);
            DrawCircle(center, r, new Color(0.10f, 0.07f, 0.03f, 1f));

            // 3. Inner Gemstone Core
            Color coreGradient = SkillId switch
            {
                "attack" => new Color(0.78f, 0.14f, 0.14f, 1f),       // Vibrant Crimson
                "dash" => new Color(0.12f, 0.60f, 0.88f, 1f),         // Cyan / Wind
                "skill_1" => new Color(0.92f, 0.44f, 0.08f, 1f),      // Fiery Amber
                "skill_2" => new Color(0.20f, 0.38f, 0.86f, 1f),      // Frost Sapphire
                "skill_3" => new Color(0.12f, 0.68f, 0.42f, 1f),      // Holy Emerald
                "potion_hp" => new Color(0.72f, 0.10f, 0.12f, 1f),    // Health Ruby
                "potion_sp" => new Color(0.10f, 0.42f, 0.88f, 1f),    // Mana Cobalt
                "target_switch" => new Color(0.35f, 0.22f, 0.55f, 1f),// Mystic Amethyst
                "auto_combat" => _isToggledOn
                    ? new Color(0.16f, 0.74f, 0.36f, 1f)              // Active Emerald Jade
                    : new Color(0.18f, 0.36f, 0.28f, 1f),             // Idle Forest Slate
                _ => PrimaryColor
            };

            DrawCircle(center, r - 1.2f, coreGradient);

            // Specular Highlight (Glossy upper curve)
            Vector2 specCenter = center + new Vector2(0, -r * 0.25f);
            DrawCircle(specCenter, r * 0.62f, coreGradient.Lightened(0.40f) with { A = 0.55f });

            // Inner Vignette Ring
            DrawArc(center, r - 2.5f, 0f, Mathf.Tau, 48, new Color(0f, 0f, 0f, 0.45f), 2.5f, true);

            // 4. Filigree Stud Rivets (Cardinal points)
            float studDist = r + 2.8f;
            Color studColor = new Color(1f, 0.96f, 0.82f, 1f);
            DrawCircle(center + new Vector2(0, -studDist), 2.2f, studColor);
            DrawCircle(center + new Vector2(0, studDist), 2.2f, studColor);
            DrawCircle(center + new Vector2(-studDist, 0), 2.2f, studColor);
            DrawCircle(center + new Vector2(studDist, 0), 2.2f, studColor);

            // 5. Procedural Vector Iconography (Crisp vector shapes)
            DrawProceduralIcon(center, r);

            // 6. Cooldown Radial Dark Sweep
            if (_cooldownRemaining > 0f && _totalCooldown > 0f)
            {
                float fraction = _cooldownRemaining / _totalCooldown;
                float sweepAngle = fraction * Mathf.Tau;
                DrawArc(center, (r - 2f) * 0.5f, -Mathf.Pi * 0.5f, -Mathf.Pi * 0.5f + sweepAngle, 40, new Color(0.02f, 0.03f, 0.06f, 0.84f), r - 2f, false);
            }

            // 7. Typography (Bottom Skill Label, Desktop Keybinds, Digital Timer, Potion Counts)
            var font = ThemeDB.FallbackFont;

            // Bottom ROX Skill Label Caption (e.g. METEOR, BLIZZ, AEGIS, DASH, TARGET, AUTO)
            if (!string.IsNullOrEmpty(LabelText) && SkillId != "attack")
            {
                string displayLabel = (SkillId == "auto_combat" && _isToggledOn) ? "AUTO ON" : LabelText;
                int lblSize = Mathf.Max(8, (int)(r * 0.24f));
                Vector2 lblVec = font.GetStringSize(displayLabel, HorizontalAlignment.Center, -1, lblSize);
                Vector2 pillSize = new Vector2(lblVec.X + 8f, lblVec.Y + 2f);
                Vector2 pillPos = center + new Vector2(-pillSize.X * 0.5f, r * 0.52f);
                DrawRect(new Rect2(pillPos, pillSize), new Color(0.04f, 0.06f, 0.10f, 0.86f), true);
                Color lblColor = _isToggledOn
                    ? new Color(0.42f, 1.0f, 0.62f, 1f)
                    : new Color(1f, 0.94f, 0.76f, 0.98f);
                DrawString(font, pillPos + new Vector2(4f, pillSize.Y - 3f), displayLabel, HorizontalAlignment.Center, -1, lblSize, lblColor);
            }

            // Desktop Keybind Badge (only shown on non-mobile platforms so iPad stays authentic mobile HUD)
            if (!OS.HasFeature("mobile") && !string.IsNullOrEmpty(KeybindText))
            {
                int kbSize = Mathf.Max(8, (int)(r * 0.20f));
                Vector2 textSize = font.GetStringSize(KeybindText, HorizontalAlignment.Center, -1, kbSize);
                Vector2 boxSize = textSize + new Vector2(8, 4);
                Vector2 boxPos = center + new Vector2(-r * 0.85f, -r * 0.85f);
                DrawRect(new Rect2(boxPos, boxSize), new Color(0.06f, 0.08f, 0.12f, 0.90f), true);
                DrawRect(new Rect2(boxPos, boxSize), new Color(1.0f, 0.88f, 0.45f, 0.85f), false, 1.2f);
                DrawString(font, boxPos + new Vector2(4, boxSize.Y - 3), KeybindText, HorizontalAlignment.Center, -1, kbSize, new Color(1f, 0.95f, 0.70f, 1f));
            }

            // Potion Stack Badge (e.g. x99)
            if (StackCount > 0)
            {
                string countStr = $"x{StackCount}";
                int countSize = Mathf.Max(9, (int)(r * 0.30f));
                Vector2 cSize = font.GetStringSize(countStr, HorizontalAlignment.Right, -1, countSize);
                Vector2 cPos = center + new Vector2(r * 0.65f - cSize.X, -r * 0.38f);
                DrawString(font, cPos + new Vector2(1, 1), countStr, HorizontalAlignment.Right, -1, countSize, Colors.Black);
                DrawString(font, cPos, countStr, HorizontalAlignment.Right, -1, countSize, new Color(0.35f, 1.0f, 0.55f, 1f));
            }

            // High-Contrast Digital Cooldown Countdown
            if (_cooldownRemaining > 0f)
            {
                string cdText = $"{_cooldownRemaining:0.0}s";
                int cdSize = (int)(r * 0.46f);
                Vector2 cdSizeVec = font.GetStringSize(cdText, HorizontalAlignment.Center, -1, cdSize);
                Vector2 cdPos = center + new Vector2(-cdSizeVec.X * 0.5f, cdSizeVec.Y * 0.35f);
                DrawString(font, cdPos + new Vector2(2, 2), cdText, HorizontalAlignment.Center, -1, cdSize, Colors.Black);
                DrawString(font, cdPos, cdText, HorizontalAlignment.Center, -1, cdSize, new Color(1f, 0.95f, 0.25f, 1f));
            }
        }

        private void DrawProceduralIcon(Vector2 c, float r)
        {
            switch (SkillId)
            {
                case "attack":
                    DrawCrossedSwords(c, r * 0.52f);
                    break;
                case "dash":
                    DrawWindWings(c, r * 0.48f);
                    break;
                case "skill_1":
                    DrawMeteorStrike(c, r * 0.48f);
                    break;
                case "skill_2":
                    DrawBlizzardSnowflake(c, r * 0.50f);
                    break;
                case "skill_3":
                    DrawAegisShield(c, r * 0.50f);
                    break;
                case "potion_hp":
                    DrawPotionFlask(c, r * 0.46f, new Color(0.95f, 0.25f, 0.25f, 1f));
                    break;
                case "potion_sp":
                    DrawPotionFlask(c, r * 0.46f, new Color(0.25f, 0.65f, 1.0f, 1f));
                    break;
                case "target_switch":
                    DrawTargetReticle(c, r * 0.48f);
                    break;
                case "auto_combat":
                    DrawAutoCombatCycle(c, r * 0.52f);
                    break;
                default:
                    DrawCrossedSwords(c, r * 0.5f);
                    break;
            }
        }

        private void DrawAutoCombatCycle(Vector2 c, float size)
        {
            float spin = _isToggledOn ? _togglePulseTime * 2.2f : 0f;
            Color ringCol = _isToggledOn
                ? new Color(1.0f, 0.96f, 0.55f, 1f)
                : new Color(0.88f, 0.94f, 0.88f, 0.92f);

            // Two orbiting cycle arcs
            DrawArc(c, size * 0.78f, spin + 0.25f, spin + Mathf.Pi - 0.25f, 18, ringCol, 2.2f, true);
            DrawArc(c, size * 0.78f, spin + Mathf.Pi + 0.25f, spin + Mathf.Tau - 0.25f, 18, ringCol, 2.2f, true);

            // Miniature crossed swords inside the cycle ring
            DrawCrossedSwords(c, size * 0.55f);
        }

        private void DrawCrossedSwords(Vector2 c, float size)
        {
            DrawSingleSword(c, size, Mathf.Pi * 0.25f);
            DrawSingleSword(c, size, -Mathf.Pi * 0.25f);

            DrawCircle(c, size * 0.18f, new Color(1f, 0.88f, 0.35f, 1f));
            DrawCircle(c, size * 0.12f, new Color(0.85f, 0.2f, 0.2f, 1f));
        }

        private void DrawSingleSword(Vector2 c, float size, float angle)
        {
            Vector2 dir = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));
            Vector2 perp = new Vector2(-dir.Y, dir.X);

            Vector2 tip = c + dir * size;
            Vector2 pommel = c - dir * (size * 0.85f);
            Vector2 guardCenter = c - dir * (size * 0.30f);

            Vector2 bladeL = guardCenter + perp * (size * 0.12f);
            Vector2 bladeR = guardCenter - perp * (size * 0.12f);
            Vector2[] bladePoly = { tip, bladeL, bladeR };
            DrawColoredPolygon(bladePoly, new Color(0.95f, 0.97f, 1.0f, 0.95f));

            DrawLine(guardCenter, tip, new Color(1f, 1f, 1f, 0.8f), 1.5f);

            Vector2 gL = guardCenter + perp * (size * 0.32f);
            Vector2 gR = guardCenter - perp * (size * 0.32f);
            DrawLine(gL, gR, new Color(1.0f, 0.85f, 0.3f, 1f), 3.0f);

            DrawLine(guardCenter, pommel, new Color(0.4f, 0.22f, 0.12f, 1f), 2.5f);
            DrawCircle(pommel, size * 0.10f, new Color(1.0f, 0.85f, 0.3f, 1f));
        }

        private void DrawWindWings(Vector2 c, float size)
        {
            Color windBright = new Color(0.9f, 0.98f, 1.0f, 0.95f);
            Color windTrail = new Color(0.5f, 0.85f, 1.0f, 0.70f);

            for (int i = -1; i <= 1; i++)
            {
                float yOffset = i * (size * 0.32f);
                float curveScale = (i == 0) ? 1.0f : 0.82f;
                Vector2 start = c + new Vector2(-size * 0.7f * curveScale, yOffset + size * 0.2f);
                Vector2 mid = c + new Vector2(0f, yOffset - size * 0.15f * curveScale);
                Vector2 end = c + new Vector2(size * 0.8f * curveScale, yOffset);

                DrawLine(start, mid, windTrail, 2.5f);
                DrawLine(mid, end, windBright, 3.2f);

                Vector2 arrow1 = end + new Vector2(-size * 0.25f, -size * 0.15f);
                Vector2 arrow2 = end + new Vector2(-size * 0.25f, size * 0.15f);
                DrawLine(end, arrow1, windBright, 2.0f);
                DrawLine(end, arrow2, windBright, 2.0f);
            }
        }

        private void DrawMeteorStrike(Vector2 c, float size)
        {
            Vector2 tailEnd = c + new Vector2(-size * 0.85f, -size * 0.85f);
            Vector2 corePos = c + new Vector2(size * 0.20f, size * 0.20f);

            Vector2[] flameTail =
            {
                corePos,
                c + new Vector2(-size * 0.3f, -size * 0.8f),
                tailEnd,
                c + new Vector2(-size * 0.8f, -size * 0.3f)
            };
            DrawColoredPolygon(flameTail, new Color(1.0f, 0.55f, 0.10f, 0.85f));

            DrawCircle(corePos, size * 0.42f, new Color(1.0f, 0.35f, 0.05f, 0.95f));
            DrawCircle(corePos, size * 0.26f, new Color(1.0f, 0.95f, 0.65f, 1f));
            DrawCircle(corePos + new Vector2(-size * 0.06f, -size * 0.06f), size * 0.14f, Colors.White);

            DrawCircle(c + new Vector2(-size * 0.4f, -size * 0.5f), 2.5f, new Color(1f, 0.9f, 0.3f, 1f));
            DrawCircle(c + new Vector2(-size * 0.65f, -size * 0.35f), 2.0f, new Color(1f, 0.8f, 0.2f, 1f));
        }

        private void DrawBlizzardSnowflake(Vector2 c, float size)
        {
            Color iceColor = new Color(0.92f, 0.97f, 1.0f, 0.95f);
            Color iceGlow = new Color(0.5f, 0.8f, 1.0f, 0.8f);

            for (int i = 0; i < 6; i++)
            {
                float ang = i * (Mathf.Pi / 3.0f);
                Vector2 dir = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang));
                Vector2 tip = c + dir * size;

                DrawLine(c, tip, iceColor, 2.5f);

                Vector2 mid = c + dir * (size * 0.60f);
                Vector2 p1 = dir.Rotated(Mathf.Pi * 0.25f) * (size * 0.30f);
                Vector2 p2 = dir.Rotated(-Mathf.Pi * 0.25f) * (size * 0.30f);
                DrawLine(mid, mid + p1, iceGlow, 1.8f);
                DrawLine(mid, mid + p2, iceGlow, 1.8f);
            }

            DrawCircle(c, size * 0.22f, iceColor);
            DrawCircle(c, size * 0.12f, new Color(0.2f, 0.45f, 0.9f, 1f));
        }

        private void DrawAegisShield(Vector2 c, float size)
        {
            Vector2 topL = c + new Vector2(-size * 0.65f, -size * 0.70f);
            Vector2 topR = c + new Vector2(size * 0.65f, -size * 0.70f);
            Vector2 midL = c + new Vector2(-size * 0.65f, 0f);
            Vector2 midR = c + new Vector2(size * 0.65f, 0f);
            Vector2 bottom = c + new Vector2(0f, size * 0.85f);

            Vector2[] shieldPoly = { topL, topR, midR, bottom, midL };
            DrawColoredPolygon(shieldPoly, new Color(0.12f, 0.48f, 0.32f, 0.95f));

            DrawPolyline(new Vector2[] { topL, topR, midR, bottom, midL, topL }, new Color(1.0f, 0.88f, 0.40f, 1f), 2.5f);

            DrawLine(c + new Vector2(0, -size * 0.50f), c + new Vector2(0, size * 0.50f), new Color(1.0f, 0.95f, 0.70f, 1f), 3.0f);
            DrawLine(c + new Vector2(-size * 0.38f, -size * 0.15f), c + new Vector2(size * 0.38f, -size * 0.15f), new Color(1.0f, 0.95f, 0.70f, 1f), 3.0f);
        }

        private void DrawPotionFlask(Vector2 c, float size, Color potionColor)
        {
            Vector2 neckTop = c + new Vector2(0, -size * 0.75f);
            Vector2 neckBottom = c + new Vector2(0, -size * 0.30f);
            float neckW = size * 0.22f;

            DrawRect(new Rect2(neckTop - new Vector2(neckW * 0.8f, size * 0.20f), new Vector2(neckW * 1.6f, size * 0.22f)), new Color(0.72f, 0.48f, 0.24f, 1f), true);

            DrawLine(neckTop - new Vector2(neckW, 0), neckBottom - new Vector2(neckW, 0), new Color(1f, 1f, 1f, 0.7f), 1.5f);
            DrawLine(neckTop + new Vector2(neckW, 0), neckBottom + new Vector2(neckW, 0), new Color(1f, 1f, 1f, 0.7f), 1.5f);

            Vector2 bulbCenter = c + new Vector2(0, size * 0.15f);
            float bulbR = size * 0.65f;

            DrawCircle(bulbCenter, bulbR, potionColor);
            DrawCircle(bulbCenter + new Vector2(-bulbR * 0.25f, -bulbR * 0.25f), bulbR * 0.45f, potionColor.Lightened(0.4f) with { A = 0.7f });
            DrawArc(bulbCenter, bulbR - 1.5f, -Mathf.Pi * 0.75f, -Mathf.Pi * 0.15f, 24, Colors.White with { A = 0.85f }, 2.0f);
            DrawArc(bulbCenter, bulbR, 0f, Mathf.Tau, 36, new Color(0.9f, 0.95f, 1.0f, 0.6f), 2.0f);
        }

        private void DrawTargetReticle(Vector2 c, float size)
        {
            Color reticleColor = new Color(1.0f, 0.88f, 0.35f, 1f);

            DrawArc(c, size * 0.70f, 0f, Mathf.Tau, 36, reticleColor, 2.0f);

            float rInner = size * 0.45f;
            float rOuter = size * 0.88f;
            DrawLine(c + new Vector2(0, -rOuter), c + new Vector2(0, -rInner), reticleColor, 2.2f);
            DrawLine(c + new Vector2(0, rOuter), c + new Vector2(0, rInner), reticleColor, 2.2f);
            DrawLine(c + new Vector2(-rOuter, 0), c + new Vector2(-rInner, 0), reticleColor, 2.2f);
            DrawLine(c + new Vector2(rOuter, 0), c + new Vector2(rInner, 0), reticleColor, 2.2f);

            DrawCircle(c, 3.0f, new Color(1f, 0.25f, 0.25f, 1f));
        }
    }
}
