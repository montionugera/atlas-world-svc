import { getAoeReticle, MAX_CAST_RANGE } from "./aoeReticle";

const caster = { x: 10, y: 10 };

describe("getAoeReticle", () => {
  it.each([
    ["skill_1", 6],
    ["skill_3", 5],
    ["skill_4", 4],
  ])("returns the AoE radius for %s", (id, radius) => {
    expect(getAoeReticle(id, { x: 15, y: 10 }, caster)).toEqual({
      x: 15,
      y: 10,
      radius,
    });
  });

  it("returns null for non-AoE skills and unknown ids", () => {
    expect(getAoeReticle("skill_2", { x: 15, y: 10 }, caster)).toBeNull();
    expect(getAoeReticle("skill_dash", { x: 15, y: 10 }, caster)).toBeNull();
    expect(getAoeReticle("nope", { x: 15, y: 10 }, caster)).toBeNull();
  });

  it("clamps the aim point to the server max cast range", () => {
    const r = getAoeReticle("skill_1", { x: 110, y: 10 }, caster);
    expect(r?.x).toBeCloseTo(10 + MAX_CAST_RANGE);
    expect(r?.y).toBeCloseTo(10);
  });

  it("returns null for a non-finite aim point", () => {
    expect(getAoeReticle("skill_1", { x: NaN, y: 0 }, caster)).toBeNull();
  });
});
