using System;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Deterministic analytical + terraced heightfield sampler shared across:
    /// 1. The GPU vertex shader (<c>stylized_grass_floor.gdshader</c>)
    /// 2. CPU entity ground-snapping (<see cref="VerticalSliceRoot"/>, <see cref="EntityManager"/>, <see cref="MapChunkStreamer"/>)
    /// 3. Mac 3D Map Builder Studio terrain sculpting &amp; raycast ground intersection (<see cref="UI.Widgets.MapBuilderDock"/>)
    /// </summary>
    public static class TerrainElevation
    {
        public static float GlobalAmplitude { get; set; } = 1.0f;

        /// <summary>
        /// Evaluates the exact terrain altitude Y (in 3D world meters) at horizontal world coordinate (wx, wz).
        /// Keeps the central combat plaza (-8m .. +8m) gently flat so melee animations and AoE rings sit cleanly,
        /// while rising into rolling outer meadow hills, a northern sanctuary overlook plateau, and any
        /// custom elevation mounds/terraces authored in <see cref="UnifiedMapDocument.HeightTerraces"/>.
        /// </summary>
        public static float SampleHeight(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            float amp = doc?.TerrainAmplitude ?? GlobalAmplitude;
            if (amp <= 0.001f && (doc == null || doc.HeightTerraces.Count == 0))
                return 0f;

            // 1. Base procedural rolling meadow hills & Northern Sanctuary overlook ridge
            float distFromOrigin = Mathf.Sqrt(wx * wx + wz * wz);
            // Central plaza around (0,0) is flat; hills ramp in smoothly outside radius 9m -> 22m
            float outerMask = SmoothStep(9.0f, 22.0f, distFromOrigin);

            // Multi-wave rolling hills (matches stylized_grass_floor.gdshader vertex wave math)
            float waveA = Mathf.Sin(wx * 0.085f + 0.4f) * Mathf.Cos(wz * 0.075f - 0.3f) * 2.15f;
            float waveB = Mathf.Sin((wx * 0.7f - wz * 0.7f) * 0.14f + 1.1f) * 0.85f;

            // Northern Sanctuary Overlook Ridge (gentle elevated terrace for z < -11m)
            float northRamp = SmoothStep(-9.5f, -20.0f, wz);
            float northPlateau = northRamp * 1.65f * SmoothStep(28.0f, 8.0f, Mathf.Abs(wx));

            // Keep the central N-S road slightly carved/level for natural pathing
            float roadCarve = 1.0f - 0.55f * SmoothStep(4.5f, 1.8f, Mathf.Abs(wx));

            float proceduralY = (waveA + waveB) * outerMask * roadCarve + northPlateau;
            float totalY = proceduralY * amp;

            // 2. Authorable Height Terraces / Hills from UnifiedMapDocument
            if (doc != null && doc.HeightTerraces.Count > 0)
            {
                foreach (var terrace in doc.HeightTerraces)
                {
                    float dx = wx - terrace.X;
                    float dz = wz - terrace.Z;
                    float d = Mathf.Sqrt(dx * dx + dz * dz);
                    float outerR = Mathf.Max(1.0f, terrace.Radius);
                    if (d >= outerR)
                        continue;

                    float innerR = outerR * Mathf.Clamp(1.0f - terrace.Falloff, 0.15f, 0.85f);
                    // 1.0 inside innerR (flat tabletop plateau), smooth cosine/hermite ramp down to 0 at outerR
                    float weight = 1.0f - SmoothStep(innerR, outerR, d);
                    totalY += terrace.Height * weight;
                }
            }

            return totalY;
        }

        /// <summary>
        /// Finite-difference surface normal for aligning ground rings or tilted decals.
        /// </summary>
        public static Vector3 SampleNormal(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            const float eps = 0.25f;
            float hL = SampleHeight(wx - eps, wz, doc);
            float hR = SampleHeight(wx + eps, wz, doc);
            float hD = SampleHeight(wx, wz - eps, doc);
            float hU = SampleHeight(wx, wz + eps, doc);
            return new Vector3(hL - hR, 2.0f * eps, hD - hU).Normalized();
        }

        private static float SmoothStep(float edge0, float edge1, float x)
        {
            if (Mathf.IsEqualApprox(edge0, edge1))
                return x >= edge1 ? 1f : 0f;
            float t = Mathf.Clamp((x - edge0) / (edge1 - edge0), 0f, 1f);
            return t * t * (3f - 2f * t);
        }
    }
}
