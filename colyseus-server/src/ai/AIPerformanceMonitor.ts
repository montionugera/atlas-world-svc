/**
 * AI Performance Monitor
 * Tracks and reports performance metrics for the AI module
 */

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

/**
 * Performance monitoring for AI module
 * Tracks update times and provides performance metrics
 */
export class AIPerformanceMonitor {
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
      maxUpdateTime: this.updateTimes.length > 0 ? Math.max(...this.updateTimes) : 0,
      minUpdateTime: this.updateTimes.length > 0 ? Math.min(...this.updateTimes) : 0,
      totalUpdates: this.updateTimes.length,
      isRunning: true,
    }
  }

  private getAverageUpdateTime(): number {
    if (this.updateTimes.length === 0) return 0
    return this.updateTimes.reduce((sum, time) => sum + time, 0) / this.updateTimes.length
  }
}

