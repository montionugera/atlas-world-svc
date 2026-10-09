import React from "react";
import { render } from "@testing-library/react";
import { GameRenderer } from "./GameRenderer";
import { GameState, Mob } from "../types/game";
import { drawProjectiles } from "../renderers/projectileRenderer";

jest.mock("../renderers/projectileRenderer");
const drawnProjectiles: Array<Array<[string, number, number]>> = [];
/** Projectiles handed to the projectile renderer on the latest frame. */
const drawn = () => drawnProjectiles[drawnProjectiles.length - 1];

/** Canvas 2D context stand-in: every member is a callable that returns another one. */
function fakeContext(): CanvasRenderingContext2D {
  const handler: ProxyHandler<() => void> = {
    get: () => new Proxy(() => undefined, handler),
    set: () => true,
    apply: () => new Proxy(() => undefined, handler),
  };
  return new Proxy(
    () => undefined,
    handler,
  ) as unknown as CanvasRenderingContext2D;
}

/** Like fakeContext, but records every call as [method, ...args]. */
function recordingContext(calls: unknown[][]): CanvasRenderingContext2D {
  const handler: ProxyHandler<() => void> = {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        calls.push([String(name), ...args]);
        return new Proxy(() => undefined, handler);
      },
    set: () => true,
  };
  return new Proxy(
    () => undefined,
    handler,
  ) as unknown as CanvasRenderingContext2D;
}

function stateAt(tick: number): GameState {
  return {
    players: new Map(),
    mobs: new Map(),
    tick,
    mapId: "map-for-test-terrain",
    width: 1000,
    height: 1000,
    viewportSize: 500,
  };
}

describe("GameRenderer frame loop", () => {
  let raf: jest.SpyInstance;
  let cancel: jest.SpyInstance;

  beforeEach(() => {
    drawnProjectiles.length = 0;
    (drawProjectiles as jest.Mock).mockImplementation(
      (_ctx, projectiles: Map<string, { x: number; y: number }>) => {
        drawnProjectiles.push(
          Array.from(projectiles, ([id, p]) => [id, p.x, p.y]),
        );
      },
    );
    // jsdom has no canvas: the static world layers fall back to drawing directly.
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    raf = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it("does not repaint or restart the loop when a snapshot arrives", () => {
    const canvas = document.createElement("canvas");
    canvas.getContext = (() =>
      fakeContext()) as unknown as HTMLCanvasElement["getContext"];
    const canvasRef = { current: canvas };
    const trackFrame = jest.fn();
    const props = {
      canvasRef,
      updateCount: 0,
      fps: 60,
      updateRate: 20,
      roomId: "r",
      playerId: "1",
      trackFrame,
    };

    const { rerender } = render(
      <GameRenderer {...props} gameState={stateAt(1)} />,
    );
    expect(trackFrame).toHaveBeenCalledTimes(1);

    // Five snapshots (and the counters that change with them) between two frames.
    for (let tick = 2; tick <= 6; tick++) {
      rerender(
        <GameRenderer
          {...props}
          gameState={stateAt(tick)}
          updateCount={tick}
          fps={59 + (tick % 2)}
        />,
      );
    }
    expect(trackFrame).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    // The next animation frame draws the newest state.
    const frame = raf.mock.calls[raf.mock.calls.length - 1][0] as () => void;
    frame();
    expect(trackFrame).toHaveBeenCalledTimes(2);
  });

  const mount = (gameState: GameState, extra: object = {}) => {
    const calls: unknown[][] = [];
    const canvas = document.createElement("canvas");
    canvas.getContext = (() =>
      recordingContext(calls)) as unknown as HTMLCanvasElement["getContext"];
    render(
      <GameRenderer
        canvasRef={{ current: canvas }}
        gameState={gameState}
        updateCount={0}
        fps={60}
        updateRate={20}
        roomId="r"
        playerId="1"
        trackFrame={() => undefined}
        {...extra}
      />,
    );
    const frame = () => {
      calls.length = 0;
      (raf.mock.calls[raf.mock.calls.length - 1][0] as () => void)();
    };
    return { calls, frame };
  };

  it("shows every queued combat event once, however many snapshots carried them", () => {
    const state = stateAt(2);
    state.mobs.set("7", { id: "7", x: 100, y: 100, radius: 14 } as Mob);
    const hit = (amount: number) => ({
      kind: 1,
      sourceId: 1,
      targetId: 7,
      amount,
    });
    // Two snapshots landed since the last frame; the queue holds both hits.
    const queued = [[hit(12), hit(30)]];
    const { calls, frame } = mount(state, {
      drainEvents: () => queued.shift() ?? [],
    });
    const damageTexts = () =>
      calls
        .filter(([m, text]) => m === "fillText" && /^-\d+$/.test(String(text)))
        .map(([, text]) => text);
    expect(damageTexts()).toEqual(["-12", "-30"]);
    frame();
    expect(damageTexts()).toEqual(["-12", "-30"]);
  });

  it("draws a departed projectile up to its last position, then blasts there", () => {
    const now = jest.spyOn(performance, "now");
    const state = stateAt(2);
    state.projectiles = new Map([
      [
        "900",
        {
          id: "900",
          x: 110,
          y: 50,
          vx: 200,
          vy: 0,
          radius: 4,
          ownerId: "1",
          isStuck: false,
          samples: [
            { t: 1000, x: 100, y: 50 },
            { t: 1050, x: 110, y: 50 },
          ],
          endsAt: 1050,
        },
      ],
    ]);
    const blastsAtEnd = (calls: unknown[][]) =>
      calls.filter(([m, x, y]) => m === "arc" && x === 110 && y === 50).length;

    // No render clock: render time is performance.now().
    now.mockReturnValue(1025);
    const { calls, frame } = mount(state);
    expect(drawProjectiles).toHaveBeenCalledTimes(1);
    expect(drawn()).toEqual([["900", 105, 50]]);
    expect(blastsAtEnd(calls)).toBe(0);

    now.mockReturnValue(1050);
    frame();
    expect(drawn()).toEqual([]);
    expect(blastsAtEnd(calls)).toBe(1);
  });
});
