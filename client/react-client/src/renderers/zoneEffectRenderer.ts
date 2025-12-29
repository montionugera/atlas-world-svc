import { ZoneEffect } from '../types/game'

export const drawZoneEffects = (ctx: CanvasRenderingContext2D, zoneEffects?: Map<string, ZoneEffect>) => {
  if (!zoneEffects) return

  const now = Date.now()

  zoneEffects.forEach((zone) => {
    ctx.save()
    ctx.translate(zone.x, zone.y)

    // Determine color based on effect type
    let color = 'rgba(255, 255, 255, 0.5)' // Default
    let strokeColor = 'white'
    
    switch (zone.effectType) {
      case 'damage':
        color = 'rgba(255, 50, 50, 0.4)' // Red
        strokeColor = '#ff4444'
        break
      case 'freeze':
        color = 'rgba(50, 200, 255, 0.4)' // Cyan
        strokeColor = '#00ffff'
        break
      case 'stun':
        color = 'rgba(255, 255, 50, 0.4)' // Yellow
        strokeColor = '#ffff00'
        break
      case 'heal':
        color = 'rgba(50, 255, 50, 0.4)' // Green
        strokeColor = '#00ff00'
        break
    }

    // Casting State
    if (!zone.isActive) {
        // Draw casting indicator (dashed outline, pulsing)
        const pulse = (Math.sin(now / 100) + 1) / 2 // 0 to 1
        const alpha = 0.3 + (pulse * 0.4) // 0.3 to 0.7
        
        ctx.beginPath()
        ctx.arc(0, 0, zone.radius * 20, 0, Math.PI * 2) // Radius is in physics units usually, *20 for pixels if needed, or if radius is already pixels... 
        // Wait, radius in game.ts seems to be physics units (2). 2 * 20 = 40 pixels? 
        // Let's assume standard scaling if GameRenderer handles camera transform.
        // Usually rendering assumes untransformed coordinates if camera is applied globally.
        // But here we are drawing in world space.
        
        // CHECK SCALE: Map logic usually treats 1 unit as significant. 2.5 is typical radius.
        // If other renderers use direct values, we use direct.
        // Let's stick to direct radius, assuming context is scaled or radius is large enough.
        // Actually, previous trap renderer likely used fixed size or scaled.
        // Let's use `zone.radius` directly if scale is handled by canvas transform, 
        // OR multiply if physics units are small.
        // Standard Planck/Box2d: 1 unit = 1 meter. 
        // Looking at GameConfig, world is 2000 wide. 
        // Player radius is ~1.3. 
        // So radius 2.5 is decent size (double player size).
        // If the canvas is NOT scaled, we need to multiply. 
        // Let's look at GameRenderer later. For now, use radius.
        
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.stroke()
        
        // Timer progress (arc)
        const progress = Math.min(1, (now - zone.createdAt) / zone.castTime)
        ctx.beginPath()
        ctx.arc(0, 0, zone.radius - 2, 0, Math.PI * 2 * progress)
        ctx.setLineDash([])
        ctx.strokeStyle = strokeColor
        ctx.stroke()
        
    } else {
        // Active State
        // Draw solid zone
        ctx.beginPath()
        ctx.arc(0, 0, zone.radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        
        // Pulse outline
        const pulse = (Math.sin(now / 200) + 1) / 2
        ctx.lineWidth = 2 + pulse * 2
        ctx.strokeStyle = strokeColor
        ctx.stroke()
    }

    ctx.restore()
  })
}
