// app/truman/page.jsx — Truman GTA: realistic 3D suburban open world.
// The perfect town, now explorable on foot and by car.

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createTrumanGTAScene } from './gta-scene';
import { WantedStars, HealthBar, Minimap, Speedometer, MissionTracker, TouchControls } from '@/lib/gta/hud';
import CharacterPicker from '@/components/characters/CharacterPicker';

export default function TrumanPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const router = useRouter();
  const [hud, setHud] = useState(null);
  const [msg, setMsg] = useState('Welcome to Truman. Everything is perfect. WASD to walk, E to enter cars.');
  const [missions, setMissions] = useState([]);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch('ontouchstart' in window);
    document.title = 'Truman — GTA';

    const scene = createTrumanGTAScene(canvasRef.current, {
      onEvent: (e) => {
        if (e.type === 'hud') {
          setHud(e);
        } else if (e.type === 'enter_vehicle') {
          setMsg('You took the car. That wasn\'t in the script.');
        } else if (e.type === 'exit_vehicle') {
          setMsg('On foot.');
        } else if (e.type === 'busted') {
          setMsg(`Caught! Back to the start. Money: $${e.money}`);
        } else if (e.type === 'mission_start') {
          setMsg(`${e.mission.title}: ${e.mission.briefing}`);
        } else if (e.type === 'mission_complete') {
          setMsg(`Done! +$${e.reward}. Total: $${e.money}`);
        } else if (e.type === 'mission_failed') {
          setMsg(`Failed: ${e.reason}`);
        } else if (e.type === 'objective_complete') {
          setMsg(`Done: ${e.objective.label}`);
        }
      },
    });
    sceneRef.current = scene;
    scene.start();
    setMissions(scene.getMissions());

    let dragging = false, lx = 0, ly = 0;
    const onDown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const onMove = (e) => {
      if (!dragging) return;
      scene.setCamYaw(scene.getCamYaw() - (e.clientX - lx) * 0.005);
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = () => { dragging = false; };
    canvasRef.current.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

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

      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <WantedStars stars={hud?.wanted || 0} />
        <HealthBar health={hud?.player?.health || 100} />
        <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16 }}>${hud?.money || 0}</div>
      </div>

      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, pointerEvents: 'none' }}>
        {hud && <Minimap player={hud.player} vehicles={hud.vehicles} cops={hud.cops} missionMarker={hud.missionMarker} worldSize={500} />}
      </div>

      <div style={{ position: 'absolute', top: 180, left: 16, zIndex: 10, pointerEvents: 'none' }}>
        <MissionTracker mission={hud?.mission} />
      </div>

      {/* Character picker — walk as your character (Wave 1) */}
      <CharacterPicker
        surface="truman"
        style={{ top: 180, right: 16 }}
        onPick={(id) => sceneRef.current?.setWalkerCharacter(id)}
      />

      {hud?.vehicle && (
        <div style={{ position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', right: 24, zIndex: 10, pointerEvents: 'none' }}>
          <Speedometer speedKmh={Math.abs(hud.vehicle.speed) * 3.6} />
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 20px',
        borderRadius: 8, fontSize: 14, maxWidth: '90vw', textAlign: 'center',
      }}>
        {msg}
      </div>

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

      <button
        onClick={() => router.push('/')}
        style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, padding: '8px 16px', background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
          color: '#fff', fontSize: 12, cursor: 'pointer',
        }}
      >
        EXIT TOWN
      </button>

      <TouchControls input={sceneRef.current?.input} visible={isTouch} />

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
