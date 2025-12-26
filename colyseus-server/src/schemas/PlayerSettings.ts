import { Schema, type } from '@colyseus/schema'
import { GAME_CONFIG } from '../config/gameConfig'

export class PlayerSettings extends Schema {
  // Respawn Location
  @type('number') spawnX: number
  @type('number') spawnY: number

  // Future settings can go here without bloating Player.ts
  // e.g. uiTheme, soundVolume, autoRetaliate, etc.

  constructor(
      spawnX: number = GAME_CONFIG.worldWidth / 2, 
      spawnY: number = GAME_CONFIG.worldHeight / 2
  ) {
    super()
    this.spawnX = spawnX
    this.spawnY = spawnY
  }
}
