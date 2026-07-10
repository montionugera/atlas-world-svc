import type { ProfileDoc } from '@atlas/contracts';

/** XP required to go from `level` to `level + 1`. Pinned curve: 100 * level. */
export function xpToNext(level: number): number {
  return 100 * level;
}

/**
 * PURE: applies `amount` XP to a profile, looping through as many level-ups
 * as the XP total covers. Each level-up grants +3 statPoints. Never mutates
 * the input.
 */
export function applyXp(profile: ProfileDoc, amount: number): ProfileDoc {
  let level = profile.level;
  let xp = profile.xp + amount;
  let statPoints = profile.statPoints;

  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    statPoints += 3;
  }

  return { ...profile, level, xp, statPoints };
}
