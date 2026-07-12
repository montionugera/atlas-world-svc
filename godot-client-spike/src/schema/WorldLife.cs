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
	public partial class WorldLife : WorldObject {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public WorldLife() { }
		[Type(10, "number")]
		public float radius = default(float);

		[Type(11, "number")]
		public float maxHealth = default(float);

		[Type(12, "number")]
		public float currentHealth = default(float);

		[Type(13, "boolean")]
		public bool isAlive = default(bool);

		[Type(14, "string")]
		public string teamId = default(string);

		[Type(15, "number")]
		public float pAtk = default(float);

		[Type(16, "number")]
		public float attackRange = default(float);

		[Type(17, "number")]
		public float attackDelay = default(float);

		[Type(18, "number")]
		public float lastAttackTime = default(float);

		[Type(19, "number")]
		public float defense = default(float);

		[Type(20, "number")]
		public float armor = default(float);

		[Type(21, "map", typeof(MapSchema<float>), "number")]
		public MapSchema<float> resistances = null;

		[Type(22, "number")]
		public float density = default(float);

		[Type(23, "boolean")]
		public bool isAttacking = default(bool);

		[Type(24, "boolean")]
		public bool isMoving = default(bool);

		[Type(25, "string")]
		public string lastAttackedTarget = default(string);

		[Type(26, "number")]
		public float heading = default(float);

		[Type(27, "map", typeof(MapSchema<BattleStatus>))]
		public MapSchema<BattleStatus> battleStatuses = null;
	}
}
