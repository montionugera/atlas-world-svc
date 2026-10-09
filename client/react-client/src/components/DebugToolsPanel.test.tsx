import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DebugToolsPanel } from "./DebugToolsPanel";

const state = {
  tick: 1,
  width: 4000,
  height: 4000,
  player_spawn: { x: 2000, y: 2000 },
  players: 1,
  bots: 0,
  mobs: 3,
  mobs_respawning: 0,
  projectiles: 0,
  mobs_paused: false,
  bots_paused: false,
  invulnerable: [],
  limits: { max_bots: 100, max_mobs: 500 },
};

type Answer = { status: number; body: object };
const ok: Answer = { status: 200, body: { ok: true, state } };

describe("DebugToolsPanel", () => {
  const realFetch = global.fetch;
  let poll: Answer;
  let command: Answer;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    poll = ok;
    command = ok;
    fetchMock = jest.fn((_url: string, init: RequestInit) => {
      const { status, body } = init.method === "GET" ? poll : command;
      return Promise.resolve({
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  const settle = () =>
    act(async () => {
      await Promise.resolve();
    });
  const wait = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });
  const click = async (name: string) => {
    fireEvent.click(screen.getByRole("button", { name }));
    await settle();
  };
  const polls = () =>
    fetchMock.mock.calls.filter(([, init]) => init.method === "GET").length;
  const mount = async () => {
    render(
      <DebugToolsPanel baseUrl="http://h:1" map="large-test" player="p1" />,
    );
    await settle();
  };

  it("keeps a rejected command's reason on screen across later polls", async () => {
    await mount();
    command = {
      status: 400,
      body: { ok: false, error: "player p1 is not in this room" },
    };
    await click("Clear");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "player p1 is not in this room",
    );

    const before = polls();
    await wait(3000);
    expect(polls()).toBeGreaterThan(before);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "player p1 is not in this room",
    );

    // The next command replaces it: here it succeeds, so nothing is left.
    command = ok;
    await click("Clear");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("can be dismissed by hand", async () => {
    await mount();
    command = { status: 400, body: { ok: false, error: "bad count" } };
    await click("Clear");
    await click("Dismiss");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a network failure of a command across later polls", async () => {
    await mount();
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    await click("Clear");
    await wait(3000);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "cannot reach the game server",
    );
  });

  it("re-reads state at once after a 503, and keeps the message", async () => {
    await mount();
    command = { status: 503, body: { ok: false, error: "tick loop is busy" } };
    poll = { status: 200, body: { ok: true, state: { ...state, mobs: 0 } } };
    const before = polls();
    await click("Clear");
    // No timer has run: the re-read is the command's own, not the 1 s poll.
    expect(polls()).toBe(before + 1);
    expect(screen.getByText(/mobs 0\/500/)).toBeInTheDocument();
    await wait(3000);
    expect(screen.getByRole("alert")).toHaveTextContent("tick loop is busy");
  });

  it("shows a failing poll separately and clears it when polls recover", async () => {
    await mount();
    command = { status: 400, body: { ok: false, error: "bad count" } };
    await click("Clear");
    poll = { status: 503, body: { ok: false, error: "tick loop is busy" } };
    await wait(1000);
    expect(screen.getByRole("status")).toHaveTextContent("tick loop is busy");
    expect(screen.getByRole("alert")).toHaveTextContent("bad count");
    poll = ok;
    await wait(1000);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("bad count");
  });

  it("does not let a poll sent before a command overwrite the command's state", async () => {
    await mount();
    // The next poll hangs until released.
    let release: (answer: object) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    await wait(1000);
    command = {
      status: 200,
      body: { ok: true, state: { ...state, mobs: 0 } },
    };
    await click("Clear");
    expect(screen.getByText(/mobs 0\/500/)).toBeInTheDocument();
    release({ status: 200, ok: true, json: () => Promise.resolve(ok.body) });
    await settle();
    expect(screen.getByText(/mobs 0\/500/)).toBeInTheDocument();
  });

  it("does not let a command answered late erase why a newer one was refused", async () => {
    await mount();
    // The first command hangs until released; the second is refused at once.
    let release: (answer: object) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    await click("Clear");
    command = { status: 400, body: { ok: false, error: "bad count" } };
    await click("Clear");
    expect(screen.getByRole("alert")).toHaveTextContent("bad count");
    release({ status: 200, ok: true, json: () => Promise.resolve(ok.body) });
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("bad count");
  });

  it("waits for a poll's answer before sending the next one", async () => {
    await mount();
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await wait(1000);
    const before = polls();
    await wait(5000);
    expect(polls()).toBe(before);
  });

  it.each(["-5", "2.5", ""])(
    "offers no Set for a count of '%s'",
    async (text) => {
      await mount();
      fireEvent.change(screen.getByLabelText("bots"), {
        target: { value: text },
      });
      expect(screen.getAllByRole("button", { name: "Set" })[0]).toBeDisabled();
      fireEvent.change(screen.getByLabelText("bots"), {
        target: { value: "7" },
      });
      expect(screen.getAllByRole("button", { name: "Set" })[0]).toBeEnabled();
    },
  );
});
