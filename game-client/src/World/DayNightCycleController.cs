using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    public enum WorldDayPhase
    {
        Dawn = 0,
        Day = 1,
        Dusk = 2,
        Night = 3
    }

    /// <summary>
    /// Dynamic 24-hour MMORPG Day/Night &amp; World Time controller (Ragnarok Origin / Ni no Kuni style).
    /// Drives:
    /// 1. 24-hour in-game clock (<see cref="TimeOfDayHours"/> in <c>[0..24)</c>) with configurable cycle speed, pause, and preset jumps.
    /// 2. Solar &amp; Lunar celestial arc on <see cref="DirectionalLight3D"/> (pitch, azimuth, color temperature, energy, shadow softness).
    /// 3. <see cref="WorldEnvironment"/> &amp; <see cref="ProceduralSkyMaterial"/> (sky zenith/horizon gradients, ambient light, fog scatter, glow bloom).
    /// 4. Nighttime Sanctuary Torch &amp; Lantern <see cref="OmniLight3D"/> warm firelight flicker + drifting Meadow Firefly motes.
    /// </summary>
    public sealed class DayNightCycleController
    {
        /// <summary>
        /// Current 24-hour world time (e.g. 6.5 = 06:30, 13.75 = 13:45, 22.0 = 22:00).
        /// Defaults to 10:30 AM (bright morning meadow).
        /// </summary>
        public float TimeOfDayHours { get; private set; } = 10.5f;

        /// <summary>
        /// When true, world time advances automatically at <see cref="HoursPerRealSecond"/>.
        /// </summary>
        public bool AutoAdvance { get; set; } = true;

        /// <summary>
        /// Default rate: 0.10 in-game hours per real second (1 full 24h day = 4 real minutes).
        /// </summary>
        public float HoursPerRealSecond { get; set; } = 0.10f;

        /// <summary>
        /// Normalized 0..1 nighttime factor (0.0 during midday, 1.0 during deep night).
        /// </summary>
        public float NightFactor { get; private set; } = 0f;

        private DirectionalLight3D? _sunMoonLight;
        private Godot.Environment? _environment;
        private ProceduralSkyMaterial? _skyMat;

        private readonly List<OmniLight3D> _sanctuaryLanterns = new();
        private Node3D? _firefliesRoot;
        private readonly List<(MeshInstance3D mesh, Vector3 homePos, float phase)> _fireflies = new();
        private StandardMaterial3D? _fireflyMat;
        private float _flickerClock = 0f;

        private readonly struct AtmosphereKeyframe
        {
            public readonly float Hour;
            public readonly Color SkyTop;
            public readonly Color SkyHorizon;
            public readonly Color GroundHorizon;
            public readonly Color GroundBottom;
            public readonly Color LightColor;
            public readonly float LightEnergy;
            public readonly Color AmbientColor;
            public readonly float AmbientEnergy;
            public readonly Color FogColor;
            public readonly float FogDensity;
            public readonly float GlowIntensity;

            public AtmosphereKeyframe(
                float hour,
                Color skyTop,
                Color skyHorizon,
                Color groundHorizon,
                Color groundBottom,
                Color lightColor,
                float lightEnergy,
                Color ambientColor,
                float ambientEnergy,
                Color fogColor,
                float fogDensity,
                float glowIntensity)
            {
                Hour = hour;
                SkyTop = skyTop;
                SkyHorizon = skyHorizon;
                GroundHorizon = groundHorizon;
                GroundBottom = groundBottom;
                LightColor = lightColor;
                LightEnergy = lightEnergy;
                AmbientColor = ambientColor;
                AmbientEnergy = ambientEnergy;
                FogColor = fogColor;
                FogDensity = fogDensity;
                GlowIntensity = glowIntensity;
            }
        }

        // 24-hour keyframe loop (0:00 -> 5:00 -> 6:30 -> 9:30 -> 13:00 -> 16:30 -> 18:15 -> 20:00 -> 24:00)
        private static readonly AtmosphereKeyframe[] Keyframes =
        {
            // 00:00 Midnight (Starry Indigo-Blue Night)
            new(0.0f,
                skyTop: new Color(0.04f, 0.07f, 0.18f),
                skyHorizon: new Color(0.11f, 0.18f, 0.34f),
                groundHorizon: new Color(0.09f, 0.15f, 0.28f),
                groundBottom: new Color(0.04f, 0.08f, 0.12f),
                lightColor: new Color(0.56f, 0.72f, 1.0f),
                lightEnergy: 0.42f,
                ambientColor: new Color(0.32f, 0.44f, 0.72f),
                ambientEnergy: 0.62f,
                fogColor: new Color(0.10f, 0.16f, 0.30f),
                fogDensity: 0.0058f,
                glowIntensity: 0.78f),

            // 05:00 Pre-Dawn Twilight
            new(5.0f,
                skyTop: new Color(0.08f, 0.13f, 0.28f),
                skyHorizon: new Color(0.28f, 0.26f, 0.44f),
                groundHorizon: new Color(0.22f, 0.22f, 0.36f),
                groundBottom: new Color(0.08f, 0.12f, 0.16f),
                lightColor: new Color(0.72f, 0.74f, 0.96f),
                lightEnergy: 0.55f,
                ambientColor: new Color(0.46f, 0.50f, 0.74f),
                ambientEnergy: 0.72f,
                fogColor: new Color(0.24f, 0.24f, 0.40f),
                fogDensity: 0.0052f,
                glowIntensity: 0.68f),

            // 06:30 Golden-Rose Sunrise (Dawn)
            new(6.5f,
                skyTop: new Color(0.22f, 0.42f, 0.78f),
                skyHorizon: new Color(0.98f, 0.64f, 0.46f),
                groundHorizon: new Color(0.92f, 0.60f, 0.44f),
                groundBottom: new Color(0.20f, 0.32f, 0.20f),
                lightColor: new Color(1.0f, 0.76f, 0.52f),
                lightEnergy: 1.02f,
                ambientColor: new Color(0.94f, 0.78f, 0.68f),
                ambientEnergy: 0.95f,
                fogColor: new Color(0.92f, 0.68f, 0.54f),
                fogDensity: 0.0046f,
                glowIntensity: 0.58f),

            // 09:30 Crisp Morning Sun
            new(9.5f,
                skyTop: new Color(0.28f, 0.58f, 0.96f),
                skyHorizon: new Color(0.82f, 0.92f, 1.0f),
                groundHorizon: new Color(0.78f, 0.90f, 0.96f),
                groundBottom: new Color(0.24f, 0.42f, 0.22f),
                lightColor: new Color(1.0f, 0.95f, 0.84f),
                lightEnergy: 1.26f,
                ambientColor: new Color(0.95f, 0.92f, 0.88f),
                ambientEnergy: 1.12f,
                fogColor: new Color(0.78f, 0.90f, 0.98f),
                fogDensity: 0.0036f,
                glowIntensity: 0.45f),

            // 13:00 High Noon Radiant Blue
            new(13.0f,
                skyTop: new Color(0.24f, 0.54f, 0.95f),
                skyHorizon: new Color(0.84f, 0.94f, 1.0f),
                groundHorizon: new Color(0.80f, 0.92f, 0.96f),
                groundBottom: new Color(0.25f, 0.44f, 0.23f),
                lightColor: new Color(1.0f, 0.97f, 0.90f),
                lightEnergy: 1.34f,
                ambientColor: new Color(0.96f, 0.95f, 0.92f),
                ambientEnergy: 1.18f,
                fogColor: new Color(0.80f, 0.92f, 0.98f),
                fogDensity: 0.0032f,
                glowIntensity: 0.42f),

            // 16:30 Warm Afternoon
            new(16.5f,
                skyTop: new Color(0.26f, 0.52f, 0.88f),
                skyHorizon: new Color(0.94f, 0.84f, 0.72f),
                groundHorizon: new Color(0.88f, 0.78f, 0.66f),
                groundBottom: new Color(0.22f, 0.38f, 0.20f),
                lightColor: new Color(1.0f, 0.88f, 0.68f),
                lightEnergy: 1.18f,
                ambientColor: new Color(0.96f, 0.86f, 0.76f),
                ambientEnergy: 1.04f,
                fogColor: new Color(0.90f, 0.80f, 0.68f),
                fogDensity: 0.0040f,
                glowIntensity: 0.50f),

            // 18:20 Amber-Crimson Sunset (Dusk)
            new(18.33f,
                skyTop: new Color(0.18f, 0.24f, 0.52f),
                skyHorizon: new Color(0.98f, 0.48f, 0.32f),
                groundHorizon: new Color(0.88f, 0.44f, 0.32f),
                groundBottom: new Color(0.14f, 0.20f, 0.16f),
                lightColor: new Color(1.0f, 0.62f, 0.36f),
                lightEnergy: 0.94f,
                ambientColor: new Color(0.86f, 0.62f, 0.58f),
                ambientEnergy: 0.84f,
                fogColor: new Color(0.86f, 0.50f, 0.40f),
                fogDensity: 0.0048f,
                glowIntensity: 0.64f),

            // 20:00 Deep Indigo Evening
            new(20.0f,
                skyTop: new Color(0.05f, 0.09f, 0.22f),
                skyHorizon: new Color(0.15f, 0.22f, 0.40f),
                groundHorizon: new Color(0.12f, 0.18f, 0.32f),
                groundBottom: new Color(0.05f, 0.09f, 0.13f),
                lightColor: new Color(0.60f, 0.75f, 1.0f),
                lightEnergy: 0.46f,
                ambientColor: new Color(0.36f, 0.48f, 0.76f),
                ambientEnergy: 0.65f,
                fogColor: new Color(0.12f, 0.19f, 0.34f),
                fogDensity: 0.0056f,
                glowIntensity: 0.75f),

            // 24:00 Wrap to Midnight
            new(24.0f,
                skyTop: new Color(0.04f, 0.07f, 0.18f),
                skyHorizon: new Color(0.11f, 0.18f, 0.34f),
                groundHorizon: new Color(0.09f, 0.15f, 0.28f),
                groundBottom: new Color(0.04f, 0.08f, 0.12f),
                lightColor: new Color(0.56f, 0.72f, 1.0f),
                lightEnergy: 0.42f,
                ambientColor: new Color(0.32f, 0.44f, 0.72f),
                ambientEnergy: 0.62f,
                fogColor: new Color(0.10f, 0.16f, 0.30f),
                fogDensity: 0.0058f,
                glowIntensity: 0.78f)
        };

        public void Initialize(Node3D root, UnifiedMapDocument? mapDoc)
        {
            _sunMoonLight = root.GetNodeOrNull<DirectionalLight3D>("DirectionalLight3D");
            var worldEnv = root.GetNodeOrNull<WorldEnvironment>("WorldEnvironment");
            if (worldEnv?.Environment != null)
            {
                // Duplicate so runtime tweaks don't dirty shared scene resources unexpectedly
                _environment = (Godot.Environment)worldEnv.Environment.Duplicate();
                worldEnv.Environment = _environment;
                if (_environment.Sky?.SkyMaterial is ProceduralSkyMaterial pSky)
                {
                    _skyMat = (ProceduralSkyMaterial)pSky.Duplicate();
                    _environment.Sky = (Sky)_environment.Sky.Duplicate();
                    _environment.Sky.SkyMaterial = _skyMat;
                }
            }

            if (mapDoc != null)
            {
                TimeOfDayHours = Wrap24(mapDoc.DefaultTimeOfDayHours);
                AutoAdvance = mapDoc.AutoAdvanceDayNight;
                HoursPerRealSecond = Mathf.Clamp(mapDoc.DayNightSpeedHoursPerSec, 0.0f, 2.0f);
            }

            SetupSanctuaryLanternsAndFireflies(root, mapDoc);

            // Check optional CLI / env override for deterministic screenshot testing (e.g. ATLAS_TIME_OF_DAY=21.5)
            string envTime = OS.GetEnvironment("ATLAS_TIME_OF_DAY");
            if (!string.IsNullOrWhiteSpace(envTime) &&
                float.TryParse(envTime, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float parsedHour))
            {
                SetTimeOfDay(parsedHour, mapDoc);
                AutoAdvance = false;
            }
            else
            {
                ApplyAtmosphereForHour(TimeOfDayHours, mapDoc);
            }
        }

        private void SetupSanctuaryLanternsAndFireflies(Node3D root, UnifiedMapDocument? mapDoc)
        {
            _sanctuaryLanterns.Clear();

            // Attach warm point lights to Torch1 & Torch2 plus the North Sanctuary Pillars
            Vector3[] lanternPositions =
            {
                new(-1.8f, 1.45f, -2.5f),
                new( 1.8f, 1.45f, -2.5f),
                new(-4.6f, 2.60f, -10.5f),
                new( 4.6f, 2.60f, -10.5f),
                new( 0.0f, 3.40f, -17.5f)
            };

            var lanternContainer = new Node3D { Name = "DayNightLanterns" };
            root.AddChild(lanternContainer);

            for (int i = 0; i < lanternPositions.Length; i++)
            {
                Vector3 p = lanternPositions[i];
                float groundY = TerrainElevation.SampleHeight(p.X, p.Z, mapDoc);
                var omni = new OmniLight3D
                {
                    Name = $"SanctuaryLantern_{i + 1}",
                    Position = new Vector3(p.X, groundY + p.Y, p.Z),
                    LightColor = new Color(1.0f, 0.72f, 0.34f),
                    LightEnergy = 0.0f,
                    OmniRange = 9.5f,
                    OmniAttenuation = 1.25f,
                    ShadowEnabled = false
                };
                lanternContainer.AddChild(omni);
                _sanctuaryLanterns.Add(omni);
            }

            // Spawn 24 gentle glowing meadow fireflies that awaken at Dusk & Night
            _fireflies.Clear();
            _firefliesRoot = new Node3D { Name = "NightFireflies", Visible = false };
            root.AddChild(_firefliesRoot);

            _fireflyMat = new StandardMaterial3D
            {
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                AlbedoColor = new Color(0.78f, 1.0f, 0.42f, 0.0f)
            };

            var orbMesh = new SphereMesh
            {
                Radius = 0.065f,
                Height = 0.13f,
                RadialSegments = 8,
                Rings = 4
            };

            for (int i = 0; i < 24; i++)
            {
                float angle = i * (Mathf.Tau / 24f) + (i % 3) * 0.22f;
                float radius = 4.5f + (i % 5) * 3.1f;
                float fx = Mathf.Cos(angle) * radius;
                float fz = Mathf.Sin(angle) * radius - 2.0f;
                float fy = TerrainElevation.SampleHeight(fx, fz, mapDoc) + 0.85f + (i % 4) * 0.35f;

                var inst = new MeshInstance3D
                {
                    Mesh = orbMesh,
                    MaterialOverride = _fireflyMat,
                    Position = new Vector3(fx, fy, fz)
                };
                _firefliesRoot.AddChild(inst);
                _fireflies.Add((inst, new Vector3(fx, fy, fz), i * 0.73f));
            }
        }

        public void SetTimeOfDay(float hours, UnifiedMapDocument? mapDoc = null)
        {
            TimeOfDayHours = Wrap24(hours);
            ApplyAtmosphereForHour(TimeOfDayHours, mapDoc);
        }

        /// <summary>
        /// Cycles to the next major time-of-day preset (Dawn 06:30 -> Noon 12:30 -> Sunset 18:15 -> Night 22:30).
        /// </summary>
        public WorldDayPhase CycleNextPreset(UnifiedMapDocument? mapDoc = null)
        {
            WorldDayPhase current = CurrentPhase;
            float nextHour = current switch
            {
                WorldDayPhase.Dawn => 12.5f,
                WorldDayPhase.Day => 18.25f,
                WorldDayPhase.Dusk => 22.5f,
                _ => 6.5f
            };
            SetTimeOfDay(nextHour, mapDoc);
            return CurrentPhase;
        }

        public void Update(float dt, UnifiedMapDocument? mapDoc = null)
        {
            _flickerClock += dt;

            if (AutoAdvance && HoursPerRealSecond > 0f)
            {
                TimeOfDayHours = Wrap24(TimeOfDayHours + dt * HoursPerRealSecond);
            }

            ApplyAtmosphereForHour(TimeOfDayHours, mapDoc);
        }

        public WorldDayPhase CurrentPhase => GetPhase(TimeOfDayHours);

        public static WorldDayPhase GetPhase(float hour)
        {
            float h = Wrap24(hour);
            if (h >= 5.25f && h < 7.75f)
                return WorldDayPhase.Dawn;
            if (h >= 7.75f && h < 17.25f)
                return WorldDayPhase.Day;
            if (h >= 17.25f && h < 19.5f)
                return WorldDayPhase.Dusk;
            return WorldDayPhase.Night;
        }

        public string FormattedClockString
        {
            get
            {
                int totalMinutes = (int)Mathf.Floor(Wrap24(TimeOfDayHours) * 60f) % (24 * 60);
                int hh = totalMinutes / 60;
                int mm = totalMinutes % 60;
                return $"{hh:D2}:{mm:D2}";
            }
        }

        public string PhaseDisplayName => CurrentPhase switch
        {
            WorldDayPhase.Dawn => "DAWN",
            WorldDayPhase.Day => "DAY",
            WorldDayPhase.Dusk => "DUSK",
            _ => "NIGHT"
        };

        public string PhaseIconGlyph => CurrentPhase switch
        {
            WorldDayPhase.Dawn => "\u2600",
            WorldDayPhase.Day => "\u2600",
            WorldDayPhase.Dusk => "\u25d0",
            _ => "\u263e"
        };

        private void ApplyAtmosphereForHour(float hour, UnifiedMapDocument? mapDoc)
        {
            float h = Wrap24(hour);

            // 1. Interpolate between surrounding AtmosphereKeyframes
            AtmosphereKeyframe k0 = Keyframes[0];
            AtmosphereKeyframe k1 = Keyframes[^1];
            for (int i = 0; i < Keyframes.Length - 1; i++)
            {
                if (h >= Keyframes[i].Hour && h <= Keyframes[i + 1].Hour)
                {
                    k0 = Keyframes[i];
                    k1 = Keyframes[i + 1];
                    break;
                }
            }

            float span = Mathf.Max(0.001f, k1.Hour - k0.Hour);
            float t = Mathf.SmoothStep(0f, 1f, Mathf.Clamp((h - k0.Hour) / span, 0f, 1f));

            Color skyTop = k0.SkyTop.Lerp(k1.SkyTop, t);
            Color skyHorizon = k0.SkyHorizon.Lerp(k1.SkyHorizon, t);
            Color groundHorizon = k0.GroundHorizon.Lerp(k1.GroundHorizon, t);
            Color groundBottom = k0.GroundBottom.Lerp(k1.GroundBottom, t);
            Color lightColor = k0.LightColor.Lerp(k1.LightColor, t);
            float lightEnergy = Mathf.Lerp(k0.LightEnergy, k1.LightEnergy, t);
            Color ambientColor = k0.AmbientColor.Lerp(k1.AmbientColor, t);
            float ambientEnergy = Mathf.Lerp(k0.AmbientEnergy, k1.AmbientEnergy, t);
            Color fogColor = k0.FogColor.Lerp(k1.FogColor, t);
            float fogDensity = Mathf.Lerp(k0.FogDensity, k1.FogDensity, t);
            float glowIntensity = Mathf.Lerp(k0.GlowIntensity, k1.GlowIntensity, t);

            // Compute NightFactor (0 during 07:30..17:00, ramps to 1.0 during 19:30..05:30)
            if (h >= 7.5f && h <= 17.0f)
                NightFactor = 0f;
            else if (h > 17.0f && h < 19.5f)
                NightFactor = Mathf.SmoothStep(0f, 1f, (h - 17.0f) / 2.5f);
            else if (h >= 5.0f && h < 7.5f)
                NightFactor = 1f - Mathf.SmoothStep(0f, 1f, (h - 5.0f) / 2.5f);
            else
                NightFactor = 1f;

            // 2. Apply Sky & WorldEnvironment parameters
            if (_skyMat != null)
            {
                _skyMat.SkyTopColor = skyTop;
                _skyMat.SkyHorizonColor = skyHorizon;
                _skyMat.GroundHorizonColor = groundHorizon;
                _skyMat.GroundBottomColor = groundBottom;
            }

            if (_environment != null)
            {
                _environment.AmbientLightColor = ambientColor;
                _environment.AmbientLightEnergy = ambientEnergy;
                _environment.FogLightColor = fogColor;
                _environment.FogDensity = fogDensity;
                _environment.GlowIntensity = glowIntensity;
            }

            // 3. Apply Solar (06:00..18:30) or Lunar (18:30..06:00) DirectionalLight3D trajectory
            if (_sunMoonLight != null)
            {
                _sunMoonLight.LightColor = lightColor;
                _sunMoonLight.LightEnergy = lightEnergy;
                _sunMoonLight.ShadowOpacity = Mathf.Lerp(0.68f, 0.42f, NightFactor);

                float pitchDeg;
                float yawDeg;
                if (h >= 6.0f && h <= 18.5f)
                {
                    // Daytime solar arc: rises in East (-75° yaw), peaks at 58° elevation at noon, sets in West (+75° yaw)
                    float dayFrac = (h - 6.0f) / 12.5f;
                    pitchDeg = -Mathf.Lerp(16.0f, 58.0f, Mathf.Sin(dayFrac * Mathf.Pi));
                    yawDeg = Mathf.Lerp(-68.0f, 68.0f, dayFrac);
                }
                else
                {
                    // Nighttime lunar arc: cool silver moonlight casting gentle shadows from high south-west
                    float nightHours = h > 18.5f ? (h - 18.5f) : (h + 5.5f);
                    float nightFrac = nightHours / 11.5f;
                    pitchDeg = -Mathf.Lerp(26.0f, 48.0f, Mathf.Sin(nightFrac * Mathf.Pi));
                    yawDeg = Mathf.Lerp(-42.0f, 42.0f, nightFrac);
                }

                _sunMoonLight.RotationDegrees = new Vector3(pitchDeg, yawDeg, 0f);
            }

            // 4. Update Sanctuary Torch / Lantern warm point lights & Firefly motes at Dusk / Night
            float lanternFactor = Mathf.SmoothStep(0.15f, 0.75f, NightFactor);
            for (int i = 0; i < _sanctuaryLanterns.Count; i++)
            {
                OmniLight3D omni = _sanctuaryLanterns[i];
                if (!GodotObject.IsInstanceValid(omni))
                    continue;
                omni.Visible = lanternFactor > 0.01f;
                if (omni.Visible)
                {
                    float flicker = 1.0f + 0.12f * Mathf.Sin(_flickerClock * 6.5f + i * 1.7f)
                                         + 0.06f * Mathf.Cos(_flickerClock * 13.2f + i * 2.9f);
                    omni.LightEnergy = 1.95f * lanternFactor * flicker;
                }
            }

            if (_firefliesRoot != null)
            {
                _firefliesRoot.Visible = lanternFactor > 0.08f;
                if (_firefliesRoot.Visible)
                {
                    if (_fireflyMat != null)
                    {
                        float pulse = 0.65f + 0.35f * Mathf.Sin(_flickerClock * 3.2f);
                        _fireflyMat.AlbedoColor = new Color(0.80f, 1.0f, 0.44f, Mathf.Clamp(lanternFactor * pulse, 0f, 0.92f));
                    }

                    for (int i = 0; i < _fireflies.Count; i++)
                    {
                        var (mesh, home, phase) = _fireflies[i];
                        if (!GodotObject.IsInstanceValid(mesh))
                            continue;
                        float dx = Mathf.Sin(_flickerClock * 1.3f + phase) * 0.55f;
                        float dy = Mathf.Cos(_flickerClock * 1.9f + phase * 1.4f) * 0.28f;
                        float dz = Mathf.Cos(_flickerClock * 1.1f + phase * 0.8f) * 0.55f;
                        mesh.Position = home + new Vector3(dx, dy, dz);
                    }
                }
            }
        }

        private static float Wrap24(float h)
        {
            float mod = h % 24f;
            return mod < 0f ? mod + 24f : mod;
        }
    }
}
