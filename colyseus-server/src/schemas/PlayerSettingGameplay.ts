import { Schema, type } from '@colyseus/schema'
import { GAME_CONFIG } from '../config/gameConfig'

export class PlayerSettingGameplay extends Schema {
  // Respawn Location
  @type('number') spawnX: number
  @type('number') spawnY: number

  constructor(
      spawnX: number = GAME_CONFIG.worldWidth / 2, 
      spawnY: number = GAME_CONFIG.worldHeight / 2
  ) {
    super()
    this.spawnX = spawnX
    this.spawnY = spawnY
  }
}
