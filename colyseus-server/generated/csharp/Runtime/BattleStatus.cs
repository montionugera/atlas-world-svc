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
	public partial class BattleStatus : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public BattleStatus() { }
		[Type(0, "string")]
		public string id = default(string);

		[Type(1, "string")]
		public string type = default(string);

		[Type(2, "number")]
		public float expiresAt = default(float);

		[Type(3, "string")]
		public string sourceId = default(string);

		[Type(4, "number")]
		public float value = default(float);

		[Type(5, "number")]
		public float interval = default(float);

		[Type(6, "number")]
		public float lastTick = default(float);
	}
}
