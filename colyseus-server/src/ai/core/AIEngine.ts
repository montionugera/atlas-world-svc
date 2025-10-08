/**
 * Core AI Engine
 * Processes AI behaviors for all mobs
 */

import { Mob } from '../../schemas/Mob';
import { AIBehavior, AIDecision } from './AIBehavior';
import { AIContext, AIMemoryImpl } from './AIContext';
import { AIState, AIStateMachineImpl } from './AIState';
import { AIWorldInterface } from '../AIWorldInterface';

export interface AIConfig {
  behaviors: string[];
  perception: { range: number; fov: number };
  memory: { duration: number };
  aggression?: number;
}

export interface AIStats {
  mobCount: number;
  averageUpdateTime: number;
}

export class MobAI {
  public mob: Mob;
  public config: AIConfig;
  public state: AIState;
  public behavior: AIBehavior | null = null;
  public lastUpdate: number = 0;
  public stateMachine: AIStateMachineImpl;
  public memory: AIMemoryImpl;
  
  constructor(mob: Mob, config: AIConfig) {
    this.mob = mob;
    this.config = config;
    this.state = AIState.IDLE;
    this.stateMachine = new AIStateMachineImpl(AIState.IDLE);
    this.memory = new AIMemoryImpl();
  }
  
  // Update mob AI state
  updateState(newState: AIState): void {
    if (this.state !== newState) {
      console.log(`🔄 Mob ${this.mob.id}: ${this.state} → ${newState}`);
      this.state = newState;
      this.stateMachine.transitionTo(newState);
    }
  }
  
  // Set current behavior
  setBehavior(behavior: AIBehavior): void {
    if (this.behavior !== behavior) {
      this.behavior = behavior;
      this.mob.tag = behavior.name; // Update mob tag to show current behavior
      console.log(`🎯 Mob ${this.mob.id} using behavior: ${behavior.name}`);
    }
  }
  
  // Get AI configuration
  getConfig(): AIConfig {
    return this.config;
  }
}

export class AIEngine {
  private worldInterface: AIWorldInterface;
  private mobs: Map<string, MobAI> = new Map();
  // Legacy behavior registry (kept for metrics compatibility, no longer used)
  private behaviors: Map<string, AIBehavior> = new Map();
  private performance: AIPerformance;
  
  constructor(worldInterface: AIWorldInterface) {
    this.worldInterface = worldInterface;
    this.performance = new AIPerformance();
    // Legacy behavior registry removed; decisions live on Mob
    console.log(`🧠 AI Engine initialized`);
  }
  
  // Register mob for AI processing
  registerMob(mob: Mob, config: AIConfig): void {
    const mobAI = new MobAI(mob, config);
    this.mobs.set(mob.id, mobAI);
    
    console.log(`🤖 Registered mob ${mob.id} for AI processing`);
  }
  
  // Unregister mob
  unregisterMob(mobId: string): void {
    this.mobs.delete(mobId);
    console.log(`🤖 Unregistered mob ${mobId} from AI processing`);
  }
  
  // Update all mob AI
  updateAll(): void {
    const startTime = performance.now();
    
    for (const [mobId, mobAI] of this.mobs) {
      try {
        this.updateMobAI(mobAI);
      } catch (error) {
        console.error(`❌ AI Error for mob ${mobId}:`, error);
      }
    }
    
    const updateTime = performance.now() - startTime;
    this.performance.recordUpdate(updateTime);
  }
  
  // Update single mob AI
  private updateMobAI(mobAI: MobAI): void {
    const startTime = performance.now();
    
    // Build environment and delegate behavior decision via the mob update
    const env = this.worldInterface.buildMobEnvironment(mobAI.mob, mobAI.config.perception.range);
    
    // Delegate functions
    const delegate = {
      decideBehavior: (mob: any, e: any) => {
        // Delegate behavior selection to the mob implementation to avoid duplication
        mob.decideBehavior(e);
      },
      applyDecision: (mobId: string, velocity: { x: number; y: number }, behavior: string) => {
        this.worldInterface.applyAIDecision(mobId, {
          velocity,
          behavior,
          timestamp: Date.now()
        });
      }
    };

    // Mob-driven update with delegate
    mobAI.mob.update(env as any, delegate);
    
    // 6. Update performance metrics
    const updateTime = performance.now() - startTime;
    this.performance.recordMobUpdate(mobAI.mob.id, updateTime);
    
    mobAI.lastUpdate = Date.now();
  }
  
  // Get statistics
  getStats(): AIStats {
    return {
      mobCount: this.mobs.size,
      averageUpdateTime: this.performance.getAverageUpdateTime()
    };
  }
  
  getMobCount(): number {
    return this.mobs.size;
  }
  
  // Legacy behavior distribution/memory metrics removed
}

// Performance monitoring class
class AIPerformance {
  private updateTimes: number[] = [];
  private mobUpdateTimes: Map<string, number[]> = new Map();
  private maxSamples = 100;
  
  recordUpdate(updateTime: number): void {
    this.updateTimes.push(updateTime);
    if (this.updateTimes.length > this.maxSamples) {
      this.updateTimes.shift();
    }
  }
  
  recordMobUpdate(mobId: string, updateTime: number): void {
    if (!this.mobUpdateTimes.has(mobId)) {
      this.mobUpdateTimes.set(mobId, []);
    }
    
    const times = this.mobUpdateTimes.get(mobId)!;
    times.push(updateTime);
    if (times.length > this.maxSamples) {
      times.shift();
    }
  }
  
  getAverageUpdateTime(): number {
    if (this.updateTimes.length === 0) return 0;
    return this.updateTimes.reduce((sum, time) => sum + time, 0) / this.updateTimes.length;
  }
  
  getAverageMobUpdateTime(mobId: string): number {
    const times = this.mobUpdateTimes.get(mobId);
    if (!times || times.length === 0) return 0;
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }
}
