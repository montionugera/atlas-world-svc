import { Player } from '../schemas/Player'
import { GAME_CONFIG } from '../config/gameConfig'
import { PlayerSettingGameplay } from '../schemas/PlayerSettingGameplay'

describe('Player Settings and Configuration', () => {
    
  it('should initialize with gameplay settings', () => {
    const player = new Player('test-session', 'TestPlayer')
    
    expect(player.settingGameplay).toBeDefined()
    expect(player.settingGameplay).toBeInstanceOf(PlayerSettingGameplay)
  })

  it('should default spawn location to map center', () => {
    // Default config values
    const expectedX = GAME_CONFIG.worldWidth / 2
    const expectedY = GAME_CONFIG.worldHeight / 2
    
    // Test default constructor
    const setting = new PlayerSettingGameplay()
    
    expect(setting.spawnX).toBe(expectedX)
    expect(setting.spawnY).toBe(expectedY)
  })

  it('should allow custom spawn location via Player constructor', () => {
    const customX = 123
    const customY = 456
    const player = new Player('test-session', 'TestPlayer', customX, customY)
    
    expect(player.settingGameplay.spawnX).toBe(customX)
    expect(player.settingGameplay.spawnY).toBe(customY)
  })

  it('should persist settings when player state updates', () => {
    const player = new Player('test-session', 'TestPlayer')
    
    // Simulate some update (mutation)
    player.x = 999
    player.y = 888
    
    // Settings should remain immutable unless explicitly changed
    expect(player.settingGameplay.spawnX).toBe(GAME_CONFIG.worldWidth / 2)
  })
})
