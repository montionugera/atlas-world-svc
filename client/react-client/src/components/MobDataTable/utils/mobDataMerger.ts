import { MobInstance } from '../../../utils/gameDataManager'
import { mobFromGameState } from './mobDataConverter'

/**
 * Merge metadata with real-time gameState data
 * Uses metadata for static fields, gameState for real-time fields
 * 
 * @param metadata - Static metadata from REST API
 * @param gameMob - Real-time mob data from gameState
 * @returns Merged MobInstance with latest real-time data
 */
export function mergeMobData(metadata: MobInstance, gameMob: any): MobInstance {
  // Access Colyseus schema properties safely
  const mobAny = gameMob as any
  const mobData = typeof mobAny.toJSON === 'function' ? mobAny.toJSON() : mobAny
  
  return {
    ...metadata,
    // Real-time fields from gameState (these update frequently)
    currentHealth: mobData.currentHealth ?? metadata.currentHealth,
    isAlive: mobData.isAlive ?? metadata.isAlive,
    currentBehavior: mobData.currentBehavior || metadata.currentBehavior,
    tag: mobData.tag || metadata.tag,
    isCasting: mobData.isCasting ?? metadata.isCasting,
    isAttacking: mobData.isAttacking ?? metadata.isAttacking,
  }
}

/**
 * Create merged mobs array from gameState mobs and metadata map
 * 
 * @param gameStateMobs - Map of mobs from gameState
 * @param metadataMap - Map of mob metadata from REST API
 * @returns Array of merged MobInstance objects
 */
export function createMergedMobs(
  gameStateMobs: Map<string, any>,
  metadataMap: Map<string, MobInstance>
): MobInstance[] {
  const merged: MobInstance[] = []
  const gameStateMobsArray = Array.from(gameStateMobs.values())

  gameStateMobsArray.forEach(gameMob => {
    const metadata = metadataMap.get(gameMob.id)
    
    if (metadata) {
      // Merge: use metadata for static fields, gameState for real-time fields
      merged.push(mergeMobData(metadata, gameMob))
    } else {
      // No metadata yet - use gameState data (will fetch metadata soon)
      merged.push(mobFromGameState(gameMob))
    }
  })

  return merged
}

