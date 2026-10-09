import {
  VELOCITY_VECTOR_SECONDS,
  drawStaticBlocks,
  drawTerrainZones,
  drawWorldDebug,
} from "./debugRenderer";
import { TERRAIN_TYPES } from "../config/terrain";

const makeCtx = () => {
  const ctx = {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    strokeText: jest.fn(),
    setLineDash: jest.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
  };
  return ctx;
};
const asCtx = (c: ReturnType<typeof makeCtx>) =>
  c as unknown as CanvasRenderingContext2D;

const player = (over = {}) => ({
  id: "1",
  x: 100,
  y: 200,
  vx: 0,
  vy: 0,
  radius: 12,
  attackRange: 40,
  isAlive: true,
  ...over,
});

describe("drawWorldDebug", () => {
  it("rings the local player's hit radius and melee range in world units", () => {
    const ctx = makeCtx();
    drawWorldDebug(asCtx(ctx), {
      players: new Map([["1", player()]]),
      mobs: new Map(),
      playerId: "1",
      viewScale: 1.5,
      localSpeed: 0,
    });
    expect(ctx.arc).toHaveBeenCalledWith(100, 200, 12, 0, Math.PI * 2);
    expect(ctx.arc).toHaveBeenCalledWith(100, 200, 40, 0, Math.PI * 2);
  });

  it("does not ring other players' melee range", () => {
    const ctx = makeCtx();
    drawWorldDebug(asCtx(ctx), {
      players: new Map([["2", player({ id: "2" })]]),
      mobs: new Map(),
      playerId: "1",
      viewScale: 1,
      localSpeed: 0,
    });
    expect(ctx.arc).not.toHaveBeenCalledWith(100, 200, 40, 0, Math.PI * 2);
  });

  it("draws a to-scale velocity vector only for moving entities", () => {
    const ctx = makeCtx();
    drawWorldDebug(asCtx(ctx), {
      players: new Map([["1", player({ vx: 200, vy: -100 })]]),
      mobs: new Map([
        ["9", { id: "9", x: 5, y: 5, vx: 0, vy: 0, radius: 14, isAlive: true }],
      ]),
      playerId: "1",
      viewScale: 1,
      localSpeed: 0,
    });
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(100, 200);
    expect(ctx.lineTo).toHaveBeenCalledWith(
      100 + 200 * VELOCITY_VECTOR_SECONDS,
      200 - 100 * VELOCITY_VECTOR_SECONDS,
    );
  });

  it("rings live mobs (and their attack range when known), skips dead ones", () => {
    const ctx = makeCtx();
    drawWorldDebug(asCtx(ctx), {
      players: new Map(),
      mobs: new Map([
        [
          "9",
          {
            id: "9",
            x: 5,
            y: 6,
            vx: 0,
            vy: 0,
            radius: 14,
            isAlive: true,
            attackRange: 30,
          },
        ],
        [
          "8",
          { id: "8", x: 50, y: 60, vx: 9, vy: 9, radius: 14, isAlive: false },
        ],
      ]),
      playerId: "1",
      viewScale: 1,
      localSpeed: 0,
    });
    expect(ctx.arc).toHaveBeenCalledWith(5, 6, 14, 0, Math.PI * 2);
    expect(ctx.arc).toHaveBeenCalledWith(5, 6, 30, 0, Math.PI * 2);
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });

  it("labels the local player with the smoothed speed", () => {
    const ctx = makeCtx();
    drawWorldDebug(asCtx(ctx), {
      players: new Map([["1", player()]]),
      mobs: new Map(),
      playerId: "1",
      viewScale: 2,
      localSpeed: 139.6,
    });
    expect(ctx.fillText).toHaveBeenCalledWith(
      "140 u/s",
      100,
      expect.any(Number),
    );
  });
});

describe("drawTerrainZones", () => {
  const view = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("fills each zone with its terrain colour and labels it with the multiplier", () => {
    const ctx = makeCtx();
    const fills: string[] = [];
    ctx.fillRect.mockImplementation(() => fills.push(ctx.fillStyle));
    drawTerrainZones(
      asCtx(ctx),
      [
        { terrain: "mud", x: 10, y: 20, width: 30, height: 40 },
        { terrain: "ice", x: 0, y: 0, width: 5, height: 5 },
      ],
      1,
      { fillAlpha: 0.3, labelView: view },
    );
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 30, 40);
    expect(fills).toEqual([TERRAIN_TYPES.mud.color, TERRAIN_TYPES.ice.color]);
    expect(ctx.fillText).toHaveBeenCalledWith("MUD x0.50", 25, 24);
  });

  it("pins the label to the visible part of a zone larger than the view", () => {
    const ctx = makeCtx();
    drawTerrainZones(
      asCtx(ctx),
      [{ terrain: "ice", x: -500, y: -500, width: 2000, height: 2000 }],
      2,
      { fillAlpha: 0.3, labelView: view },
    );
    expect(ctx.fillText).toHaveBeenCalledWith("ICE x0.60", 50, 2);
  });

  it("does not label zones that are off screen, or any zone without a view", () => {
    const ctx = makeCtx();
    const zones = [
      { terrain: "mud" as const, x: 500, y: 500, width: 30, height: 40 },
    ];
    drawTerrainZones(asCtx(ctx), zones, 1, { fillAlpha: 1, labelView: view });
    drawTerrainZones(asCtx(ctx), zones, 1, { fillAlpha: 1 });
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});

describe("drawStaticBlocks", () => {
  it("draws each block at its world rect", () => {
    const ctx = makeCtx();
    drawStaticBlocks(
      asCtx(ctx),
      [{ x: 300, y: 760, width: 40, height: 40 }],
      1.5,
    );
    expect(ctx.fillRect).toHaveBeenCalledWith(300, 760, 40, 40);
    expect(ctx.strokeRect).toHaveBeenCalledWith(300, 760, 40, 40);
  });
});
