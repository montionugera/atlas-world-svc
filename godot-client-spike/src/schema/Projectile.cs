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
	public partial class Projectile : WorldObject {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public Projectile() { }
		[Type(10, "number")]
		public float radius = default(float);

		[Type(11, "string")]
		public string ownerId = default(string);

		[Type(12, "boolean")]
		public bool isStuck = default(bool);

		[Type(13, "string")]
		public string type = default(string);

		[Type(14, "string")]
		public string teamId = default(string);
	}
}
