// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 4.0.27
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

		[Type(21, "string")]
		public string element = default(string);

		[Type(22, "map", typeof(MapSchema<float>), "number")]
		public MapSchema<float> resistances = null;

		[Type(23, "number")]
		public float density = default(float);

		[Type(24, "boolean")]
		public bool isAttacking = default(bool);

		[Type(25, "boolean")]
		public bool isMoving = default(bool);

		[Type(26, "string")]
		public string lastAttackedTarget = default(string);

		[Type(27, "number")]
		public float heading = default(float);

		[Type(28, "map", typeof(MapSchema<BattleStatus>))]
		public MapSchema<BattleStatus> battleStatuses = null;
	}
}
