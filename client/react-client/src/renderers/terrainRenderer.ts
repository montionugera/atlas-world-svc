/**
 * Top-down Terrain & Environment Renderer
 * Renders regional biomes, stone roads, cobblestone courtyard, rivers, and town buildings
 * for the Atlas frontier world map.
 */

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  createdAt: number;
  durationMs: number;
  color: string;
  isCrit?: boolean;
}

export interface TownBuilding {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  roofColor: string;
}

export const MILLCROSS_BUILDINGS: TownBuilding[] = [
  {
    id: "mill-house",
    name: "Mill",
    x: 164,
    y: 134,
    width: 24,
    height: 18,
    color: "#4a3b32",
    roofColor: "#7a3e2e",
  },
  {
    id: "victual-shed",
    name: "Store",
    x: 134,
    y: 167,
    width: 24,
    height: 16,
    color: "#3d332a",
    roofColor: "#5c4333",
  },
  {
    id: "ford-stable",
    name: "Stable",
    x: 134,
    y: 195,
    width: 26,
    height: 18,
    color: "#3d332a",
    roofColor: "#614736",
  },
  {
    id: "granary",
    name: "Granary",
    x: 230,
    y: 140,
    width: 26,
    height: 20,
    color: "#4a3b32",
    roofColor: "#824b35",
  },
  {
    id: "blacksmith",
    name: "Forge",
    x: 235,
    y: 180,
    width: 22,
    height: 18,
    color: "#383838",
    roofColor: "#502820",
  },
  {
    id: "brewery",
    name: "Brewery",
    x: 170,
    y: 220,
    width: 26,
    height: 18,
    color: "#42362b",
    roofColor: "#6b4531",
  },
  {
    id: "guard-post",
    name: "Guard",
    x: 100,
    y: 165,
    width: 18,
    height: 18,
    color: "#4f555c",
    roofColor: "#39434d",
  },
];

/**
 * Draw complete ground terrain, regional biomes, roads, river, buildings, and labels.
 */
