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
	public partial class Player : WorldLife {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public Player() { }
		[Type(29, "string")]
		public string sessionId = default(string);

		[Type(30, "string")]
		public string name = default(string);

		[Type(31, "number")]
		public float maxLinearSpeed = default(float);

		[Type(32, "boolean")]
		public bool isBotMode = default(bool);

		[Type(33, "boolean")]
		public bool isCasting = default(bool);

		[Type(34, "string")]
		public string activeNPCId = default(string);

		[Type(35, "array", typeof(ArraySchema<string>), "string")]
		public ArraySchema<string> companionIds = null;

		[Type(36, "ref", typeof(PlayerSettingGameplay))]
		public PlayerSettingGameplay settingGameplay = null;

		[Type(37, "number")]
		public float castingUntil = default(float);

		[Type(38, "number")]
		public float castDuration = default(float);

		[Type(39, "map", typeof(MapSchema<float>), "number")]
		public MapSchema<float> cooldowns = null;

		[Type(40, "string")]
		public string currentBehavior = default(string);

		[Type(41, "number")]
		public float behaviorLockedUntil = default(float);

		[Type(42, "number")]
		public float maxMoveSpeed = default(float);

		[Type(43, "string")]
		public string currentAttackTarget = default(string);

		[Type(44, "boolean")]
		public bool pendingAttack = default(bool);

		[Type(45, "number")]
		public float attackExecuteTime = default(float);

		[Type(46, "string")]
		public string pendingAttackTargetId = default(string);
	}
}
