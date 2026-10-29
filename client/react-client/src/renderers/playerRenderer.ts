import { RENDER_CONFIG, COLORS } from "../config/gameConfig";
import {
  drawCircle,
  drawText,
  drawHealthBar,
  drawHeading,
  drawAttackCone,
  drawAttackSlash,
} from "../utils/drawingUtils";
import { Race, EnchantVisualGlow } from "../protocol/BinaryDeltaDecoder";

const ATTACK_CYCLE_DURATION_MS = 800; // Matches server-rs attack_cooldown (0.8s)
const ATTACK_SWING_DURATION_MS = 240; // Active swing window with hit cone / slash visible

// Track when each player's attack cycle began so cone only renders during active swing
const playerAttackCycleStart = new Map<string, number>();

/**
 * Returns racial scale factor:
 * - Dwarf: 0.82 (Tontatta micro-titan miniature hitbox)
 * - Ogre/Orc: 1.25 (Crucible vanguard massive hitbox)
 * - Standard: 1.0
 */
export const getRaceScaleFactor = (race?: Race | number): number => {
  switch (race) {
    case Race.Dwarf:
      return 0.82;
    case Race.OgreOrc:
      return 1.25;
    default:
      return 1.0;
  }
};

/**
 * Renders race-specific composite paperdoll visual markers on top of the base body:
 * 0: Human/Demi-Human: Balanced terracotta rune medallion & sash
 * 1: Dwarf: Tontatta micro-titan amber-smith apron & anvil/hammer crest
 * 2: Ogre/Orc: Crucible vanguard basalt shoulder pauldrons & blood-fury core
 * 3: Furral: Mink-inspired beastfolk ears & galvanic bio-electro sparks
 * 4: Lunar: Astral high-elven starlight mantle, elongated ears & celestial crown
 * 5: Dark-Lunar: Umbral eclipse twilight circlet & shadow-refraction aura
 */
