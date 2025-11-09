# Testing Guide - Atlas World Server

## Overview

This project uses **Jest** for testing. Tests are located in `src/tests/`.

## Test Status

- ✅ **230/232 tests passing** (99% pass rate)
- ⚠️ **2 skipped** (physics collision - documented)
- ✅ **All critical tests passing**

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- mob-lifecycle.test.ts

# Run in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Test Structure

### Unit Tests
- Test individual functions/classes in isolation
- Fast execution
- No external dependencies

### Integration Tests
- Test multiple components working together
- May require server/client setup
- More lenient timing assertions

### Test Files
- `*.test.ts` - Test files
- `setup.ts` - Test setup/teardown
- `test-helpers.ts` - Common utilities

## Writing Tests

### Basic Test Pattern

```typescript
import { createTestGameState, createTestMob } from './test-helpers'

describe('MyFeature', () => {
  let gameState: GameState

  beforeEach(() => {
    gameState = createTestGameState()
  })

  test('should do something', () => {
    const mob = createTestMob({ id: 'mob-1', x: 50, y: 50 })
    gameState.mobs.set(mob.id, mob)
    
    expect(gameState.mobs.size).toBe(1)
  })
})
```

### Using Test Helpers

```typescript
import {
  createTestGameState,
  createTestMob,
  createTestPlayer,
  waitForCondition,
  fastForwardTime,
} from './test-helpers'

// Create test entities
const gameState = createTestGameState('map-01', 'room-1')
const mob = createTestMob({ id: 'mob-1', x: 50, y: 50 })
const player = createTestPlayer({ sessionId: 'player-1', name: 'Test' })

// Wait for async condition
await waitForCondition(() => mob.isAlive === false, 5000)

// Fast-forward time
fastForwardTime(mob, 5000) // 5 seconds
```

## Test Best Practices

### 1. Use Test Helpers
- ✅ Use `createTestMob()`, `createTestPlayer()`, etc.
- ❌ Don't manually construct entities with all parameters

### 2. Test Isolation
- ✅ Clean up in `afterEach()` if needed
- ✅ Use fresh instances for each test
- ❌ Don't share mutable state between tests

### 3. Assertions
- ✅ Use descriptive `expect()` messages
- ✅ Test one thing per test
- ❌ Don't use hardcoded values (use config)

### 4. Timing
- ✅ Use `waitForCondition()` for async operations
- ✅ Make timing assertions lenient (CI can be slow)
- ❌ Don't use fixed timeouts without tolerance

### 5. Error Handling
- ✅ Test error cases
- ✅ Use try-catch in cleanup (`afterAll`, `afterEach`)
- ❌ Don't let cleanup errors fail tests

## Common Patterns

### Testing Mob Lifecycle

```typescript
test('should remove dead mobs', () => {
  const mob = createTestMob()
  gameState.mobs.set(mob.id, mob)
  
  mob.die()
  mob.readyToRemove = true
  
  lifecycleManager.update()
  
  expect(gameState.mobs.has(mob.id)).toBe(false)
})
```

### Testing Async Operations

```typescript
test('should receive updates', async () => {
  let updateCount = 0
  
  room.onStateChange(() => {
    updateCount++
  })
  
  await waitForCondition(() => updateCount >= 5, 10000)
  expect(updateCount).toBeGreaterThanOrEqual(5)
})
```

### Testing Time-Based Logic

```typescript
test('should respect cooldown', () => {
  const mob = createTestMob()
  
  // Fast-forward past cooldown
  fastForwardTime(mob, mob.attackDelay + 100)
  
  expect(mob.canAttack()).toBe(true)
})
```

## Skipped Tests

### Physics Collision Tests
- **Location**: `physics.test.ts`
- **Reason**: Collision callbacks not firing reliably in test environment
- **Status**: Documented with TODO comments
- **Action**: Will be fixed when physics manager collision system is refactored

## Debugging Tests

### Run Single Test
```bash
npm test -- -t "should do something"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose Output
```bash
npm test -- --verbose
```

## CI/CD

Tests run automatically on:
- Pull requests
- Commits to main branch

All tests must pass before merging.

## Coverage Goals

- **Minimum**: 80% coverage
- **Target**: 90% coverage
- **Critical paths**: 100% coverage

Run coverage:
```bash
npm test -- --coverage
```

