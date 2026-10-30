import React from "react";
import { DungeonFloorProgress, BossEncounterHUD } from "../types/game";

interface DungeonHUDProps {
  dungeonProgress?: DungeonFloorProgress;
  bossEncounter?: BossEncounterHUD;
  onAdvanceFloor?: () => void;
}

export const DungeonHUD: React.FC<DungeonHUDProps> = ({
  dungeonProgress,
  bossEncounter,
  onAdvanceFloor,
}) => {
  if (!dungeonProgress && !bossEncounter) {
    return null;
  }

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(Math.max(0, totalSeconds) / 60);
    const secs = Math.floor(Math.max(0, totalSeconds) % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      data-testid="dungeon-hud"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
        pointerEvents: "none",
        width: "min(460px, 92%)",
        userSelect: "none",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* 1. Spire & Floor Navigation Card */}
      {dungeonProgress && (
        <div
          data-testid="dungeon-floor-card"
          style={{
            width: "100%",
            backgroundColor: "rgba(15, 23, 42, 0.88)",
            backdropFilter: "blur(8px)",
            borderRadius: "10px",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            boxShadow:
              "0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
            padding: "10px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "#f59e0b",
                fontWeight: 800,
                fontSize: "0.95rem",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              🏰 {dungeonProgress.dungeonName || "Spire Dungeon"}
            </span>
            <span
              data-testid="floor-indicator"
              style={{
                backgroundColor: dungeonProgress.bossFloor
                  ? "rgba(220, 38, 38, 0.3)"
                  : "rgba(245, 158, 11, 0.2)",
                color: dungeonProgress.bossFloor ? "#f87171" : "#fef3c7",
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 700,
                border: dungeonProgress.bossFloor
                  ? "1px solid rgba(220, 38, 38, 0.5)"
                  : "1px solid rgba(245, 158, 11, 0.3)",
              }}
            >
              {dungeonProgress.bossFloor
                ? "👑 BOSS FLOOR"
                : `FLOOR ${dungeonProgress.currentFloor} / ${dungeonProgress.totalFloors}`}
            </span>
          </div>

          {/* Mob Clearance Progress */}
          {!dungeonProgress.bossFloor && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.78rem",
                  color: "#94a3b8",
                }}
              >
                <span>Floor Clearance</span>
                <span
                  data-testid="mob-clear-count"
                  style={{ color: "#e2e8f0", fontWeight: 600 }}
                >
                  {dungeonProgress.mobsKilled} / {dungeonProgress.mobsRequired}{" "}
                  Mobs
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "6px",
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(
                      100,
                      (dungeonProgress.mobsKilled /
                        Math.max(1, dungeonProgress.mobsRequired)) *
                        100,
                    )}%`,
                    backgroundColor: dungeonProgress.gateUnlocked
                      ? "#10b981"
                      : "#f59e0b",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Gate Status Banner / Action */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "2px",
            }}
          >
            <div
              data-testid="gate-status"
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: dungeonProgress.gateUnlocked ? "#34d399" : "#94a3b8",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {dungeonProgress.gateUnlocked ? (
                <>✨ Floor Gate Unlocked!</>
              ) : (
                <>🔒 Gate Locked (Defeat all enemies)</>
              )}
            </div>

            {dungeonProgress.gateUnlocked &&
              !dungeonProgress.bossFloor &&
              onAdvanceFloor && (
                <button
                  type="button"
                  data-testid="advance-floor-btn"
                  onClick={onAdvanceFloor}
                  style={{
                    backgroundColor: "#059669",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    padding: "4px 10px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(5, 150, 105, 0.4)",
                    transition: "transform 0.1s ease",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.transform = "scale(1.05)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.transform = "scale(1)")
                  }
                >
                  Ascend [G] ➔
                </button>
              )}
          </div>
        </div>
      )}

      {/* 2. MVP Boss Encounter & Enrage HUD */}
      {bossEncounter && (
        <div
          data-testid="boss-encounter-card"
          style={{
            width: "100%",
            backgroundColor: bossEncounter.isEnraged
              ? "rgba(69, 10, 10, 0.94)"
              : "rgba(15, 23, 42, 0.92)",
            backdropFilter: "blur(10px)",
            borderRadius: "12px",
            border: bossEncounter.isEnraged
              ? "2px solid #ef4444"
              : bossEncounter.phase === "phase2_empowered"
                ? "2px solid #f97316"
                : "1px solid rgba(220, 38, 38, 0.5)",
            boxShadow: bossEncounter.isEnraged
              ? "0 0 25px rgba(239, 68, 68, 0.5), inset 0 0 15px rgba(239, 68, 68, 0.2)"
              : "0 8px 24px rgba(0, 0, 0, 0.7)",
            padding: "12px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            pointerEvents: "auto",
          }}
        >
          {/* Boss Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "1.2rem" }}>
                {bossEncounter.isEnraged ? "⚡" : "💀"}
              </span>
              <span
                data-testid="boss-name"
                style={{
                  fontWeight: 900,
                  fontSize: "1.05rem",
                  color: bossEncounter.isEnraged ? "#fca5a5" : "#f87171",
                  letterSpacing: "0.03em",
                }}
              >
                {bossEncounter.name}
              </span>
            </div>

            {/* Boss Phase Badge */}
            <span
              data-testid="boss-phase-badge"
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                padding: "3px 8px",
                borderRadius: "6px",
                backgroundColor: bossEncounter.isEnraged
                  ? "#dc2626"
                  : bossEncounter.phase === "phase2_empowered"
                    ? "#ea580c"
                    : "#334155",
                color: "#ffffff",
                boxShadow: bossEncounter.isEnraged
                  ? "0 0 8px rgba(220, 38, 38, 0.8)"
                  : "none",
              }}
            >
              {bossEncounter.isEnraged
                ? "BERSERK / ENRAGED"
                : bossEncounter.phase === "phase2_empowered"
                  ? "PHASE 2: EMPOWERED"
                  : "PHASE 1: NORMAL"}
            </span>
          </div>

          {/* Boss Health Bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              <span style={{ color: "#94a3b8" }}>Health</span>
              <span data-testid="boss-hp-text" style={{ color: "#f1f5f9" }}>
                {bossEncounter.currentHp.toLocaleString()} /{" "}
                {bossEncounter.maxHp.toLocaleString()} (
                {(
                  (bossEncounter.currentHp / Math.max(1, bossEncounter.maxHp)) *
                  100
                ).toFixed(1)}
                %)
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: "10px",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                borderRadius: "5px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (bossEncounter.currentHp /
                        Math.max(1, bossEncounter.maxHp)) *
                        100,
                    ),
                  )}%`,
                  background: bossEncounter.isEnraged
                    ? "linear-gradient(90deg, #b91c1c, #ef4444)"
                    : bossEncounter.phase === "phase2_empowered"
                      ? "linear-gradient(90deg, #c2410c, #f97316)"
                      : "linear-gradient(90deg, #991b1b, #dc2626)",
                  boxShadow: "0 0 10px rgba(239, 68, 68, 0.5)",
                  transition: "width 0.2s linear",
                }}
              />
            </div>
          </div>

          {/* Enrage Timer Bar & Warning */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.8rem",
              marginTop: "2px",
            }}
          >
            <div
              data-testid="enrage-timer"
              style={{
                fontWeight: 700,
                color: bossEncounter.isEnraged
                  ? "#ef4444"
                  : bossEncounter.enrageRemainingSecs <= 60
                    ? "#f97316"
                    : "#cbd5e1",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>⏳</span>
              <span>
                {bossEncounter.isEnraged
                  ? "BOSS ENRAGED (+50% ATK / +35% ASPD)"
                  : `Enrage in: ${formatTimer(bossEncounter.enrageRemainingSecs)}`}
              </span>
            </div>

            {bossEncounter.empoweredSkillUnlocked && (
              <span
                data-testid="empowered-indicator"
                style={{
                  fontSize: "0.75rem",
                  color: "#fdba74",
                  fontWeight: 600,
                }}
              >
                🔥 Empowered Skills Active
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
