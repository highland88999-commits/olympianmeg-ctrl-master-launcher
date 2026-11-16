'use client';

// THE FLYING DUTCHMAN — 3D naval world.
//
// Crew the Dutchman across a real storm ocean: trim your sails to the
// wind, work the helm, fire full broadsides, sink ghost ships and claim
// their souls to grow your crew. Solo against the damned fleet, or duel
// another captain live over Supabase Realtime.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  makeWorld, spawnWave, stepWorld, makeShip,
  fireBroadside, stepBalls, stepSouls, stepWind, stepShip,
  SHIP, SAILS, reloadTime, waveHeight, clamp, wrapAngle,
  collideIslands, stepChests, sinkDropK,
} from './engine.js';
import { buildShip, buildGhostShip, animateShip, setSkin as setSkinVisual, buildLegendaryShip } from './ship3d.js';
import {
  createOcean, createSky, poseShip,
  createBallPool, createFlashPool, createSplashPool, createSoulPool, createFirePool,
  createKraken, createMegaSoulPool, createGulls, createSeaLife,
} from './sea3d.js';
import { createIslands, createChests, dutchmanNightFactor } from './world3d.js';
// CGI makeover (lib/flying-dutchman/cgi.js): storm sea + sky and ship
// dressing. Additive only — it never edits an existing surface or
// material (the wraps worker owns the wrapped sea metal).
import { createDutchmanStorm, dressShip } from '../../lib/flying-dutchman/cgi.js';
import {
  levelFor, levelStats, SLOT_PRIZES, rollSlotPrize, rollSlotPrizeOwned, slotCanSpin,
  applySlotPrize, prizeToItem, equipStoredPrize, MERCHANT_CATALOGUE, buyUpgrade,
  SKINS, skinAvailable, buySkin, setSkin as setSkinLogic,
  makeSwordDuel, swordDuelTick, swordDuelAction, makePistolDuel, pistolDuelTap,
  DOCK_RANGE, LEGENDARY_SHIPS, unlockShip, makeFleetShip, stepFleetShip, switchCommand,
  STATUS_ICON_SIZE, STATUS_ICON_DEFAULT, clampStatusIconPos, panelPosForIcon,
  isStatusIconTap, loadStatusIconPos, saveStatusIconPos, loadStatusMinimized, saveStatusMinimized,
} from './voyage.js';
import {
  makeVoyageBackpack, loadVoyageBackpack, saveVoyageBackpack, addItem, removeItem,
  findItem, syncCaptainFromBackpack, syncBackpackFromCaptain,
} from './voyage-backpack.js';
import { krakenLife, foeShipLife, lifeLine } from './operators.js';
import { crewWatchLine } from './humanoid-operators.js';
import {
  createDuelRoom, joinDuelRoom, getCaptainId, DuelSync,
  getRoom, setRoomStatus, ROOM_STATUS,
} from './pvp-sync.js';
import { supabase } from '@/lib/supabase';

const BEST_KEY = 'dutchman-best';
const SAIL_ORDER = [SAILS.FULL, SAILS.BATTLE, SAILS.FURLED];
const SAIL_LABEL = { [SAILS.FULL]: 'FULL SAIL', [SAILS.BATTLE]: 'BATTLE SAIL', [SAILS.FURLED]: 'FURLED' };

function getBest() {
  try { return Number(window.localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Menu / waiting / game-over screens
// ---------------------------------------------------------------------------

function MenuScreen({ best, joinCode, setJoinCode, onSolo, onCreate, onJoin, duelError }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#020608]/95 px-6 text-center">
      <p className="text-[11px] tracking-[0.5em] text-emerald-300/70">THE CURSED SEA</p>
      <h1 className="text-4xl font-black tracking-wide text-emerald-100" style={{ textShadow: '0 0 24px rgba(0,255,160,0.45)' }}>
        THE FLYING<br />DUTCHMAN
      </h1>
      <p className="max-w-sm text-sm text-zinc-400">
        Crew the Dutchman. Sail the storm. Sink ghost ships with your broadsides
        and claim their souls to man your guns.
      </p>
      {best > 0 && <p className="text-xs text-amber-300/80">BEST VOYAGE — {best} SOULS</p>}
      <button
        type="button" onClick={onSolo}
        className="w-64 rounded-xl bg-emerald-500/90 py-4 text-base font-black tracking-[0.2em] text-black hover:bg-emerald-400"
      >
        ⚓ SOLO VOYAGE
      </button>
      <div className="mt-2 flex w-64 flex-col gap-2 border-t border-zinc-800 pt-4">
        <p className="text-[11px] tracking-[0.3em] text-zinc-500">DUEL ANOTHER CAPTAIN</p>
        <button
          type="button" onClick={onCreate}
          className="rounded-xl border border-red-400/60 bg-red-950/40 py-3 text-sm font-black tracking-[0.2em] text-red-200 hover:bg-red-900/50"
        >
          ⚔ CREATE DUEL
        </button>
        <div className="flex gap-2">
          <input
            value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="CODE" aria-label="Duel code"
            className="w-24 rounded-lg border border-zinc-700 bg-black/60 px-3 py-3 text-center text-lg font-black tracking-[0.3em] text-zinc-100"
          />
          <button
            type="button" onClick={onJoin}
            className="flex-1 rounded-xl border border-zinc-600 bg-zinc-800/60 py-3 text-sm font-black tracking-[0.2em] text-zinc-100 hover:bg-zinc-700/60"
          >
            JOIN
          </button>
        </div>
        {duelError && <p className="text-xs text-red-300">{duelError}</p>}
      </div>
      <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-zinc-600">
        Helm with the left stick · trim sails for the wind · broadsides with PORT / STBD.
        Running before the wind is fastest — never sail straight into it.
      </p>
    </div>
  );
}

function WaitingScreen({ code, note, onCancel }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#020608]/95 px-6 text-center">
      <p className="text-[11px] tracking-[0.5em] text-red-300/70">DUEL LOBBY</p>
      <p className="text-sm text-zinc-400">Give this code to the rival captain:</p>
      <p className="rounded-xl border border-red-400/40 bg-black/60 px-8 py-4 text-4xl font-black tracking-[0.5em] text-red-100">
        {code}
      </p>
      <p className="text-sm text-zinc-500">{note || 'Waiting for the rival to board…'}</p>
      <button
        type="button" onClick={onCancel}
        className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300"
      >
        ABANDON DUEL
      </button>
    </div>
  );
}

function GameOverScreen({ over, onAgain, onMenu }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
      <p className="text-5xl">{over.won ? '👑' : '☠'}</p>
      <h2 className="text-3xl font-black text-zinc-100">{over.title}</h2>
      <p className="max-w-xs text-sm text-zinc-400">{over.subtitle}</p>
      <div className="flex gap-6 text-center">
        <div><p className="text-2xl font-black text-emerald-300">{over.souls}</p><p className="text-[10px] tracking-widest text-zinc-500">SOULS</p></div>
        <div><p className="text-2xl font-black text-red-300">{over.sunk}</p><p className="text-[10px] tracking-widest text-zinc-500">SHIPS SUNK</p></div>
        {over.wave > 0 && <div><p className="text-2xl font-black text-amber-300">{over.wave}</p><p className="text-[10px] tracking-widest text-zinc-500">WAVE</p></div>}
      </div>
      {over.best && <p className="text-xs text-amber-300/80">NEW BEST VOYAGE</p>}
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={onAgain} className="rounded-xl bg-emerald-500/90 px-6 py-3 text-sm font-black tracking-widest text-black">
          SAIL AGAIN
        </button>
        <button type="button" onClick={onMenu} className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300">
          MENU
        </button>
      </div>
    </div>
  );
}

