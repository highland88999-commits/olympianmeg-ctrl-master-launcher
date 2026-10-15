// lib/gta/hud.jsx — HUD overlay: minimap, health, wanted stars, speedometer, missions.
// Plain English, cleanest UI, Safari bottom clearance.

'use client';

import { useRef, useEffect } from 'react';

export function WantedStars({ stars }) {
  return (
    <div style={{ display: 'flex', gap: 4 }} aria-label={`${stars} wanted stars`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{
          fontSize: 18,
          color: i <= stars ? '#ffd700' : 'rgba(255,255,255,0.2)',
          textShadow: i <= stars ? '0 0 8px rgba(255,215,0,0.8)' : 'none',
        }}>★</span>
      ))}
    </div>
  );
}

export function HealthBar({ health }) {
  const pct = Math.max(0, Math.min(100, health));
  const color = pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444';
  return (
    <div style={{ width: 120, height: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
    </div>
  );
}

// Minimap: top-down canvas showing player, vehicles, cops, mission marker
export function Minimap({ player, vehicles, cops, missionMarker, worldSize = 400 }) {
  const canvasRef = useRef(null);
  const size = 140;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scale = size / worldSize;

    // Background
    ctx.fillStyle = 'rgba(10,14,20,0.85)';
    ctx.fillRect(0, 0, size, size);

    const toMap = (x, z) => ({
      x: size / 2 + (x - player.x) * scale,
      y: size / 2 + (z - player.z) * scale,
    });

    // Mission marker
    if (missionMarker) {
      const m = toMap(missionMarker.x, missionMarker.z);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(Math.max(6, Math.min(size - 6, m.x)), Math.max(6, Math.min(size - 6, m.y)), 5, 0, 7);
      ctx.fill();
    }

    // Vehicles (skip the one player is in)
    ctx.fillStyle = '#60a5fa';
    for (const v of vehicles || []) {
      if (v.driver) continue;
      const p = toMap(v.x, v.z);
      if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    // Cops
    ctx.fillStyle = '#3b82f6';
    for (const c of cops || []) {
      const p = toMap(c.x, c.z);
      if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, 7);
      ctx.fill();
    }

    // Player (center, rotated triangle)
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(Math.atan2(player.vx || 0, player.vz || 1));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  });

  return (
    <canvas
      ref={canvasRef}
      width={size} height={size}
      style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)' }}
      aria-label="Minimap"
    />
  );
}

export function Speedometer({ speedKmh }) {
  return (
    <div style={{
      fontSize: 28, fontWeight: 800, color: '#fff',
      fontVariantNumeric: 'tabular-nums',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
    }}>
      {Math.round(speedKmh)}
      <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>km/h</span>
    </div>
  );
}

export function MissionTracker({ mission }) {
  if (!mission || mission.state !== 'active') return null;
  const obj = mission.objectives[mission.currentObjective];
  return (
    <div style={{
      background: 'rgba(0,0,0,0.6)', borderLeft: '3px solid #facc15',
      padding: '8px 12px', borderRadius: '0 8px 8px 0', maxWidth: 260,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15', letterSpacing: 1 }}>{mission.title}</div>
      {obj && <div style={{ fontSize: 13, color: '#fff', marginTop: 4 }}>{obj.label}</div>}
      {mission.timer > 0 && (
        <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>
          {Math.max(0, Math.ceil(mission.timer - mission.elapsed))}s left
        </div>
      )}
    </div>
  );
}

// Touch controls: left joystick + right buttons.
// bottomLift (px, default 20 = the original placement) raises both the
// joystick and the buttons above the launcher's bottom chrome — Mega
// City passes a radio-aware lift so the action button can never collide
// with the Nexus Radio dock chip / collapsed bar (demo fix, 2026-10-15).
// The safe-area inset is always added on top of the lift.
export function TouchControls({ input, onAction, visible, bottomLift = 20 }) {
  if (!visible) return null;
  const lift = Number.isFinite(bottomLift) && bottomLift >= 0 ? bottomLift : 20;
  const btn = {
    width: 64, height: 64, borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'none', userSelect: 'none',
  };
  return (
    <>
      {/* Joystick */}
      <div
        id="gta-joystick"
        style={{
          position: 'absolute', left: 20,
          bottom: `calc(${lift}px + env(safe-area-inset-bottom))`,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
          touchAction: 'none',
        }}
      />
      {/* Buttons */}
      <div style={{
        position: 'absolute', right: 20,
        bottom: `calc(${lift}px + env(safe-area-inset-bottom))`,
        display: 'flex', gap: 12,
      }}>
        <button
          style={btn}
          onTouchStart={(e) => { e.stopPropagation(); input.touch.jump = true; input.touch.handbrake = true; }}
          aria-label="Jump / handbrake"
        >⤒</button>
        <button
          style={btn}
          onTouchStart={(e) => { e.stopPropagation(); input.touch.action = true; if (onAction) onAction(); }}
          aria-label="Enter / exit vehicle"
        >E</button>
      </div>
    </>
  );
}
