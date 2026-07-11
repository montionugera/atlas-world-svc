using Godot;
using Colyseus;
using AtlasWorld.Contracts;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Binds Colyseus schema callbacks to the <see cref="EntityManager"/> for ALL FIVE
    /// state maps — players, mobs, npcs, projectiles, and zoneEffects (the 5th map,
    /// unwired in the spike).
    ///
    /// Callbacks fire on the MAIN thread (because <see cref="ColyseusConnection"/> pumps
    /// the queue in <c>_Process</c>) → we call the EntityManager DIRECTLY, no CallDeferred.
    /// </summary>
    public sealed class EntitySync
    {
        private readonly EntityManager _entities;

        public EntitySync(EntityManager entities)
        {
            _entities = entities;
        }

        /// <summary>
        /// Wire (or re-wire, after a reconnect) callbacks to a freshly-joined room.
        /// The EntityManager should be reset by the caller before binding so pooled
        /// views from a previous session don't leak.
        /// </summary>
        public void Bind(Room<GameState> room)
        {
            string ownSessionId = room.SessionId;
            var cb = Colyseus.Schema.Callbacks.Get(room);

            // Snapshot boundary: once per applied patch, sample every entity's pose into the
            // interpolator. This is the ONLY pose-ingestion path (NOT per-field OnChange), so
            // each entity gets exactly one PoseSample per 20 Hz server tick, stamped with the
            // client's monotonic arrival time. Fires on the main thread (dispatch pump), so we
            // push straight into the buffers synchronously — no queue, no marshalling.
            room.OnStateChange += (state, _) => _entities.IngestSnapshot(state);

            // --- players (WorldLife) — the one we own drives the camera ---
            cb.OnAdd(s => s.players, (string id, Player p) =>
            {
                _entities.Spawn(id, EntityKind.Player);
                _entities.ApplyLife(id, p);
                if (id == ownSessionId)
                    _entities.SetOwnPlayer(id);
                cb.OnChange(p, () => _entities.ApplyLife(id, p));
            });
            cb.OnRemove(s => s.players, (string id, Player _) => _entities.Despawn(id));

            // --- mobs (WorldLife) ---
            cb.OnAdd(s => s.mobs, (string id, Mob m) =>
            {
                _entities.Spawn(id, EntityKind.Mob);
                _entities.ApplyLife(id, m);
                cb.OnChange(m, () => _entities.ApplyLife(id, m));
            });
            cb.OnRemove(s => s.mobs, (string id, Mob _) => _entities.Despawn(id));

            // --- npcs (WorldLife) ---
            cb.OnAdd(s => s.npcs, (string id, NPC n) =>
            {
                _entities.Spawn(id, EntityKind.Npc);
                _entities.ApplyLife(id, n);
                cb.OnChange(n, () => _entities.ApplyLife(id, n));
            });
            cb.OnRemove(s => s.npcs, (string id, NPC _) => _entities.Despawn(id));

            // --- projectiles (WorldObject — no health) ---
            // Objects have no per-field visual state beyond pose, and pose now flows through
            // the interpolator (IngestSnapshot), so OnAdd only needs to spawn the view.
            cb.OnAdd(s => s.projectiles, (string id, Projectile _) =>
                _entities.Spawn(id, EntityKind.Projectile));
            cb.OnRemove(s => s.projectiles, (string id, Projectile _) => _entities.Despawn(id));

            // --- zoneEffects (WorldObject — the 5th map, unwired in the spike) ---
            cb.OnAdd(s => s.zoneEffects, (string id, ZoneEffect _) =>
                _entities.Spawn(id, EntityKind.ZoneEffect));
            cb.OnRemove(s => s.zoneEffects, (string id, ZoneEffect _) => _entities.Despawn(id));

            GD.Print("[EntitySync] bound callbacks for 5 maps (players/mobs/npcs/projectiles/zoneEffects)");
        }
    }
}
