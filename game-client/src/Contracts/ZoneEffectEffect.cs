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

namespace AtlasWorld.Contracts {
	public partial class ZoneEffectEffect : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public ZoneEffectEffect() { }
		[Type(0, "string")]
		public string type = default(string);

		[Type(1, "number")]
		public float value = default(float);

		[Type(2, "number")]
		public float chance = default(float);

		[Type(3, "number")]
		public float interval = default(float);

		[Type(4, "number")]
		public float duration = default(float);
	}
}
