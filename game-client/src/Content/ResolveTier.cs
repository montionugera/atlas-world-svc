namespace AtlasWorld.Client.Content
{
    /// <summary>
    /// Which tier of the fallback chain satisfied an <see cref="AssetRegistry.Resolve"/>
    /// call. <c>Bespoke</c> = a commissioned/custom asset; <c>Seed</c> = a CC0 stand-in;
    /// <c>Capsule</c> = the procedural primitive built in-code (the pre-pipeline visual).
    ///
    /// Kept in its own file so <c>AssetRegistry.cs</c> declares a single top-level type —
    /// Godot's C# autoload resolver binds the script-path attribute to the lone type in a
    /// file, and a second top-level type there makes the autoload fail to see the Node.
    /// </summary>
    public enum ResolveTier
    {
        Bespoke,
        Seed,
        Capsule,
    }
}
