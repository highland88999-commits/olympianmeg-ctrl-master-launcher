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
import { LightCycle, TrailMesh } from './scene';
import { buildTrackData, advanceBot, botPose } from './ai';
import { lateralOffset, arclengthAt } from '../../lib/shadow-realm/bump';

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
  // Bump mode: the rendered pose adds the decaying shove impulse, and an
  // eliminated bot hides (it burned in the flame).
  // LETHAL TRAILS: a dissolving bot (deadT > 0) flickers like the player.
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (bot.eliminated) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const pose = botPose(bot, trackData);
    g.position.set(pose.x + (bot.shoveX || 0), 0.06, pose.z + (bot.shoveZ || 0));
    g.rotation.y = pose.heading;
    // respawn grace blink; trail-death dissolve: rapid strobe.
    if (bot.deadT > 0) {
      g.visible = Math.floor(performance.now() / 33) % 2 === 0;
    } else if (bot.invulnT > 0 || (bot.trailImmuneT || 0) > 0) {
      g.visible = Math.floor(performance.now() / 125) % 2 === 0;
    }
  });
  return (
    <group ref={group}>
      <LightCycle scheme={scheme} bikeRef={undefined} />
      <NameSprite name={bot.name} color={bot.color} />
    </group>
  );
}

function BotTrail({ bot }) {
  // The bot's lethal trail, rendered at full length with age dissolve.
  return <TrailMesh trailGetter={() => bot.trail} color={bot.color} />;
}

export default function Bots({ track, botsRef, running, hudRef, maxSpeed, raceLaps, bump, playerTrailRef, trailsLethal }) {
  const trackData = useMemo(
    () => buildTrackData(track, { maxSpeed, raceLaps, flame: bump ? track?.flame : undefined }),
    [track, maxSpeed, raceLaps, bump]
  );
  const bots = botsRef.current || [];
  // Sim clock for trail timestamps (seconds). Advanced in the frame loop.
  const clock = useRef(0);

  // Advance all bots in one frame callback (one useFrame total, not per
  // bot) — ~a handful of trig ops per bot per frame. Player progress in
  // lap units comes from the scene's hudRef; defaults to 0 before the HUD
  // writes. In bump mode the bots also get the player's track position so
  // aggressive ones can steer to shove.
  // LETHAL TRAILS: each bot records its trail; rival trails (player +
  // other bots) drive avoidance + the death check when trailsLethal.
  useFrame((state, rawDt) => {
    const list = botsRef.current || [];
    if (!list.length) return;
    const dt = Math.min(rawDt, 0.05);
    clock.current += dt;
    const now = clock.current;
    const hud = hudRef && hudRef.current;
    const playerProgress =
      hud && hud.lapsTotal > 0
        ? Math.max(1, hud.lap || 1) - 1 + (hud.progress || 0)
        : 0;
    let bumpCtx = null;
    if (bump && trackData.flame && hud && Number.isFinite(hud.x)) {
      const ppos = { x: hud.x, z: hud.z };
      bumpCtx = {
        playerS: arclengthAt(ppos, trackData),
        playerOffset: lateralOffset(ppos, trackData.pts, trackData.flame),
        flame: trackData.flame,
      };
    }
    // Player trail for the bots' rival list (lethal to them, never to self).
    const playerTrail = playerTrailRef && playerTrailRef.current;
    if (running) {
      for (const bot of list) {
        // Record this bot's trail from its current pose (before advancing,
        // so the point matches the rendered position).
        if (!bot.eliminated && bot.deadT <= 0 && (bot.speed || 0) > 1 && bot.trail) {
          const pose = botPose(bot, trackData);
          bot.trail.record(pose.x, pose.z, now);
        }
        // Build the rival list: player + every OTHER bot.
        let rivalTrails = null;
        if (trailsLethal) {
          rivalTrails = [];
          if (playerTrail && playerTrail.length >= 2) {
            rivalTrails.push({ trail: playerTrail, name: 'YOU' });
          }
          for (const other of list) {
            if (other === bot || other.eliminated || !other.trail || other.trail.length < 2) continue;
            rivalTrails.push({ trail: other.trail, name: other.name || 'RIVAL' });
          }
        }
        advanceBot(bot, dt, trackData, playerProgress, bumpCtx, rivalTrails, now);
      }
      // Prune bot trails on a ~1s cadence (cheap).
      if (!Bots._pruneT || now - Bots._pruneT > 1) {
        Bots._pruneT = now;
        for (const bot of list) {
          if (bot.trail) bot.trail.prune(now);
        }
      }
    }
  });

  return (
    <group>
      {bots.map((bot) => (
        <BotRig key={bot.name} bot={bot} trackData={trackData} />
      ))}
      {/* Lethal-trail ribbons, one per bot. */}
      {bots.map((bot) => (
        <BotTrail key={'trail-' + bot.name} bot={bot} />
      ))}
    </group>
  );
}
