import React from "react";

/**
 * Connection and room. Frame rate, snapshot rate, latency, tick and entity counts
 * are in the debug readout (utils/debugTools.ts), the one place for those numbers.
 */
interface GameStatsProps {
  mapId?: string;
  companionCount: number;
  roomId: string | null;
  isConnected: boolean;
}

export const GameStats: React.FC<GameStatsProps> = ({
  mapId,
  companionCount,
  roomId,
  isConnected,
}) => {
  const containerStyle: React.CSSProperties = {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "16px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    fontFamily: '"Fira Code", monospace',
    fontSize: "0.9rem",
  };

  const headerStyle: React.CSSProperties = {
    color: "#bdc3c7",
    textTransform: "uppercase",
    letterSpacing: "1px",
    fontSize: "0.8rem",
    marginBottom: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: "8px",
    display: "flex",
    justifyContent: "space-between",
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px 16px",
  };

  const itemStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
  };

  const labelStyle: React.CSSProperties = {
    color: "#7f8c8d",
  };

  const valueStyle: React.CSSProperties = {
    color: "#ecf0f1",
    fontWeight: 600,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>Connection</span>
        <span style={{ color: isConnected ? "#2ecc71" : "#e74c3c" }}>
          {isConnected ? "ONLINE" : "OFFLINE"}
        </span>
      </div>

      <div style={gridStyle}>
        <div style={itemStyle}>
          <span style={labelStyle}>Map</span>
          <span style={valueStyle}>{mapId || "-"}</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Companions</span>
          <span style={valueStyle}>{companionCount}</span>
        </div>
      </div>

      {roomId && (
        <div
          style={{
            marginTop: "12px",
            paddingTop: "8px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            fontSize: "0.8rem",
          }}
        >
          <span style={labelStyle}>Room: </span>
          <span style={{ color: "#9b59b6" }}>{roomId}</span>
        </div>
      )}
    </div>
  );
};
