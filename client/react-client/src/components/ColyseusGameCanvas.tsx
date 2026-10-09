import React, { useEffect, useRef } from "react";
import { UseColyseusClientReturn } from "../hooks/useColyseusClient";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { GameRenderer } from "./GameRenderer";
import { CANVAS_CONFIG } from "../config/gameConfig";
import { useGameStateContext } from "../contexts/GameStateContext";
import { InputDebugPanel } from "./InputDebugPanel";
import { calculateScale } from "../utils/drawingUtils";

interface ColyseusGameCanvasProps {
  client: UseColyseusClientReturn;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({
  client,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // Track mouse world position
  const { setGameState } = useGameStateContext();

  const {
    isConnected: clientConnected,
    roomId,
    playerId,
    gameState,
    updateCount,
    fps,
    updateRate,
    updatePlayerInput,
    sendPlayerAction,
    switchWeapon,
    trackFrame,
    respawn,
  } = client;

  // Local player state
  const localPlayer = gameState?.players.get(playerId);
  const isDead = localPlayer
    ? !localPlayer.isAlive || (localPlayer.health ?? 1) <= 0
    : false;

  // Update context when gameState or roomId changes
  useEffect(() => {
    setGameState(gameState, roomId, clientConnected);
  }, [gameState?.tick, gameState, roomId, clientConnected, setGameState]);

  // Handle keyboard controls
  const { pressedKeys } = useKeyboardControls({
    updatePlayerInput,
    sendPlayerAction,
    switchWeapon,
    mousePositionRef,
    respawn,
    isDead,
  });

  // Track latest state for mouse handlers without re-binding listeners
  const latestStateRef = useRef({ gameState, playerId, isDead });
  useEffect(() => {
    latestStateRef.current = { gameState, playerId, isDead };
  }, [gameState, playerId, isDead]);

  // Mouse move tracking (single listener)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const { gameState: currentGameState, playerId: currentPid } =
        latestStateRef.current;

      if (!canvas || !currentGameState) return;

      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const viewportSize = currentGameState.viewportSize ?? 50;
      const scale = calculateScale(currentGameState, canvas, viewportSize);

      let cameraX = currentGameState.width / 2;
      let cameraY = currentGameState.height / 2;

      const player = currentGameState.players.get(currentPid);
      if (player) {
        cameraX = player.x;
        cameraY = player.y;
      }

      const worldX = (clientX - canvas.width / 2) / scale + cameraX;
      const worldY = (clientY - canvas.height / 2) / scale + cameraY;

      mousePositionRef.current = { x: worldX, y: worldY };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Global mouseup listener to release attack if mouse is released outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && sendPlayerAction) {
        sendPlayerAction("attack", false, {
          x: mousePositionRef.current.x,
          y: mousePositionRef.current.y,
        });
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [sendPlayerAction]);

  // Handle mouse down on canvas (click-to-attack / click-to-target / click-to-respawn)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDead) {
      if (respawn) respawn();
      return;
    }

