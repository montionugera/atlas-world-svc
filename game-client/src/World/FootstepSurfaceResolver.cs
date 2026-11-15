using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.Audio;

namespace AtlasWorld.Client.World
{
    public readonly record struct SurfacePadOverride(
        string Id,
        string Label,
        Rect2 WorldBounds,
        FootstepSurface Surface);

    /// <summary>
    /// Hybrid surface resolver that checks explicit walkable pad overrides and structure
    /// surface overrides first, then delegates terrain/route/zone resolution to
    /// <see cref="UnifiedMapDocument.ResolveGroundIdAt"/> and maps the resolved palette's
    /// <c>surfaceType</c> via <see cref="FootstepSurfaceMapper"/>.
    /// </summary>
    public static class FootstepSurfaceResolver
    {
        public static FootstepSurface Resolve(
            Vector3 worldPos,
            UnifiedMapDocument? doc,
            IReadOnlyList<SurfacePadOverride>? pads = null)
        {
            Vector2 p2 = new(worldPos.X, worldPos.Z);

            // 1. Explicit walkable pad overrides (PlaytestSandbox test pads, custom floor zones)
            if (pads != null)
            {
                for (int i = 0; i < pads.Count; i++)
                {
                    if (pads[i].WorldBounds.HasPoint(p2))
                        return pads[i].Surface;
                }
            }

            if (doc == null)
                return FootstepSurface.Stone;

            // 2. Structure volume with explicit SurfaceType override
            if (doc.Structures != null)
            {
                for (int i = 0; i < doc.Structures.Count; i++)
                {
                    var s = doc.Structures[i];
                    if (string.IsNullOrWhiteSpace(s.SurfaceType))
                        continue;

                    if (s.Kind == "block")
                    {
                        float halfX = Mathf.Max(0.25f, s.Size.X * 0.5f);
                        float halfZ = Mathf.Max(0.25f, s.Size.Z * 0.5f);
                        if (Mathf.Abs(worldPos.X - s.X) <= halfX && Mathf.Abs(worldPos.Z - s.Z) <= halfZ)
                            return FootstepSurfaceMapper.FromSurfaceType(s.SurfaceType);
                    }
                    else
                    {
                        if (Mathf.Abs(worldPos.X - s.X) <= s.Radius + 3.6f &&
                            Mathf.Abs(worldPos.Z - s.Z) <= s.Radius + 2.2f)
                        {
                            return FootstepSurfaceMapper.FromSurfaceType(s.SurfaceType);
                        }
                    }
                }
            }

            // 3. Map ground resolution (structure_foundation > routes > groundZones > baseGroundId)
            string groundId = doc.ResolveGroundIdAt(worldPos.X, worldPos.Z, out _, out _);
            if (groundId == "structure_foundation")
                return FootstepSurface.Stone;

            if (doc.GroundPalettes != null &&
                doc.GroundPalettes.TryGetValue(groundId, out UnifiedMapGroundPalette? palette) &&
                palette != null)
            {
                return FootstepSurfaceMapper.FromSurfaceType(palette.SurfaceType);
            }

            return FootstepSurfaceMapper.FromSurfaceType(groundId);
        }
    }
}
