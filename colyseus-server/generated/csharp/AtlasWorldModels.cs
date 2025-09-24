using System;
using UnityEngine;
using Colyseus.Schema;
using Type = Colyseus.Schema.Type;

namespace AtlasWorld.Models
{
    /// <summary>
    /// Player input data for movement
    /// </summary>
    [System.Serializable]
    public class PlayerInput
    {
        public float vx;
        public float vy;
    }

    /// <summary>
    /// Player position data
    /// </summary>
    [System.Serializable]
    public class PlayerPosition
    {
        public float x;
        public float y;
    }

    /// <summary>
    /// Welcome message from server
    /// </summary>
    [System.Serializable]
    public class WelcomeMessage
    {
        public string message;
        public string playerId;
        public string mapId;
    }

    /// <summary>
    /// State change message from server
    /// </summary>
    [System.Serializable]
    public class StateChangeMessage
    {
        public Player[] players;
        public Mob[] mobs;
        public float tick;
        public string mapId;
    }

    /// <summary>
    /// Player data in game state - matches server Player schema
    /// </summary>
    public partial class Player : Schema
    {
        [Type(0, "string")]
        public string id = "";
        
        [Type(1, "string")]
        public string sessionId = "";
        
        [Type(2, "number")]
        public float x = 0;
        
        [Type(3, "number")]
        public float y = 0;
        
        [Type(4, "number")]
        public float vx = 0;
        
        [Type(5, "number")]
        public float vy = 0;
        
        [Type(6, "string")]
        public string name = "";
    }

    /// <summary>
    /// Mob data in game state - matches server Mob schema
    /// </summary>
    public partial class Mob : Schema
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
    }

    /// <summary>
    /// Game state model for Colyseus Schema - matches server GameState
    /// </summary>
    public partial class GameState : Schema
    {
        [Type(0, "map", typeof(MapSchema<Player>))]
        public MapSchema<Player> players = new MapSchema<Player>();
        
        [Type(1, "map", typeof(MapSchema<Mob>))]
        public MapSchema<Mob> mobs = new MapSchema<Mob>();
        
        [Type(2, "number")]
        public float tick = 0;
        
        [Type(3, "string")]
        public string mapId = "";
        
        [Type(4, "number")]
        public float width = 800;
        
        [Type(5, "number")]
        public float height = 600;
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
