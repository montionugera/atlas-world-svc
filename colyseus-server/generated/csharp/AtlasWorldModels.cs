using System;
using Colyseus.Schema;
using Type = Colyseus.Schema.Type;

namespace AtlasWorld.Models
{
    /// <summary>
    /// Base class for all world objects - matches server WorldObject schema
    /// Only includes fields marked with @type() decorator (synced to clients)
    /// </summary>
    public partial class WorldObject : Schema
    {
        [Type(0, "string")]
        public string id = "";
        
        [Type(1, "number")]
        public float x = 0;
        
        [Type(2, "number")]
        public float y = 0;
        
        [Type(3, "number")]
        public float vx = 0;
        
        [Type(4, "number")]
        public float vy = 0;
        
        [Type(5, "array", typeof(ArraySchema<string>))]
        public ArraySchema<string> tags = new ArraySchema<string>();
        
        [Type(6, "string")]
        public string physicsBodyId = "";
        
        [Type(7, "number")]
        public float angle = 0;
        
        [Type(8, "number")]
        public float angularVelocity = 0;
        
        [Type(9, "boolean")]
        public bool isStatic = false;
    }

    /// <summary>
    /// Base class for living entities - matches server WorldLife schema
    /// Extends WorldObject with health, combat, and movement properties
    /// </summary>
    public partial class WorldLife : WorldObject
    {
        [Type(10, "number")]
        public float radius = 4;
        
        [Type(11, "number")]
        public float maxHealth = 100;
        
        [Type(12, "number")]
        public float currentHealth = 100;
        
        [Type(13, "boolean")]
        public bool isAlive = true;
        
        [Type(14, "number")]
        public float attackDamage = 10;
        
        [Type(15, "number")]
        public float attackRange = 5;
        
        [Type(16, "number")]
        public float attackDelay = 1000;
        
        [Type(17, "number")]
        public float lastAttackTime = 0;
        
        [Type(18, "number")]
        public float defense = 0;
        
        [Type(19, "number")]
        public float armor = 0;
        
        [Type(20, "number")]
        public float density = 1;
        
        [Type(21, "boolean")]
        public bool isAttacking = false;
        
        [Type(22, "boolean")]
        public bool isMoving = false;
        
        [Type(23, "string")]
        public string lastAttackedTarget = "";
        
        [Type(24, "number")]
        public float heading = 0;
    }

    /// <summary>
    /// Player entity - matches server Player schema
    /// Extends WorldLife with player-specific properties
    /// </summary>
    public partial class Player : WorldLife
    {
        [Type(25, "string")]
        public string sessionId = "";
        
        [Type(26, "string")]
        public string name = "";
        
        [Type(27, "number")]
        public float maxLinearSpeed = 20;
    }

    /// <summary>
    /// Mob entity - matches server Mob schema
    /// Extends WorldLife with mob-specific AI and behavior properties
    /// </summary>
    public partial class Mob : WorldLife
    {
        [Type(25, "string")]
        public string tag = "idle";
        
        [Type(26, "string")]
        public string currentBehavior = "idle";
        
        [Type(27, "number")]
        public float behaviorLockedUntil = 0;
        
        [Type(28, "boolean")]
        public bool isWindingUp = false;
        
        [Type(29, "number")]
        public float maxMoveSpeed = 20;
    }

    /// <summary>
    /// Projectile entity - matches server Projectile schema
    /// Extends WorldObject with projectile-specific properties
    /// </summary>
    public partial class Projectile : WorldObject
    {
        [Type(10, "number")]
        public float radius = 0.5f;
        
        [Type(11, "string")]
        public string ownerId = "";
        
        [Type(12, "boolean")]
        public bool isStuck = false;
    }

    /// <summary>
    /// Game state - matches server GameState schema
    /// Contains all entities and world state synced to clients
    /// </summary>
    public partial class GameState : Schema
    {
        [Type(0, "map", typeof(MapSchema<Player>))]
        public MapSchema<Player> players = new MapSchema<Player>();
        
        [Type(1, "map", typeof(MapSchema<Mob>))]
        public MapSchema<Mob> mobs = new MapSchema<Mob>();
        
        [Type(2, "map", typeof(MapSchema<Projectile>))]
        public MapSchema<Projectile> projectiles = new MapSchema<Projectile>();
        
        [Type(3, "number")]
        public float tick = 0;
        
        [Type(4, "string")]
        public string mapId = "map-01-sector-a";
        
        [Type(5, "string")]
        public string roomId = "";
        
        [Type(6, "number")]
        public float width = 100;
        
        [Type(7, "number")]
        public float height = 100;
    }

    /// <summary>
    /// Player input data for movement (not a schema, just a message)
    /// </summary>
    [System.Serializable]
    public class PlayerInput
    {
        public float vx;
        public float vy;
    }

    /// <summary>
    /// Room options for joining
    /// </summary>
    [System.Serializable]
    public class RoomOptions
    {
        public string mapId = "map-01-sector-a";
        public string name = "UnityPlayer";
    }
}
