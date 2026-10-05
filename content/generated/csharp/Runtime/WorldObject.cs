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
	public partial class WorldObject : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public WorldObject() { }
		[Type(0, "string")]
		public string id = default(string);

		[Type(1, "number")]
		public float x = default(float);

		[Type(2, "number")]
		public float y = default(float);

		[Type(3, "number")]
		public float vx = default(float);

		[Type(4, "number")]
		public float vy = default(float);

		[Type(5, "array", typeof(ArraySchema<string>), "string")]
		public ArraySchema<string> tags = null;

		[Type(6, "string")]
		public string physicsBodyId = default(string);

		[Type(7, "number")]
		public float angle = default(float);

		[Type(8, "number")]
		public float angularVelocity = default(float);

		[Type(9, "boolean")]
		public bool isStatic = default(bool);
	}
}
