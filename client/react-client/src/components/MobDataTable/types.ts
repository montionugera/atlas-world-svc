import { GameState } from '../../types/game'
import { MobInstance } from '../../utils/gameDataManager'

/**
 * Main component props
 */
export interface MobDataTableProps {
  roomId: string | null
  gameState?: GameState | null
  refreshInterval?: number
}

/**
 * Header component props
 */
export interface MobTableHeaderProps {
  mobCount: number
  loading: boolean
  hasGameState: boolean
  refreshInterval: number
  onRefresh: () => void
}

/**
 * Error component props
 */
export interface MobTableErrorProps {
  error: string
  roomId?: string | null
}

/**
 * Empty state component props
 */
export interface MobTableEmptyProps {
  message: string
  debugInfo?: string
}

/**
 * Table row component props
 */
export interface MobTableRowProps {
  mob: MobInstance
  isSelected: boolean
  onSelect: (mobId: string) => void
}

/**
 * Table body component props
 */
export interface MobTableBodyProps {
  mobs: MobInstance[]
  selectedMobId: string | null
  onSelectMob: (mobId: string) => void
}

/**
 * Details panel component props
 */
export interface MobDetailsPanelProps {
  mob: MobInstance
  onClose: () => void
}

/**
 * Hook return types
 */
export interface UseEffectiveRoomIdReturn {
  effectiveRoomId: string | null
}

export interface UseMobDataMergingReturn {
  mergedMobs: MobInstance[]
}

export interface UseMobMetadataReturn {
  mobsMetadata: Map<string, MobInstance>
  loading: boolean
  error: string | null
  fetchMobsMetadata: (mobIds?: string[]) => Promise<void>
  refreshMetadata: () => void
}

