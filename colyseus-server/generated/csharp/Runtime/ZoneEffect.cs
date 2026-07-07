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
	public partial class ZoneEffect : WorldObject {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public ZoneEffect() { }
		[Type(10, "string")]
		public string ownerId = default(string);

		[Type(11, "string")]
		public string skillId = default(string);

		[Type(12, "number")]
		public float radius = default(float);

		[Type(13, "array", typeof(ArraySchema<ZoneEffectEffect>))]
		public ArraySchema<ZoneEffectEffect> effects = null;

		[Type(14, "number")]
		public float castTime = default(float);

		[Type(15, "number")]
		public float duration = default(float);

		[Type(16, "number")]
		public float tickRate = default(float);

		[Type(17, "boolean")]
		public bool isActive = default(bool);

		[Type(18, "number")]
		public float createdAt = default(float);

		[Type(19, "number")]
		public float activatedAt = default(float);
	}
}