function PanelShell({ title, onClose, children }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-zinc-700 bg-[#04141a]/95 p-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black tracking-widest text-emerald-100">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-bold text-zinc-300">CLOSE ✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MerchantPanel({ snap, onBuy, onBuySkin, onEquipSkin, onClose }) {
  const up = snap.upgrades || {};
  const rankOf = (id) => (id === 'cannon' ? (up.cannons || 0) : id === 'hull' ? (up.hull || 0) : id === 'shieldcap' ? (up.shieldcap || 0) : (up.repair || 0));
  const allSkins = [{ id: 'dutchman', name: 'Flying Dutchman', unlockLevel: 1, cost: 0 }, ...SKINS];
  return (
    <PanelShell title="🛒 MERCHANT" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-400">💀 Your souls: <span className="font-black text-amber-200">{snap.souls}</span></p>
      <div className="flex flex-col gap-2">
        {MERCHANT_CATALOGUE.map((m) => {
          const rank = rankOf(m.id);
          const maxed = rank >= m.max;
          const afford = snap.souls >= m.cost;
          return (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-100">{m.name} <span className="text-[10px] text-zinc-500">({rank}/{m.max})</span></p>
                <p className="text-[11px] text-zinc-500">{m.desc}</p>
                <p className="text-[11px] text-amber-300">💀 {m.cost} souls</p>
              </div>
              <button
                type="button" disabled={maxed || !afford} onClick={() => onBuy(m.id)}
                className="flex-none rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-black text-black disabled:opacity-40"
              >
                {maxed ? 'MAXED' : 'BUY'}
              </button>
            </div>
          );
        })}
      </div>
      <h3 className="mb-2 mt-4 text-xs font-black tracking-[0.25em] text-zinc-400">SKINS</h3>
      <div className="flex flex-col gap-2">
        {allSkins.map((s) => {
          const owned = (snap.skinsOwned || []).includes(s.id);
          const equipped = snap.skin === s.id;
          const locked = snap.level < s.unlockLevel;
          const afford = snap.souls >= s.cost;
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-100">{s.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {locked ? `🔒 unlocks at level ${s.unlockLevel}` : s.cost > 0 ? `💀 ${s.cost} souls` : 'Your colours'}
                </p>
              </div>
              {equipped ? (
                <span className="flex-none rounded-lg border border-emerald-400/60 px-3 py-2 text-xs font-black text-emerald-300">WORN</span>
              ) : owned ? (
                <button type="button" onClick={() => onEquipSkin(s.id)} className="flex-none rounded-lg bg-sky-500/90 px-3 py-2 text-xs font-black text-black">EQUIP</button>
              ) : (
                <button
                  type="button" disabled={locked || !afford} onClick={() => onBuySkin(s.id)}
                  className="flex-none rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-black text-black disabled:opacity-40"
                >
                  BUY
                </button>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function SlotPanel({ snap, prize, confirm, onSpin, onConfirmSpin, onCancelConfirm, onEquipPrize, onStorePrize, onClose }) {
  const canSpin = slotCanSpin({ megaSouls: snap.megaSouls });
  return (
    <PanelShell title="🎰 SLOT MACHINE" onClose={onClose}>
      <p className="mb-2 text-xs text-zinc-400">1 mega soul per spin · ✨ Your mega souls: <span className="font-black text-amber-200">{snap.megaSouls}</span></p>
      <div className="mb-3 flex flex-col gap-1 rounded-xl border border-zinc-800 bg-black/40 p-3">
        {SLOT_PRIZES.map((p) => (
          <p key={p.id} className="text-[11px] text-zinc-400"><span className="font-bold text-zinc-200">{p.name}</span> — {p.desc}</p>
        ))}
      </div>
      {confirm ? (
        <div className="rounded-xl border border-amber-400/60 bg-amber-950/40 p-3 text-center">
          <p className="mb-3 text-sm font-bold text-amber-100">This spin costs 1 mega soul. Spin?</p>
          <div className="flex gap-2">
            <button type="button" onClick={onConfirmSpin} className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-black text-black">CONFIRM SPIN</button>
            <button type="button" onClick={onCancelConfirm} className="flex-1 rounded-xl border border-zinc-600 py-3 text-sm font-bold text-zinc-300">CANCEL</button>
          </div>
        </div>
      ) : prize ? (
        <div className="rounded-xl border border-emerald-400/60 bg-emerald-950/40 p-3 text-center">
          <p className="text-[10px] tracking-[0.3em] text-emerald-300/70">YOU WON</p>
          <p className="mt-1 text-lg font-black text-emerald-100">{prize.name}</p>
          <p className="text-xs text-zinc-400">{prize.desc}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onEquipPrize(prize)} className="flex-1 rounded-xl bg-emerald-500/90 py-3 text-sm font-black text-black">⚓ EQUIP</button>
            <button type="button" onClick={() => onStorePrize(prize)} className="flex-1 rounded-xl border border-emerald-400/60 bg-black/40 py-3 text-sm font-black text-emerald-200">🎒 STORE TO BACKPACK</button>
          </div>
        </div>
      ) : (
        <button
          type="button" disabled={!canSpin} onClick={onSpin}
          className="w-full rounded-xl bg-amber-400 py-4 text-base font-black tracking-[0.2em] text-black disabled:opacity-40"
        >
          🎰 SPIN — 1 ✨
        </button>
      )}
      {!canSpin && !prize && !confirm && (
        <p className="mt-2 text-center text-[11px] text-zinc-500">Slay the kraken to win mega souls.</p>
      )}
    </PanelShell>
  );
}

function DuelOverlay({ view, onChoose, onSwordAction, onPistolTap, onClose }) {
  const foeLabel = view.foeState === 'telegraph' ? '⚠ INCOMING — PARRY!'
    : view.foeState === 'open' ? 'OPEN — STRIKE NOW!'
    : 'The foe circles…';
  const pips = (n) => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, 3 - n));
  return (
    <PanelShell title="⚔ DUEL" onClose={onClose}>
      {!view.kind && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-zinc-400">Choose your weapon, captain.</p>
          <button type="button" onClick={() => onChoose('sword')} className="rounded-xl bg-red-500/90 py-4 text-base font-black tracking-[0.2em] text-white">🗡 SWORD DUEL</button>
          <button type="button" onClick={() => onChoose('pistol')} className="rounded-xl bg-sky-500/90 py-4 text-base font-black tracking-[0.2em] text-white">🔫 PISTOL DUEL</button>
        </div>
      )}
      {view.kind === 'sword' && (
        <div className="flex flex-col gap-3 text-center">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">YOU <span className="text-red-400">{pips(view.playerHp)}</span></span>
            <span className="text-zinc-300">FOE <span className="text-red-400">{pips(view.foeHp)}</span></span>
          </div>
          <p className="rounded-xl border border-zinc-800 bg-black/40 py-3 text-sm font-bold text-amber-200">{view.phase === 'fight' ? foeLabel : view.phase === 'won' ? '⚔ Victory!' : '⚔ You were cut down…'}</p>
          {view.phase === 'fight' && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onSwordAction('attack')} className="flex-1 rounded-xl bg-red-500/90 py-4 text-sm font-black text-white">⚔ ATTACK</button>
              <button type="button" onClick={() => onSwordAction('parry')} className="flex-1 rounded-xl border border-sky-400/60 bg-sky-950/60 py-4 text-sm font-black text-sky-200">🛡 PARRY</button>
            </div>
          )}
        </div>
      )}
      {view.kind === 'pistol' && (
        <div className="flex flex-col gap-3 text-center">
          <button
            type="button" onClick={onPistolTap} disabled={view.phase !== 'wait'}
            className={`rounded-xl py-8 text-xl font-black tracking-widest ${view.phase === 'wait' && view.now >= view.signalAt ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-200'} disabled:opacity-70`}
          >
            {view.phase === 'wait'
              ? (view.now >= view.signalAt ? '🔫 DRAW!' : 'Wait for it…')
              : view.phase === 'won' ? `🏆 ${view.reaction != null ? `${view.reaction.toFixed(2)} s` : ''} — clean win!` : '💥 Too slow — or too eager.'}
          </button>
          <p className="text-xs text-zinc-500">Tap the moment you see DRAW! — fire early and the foe shoots first.</p>
        </div>
      )}
    </PanelShell>
  );
}

function BackpackPanel({ snap, onEquipItem, onUnlockShip, onCommandShip, onClose }) {
  const ships = [{ id: 'dutchman', name: 'Flying Dutchman', unlock: { level: 1 } }, ...LEGENDARY_SHIPS];
  return (
    <PanelShell title="👻 GHOST VOYAGE PACK" onClose={onClose}>
      <p className="mb-3 text-[11px] text-teal-200/70">Separate from your realm backpack — voyage goods only.</p>
      <div className="mb-3 flex gap-4 text-sm text-zinc-200">
        <span>💀 {snap.souls} souls</span>
        <span>✨ {snap.megaSouls} mega souls</span>
      </div>
      <h3 className="mb-1 text-xs font-black tracking-[0.25em] text-zinc-400">STORED ITEMS</h3>
      {(snap.items || []).length === 0
        ? <p className="mb-3 text-xs text-zinc-500">Nothing stored yet — slot-machine prizes can wait here.</p>
        : (
          <div className="mb-3 flex flex-col gap-2">
            {(snap.items || []).map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-100">{it.name}</p>
                  <p className="text-[11px] text-zinc-500">{it.desc}</p>
                </div>
                {it.kind === 'mega-upgrade' ? (
                  <button type="button" onClick={() => onEquipItem(it)} className="flex-none rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-black text-black">EQUIP</button>
                ) : (
                  <span className="flex-none text-[10px] text-zinc-500">STORED</span>
                )}
              </div>
            ))}
          </div>
        )}
      <h3 className="mb-1 text-xs font-black tracking-[0.25em] text-zinc-400">SKINS OWNED</h3>
      <p className="mb-3 text-xs text-zinc-300">{(snap.skinsOwned || []).join(' · ') || '—'}</p>
      <h3 className="mb-1 text-xs font-black tracking-[0.25em] text-zinc-400">SHIPS &amp; FLEET</h3>
      <div className="flex flex-col gap-2">
        {ships.map((s) => {
          const owned = (snap.shipsOwned || []).includes(s.id);
          const levelMet = snap.level >= s.unlock.level;
          const commanding = snap.commandedShipDefId === s.id;
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-100">{s.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {owned ? (commanding ? '⚓ You command her' : 'Owned — in your fleet') : `🔒 unlocks at level ${s.unlock.level}`}
                </p>
              </div>
              {!owned ? (
                <button type="button" disabled={!levelMet} onClick={() => onUnlockShip(s.id)} className="flex-none rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-black text-black disabled:opacity-40">
                  UNLOCK
                </button>
              ) : !commanding ? (
                <button type="button" onClick={() => onCommandShip(s.id)} className="flex-none rounded-lg bg-sky-500/90 px-3 py-2 text-xs font-black text-black">COMMAND</button>
              ) : (
                <span className="flex-none text-[10px] font-black text-emerald-300">COMMANDING</span>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DutchmanPage() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const pollRef = useRef(null);

  const [screen, setScreen] = useState('menu'); // menu | waiting | game
  const [mode, setMode] = useState('solo');
  const [hud, setHud] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [duelCode, setDuelCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [duelError, setDuelError] = useState('');
  const [waitingNote, setWaitingNote] = useState('');
  const [paused, setPaused] = useState(false);
  const [anchored, setAnchored] = useState(false);
  const [webglFail, setWebglFail] = useState(false);
  const [best, setBest] = useState(0);
  // Voyage panels (solo only): null | 'merchant' | 'duel' | 'slot' | 'backpack'.
  const [panel, setPanel] = useState(null);
  const [slotConfirm, setSlotConfirm] = useState(false);
  const [slotPrize, setSlotPrize] = useState(null);
  const [duelView, setDuelView] = useState({ kind: null, phase: 'fight', foeHp: 3, playerHp: 3, foeState: 'idle', signalAt: 0, now: 0, result: null, reaction: null });
  const [shopSnap, setShopSnap] = useState(null);
  const bpRef = useRef(null);

  // Ship status panel: minimizable to a draggable floating icon.
  // Positions live in the safe-area-padded overlay area, so the
  // default upper-left spot is exactly where the panel used to sit.
  const statusWrapRef = useRef(null);
  const panelRef = useRef(null);
  const [statusMinimized, setStatusMinimized] = useState(() => loadStatusMinimized());
  const [iconPos, setIconPos] = useState(() => loadStatusIconPos() || { ...STATUS_ICON_DEFAULT });
  const [statusArea, setStatusArea] = useState({ width: 390, height: 700 });
  const [panelSize, setPanelSize] = useState({ width: 160, height: 200 });
  const statusDragRef = useRef(null); // { pointerId, startClientX, startClientY, startPos, moved, pos }

  // Snapshot of the live captain + backpack for the shop / slot /
  // backpack panels. Rebuilt on open and after every transaction.
  function snapshotShop() {
    const G = gameRef.current;
    const bp = bpRef.current;
    if (!G || !bp) return null;
    const cap = G.world.captain;
    const p = G.world.player;
    return {
      souls: cap.souls || 0,
      megaSouls: cap.megaSouls || 0,
      level: cap.level || 1,
      skinsOwned: [...(cap.skinsOwned || ['dutchman'])],
      shipsOwned: [...(cap.shipsOwned || ['dutchman'])],
      upgrades: { ...(p.upgrades || {}) },
      items: [...(bp.items || [])],
      skin: p.skin || 'dutchman',
      shipDefId: p.shipDefId || 'dutchman',
      commandedShipDefId: p.shipDefId || 'dutchman',
      krakenKills: cap.krakenKills || 0,
      sinkings: cap.sinkings || 0,
    };
  }

  function refreshShop() { setShopSnap(snapshotShop()); }

  // Persist the live captain back into the durable voyage backpack.
  function saveVoyage() {
    const G = gameRef.current;
    const bp = bpRef.current;
    if (!G || !bp) return;
    syncBackpackFromCaptain(bp, G.world.captain);
    saveVoyageBackpack(bp);
  }

  // Open a voyage panel: the game pauses while it is open (the
  // existing pause mechanism), and restores on close.
  function openPanel(name) {
    const G = gameRef.current;
    if (!G || G.mode !== 'solo' || G.over) return;
    if (G) { G.panelOpen = true; G.paused = true; }
    setPaused(true);
    setSlotConfirm(false);
    setSlotPrize(null);
    setDuelView({ kind: null, phase: 'fight', foeHp: 3, playerHp: 3, foeState: 'idle', signalAt: 0, now: 0, result: null, reaction: null });
    refreshShop();
    setPanel(name);
  }

  function closePanel() {
    const G = gameRef.current;
    if (G) { G.panelOpen = false; G.duel = null; if (!G.manualPause) G.paused = false; }
    setPaused(G ? !!G.paused : false);
    setPanel(null);
    setSlotConfirm(false);
    setSlotPrize(null);
  }

  // -- ashore duels ------------------------------------------------------------
  // Duel timing is anchored at the engine clock (world.t at duel start)
  // plus frame dt accumulated while the duel is open: the game pauses
  // while a panel is open, so world.t itself stands still during a duel
  // and the duel needs its own advancing clock or the foe would never move.
  function updateDuelView() {
    const G = gameRef.current;
    if (!G || !G.duel) return;
    const d = G.duel;
    const now = (G.world.t - d.startT) + d.elapsed;
    const view = {
      kind: d.kind,
      phase: d.duel.phase,
      foeHp: d.duel.foeHp != null ? d.duel.foeHp : 3,
      playerHp: d.duel.playerHp != null ? d.duel.playerHp : 3,
      foeState: d.duel.foeState || 'idle',
      signalAt: d.duel.signalAt || 0,
      now: Math.round(now * 10) / 10,
      result: d.duel.result || null,
      reaction: d.duel.reaction != null ? d.duel.reaction : null,
    };
    const sig = JSON.stringify(view);
    if (G.duelSig !== sig) { G.duelSig = sig; setDuelView(view); }
  }

  function finishDuel() {
    const G = gameRef.current;
    if (!G || !G.duel) return;
    const d = G.duel;
    const cap = G.world.captain;
    if (d.kind === 'sword') {
      if (d.duel.phase === 'won') {
        cap.souls += 3;
        addToast('⚔ Victory! +3 souls');
      } else if (d.duel.phase === 'lost') {
        addToast('⚔ You were cut down — the foe keeps your pride.');
      }
    } else if (d.kind === 'pistol') {
      const res = d.duel;
      if (res.phase === 'won') {
        cap.souls += res.reward;
        if (res.reward >= 3) addToast(`🔫 ${res.reaction.toFixed(2)} s — clean win! +3 souls`);
        else addToast(`🔫 ${res.reaction.toFixed(2)} s — you win, +2 souls`);
      } else if (res.phase === 'lost') {
        addToast(res.result === 'early' ? '🔫 Too eager — you fired early.' : '🔫 Too slow.');
      }
    }
    saveVoyage();
    G.duel = null;
    closePanel();
  }

  function chooseDuel(kind) {
    const G = gameRef.current;
    if (!G) return;
    const seed = (Date.now() % 100000) + (kind === 'sword' ? 7 : 13);
    G.duel = {
      kind,
      duel: kind === 'sword' ? makeSwordDuel(seed) : makePistolDuel(seed),
      startT: G.world.t,
      elapsed: 0,
    };
    G.duelSig = null;
    updateDuelView();
  }

  function duelSwordAction(action) {
    const G = gameRef.current;
    if (!G || !G.duel || G.duel.kind !== 'sword') return;
    const d = G.duel;
    const now = (G.world.t - d.startT) + d.elapsed;
    swordDuelAction(d.duel, action, now);
    updateDuelView();
    if (d.duel.phase !== 'fight') finishDuel();
  }

  function duelPistolTap() {
    const G = gameRef.current;
    if (!G || !G.duel || G.duel.kind !== 'pistol') return;
    const d = G.duel;
    const now = (G.world.t - d.startT) + d.elapsed;
    pistolDuelTap(d.duel, now);
    updateDuelView();
    if (d.duel.phase !== 'wait') finishDuel();
  }

  // -- docking / ashore ----------------------------------------------------------
  function dockAt() {
    const G = gameRef.current;
    if (!G || G.mode !== 'solo' || !G.dockIsland) return;
    const island = G.dockIsland;
    const p = G.world.player;
    if (!p.alive) return;
    G.input.anchored = true;
    setAnchored(true);
    // Walker starts on the shore at the dock side, inside the beach.
    const dx = island.dock.x - island.x, dz = island.dock.z - island.z;
    const dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl;
    const walker = {
      x: island.x + ux * (island.r - 2),
      z: island.z + uz * (island.r - 2),
      heading: Math.atan2(ux, uz),
    };
    // Merchant stall just inside the shore; the slot brazier 8 m along it.
    const merchant = { x: island.x + ux * (island.r - 6), z: island.z + uz * (island.r - 6) };
    const slot = { x: merchant.x + (-uz) * 8, z: merchant.z + ux * 8 };
    // 2–3 duel foes at seeded spots on the island.
    const foes = [];
    const nFoes = 2 + (Math.abs(island.seed || 0) % 2);
    for (let i = 0; i < nFoes; i++) {
      const a = (((island.seed || 0) % 1000) / 1000) * Math.PI * 2 + (i / nFoes) * Math.PI * 2;
      const rr = island.r * (0.35 + 0.15 * (i % 2));
      const fx = island.x + Math.sin(a) * rr;
      const fz = island.z + Math.cos(a) * rr;
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 3.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a0a12, emissive: new THREE.Color(0x400010), emissiveIntensity: 0.6, roughness: 0.8 })
      );
      body.position.y = 1.6;
      mesh.add(body);
      mesh.position.set(fx, 2.5, fz);
      G.scene.add(mesh);
      foes.push({ x: fx, z: fz, mesh });
    }
    G.ashore = { island, walker, foes, merchant, slot };
    G.walker.visible = true;
    G.walker.position.set(walker.x, 2.5, walker.z);
    addToast(`⚓ Ashore at ${island.name || 'the island'} — the crew stretches its legs.`);
  }

  function undock() {
    const G = gameRef.current;
    if (!G || !G.ashore) return;
    for (const f of G.ashore.foes) {
      G.scene.remove(f.mesh);
      disposeGroup(f.mesh);
    }
    G.ashore = null;
    G.walker.visible = false;
    G.input.anchored = false;
    setAnchored(false);
    saveVoyage();
    addToast('⚓ Back under way.');
  }

  // -- merchant / skins ------------------------------------------------------------
  function merchantBuy(id) {
    const G = gameRef.current;
    if (!G) return;
    const r = buyUpgrade(G.world.player, G.world.captain, id);
    const item = MERCHANT_CATALOGUE.find((m) => m.id === id);
    addToast(r.ok ? `⚓ ${item ? item.name : id} fitted.` : `Could not buy: ${r.reason || 'unknown'}.`);
    saveVoyage();
    refreshShop();
  }

  function skinBuy(id) {
    const G = gameRef.current;
    if (!G) return;
    const r = buySkin(G.world.captain, id);
    addToast(r.ok ? (r.alreadyOwned ? 'Already yours.' : 'Skin bought — equip it to wear it.') : `Could not buy: ${r.reason || 'unknown'}.`);
    saveVoyage();
    refreshShop();
  }

  function skinEquip(id) {
    const G = gameRef.current;
    if (!G) return;
    const avail = skinAvailable(G.world.captain, G.world.player, id);
    if (!avail.ok) { addToast(`Cannot wear that skin: ${avail.reason}.`); return; }
    setSkinLogic(G.world.player, id);
    setSkinVisual(G.playerGroup, id);
    G.skinShown = id;
    const name = id === 'dutchman' ? 'Flying Dutchman' : ((SKINS.find((s) => s.id === id) || {}).name || id);
    addToast(`🎨 ${name} colours flying.`);
    saveVoyage();
    refreshShop();
  }

  // -- slot machine ------------------------------------------------------------
  function slotConfirmSpin() {
    const G = gameRef.current;
    if (!G) return;
    const cap = G.world.captain;
    if (!slotCanSpin(cap)) { addToast('No mega souls to spin with.'); setSlotConfirm(false); return; }
    // Exactly one mega soul, deducted here — never again at equip/store.
    cap.megaSouls -= 1;
    G.world.player.megaSouls = cap.megaSouls;
    // Kraken-bane is owned on the ship's upgrades (the captain carries
    // no upgrades field); re-roll it while owned.
    const owned = (G.world.player.upgrades && G.world.player.upgrades.krakenBane) ? ['mega-krakenbane'] : [];
    const prize = rollSlotPrizeOwned(G.world.rng, owned);
    setSlotPrize(prize);
    setSlotConfirm(false);
    saveVoyage();
    refreshShop();
  }

  function slotEquipPrize(prize) {
    const G = gameRef.current;
    if (!G || !prize) return;
    const ok = applySlotPrize(G.world.player, G.world.captain, prize.id);
    addToast(ok ? `⚓ ${prize.name} fitted!` : 'That prize could not be fitted.');
    setSlotPrize(null);
    saveVoyage();
    refreshShop();
  }

  function slotStorePrize(prize) {
    const bp = bpRef.current;
    if (!bp || !prize) return;
    addItem(bp, prizeToItem(prize));
    saveVoyageBackpack(bp);
    addToast('Stored in your Ghost Voyage backpack');
    setSlotPrize(null);
    refreshShop();
  }

  // -- backpack / fleet ----------------------------------------------------------
  function backpackEquipItem(item) {
    const G = gameRef.current;
    const bp = bpRef.current;
    if (!G || !bp) return;
    if (!findItem(bp, item.id)) { addToast('That item is no longer in the pack.'); return; }
    const ok = equipStoredPrize(G.world.player, G.world.captain, item);
    if (ok) {
      removeItem(bp, item.id);
      saveVoyageBackpack(bp);
      addToast(`⚓ ${item.name} fitted!`);
    } else {
      addToast('That item could not be equipped.');
    }
    saveVoyage();
    refreshShop();
  }

  function backpackUnlockShip(shipId) {
    const G = gameRef.current;
    const bp = bpRef.current;
    if (!G || !bp) return;
    const r = unlockShip(G.world.captain, bp, shipId);
    const def = LEGENDARY_SHIPS.find((s) => s.id === shipId);
    const name = def ? def.name : shipId;
    if (r.ok) {
      if (!r.alreadyOwned && !G.world.fleet.some((s) => s.shipDefId === shipId)) {
        const f = makeFleetShip(shipId, G.world.player.x - 40, G.world.player.z - 40);
        if (f) G.world.fleet.push(f);
      }
      addToast(r.alreadyOwned ? 'Already in your fleet.' : `⚓ ${name} joins your fleet!`);
    } else {
      addToast(`Cannot unlock: ${r.reason}.`);
    }
    saveVoyage();
    refreshShop();
  }

  function backpackCommandShip(shipId) {
    const G = gameRef.current;
    if (!G) return;
    if (G.world.player.shipDefId === shipId) { addToast('You already command her.'); return; }
    let entry = G.world.fleet.find((s) => s.shipDefId === shipId);
    if (!entry) {
      // Owned but not sailing with the fleet (e.g. unlocked in a past
      // session before fleet spawning) — launch her, then take command.
      const f = shipId === 'dutchman' ? null : makeFleetShip(shipId, G.world.player.x - 40, G.world.player.z - 40);
      if (!f) { addToast('That ship is not in your fleet.'); return; }
      G.world.fleet.push(f);
      entry = f;
    }
    const r = switchCommand(G.world, entry.id);
    if (r.ok) {
      const name = shipId === 'dutchman' ? 'Flying Dutchman' : ((LEGENDARY_SHIPS.find((s) => s.id === shipId) || {}).name || shipId);
      addToast(`You now command the ${name}.`);
    } else {
      addToast(`Could not take command: ${r.reason || 'unknown'}.`);
    }
    saveVoyage();
    refreshShop();
  }

  useEffect(() => { setBest(getBest()); }, []);

  function addToast(text) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }

  function disposeGroup(grp) {
    grp.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }

  // -- duel lobby ------------------------------------------------------------
  async function doCreate() {
    setDuelError('');
    setWaitingNote('Raising the black flag…');
    try {
      const id = await getCaptainId();
      const room = await createDuelRoom(id);
      const code = room.room_code;
      setDuelCode(code);
      setScreen('waiting');
      setWaitingNote('Waiting for the rival to board…');
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const r = await getRoom(supabase, code);
          const ids = (r && r.player_ids) || [];
          if (ids.length >= 2) {
            clearInterval(pollRef.current); pollRef.current = null;
            await setRoomStatus(supabase, code, ROOM_STATUS.PLAYING);
            startDuelGame(code, true);
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch {
      setDuelError('Could not create a duel room. Check your connection.');
    }
  }

  async function doJoin(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (clean.length !== 6) { setDuelError('Enter the 6-character duel code.'); return; }
    setDuelError('');
    setDuelCode(clean);
    setScreen('waiting');
    setWaitingNote('Boarding the rival’s ship…');
    try {
      const id = await getCaptainId();
      const { error } = await joinDuelRoom(clean, id);
      if (error) { setScreen('menu'); setDuelError(error); return; }
      await setRoomStatus(supabase, clean, ROOM_STATUS.PLAYING);
      startDuelGame(clean, false);
    } catch {
      setScreen('menu');
      setDuelError('Could not join. Check the code and your connection.');
    }
  }

  function cancelWaiting() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setScreen('menu');
    setWaitingNote('');
  }

  // Invite accepts land here with ?code=XXXXXX.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const c = (q.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (c.length === 6) {
        setJoinCode(c);
        doJoin(c);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- game boot ---------------------------------------------------------------
  function startSolo() {
    const world = makeWorld(Date.now() % 1000000);
    spawnWave(world, 1);
    bootGame('solo', world, {});
    setMode('solo');
    setScreen('game');
  }

  async function startDuelGame(code, isHost) {
    const world = makeWorld((Date.now() % 1000000) + (isHost ? 11 : 22));
    const p = world.player;
    if (isHost) { p.x = -80; p.z = 0; p.heading = Math.PI / 2; }
    else { p.x = 80; p.z = 0; p.heading = -Math.PI / 2; }
    const remote = makeShip({ name: 'Rival Captain', crew: 8 });
    remote.x = isHost ? 80 : -80;
    remote.z = 0;
    remote.heading = isHost ? -Math.PI / 2 : Math.PI / 2;

    setWaitingNote('Linking ships…');
    const sync = new DuelSync(code, p.id);
    const { available, error } = await sync.connect({
      onState: (s) => {
        const G = gameRef.current;
        if (G && G.remote) G.remote.target = s;
      },
      onFire: (side) => {
        const G = gameRef.current;
        if (!G || G.over || G.mode !== 'duel') return;
        const rship = G.remote;
        rship.reloadPort = 0; rship.reloadStbd = 0;
        const r = fireBroadside(rship, side === 'port' ? 'port' : 'stbd', G.world.t);
        if (r.fired) {
          G.world.balls.push(...r.balls);
          G.handleEvents([{ type: 'fire', shipId: rship.id, side }]);
        }
      },
      onSunk: () => {
        const G = gameRef.current;
        if (G && !G.over) G.endDuel(true);
      },
    });
    if (!available) {
      sync.disconnect();
      setScreen('menu');
      setDuelError(`Live link failed (${error || 'no signal'}). Duels need a live connection — try a solo voyage.`);
      return;
    }
    bootGame('duel', world, { sync, remote, isHost });
    setMode('duel');
    setScreen('game');
    addToast(isHost ? '⚔ The rival has boarded. Sink them.' : '⚔ Duel! Sink the Dutchman.');
  }

  function bootGame(gameMode, world, extra) {
    // Tear down any previous game first.
    teardown();
    const mount = mountRef.current;
    if (!mount) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setWebglFail(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x06121c, 120, 900);
    const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 0.5, 6000);

    const ocean = createOcean();
    scene.add(ocean.mesh);
    const sky = createSky();
    scene.add(sky.group);
    // Storm CGI layer: cloud dome, visible bolts, foam on the swell,
    // wind-blown spray, fog that closes in with the squall.
    const storm = createDutchmanStorm(scene);

    // The open world: cursed isles + beached treasure.
    const islands = createIslands(scene, world.islands);
    const chests = createChests(scene, world.chests);

    const playerGroup = buildShip();
    playerGroup.userData.setCrew(Math.min(world.player.crew, 12));
    dressShip(playerGroup);
    scene.add(playerGroup);

    const G = {
      mode: gameMode,
      world,
      renderer, scene, camera, ocean, sky, storm, islands, chests,
      playerGroup,
      enemyGroups: new Map(),
      remote: extra.remote || null,
      remoteGroup: null,
      sync: extra.sync || null,
      isHost: !!extra.isHost,
      pools: {
        balls: createBallPool(scene),
        flash: createFlashPool(scene),
        splash: createSplashPool(scene),
        souls: createSoulPool(scene),
        fire: createFirePool(scene),
        kraken: createKraken(scene),
        megaSouls: createMegaSoulPool(scene),
        gulls: createGulls(scene, world.islands),
        seaLife: createSeaLife(scene),
      },
      fleetGroups: new Map(),
      commandedId: null,
      skinShown: null,
      scaleShown: -1,
      nightF: 1,
      lastNightSec: -1,
      ashore: null,
      duel: null,
      panelOpen: false,
      manualPause: false,
      input: { rudder: 0, joy: 0, throttle: 0.5, anchored: false, keys: { left: false, right: false }, sails: SAILS.FULL, fire: null },
      cam: { yaw: 0, pitch: 0.34, dist: 36 },
      acc: 0,
      raf: 0,
      last: performance.now(),
      lastHud: -1,
      lastSent: -1,
      sunkCount: 0,
      paused: false,
      over: false,
      disposed: false,
      crewShown: -1,
      sailsShown: '',
      tmpV: new THREE.Vector3(),
    };
    if (G.remote) {
      G.remoteGroup = buildGhostShip();
      G.remoteGroup.userData.setCrew(Math.min(G.remote.crew, 12));
      dressShip(G.remoteGroup);
      scene.add(G.remoteGroup);
    }
    if (gameMode === 'duel') world.mode = 'duel';
    else world.mode = 'solo';

    // Voyage backpack: the durable store across voyages. The live
    // captain starts from it; purchases / rewards save back to it.
    const bp = loadVoyageBackpack();
    bpRef.current = bp;
    syncCaptainFromBackpack(world.captain, bp);
    world.player.souls = world.captain.souls;
    world.player.megaSouls = world.captain.megaSouls;
    G.bp = bp;

    // Fleet: legendary ships already owned sail with you from the
    // start of the voyage (spawned astern of the Dutchman).
    if (gameMode === 'solo') {
      (bp.shipsOwned || []).forEach((defId, i) => {
        if (defId === 'dutchman') return;
        if (world.fleet.some((s) => s.shipDefId === defId)) return;
        const f = makeFleetShip(defId, world.player.x - Math.sin(world.player.heading) * (60 + i * 30), world.player.z - Math.cos(world.player.heading) * (60 + i * 30));
        if (f) world.fleet.push(f);
      });
    }
    G.commandedId = world.player.shipDefId || 'dutchman';

    // Walker marker: a small glowing figure, hidden until ashore.
    const walker = new THREE.Group();
    const walkerBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x2affc0, emissive: new THREE.Color(0x2affc0), emissiveIntensity: 1.2, roughness: 0.4 })
    );
    walkerBody.position.y = 1.3;
    walker.add(walkerBody);
    const walkerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(42,255,192,0.9)');
        grad.addColorStop(1, 'rgba(42,255,192,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      })(), transparent: true, depthWrite: false,
    }));
    walkerGlow.scale.set(6, 6, 1);
    walkerGlow.position.y = 1.5;
    walker.add(walkerGlow);
    walker.visible = false;
    scene.add(walker);
    G.walker = walker;
    G.foeMarkers = [];

    // Anchor marker: a ⚓ that rides over the bow while anchored, so the
    // anchored state reads in the 3D view, not just on the button.
    const anchorTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = '96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('⚓', 64, 70);
      return new THREE.CanvasTexture(c);
    })();
    const anchorMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: anchorTex, transparent: true, depthWrite: false }));
    anchorMark.scale.set(6, 6, 1);
    anchorMark.visible = false;
    scene.add(anchorMark);
    G.anchorMark = anchorMark;

    // -- events ----------------------------------------------------------------
    G.handleEvents = (events) => {
      let soulsClaimed = 0;
      let firstSoul = null;
      for (const e of events) {
        if (e.type === 'fire') {
          const grp = e.shipId === world.player.id ? G.playerGroup
            : e.shipId === (G.remote && G.remote.id) ? G.remoteGroup
            : G.enemyGroups.get(e.shipId);
          if (grp) {
            for (let i = 0; i < SHIP.cannonsPerSide; i++) {
              grp.userData.muzzle(e.side, i, G.tmpV);
              G.pools.flash.fire(G.tmpV.x, G.tmpV.y, G.tmpV.z);
            }
          }
          if (G.sync && e.shipId === world.player.id) G.sync.sendFire(e.side);
        } else if (e.type === 'splash') {
          G.pools.splash.splash(e.x, e.z, world.t, false);
        } else if (e.type === 'hit') {
          G.pools.splash.splash(e.x, e.z, world.t, true);
        } else if (e.type === 'sunk') {
          G.pools.splash.splash(e.x, e.z, world.t, true);
          const isFleet = (world.fleet || []).some((f) => f.id === e.shipId);
          if (e.shipId === world.player.id) {
            if (G.mode === 'duel') {
              if (G.sync) G.sync.sendSunk();
              // The end screen waits until the wreck is under — the
              // frame loop fires it (see duelEndAt below).
              G.duelEndAt = world.t + SHIP.sinkTime + 1;
              G.duelEndWon = false;
            } else {
              addToast('☠ The Dutchman went down with all hands…');
            }
          } else if (isFleet) {
            // A lost escort is not an enemy sunk — she sails again next
            // voyage, and her wreck still pays souls like any wreck.
            addToast(`☠ ${e.name || 'Escort'} went down — she sails again next voyage.`);
          } else {
            G.sunkCount += 1;
            addToast(`☠ ${e.name || 'Enemy ship'} sunk — claim their souls!`);
            if (G.mode === 'duel') {
              G.duelEndAt = world.t + SHIP.sinkTime + 1;
              G.duelEndWon = true;
            }
          }
        } else if (e.type === 'soul') {
          // Floating souls pay the same way a chest does — one toast
          // per batch, not one per wisp, so a wreck's souls don't spam.
          soulsClaimed += 1;
          if (!firstSoul) firstSoul = e;
        } else if (e.type === 'chest') {
          G.pools.flash.fire(e.x, waveHeight(e.x, e.z, world.t) + 3, e.z);
          addToast(`💰 Treasure claimed! +${e.souls} souls, hull patched.`);
        } else if (e.type === 'levelUp') {
          const pp = world.player;
          G.pools.flash.fire(pp.x, waveHeight(pp.x, pp.z, world.t) + 6, pp.z);
          addToast(`⚓ LEVEL UP — LEVEL ${e.level}! Bigger hull, +1 cannon, +25 shield.`);
        } else if (e.type === 'respawn') {
          addToast('🌊 The Dutchman rises again, 100 m from the wreck.');
        } else if (e.type === 'krakenWarning') {
          addToast('🐙 THE KRAKEN STIRS — dark water ahead!');
        } else if (e.type === 'krakenSlain') {
          addToast('🐙 KRAKEN SLAIN — a mega soul drifts on the water!');
        } else if (e.type === 'megaSoul') {
          addToast('✨ +1 MEGA SOUL');
        } else if (e.type === 'krakenHit') {
          // No toast — the hit count lives in the kraken banner.
        }
      }
      if (soulsClaimed > 0) {
        if (firstSoul) G.pools.flash.fire(firstSoul.x, waveHeight(firstSoul.x, firstSoul.z, world.t) + 3, firstSoul.z);
        addToast(`💀 +${soulsClaimed} soul${soulsClaimed === 1 ? '' : 's'} claimed — the crew grows.`);
      }
    };

    G.endDuel = (won) => {
      if (G.over) return;
      G.over = true;
      const p = world.player;
      if (won) {
        p.souls += 5;
        p.crew = Math.min(SHIP.maxCrew, p.crew + 3);
        addToast('👑 Rival sunk! Their souls join your crew.');
      }
      const souls = p.souls;
      const prevBest = getBest();
      const isBest = souls > prevBest;
      if (isBest) { try { window.localStorage.setItem(BEST_KEY, String(souls)); } catch {} setBest(souls); }
      setGameOver({
        won,
        title: won ? 'RIVAL SUNK' : 'SUNK',
        subtitle: won
          ? 'The rival captain feeds the deep. Their crew sails with you now.'
          : 'The Dutchman is claimed by the sea — but a cursed ship never truly dies.',
        souls, sunk: G.sunkCount + (won ? 1 : 0), wave: 0, best: isBest,
      });
    };

    // -- fixed-step simulation ---------------------------------------------------
    function stepOnce(step) {
      const input = G.input;
      const rudder = input.joy !== 0 ? input.joy : (input.keys.right ? 1 : 0) - (input.keys.left ? 1 : 0);
      const fire = G.ashore ? null : input.fire;
      input.fire = null;
      if (G.mode === 'solo') {
        const events = stepWorld(world, { rudder, sails: input.sails, fire, throttle: input.throttle, anchored: input.anchored }, step);
        G.handleEvents(events);
        // Fleet followers sail and fight alongside the commanded ship.
        // (The engine's stepWorld only steps the player + enemies, so
        // the fleet is stepped here; their broadsides join world.balls
        // and are resolved by the next tick's stepBalls.)
        if (world.fleet.length) {
          const fev = [];
          for (const f of world.fleet) {
            // Step dead followers too — their sinking cinematic (sinkT)
            // only advances inside stepFleetShip; the engine prunes the
            // wreck from the fleet once it has gone under.
            const side = stepFleetShip(f, world.player, world.enemies, world.wind, step, world.rng);
            if (!f.alive) continue;
            collideIslands(f, world.islands);
            if (side && f.alive) {
              const r = fireBroadside(f, side, world.t);
              if (r.fired) {
                world.balls.push(...r.balls);
                fev.push({ type: 'fire', shipId: f.id, side });
              }
            }
          }
          if (fev.length) G.handleEvents(fev);
        }
      } else {
        stepDuel(step, rudder, fire);
      }
    }

    function stepDuel(step, rudder, fire) {
      const remote = G.remote;
      world.t += step;
      const ev = world.events;
      stepWind(world.wind, step);
      const p = world.player;
      p.rudder = clamp(rudder, -1, 1);
      p.sails = G.input.sails;
      p.throttle = clamp(G.input.throttle == null ? 1 : G.input.throttle, -1, 1);
      p.anchored = !!G.input.anchored;
      stepShip(p, step, world.wind);
      collideIslands(p, world.islands);
      if (fire && p.alive) {
        const r = fireBroadside(p, fire, world.t);
        if (r.fired) {
          world.balls.push(...r.balls);
          ev.push({ type: 'fire', shipId: p.id, side: fire });
        }
      }
      // Ease the rival toward the last broadcast snapshot.
      if (remote.target) {
        const k = 1 - Math.exp(-step * 5);
        remote.x += (remote.target.x - remote.x) * k;
        remote.z += (remote.target.z - remote.z) * k;
        remote.heading = wrapAngle(remote.heading + wrapAngle(remote.target.heading - remote.heading) * k);
        remote.speed = remote.target.speed || 0;
        remote.hull = remote.target.hull != null ? remote.target.hull : remote.hull;
        remote.crew = remote.target.crew != null ? remote.target.crew : remote.crew;
        if (remote.target.sails) remote.sails = remote.target.sails;
      }
      remote.reloadPort = Math.max(0, remote.reloadPort - step);
      remote.reloadStbd = Math.max(0, remote.reloadStbd - step);
      if (!remote.alive && remote.sinking) remote.sinkT += step;
      collideIslands(remote, world.islands);
      stepBalls(world.balls, [p, remote], world.souls, step, world.t, ev, world.rng);
      stepSouls(world.souls, [p, remote], step, world.t, ev);
      stepChests(world, ev);
      const out = ev.slice();
      ev.length = 0;
      G.handleEvents(out);
    }

    // -- per-frame render ----------------------------------------------------------
    function frame(now) {
      if (G.disposed) return;
      G.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - G.last) / 1000);
      G.last = now;

      if (!G.paused && !G.over) {
        G.acc += dt;
        const step = 1 / 60;
        let n = 0;
        while (G.acc >= step && n < 4) { G.acc -= step; n += 1; stepOnce(step); }
        if (n === 4) G.acc = 0;
      }

      const t = world.t;
      const p = world.player;

      // Command switch: rebuild the player group for the new commanded
      // ship (legendary hull, or the Dutchman with her skin). Only the
      // player ship object swaps — captain, enemies and wave untouched.
      const cmdDef = p.shipDefId || 'dutchman';
      if (cmdDef !== G.commandedId) {
        const old = G.playerGroup;
        scene.remove(old);
        disposeGroup(old);
        let grp;
        if (cmdDef !== 'dutchman') grp = buildLegendaryShip(cmdDef, { sizeScale: p.sizeScale || 1 });
        else grp = buildShip({ skin: p.skin || 'dutchman', sizeScale: p.sizeScale || 1 });
        grp.userData.setCrew(Math.min(p.crew, 12));
        grp.userData.setSails(p.sails);
        dressShip(grp);
        scene.add(grp);
        G.playerGroup = grp;
        G.commandedId = cmdDef;
        G.skinShown = p.skin || 'dutchman';
        G.scaleShown = p.sizeScale || 1;
        G.crewShown = p.crew;
        G.sailsShown = p.sails;
      }
      // Skin (Dutchman only — legendary hulls wear their own colours)
      // and level growth (sizeScale) on the live group.
      if (cmdDef === 'dutchman' && (p.skin || 'dutchman') !== G.skinShown) {
        setSkinVisual(G.playerGroup, p.skin || 'dutchman');
        G.skinShown = p.skin || 'dutchman';
      }
      if ((p.sizeScale || 1) !== G.scaleShown) {
        G.playerGroup.scale.setScalar(p.sizeScale || 1);
        G.scaleShown = p.sizeScale || 1;
      }

      // Ships on the waves.
      poseShip(G.playerGroup, p, t);
      animateShip(G.playerGroup, t, dt);
      if (p.crew !== G.crewShown) {
        G.playerGroup.userData.setCrew(Math.min(p.crew, 12));
        G.crewShown = p.crew;
      }
      if (p.sails !== G.sailsShown) {
        G.playerGroup.userData.setSails(p.sails);
        G.sailsShown = p.sails;
      }

      if (G.mode === 'solo') {
        // Enemy groups follow world.enemies.
        const seen = new Set();
        for (const e of world.enemies) {
          seen.add(e.id);
          let grp = G.enemyGroups.get(e.id);
          if (!grp) {
            grp = buildGhostShip();
            grp.userData.setCrew(Math.min(e.crew, 8));
            grp.userData.setSails(e.sails);
            dressShip(grp);
            scene.add(grp);
            G.enemyGroups.set(e.id, grp);
          }
          poseShip(grp, e, t);
          animateShip(grp, t, dt);
          if (e.sails !== grp.userData._sailsShown) {
            grp.userData.setSails(e.sails);
            grp.userData._sailsShown = e.sails;
          }
        }
        for (const [id, grp] of G.enemyGroups) {
          if (!seen.has(id)) {
            scene.remove(grp);
            disposeGroup(grp);
            G.enemyGroups.delete(id);
          }
        }
        // Fleet groups follow world.fleet (same pattern as enemies).
        const seenF = new Set();
        for (const f of world.fleet) {
          seenF.add(f.id);
          let grp = G.fleetGroups.get(f.id);
          if (!grp) {
            grp = (f.shipDefId && f.shipDefId !== 'dutchman')
              ? buildLegendaryShip(f.shipDefId, { sizeScale: f.sizeScale || 1 })
              : buildShip({ skin: f.skin || 'dutchman', sizeScale: f.sizeScale || 1 });
            grp.userData.setCrew(Math.min(f.crew, 8));
            grp.userData.setSails(f.sails);
            dressShip(grp);
            scene.add(grp);
            G.fleetGroups.set(f.id, grp);
          }
          grp.scale.setScalar(f.sizeScale || 1);
          poseShip(grp, f, t);
          animateShip(grp, t, dt);
          if (f.sails !== grp.userData._sailsShown) {
            grp.userData.setSails(f.sails);
            grp.userData._sailsShown = f.sails;
          }
        }
        for (const [id, grp] of G.fleetGroups) {
          if (!seenF.has(id)) {
            scene.remove(grp);
            disposeGroup(grp);
            G.fleetGroups.delete(id);
          }
        }
        // Solo game over once the wreck has gone under — Merlin should
        // watch her sink, not get the screen the moment she is holed.
        // NOTE: respawn runs inside stepWorld (stepOnce, above), so a
        // respawned player reads alive here and this stays a fallback
        // for a player still dead past sinkTime + 1.
        if (!p.alive && p.sinkT > SHIP.sinkTime + 1 && !G.over) {
          G.over = true;
          const souls = p.souls;
          const prevBest = getBest();
          const isBest = souls > prevBest;
          if (isBest) { try { window.localStorage.setItem(BEST_KEY, String(souls)); } catch {} setBest(souls); }
          setGameOver({
            won: false,
            title: 'CLAIMED BY THE SEA',
            subtitle: 'The Dutchman went down with all hands — but a cursed ship never truly dies.',
            souls, sunk: G.sunkCount, wave: world.wave, best: isBest,
          });
        }
      } else if (G.remote) {
        poseShip(G.remoteGroup, G.remote, t);
        animateShip(G.remoteGroup, t, dt);
        if (G.remote.crew !== G.remoteGroup.userData._crewShown) {
          G.remoteGroup.userData.setCrew(Math.min(G.remote.crew, 12));
          G.remoteGroup.userData._crewShown = G.remote.crew;
        }
        if (G.remote.sails !== G.remoteGroup.userData._sailsShown) {
          G.remoteGroup.userData.setSails(G.remote.sails);
          G.remoteGroup.userData._sailsShown = G.remote.sails;
        }
        if (G.sync && t - G.lastSent > 0.125) {
          G.lastSent = t;
          G.sync.sendState({
            x: p.x, z: p.z, heading: p.heading, speed: p.speed,
            hull: Math.round(p.hull), crew: p.crew, sails: p.sails,
          });
        }
      }

      // Wreck fires: a wrecked ship burns (flame + smoke + orange glow)
      // while it sinks, then the fire dies as the hull slips under.
      // Player, enemies and the duel rival alike.
      const burning = [];
      if (p.sinking) burning.push({ x: p.x, z: p.z, k: p.sinkT / SHIP.sinkTime });
      if (G.mode === 'solo') {
        for (const e of world.enemies) {
          if (e.sinking) burning.push({ x: e.x, z: e.z, k: e.sinkT / SHIP.sinkTime });
        }
        for (const f of world.fleet || []) {
          if (f.sinking) burning.push({ x: f.x, z: f.z, k: f.sinkT / SHIP.sinkTime });
        }
      } else if (G.remote && G.remote.sinking) {
        burning.push({ x: G.remote.x, z: G.remote.z, k: G.remote.sinkT / SHIP.sinkTime });
      }
      G.pools.fire.sync(burning, t);

      // Voyage ambience: kraken, mega souls, gulls, sea life (solo only
      // for the kraken and mega souls — duels have neither).
      if (G.mode === 'solo') {
        G.pools.kraken.sync(world.kraken, t);
        G.pools.megaSouls.sync(world.megaSouls, t);
      }
      G.pools.gulls.sync(t);
      G.pools.seaLife.sync(t, p.x, p.z);

      // The gulp: the moment a wreck's masthead slips under, the sea
      // swallows her with one last big splash. One per wreck.
      const gulp = (s) => {
        if (!s.sinking || s._gulped) return;
        if (sinkDropK(s.sinkT / SHIP.sinkTime) >= SHIP.mastheadY) {
          s._gulped = true;
          G.pools.splash.splash(s.x, s.z, t, true);
        }
      };
      gulp(p);
      if (G.mode === 'solo') for (const e of world.enemies) gulp(e);
      else if (G.remote) gulp(G.remote);

      // Anchor marker over the bow, and a splash the moment it drops.
      if (G.anchorMark) {
        const show = p.anchored && p.alive;
        G.anchorMark.visible = show;
        if (show) {
          const bx = p.x + Math.sin(p.heading) * 12, bz = p.z + Math.cos(p.heading) * 12;
          G.anchorMark.position.set(bx, waveHeight(bx, bz, t) + 4 + Math.sin(t * 1.6) * 0.4, bz);
        }
      }
      if (p.anchored && !G._anchorWas) {
        const bx = p.x + Math.sin(p.heading) * 11, bz = p.z + Math.cos(p.heading) * 11;
        G.pools.splash.splash(bx, bz, t, true);
        addToast('⚓ Anchor down — she pivots in place.');
      } else if (!p.anchored && G._anchorWas) {
        addToast('⚓ Anchor weighed — under way.');
      }
      G._anchorWas = p.anchored;

      // A duel ends once the wreck has gone under, not the instant she
      // is holed — the loser watches her sink first.
      if (G.duelEndAt != null && world.t >= G.duelEndAt && !G.over) {
        G.duelEndAt = null;
        G.endDuel(G.duelEndWon);
      }

      // Effects.
      G.pools.balls.sync(world.balls, t);
      G.pools.souls.sync(world.souls, t);
      G.pools.flash.update(dt);
      G.pools.splash.update(dt);
      G.ocean.update(t, p.x, p.z);
      G.sky.update(t, dt, p.x, p.z);
      // Storm CGI: clouds, bolts, foam, spray, fog — driven by the
      // real clock and the live night factor, never by game state.
      G.storm.update(t, dt, p.x, p.z, p, G.nightF);
      // Night factor is real-clock driven — refresh ~once a second.
      const nowSec = Math.floor(now / 1000);
      if (nowSec !== G.lastNightSec) {
        G.lastNightSec = nowSec;
        G.nightF = dutchmanNightFactor();
      }
      G.islands.update(t, G.nightF);
      G.chests.sync(world.chests, t);

      // Ashore: the joystick walks the walker (6 m/s, clamped to the
      // island). Movement is relative to where the walker faces.
      if (G.ashore && !G.paused && !G.over) {
        const w = G.ashore.walker;
        const isl = G.ashore.island;
        const jx = joyState.current.dx, jy = joyState.current.dy;
        if (jx !== 0 || jy !== 0) {
          const fx = Math.sin(w.heading), fz = Math.cos(w.heading);
          const rx = Math.cos(w.heading), rz = -Math.sin(w.heading);
          let mx = rx * jx + fx * -jy;
          let mz = rz * jx + fz * -jy;
          const ml = Math.hypot(mx, mz) || 1;
          if (ml > 1) { mx /= ml; mz /= ml; }
          const nx = w.x + mx * 6 * dt;
          const nz = w.z + mz * 6 * dt;
          const dx = nx - isl.x, dz = nz - isl.z;
          const d = Math.hypot(dx, dz);
          const maxD = Math.max(2, isl.r - 2);
          if (d > maxD) { w.x = isl.x + (dx / d) * maxD; w.z = isl.z + (dz / d) * maxD; }
          else { w.x = nx; w.z = nz; }
          w.heading = Math.atan2(mx, mz);
        }
        G.walker.position.set(w.x, 2.5, w.z);
      }

      // Ashore duels tick on the duel clock (see updateDuelView note).
      if (G.duel && G.duel.kind) {
        const d = G.duel;
        d.elapsed += dt;
        const nowD = (world.t - d.startT) + d.elapsed;
        if (d.kind === 'sword' && d.duel.phase === 'fight') {
          swordDuelTick(d.duel, nowD);
          if (d.duel.phase !== 'fight') { updateDuelView(); finishDuel(); }
          else updateDuelView();
        } else {
          updateDuelView();
        }
      }

      // Chase camera with orbit offsets — or above-behind the walker ashore.
      if (G.ashore) {
        const w = G.ashore.walker;
        camera.position.set(
          w.x - Math.sin(w.heading) * 16,
          16,
          w.z - Math.cos(w.heading) * 16
        );
        camera.lookAt(w.x, 2, w.z);
      } else {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const yaw = p.heading + Math.PI + G.cam.yaw;
      const back = G.cam.dist * Math.cos(G.cam.pitch);
      const wh = waveHeight(p.x, p.z, t);
      camera.position.set(
        p.x + Math.sin(yaw) * back,
        wh + 9 + Math.sin(G.cam.pitch) * G.cam.dist,
        p.z + Math.cos(yaw) * back
      );
      camera.lookAt(p.x + fx * 10, wh + 3, p.z + fz * 10);
      }

      // HUD snapshot, throttled.
      if (t - G.lastHud > 0.2) {
        G.lastHud = t;
        const rt = reloadTime(p);
        // Nearest living foe, so damage you deal is visible in solo
        // (duels already show the rival's hull below).
        let foe = null;
        if (G.mode === 'solo') {
          let best = Infinity;
          for (const e of world.enemies) {
            if (!e.alive) continue;
            const d = Math.hypot(e.x - p.x, e.z - p.z);
            if (d < best) { best = d; foe = e; }
          }
        }
        // Docking (solo only): a dock in range, slow enough, ship alive.
        let nearDock = false;
        let dockIsland = null;
        if (G.mode === 'solo' && p.alive && !G.ashore) {
          for (const isl of world.islands) {
            if (!isl.dock) continue;
            const d = Math.hypot(p.x - isl.dock.x, p.z - isl.dock.z);
            if (d <= DOCK_RANGE && Math.abs(p.speed) < 3) { nearDock = true; dockIsland = isl; break; }
          }
        }
        G.dockIsland = dockIsland;
        // Ashore interactables, distance-checked from the walker.
        let nearMerchant = false, nearFoe = false, nearSlot = false;
        if (G.ashore) {
          const w = G.ashore.walker;
          if (Math.hypot(w.x - G.ashore.merchant.x, w.z - G.ashore.merchant.z) <= 10) nearMerchant = true;
          if (G.ashore.island.hasSlotMachine && Math.hypot(w.x - G.ashore.slot.x, w.z - G.ashore.slot.z) <= 10) nearSlot = true;
          for (const f of G.ashore.foes) {
            if (Math.hypot(w.x - f.x, w.z - f.z) <= 8) { nearFoe = true; break; }
          }
        }
        setHud({
          hull: Math.max(0, Math.round(p.hull)), maxHull: p.maxHull,
          crew: p.crew, souls: p.souls, wave: world.wave,
          windRel: wrapAngle(world.wind.dir - p.heading),
          windStr: world.wind.strength,
          speed: Math.abs(p.speed),
          signedSpeed: p.speed,
          anchored: p.anchored,
          sails: p.sails,
          reloadPort: p.reloadPort <= 0 ? 1 : 1 - p.reloadPort / rt,
          reloadStbd: p.reloadStbd <= 0 ? 1 : 1 - p.reloadStbd / rt,
          enemies: G.mode === 'solo' ? world.enemies.filter((e) => e.alive).length : 1,
          enemyHull: G.mode === 'duel' && G.remote ? Math.max(0, Math.round(G.remote.hull)) : null,
          foeHull: foe ? { name: foe.name, hull: Math.max(0, Math.round(foe.hull)), maxHull: foe.maxHull, lifeLine: lifeLine(foeShipLife(foe, p)) + crewWatchLine(foe, p) } : null,
          // Voyage snapshot.
          level: world.captain.level || 1,
          sinkings: world.captain.sinkings || 0,
          sinkingsToNext: (world.captain.level || 1) >= 10 ? 0 : 5 - ((world.captain.sinkings || 0) % 5),
          shield: Math.max(0, Math.round(p.shield || 0)),
          maxShield: p.maxShield || 0,
          megaSouls: world.captain.megaSouls || 0,
          krakenKills: world.captain.krakenKills || 0,
          skin: p.skin || 'dutchman',
          shipName: p.name || 'Flying Dutchman',
          docked: !!G.ashore,
          nearDock,
          ashore: !!G.ashore,
          nearMerchant,
          nearFoe,
          nearSlot,
          ashoreIslandName: G.ashore ? (G.ashore.island.name || 'the island') : null,
          kraken: world.kraken ? { state: world.kraken.state, hits: world.kraken.hits || 0, lifeLine: lifeLine(krakenLife(world)) } : null,
          fleet: world.fleet.map((f) => ({
            id: f.id, name: f.name,
            hull: Math.max(0, Math.round(f.hull)), maxHull: f.maxHull,
            shield: Math.max(0, Math.round(f.shield || 0)), maxShield: f.maxShield || 0,
            crew: f.crew,
          })),
        });
      }

      renderer.render(scene, camera);
    }

    // -- canvas orbit / zoom ---------------------------------------------------------
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let pinchD = 0;
    el.addEventListener('pointerdown', (ev) => {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { el.setPointerCapture(ev.pointerId); } catch {}
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (ev) => {
      const prev = pointers.get(ev.pointerId);
      if (!prev) return;
      const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) G.cam.dist = clamp(G.cam.dist - (d - pinchD) * 0.08, 20, 70);
        pinchD = d;
      } else {
        G.cam.yaw -= dx * 0.005;
        G.cam.pitch = clamp(G.cam.pitch + dy * 0.003, 0.08, 1.1);
      }
    });
    const upPointer = (ev) => { pointers.delete(ev.pointerId); pinchD = 0; };
    el.addEventListener('pointerup', upPointer);
    el.addEventListener('pointercancel', upPointer);
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      G.cam.dist = clamp(G.cam.dist + ev.deltaY * 0.02, 20, 70);
    }, { passive: false });

    // -- keyboard ----------------------------------------------------------------------
    const onKey = (down) => (ev) => {
      if (ev.key === 'ArrowLeft') G.input.keys.left = down;
      else if (ev.key === 'ArrowRight') G.input.keys.right = down;
      else if (down && ev.key === 'ArrowUp') G.input.throttle = clamp(G.input.throttle + 0.25, -1, 1);
      else if (down && ev.key === 'ArrowDown') G.input.throttle = clamp(G.input.throttle - 0.25, -1, 1);
      else if (down && ev.key === ' ') G.input.throttle = 0;
      else if (down && (ev.key === 'q' || ev.key === 'Q')) G.input.fire = 'port';
      else if (down && (ev.key === 'e' || ev.key === 'E')) G.input.fire = 'stbd';
      else if (down && ev.key === '1') G.input.sails = SAILS.FULL;
      else if (down && ev.key === '2') G.input.sails = SAILS.BATTLE;
      else if (down && ev.key === '3') G.input.sails = SAILS.FURLED;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(ev.key)) ev.preventDefault();
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const onResize = () => {
      const w2 = mount.clientWidth, h2 = mount.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener('resize', onResize);

    G.cleanup = () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', onResize);
      if (typeof window !== 'undefined' && window.__dutchman === G) window.__dutchman = null;
    };

    gameRef.current = G;
    if (typeof window !== 'undefined') window.__dutchman = G;
    setHud(null);
    setGameOver(null);
    setPaused(false);
    setAnchored(false);
    joyState.current = { id: null, dx: 0, dy: 0 }; // fresh helm: throttle back to rest
    G.raf = requestAnimationFrame(frame);
  }

  function teardown() {
    const G = gameRef.current;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!G) return;
    gameRef.current = null;
    G.disposed = true;
    cancelAnimationFrame(G.raf);
    if (G.cleanup) G.cleanup();
    if (G.sync) G.sync.disconnect();
    try {
      disposeGroup(G.playerGroup);
      for (const [, grp] of G.enemyGroups) disposeGroup(grp);
      for (const [, grp] of (G.fleetGroups || [])) disposeGroup(grp);
      if (G.walker) disposeGroup(G.walker);
      if (G.ashore) for (const f of G.ashore.foes) disposeGroup(f.mesh);
      if (G.remoteGroup) disposeGroup(G.remoteGroup);
      if (G.islands) disposeGroup(G.islands.group);
      if (G.chests) disposeGroup(G.chests.group);
      G.renderer.dispose();
      if (G.renderer.domElement.parentNode) G.renderer.domElement.parentNode.removeChild(G.renderer.domElement);
    } catch { /* teardown is best-effort */ }
  }

  function quitToMenu() {
    saveVoyage();
    teardown();
    setGameOver(null);
    setHud(null);
    setPanel(null);
    setScreen('menu');
    setPaused(false);
  }

  function sailAgain() {
    const m = mode;
    saveVoyage();
    teardown();
    setGameOver(null);
    setPanel(null);
    if (m === 'solo') startSolo();
    else setScreen('menu');
  }

  useEffect(() => () => { teardown(); if (pollRef.current) clearInterval(pollRef.current); }, []);

  // -- controls --------------------------------------------------------------------------
  function cycleSails() {
    const G = gameRef.current;
    if (!G || G.ashore) return;
    const i = SAIL_ORDER.indexOf(G.input.sails);
    G.input.sails = SAIL_ORDER[(i + 1) % SAIL_ORDER.length];
  }

  function fire(side) {
    const G = gameRef.current;
    if (G && !G.paused && !G.over && !G.ashore) G.input.fire = side;
  }

  function togglePause() {
    const G = gameRef.current;
    if (!G || G.over) return;
    G.paused = !G.paused;
    G.manualPause = G.paused;
    setPaused(G.paused);
  }

  // Anchor: drop it to stop dead and pivot in place; weigh it to sail on.
  function toggleAnchor() {
    const G = gameRef.current;
    if (!G || G.paused || G.over || !G.world.player.alive || G.ashore) return;
    G.input.anchored = !G.input.anchored;
    setAnchored(G.input.anchored);
  }

  // Joystick (helm): left/right steers; up/down is the throttle — push
  // up for way ahead, pull down to brake, stop, then back her astern.
  // The rudder springs back to centre on release; the throttle stays
  // where you leave it, like a real throttle lever, so letting go of
  // the stick does not kill your way.
  const joyRef = useRef(null);
  const joyState = useRef({ id: null, dx: 0, dy: 0 });
  const [, setJoyTick] = useState(0);
  function joyStart(e) {
    joyState.current = { id: e.pointerId, dx: 0, dy: joyState.current.dy || 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function joyMove(e) {
    const s = joyState.current;
    if (s.id !== e.pointerId || !joyRef.current) return;
    const rect = joyRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    s.dx = clamp(dx / (rect.width / 2), -1, 1);
    s.dy = clamp(dy / (rect.height / 2), -1, 1);
    const G = gameRef.current;
    if (G && !G.ashore) {
      G.input.joy = s.dx;
      G.input.throttle = -s.dy; // up = ahead, down = astern
    }
    setJoyTick((n) => n + 1);
  }
  function joyEnd(e) {
    if (joyState.current.id !== e.pointerId) return;
    joyState.current = { id: null, dx: 0, dy: joyState.current.dy || 0 };
    const G = gameRef.current;
    if (G) G.input.joy = 0; // throttle stays where the lever was left
    setJoyTick((n) => n + 1);
  }

  // Ship status panel: minimize to a floating icon, drag it anywhere,
  // tap it to expand the panel back at the icon's spot. Drag is handled
  // on the icon only (stopPropagation + pointer capture + touch-action
  // none), so it never fights the helm joystick or the cannon buttons.
  function measureStatusArea() {
    const wrap = statusWrapRef.current;
    if (!wrap) return;
    const area = { width: wrap.clientWidth, height: wrap.clientHeight };
    setStatusArea(area);
    setIconPos((p) => clampStatusIconPos(p, area));
  }
  useEffect(() => {
    measureStatusArea();
    window.addEventListener('resize', measureStatusArea);
    return () => window.removeEventListener('resize', measureStatusArea);
  }, [screen]);
  // Measure the expanded panel so it can be clamped fully on screen.
  // The shape only changes when the panel opens or a foe bar appears.
  useLayoutEffect(() => {
    if (statusMinimized || !panelRef.current) return;
    const r = panelRef.current.getBoundingClientRect();
    if (r.width > 0) setPanelSize({ width: r.width, height: r.height });
  }, [statusMinimized, hud?.enemyHull, hud?.foeHull, hud?.maxShield]);
  function statusIconDown(e) {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    statusDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX, startClientY: e.clientY,
      startPos: { ...iconPos }, moved: false, pos: { ...iconPos },
    };
  }
  function statusIconMove(e) {
    const d = statusDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (!d.moved && !isStatusIconTap(dx, dy)) d.moved = true;
    if (d.moved) {
      const wrap = statusWrapRef.current;
      const area = wrap
        ? { width: wrap.clientWidth, height: wrap.clientHeight }
        : statusArea;
      d.pos = clampStatusIconPos({ x: d.startPos.x + dx, y: d.startPos.y + dy }, area);
      setIconPos(d.pos);
    }
  }
  function statusIconUp(e) {
    const d = statusDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    statusDragRef.current = null;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (isStatusIconTap(dx, dy)) {
      // A real tap (not a drag): expand the panel at the icon's spot.
      setStatusMinimized(false);
      saveStatusMinimized(false);
    } else {
      saveStatusIconPos(d.pos);
    }
  }
  function minimizeStatusPanel() {
    setStatusMinimized(true);
    saveStatusMinimized(true);
  }
  // Expanded panel anchors at the icon's spot, clamped on screen.
  const panelPos = panelPosForIcon(iconPos, panelSize, statusArea);

  const windDeg = hud ? (hud.windRel * 180) / Math.PI : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#020608] text-zinc-100 select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {webglFail && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 px-6 text-center">
          <p className="text-sm text-zinc-400">This voyage needs WebGL, which your browser could not start.</p>
        </div>
      )}

      {screen === 'menu' && (
        <MenuScreen
          best={best} joinCode={joinCode} setJoinCode={setJoinCode}
          onSolo={startSolo} onCreate={doCreate} onJoin={() => doJoin(joinCode)}
          duelError={duelError}
        />
      )}

      {screen === 'waiting' && (
        <WaitingScreen code={duelCode} note={waitingNote} onCancel={cancelWaiting} />
      )}

      {screen === 'game' && hud && (
        <>
          {/* Top bar: one flex row — hull panel, wave pill, pause.
              Everything lives inside the row, so nothing can run off
              the left or right edge on a phone. */}
          <div
            className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2"
            style={{
              paddingLeft: 'max(8px, env(safe-area-inset-left))',
              paddingRight: 'max(8px, env(safe-area-inset-right))',
              paddingTop: 'max(8px, env(safe-area-inset-top))',
            }}
          >
            {/* The ship status panel lives in the floating overlay
                below; this spacer keeps the wave pill centred and the
                pause/backpack buttons right. */}
            <div className="w-40 flex-none" aria-hidden="true" />

            {/* wave / duel */}
            <div className="flex min-w-0 flex-1 flex-col items-center pt-1">
              <p className="rounded-full border border-zinc-800 bg-black/55 px-2 py-1 text-[10px] font-black tracking-[0.15em] text-amber-200/90 backdrop-blur">
                {mode === 'solo' ? (hud.wave > 0 ? `WAVE ${hud.wave}` : 'THE CURSED SEA') : '⚔ DUEL'}
              </p>
            </div>

            {/* pause + voyage backpack (solo only) */}
            <div className="flex flex-none gap-2">
              {mode === 'solo' && (
                <button
                  type="button" onClick={() => openPanel('backpack')} aria-label="Ghost Voyage backpack"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-teal-400/60 bg-black/55 text-lg backdrop-blur"
                >
                  👻
                </button>
              )}
              <button
                type="button" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-zinc-700 bg-black/55 text-lg backdrop-blur"
              >
                {paused ? '▶' : '❚❚'}
              </button>
            </div>
          </div>

          {/* Ship status overlay: the expanded panel, or the minimized
              floating icon. The wrapper carries the same safe-area
              padding as the top bar, so positions are measured from
              the padded area — the default upper-left spot is exactly
              where the panel used to sit. The wrapper itself ignores
              touches; only the panel and the icon take them. */}
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              paddingLeft: 'max(8px, env(safe-area-inset-left))',
              paddingRight: 'max(8px, env(safe-area-inset-right))',
              paddingTop: 'max(8px, env(safe-area-inset-top))',
              paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            }}
          >
            {/* Inner box = the padded content area: absolutely-positioned
                children measure from here, so (0, 0) is the padded
                upper-left where the panel used to sit. */}
            <div ref={statusWrapRef} className="pointer-events-none relative h-full w-full">
              {statusMinimized ? (
              <button
                type="button"
                aria-label={`Show ship status — level ${hud.level}`}
                onPointerDown={statusIconDown}
                onPointerMove={statusIconMove}
                onPointerUp={statusIconUp}
                onPointerCancel={statusIconUp}
                className="pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border border-amber-400/60 bg-black/70 backdrop-blur"
                style={{ left: iconPos.x, top: iconPos.y, width: STATUS_ICON_SIZE, height: STATUS_ICON_SIZE, touchAction: 'none' }}
              >
                <span className="text-base leading-none">⚓</span>
                <span className="mt-1 h-1 w-8 overflow-hidden rounded-full bg-zinc-800">
                  <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${hud.maxHull > 0 ? (hud.hull / hud.maxHull) * 100 : 0}%` }} />
                </span>
                <span className="mt-0.5 text-[8px] font-black tracking-widest text-amber-200">LVL {hud.level}</span>
              </button>
            ) : (
              <div
                ref={panelRef}
                className="pointer-events-auto absolute w-40 rounded-xl border border-zinc-800 bg-black/55 p-2 backdrop-blur"
                style={{ left: panelPos.x, top: panelPos.y }}
              >
                <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest text-zinc-400">
                  <span>HULL</span><span>{hud.hull}/{hud.maxHull}</span>
                  <button
                    type="button" onClick={minimizeStatusPanel} aria-label="Minimize ship status"
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-zinc-700 bg-black/40 text-sm leading-none text-zinc-300"
                  >
                    —
                  </button>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${hud.hull > 50 ? 'bg-emerald-400' : hud.hull > 25 ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{ width: `${(hud.hull / hud.maxHull) * 100}%` }}
                  />
                </div>
                {hud.maxShield > 0 && (
                  <>
                    <div className="mb-1 mt-1.5 flex items-center justify-between text-[10px] tracking-widest text-zinc-400">
                      <span>SHIELD</span><span>{hud.shield}/{hud.maxShield}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(hud.shield / hud.maxShield) * 100}%` }} />
                    </div>
                  </>
                )}
                <div className="mt-1.5 flex justify-between text-[11px] text-zinc-300">
                  <span>👻 {hud.crew} crew</span>
                  <span>💀 {hud.souls} souls{typeof hud.megaSouls === 'number' ? ` · ✨ ${hud.megaSouls}` : ''}</span>
                </div>
                <p className="mt-1 text-[10px] font-black tracking-widest text-amber-200/90">
                  ⚓ LVL {hud.level}{hud.level >= 10 ? ' — MAX' : ` — ${hud.sinkings % 5}/5 to LVL ${hud.level + 1}`}
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <div>
                    <p className="text-[9px] tracking-widest text-zinc-500">PORT</p>
                    <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${hud.reloadPort * 100}%` }} /></div>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-widest text-zinc-500">STBD</p>
                    <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${hud.reloadStbd * 100}%` }} /></div>
                  </div>
                </div>
                {hud.enemyHull != null && (
                  <div className="mt-1.5">
                    <p className="text-[9px] tracking-widest text-red-300/80">RIVAL HULL {hud.enemyHull}</p>
                    <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-red-500" style={{ width: `${hud.enemyHull}%` }} /></div>
                  </div>
                )}
                {hud.foeHull && (
                  <div className="mt-1.5">
                    <p className="text-[9px] tracking-widest text-orange-300/80">FOE — {hud.foeHull.name.toUpperCase()} {hud.foeHull.hull}</p>
                    <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-orange-500" style={{ width: `${(hud.foeHull.hull / hud.foeHull.maxHull) * 100}%` }} /></div>
                    {hud.foeHull.lifeLine && (<p className="mt-0.5 text-[9px] text-zinc-400">{hud.foeHull.lifeLine}</p>)}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* kraken banner (solo only) */}
          {mode === 'solo' && hud.kraken && (
            <div className="pointer-events-none absolute inset-x-0 top-[76px] z-10 flex flex-col items-center gap-1 px-4">
              <p className="rounded-full border border-red-500/70 bg-red-950/80 px-4 py-1.5 text-xs font-black tracking-widest text-red-200 backdrop-blur">
                🐙 KRAKEN — hits {hud.kraken.hits}/12
              </p>
              {hud.kraken.lifeLine && (
                <p className="rounded-full bg-black/60 px-3 py-0.5 text-[10px] text-red-200/80 backdrop-blur">{hud.kraken.lifeLine}</p>
              )}
            </div>
          )}

          {/* ashore UI: undock + context actions (solo only) */}
          {mode === 'solo' && hud.ashore && (
            <div className="absolute inset-x-0 top-[76px] z-10 flex flex-col items-center gap-2 px-4">
              <button
                type="button" onClick={undock}
                className="rounded-xl border border-amber-400/60 bg-black/70 px-4 py-2 text-xs font-black tracking-[0.2em] text-amber-200 backdrop-blur"
              >
                ⚓ UNDOCK — {hud.ashoreIslandName ? hud.ashoreIslandName.toUpperCase() : 'BACK TO SEA'}
              </button>
              <div className="flex gap-2">
                {hud.nearMerchant && (
                  <button type="button" onClick={() => openPanel('merchant')} className="rounded-xl bg-emerald-500/90 px-4 py-2.5 text-xs font-black tracking-widest text-black">🛒 MERCHANT</button>
                )}
                {hud.nearFoe && (
                  <button type="button" onClick={() => openPanel('duel')} className="rounded-xl bg-red-500/90 px-4 py-2.5 text-xs font-black tracking-widest text-white">⚔ DUEL</button>
                )}
                {hud.nearSlot && (
                  <button type="button" onClick={() => openPanel('slot')} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black tracking-widest text-black">🎰 SLOT MACHINE</button>
                )}
              </div>
            </div>
          )}

          {/* toasts: centred above the bottom controls, clear of the HUD
              (they used to stack over the hull panel). */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[188px] z-10 flex flex-col items-center gap-1 px-4">
            {toasts.map((t) => (
              <p key={t.id} className="max-w-full rounded-full bg-black/70 px-3 py-1 text-center text-xs text-emerald-200 backdrop-blur">{t.text}</p>
            ))}
          </div>

          {/* Bottom bar: one flex row — helm, sails + anchor, cannons.
              Sized to fit a 390 px phone: 96 + 88 fixed clusters, the
              middle takes what is left, nothing runs off either edge. */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2"
            style={{
              paddingLeft: 'max(8px, env(safe-area-inset-left))',
              paddingRight: 'max(8px, env(safe-area-inset-right))',
              paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            }}
          >
            {/* helm joystick */}
            <div className="flex flex-none flex-col items-center gap-1">
              <div
                ref={joyRef}
                onPointerDown={joyStart} onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd}
                className="relative h-24 w-24 rounded-full border border-zinc-700 bg-black/45 backdrop-blur"
                style={{ touchAction: 'none' }} aria-label="Helm"
              >
                <div
                  className="absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-emerald-500/70"
                  style={{ transform: `translate(calc(-50% + ${joyState.current.dx * 28}px), calc(-50% + ${joyState.current.dy * 28}px))` }}
                />
              </div>
              <p className="text-[9px] tracking-[0.3em] text-zinc-500">HELM</p>
            </div>

            {/* sails + anchor + wind compass (hidden ashore — the
                walker keeps the helm stick; cannons stay on the ship) */}
            {!hud.ashore && (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {mode === 'solo' && hud.nearDock && !hud.docked && (
                <button
                  type="button" onClick={dockAt}
                  className="rounded-xl border border-amber-300 bg-amber-400/90 px-3 py-2 text-xs font-black tracking-[0.2em] text-black"
                >
                  ⚓ DOCK
                </button>
              )}
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-black/55 backdrop-blur" aria-label="Wind compass">
                <svg width="52" height="52" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="23" fill="none" stroke="#3f3f46" strokeWidth="1.5" />
                  <text x="26" y="10" textAnchor="middle" fill="#71717a" fontSize="8">N</text>
                  <g transform={`rotate(${windDeg} 26 26)`}>
                    <line x1="26" y1="26" x2="26" y2="8" stroke="#34d399" strokeWidth="2.5" />
                    <polygon points="26,4 22.5,10 29.5,10" fill="#34d399" />
                  </g>
                  <polygon points="26,20 22,32 30,32" fill="#e4e4e7" />
                  <text x="26" y="46" textAnchor="middle" fill="#52525b" fontSize="7">WIND</text>
                </svg>
              </div>
              <button
                type="button" onClick={toggleAnchor} aria-pressed={anchored}
                className={`rounded-xl border px-3 py-2.5 text-xs font-black tracking-[0.2em] backdrop-blur ${anchored ? 'border-amber-300 bg-amber-400/90 text-black' : 'border-amber-400/50 bg-black/55 text-amber-200'}`}
              >
                {anchored ? '⚓ WEIGH ANCHOR' : '⚓ ANCHOR'}
              </button>
              <button
                type="button" onClick={cycleSails}
                className="rounded-xl border border-amber-400/50 bg-black/55 px-3 py-2.5 text-xs font-black tracking-[0.2em] text-amber-200 backdrop-blur"
              >
                ⛵ {hud ? SAIL_LABEL[hud.sails] : ''}
              </button>
              <p className="text-[10px] text-zinc-500">
                {anchored ? '⚓ ANCHORED' : hud ? `${Math.round(hud.speed)} kn${hud.signedSpeed < -0.5 ? ' ◂ ASTERN' : ''}` : ''}
              </p>
            </div>
            )}

            {/* ashore: walker label in the middle */}
            {hud.ashore && (
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <p className="rounded-full border border-teal-400/50 bg-black/55 px-3 py-1.5 text-[10px] font-black tracking-[0.2em] text-teal-200 backdrop-blur">
                  🚶 ASHORE — {hud.ashoreIslandName ? hud.ashoreIslandName.toUpperCase() : 'THE ISLAND'}
                </p>
                <p className="text-[10px] text-zinc-500">Stick walks · find the merchant, a foe, or the slot</p>
              </div>
            )}

            {/* cannons */}
            {!hud.ashore && (
            <div className="flex flex-none flex-col gap-2">
              <button
                type="button" onPointerDown={() => fire('port')}
                className="h-14 w-[88px] rounded-xl border border-sky-400/60 bg-sky-950/60 text-sm font-black tracking-widest text-sky-200 active:bg-sky-800/70"
                style={{ touchAction: 'none' }}
              >
                ◀ PORT
              </button>
              <button
                type="button" onPointerDown={() => fire('stbd')}
                className="h-14 w-[88px] rounded-xl border border-sky-400/60 bg-sky-950/60 text-sm font-black tracking-widest text-sky-200 active:bg-sky-800/70"
                style={{ touchAction: 'none' }}
              >
                STBD ▶
              </button>
            </div>
            )}
          </div>

          {/* pause overlay */}
          {paused && !gameOver && !panel && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70">
              <h2 className="text-2xl font-black tracking-widest text-zinc-100">BECALMED</h2>
              <button type="button" onClick={togglePause} className="w-52 rounded-xl bg-emerald-500/90 py-3 text-sm font-black tracking-widest text-black">
                RESUME
              </button>
              <button type="button" onClick={quitToMenu} className="w-52 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-300">
                ABANDON SHIP
              </button>
            </div>
          )}
          {/* voyage panels (solo only — the game pauses while one is open) */}
          {mode === 'solo' && panel === 'merchant' && shopSnap && (
            <MerchantPanel snap={shopSnap} onBuy={merchantBuy} onBuySkin={skinBuy} onEquipSkin={skinEquip} onClose={closePanel} />
          )}
          {mode === 'solo' && panel === 'slot' && shopSnap && (
            <SlotPanel
              snap={shopSnap} prize={slotPrize} confirm={slotConfirm}
              onSpin={() => setSlotConfirm(true)} onConfirmSpin={slotConfirmSpin}
              onCancelConfirm={() => setSlotConfirm(false)}
              onEquipPrize={slotEquipPrize} onStorePrize={slotStorePrize} onClose={closePanel}
            />
          )}
          {mode === 'solo' && panel === 'duel' && (
            <DuelOverlay
              view={duelView} onChoose={chooseDuel}
              onSwordAction={duelSwordAction} onPistolTap={duelPistolTap} onClose={closePanel}
            />
          )}
          {mode === 'solo' && panel === 'backpack' && shopSnap && (
            <BackpackPanel
              snap={shopSnap} onEquipItem={backpackEquipItem}
              onUnlockShip={backpackUnlockShip} onCommandShip={backpackCommandShip} onClose={closePanel}
            />
          )}
        </>
      )}

      {screen === 'game' && gameOver && (
        <GameOverScreen over={gameOver} onAgain={sailAgain} onMenu={quitToMenu} />
      )}
    </div>
  );
}
