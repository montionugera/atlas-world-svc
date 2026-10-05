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
	public partial class PlayerSettings : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public PlayerSettings() { }
		[Type(0, "number")]
		public float spawnX = default(float);

		[Type(1, "number")]
		public float spawnY = default(float);
	}
}
