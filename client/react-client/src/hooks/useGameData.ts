/**
 * React Hook for Game Data Manager
 * Provides easy access to static game data with loading states
 */

import { useState, useEffect, useCallback } from 'react'
import { gameDataManager, MobType, GameConfig, PlayerInstance } from '../utils/gameDataManager'

/**
 * Hook for fetching mob types list
 */
export function useMobTypesList() {
  const [mobTypes, setMobTypes] = useState<MobType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    gameDataManager.getMobTypesList()
      .then(data => {
        if (!cancelled) {
          setMobTypes(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    gameDataManager.getMobTypesList(true)
      .then(data => {
        setMobTypes(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [])

  return { mobTypes, loading, error, refresh }
}

/**
 * Hook for fetching a specific mob type
 */
export function useMobType(id: string | null) {
  const [mobType, setMobType] = useState<MobType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!id) {
      setMobType(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    // Check cache first
    const cached = gameDataManager.getCachedMobType(id)
    if (cached) {
      setMobType(cached)
      setLoading(false)
      return
    }

    gameDataManager.getMobType(id)
      .then(data => {
        if (!cancelled) {
          setMobType(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const refresh = useCallback(() => {
    if (!id) return

    setLoading(true)
    setError(null)
    gameDataManager.getMobType(id, true)
      .then(data => {
        setMobType(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [id])

  return { mobType, loading, error, refresh }
}

/**
 * Hook for fetching game configuration
 */
export function useGameConfig() {
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    // Check cache first
    const cached = gameDataManager.getCachedGameConfig()
    if (cached) {
      setConfig(cached)
      setLoading(false)
      return
    }

    gameDataManager.getGameConfig()
      .then(data => {
        if (!cancelled) {
          setConfig(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    gameDataManager.getGameConfig(true)
      .then(data => {
        setConfig(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [])

  return { config, loading, error, refresh }
}

/**
 * Hook for fetching players in a room
 * @param roomId - Room identifier
 * @param playerIds - Optional array of player IDs to fetch. If not provided, fetches all players.
 */
export function useRoomPlayers(roomId: string | null, playerIds?: string[] | null) {
  const [players, setPlayers] = useState<PlayerInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!roomId) {
      setPlayers([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    gameDataManager.getRoomPlayers(roomId, playerIds || undefined)
      .then(data => {
        if (!cancelled) {
          setPlayers(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [roomId, playerIds?.join(',')]) // Re-fetch when IDs change

  const refresh = useCallback(() => {
    if (!roomId) return

    setLoading(true)
    setError(null)
    gameDataManager.getRoomPlayers(roomId, playerIds || undefined, true)
      .then(data => {
        setPlayers(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [roomId, playerIds?.join(',')])

  return { players, loading, error, refresh }
}

/**
 * Hook for fetching a specific player instance
 */
export function usePlayerInstance(roomId: string | null, playerId: string | null) {
  const [player, setPlayer] = useState<PlayerInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!roomId || !playerId) {
      setPlayer(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    gameDataManager.getPlayerInstance(roomId, playerId)
      .then(data => {
        if (!cancelled) {
          setPlayer(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [roomId, playerId])

  const refresh = useCallback(() => {
    if (!roomId || !playerId) return

    setLoading(true)
    setError(null)
    gameDataManager.getPlayerInstance(roomId, playerId)
      .then(data => {
        setPlayer(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [roomId, playerId])

  return { player, loading, error, refresh }
}