export const drawTerrain = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  viewScale: number = 1,
  timeMs: number = Date.now(),
): void => {
  const inverseScale = 1 / viewScale;

  // 1. Base Ground (Spawn Meadow - lush forest green)
  ctx.fillStyle = "#1e331b";
  ctx.fillRect(0, 0, width * scale, height * scale);

  // Subtle meadow grass texture
  ctx.fillStyle = "#243d20";
  for (let gx = 40; gx < width; gx += 80) {
    for (let gy = 40; gy < height; gy += 80) {
      if ((gx + gy) % 160 === 0) {
        ctx.fillRect(
          (gx - 5) * scale,
          (gy - 5) * scale,
          10 * scale,
          10 * scale,
        );
      }
    }
  }

  // 2. Regional Biomes

  // Northern Icefield (Glacial slate blue with snow drifts)
  ctx.fillStyle = "#182736";
  ctx.fillRect(0, 0, width * scale, 250 * scale);

  // Snow drifts
  ctx.fillStyle = "#263c4f";
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(
        40 * scale,
        30 * scale,
        320 * scale,
        160 * scale,
        20 * scale,
      )
    : ctx.fillRect(40 * scale, 30 * scale, 320 * scale, 160 * scale);
  ctx.roundRect
    ? ctx.roundRect(
        420 * scale,
        20 * scale,
        350 * scale,
        180 * scale,
        20 * scale,
      )
    : ctx.fillRect(420 * scale, 20 * scale, 350 * scale, 180 * scale);
  ctx.fill();

  // Icefield border line
  ctx.strokeStyle = "#385670";
  ctx.lineWidth = 3 * inverseScale;
  ctx.beginPath();
  ctx.moveTo(0, 250 * scale);
  ctx.lineTo(width * scale, 250 * scale);
  ctx.stroke();

  // Thornveil Bramble (Deep thorny thicket brown-green)
  ctx.fillStyle = "#261c16";
  ctx.fillRect(680 * scale, 240 * scale, 320 * scale, 520 * scale);

  // Bramble root mounds
  ctx.fillStyle = "#382a21";
  ctx.fillRect(720 * scale, 280 * scale, 120 * scale, 180 * scale);
  ctx.fillRect(750 * scale, 520 * scale, 180 * scale, 160 * scale);

  ctx.strokeStyle = "#4a382c";
  ctx.lineWidth = 2 * inverseScale;
  ctx.strokeRect(680 * scale, 240 * scale, 320 * scale, 520 * scale);

  // East Dunes (Warm golden sand dunes)
  ctx.fillStyle = "#473b26";
  ctx.fillRect(540 * scale, 390 * scale, 150 * scale, 220 * scale);

  // Dune ripples
  ctx.fillStyle = "#5c4d32";
  ctx.fillRect(555 * scale, 410 * scale, 120 * scale, 15 * scale);
  ctx.fillRect(550 * scale, 460 * scale, 130 * scale, 20 * scale);
  ctx.fillRect(560 * scale, 520 * scale, 110 * scale, 18 * scale);

  // South Mud Pit (Murky bog peat)
  ctx.fillStyle = "#291e14";
  ctx.fillRect(390 * scale, 590 * scale, 230 * scale, 170 * scale);

  // Puddles in Mud Pit
  ctx.fillStyle = "#1c140d";
  ctx.beginPath();
  ctx.ellipse(
    460 * scale,
    650 * scale,
    40 * scale,
    25 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.ellipse(
    550 * scale,
    680 * scale,
    50 * scale,
    30 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // 3. Central Cobblestone Courtyard & Walkways
  // Walkway Roads (Cross paths width 30)
  ctx.fillStyle = "#3c454e";
  // North path
  ctx.fillRect(485 * scale, 0, 30 * scale, 390 * scale);
  // South path
  ctx.fillRect(485 * scale, 610 * scale, 30 * scale, 390 * scale);
  // West path
  ctx.fillRect(0, 485 * scale, 390 * scale, 30 * scale);
  // East path
  ctx.fillRect(610 * scale, 485 * scale, 390 * scale, 30 * scale);

  // Road borders
  ctx.strokeStyle = "#2f373f";
  ctx.lineWidth = 2 * inverseScale;
  ctx.strokeRect(485 * scale, 0, 30 * scale, 390 * scale);
  ctx.strokeRect(485 * scale, 610 * scale, 30 * scale, 390 * scale);
  ctx.strokeRect(0, 485 * scale, 390 * scale, 30 * scale);
  ctx.strokeRect(610 * scale, 485 * scale, 390 * scale, 30 * scale);

  // Central Courtyard
  ctx.fillStyle = "#353d46";
  ctx.fillRect(390 * scale, 390 * scale, 220 * scale, 220 * scale);

  // Courtyard Cobblestone Grid Pattern
  ctx.strokeStyle = "#444e59";
  ctx.lineWidth = 1 * inverseScale;
  for (let cx = 410; cx < 600; cx += 20) {
    ctx.beginPath();
    ctx.moveTo(cx * scale, 390 * scale);
    ctx.lineTo(cx * scale, 610 * scale);
    ctx.stroke();
  }
  for (let cy = 410; cy < 600; cy += 20) {
    ctx.beginPath();
    ctx.moveTo(390 * scale, cy * scale);
    ctx.lineTo(610 * scale, cy * scale);
    ctx.stroke();
  }

  // Decorative Courtyard Central Fountain / Emblem
  ctx.strokeStyle = "#657585";
  ctx.lineWidth = 3 * inverseScale;
  ctx.strokeRect(390 * scale, 390 * scale, 220 * scale, 220 * scale);

  ctx.fillStyle = "#2a323a";
  ctx.beginPath();
  ctx.arc(500 * scale, 500 * scale, 25 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7c92a6";
  ctx.stroke();

  // 4. Town of Millcross
  // River "The Meltwash"
  const waveShift = Math.sin(timeMs / 1000) * 3;
  ctx.fillStyle = "#1e466b";
  ctx.beginPath();
  ctx.moveTo((200 + waveShift) * scale, 0);
  ctx.lineTo((220 + waveShift) * scale, 0);
  ctx.lineTo((215 - waveShift) * scale, 260 * scale);
  ctx.lineTo((190 - waveShift) * scale, 260 * scale);
  ctx.closePath();
  ctx.fill();

  // River water highlights
  ctx.strokeStyle = "rgba(100, 180, 240, 0.4)";
  ctx.lineWidth = 2 * inverseScale;
  ctx.beginPath();
  ctx.moveTo((208 + waveShift) * scale, 20 * scale);
  ctx.lineTo((205 - waveShift) * scale, 240 * scale);
  ctx.stroke();

  // Town Trade Road
  ctx.fillStyle = "#463e33";
  ctx.fillRect(0, 172 * scale, 195 * scale, 16 * scale);
  // Bridge over Meltwash
  ctx.fillStyle = "#5c4e3f";
  ctx.fillRect(188 * scale, 170 * scale, 30 * scale, 20 * scale);
  ctx.strokeStyle = "#7a6955";
  ctx.strokeRect(188 * scale, 170 * scale, 30 * scale, 20 * scale);

  // Town Buildings
  for (const b of MILLCROSS_BUILDINGS) {
    const bx = b.x * scale;
    const by = b.y * scale;
    const bw = b.width * scale;
    const bh = b.height * scale;

    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(bx + 4 * inverseScale, by + 4 * inverseScale, bw, bh);

    // Wall structure
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, by, bw, bh);

    // Roof bevel
    ctx.fillStyle = b.roofColor;
    ctx.fillRect(
      bx + 2 * inverseScale,
      by + 2 * inverseScale,
      bw - 4 * inverseScale,
      bh - 4 * inverseScale,
    );

    // Outline / Roof ridge
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1 * inverseScale;
    ctx.strokeRect(bx, by, bw, bh);

    // Building Label
    const fontSize = Math.max(9, Math.round(9 * inverseScale));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText(b.name, bx + bw / 2, by + bh / 2);
  }

  // 5. Region Typography / Ambient World Labels
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";

  const labelFont = (size: number) =>
    `700 ${Math.max(12, Math.round(size * inverseScale))}px "Inter", system-ui, sans-serif`;

  ctx.font = labelFont(18);
  ctx.fillText("NORTHERN ICEFIELD", 500 * scale, 120 * scale);
  ctx.fillText("THORNVEIL BRAMBLE", 840 * scale, 480 * scale);

  ctx.font = labelFont(16);
  ctx.fillText("TOWN OF MILLCROSS", 160 * scale, 105 * scale);
  ctx.fillText("CENTRAL COURTYARD", 500 * scale, 460 * scale);
  ctx.fillText("EAST DUNES", 615 * scale, 500 * scale);
  ctx.fillText("SOUTH MUD PIT", 500 * scale, 675 * scale);
  ctx.fillText("SPAWN MEADOW", 320 * scale, 320 * scale);
};

/**
 * Draw floating combat numbers and status messages
 */
export const drawFloatingTexts = (
  ctx: CanvasRenderingContext2D,
  texts: FloatingText[],
  scale: number,
  viewScale: number = 1,
  now: number = Date.now(),
): void => {
  const inverseScale = 1 / viewScale;

  for (const item of texts) {
    const elapsed = now - item.createdAt;
    if (elapsed >= item.durationMs) continue;

    const progress = elapsed / item.durationMs; // 0 -> 1
    const yFloat = item.y - progress * 25; // Floats 25 units upward
    const opacity = 1 - Math.pow(progress, 2); // Fades toward the end

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const size = item.isCrit ? 16 : 13;
    const fontSize = Math.max(10, Math.round(size * inverseScale));
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Text Outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.lineWidth = 3 * inverseScale;
    ctx.strokeText(item.text, item.x * scale, yFloat * scale);

    // Text Fill
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x * scale, yFloat * scale);

    ctx.restore();
  }
};
