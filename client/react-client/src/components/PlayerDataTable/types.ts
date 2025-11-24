import { GameState } from '../../types/game'
import { PlayerInstance } from '../../utils/gameDataManager'

/**
 * Main component props
 */
export interface PlayerDataTableProps {
  roomId: string | null
  gameState?: GameState | null
  refreshInterval?: number
}

/**
 * Header component props
 */
export interface PlayerTableHeaderProps {
  playerCount: number
  loading: boolean
  hasGameState: boolean
  refreshInterval: number
  onRefresh: () => void
}

/**
 * Error component props
 */
export interface PlayerTableErrorProps {
  error: string
  roomId?: string | null
}

/**
 * Empty state component props
 */
export interface PlayerTableEmptyProps {
  message: string
  debugInfo?: string
}

/**
 * Table row component props
 */
export interface PlayerTableRowProps {
  player: PlayerInstance
  isSelected: boolean
  onSelect: (playerId: string) => void
}

/**
 * Table body component props
 */
export interface PlayerTableBodyProps {
  players: PlayerInstance[]
  selectedPlayerId: string | null
  onSelectPlayer: (playerId: string) => void
}

/**
 * Details panel component props
 */
export interface PlayerDetailsPanelProps {
  player: PlayerInstance
  onClose: () => void
}

/**
 * Hook return types
 */
export interface UseEffectiveRoomIdReturn {
  effectiveRoomId: string | null
}

export interface UsePlayerDataMergingReturn {
  mergedPlayers: PlayerInstance[]
}

export interface UsePlayerMetadataReturn {
  playersMetadata: Map<string, PlayerInstance>
  loading: boolean
  error: string | null
  fetchPlayersMetadata: (playerIds?: string[]) => Promise<void>
  refreshMetadata: () => void
}

