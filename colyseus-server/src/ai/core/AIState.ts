/**
 * AI State Management
 * Defines AI states and state machine functionality
 */

export enum AIState {
  IDLE = 'idle',
  ALERT = 'alert',
  AGGRESSIVE = 'aggressive',
  PASSIVE = 'passive',
  FLEEING = 'fleeing',
  DEAD = 'dead'
}

export interface AIStateMachine {
  currentState: AIState;
  previousState: AIState;
  stateStartTime: number;
  stateHistory: Array<{ state: AIState; timestamp: number; duration: number }>;
  
  transitionTo(newState: AIState): boolean;
  canTransitionTo(newState: AIState): boolean;
  getTimeInCurrentState(): number;
  getStateHistory(): Array<{ state: AIState; timestamp: number; duration: number }>;
  getAverageStateDuration(state: AIState): number;
}

export class AIStateMachineImpl implements AIStateMachine {
  currentState: AIState;
  previousState: AIState;
  stateStartTime: number;
  stateHistory: Array<{ state: AIState; timestamp: number; duration: number }> = [];
  
  constructor(initialState: AIState = AIState.IDLE) {
    this.currentState = initialState;
    this.previousState = initialState;
    this.stateStartTime = Date.now();
  }
  
  transitionTo(newState: AIState): boolean {
    if (!this.canTransitionTo(newState)) {
      return false;
    }
    
    // Record previous state duration
    const duration = Date.now() - this.stateStartTime;
    this.stateHistory.push({
      state: this.currentState,
      timestamp: this.stateStartTime,
      duration
    });
    
    // Keep only last 10 state changes
    if (this.stateHistory.length > 10) {
      this.stateHistory.shift();
    }
    
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateStartTime = Date.now();
    
    console.log(`🔄 State transition: ${this.previousState} → ${this.currentState}`);
    return true;
  }
  
  canTransitionTo(newState: AIState): boolean {
    // Prevent rapid state changes
    if (Date.now() - this.stateStartTime < 1000) { // 1 second cooldown
      return false;
    }
    
    // Define valid state transitions
    const validTransitions: Record<AIState, AIState[]> = {
      [AIState.IDLE]: [AIState.ALERT, AIState.PASSIVE, AIState.FLEEING],
      [AIState.ALERT]: [AIState.AGGRESSIVE, AIState.IDLE, AIState.FLEEING],
      [AIState.AGGRESSIVE]: [AIState.FLEEING, AIState.ALERT, AIState.IDLE],
      [AIState.PASSIVE]: [AIState.ALERT, AIState.IDLE],
      [AIState.FLEEING]: [AIState.IDLE, AIState.ALERT],
      [AIState.DEAD]: []
    };
    
    return validTransitions[this.currentState].includes(newState);
  }
  
  getTimeInCurrentState(): number {
    return Date.now() - this.stateStartTime;
  }
  
  getStateHistory(): Array<{ state: AIState; timestamp: number; duration: number }> {
    return [...this.stateHistory];
  }
  
  getAverageStateDuration(state: AIState): number {
    const durations = this.stateHistory
      .filter(entry => entry.state === state)
      .map(entry => entry.duration);
    
    return durations.length > 0 
      ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
      : 0;
  }
}
