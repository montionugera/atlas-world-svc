// Test setup file
import 'jest'

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log
const originalConsoleError = console.error

beforeAll(() => {
  // Only suppress console.error, keep console.log for debugging except noisy AI/physics logs
  console.error = jest.fn()
  const noisyPrefixes = ['⚡ AI Module', '🤖 MOB', '🔄 SIMULATION HEALTH']
  const log = console.log
  console.log = (...args: any[]) => {
    if (typeof args[0] === 'string' && noisyPrefixes.some(p => args[0].includes(p))) return
    log(...args)
  }
})

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog
  console.error = originalConsoleError
})

// Control timers in tests that rely on setInterval/setTimeout
// Note: Using fake timers globally interferes with integration tests relying on real time.
// Prefer enabling fake timers within specific tests that need them.

// Global test cleanup to stop AI modules
afterEach(() => {
  // Clean up any running AI modules to prevent background timers
  jest.clearAllTimers()
})

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinBounds(): R
    }
  }
}

// Custom matcher for position bounds checking
expect.extend({
  toBeWithinBounds(received: { x: number; y: number }, expected: { min: number; max: number }) {
    const { x, y } = received
    const { min, max } = expected

    const pass = x >= min && x <= max && y >= min && y <= max

    if (pass) {
      return {
        message: () => `expected position (${x}, ${y}) not to be within bounds (${min}, ${max})`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected position (${x}, ${y}) to be within bounds (${min}, ${max})`,
        pass: false,
      }
    }
  },
})
