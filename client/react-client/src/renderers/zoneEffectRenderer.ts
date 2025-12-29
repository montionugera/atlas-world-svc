import { ZoneEffect } from '../types/game'

export const drawZoneEffects = (ctx: CanvasRenderingContext2D, zoneEffects?: Map<string, ZoneEffect>, viewScale: number = 1) => {
  if (!zoneEffects) return

  const now = Date.now()
  // Line width should be inversely proportional to scale so it's constant on screen
  const baseLineWidth = 2 / viewScale

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
        // Draw casting indicator:
        // 1. Dashed boundary ring (fixed radius)
        const pulse = (Math.sin(now / 100) + 1) / 2 // 0 to 1
        const alpha = 0.3 + (pulse * 0.4) // 0.3 to 0.7
        
        ctx.beginPath()
        ctx.arc(0, 0, zone.radius, 0, Math.PI * 2) 
        
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.lineWidth = baseLineWidth
        ctx.setLineDash([5 / viewScale, 5 / viewScale]) // Dash size also scaled
        ctx.stroke()
        
        // 2. Filling animation (Growing circle from center)
        // This visualizes "loading" better than a sector? Or maybe a sector is better?
        // Let's try growing circle - it shows the area being prepared.
        const progress = Math.min(1, (now - zone.createdAt) / zone.castTime)
        
        ctx.beginPath()
        ctx.arc(0, 0, zone.radius * progress, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, 0.2)`
        ctx.fill()
        
        // Timer progress ring (optional, maybe too cluttered)
        
    } else {
        // Active State
        ctx.beginPath()
        ctx.arc(0, 0, zone.radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        
        // Pulse outline
        const pulse = (Math.sin(now / 200) + 1) / 2
        ctx.lineWidth = baseLineWidth + (pulse * 2 / viewScale)
        ctx.strokeStyle = strokeColor
        ctx.setLineDash([])
        ctx.stroke()
    }

    ctx.restore()
  })
}
