// app/shadow-realm/Bots.jsx — VS AI renderer for SHADOW REALM races.
//
// Renders each bot as the shared LightCycle mesh (exported from scene.jsx —
// NOT duplicated) in the bot's neon color, plus one cheap floating name
// sprite per bot (canvas texture, built once per bot).
//
// Advancement happens here in a single useFrame over the shared botsRef —
// pure parametric math from ai.js (no physics bodies, tiny per-frame cost).
// Runs only while `running` is true. The player bike is untouched: AI never
// writes inputRef and never fights player input.

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LightCycle } from './scene';
import { buildTrackData, advanceBot, botPose } from './ai';

// One canvas-texture name plate per bot — drawn once, never per frame.
function NameSprite({ name, color }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = '700 32px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 14;
    g.fillStyle = color;
    g.fillText(name, 128, 34);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, [name, color]);

  useEffect(() => () => tex.dispose(), [tex]);

  return (
    <sprite position={[0, 2.7, 0]} scale={[7, 1.75, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}

function BotRig({ bot, trackData }) {
  const group = useRef();
  const scheme = useMemo(
    () => ({ primary: bot.color, secondary: bot.color, trail: bot.color }),
    [bot.color]
  );
  // Pose this bot from its parametric state every frame. The parent Bots
  // advances the state; posing here keeps the per-bot work in one place.
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const pose = botPose(bot, trackData);
    g.position.set(pose.x, 0.06, pose.z);
    g.rotation.y = pose.heading;
  });
  return (
    <group ref={group}>
      <LightCycle scheme={scheme} bikeRef={undefined} />
      <NameSprite name={bot.name} color={bot.color} />
    </group>
  );
}

export default function Bots({ track, botsRef, running, hudRef, maxSpeed, raceLaps }) {
  const trackData = useMemo(
    () => buildTrackData(track, { maxSpeed, raceLaps }),
    [track, maxSpeed, raceLaps]
  );
  const bots = botsRef.current || [];

  // Advance all bots in one frame callback (one useFrame total, not per
  // bot) — ~a handful of trig ops per bot per frame. Player progress in
  // lap units comes from the scene's hudRef; defaults to 0 before the HUD
  // writes.
  useFrame((state, rawDt) => {
    const list = botsRef.current || [];
    if (!list.length) return;
    const hud = hudRef && hudRef.current;
    const playerProgress =
      hud && hud.lapsTotal > 0
        ? Math.max(1, hud.lap || 1) - 1 + (hud.progress || 0)
        : 0;
    if (running) {
      const dt = Math.min(rawDt, 0.05);
      for (const bot of list) advanceBot(bot, dt, trackData, playerProgress);
    }
  });

  return (
    <group>
      {bots.map((bot) => (
        <BotRig key={bot.name} bot={bot} trackData={trackData} />
      ))}
    </group>
  );
}
