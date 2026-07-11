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
	public partial class Player : WorldLife {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public Player() { }
		[Type(28, "string")]
		public string sessionId = default(string);

		[Type(29, "string")]
		public string name = default(string);

		[Type(30, "number")]
		public float maxLinearSpeed = default(float);

		[Type(31, "boolean")]
		public bool isBotMode = default(bool);

		[Type(32, "boolean")]
		public bool isCasting = default(bool);

		[Type(33, "string")]
		public string activeNPCId = default(string);

		[Type(34, "array", typeof(ArraySchema<string>), "string")]
		public ArraySchema<string> companionIds = null;

		[Type(35, "ref", typeof(PlayerSettingGameplay))]
		public PlayerSettingGameplay settingGameplay = null;

		[Type(36, "number")]
		public float castingUntil = default(float);

		[Type(37, "number")]
		public float castDuration = default(float);

		[Type(38, "map", typeof(MapSchema<float>), "number")]
		public MapSchema<float> cooldowns = null;

		[Type(39, "string")]
		public string currentBehavior = default(string);

		[Type(40, "number")]
		public float behaviorLockedUntil = default(float);

		[Type(41, "number")]
		public float maxMoveSpeed = default(float);

		[Type(42, "string")]
		public string currentAttackTarget = default(string);

		[Type(43, "boolean")]
		public bool pendingAttack = default(bool);

		[Type(44, "number")]
		public float attackExecuteTime = default(float);

		[Type(45, "string")]
		public string pendingAttackTargetId = default(string);
	}
}
