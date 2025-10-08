// Test setup file
import 'jest';

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Only suppress console.error, keep console.log for debugging
  console.error = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinBounds(): R;
    }
  }
}

// Custom matcher for position bounds checking
expect.extend({
  toBeWithinBounds(received: { x: number; y: number }, expected: { min: number; max: number }) {
    const { x, y } = received;
    const { min, max } = expected;
    
    const pass = x >= min && x <= max && y >= min && y <= max;
    
    if (pass) {
      return {
        message: () => `expected position (${x}, ${y}) not to be within bounds (${min}, ${max})`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected position (${x}, ${y}) to be within bounds (${min}, ${max})`,
        pass: false,
      };
    }
  },
});
