import { DEFAULT_PROFILE } from '@atlas/contracts';
import { applyXp, xpToNext } from './leveling';

describe('xpToNext', () => {
  it('is 100 * level', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(200);
    expect(xpToNext(5)).toBe(500);
  });
});

describe('applyXp', () => {
  it('single level-up leaves remainder xp and +3 statPoints', () => {
    const result = applyXp(DEFAULT_PROFILE, 250);
    expect(result).toEqual({
      schemaVersion: 1,
      level: 2,
      xp: 150,
      statPoints: 3,
      allocated: DEFAULT_PROFILE.allocated,
    });
  });

  it('does not level up when xp is short of the threshold', () => {
    const result = applyXp(DEFAULT_PROFILE, 99);
    expect(result.level).toBe(1);
    expect(result.xp).toBe(99);
    expect(result.statPoints).toBe(0);
  });

  it('cascades through multiple level-ups in one call', () => {
    // level1 needs 100, level2 needs 200 -> 100+200 = 300 clears two levels
    const result = applyXp(DEFAULT_PROFILE, 300);
    expect(result.level).toBe(3);
    expect(result.xp).toBe(0);
    expect(result.statPoints).toBe(6);
  });

  it('does not mutate the input profile', () => {
    const before = { ...DEFAULT_PROFILE, allocated: { ...DEFAULT_PROFILE.allocated } };
    applyXp(DEFAULT_PROFILE, 250);
    expect(DEFAULT_PROFILE).toEqual(before);
  });
});
