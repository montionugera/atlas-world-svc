namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Maps a live server entity to the stable registry key form that the contracts codegen
    /// emits into <c>asset-keys.json</c> and that the manifest is keyed by:
    /// <c>mob:&lt;mobTypeId&gt;</c>, <c>projectile:&lt;type&gt;</c>, <c>zone:&lt;effectType&gt;</c>,
    /// and the fixed <c>player</c> / <c>npc</c> (no per-entity subtype). This is the single
    /// place the key form lives on the client so <see cref="EntityKeys"/> and the codegen
    /// stay in lock-step; keeping it pure (primitive-in, string-out) also lets the headless
    /// verify probe assert the threading without a live schema object.
    /// </summary>
    public static class EntityKeys
    {
        public const string Player = "player";
        public const string Npc = "npc";

        public static string Mob(string mobTypeId) => "mob:" + Safe(mobTypeId);
        public static string Projectile(string type) => "projectile:" + Safe(type);
        public static string Zone(string effectType) => "zone:" + Safe(effectType);

        private static string Safe(string s) => s ?? "";
    }
}
