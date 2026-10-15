using System;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Deterministic analytical + terraced 3D heightfield, Multi-Floor Structure Deck &amp; Cave solver shared across:
    /// 1. The GPU vertex shader (<c>stylized_grass_floor.gdshader</c>)
    /// 2. CPU entity ground-snapping, multi-floor tower ramps, underground caves &amp; steep-cliff wall sliding
    ///    (<see cref="VerticalSliceRoot"/>, <see cref="EntityManager"/>, <see cref="MapChunkStreamer"/>)
    /// 3. Mac 3D Map Builder Studio terrain sculpting &amp; raycast ground intersection (<see cref="UI.Widgets.MapBuilderDock"/>)
    /// </summary>
    public static class TerrainElevation
    {
        public static float GlobalAmplitude { get; set; } = 1.0f;

        /// <summary>
        /// Maximum walkable terrain slope angle in degrees (38°).
        /// Slopes gentler than or equal to 38° are walkable hills/ramps; slopes steeper than 38°
        /// act as impassable cliff walls that slide movement along the contour tangent.
        /// </summary>
        public const float MaxWalkableSlopeDeg = 38.0f;

        /// <summary>
        /// Maximum vertical step-up height (in meters) an entity can climb in a single frame without a ramp.
        /// Prevents ground-floor players from teleporting onto a +3.2m 2nd-floor tower roof when walking underneath it.
        /// </summary>
        public const float MaxStepUpHeight = 1.25f;

        /// <summary>
        /// Evaluates the base terrain heightfield Y (hills + terraces, excluding multi-floor building decks/caves) at (wx, wz).
        /// </summary>
        public static float SampleBaseTerrainHeight(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            float amp = doc?.TerrainAmplitude ?? GlobalAmplitude;
            if (amp <= 0.001f && (doc == null || doc.HeightTerraces.Count == 0))
                return 0f;

            // 1. Base procedural rolling meadow hills & Northern Sanctuary overlook ridge
            float distFromOrigin = Mathf.Sqrt(wx * wx + wz * wz);
            float outerMask = SmoothStep(9.0f, 22.0f, distFromOrigin);

            float waveA = Mathf.Sin(wx * 0.085f + 0.4f) * Mathf.Cos(wz * 0.075f - 0.3f) * 2.15f;
            float waveB = Mathf.Sin((wx * 0.7f - wz * 0.7f) * 0.14f + 1.1f) * 0.85f;

            float northRamp = SmoothStep(-9.5f, -20.0f, wz);
            float northPlateau = northRamp * 1.65f * SmoothStep(28.0f, 8.0f, Mathf.Abs(wx));

            float roadCarve = 1.0f - 0.55f * SmoothStep(4.5f, 1.8f, Mathf.Abs(wx));

            float proceduralY = (waveA + waveB) * outerMask * roadCarve + northPlateau;
            float totalY = proceduralY * amp;

            // 2. Authorable Height Terraces / Hills / Steep Cliffs from UnifiedMapDocument
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

                    float innerR = outerR * Mathf.Clamp(1.0f - terrace.Falloff, 0.08f, 0.92f);
                    float weight = 1.0f - SmoothStep(innerR, outerR, d);
                    totalY += terrace.Height * weight;
                }
            }

            return totalY;
        }

        /// <summary>
        /// Evaluates the walkable floor altitude Y at (wx, wz).
        /// When <paramref name="currentEntityY"/> is provided (not <c>NaN</c>), resolves multi-floor 3D structures
        /// (Watchtower 1st floor vs. Stair Ramp vs. 2nd-floor Battlement Deck, or Underground Crystal Cave Floor vs. Mountain Roof)
        /// safely so entities never teleport across floors.
        /// </summary>
        public static float SampleHeight(float wx, float wz, UnifiedMapDocument? doc = null, float currentEntityY = float.NaN)
        {
            float baseGroundY = SampleBaseTerrainHeight(wx, wz, doc);
            if (doc == null || doc.Structures.Count == 0)
                return baseGroundY;

            float bestFloorY = baseGroundY;

            for (int i = 0; i < doc.Structures.Count; i++)
            {
                var s = doc.Structures[i];
                float structBaseY = SampleBaseTerrainHeight(s.X, s.Z, doc);
                float r = Mathf.Max(2.8f, s.Radius);

                if (s.Kind == "crystal_cave")
                {
                    // Crystal Cave footprint: [s.X - r .. s.X + r], [s.Z - r .. s.Z + r + 1.8m entrance apron]
                    float dx = Mathf.Abs(wx - s.X);
                    float dz = wz - s.Z;
                    if (dx <= r - 0.35f && dz >= -r + 0.35f && dz <= r + 1.8f)
                    {
                        // Inside the cave tunnel: gently recessed flat crystal cavern floor at structBaseY - 0.15m
                        float caveFloorY = structBaseY - 0.15f;
                        float caveRoofY = structBaseY + s.CeilingHeight;

                        // If entity is at ground level (or entering through the portal), keep them on the flat cave floor
                        // instead of pushing them up onto any hill/mound above the cave!
                        if (float.IsNaN(currentEntityY) || currentEntityY < caveRoofY - 0.8f)
                        {
                            bestFloorY = caveFloorY;
                        }
                    }
                }
                else // "watchtower" (2-Story Stone Watchtower with Southern/Eastern Exterior Stair Ramp)
                {
                    float upperDeckY = structBaseY + s.UpperFloorHeight;

                    // 1. Check Exterior Stair Ramp on the East side of the tower:
                    //    X in [s.X + r*0.72 .. s.X + r*0.72 + 1.8m], Z from (s.Z + r) [bottom, South] to (s.Z - r*0.65) [top, North]
                    float rampMinX = s.X + r * 0.68f;
                    float rampMaxX = s.X + r * 0.68f + 1.85f;
                    float rampBottomZ = s.Z + r * 0.95f;
                    float rampTopZ = s.Z - r * 0.65f;

                    if (wx >= rampMinX && wx <= rampMaxX && wz <= rampBottomZ + 0.4f && wz >= rampTopZ - 0.8f)
                    {
                        float t = Mathf.Clamp((rampBottomZ - wz) / Mathf.Max(0.5f, rampBottomZ - rampTopZ), 0f, 1f);
                        float rampY = Mathf.Lerp(structBaseY, upperDeckY, t);
                        if (float.IsNaN(currentEntityY) || rampY <= currentEntityY + MaxStepUpHeight)
                        {
                            bestFloorY = Mathf.Max(bestFloorY, rampY);
                        }
                    }

                    // 2. Check Watchtower Interior / 2nd-Floor Battlement Deck:
                    //    Footprint X in [s.X - r*0.75 .. s.X + r*0.75], Z in [s.Z - r*0.75 .. s.Z + r*0.75]
                    if (Mathf.Abs(wx - s.X) <= r * 0.78f && Mathf.Abs(wz - s.Z) <= r * 0.78f)
                    {
                        if (!float.IsNaN(currentEntityY) && currentEntityY >= upperDeckY - MaxStepUpHeight)
                        {
                            // Entity is on the 2nd floor (or stepping off the top of the ramp onto the 2nd floor)
                            bestFloorY = Mathf.Max(bestFloorY, upperDeckY);
                        }
                        else if (!float.IsNaN(currentEntityY))
                        {
                            // Entity is walking inside the 1st-floor ground chamber under the 2nd-floor deck!
                            bestFloorY = structBaseY;
                        }
                    }
                }
            }

            return bestFloorY;
        }

        /// <summary>
        /// Returns true if (wx, wz, entityY) is currently inside a Cave Tunnel or on a Watchtower Stair Ramp
        /// where outer hill cliff-slope blocking should be bypassed so the player can walk smoothly inside.
        /// </summary>
        public static bool IsInsideWalkableStructureCorridor(float wx, float wz, UnifiedMapDocument? doc, float entityY = float.NaN)
        {
            if (doc == null || doc.Structures.Count == 0)
                return false;

            for (int i = 0; i < doc.Structures.Count; i++)
            {
                var s = doc.Structures[i];
                float r = Mathf.Max(2.8f, s.Radius);
                if (s.Kind == "crystal_cave")
                {
                    if (Mathf.Abs(wx - s.X) <= r - 0.35f && wz >= s.Z - r + 0.35f && wz <= s.Z + r + 1.8f)
                        return true;
                }
                else
                {
                    // Inside watchtower footprint or on its exterior stair ramp
                    if (Mathf.Abs(wx - s.X) <= r + 2.0f && Mathf.Abs(wz - s.Z) <= r + 1.0f)
                        return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Finite-difference surface normal for aligning ground rings, slope lighting, and cliff detection.
        /// </summary>
        public static Vector3 SampleNormal(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            const float eps = 0.25f;
            float hL = SampleBaseTerrainHeight(wx - eps, wz, doc);
            float hR = SampleBaseTerrainHeight(wx + eps, wz, doc);
            float hD = SampleBaseTerrainHeight(wx, wz - eps, doc);
            float hU = SampleBaseTerrainHeight(wx, wz + eps, doc);
            return new Vector3(hL - hR, 2.0f * eps, hD - hU).Normalized();
        }

        /// <summary>
        /// Returns the local terrain inclination angle in degrees (0° = flat horizontal, 90° = vertical wall).
        /// Inside a walkable cave floor or watchtower deck/ramp, returns a walkable angle (&lt;= 18°).
        /// </summary>
        public static float SampleSlopeDegrees(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            if (IsInsideWalkableStructureCorridor(wx, wz, doc))
                return 12.0f;

            Vector3 normal = SampleNormal(wx, wz, doc);
            return Mathf.RadToDeg(Mathf.Acos(Mathf.Clamp(normal.Y, -1.0f, 1.0f)));
        }

        /// <summary>
        /// Returns true if an entity can walk onto (wx, wz) without hitting a sheer cliff wall (&gt; 38°).
        /// </summary>
        public static bool IsWalkableSlope(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            return SampleSlopeDegrees(wx, wz, doc) <= MaxWalkableSlopeDeg;
        }

        /// <summary>
        /// Evaluates a horizontal movement step from (curX, curZ) to (nextX, nextZ) with multi-floor height awareness:
        /// 1. Resolves O(1) Height-Aware Spatial Hash Grid solid prop &amp; cave/tower wall collisions.
        /// 2. Bypasses surface cliff blocking when walking inside an underground cave tunnel or up a tower stair ramp.
        /// 3. If the destination hits an outdoor steep cliff wall (&gt; 38°), projects the movement vector onto the 2D cliff
        ///    contour tangent so the player smoothly slides along the cliff edge.
        /// </summary>
        public static Vector2 ResolveSteepSlopeMove(
            float curX,
            float curZ,
            float nextX,
            float nextZ,
            UnifiedMapDocument? doc,
            out bool blockedByCliff,
            out float slopeDeg,
            float currentEntityY = float.NaN)
        {
            if (doc != null)
            {
                Vector2 afterObs = doc.ResolveObstacleCollision(curX, curZ, nextX, nextZ, 0.42f, currentEntityY);
                nextX = afterObs.X;
                nextZ = afterObs.Y;
            }

            blockedByCliff = false;
            slopeDeg = SampleSlopeDegrees(nextX, nextZ, doc);

            if (slopeDeg <= MaxWalkableSlopeDeg)
            {
                float curH = SampleHeight(curX, curZ, doc, currentEntityY);
                float nextH = SampleHeight(nextX, nextZ, doc, currentEntityY);
                if (nextH > curH && slopeDeg > 14.0f)
                {
                    float gradeFactor = Mathf.Lerp(1.0f, 0.78f, Mathf.Clamp((slopeDeg - 14.0f) / (MaxWalkableSlopeDeg - 14.0f), 0f, 1f));
                    return new Vector2(
                        Mathf.Lerp(curX, nextX, gradeFactor),
                        Mathf.Lerp(curZ, nextZ, gradeFactor));
                }
                return new Vector2(nextX, nextZ);
            }

            float curSlope = SampleSlopeDegrees(curX, curZ, doc);
            if (curSlope > MaxWalkableSlopeDeg && slopeDeg < curSlope - 0.25f)
            {
                return new Vector2(nextX, nextZ);
            }

            blockedByCliff = true;

            const float eps = 0.25f;
            float gx = SampleBaseTerrainHeight(nextX + eps, nextZ, doc) - SampleBaseTerrainHeight(nextX - eps, nextZ, doc);
            float gz = SampleBaseTerrainHeight(nextX, nextZ + eps, doc) - SampleBaseTerrainHeight(nextX, nextZ - eps, doc);
            float gradLen = Mathf.Sqrt(gx * gx + gz * gz);

            if (gradLen > 1e-4f)
            {
                float tx = -gz / gradLen;
                float tz = gx / gradLen;

                float dx = nextX - curX;
                float dz = nextZ - curZ;
                float dot = dx * tx + dz * tz;

                float slideX = curX + tx * dot;
                float slideZ = curZ + tz * dot;
                float slideSlope = SampleSlopeDegrees(slideX, slideZ, doc);

                if (slideSlope <= MaxWalkableSlopeDeg)
                {
                    slopeDeg = slideSlope;
                    return new Vector2(slideX, slideZ);
                }
            }

            return new Vector2(curX, curZ);
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