export const drawRacePaperdoll = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  race: Race | number | undefined,
  heading: number,
  isCurrent: boolean,
  inverseScale: number,
  now: number,
): void => {
  ctx.save();

  switch (race) {
    case Race.Dwarf: {
      // 1. Tontatta Micro-Titan: Amber smith apron and anvil crest
      ctx.fillStyle = "#92400e"; // Dark amber-bronze apron
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
      ctx.fill();

      // Anvil / Forge crest
      ctx.fillStyle = "#f59e0b"; // Warm gold-amber
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 1.5 * inverseScale;
      ctx.stroke();
      break;
    }

    case Race.OgreOrc: {
      // 2. Crucible Vanguard: Basalt heavy shoulder pauldrons & blood-fury core
      const pauldronOffset = radius * 0.85;
      const leftAngle = heading - Math.PI / 2;
      const rightAngle = heading + Math.PI / 2;

      // Basalt pauldrons
      ctx.fillStyle = "#1e293b"; // Basalt dark slate
      ctx.strokeStyle = "#dc2626"; // Crimson crucible edge
      ctx.lineWidth = 2 * inverseScale;

      // Left pauldron
      const lpX = x + Math.cos(leftAngle) * pauldronOffset;
      const lpY = y + Math.sin(leftAngle) * pauldronOffset;
      ctx.beginPath();
      ctx.arc(lpX, lpY, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Right pauldron
      const rpX = x + Math.cos(rightAngle) * pauldronOffset;
      const rpY = y + Math.sin(rightAngle) * pauldronOffset;
      ctx.beginPath();
      ctx.arc(rpX, rpY, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Crucible blood-fury glowing core
      const pulse = Math.sin(now / 200) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.6 + pulse * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case Race.Furral: {
      // 3. Furral (Electro-Beastfolk): Beast ears and bio-electro sparks
      const earDist = radius * 0.95;
      const leftEar = heading - Math.PI * 0.65;
      const rightEar = heading + Math.PI * 0.65;

      // Beastfolk pointed ears
      ctx.fillStyle = "#d97706"; // Tawny beast fur
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 1.5 * inverseScale;

      for (const earAngle of [leftEar, rightEar]) {
        const ex = x + Math.cos(earAngle) * earDist;
        const ey = y + Math.sin(earAngle) * earDist;
        ctx.beginPath();
        ctx.arc(ex, ey, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Galvanic bio-electro static sparks
      const sparkCount = 3;
      ctx.strokeStyle = "#38bdf8"; // Electric cyan
      ctx.lineWidth = 2 * inverseScale;
      for (let i = 0; i < sparkCount; i++) {
        const angle = (now / 150) + (i * (Math.PI * 2 / sparkCount));
        const dist = radius * (1.1 + 0.15 * Math.sin(now / 100 + i));
        const sx = x + Math.cos(angle) * dist;
        const sy = y + Math.sin(angle) * dist;
        ctx.beginPath();
        ctx.arc(sx, sy, 2 * inverseScale, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case Race.Lunar: {
      // 4. Lunar (Astral High-Elven): Star-silk celadon mantle & starlight crown
      // Celadon star-silk outer shimmer
      ctx.strokeStyle = "rgba(103, 232, 249, 0.75)"; // Celadon cyan
      ctx.lineWidth = 2.5 * inverseScale;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.15, 0, Math.PI * 2);
      ctx.stroke();

      // High-elven elongated ears
      const earDist = radius * 1.05;
      for (const sign of [-1, 1]) {
        const earAngle = heading + sign * (Math.PI * 0.6);
        const ex = x + Math.cos(earAngle) * earDist;
        const ey = y + Math.sin(earAngle) * earDist;
        ctx.fillStyle = "#e0f2fe"; // Starlight porcelain
        ctx.beginPath();
        ctx.ellipse(ex, ey, radius * 0.22, radius * 0.45, earAngle, 0, Math.PI * 2);
        ctx.fill();
      }

      // Starlight crown gem
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case Race.DarkLunar: {
      // 5. Dark-Lunar (Umbral Eclipse): Shadow refraction aura & obsidian crescent
      const shadowPulse = Math.sin(now / 250) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(88, 28, 135, ${0.4 + shadowPulse * 0.3})`; // Umbral violet
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // Obsidian crescent circlet
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2 * inverseScale;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.6, heading - Math.PI * 0.5, heading + Math.PI * 0.5);
      ctx.stroke();

      // Umbral core
      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case Race.HumanDemiHuman:
    default: {
      // 0. Human / Demi-Human: Terracotta rune medallion & balanced seal
      ctx.fillStyle = "#c2410c"; // Terracotta orange-ochre
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fed7aa";
      ctx.lineWidth = 1.5 * inverseScale;
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
};

/**
 * Renders weapon model with Lineage 2 / Ragnarok Origin style +4..=+20 visual glows:
 * 0: None - Plain steel blade
 * 1: FaintWhite (+4..+6) - Soft pulsing white radiance
 * 2: LuminescentBlue (+7..+9) - Azure/cyan plasma aura with electric core
 * 3: RadiantRed (+10..+12) - Blazing ruby / crimson flame pulse
 * 4: AbyssalPurple (+13..+15) - Deep void violet / shadow flame tendrils
 * 5: CelestialGold (+16..+20) - Divine golden sunburst with orbiting starlight sparkles
 */
export const drawWeaponEnchantGlow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  heading: number,
  enchantGlow: EnchantVisualGlow | number | undefined,
  inverseScale: number,
  now: number,
): void => {
  // Weapon hand offset at ~45 degrees from heading
  const handAngle = heading + Math.PI / 4;
  const handDist = radius * 1.05;
  const handX = x + Math.cos(handAngle) * handDist;
  const handY = y + Math.sin(handAngle) * handDist;

  // Weapon points forward in heading direction
  const weaponLength = radius * 1.35;
  const tipX = handX + Math.cos(heading) * weaponLength;
  const tipY = handY + Math.sin(heading) * weaponLength;

  ctx.save();

  // Weapon guard/hilt crossbar
  const perpX = -Math.sin(heading) * (radius * 0.25);
  const perpY = Math.cos(heading) * (radius * 0.25);
  ctx.beginPath();
  ctx.moveTo(handX - perpX, handY - perpY);
  ctx.lineTo(handX + perpX, handY + perpY);
  ctx.lineWidth = 2.5 * inverseScale;
  ctx.strokeStyle = "#475569";
  ctx.stroke();

  // Base metallic weapon blade
  ctx.beginPath();
  ctx.moveTo(handX, handY);
  ctx.lineTo(tipX, tipY);
  ctx.lineWidth = 3.5 * inverseScale;
  ctx.strokeStyle = "#e2e8f0";
  ctx.stroke();

  // Handle enchant visual glow overlays (+4 to +20)
  if (enchantGlow && enchantGlow !== EnchantVisualGlow.None) {
    const pulse = Math.sin(now / 180) * 0.5 + 0.5; // 0..1 smooth pulsing sine wave

    switch (enchantGlow) {
      case EnchantVisualGlow.FaintWhite: {
        // Tier 1 (+4..+6): Faint white shimmer
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = (6 + pulse * 3) * inverseScale;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + pulse * 0.35})`;
        ctx.lineCap = "round";
        ctx.stroke();
        break;
      }

      case EnchantVisualGlow.LuminescentBlue: {
        // Tier 2 (+7..+9): Luminescent cyan/azure radiant aura
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = (8 + pulse * 4) * inverseScale;
        ctx.strokeStyle = `rgba(0, 210, 255, ${0.5 + pulse * 0.4})`;
        ctx.lineCap = "round";
        ctx.stroke();

        // Inner electric core
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = 3 * inverseScale;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        break;
      }

      case EnchantVisualGlow.RadiantRed: {
        // Tier 3 (+10..+12): Fiery ruby / radiant crimson flame flare
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = (10 + pulse * 5) * inverseScale;
        ctx.strokeStyle = `rgba(255, 34, 68, ${0.55 + pulse * 0.4})`;
        ctx.lineCap = "round";
        ctx.stroke();

        // Flame flare core
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = 4 * inverseScale;
        ctx.strokeStyle = "#ff9900";
        ctx.stroke();
        break;
      }

      case EnchantVisualGlow.AbyssalPurple: {
        // Tier 4 (+13..+15): Deep void violet / abyssal purple swirling miasma
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = (12 + pulse * 6) * inverseScale;
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.6 + pulse * 0.35})`;
        ctx.lineCap = "round";
        ctx.stroke();

        // Void core
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = 4 * inverseScale;
        ctx.strokeStyle = "#f3e8ff";
        ctx.stroke();
        break;
      }

      case EnchantVisualGlow.CelestialGold: {
        // Tier 5 (+16..+20): Celestial divine golden radiance with particle sparkles
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = (14 + pulse * 6) * inverseScale;
        ctx.strokeStyle = `rgba(245, 158, 11, ${0.7 + pulse * 0.3})`;
        ctx.lineCap = "round";
        ctx.stroke();

        // Solar core
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = 5 * inverseScale;
        ctx.strokeStyle = "#fffbeb";
        ctx.stroke();

        // 3 Orbiting starlight sparkles around blade tip
        for (let i = 0; i < 3; i++) {
          const angle = now / 400 + (i * (Math.PI * 2)) / 3;
          const sparkleDist = radius * 0.45 + pulse * 2 * inverseScale;
          const sx = tipX + Math.cos(angle) * sparkleDist;
          const sy = tipY + Math.sin(angle) * sparkleDist;
          ctx.fillStyle = "#fef08a";
          ctx.beginPath();
          ctx.arc(sx, sy, 2.5 * inverseScale, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }

  ctx.restore();
};

/**
 * Draw all players with their names, racial paperdolls, weapon enchant glows, and highlight current player
 */
export const drawPlayers = (
  ctx: CanvasRenderingContext2D,
  players: Map<string, any>,
  currentPlayerId: string,
  scale: number,
  viewScale: number = 1,
): void => {
  const inverseScale = 1 / viewScale;
  const now = Date.now();

  players.forEach((player, sessionId) => {
    const x = player.x * scale;
    const y = player.y * scale;

    // Resolve heading early so paperdoll and weapon sockets align
    let heading = player.heading;
    if (heading === undefined && (player.vx !== 0 || player.vy !== 0)) {
      heading = Math.atan2(player.vy || 0, player.vx || 0);
    }
    const resolvedHeading = heading ?? 0;

    // Racial scale factor (Dwarf miniature 0.82x, Ogre massive 1.25x)
    const raceScale = getRaceScaleFactor(player.race);

    // Draw player circle (scaled to match world/canvas ratio)
    const baseRadius =
      typeof player.radius === "number" &&
      !isNaN(player.radius) &&
      player.radius > 0
        ? player.radius
        : RENDER_CONFIG.playerRadius || 1.5;
    const effectiveRadius = baseRadius * raceScale;
    const radius = effectiveRadius * scale;
    const isCurrent =
      sessionId === currentPlayerId ||
      player.id === currentPlayerId ||
      player.sessionId === currentPlayerId;

    drawCircle(ctx, x, y, radius, isCurrent ? "#2ecc71" : COLORS.player);

    // Always draw a visible outline so players stand out
    ctx.beginPath();
    ctx.arc(x, y, radius + 1 * inverseScale, 0, Math.PI * 2);
    ctx.strokeStyle = isCurrent ? "#f1c40f" : COLORS.playerHighlight;
    ctx.lineWidth = 2 * inverseScale;
    ctx.stroke();

    // Render racial composite paperdoll markers
    drawRacePaperdoll(
      ctx,
      x,
      y,
      radius,
      player.race,
      resolvedHeading,
      isCurrent,
      inverseScale,
      now,
    );

    // Render weapon model with +4..=+20 enchant visual glow
    drawWeaponEnchantGlow(
      ctx,
      x,
      y,
      radius,
      resolvedHeading,
      player.enchantGlow,
      inverseScale,
      now,
    );

    // UI Vertical Offset stacking
    // Start strictly above the player radius
    let uiYOffset = y - radius;

    // 1. Health Bar (Bottom of stack)
    const currentHealth = player.currentHealth ?? player.health ?? 100;
    const maxHealth = player.maxHealth ?? 100;
    if (maxHealth > 0 && currentHealth !== undefined) {
      const healthBarHeight = 10; // pixels
      const healthBarMargin = 10; // pixels above radius

      drawHealthBar(
        ctx,
        x,
        y,
        currentHealth,
        maxHealth,
        radius,
        scale,
        "#ff0000", // red background
        "#00ff00", // green health
        "#000000", // black border
        {
          minWidth: 24,
          maxWidth: 64, // Fixed pixel width (larger)
          minHeight: 4,
          maxHeight: healthBarHeight, // Fixed pixel height
          minOffset: healthBarMargin,
          maxOffset: 500, // Large enough so it doesn't clamp inside the player radius
          widthMultiplier: 2.6,
          heightMultiplier: 0.35,
        },
        viewScale,
      );

      // Update Y offset for next elements
      uiYOffset -= (healthBarMargin + healthBarHeight + 4) * inverseScale;
    } else {
      // Base margin if no health bar
      uiYOffset -= 10 * inverseScale;
    }

    // 2. Casting Bar (Above Health Bar if present)
    if (player.castingUntil && player.castingUntil > now) {
      const remaining = player.castingUntil - now;
      const total = player.castDuration || 500;
      const progress = Math.min(1, Math.max(0, remaining / total)); // Clamp to 0-1
      const fillPct = 1 - progress;

      const barWidth = 40 * inverseScale;
      const barHeight = 5 * inverseScale;

      const castBarBottom = uiYOffset;
      const castBarTop = castBarBottom - barHeight;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(x - barWidth / 2, castBarTop, barWidth, barHeight);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 1 * inverseScale;
      ctx.strokeRect(x - barWidth / 2, castBarTop, barWidth, barHeight);

      ctx.fillStyle = "#f39c12"; // Glowing gold cast bar
      ctx.fillRect(x - barWidth / 2, castBarTop, barWidth * fillPct, barHeight);

      // Shift stack up
      uiYOffset -= barHeight + 6 * inverseScale;
    }

    // 3. Name Label (Top of stack) with Level tag
    const fontSize = 12 * inverseScale;
    const nameY = uiYOffset - 2 * inverseScale;

    const rawName =
      player.name || (isCurrent ? "Player (YOU)" : `Player-${sessionId}`);
    const levelPrefix =
      typeof player.level === "number" && player.level > 0
        ? `[Lv.${player.level}] `
        : "";
    const displayName = `${levelPrefix}${rawName}`;

    drawText(
      ctx,
      displayName,
      x - 25 * inverseScale, // Rough centering offset (text width dependent)
      nameY,
      isCurrent ? "#f1c40f" : COLORS.hudText,
      `bold ${fontSize}px Arial`,
    );

    // Draw BOT label if in bot mode
    if (player.isBotMode && !isCurrent) {
      drawText(
        ctx,
        "[BOT]",
        x - 15 * inverseScale,
        nameY - 14 * inverseScale,
        "#ff9f43",
        `${10 * inverseScale}px Arial`,
      );
    }

    // Draw Status Effects (Freeze/Stun)
    if (player.battleStatuses) {
      if (player.battleStatuses.has("freeze")) {
        ctx.fillStyle = "rgba(100, 200, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(x, y, radius + 6 * inverseScale, 0, Math.PI * 2);
        ctx.fill();
        drawText(
          ctx,
          "❄️",
          x - 4 * inverseScale,
          y - (radius + 25 * inverseScale),
          "#fff",
          `${12 * inverseScale}px Arial`,
        );
      }
      if (player.battleStatuses.has("stun")) {
        drawText(
          ctx,
          "💫",
          x - 4 * inverseScale,
          y - (radius + 25 * inverseScale),
          "#fff",
          `${12 * inverseScale}px Arial`,
        );
      }
    }

    // Draw heading indicator (smaller for player) - always show heading
    if (heading !== undefined) {
      drawHeading(
        ctx,
        x,
        y,
        heading,
        radius,
        scale,
        "#ffffff", // white arrow
        2, // thicker line will be inversely scaled inside this function
        0.4,
        viewScale,
      );
    }

    // Draw attack visualization if player is attacking during active swing window
    if (player.isAttacking && heading !== undefined) {
      let cycleStart = playerAttackCycleStart.get(sessionId);
      if (!cycleStart || now - cycleStart >= ATTACK_CYCLE_DURATION_MS) {
        cycleStart = now;
        playerAttackCycleStart.set(sessionId, cycleStart);
      }

      const elapsed = now - cycleStart;
      const isSwingActive = elapsed < ATTACK_SWING_DURATION_MS;

      if (isSwingActive) {
        // Draw attack cone
        drawAttackCone(
          ctx,
          x,
          y,
          heading,
          player.attackRange || 3,
          scale,
          "#ff4444", // red cone
          0.4, // semi-transparent
        );

        // Draw attack slash effect
        drawAttackSlash(
          ctx,
          x,
          y,
          heading,
          radius,
          "#ffff00", // yellow slash
          7, // thicker line for slash
          viewScale,
        );
      }
    } else {
      playerAttackCycleStart.delete(sessionId);
    }

    // Highlight current player with gold aura
    if (isCurrent) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 3 * inverseScale, 0, Math.PI * 2);
      ctx.strokeStyle = "#f1c40f";
      ctx.lineWidth = 3 * inverseScale;
      ctx.stroke();
    }
  });
};
