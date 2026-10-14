// app/babel/page-gta.jsx — BABEL GTA: realistic tower district.
// Walk, drive, wanted system, missions. Vault door at the tower base
// routes to Miles' real vault page. New GTA experience, parallel to page.jsx.

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createGTAScene } from './gta-scene';
import { WantedStars, HealthBar, Minimap, Speedometer, MissionTracker, TouchControls } from '@/lib/gta/hud';
import CharacterPicker from '@/components/characters/CharacterPicker';

export default function BabelGTAPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const router = useRouter();
  const [hud, setHud] = useState(null);
  const [msg, setMsg] = useState('Welcome to BABEL. WASD to walk, E to enter cars. The vault door waits at the tower base.');
  const [missions, setMissions] = useState([]);
  const [isTouch, setIsTouch] = useState(false);
  const [vaultNear, setVaultNear] = useState(false);

  useEffect(() => {
    setIsTouch('ontouchstart' in window);
    document.title = 'BABEL — GTA';

    const scene = createGTAScene(canvasRef.current, {
      onEvent: (e) => {
        if (e.type === 'hud') {
          setHud(e);
          setVaultNear(!!e.vaultNear);
        } else if (e.type === 'enter_vehicle') {
          setMsg('You took the car. The cops noticed.');
        } else if (e.type === 'exit_vehicle') {
          setMsg('On foot.');
        } else if (e.type === 'vault_enter') {
          router.push('/babel/vault');
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
  }, [router]);

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
        <div style={{ color: '#d4a24e', fontWeight: 700, fontSize: 16 }}>${hud?.money || 0}</div>
      </div>

      {/* Minimap top-right */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, pointerEvents: 'none' }}>
        {hud && (
          <Minimap
            player={hud.player}
            vehicles={hud.vehicles}
            cops={hud.cops}
            missionMarker={hud.missionMarker}
            worldSize={600}
          />
        )}
      </div>

      {/* Mission tracker */}
      <div style={{ position: 'absolute', top: 180, left: 16, zIndex: 10, pointerEvents: 'none' }}>
        <MissionTracker mission={hud?.mission} />
      </div>

      {/* Character picker — walk as your character (Wave 1) */}
      <CharacterPicker
        surface="babel"
        accent="#d4a24e"
        style={{ top: 180, right: 16 }}
        onPick={(id) => sceneRef.current?.setWalkerCharacter(id)}
      />

      {/* Speedometer (driving) */}
      {hud?.vehicle && (
        <div style={{ position: 'absolute', bottom: 'calc(24px + env(safe-area-inset-bottom))', right: 24, zIndex: 10, pointerEvents: 'none' }}>
          <Speedometer speedKmh={Math.abs(hud.vehicle.speed) * 3.6} />
        </div>
      )}

      {/* Vault door prompt */}
      {vaultNear && !hud?.player?.inVehicle && (
        <div style={{
          position: 'absolute', bottom: 'calc(70px + env(safe-area-inset-bottom))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 11, pointerEvents: 'none',
          background: 'rgba(20,16,8,0.85)', border: '1px solid rgba(212,162,78,0.5)',
          color: '#d4a24e', padding: '10px 20px', borderRadius: 8,
          fontSize: 14, fontWeight: 700, letterSpacing: 1, textAlign: 'center',
          boxShadow: '0 0 24px rgba(212,162,78,0.3)',
        }}>
          ◆ Press E to enter Miles&apos; vault
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
              background: m.state === 'complete' ? 'rgba(212,162,78,0.2)' : 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(212,162,78,0.3)', borderRadius: 8,
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
          border: '1px solid rgba(212,162,78,0.3)', borderRadius: 8,
          color: '#d4a24e', fontSize: 12, cursor: 'pointer',
          fontWeight: 700, letterSpacing: 1,
        }}
      >
        EXIT BABEL
      </button>

      {/* Back to classic tower */}
      <button
        onClick={() => router.push('/babel?classic=1')}
        style={{
          position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, padding: '6px 12px', background: 'transparent',
          border: 'none', borderRadius: 8,
          color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Classic tower view
      </button>

      {/* Touch controls */}
      <TouchControls input={sceneRef.current?.input} visible={isTouch} />
    </main>
  );
}
