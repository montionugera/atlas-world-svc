import { clamp, applyFriction, stepPlayer, processInput } from './movement';

describe('movement logic', () => {
  test('clamp works', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test('applyFriction stops tiny velocities', () => {
    expect(applyFriction(0.05, 0.95)).toBe(0);
    expect(applyFriction(1, 0.95)).toBeCloseTo(0.95, 2);
  });

  test('stepPlayer updates position and applies friction', () => {
    const res = stepPlayer({ x: 0, y: 0 }, { x: 10, y: 0 }, 1 / 30, { min: -500, max: 500 });
    expect(res.pos.x).toBeCloseTo(10 / 30, 5);
    expect(res.vel.x).toBeLessThan(10);
  });

  test('processInput clamps velocity', () => {
    expect(processInput({ move: { x: 100, y: -100 } }, 10)).toEqual({ x: 10, y: -10 });
  });
});


