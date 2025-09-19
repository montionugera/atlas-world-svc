// Game Canvas Component for rendering mobs and players

import React, { useRef, useEffect } from 'react';
import { Mob, Player } from '../types/game';

interface GameCanvasProps {
  mobs: Mob[];
  players: Record<string, Player>;
  width?: number;
  height?: number;
  onFrameUpdate?: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  mobs, 
  players, 
  width = 500, 
  height = 500,
  onFrameUpdate
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const lastMobsRef = useRef<Mob[]>([]);
  const lastPlayersRef = useRef<Record<string, Player>>({});
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Animation loop for smooth movement
    const animate = () => {
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, width, height);
    
      // Draw grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      
      for (let x = 0; x <= width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      for (let y = 0; y <= height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Interpolate mob positions for smooth movement
      const interpolatedMobs = mobs.map(mob => {
        const lastMob = lastMobsRef.current.find(m => m.id === mob.id);
        if (lastMob) {
          // Smooth interpolation between last and current position
          const progress = 0.1; // Adjust for smoother/faster interpolation
          return {
            ...mob,
            x: lastMob.x + (mob.x - lastMob.x) * progress,
            y: lastMob.y + (mob.y - lastMob.y) * progress
          };
        }
        return mob;
      });
      
      // Draw mobs
      interpolatedMobs.forEach(mob => {
        // Mob body
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(mob.x, mob.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        // Mob border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Mob ID
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(mob.id, mob.x, mob.y - 10);
        
        // Velocity indicator
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mob.x, mob.y);
        ctx.lineTo(mob.x + mob.vx * 10, mob.y + mob.vy * 10);
        ctx.stroke();
      });
      
      // Draw players
      Object.values(players).forEach(player => {
        // Player body
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Player border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Player ID
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('P', player.position.x, player.position.y + 4);
      });
      
      // Update last positions for next frame
      lastMobsRef.current = [...mobs];
      lastPlayersRef.current = { ...players };
      
      // Call frame update callback for FPS tracking
      if (onFrameUpdate) {
        onFrameUpdate();
      }
      
      // Continue animation
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    animationRef.current = requestAnimationFrame(animate);
    
    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mobs, players, width, height, onFrameUpdate]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        border: '2px solid #fff',
        borderRadius: '8px',
        background: '#1a1a1a',
        display: 'block',
        margin: '0 auto'
      }}
    />
  );
};
