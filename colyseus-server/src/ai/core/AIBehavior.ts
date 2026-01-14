/**
 * Base AI Behavior Interface
 * Defines the contract for all AI behaviors
 */

import { AIContext } from './AIContext';
import { Mob } from '../../schemas/Mob';
import { BehaviorState } from '../behaviors/BehaviorState';

export interface AIDecision {
  velocity: { x: number; y: number };
  behavior: BehaviorState;
  timestamp: number;
}

export interface AIBehavior {
  readonly name: string;
  readonly priority: number;
  canExecute(context: AIContext): boolean;
  execute(mob: Mob, context: AIContext): AIDecision;
  onEnter?(mob: Mob, context: AIContext): void;
  onExit?(mob: Mob, context: AIContext): void;
}

export abstract class BaseBehavior implements AIBehavior {
  abstract readonly name: string;
  abstract readonly priority: number;
  
  abstract canExecute(context: AIContext): boolean;
  abstract execute(mob: Mob, context: AIContext): AIDecision;
  
  onEnter?(mob: Mob, context: AIContext): void;
  onExit?(mob: Mob, context: AIContext): void;
  
  protected createDecision(velocity: { x: number; y: number }): AIDecision {
    return {
      velocity,
      behavior: this.name,
      timestamp: Date.now()
    };
  }
}
