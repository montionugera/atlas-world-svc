using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Runtime weapon swap (F-174 / F-186). Finds the right-hand weapon BoneAttachment3D by its
    /// imported names (Godot turns glTF "handslot.r" into node "handslot_r" and
    /// "mixamorig:RightHand" into bone "mixamorig_RightHand", or Meshy "RightHand"), frees what is
    /// baked under it, and instances the new weapon there. Supports swapping across 1H sword looks
    /// (sword, kk_sword_a, kk_sword_b, claymore, axe) while sharing the same sword animation profile.
    /// </summary>
    public sealed class WeaponSocket
    {
        public const string SocketNodeName = "handslot_r";
        private static readonly string[] SocketBoneNames = { "handslot.r", "handslot_r", "prop_weapon_r" };
        private static readonly string[] FallbackBones = { "prop_weapon_r", "mixamorig_RightHand", "RightHand" };

        /// <summary>Catalog of interchangeable 1H sword/melee weapon looks sharing the right-hand socket.</summary>
        public static readonly IReadOnlyDictionary<string, string> SwordCatalog = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["sword"] = "res://assets/weapons/sword.glb",
            ["kk_sword_a"] = "res://assets/weapons/kk_sword_a.glb",
            ["kk_sword_b"] = "res://assets/weapons/kk_sword_b.glb",
            ["claymore"] = "res://assets/weapons/claymore.glb",
            ["axe"] = "res://assets/weapons/axe.glb",
        };

        public static readonly IReadOnlyList<string> SwordVariantKeys = new[]
        {
            "sword", "kk_sword_a", "kk_sword_b", "claymore",
        };

        /// <summary>
        /// Proportional scale factors normalizing raw Quaternius (100x FBX root scale) and KayKit (1.8m)
        /// weapon meshes to fit 0.90–1.20 m humanoid characters (~0.55–0.72 m blade length).
        /// </summary>
        private static readonly IReadOnlyDictionary<string, float> CatalogScaleFactor = new Dictionary<string, float>(StringComparer.OrdinalIgnoreCase)
        {
            ["sword"] = 0.22f,
            ["kk_sword_a"] = 0.34f,
            ["kk_sword_b"] = 0.34f,
            ["claymore"] = 0.11f,
            ["axe"] = 0.68f,
        };

        private readonly Node3D _modelRoot;

        public WeaponSocket(Node3D modelRoot) => _modelRoot = modelRoot;

        public BoneAttachment3D? Attachment { get; private set; }
        public Node3D? Equipped { get; private set; }
        public string EquippedPath { get; private set; } = "";

        public Node3D? EquipByKey(string weaponKeyOrPath)
        {
            if (string.IsNullOrWhiteSpace(weaponKeyOrPath))
                return null;
            string key = weaponKeyOrPath.Trim();
            string path = SwordCatalog.TryGetValue(key, out string? mapped)
                ? mapped
                : key;
            if (!ResourceLoader.Exists(path))
            {
                GD.PushWarning($"WeaponSocket: weapon resource '{path}' does not exist.");
                return null;
            }
            PackedScene? scene = ResourceLoader.Load<PackedScene>(path);
            Node3D? instance = scene != null ? Equip(scene) : null;
            if (instance != null && CatalogScaleFactor.TryGetValue(key, out float scaleFactor))
                instance.Scale = Vector3.One * scaleFactor;
            return instance;
        }

        public Node3D? Equip(PackedScene weapon)
        {
            BoneAttachment3D? socket = FindOrCreateSocket();
            if (socket == null)
            {
                GD.PushWarning($"WeaponSocket: no Skeleton3D with {string.Join("/", FallbackBones)} under '{_modelRoot.Name}'; weapon not equipped.");
                return null;
            }
            ClearChildren(socket);
            if (weapon.Instantiate() is not Node3D instance)
            {
                GD.PushWarning($"WeaponSocket: '{weapon.ResourcePath}' did not instance a Node3D.");
                return null;
            }
            instance.Name = "equipped_weapon";
            socket.AddChild(instance);
            Equipped = instance;
            EquippedPath = weapon.ResourcePath ?? "";
            return instance;
        }

        public void Unequip()
        {
            if (Attachment != null && GodotObject.IsInstanceValid(Attachment))
                ClearChildren(Attachment);
            Equipped = null;
            EquippedPath = "";
        }

        private BoneAttachment3D? FindOrCreateSocket()
        {
            if (Attachment != null && GodotObject.IsInstanceValid(Attachment))
                return Attachment;
            BoneAttachment3D? found = FindSocket(_modelRoot);
            if (found != null)
                return Attachment = found;

            Skeleton3D? skel = FindSkeleton(_modelRoot);
            if (skel == null)
                return null;
            string? bone = Array.Find(FallbackBones, b => skel.FindBone(b) >= 0);
            if (bone == null)
                return null;
            var created = new BoneAttachment3D { Name = SocketNodeName, BoneName = bone };
            skel.AddChild(created);
            return Attachment = created;
        }

        private static BoneAttachment3D? FindSocket(Node node)
        {
            if (node is BoneAttachment3D ba &&
                (ba.Name == SocketNodeName || Array.IndexOf(SocketBoneNames, ba.BoneName) >= 0))
                return ba;
            foreach (Node child in node.GetChildren())
            {
                BoneAttachment3D? hit = FindSocket(child);
                if (hit != null)
                    return hit;
            }
            return null;
        }

        private static Skeleton3D? FindSkeleton(Node node)
        {
            if (node is Skeleton3D s)
                return s;
            foreach (Node child in node.GetChildren())
            {
                Skeleton3D? hit = FindSkeleton(child);
                if (hit != null)
                    return hit;
            }
            return null;
        }

        private static void ClearChildren(Node socket)
        {
            foreach (Node child in socket.GetChildren())
            {
                socket.RemoveChild(child); // detach now, so lookups this frame no longer see it
                child.QueueFree();
            }
        }
    }
}
