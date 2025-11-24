/**
 * Game Data Manager
 * Fetches and caches static game data from REST API
 * Reduces real-time WebSocket payload by offloading static data
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:2567/api'

interface MobType {
  id: string
  name: string
  spawnWeight?: number
  bodyRadius?: number | [number, number]
  stats?: any
  atkStrategies?: any[]
}

interface GameConfig {
  tickRate: number
  serverFPS: number
  worldWidth: number
  worldHeight: number
  mobSpeedRange: number
  mobSpawnMargin: number
  attackImpulseMultiplier: number
  recoilImpulseMultiplier: number
  minImpulse: number
  maxImpulse: number
}

export interface MobInstance {
  id: string
  mobTypeId: string
  radius: number
  maxHealth: number
  currentHealth: number
  isAlive: boolean
  attackDamage: number
  attackRange: number
  attackDelay: number
  defense: number
  armor: number
  density: number
  maxMoveSpeed: number
  currentBehavior: string
  tag: string
  behaviorLockedUntil: number
  isCasting: boolean
  isAttacking: boolean
  lastAttackedTarget: string
}

export interface PlayerInstance {
  id: string
  sessionId: string
  name: string
  maxLinearSpeed: number
  radius: number
  maxHealth: number
  currentHealth: number
  isAlive: boolean
  attackDamage: number
  attackRange: number
  attackDelay: number
  defense: number
  armor: number
  density: number
  isAttacking: boolean
  lastAttackedTarget: string
}

class GameDataManager {
  private mobTypesCache: Map<string, MobType> = new Map()
  private mobTypesListCache: MobType[] | null = null
  private gameConfigCache: GameConfig | null = null
  private loadingPromises: Map<string, Promise<any>> = new Map()

  /**
   * Fetch all mob types (lightweight list)
   */
  async getMobTypesList(forceRefresh = false): Promise<MobType[]> {
    if (this.mobTypesListCache && !forceRefresh) {
      return this.mobTypesListCache
    }

    const cacheKey = 'mob-types-list'
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)! as Promise<MobType[]>
    }

    const promise = fetch(`${API_BASE_URL}/mob-types?light=true`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch mob types: ${res.statusText}`)
        return res.json()
      })
      .then(data => {
        const mobTypes = data.mobTypes || []
        this.mobTypesListCache = mobTypes
        this.loadingPromises.delete(cacheKey)
        return mobTypes
      })
      .catch(err => {
        this.loadingPromises.delete(cacheKey)
        console.error('Failed to fetch mob types list:', err)
        throw err
      })

    this.loadingPromises.set(cacheKey, promise)
    return promise
  }

  /**
   * Fetch specific mob type by ID
   */
  async getMobType(id: string, forceRefresh = false): Promise<MobType | null> {
    if (this.mobTypesCache.has(id) && !forceRefresh) {
      return this.mobTypesCache.get(id)!
    }

    const cacheKey = `mob-type-${id}`
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!
    }

    const promise = fetch(`${API_BASE_URL}/mob-types/${id}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) return null
          throw new Error(`Failed to fetch mob type ${id}: ${res.statusText}`)
        }
        return res.json()
      })
      .then(data => {
        const mobType = data.mobType
        if (mobType) {
          this.mobTypesCache.set(id, mobType)
        }
        this.loadingPromises.delete(cacheKey)
        return mobType || null
      })
      .catch(err => {
        this.loadingPromises.delete(cacheKey)
        console.error(`Failed to fetch mob type ${id}:`, err)
        throw err
      })

    this.loadingPromises.set(cacheKey, promise)
    return promise
  }

  /**
   * Fetch mob stats for a specific mob type
   */
  async getMobStats(mobTypeId: string, forceRefresh = false): Promise<any | null> {
    // Check if we have the full mob type cached
    const cached = this.mobTypesCache.get(mobTypeId)
    if (cached && cached.stats && !forceRefresh) {
      return cached.stats
    }

    const cacheKey = `mob-stats-${mobTypeId}`
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!
    }

    const promise = fetch(`${API_BASE_URL}/mob-types/${mobTypeId}/stats`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) return null
          throw new Error(`Failed to fetch mob stats for ${mobTypeId}: ${res.statusText}`)
        }
        return res.json()
      })
      .then(data => {
        this.loadingPromises.delete(cacheKey)
        return data.stats || null
      })
      .catch(err => {
        this.loadingPromises.delete(cacheKey)
        console.error(`Failed to fetch mob stats for ${mobTypeId}:`, err)
        throw err
      })

    this.loadingPromises.set(cacheKey, promise)
    return promise
  }

  /**
   * Fetch game configuration
   */
  async getGameConfig(forceRefresh = false): Promise<GameConfig | null> {
    if (this.gameConfigCache && !forceRefresh) {
      return this.gameConfigCache
    }

    const cacheKey = 'game-config'
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!
    }

    const promise = fetch(`${API_BASE_URL}/game-config`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch game config: ${res.statusText}`)
        return res.json()
      })
      .then(data => {
        this.gameConfigCache = data.config
        this.loadingPromises.delete(cacheKey)
        return this.gameConfigCache
      })
      .catch(err => {
        this.loadingPromises.delete(cacheKey)
        console.error('Failed to fetch game config:', err)
        throw err
      })

    this.loadingPromises.set(cacheKey, promise)
    return promise
  }

  /**
   * Preload all mob types (useful for initial load)
   */
  async preloadMobTypes(): Promise<void> {
    try {
      await this.getMobTypesList()
      const types = await this.getMobTypesList()
      if (types) {
        // Preload all mob type details
        await Promise.all(types.map(type => this.getMobType(type.id)))
      }
    } catch (err) {
      console.warn('Failed to preload mob types:', err)
    }
  }

  /**
   * Clear all caches (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.mobTypesCache.clear()
    this.mobTypesListCache = null
    this.gameConfigCache = null
    this.loadingPromises.clear()
  }

  /**
   * Get cached mob type (synchronous, returns null if not cached)
   */
  getCachedMobType(id: string): MobType | null {
    return this.mobTypesCache.get(id) || null
  }

  /**
   * Get cached game config (synchronous, returns null if not cached)
   */
  getCachedGameConfig(): GameConfig | null {
    return this.gameConfigCache
  }

  /**
   * Fetch all mobs in a room
   */
  async getRoomMobs(roomId: string, forceRefresh = false): Promise<MobInstance[]> {
    const cacheKey = `room-mobs-${roomId}`
    
    // Don't cache mob instances - they change frequently
    const promise = fetch(`${API_BASE_URL}/rooms/${roomId}/mobs`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) return []
          throw new Error(`Failed to fetch mobs: ${res.statusText}`)
        }
        return res.json()
      })
      .then(data => {
        return data.mobs || []
      })
      .catch(err => {
        console.error(`Failed to fetch mobs for room ${roomId}:`, err)
        throw err
      })

    return promise
  }

  /**
   * Fetch specific mob instance
   */
  async getMobInstance(roomId: string, mobId: string): Promise<MobInstance | null> {
    return fetch(`${API_BASE_URL}/rooms/${roomId}/mobs/${mobId}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) return null
          throw new Error(`Failed to fetch mob: ${res.statusText}`)
        }
        return res.json()
      })
      .then(data => {
        return data.mob || null
      })
      .catch(err => {
        console.error(`Failed to fetch mob ${mobId}:`, err)
        throw err
      })
  }

  /**
   * Fetch players in a room
   * @param roomId - Room identifier
   * @param playerIds - Optional array of player IDs to fetch. If not provided, fetches all players.
   * @param forceRefresh - Force refresh (not used for player instances, kept for API consistency)
   */
  async getRoomPlayers(roomId: string, playerIds?: string[], forceRefresh = false): Promise<PlayerInstance[]> {
    // Build URL with optional IDs query parameter
    let url = `${API_BASE_URL}/rooms/${roomId}/players`
    if (playerIds && playerIds.length > 0) {
      // Use comma-separated format for cleaner URLs
      const idsParam = playerIds.join(',')
      url += `?ids=${encodeURIComponent(idsParam)}`
    }
    
    // Don't cache player instances - they change frequently
    const promise = fetch(url)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) return []
          throw new Error(`Failed to fetch players: ${res.statusText}`)
        }
        return res.json()
      })
      .then(data => {
        return data.players || []
      })
      .catch(err => {
        console.error(`Failed to fetch players for room ${roomId}:`, err)
        throw err
      })

    return promise
  }

  /**
   * Fetch specific player instance
   */
  async getPlayerInstance(roomId: string, playerId: string): Promise<PlayerInstance | null> {
    return fetch(`${API_BASE_URL}/rooms/${roomId}/players/${playerId}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) return null
          throw new Error(`Failed to fetch player: ${res.statusText}`)
        }
        return res.json()
      })
      .then(data => {
        return data.player || null
      })
      .catch(err => {
        console.error(`Failed to fetch player ${playerId}:`, err)
        throw err
      })
  }
}

// Export singleton instance
export const gameDataManager = new GameDataManager()
export type { MobType, GameConfig }
// PlayerInstance is already exported as interface above

