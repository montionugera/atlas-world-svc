// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 3.0.60
// 

using Colyseus.Schema;
#if UNITY_5_3_OR_NEWER
using UnityEngine.Scripting;
#endif

namespace AtlasWorld.Schema {
	public partial class GameState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public GameState() { }
		[Type(0, "map", typeof(MapSchema<Player>))]
		public MapSchema<Player> players = null;

		[Type(1, "map", typeof(MapSchema<Mob>))]
		public MapSchema<Mob> mobs = null;

		[Type(2, "map", typeof(MapSchema<NPC>))]
		public MapSchema<NPC> npcs = null;

		[Type(3, "map", typeof(MapSchema<Projectile>))]
		public MapSchema<Projectile> projectiles = null;

		[Type(4, "map", typeof(MapSchema<ZoneEffect>))]
		public MapSchema<ZoneEffect> zoneEffects = null;

		[Type(5, "number")]
		public float tick = default(float);

		[Type(6, "string")]
		public string mapId = default(string);

		[Type(7, "string")]
		public string roomId = default(string);

		[Type(8, "number")]
		public float width = default(float);

		[Type(9, "number")]
		public float height = default(float);
	}
}
