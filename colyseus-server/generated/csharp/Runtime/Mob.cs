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
	public partial class Mob : WorldLife {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public Mob() { }
		[Type(28, "string")]
		public string tag = default(string);

		[Type(29, "string")]
		public string currentBehavior = default(string);

		[Type(30, "number")]
		public float behaviorLockedUntil = default(float);

		[Type(31, "number")]
		public float castDuration = default(float);

		[Type(32, "boolean")]
		public bool isCasting = default(bool);

		[Type(33, "string")]
		public string mobTypeId = default(string);

		[Type(34, "string")]
		public string spawnAreaId = default(string);

		[Type(35, "string")]
		public string currentAttackTarget = default(string);

		[Type(36, "string")]
		public string currentChaseTarget = default(string);

		[Type(37, "number")]
		public float targetX = default(float);

		[Type(38, "number")]
		public float targetY = default(float);

		[Type(39, "number")]
		public float maxMoveSpeed = default(float);

		[Type(40, "number")]
		public float rotationSpeed = default(float);
	}
}
