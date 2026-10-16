import {
  JOBS,
  MOBS,
  CARDS,
  QUEST_BOARD,
  HANDBOOK,
  CASTLES,
  JOBS_BY_ID,
  MOBS_BY_ID,
  CARDS_BY_ID,
  validateMmorpgCatalogIntegrity,
} from "./mmorpgCatalogs";

describe("MMORPG Unified Catalogs & Cross-Domain Integrity", () => {
  test("jobs.json loads Novice -> 1st Job -> 2nd Job hierarchy cleanly", () => {
    expect(JOBS.length).toBeGreaterThanOrEqual(6);
    expect(JOBS_BY_ID["novice"]?.tier).toBe(0);
    expect(JOBS_BY_ID["swordman"]?.parentJobId).toBe("novice");
    expect(JOBS_BY_ID["knight"]?.parentJobId).toBe("swordman");
    expect(JOBS_BY_ID["wizard"]?.parentJobId).toBe("mage");
  });

  test("mobs.json loads E..A rank mobs with cards and drop tables", () => {
    expect(MOBS.length).toBeGreaterThanOrEqual(4);
    expect(MOBS_BY_ID["forest_slime"]?.rank).toBe("E");
    expect(MOBS_BY_ID["orc_warlord"]?.isMvp).toBe(true);
    expect(CARDS_BY_ID["card_orc_warlord"]?.mobId).toBe("orc_warlord");
  });

  test("quest_board.json covers main_story, job_change, side_story, and daily_bounty", () => {
    const categories = new Set(QUEST_BOARD.map((q) => q.category));
    expect(categories.has("main_story")).toBe(true);
    expect(categories.has("job_change")).toBe(true);
    expect(categories.has("side_story")).toBe(true);
    expect(categories.has("daily_bounty")).toBe(true);
  });

  test("handbook.json and castles.json load with valid entries", () => {
    expect(HANDBOOK.length).toBeGreaterThanOrEqual(3);
    expect(CASTLES.length).toBeGreaterThanOrEqual(1);
    expect(CASTLES[0].emperium.onlyNormalAttackDamage).toBe(true);
  });

  test("validateMmorpgCatalogIntegrity passes on committed catalogs", () => {
    expect(() => validateMmorpgCatalogIntegrity()).not.toThrow();
  });
});
