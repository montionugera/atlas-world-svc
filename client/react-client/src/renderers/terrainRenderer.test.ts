import {
  drawTerrain,
  drawFloatingTexts,
  MILLCROSS_BUILDINGS,
  FloatingText,
} from "./terrainRenderer";

describe("terrainRenderer", () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      closePath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      ellipse: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      fillText: jest.fn(),
      strokeText: jest.fn(),
      roundRect: jest.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      font: "",
      textAlign: "",
      textBaseline: "",
    };
  });

  it("exports authored Millcross town buildings with valid dimensions", () => {
    expect(MILLCROSS_BUILDINGS.length).toBeGreaterThanOrEqual(5);
    const mill = MILLCROSS_BUILDINGS.find((b) => b.id === "mill-house");
    expect(mill).toBeDefined();
    expect(mill?.width).toBeGreaterThan(0);
    expect(mill?.height).toBeGreaterThan(0);
  });

  it("draws base terrain, biomes, courtyard, roads, river, and ambient labels", () => {
    drawTerrain(mockCtx, 1000, 1000, 1, 1, 1000);

    // Verify base meadow rect
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1000, 1000);

    // Verify biomes were drawn (Northern Icefield, Thornveil Bramble, East Dunes, Mud Pit, Central Courtyard)
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1000, 250); // Northern Icefield
    expect(mockCtx.fillRect).toHaveBeenCalledWith(680, 240, 320, 520); // Thornveil
    expect(mockCtx.fillRect).toHaveBeenCalledWith(540, 390, 150, 220); // East Dunes
    expect(mockCtx.fillRect).toHaveBeenCalledWith(390, 590, 230, 170); // South Mud Pit
    expect(mockCtx.fillRect).toHaveBeenCalledWith(390, 390, 220, 220); // Central Courtyard

    // Verify ambient labels were drawn
    expect(mockCtx.fillText).toHaveBeenCalledWith(
      "NORTHERN ICEFIELD",
      500,
      120,
    );
    expect(mockCtx.fillText).toHaveBeenCalledWith(
      "THORNVEIL BRAMBLE",
      840,
      480,
    );
    expect(mockCtx.fillText).toHaveBeenCalledWith(
      "TOWN OF MILLCROSS",
      160,
      105,
    );
  });

  it("draws floating combat text numbers with vertical drift", () => {
    const now = 2000;
    const texts: FloatingText[] = [
      {
        id: "hit-1",
        text: "-45",
        x: 100,
        y: 200,
        createdAt: 1500,
        durationMs: 1000, // 50% elapsed
        color: "#ff4d4f",
      },
    ];

    drawFloatingTexts(mockCtx, texts, 1, 1, now);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
    expect(mockCtx.strokeText).toHaveBeenCalledWith(
      "-45",
      100,
      expect.any(Number),
    );
    expect(mockCtx.fillText).toHaveBeenCalledWith(
      "-45",
      100,
      expect.any(Number),
    );

    // At 50% elapsed, y should have floated up by progress * 25 (~12.5 units)
    const calledY = mockCtx.fillText.mock.calls[0][2];
    expect(calledY).toBeLessThan(200);
  });

  it("skips expired floating texts", () => {
    const now = 3000;
    const texts: FloatingText[] = [
      {
        id: "hit-old",
        text: "-20",
        x: 100,
        y: 200,
        createdAt: 1000,
        durationMs: 800, // expired 1200ms ago
        color: "#ff4d4f",
      },
    ];

    drawFloatingTexts(mockCtx, texts, 1, 1, now);
    expect(mockCtx.fillText).not.toHaveBeenCalled();
  });
});
