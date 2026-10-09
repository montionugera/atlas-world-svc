import React, { useEffect, useState } from "react";
import { DEBUG_BINDINGS, buildControlsLegend } from "../config/controls";
import { terrainLegend } from "../config/terrain";
import { DebugToggles, ReadoutInput, formatReadout } from "../utils/debugTools";
import { perfTimings } from "../utils/frameTiming";

const READOUT_INTERVAL_MS = 150;

/** A block of the debug dock (beside the canvas, never on it). */
const panel: React.CSSProperties = {
  background: "rgba(10, 15, 25, 0.82)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: 6,
  padding: "6px 8px",
  font: '11px/1.45 "Fira Code", monospace',
  color: "#ecf0f1",
  textAlign: "left",
};

type Latency = NonNullable<ReadoutInput["latency"]>;

/** Set by useServerRsClient on every snapshot. */
const readLatency = (): Latency | undefined =>
  (window as unknown as { __latencyMetrics?: Latency }).__latencyMetrics;

interface DebugReadoutProps {
  /** Latest inputs, refreshed by the canvas on every snapshot. */
  inputRef: React.RefObject<Omit<ReadoutInput, "latency"> | null>;
}

/** Live text readout; polls a ref ~7x/s so numbers stay readable and React stays idle. */
export const DebugReadout = React.memo(({ inputRef }: DebugReadoutProps) => {
  const [rows, setRows] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    const refresh = () => {
      const input = inputRef.current;
      if (input) {
        setRows(
          formatReadout(
            { ...input, latency: readLatency(), perf: perfTimings },
            performance.now(),
          ),
        );
      }
    };
    refresh();
    const timer = setInterval(refresh, READOUT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [inputRef]);

  return (
    <div style={panel}>
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: "flex",
            gap: 8,
            whiteSpace: "pre-wrap",
            ...(label === "speed" || label === "terrain"
              ? { fontWeight: 700, color: "#f1c40f" }
              : {}),
          }}
        >
          <span
            style={{
              flex: "0 0 56px",
              color: "#95a5a6",
              fontWeight: 400,
            }}
          >
            {label}
          </span>
          <span style={{ minWidth: 0 }}>{value}</span>
        </div>
      ))}
    </div>
  );
});

/** Terrain type -> colour -> speed multiplier, fastest first, as one thin strip. */
export const TerrainLegend: React.FC = () => (
  <div style={{ ...panel, display: "flex", flexWrap: "wrap", gap: "0 10px" }}>
    <span style={{ color: "#95a5a6" }}>terrain speed</span>
    {terrainLegend().map((t) => (
      <span
        key={t.id}
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            background: t.color,
            border: "1px solid rgba(0, 0, 0, 0.6)",
          }}
        />
        {t.label} {t.multiplierText}
      </span>
    ))}
    <span style={{ color: "#95a5a6" }}>river: visual only</span>
  </div>
);

/** Keys held right now, on one line; polls a ref so key presses never render React. */
export const HeldKeys: React.FC<{
  pressedKeysRef: React.RefObject<Set<string>>;
}> = ({ pressedKeysRef }) => {
  const [keys, setKeys] = useState("");
  useEffect(() => {
    const timer = setInterval(
      () => setKeys(Array.from(pressedKeysRef.current ?? []).join(" ")),
      100,
    );
    return () => clearInterval(timer);
  }, [pressedKeysRef]);
  return (
    <div style={{ ...panel, display: "flex", gap: 8 }}>
      <span style={{ flex: "0 0 56px", color: "#95a5a6" }}>keys</span>
      <span>{keys || "none"}</span>
    </div>
  );
};

const toolbarButton = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 4,
  border: `1px solid ${active ? "#2ecc71" : "rgba(255, 255, 255, 0.25)"}`,
  background: active ? "rgba(46, 204, 113, 0.18)" : "rgba(255, 255, 255, 0.06)",
  color: "#fff",
  font: '12px "Fira Code", monospace',
  cursor: "pointer",
});

interface DebugToolbarProps {
  toggles: DebugToggles;
  onToggle: (toggle: keyof DebugToggles) => void;
  onRespawn?: () => void;
}

/** Visible switches for the debug keys, plus reset-to-spawn. */
export const DebugToolbar: React.FC<DebugToolbarProps> = ({
  toggles,
  onToggle,
  onRespawn,
}) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {DEBUG_BINDINGS.map((d) => (
      <button
        key={d.toggle}
        type="button"
        aria-pressed={toggles[d.toggle]}
        onClick={() => onToggle(d.toggle)}
        style={toolbarButton(toggles[d.toggle])}
      >
        [{d.keyLabel}] {d.action}: {toggles[d.toggle] ? "ON" : "off"}
      </button>
    ))}
    {onRespawn && (
      <button
        type="button"
        onClick={onRespawn}
        style={toolbarButton(false)}
        title="Server revives you at the room's spawn point with full health"
      >
        Reset to spawn
      </button>
    )}
  </div>
);

const LEGEND = buildControlsLegend();

/** Always-visible key reference, generated from the skill / weapon / debug config. */
export const ControlsLegend: React.FC = () => (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      gap: "2px 12px",
      font: '11px/1.5 "Fira Code", monospace',
      color: "#bdc3c7",
      textAlign: "left",
    }}
  >
    {LEGEND.map((entry) => (
      <span key={`${entry.group}-${entry.action}`}>
        <b style={{ color: "#fff" }}>{entry.keys}</b> {entry.action}
      </span>
    ))}
  </div>
);
