using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.Content
{
    /// <summary>
    /// Autoload that turns a server type id (<c>mob:spear_thrower</c>, <c>projectile:spear</c>,
    /// <c>player</c>, <c>npc</c>, <c>zone:…</c>) into a <see cref="PackedScene"/> to instance,
    /// choosing the best available tier: a manifest <c>bespoke</c> entry whose scene loads →
    /// a manifest <c>seed</c> entry whose scene loads → the procedural CAPSULE built from
    /// <see cref="EntityVisuals"/> (the same primitive the client rendered before the asset
    /// pipeline existed — reused, not duplicated).
    ///
    /// Resolution is total and never throws: an unknown id, a blank scene path, or a scene
    /// that fails to load all fall through to the capsule and emit a single
    /// <see cref="GD.PushWarning"/>. Loaded scenes are cached by <c>res://</c> path; the
    /// procedural capsule is cached per <see cref="EntityKind"/>.
    /// </summary>
    public sealed partial class AssetRegistry : Node
    {
        /// <summary>Default manifest the autoload binds on <see cref="_Ready"/>.</summary>
        public const string DefaultManifestPath = "res://assets/manifest.json";

        /// <summary>
        /// The live autoload instance (set in <see cref="_Ready"/>). Entity rendering (Task 4)
        /// reads this. Null until the autoload is ready; verify probes construct their own
        /// instance rather than relying on it.
        /// </summary>
        public static AssetRegistry? Instance { get; private set; }

        private AssetManifest? _manifest;
        private readonly Dictionary<string, PackedScene> _sceneCache = new();
        private readonly Dictionary<EntityKind, PackedScene> _capsuleCache = new();

        public override void _Ready()
        {
            Instance = this;
            LoadManifest(DefaultManifestPath);
        }

        /// <summary>
        /// (Re)bind the manifest from a <c>res://…</c> path. A malformed or missing manifest
        /// is not fatal — it is logged and the registry then resolves everything to the
        /// capsule tier (so the world is never empty). Exposed so verify probes can inject a
        /// fixture manifest without a live autoload.
        /// </summary>
        public void LoadManifest(string resPath)
        {
            _sceneCache.Clear();
            try
            {
                _manifest = AssetManifest.Load(resPath);
            }
            catch (AssetManifestException ex)
            {
                GD.PushWarning(
                    $"AssetRegistry: manifest '{resPath}' failed to load ({ex.Message}); " +
                    "every type will resolve to the capsule fallback.");
                _manifest = null;
            }
        }

        /// <summary>
        /// Resolve a server type id to the best-available <see cref="PackedScene"/>. Sets
        /// <paramref name="tier"/> to the tier that satisfied the request. Never returns
        /// null and never throws — an unresolved id yields the procedural capsule plus a
        /// warning.
        /// </summary>
        public PackedScene Resolve(string typeId, out ResolveTier tier)
        {
            if (_manifest != null && _manifest.TryGet(typeId, out AssetEntry entry))
            {
                PackedScene? scene = LoadScene(entry.Scene);
                if (scene != null)
                {
                    tier = entry.Tier == "bespoke" ? ResolveTier.Bespoke : ResolveTier.Seed;
                    return scene;
                }

                GD.PushWarning(
                    $"AssetRegistry: entry for '{typeId}' points at unloadable scene " +
                    $"'{entry.Scene}'; using capsule fallback.");
            }
            else
            {
                GD.PushWarning(
                    $"AssetRegistry: no manifest entry for '{typeId}'; using capsule fallback.");
            }

            tier = ResolveTier.Capsule;
            return CapsuleScene(typeId);
        }

        /// <summary>
        /// Look up a manifest entry's optional per-entry animation clip overrides (the
        /// <c>anims</c> object) for a type id. Empty (never null) when there is no manifest,
        /// no entry for this id, or the entry has no <c>anims</c> object — callers (currently
        /// <see cref="World.EntityView"/>'s <see cref="World.AnimationController"/>) then just
        /// fall back to the shared Kenney default clip map. Total, never throws.
        /// </summary>
        public IReadOnlyDictionary<string, string> ResolveAnimOverrides(string typeId)
        {
            if (_manifest != null && _manifest.TryGet(typeId, out AssetEntry entry))
                return entry.Anims;
            return EmptyAnims;
        }

        private static readonly Dictionary<string, string> EmptyAnims = new();

        /// <summary>
        /// Load a <see cref="PackedScene"/> by <c>res://</c> path, cached. Returns null (no
        /// throw, no error spam) for a blank or nonexistent path — the caller falls back.
        /// </summary>
        private PackedScene? LoadScene(string resPath)
        {
            if (string.IsNullOrEmpty(resPath))
                return null;
            if (_sceneCache.TryGetValue(resPath, out PackedScene? cached))
                return cached;
            if (!ResourceLoader.Exists(resPath))
                return null;

            var scene = ResourceLoader.Load<PackedScene>(resPath);
            if (scene != null)
                _sceneCache[resPath] = scene;
            return scene;
        }

        /// <summary>
        /// The procedural capsule tier: pack <see cref="EntityVisuals.CreateView"/> — the same
        /// primitive the client always rendered — into a reusable <see cref="PackedScene"/>,
        /// cached per kind. This is the single "never empty" floor of the fallback chain.
        /// </summary>
        private PackedScene CapsuleScene(string typeId)
        {
            EntityKind kind = KindFromTypeId(typeId);
            if (_capsuleCache.TryGetValue(kind, out PackedScene? cached))
                return cached;

            EntityVisualParts parts = EntityVisuals.CreateView(kind);
            Node3D root = parts.Root;
            // Pack only includes descendants whose Owner is the packed root, so stamp it.
            SetOwnerRecursive(root, root);

            var packed = new PackedScene();
            Error err = packed.Pack(root);
            root.Free(); // template is not in the tree; the PackedScene holds a copy.

            if (err != Error.Ok)
            {
                // Should not happen for our own primitives; surface loudly but don't throw —
                // an empty PackedScene still instances to a bare Node3D (never null).
                GD.PushWarning($"AssetRegistry: failed to pack capsule for kind={kind} (err={err}).");
            }

            _capsuleCache[kind] = packed;
            return packed;
        }

        /// <summary>Map a registry key form to the primitive kind for its capsule fallback.</summary>
        private static EntityKind KindFromTypeId(string typeId)
        {
            if (string.IsNullOrEmpty(typeId))
                return EntityKind.Player;
            if (typeId.StartsWith("mob:"))
                return EntityKind.Mob;
            if (typeId.StartsWith("projectile:"))
                return EntityKind.Projectile;
            if (typeId.StartsWith("zone:"))
                return EntityKind.ZoneEffect;
            if (typeId == "npc")
                return EntityKind.Npc;
            return EntityKind.Player; // "player" and any unrecognized form
        }

        private static void SetOwnerRecursive(Node node, Node owner)
        {
            foreach (Node child in node.GetChildren())
            {
                child.Owner = owner;
                SetOwnerRecursive(child, owner);
            }
        }
    }
}
