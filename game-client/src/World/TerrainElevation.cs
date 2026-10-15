using System;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Deterministic 3D Terrain Altitude, Steep Cliff Slope Evaluator &amp; Multi-Floor Structure Resolver (Watchtowers &amp; Caves)
    /// for Freja South Gate and custom Map Builder terrains.
    ///
    /// Matches the vertex displacement in <c>res://assets/shaders/stylized_grass_floor.gdshader</c> 1:1
    /// so PlayerAvatar, server-rs Entities, 3D Props, and GPU-instanced Meadow Clutter all sit accurately on:
    /// 1. Base procedural rolling hills &amp; sculpted Map Builder height terraces / cliffs.
    /// 2. Multi-floor 3D Watchtowers (1st-floor ground chamber + Exterior East Stair Ramp + 2nd-floor Battlement Deck).
    /// 3. Walk-in Underground Crystal Caves (recessed cavern floor underneath a mountain/cliff roof without popping to the roof).
    /// </summary>
    public static class TerrainElevation
    {
        /// <summary>
        /// Maximum walkable slope angle in degrees before a terrain incline is treated as an impassable cliff wall.
        /// Standard 3D RPG / NavMesh convention: slopes &lt;= 38° are walkable; slopes &gt; 38° block and slide along the contour.
        /// </summary>
        public const float MaxWalkableSlopeDeg = 38.0f;

        /// <summary>
        /// Maximum vertical step-up height (in meters) an entity can climb in a single horizontal step
        /// without a connecting ramp/staircase. Prevents teleporting straight up a 3.2m watchtower wall.
        /// </summary>
        public const float MaxStepUpHeight = 0.65f;

        /// <summary>
        /// Global amplitude multiplier (0.0 = flat 2D plane, 1.0 = default rolling hills, up to 2.5 = dramatic mountain ridges).
        /// </summary>
        public static float GlobalAmplitude { get; set; } = 1.0f;

        /// <summary>
        /// Evaluates the continuous outdoor ground terrain height Y at world position (wx, wz)
        /// (ignoring multi-floor structure decks or cave interiors).
        /// </summary>
        public static float SampleBaseTerrainHeight(float wx, float wz, UnifiedMapDocument? doc = null)
        {
            float amp = doc?.TerrainAmplitude ?? GlobalAmplitude;
            if (amp <= 0.001f && (doc == null || doc.HeightTerraces.Count == 0))
                return 0f;

            // Keep central spawn plaza & road corridor near (0, -2..+4) gently flattened so combat & spawning feel grounded
            float distFromSpawn = Mathf.Sqrt(wx * wx + wz * wz);
            float spawnFlatMask = SmoothStep(5.5f, 15.0f, distFromSpawn);

            // Keep the N-S cobblestone road (|x| < 2.6m) smooth and walkable
            float roadFlatMask = SmoothStep(2.2f, 6.2f, Mathf.Abs(wx));

            // Layered harmonic rolling hills (matches stylized_grass_floor.gdshader vertex() function)
            float wave1 = Mathf.Sin(wx * 0.075f) * Mathf.Cos(wz * 0.075f) * 1.35f;
            float wave2 = Mathf.Sin((wx * 0.14f) + (wz * 0.11f)) * 0.55f;
            float ridge = Mathf.Cos(wz * 0.045f - 0.8f) * 0.85f;

            float baseHills = (wave1 + wave2 + ridge) * spawnFlatMask * Mathf.Lerp(0.30f, 1.0f, roadFlatMask) * amp;

            float terraceDelta = 0f;
            if (doc != null && doc.HeightTerraces.Count > 0)
            {
                for (int i = 0; i < doc.HeightTerraces.Count; i++)
                {
                    var t = doc.HeightTerraces[i];
                    float dx = wx - t.X;
                    float dz = wz - t.Z;
                    float dist = Mathf.Sqrt(dx * dx + dz * dz);
                    if (dist < t.Radius)
                    {
                        float norm = dist / Mathf.Max(0.5f, t.Radius);
                        float innerFlat = Mathf.Clamp(1.0f - t.Falloff, 0.15f, 0.85f);
                        float weight = 1.0f - SmoothStep(innerFlat, 1.0f, norm);
                        terraceDelta += t.Height * weight;
                    }
                }
            }

            float totalY = baseHills + terraceDelta;

            // Flatten base ground under Watchtower & Crystal Cave footprints so stairs and portals sit cleanly on level ground
            if (doc != null && doc.Structures.Count > 0)
            {
                for (int i = 0; i < doc.Structures.Count; i++)
                {
                    var s = doc.Structures[i];
                    float dx = wx - s.X;
                    float dz = wz - s.Z;
                    float dist = Mathf.Sqrt(dx * dx + dz * dz);
                    float flatRadius = s.Radius + 3.8f;
                    if (dist < flatRadius)
                    {
                        float centerH = SampleRawUnflattenedHeight(s.X, s.Z, amp, doc);
                        float blend = SmoothStep(s.Radius + 0.5f, flatRadius, dist);
                        totalY = Mathf.Lerp(centerH, totalY, blend);
                    }
                }
            }

            return totalY;
        }

        private static float SampleRawUnflattenedHeight(float wx, float wz, float amp, UnifiedMapDocument doc)
        {
            float distFromSpawn = Mathf.Sqrt(wx * wx + wz * wz);
            float spawnFlatMask = SmoothStep(5.5f, 15.0f, distFromSpawn);
            float roadFlatMask = SmoothStep(2.2f, 6.2f, Mathf.Abs(wx));
            float wave1 = Mathf.Sin(wx * 0.075f) * Mathf.Cos(wz * 0.075f) * 1.35f;
            float wave2 = Mathf.Sin((wx * 0.14f) + (wz * 0.11f)) * 0.55f;
            float ridge = Mathf.Cos(wz * 0.045f - 0.8f) * 0.85f;
            float totalY = (wave1 + wave2 + ridge) * spawnFlatMask * Mathf.Lerp(0.30f, 1.0f, roadFlatMask) * amp;

            for (int i = 0; i < doc.HeightTerraces.Count; i++)
            {
                var t = doc.HeightTerraces[i];
                float dx = wx - t.X;
                float dz = wz - t.Z;
                float dist = Mathf.Sqrt(dx * dx + dz * dz);
                if (dist < t.Radius)
                {
                    float norm = dist / Mathf.Max(0.5f, t.Radius);
                    float innerFlat = Mathf.Clamp(1.0f - t.Falloff, 0.15f, 0.85f);
                    float weight = 1.0f - SmoothStep(innerFlat, 1.0f, norm);
                    totalY += t.Height * weight;
                }
            }

            return totalY;
        }

        /// <summary>
        /// Evaluates the walkable floor altitude Y at (wx, wz).
        /// When <paramref name="currentEntityY"/> is provided (not <c>NaN</c>), resolves multi-floor 3D structures
        /// (Watchtower 1st floor vs. East Stair Ramp vs. 2nd-floor Battlement Deck, or Underground Crystal Cave Floor vs. Mountain Roof)
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
                float r = Mathf.Max(2.5f, s.Radius);

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
                else // "watchtower" (2-Story Stone Watchtower with Wide East Exterior Stair Ramp)
                {
                    float upperDeckY = structBaseY + Mathf.Max(2.2f, s.UpperFloorHeight);
                    float midFloorThresholdY = structBaseY + Mathf.Max(2.2f, s.UpperFloorHeight) * 0.42f;

                    // 1. Check Exterior East Stair Ramp (matches visual steps in MapChunkStreamer.SpawnStructureVolumeIntoChunk!):
                    //    Footprint X in [s.X + r - 0.35m (top at 2F edge) .. s.X + r + 3.45m (bottom on meadow ground)]
                    //    Footprint Z in [s.Z - 1.55m .. s.Z + 1.55m] (wide 3.1m stair corridor centered on s.Z)
                    float rampTopX = s.X + r - 0.25f;
                    float rampBottomX = s.X + r + 3.25f;
                    if (wx >= rampTopX - 0.35f && wx <= rampBottomX + 0.45f && Mathf.Abs(wz - s.Z) <= 1.55f)
                    {
                        float t = Mathf.Clamp((rampBottomX - wx) / Mathf.Max(0.5f, rampBottomX - rampTopX), 0f, 1f);
                        float rampY = Mathf.Lerp(structBaseY, upperDeckY, t);
                        bestFloorY = Mathf.Max(bestFloorY, rampY);
                    }

                    // 2. Check Watchtower Interior / 2nd-Floor Battlement Deck:
                    //    Full deck footprint X in [s.X - r*1.06 .. s.X + r*1.06], Z in [s.Z - r*1.06 .. s.Z + r*1.06]
                    if (Mathf.Abs(wx - s.X) <= r * 1.06f && Mathf.Abs(wz - s.Z) <= r * 1.06f)
                    {
                        if (!float.IsNaN(currentEntityY) && currentEntityY >= midFloorThresholdY)
                        {
                            // Entity is on the 2nd floor (or stepping off the upper half of the East stair ramp onto the 2nd floor)
                            bestFloorY = Mathf.Max(bestFloorY, upperDeckY);
                        }
                        else if (!float.IsNaN(currentEntityY) && wx < rampTopX - 0.25f)
                        {
                            // Entity is walking inside the 1st-floor ground chamber under the 2nd-floor deck!
                            bestFloorY = structBaseY + 0.14f;
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
                float r = Mathf.Max(2.5f, s.Radius);
                if (s.Kind == "crystal_cave")
                {
                    if (Mathf.Abs(wx - s.X) <= r - 0.35f && wz >= s.Z - r + 0.35f && wz <= s.Z + r + 1.8f)
                        return true;
                }
                else
                {
                    // Inside watchtower footprint or on its exterior East stair ramp [s.X - r .. s.X + r + 3.6m]
                    if (wx >= s.X - r - 0.5f && wx <= s.X + r + 3.8f && Mathf.Abs(wz - s.Z) <= r + 1.0f)
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
                float moveX = nextX - curX;
                float moveZ = nextZ - curZ;
                float dot = moveX * tx + moveZ * tz;
                float slideX = curX + tx * dot * 0.75f;
                float slideZ = curZ + tz * dot * 0.75f;

                if (SampleSlopeDegrees(slideX, slideZ, doc) <= MaxWalkableSlopeDeg + 2.5f)
                {
                    return new Vector2(slideX, slideZ);
                }
            }

            return new Vector2(curX, curZ);
        }

        private static float SmoothStep(float edge0, float edge1, float x)
        {
            if (Mathf.IsEqualApprox(edge0, edge1))
                return x >= edge1 ? 1f : 0f;
            float t = Mathf.Clamp((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
            return t * t * (3.0f - 2.0f * t);
        }
    }
}
