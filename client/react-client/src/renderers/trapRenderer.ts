import { Trap } from '../types/game';

export const drawTraps = (
  ctx: CanvasRenderingContext2D,
  traps: Map<string, Trap>,
  scale: number
) => {
  traps.forEach(trap => {
    const { x, y, triggerRadius, isArmed, effectType } = trap;

    ctx.save();
    ctx.translate(x, y);

    // Color based on state and type
    let color = '#cccccc'; // Default/Unarmed
    let glowColor = 'rgba(200, 200, 200, 0.3)';

    if (isArmed) {
      switch (effectType) {
        case 'damage':
          color = '#ff0000'; // Red
          glowColor = 'rgba(255, 0, 0, 0.4)';
          break;
        case 'freeze':
          color = '#00ffff'; // Cyan
          glowColor = 'rgba(0, 255, 255, 0.4)';
          break;
        case 'stun':
          color = '#ffff00'; // Yellow
          glowColor = 'rgba(255, 255, 0, 0.4)';
          break;
      }
    }

    // Draw Trigger Radius (Outer Ring)
    ctx.beginPath();
    ctx.arc(0, 0, triggerRadius, 0, Math.PI * 2);
    ctx.fillStyle = glowColor;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / scale;
    if (!isArmed) {
        ctx.setLineDash([5 / scale, 5 / scale]); // Dashed if not armed
    }
    ctx.stroke();

    // Draw Trap Center (Icon/Dot)
    ctx.beginPath();
    ctx.arc(0, 0, 0.4, 0, Math.PI * 2); // Small inner dot
    ctx.fillStyle = color;
    ctx.fill();
    
    // Pulse effect for armed traps
    if (isArmed) {
        const time = Date.now() / 500;
        const pulse = (Math.sin(time) + 1) / 2 * 0.2 + 0.8; // 0.8 to 1.0
        
        ctx.beginPath();
        ctx.arc(0, 0, 0.4 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
    }

    ctx.restore();
  });
};
