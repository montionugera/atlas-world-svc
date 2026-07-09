// TODO(integration): replace with { derivedStats } from '@atlas/contracts' after Lane C merges
export function derivedStats({
  level,
  allocated,
  weaponItemId,
}: {
  level: number
  allocated: { str: number; agi: number; int: number; vit: number }
  weaponItemId?: string
}) {
  const w = { pAtk: 0, mAtk: 0 } // weapon terms 0 until catalog lookup exists
  return {
    maxHealth: 100 + 10 * allocated.vit + 5 * (level - 1),
    pAtk: 10 + 2 * allocated.str + w.pAtk,
    mAtk: 10 + 2 * allocated.int + w.mAtk,
    pDef: 5 + allocated.vit,
    mDef: 5 + allocated.int,
    maxMoveSpeed: 20 + 0.2 * allocated.agi,
  }
}
