import { useState, useEffect } from 'react'
import { PlayerInstance, gameDataManager } from '../../../utils/gameDataManager'

export function usePlayersMetadata(roomId: string | null, refreshInterval: number) {
  const [playersMetadata, setPlayersMetadata] = useState<Map<string, PlayerInstance>>(new Map())

  useEffect(() => {
    if (!roomId) return

    const fetchMetadata = async () => {
      try {
        const players = await gameDataManager.getRoomPlayers(roomId)
        const map = new Map<string, PlayerInstance>()
        players.forEach(p => map.set(p.id, p))
        setPlayersMetadata(map)
      } catch (e) {
        console.error('Failed to fetch player metadata:', e)
      }
    }

    fetchMetadata()
    const interval = setInterval(fetchMetadata, refreshInterval)
    return () => clearInterval(interval)
  }, [roomId, refreshInterval])

  return { playersMetadata }
}
