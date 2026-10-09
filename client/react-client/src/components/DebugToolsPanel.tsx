import React, { useCallback, useEffect, useRef, useState } from "react";
import bestiaryNames from "../data/bestiaryNames.json";
import {
  DebugCommand,
  DebugRoomState,
  DebugTarget,
  sendDebugCommand,
} from "../utils/debugApi";
import { panel, toolbarButton } from "./DebugPanels";

const STATE_POLL_MS = 1000;
const MOB_TYPES = Object.entries(bestiaryNames as Record<string, string>);

const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 4,
  marginTop: 4,
};
const rowLabel: React.CSSProperties = { flex: "0 0 40px", color: "#95a5a6" };
const field: React.CSSProperties = {
  width: 56,
  padding: "3px 4px",
  borderRadius: 4,
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(0, 0, 0, 0.35)",
  color: "#fff",
  font: '12px "Fira Code", monospace',
};

/** A typed number, or NaN while the field is empty or not a number. */
const typed = (text: string): number =>
  text.trim() === "" ? NaN : Number(text);

/**
 * Room controls over the server's dev-only debug HTTP API: bot and mob counts, spawn,
 * pause, invulnerability and teleport. Greyed out when the server has debug mode off.
 */
export const DebugToolsPanel: React.FC<DebugTarget> = ({
  baseUrl,
  map,
  player,
}) => {
  const [state, setState] = useState<DebugRoomState | null>(null);
  // The poll's trouble and the last command's are kept apart: the next good poll must
  // not erase why a command was refused.
  const [pollError, setPollError] = useState("");
  const [commandError, setCommandError] = useState("");
  const [off, setOff] = useState(false);
  const [botCount, setBotCount] = useState("50");
  const [mobCount, setMobCount] = useState("200");
  const [spawnType, setSpawnType] = useState("mob-veil-spearling");
  const [spawnCount, setSpawnCount] = useState("5");
  const [toX, setToX] = useState("");
  const [toY, setToY] = useState("");
  // The room being shown: an answer for another one (after a switch) is dropped.
  const roomRef = useRef("");
  roomRef.current = `${baseUrl}|${map}`;
  // Requests are numbered: state from one sent before the newest shown is stale.
  const sentRef = useRef(0);
  const shownRef = useRef(0);
  // The newest answered poll and command: an answer to one sent before it is stale,
  // and neither sets nor clears the message.
  const answeredRef = useRef({ poll: 0, command: 0 });

  const run = useCallback(
    async (command: DebugCommand) => {
      const room = `${baseUrl}|${map}`;
      const sent = ++sentRef.current;
      const result = await sendDebugCommand({
        target: { baseUrl, map, player },
        command,
      });
      if (roomRef.current !== room) return;
      const kind = command.cmd === "state" ? "poll" : "command";
      const setError = kind === "poll" ? setPollError : setCommandError;
      const newest = sent > answeredRef.current[kind];
      if (newest) answeredRef.current[kind] = sent;
      if (result.ok) {
        if (sent > shownRef.current) {
          shownRef.current = sent;
          setState(result.state);
        }
        if (newest) {
          setError("");
          setOff(false);
        }
        return;
      }
      if (newest) {
        setError(result.error);
        setOff(result.kind === "disabled");
      }
      // The tick loop answered late: it may still have applied the command.
      if (result.kind === "busy" && command.cmd !== "state") {
        await run({ cmd: "state" });
      }
    },
    [baseUrl, map, player],
  );

  useEffect(() => {
    setState(null);
    setPollError("");
    setCommandError("");
    setOff(false);
  }, [baseUrl, map]);

  // Live counts, one poll at a time: the next is sent a second after the last was
  // answered. A server without debug mode is asked once, not every second.
  useEffect(() => {
    if (off) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    const poll = async () => {
      await run({ cmd: "state" });
      if (live) timer = setTimeout(poll, STATE_POLL_MS);
    };
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [run, off]);

  /** `command` null = nothing valid to send yet; `active` lights a switch that is on. */
  const button = ({
    label,
    command,
    active = false,
  }: {
    label: string;
    command: DebugCommand | null;
    active?: boolean;
  }) => (
    <button
      type="button"
      disabled={off || !command}
      aria-pressed={active}
      onClick={() => command && run(command)}
      style={{
        ...toolbarButton(active),
        padding: "3px 7px",
        opacity: off || !command ? 0.45 : 1,
        cursor: off || !command ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
  const number = (
    label: string,
    value: string,
    onChange: (text: string) => void,
  ) => (
    <input
      type="number"
      aria-label={label}
      placeholder={label}
      value={value}
      disabled={off}
      onChange={(e) => onChange(e.target.value)}
      style={field}
    />
  );
  const finite = (n: number) => Number.isFinite(n);
  /** Counts are a `usize` on the server. */
  const count = (n: number) => Number.isInteger(n) && n >= 0;
  const bots = typed(botCount);
  const mobs = typed(mobCount);
  const spawn = typed(spawnCount);
  const x = typed(toX);
  const y = typed(toY);
  const invulnerable =
    !!state && !!player && state.invulnerable.includes(player);

  return (
    <div style={panel} aria-label="Debug tools">
      <div style={{ color: state ? "#f1c40f" : "#95a5a6", fontWeight: 700 }}>
        {state
          ? `players ${state.players}  bots ${state.bots}/${state.limits.max_bots}  ` +
            `mobs ${state.mobs}/${state.limits.max_mobs} (+${state.mobs_respawning} respawning)  ` +
            `proj ${state.projectiles}  ${state.width}x${state.height}`
          : "room tools"}
      </div>
      {pollError && (
        <div role="status" style={{ color: "#95a5a6" }}>
          {pollError}
        </div>
      )}
      {commandError && (
        <div style={{ ...row, color: "#ff6b6b" }}>
          <span role="alert">{commandError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setCommandError("")}
            style={{ ...toolbarButton(false), padding: "0 5px" }}
          >
            x
          </button>
        </div>
      )}
      <div style={row}>
        <span style={rowLabel}>bots</span>
        {button({ label: "-10", command: { cmd: "add_bots", delta: -10 } })}
        {button({ label: "-1", command: { cmd: "add_bots", delta: -1 } })}
        {button({ label: "+1", command: { cmd: "add_bots", delta: 1 } })}
        {button({ label: "+10", command: { cmd: "add_bots", delta: 10 } })}
        {number("bots", botCount, setBotCount)}
        {button({
          label: "Set",
          command: count(bots) ? { cmd: "set_bots", count: bots } : null,
        })}
        {button({
          label: state?.bots_paused ? "Paused" : "Pause",
          command: { cmd: "pause_bots", paused: !state?.bots_paused },
          active: !!state?.bots_paused,
        })}
      </div>
      <div style={row}>
        <span style={rowLabel}>mobs</span>
        {button({ label: "-50", command: { cmd: "add_mobs", delta: -50 } })}
        {button({ label: "-10", command: { cmd: "add_mobs", delta: -10 } })}
        {button({ label: "+10", command: { cmd: "add_mobs", delta: 10 } })}
        {button({ label: "+50", command: { cmd: "add_mobs", delta: 50 } })}
        {number("mobs", mobCount, setMobCount)}
        {button({
          label: "Set",
          command: count(mobs) ? { cmd: "set_mobs", count: mobs } : null,
        })}
        {button({ label: "Clear", command: { cmd: "clear_mobs" } })}
        {button({
          label: state?.mobs_paused ? "Paused" : "Pause",
          command: { cmd: "pause_mobs", paused: !state?.mobs_paused },
          active: !!state?.mobs_paused,
        })}
      </div>
      <div style={row}>
        <span style={rowLabel}>spawn</span>
        <select
          aria-label="mob type"
          value={spawnType}
          disabled={off}
          onChange={(e) => setSpawnType(e.target.value)}
          style={{ ...field, width: 150 }}
        >
          {MOB_TYPES.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {number("count", spawnCount, setSpawnCount)}
        {button({
          label: "Spawn at me",
          command: count(spawn)
            ? { cmd: "spawn_mobs", mob_type: spawnType, count: spawn }
            : null,
        })}
      </div>
      <div style={row}>
        <span style={rowLabel}>me</span>
        {button({
          label: `Invulnerable: ${invulnerable ? "ON" : "off"}`,
          command: { cmd: "set_invulnerable", enabled: !invulnerable },
          active: invulnerable,
        })}
        {number("x", toX, setToX)}
        {number("y", toY, setToY)}
        {button({
          label: "Teleport",
          command: finite(x) && finite(y) ? { cmd: "teleport", x, y } : null,
        })}
        {button({
          label: "To spawn",
          command: state ? { cmd: "teleport", ...state.player_spawn } : null,
        })}
      </div>
    </div>
  );
};
