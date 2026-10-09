import React, { useEffect, useState } from "react";
import { DEBUG_BINDINGS, buildControlsLegend } from "../config/controls";
import { terrainLegend } from "../config/terrain";
import { DebugToggles, ReadoutInput, formatReadout } from "../utils/debugTools";

const READOUT_INTERVAL_MS = 150;

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(10, 15, 25, 0.82)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: 6,
  padding: "6px 8px",
  font: '11px/1.45 "Fira Code", monospace',
  color: "#ecf0f1",
  pointerEvents: "none",
  zIndex: 50,
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
            { ...input, latency: readLatency() },
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
    <div style={{ ...panel, top: 114, left: 14, minWidth: 264 }}>
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: "flex",
            gap: 8,
            whiteSpace: "pre",
            ...(label === "speed" || label === "terrain"
              ? { fontSize: 14, fontWeight: 700, color: "#f1c40f" }
              : {}),
          }}
        >
          <span style={{ width: 56, color: "#95a5a6", fontWeight: 400 }}>
            {label}
          </span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
});

/** Terrain type -> colour -> speed multiplier, fastest first. */
export const TerrainLegend: React.FC = () => (
  <div style={{ ...panel, bottom: 10, right: 10 }}>
    <div style={{ color: "#95a5a6" }}>TERRAIN walk speed</div>
    {terrainLegend().map((t) => (
      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 12,
            height: 12,
            background: t.color,
            border: "1px solid rgba(0, 0, 0, 0.6)",
          }}
        />
        <span style={{ width: 48 }}>{t.label}</span>
        <span>{t.multiplierText}</span>
      </div>
    ))}
    <div style={{ color: "#95a5a6" }}>River: visual only</div>
  </div>
);

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
      maxWidth: 800,
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
