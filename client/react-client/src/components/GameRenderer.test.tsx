import React from "react";
import { render } from "@testing-library/react";
import { GameRenderer } from "./GameRenderer";
import { GameState, Mob } from "../types/game";
import { drawProjectiles } from "../renderers/projectileRenderer";
import { drawMobs } from "../renderers/mobRenderer";
import { drawPlayers } from "../renderers/playerRenderer";
import { DEFAULT_DEBUG_TOGGLES } from "../utils/debugTools";
import { createPrediction } from "../utils/localPrediction";

jest.mock("../renderers/projectileRenderer");
jest.mock("../renderers/mobRenderer");
jest.mock("../renderers/playerRenderer");
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

  it("draws the newest snapshot from the state ref without a React render", () => {
    const projectile = (x: number) =>
      new Map([
        [
          "900",
          {
            id: "900",
            x,
            y: 50,
            vx: 0,
            vy: 0,
            radius: 4,
            ownerId: "1",
            isStuck: false,
          },
        ],
      ]);
    // React state is published a few times a second; the ref has every snapshot.
    const published = { ...stateAt(1), projectiles: projectile(10) };
    const gameStateRef = { current: published as GameState | null };
    const { frame } = mount(published, { gameStateRef });
    expect(drawn()).toEqual([["900", 10, 50]]);

    gameStateRef.current = { ...stateAt(2), projectiles: projectile(20) };
    frame();
    expect(drawn()).toEqual([["900", 20, 50]]);
  });

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

  it("shows an in-place mutated entity's current hp, alive flag and heading (legacy state)", () => {
    const mob = { id: "7", x: 10, y: 10, radius: 14, hp: 100, isAlive: true };
    const state = stateAt(1);
    state.mobs.set("7", mob as unknown as Mob);
    const seen: Array<[number, boolean]> = [];
    (drawMobs as jest.Mock).mockImplementation(
      (_ctx, mobs: Map<string, { hp: number; isAlive: boolean }>) => {
        const m = mobs.get("7")!;
        seen.push([m.hp, m.isAlive]);
      },
    );
    const { frame } = mount(state);
    // Colyseus mutates the same object; no new identity reaches the renderer.
    mob.hp = 40;
    mob.isAlive = false;
    frame();
    expect(seen).toEqual([
      [100, true],
      [40, false],
    ]);
  });

  it("drops old-room projectiles without blasting them after a room switch", () => {
    const proj = new Map([
      [
        "900",
        {
          id: "900",
          x: 110,
          y: 50,
          vx: 0,
          vy: 0,
          radius: 4,
          ownerId: "1",
          isStuck: false,
        },
      ],
    ]);
    const first = { ...stateAt(1), mapId: "room-a", projectiles: proj };
    const gameStateRef = { current: first as GameState | null };
    const { calls, frame } = mount(first, { gameStateRef });
    gameStateRef.current = { ...stateAt(2), mapId: "room-b" };
    frame();
    expect(
      calls.filter(([m, x, y]) => m === "arc" && x === 110 && y === 50),
    ).toHaveLength(0);
  });

  it("draws the local cast the same frame it starts, with no snapshot in between", () => {
    const state = stateAt(1);
    state.players.set("1", { id: "1", x: 10, y: 10, radius: 10 } as never);
    const castingUntil: Array<number | undefined> = [];
    (drawPlayers as jest.Mock).mockImplementation(
      (_ctx, players: Map<string, { castingUntil?: number }>) => {
        castingUntil.push(players.get("1")!.castingUntil);
      },
    );
    const localCastRef = {
      current: null as { until: number; duration: number } | null,
    };
    const gameStateRef = { current: state as GameState | null };
    const { frame } = mount(state, { gameStateRef, localCastRef });
    localCastRef.current = { until: 5000, duration: 1500 };
    frame();
    localCastRef.current = null;
    frame();
    expect(castingUntil).toEqual([0, 5000, 0]);
  });

  describe("cached static layer", () => {
    const layerContexts = () =>
      (HTMLCanvasElement.prototype.getContext as unknown as jest.Mock).mock
        .calls.length;

    it("builds the layers once, blits them each frame, rebuilds on a room change", () => {
      jest
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockImplementation((() =>
          recordingContext([])) as unknown as HTMLCanvasElement["getContext"]);
      const a = { ...stateAt(1), mapId: "layer-room-a", width: 640 };
      const gameStateRef = { current: a as GameState | null };
      const { calls, frame } = mount(a, { gameStateRef });
      const blits = () => calls.filter(([m]) => m === "drawImage").length;
      expect(layerContexts()).toBe(2); // ground + over
      expect(blits()).toBe(2);

      frame();
      frame();
      expect(layerContexts()).toBe(2);
      expect(blits()).toBe(2);

      gameStateRef.current = { ...a, mapId: "layer-room-b", tick: 2 };
      frame();
      expect(layerContexts()).toBe(4);
      expect(blits()).toBe(2);
    });

    it("keeps the camera on whole device pixels while the player walks", () => {
      jest
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockImplementation((() =>
          recordingContext([])) as unknown as HTMLCanvasElement["getContext"]);
      const state = { ...stateAt(1), mapId: "layer-room-c", width: 641 };
      state.players.set("1", {
        id: "1",
        x: 100.37,
        y: 200.61,
        radius: 10,
      } as unknown as GameState["players"] extends Map<string, infer P>
        ? P
        : never);
      const { calls } = mount(state);
      // Fold the transform calls that precede the first terrain blit.
      let ox = 0;
      let oy = 0;
      let s = 1;
      for (const [m, a, b] of calls) {
        if (m === "drawImage") break;
        if (m === "translate") {
          ox += (a as number) * s;
          oy += (b as number) * s;
        } else if (m === "scale") s *= a as number;
      }
      expect(Number.isInteger(ox)).toBe(true);
      expect(Number.isInteger(oy)).toBe(true);
    });
  });

  describe("local prediction", () => {
    type P = GameState["players"] extends Map<string, infer T> ? T : never;
    const player = (id: string, x: number) =>
      ({ id, x, y: 100, vx: 0, vy: 0, radius: 10, isAlive: true }) as P;
    const setup = (on: boolean) => {
      const state = stateAt(1);
      state.players.set("1", player("1", 100));
      state.players.set("2", player("2", 300));
      const prediction = createPrediction();
      const { calls, frame } = mount(state, {
        gameStateRef: { current: state },
        prediction,
        debug: { ...DEFAULT_DEBUG_TOGGLES, prediction: on },
      });
      // Mid-correction: drawn 40 units from where the server has the player.
      prediction.ready = true;
      prediction.x = 140;
      prediction.at = performance.now();
      frame();
      const players = (drawPlayers as jest.Mock).mock.calls.pop()![1] as Map<
        string,
        P
      >;
      const camera = calls.find(([m]) => m === "translate") as number[];
      return { prediction, players, cameraX: camera[1] };
    };

    it("draws the local player and the camera at the predicted position", () => {
      const { prediction, players, cameraX } = setup(true);
      expect(prediction.x).toBeGreaterThan(130);
      expect(prediction.x).toBeLessThanOrEqual(140);
      expect(players.get("1")!.x).toBe(prediction.x);
      expect(players.get("2")!.x).toBe(300);
      // Further right than a camera on the server position (100) would be.
      expect(cameraX).toBeLessThan(setup(false).cameraX);
    });

    it("draws the interpolated position when the toggle is off", () => {
      const { prediction, players } = setup(false);
      expect(players.get("1")!.x).toBe(100);
      expect(prediction.enabled).toBe(false);
      expect(prediction.ready).toBe(false);
    });
  });
});
