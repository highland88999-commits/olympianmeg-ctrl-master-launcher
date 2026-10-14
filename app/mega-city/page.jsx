// app/mega-city/page.jsx — Mega City GTA: realistic 3D open world.
// Walk, drive, ride the Line One subway, wanted system, missions.

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createGTAScene } from './gta-scene';
import { WantedStars, HealthBar, Minimap, Speedometer, MissionTracker, TouchControls } from '@/lib/gta/hud';
import CharacterPicker from '@/components/characters/CharacterPicker';
import { MISSION_STATE } from '@/lib/gta/missions';

export default function MegaCityPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const router = useRouter();
  const [hud, setHud] = useState(null);
  const [msg, setMsg] = useState('Welcome to Mega City. WASD to walk, E to enter cars.');
  const [missions, setMissions] = useState([]);
  const [isTouch, setIsTouch] = useState(false);
  const [subwayRide, setSubwayRide] = useState(null); // riding overlay data

  useEffect(() => {
    setIsTouch('ontouchstart' in window);
    document.title = 'Mega City — GTA';

    const scene = createGTAScene(canvasRef.current, {
      onEvent: (e) => {
        if (e.type === 'hud') {
          setHud(e);
          if (!e.subway) setSubwayRide(null);
        } else if (e.type === 'enter_vehicle') {
          setMsg('You took the car. The cops noticed.');
        } else if (e.type === 'exit_vehicle') {
          setMsg('On foot.');
        } else if (e.type === 'busted') {
          setMsg(`Busted! You lost $50. Money: $${e.money}`);
        } else if (e.type === 'mission_start') {
          setMsg(`${e.mission.title}: ${e.mission.briefing}`);
        } else if (e.type === 'mission_complete') {
          setMsg(`Mission complete! +$${e.reward}. Total: $${e.money}`);
        } else if (e.type === 'mission_failed') {
          setMsg(`Mission failed: ${e.reason}`);
        } else if (e.type === 'objective_complete') {
          setMsg(`Objective done: ${e.objective.label}`);
        } else if (e.type === 'subway_prompt') {
          if (e.text) setMsg(e.text);
        } else if (e.type === 'subway_enter') {
          setMsg(`Welcome to ${e.station} station. The train is coming.`);
        } else if (e.type === 'subway_board') {
          setMsg(`Aboard Line One at ${e.station}.`);
        } else if (e.type === 'subway_ride') {
          setSubwayRide(e);
        } else if (e.type === 'subway_platform') {
          setSubwayRide(null);
          setMsg(`You stepped off at ${e.station}. Green stairs go back to the street.`);
        } else if (e.type === 'subway_surface') {
          setSubwayRide(null);
          setMsg(`Back on the street near ${e.station}.`);
        }
      },
    });
    sceneRef.current = scene;
    scene.start();
    setMissions(scene.getMissions());

    // Mouse camera
    let dragging = false, lx = 0, ly = 0;
    const onDown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      scene.setCamYaw(scene.getCamYaw() - dx * 0.005);
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = () => { dragging = false; };
    canvasRef.current.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // Touch camera + joystick
    let touchCleanup = null;
    if ('ontouchstart' in window) {
      const joyEl = document.getElementById('gta-joystick');
      if (joyEl) {
        const bound = scene.input.bindTouch(joyEl, (dx) => {
          scene.setCamYaw(scene.getCamYaw() - dx * 0.008);
        });
        touchCleanup = bound.cleanup;
      }
    }

    return () => {
      scene.destroy();
      canvasRef.current?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (touchCleanup) touchCleanup();
    };
  }, []);

  const startMission = useCallback((id) => {
    sceneRef.current?.startMission(id);
  }, []);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* HUD top-left: wanted + health + money */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        <WantedStars stars={hud?.wanted || 0} />
        <HealthBar health={hud?.player?.health || 100} />
        <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16 }}>${hud?.money || 0}</div>
      </div>

      {/* Minimap top-right */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, pointerEvents: 'none' }}>
        {hud && (
          <Minimap
            player={hud.player}
            vehicles={hud.vehicles}
            cops={hud.cops}
            missionMarker={hud.missionMarker}
          />
        )}
      </div>

      {/* Mission tracker */}
      <div style={{ position: 'absolute', top: 180, left: 16, zIndex: 10, pointerEvents: 'none' }}>
        <MissionTracker mission={hud?.mission} />
      </div>

      {/* Character picker — walk as your character (Wave 1) */}
      <CharacterPicker
        surface="mega-city"
        style={{ top: 180, right: 16 }}
        onPick={(id) => sceneRef.current?.setWalkerCharacter(id)}
      />

      {/* Speedometer (driving) */}
      {hud?.vehicle && (
        <div style={{ position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', right: 24, zIndex: 10, pointerEvents: 'none' }}>
          <Speedometer speedKmh={Math.abs(hud.vehicle.speed) * 3.6} />
        </div>
      )}

      {/* Message bar */}
      <div style={{
        position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 20px',
        borderRadius: 8, fontSize: 14, maxWidth: '90vw', textAlign: 'center',
      }}>
        {msg}
      </div>

      {/* Missions menu */}
      <div style={{ position: 'absolute', bottom: 'calc(80px + env(safe-area-inset-bottom))', left: 16, zIndex: 10 }}>
        {missions.filter(m => m.state !== 'active').map(m => (
          <button
            key={m.id}
            onClick={() => startMission(m.id)}
            disabled={m.state === 'complete'}
            style={{
              display: 'block', marginBottom: 8, padding: '10px 16px',
              background: m.state === 'complete' ? 'rgba(74,222,128,0.2)' : 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
              color: '#fff', fontSize: 13, cursor: 'pointer',
              opacity: m.state === 'complete' ? 0.5 : 1,
            }}
          >
            {m.state === 'complete' ? '✓ ' : ''}{m.title} — ${m.reward}
          </button>
        ))}
      </div>

      {/* Exit */}
      <button
        onClick={() => router.push('/')}
        style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, padding: '8px 16px', background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
          color: '#fff', fontSize: 12, cursor: 'pointer',
        }}
      >
        EXIT CITY
      </button>

      {/* Touch controls */}
      <TouchControls input={sceneRef.current?.input} visible={isTouch} />

      {/* Subway riding overlay */}
      {subwayRide && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(8,10,16,0.88)', border: '1px solid rgba(255,204,51,0.4)',
          borderRadius: 12, padding: '14px 22px', textAlign: 'center', minWidth: 260,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ color: '#ffd700', fontSize: 20, fontWeight: 900 }}>Ω</span>
            <span style={{ color: '#ffcc33', fontWeight: 800, fontSize: 15, letterSpacing: 2 }}>
              🚇 LINE ONE
            </span>
          </div>
          <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginTop: 8 }}>
            {subwayRide.mode === 'dwell' && subwayRide.atStation
              ? subwayRide.atStation
              : `Next stop: ${subwayRide.nextStop || '—'}`}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>
            {subwayRide.mode === 'dwell'
              ? 'Doors open — press E to step off'
              : 'Riding underground — sit tight'}
          </div>
        </div>
      )}

      {/* Golden Omega mark */}
      <div style={{
        position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', left: 16,
        zIndex: 10, pointerEvents: 'none',
        color: '#ffd700', fontSize: 22, fontWeight: 900, opacity: 0.85,
        textShadow: '0 0 10px rgba(255,215,0,0.6)',
      }} aria-label="Omega brand">Ω</div>
    </main>
  );
}
