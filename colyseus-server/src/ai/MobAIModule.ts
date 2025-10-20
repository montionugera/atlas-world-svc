/**
 * Mob AI Module
 * Main AI module controller that runs independently
 */

import { AIWorldInterface } from './AIWorldInterface'
import { Mob } from '../schemas/Mob'

type MobEnvironment = ReturnType<AIWorldInterface['buildMobEnvironment']>

export interface AIConfig {
  behaviors?: string[]
  perception?: { range?: number; fov?: number }
  memory?: { duration?: number }
  aggression?: number
}

// No delegate needed; MobAIModule orchestrates directly

export class MobAIModule {
  private worldInterface: AIWorldInterface
  private mobs: Map<string, { mob: Mob; config: AIConfig; lastUpdate: number }> = new Map()
  private updateInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private updateFrequency = 20 // 20 FPS
  private performanceMonitor: AIPerformanceMonitor

  constructor(worldInterface: AIWorldInterface) {
    this.worldInterface = worldInterface
    this.performanceMonitor = new AIPerformanceMonitor()

    console.log(`🧠 Mob AI Module initialized`)
  }

  // Start AI module
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.updateInterval = setInterval(() => {
      this.update()
    }, 1000 / this.updateFrequency)
    // Avoid keeping Node event loop alive in tests
    if (this.updateInterval.unref) this.updateInterval.unref()

    console.log(`🧠 Mob AI Module started at ${this.updateFrequency} FPS`)
  }

  // Stop AI module
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    console.log(`🧠 Mob AI Module stopped`)
  }

  // Register mob for AI processing
  registerMob(mob: Mob, aiConfig: AIConfig): void {
    if (!mob || !mob.id) return
    this.mobs.set(mob.id, { mob, config: aiConfig, lastUpdate: 0 })
  }

  // Unregister mob
  unregisterMob(mobId: string): void {
    this.mobs.delete(mobId)
  }

  // Update all mob AI (public method for testing)
  updateAll(): void {
    this.update()
  }

  // Update all mob AI
  private update(): void {
    const startTime = performance.now()

    try {
      // Update all mob AI (inline engine logic)
      for (const { mob, config } of this.mobs.values()) {
        const env: MobEnvironment = this.worldInterface.buildMobEnvironment(
          mob,
          config?.perception?.range ?? 50
        )
        // Decide behavior directly on mob
        mob.decideBehavior(env)
        // Compute desired velocity based on behavior
        const desired = mob.computeDesiredVelocity({
          nearestPlayer: env.nearestPlayer
            ? {
                x: env.nearestPlayer.x,
                y: env.nearestPlayer.y,
                id: env.nearestPlayer.id,
                radius: env.nearestPlayer.radius,
              }
            : null,
          distanceToNearestPlayer: env.distanceToNearestPlayer,
          worldBounds: env.worldBounds,
        })
        // Apply decision to world - but respect mob's behavior decision
        this.worldInterface.applyAIDecision(mob.id, {
          velocity: desired,
          behavior: mob.currentBehavior,
          timestamp: Date.now(),
        })
      }

      // Decisions are consumed by GameState.updateMobs via physics step

      // Record performance
      const updateTime = performance.now() - startTime
      this.performanceMonitor.recordUpdate(updateTime)

      // Log performance occasionally
      if (Math.random() < 0.01) {
        // 1% chance
        const stats = this.getStats()
        console.log(
          `⚡ AI Module: ${updateTime.toFixed(2)}ms, ${stats.mobCount} mobs, avg: ${stats.averageUpdateTime.toFixed(2)}ms`
        )
      }
    } catch (error) {
      console.error(`❌ AI Module Error:`, error)
    }
  }

  // Get AI statistics
  getStats(): AIStats {
    const metrics = this.performanceMonitor.getMetrics()
    return {
      mobCount: this.mobs.size,
      averageUpdateTime: metrics.averageUpdateTime,
      behaviorDistribution: this.getBehaviorDistribution(),
      memoryUsage: this.getMemoryUsageEstimate(),
    }
  }

  private getBehaviorDistribution(): { [behaviorName: string]: number } {
    const distribution: { [behaviorName: string]: number } = {}
    for (const { mob } of this.mobs.values()) {
      const key = mob.currentBehavior || 'unknown'
      distribution[key] = (distribution[key] || 0) + 1
    }
    return distribution
  }

  // Rough estimate using decision history length if available in future; fallback to mob count
  private getMemoryUsageEstimate(): number {
    // No explicit memory tracking now; return proportional to mob count
    return this.mobs.size * 0.1
  }

  // Configure update frequency
  setUpdateFrequency(fps: number): void {
    this.updateFrequency = fps
    if (this.isRunning) {
      this.stop()
      this.start()
    }
    console.log(`🧠 AI Module frequency set to ${fps} FPS`)
  }

  // Get performance metrics
  getPerformanceMetrics(): AIPerformanceMetrics {
    const m = this.performanceMonitor.getMetrics()
    return { ...m, isRunning: this.isRunning }
  }

  // Check if AI module is running
  isAIModuleRunning(): boolean {
    return this.isRunning
  }
}

// Performance monitoring for AI module
class AIPerformanceMonitor {
  private updateTimes: number[] = []
  private maxSamples = 100
  private startTime = Date.now()

  recordUpdate(updateTime: number): void {
    this.updateTimes.push(updateTime)
    if (this.updateTimes.length > this.maxSamples) {
      this.updateTimes.shift()
    }
  }

  getMetrics(): AIPerformanceMetrics {
    const now = Date.now()
    const uptime = now - this.startTime

    return {
      uptime,
      averageUpdateTime: this.getAverageUpdateTime(),
      maxUpdateTime: Math.max(...this.updateTimes),
      minUpdateTime: Math.min(...this.updateTimes),
      totalUpdates: this.updateTimes.length,
      isRunning: true,
    }
  }

  private getAverageUpdateTime(): number {
    if (this.updateTimes.length === 0) return 0
    return this.updateTimes.reduce((sum, time) => sum + time, 0) / this.updateTimes.length
  }
}

export interface AIPerformanceMetrics {
  uptime: number
  averageUpdateTime: number
  maxUpdateTime: number
  minUpdateTime: number
  totalUpdates: number
  isRunning: boolean
}

export interface AIStats {
  mobCount: number
  averageUpdateTime: number
  behaviorDistribution: { [behaviorName: string]: number }
  memoryUsage: number
}