    if (e.button === 0 && sendPlayerAction) {
      const { x: wx, y: wy } = mousePositionRef.current;
      let targetMobId: number | undefined;

      if (gameState) {
        gameState.mobs.forEach((mob) => {
          if (mob.isAlive === false || targetMobId !== undefined) return;
          const dist = Math.hypot(mob.x - wx, mob.y - wy);
          if (dist <= (mob.radius || 14) + 16) {
            targetMobId = Number(mob.id);
          }
        });
      }

      sendPlayerAction("attack", true, {
        x: wx,
        y: wy,
        targetId: targetMobId,
      });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && sendPlayerAction) {
      const { x: wx, y: wy } = mousePositionRef.current;
      sendPlayerAction("attack", false, { x: wx, y: wy });
    }
  };

  const containerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    borderRadius: CANVAS_CONFIG.borderRadius,
    overflow: "hidden",
    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
  };

  const actionBtnStyle = (color: string): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: `1px solid ${color}`,
    borderRadius: "8px",
    color: "#fff",
    cursor: isDead ? "not-allowed" : "pointer",
    opacity: isDead ? 0.4 : 1,
    fontSize: "0.9rem",
    transition: "all 0.15s ease",
    userSelect: "none",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        padding: "20px",
      }}
    >
      <div style={containerStyle}>
        <canvas
          ref={canvasRef}
          width={CANVAS_CONFIG.width}
          height={CANVAS_CONFIG.height}
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleCanvasMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            backgroundColor: CANVAS_CONFIG.backgroundColor,
            cursor: isDead ? "pointer" : "crosshair",
            display: "block",
          }}
        />

        {/* Death Overlay */}
        {isDead && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#e74c3c",
              zIndex: 100,
              backdropFilter: "blur(4px)",
              cursor: "pointer",
            }}
            onClick={() => respawn && respawn()}
          >
            <h1
              style={{
                fontSize: "3rem",
                margin: "0 0 10px 0",
                textShadow: "0 0 20px rgba(231,76,60,0.8)",
              }}
            >
              💀 YOU DIED
            </h1>
            <p
              style={{
                color: "#ecf0f1",
                fontSize: "1.2rem",
                marginBottom: "24px",
              }}
            >
              Click anywhere or press{" "}
              <kbd
                style={{
                  background: "#34495e",
                  padding: "4px 8px",
                  borderRadius: "4px",
                }}
              >
                SPACE
              </kbd>{" "}
              to Respawn
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (respawn) respawn();
              }}
              style={{
                backgroundColor: "#27ae60",
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                fontSize: "1.2rem",
                fontWeight: "bold",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(39, 174, 96, 0.4)",
                transition: "transform 0.1s ease",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.transform = "scale(1.05)")
              }
              onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              ♻️ Respawn Now
            </button>
          </div>
        )}

        <InputDebugPanel pressedKeysRef={pressedKeys} />

        <GameRenderer
          canvasRef={canvasRef}
          gameState={gameState}
          updateCount={updateCount}
          fps={fps}
          updateRate={updateRate}
          roomId={roomId}
          playerId={playerId}
          trackFrame={trackFrame}
        />
      </div>

      {/* Interactive Action / Skill Bar */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 16px",
          backgroundColor: "#1a252f",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        {/* Attack button */}
        <button
          disabled={isDead}
          onMouseDown={() =>
            sendPlayerAction &&
            sendPlayerAction("attack", true, {
              x: mousePositionRef.current.x,
              y: mousePositionRef.current.y,
            })
          }
          onMouseUp={() =>
            sendPlayerAction &&
            sendPlayerAction("attack", false, {
              x: mousePositionRef.current.x,
              y: mousePositionRef.current.y,
            })
          }
          style={actionBtnStyle("#e74c3c")}
          title="Melee Attack (Space or Left-Click)"
        >
          <span style={{ fontSize: "1.2rem" }}>⚔️</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Attack</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
              Space / L-Click
            </div>
          </div>
        </button>

        {/* Skill 1: Meteor Shower */}
        <button
          onClick={() => {
            if (sendPlayerAction)
              sendPlayerAction("useSkill", true, {
                skillId: "skill_1",
                x: mousePositionRef.current.x,
                y: mousePositionRef.current.y,
              });
          }}
          style={actionBtnStyle("#e67e22")}
          title="Meteor Shower (Key 1)"
        >
          <span style={{ fontSize: "1.2rem" }}>🔥</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Meteor</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Key [1]</div>
          </div>
        </button>

        {/* Skill 2: Precision Strike */}
        <button
          onClick={() => {
            if (sendPlayerAction)
              sendPlayerAction("useSkill", true, {
                skillId: "skill_2",
                x: mousePositionRef.current.x,
                y: mousePositionRef.current.y,
              });
          }}
          style={actionBtnStyle("#8e44ad")}
          title="Precision Strike (Key 2)"
        >
          <span style={{ fontSize: "1.2rem" }}>🪨</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Precision</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Key [2]</div>
          </div>
        </button>

        {/* Skill 3: Blizzard */}
        <button
          onClick={() => {
            if (sendPlayerAction)
              sendPlayerAction("useSkill", true, {
                skillId: "skill_3",
                x: mousePositionRef.current.x,
                y: mousePositionRef.current.y,
              });
          }}
          style={actionBtnStyle("#3498db")}
          title="Blizzard (Key 3)"
        >
          <span style={{ fontSize: "1.2rem" }}>❄️</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Blizzard</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Key [3]</div>
          </div>
        </button>

        {/* Skill 4: Thunder Strike */}
        <button
          onClick={() => {
            if (sendPlayerAction)
              sendPlayerAction("useSkill", true, {
                skillId: "skill_4",
                x: mousePositionRef.current.x,
                y: mousePositionRef.current.y,
              });
          }}
          style={actionBtnStyle("#f1c40f")}
          title="Thunder Strike (Key 4)"
        >
          <span style={{ fontSize: "1.2rem" }}>⚡</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Thunder</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Key [4]</div>
          </div>
        </button>

        {/* Skill 5: Dash */}
        <button
          onClick={() => {
            if (sendPlayerAction)
              sendPlayerAction("useSkill", true, {
                skillId: "skill_dash",
                x: mousePositionRef.current.x,
                y: mousePositionRef.current.y,
              });
          }}
          style={actionBtnStyle("#1abc9c")}
          title="Dash Impulse (Shift)"
        >
          <span style={{ fontSize: "1.2rem" }}>💨</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Dash</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>[Shift]</div>
          </div>
        </button>
      </div>
    </div>
  );
};
