import React from "react";
import { render } from "@testing-library/react";
import { GameRenderer } from "./GameRenderer";
import { GameState } from "../types/game";

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
});
