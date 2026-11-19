using System;

namespace AtlasWorld.Client.Audio
{
    public enum FootstepSurface
    {
        Stone = 0,
        Dirt = 1,
        Grass = 2,
        Water = 3,
        Glass = 4,
    }

    public static class FootstepSurfaceMapper
    {
        public static FootstepSurface FromSurfaceType(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return FootstepSurface.Stone;

            string token = raw.Trim().ToLowerInvariant();
            return token switch
            {
                "stone_path" or "sheer_rock" or "stone" or "cobble" or "rock" or "structure_foundation" or "cobble_road" => FootstepSurface.Stone,
                "dirt" or "soil" or "earth" or "mud" or "estuary_mudflat" or "scorched_basalt_ash" or "bramble_root_floor" or "dirt_patch" => FootstepSurface.Dirt,
                "lush_grass" or "forest_moss" or "grass" or "meadow" or "moss" or "meadow_grass" => FootstepSurface.Grass,
                "water" or "shallow_water" or "river" or "stream" or "pond" or "puddle" => FootstepSurface.Water,
                "glass" or "crystal" or "stained_glass" or "wind_scoured_ice" or "ice" => FootstepSurface.Glass,
                _ => FootstepSurface.Stone,
            };
        }

        public static string ToEventToken(FootstepSurface surface) => surface switch
        {
            FootstepSurface.Dirt => "dirt",
            FootstepSurface.Grass => "grass",
            FootstepSurface.Water => "water",
            FootstepSurface.Glass => "glass",
            _ => "stone",
        };
    }
}
