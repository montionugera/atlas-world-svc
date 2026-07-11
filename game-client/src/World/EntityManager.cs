using System.Collections.Generic;
using Godot;
using AtlasWorld.Contracts;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Owns the pool of <see cref="EntityView"/>s (one per server entity id) and their
    /// scene nodes. The Net layer calls Spawn/ApplyLife/ApplyObject/Despawn on the MAIN
    /// thread (the dispatch pump), so no thread marshalling is needed here.
    ///
    /// Invariant: an entity is removed from the pool in <see cref="Despawn"/> BEFORE any
    /// later OnChange could fire, so a stale change on a freed node is a no-op. Node
    /// access is additionally guarded with <c>IsInstanceValid</c>.
    /// </summary>
    public sealed partial class EntityManager : Node3D
    {
        private readonly Dictionary<string, EntityView> _views = new();

        private string _ownPlayerId = "";

        public int Count => _views.Count;
        public string OwnPlayerId => _ownPlayerId;

        public void Spawn(string id, EntityKind kind)
        {
            if (_views.ContainsKey(id))
                return;

            var view = new EntityView(kind);
            AddChild(view.Root);
            _views[id] = view;
        }

        public void ApplyLife(string id, WorldLife e)
        {
            if (!_views.TryGetValue(id, out EntityView? view))
                return;

            view.ApplyLife(e);

            // isAlive → death + free: a dead life entity leaves the pool immediately.
            if (!view.Alive)
                Despawn(id);
        }

        public void ApplyObject(string id, WorldObject e)
        {
            if (_views.TryGetValue(id, out EntityView? view))
                view.ApplyObject(e);
        }

        public void Despawn(string id)
        {
            if (!_views.TryGetValue(id, out EntityView? view))
                return;

            _views.Remove(id); // out of the pool first — later OnChange becomes a no-op
            if (GodotObject.IsInstanceValid(view.Root))
                view.Root.QueueFree();
        }

        public void SetOwnPlayer(string id) => _ownPlayerId = id;

        public bool TryGetOwnPlayerFlatPosition(out Vector3 flat)
        {
            flat = Vector3.Zero;
            if (_ownPlayerId.Length == 0 || !_views.TryGetValue(_ownPlayerId, out EntityView? own))
                return false;
            if (!GodotObject.IsInstanceValid(own.Root))
                return false;
            Vector3 p = own.Root.Position;
            flat = new Vector3(p.X, 0f, p.Z);
            return true;
        }

        /// <summary>Free all views and clear the pool — used on a fresh (re)connect.</summary>
        public void Reset()
        {
            foreach (EntityView view in _views.Values)
            {
                if (GodotObject.IsInstanceValid(view.Root))
                    view.Root.QueueFree();
            }
            _views.Clear();
            _ownPlayerId = "";
        }

        public override void _Process(double delta)
        {
            float d = (float)delta;
            foreach (EntityView view in _views.Values)
                view.Tick(d);
        }
    }
}
