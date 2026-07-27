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
	public partial class NPC : WorldLife {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public NPC() { }
		[Type(29, "string")]
		public string ownerId = default(string);

		[Type(30, "string")]
		public string name = default(string);

		[Type(31, "string")]
		public string currentBehavior = default(string);

		[Type(32, "number")]
		public float behaviorLockedUntil = default(float);

		[Type(33, "number")]
		public float castDuration = default(float);

		[Type(34, "boolean")]
		public bool isCasting = default(bool);

		[Type(35, "number")]
		public float maxMoveSpeed = default(float);

		[Type(36, "string")]
		public string tag = default(string);
	}
}
