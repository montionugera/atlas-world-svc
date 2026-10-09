import { getAoeReticle, MAX_CAST_RANGE } from "./aoeReticle";

const caster = { x: 100, y: 100 };

describe("getAoeReticle", () => {
  it.each([
    ["skill_1", 60],
    ["skill_3", 50],
    ["skill_4", 40],
  ])("returns the AoE radius for %s", (id, radius) => {
    expect(getAoeReticle(id, { x: 150, y: 100 }, caster)).toEqual({
      x: 150,
      y: 100,
      radius,
    });
  });

  it("returns null for non-AoE skills and unknown ids", () => {
    expect(getAoeReticle("skill_2", { x: 150, y: 100 }, caster)).toBeNull();
    expect(getAoeReticle("skill_dash", { x: 150, y: 100 }, caster)).toBeNull();
    expect(getAoeReticle("nope", { x: 150, y: 100 }, caster)).toBeNull();
  });

  it("clamps the aim point to the server max cast range", () => {
    const r = getAoeReticle("skill_1", { x: 1100, y: 100 }, caster);
    expect(r?.x).toBeCloseTo(100 + MAX_CAST_RANGE);
    expect(r?.y).toBeCloseTo(100);
  });

  it("returns null for a non-finite aim point", () => {
    expect(getAoeReticle("skill_1", { x: NaN, y: 0 }, caster)).toBeNull();
  });
});
