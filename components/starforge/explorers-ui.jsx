// components/starforge/explorers-ui.jsx — Explorers & Pirates: the whole
// game screen for mode 'explorers', self-contained. The classic board lives
// in app/starforge/page.jsx; this component mirrors its shape (three stacked
// layers sharing one viewBox: SVG hex faces, the HTML tile-video layer, a
// top SVG with tokens, pieces and click targets) and its idioms (circle
// orbs, gold legal highlights, plain English), but everything it renders
// comes from lib/starforge/explorers.js — a different board, different
// pieces, different phases.
//
// Theme (Merlin, Nov 24 ~10:06): Starforge space-forge — deep-space board,
// Myriad palette #0b1026/#4c1d95/#a78bfa, golden omega brand. House art is
// reused where it fits (StarshipPiece for ships, OutpostPiece for
// settlements, VoidPiratePiece for the pirate ship, HexTileArt/TileVideoLayer
// for the board); the new terrain art (fish/spice/lair/unexplored) and the
// HarborPiece live in components/starforge/graphics.jsx in the same style.
//
// Props: { game, pid, onlineMode, move, onNewGame, logLines, notice, onFullscreen } — move is the
// page's dispatcher (solo runs the engine directly, online posts to the
// room route); the page re-renders with the fresh game after every move.
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RESOURCES, RESOURCE_LABEL, RESOURCE_ICON, PLAYER_COLORS, axialToPixel,
} from '@/lib/starforge/engine.js';
import {
  playerById, victoryPoints,
  legalPlacementSpots, legalShipBuildEdges, legalShipMoves,
  legalSettlerUnloads, legalHarborSpots, legalPirateHexes,
  openOffersFor, onlineActorId, cargoFree, shipsOf,
  EXPLORERS_SHIP_MP, EXPLORERS_SHIP_MAX, EXPLORERS_WIN_TARGET,
  EXPLORERS_LAIR_STRENGTH, EXPLORERS_COSTS,
} from '@/lib/starforge/explorers.js';
import {
  OmegaMark, HexTileArt, TileVideoLayer, DiceFace,
  OutpostPiece, HarborPiece, StarshipPiece, VoidPiratePiece,
} from '@/components/starforge/graphics.jsx';

const HEX_SIZE = 34;
const TRADEABLE = [...RESOURCES, 'gold'];
const cardIcon = (k) => (k === 'gold' ? '🪙' : RESOURCE_ICON[k] || '🃏');
const cardLabel = (k) => (k === 'gold' ? 'gold' : RESOURCE_LABEL[k] || k);

function hexCenter(h) { return axialToPixel(h.q, h.r, HEX_SIZE); }

function hexPoints(h) {
  const c = hexCenter(h);
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 180) * (30 + 60 * i);
    return `${(c.x + HEX_SIZE * Math.cos(a)).toFixed(1)},${(c.y + HEX_SIZE * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

// Vertex keys are rounded unit-hex pixel coords ("x,y" at size 1, x1000).
function vertexPos(vKey) {
  const [x, y] = vKey.split(',').map(Number);
  return { x: (x / 1000) * HEX_SIZE, y: (y / 1000) * HEX_SIZE };
}

function boardBounds(hexes) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const h of hexes) {
    const c = hexCenter(h);
    minX = Math.min(minX, c.x - HEX_SIZE); maxX = Math.max(maxX, c.x + HEX_SIZE);
    minY = Math.min(minY, c.y - HEX_SIZE); maxY = Math.max(maxY, c.y + HEX_SIZE);
  }
  const m = 40;
  return { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
}

function edgeMid(game, edgeKey) {
  const e = game.edges.get(edgeKey);
  const a = vertexPos(e.v1);
  const b = vertexPos(e.v2);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}

// Circle orb control — same law as the classic board: plain circle orbs,
// one symbol, no words on the orb face, label underneath.
function Orb({ symbol, label, onClick, disabled, active, small }) {
  const size = small ? 44 : 56;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: small ? 56 : 68 }}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        style={{
          width: size, height: size, borderRadius: '50%',
          border: active ? '3px solid #fbbf24' : '2px solid rgba(255,255,255,0.35)',
          background: disabled ? '#3f3f46' : active ? '#78350f' : '#27272a',
          color: '#fff', fontSize: small ? 20 : 26, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
          padding: 0, flexShrink: 0,
        }}
      >
        {symbol}
      </button>
      <span style={{ fontSize: 11, color: '#d4d4d8', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </span>
  );
}

// Give/get picker for player-to-player offers: tap + / − per card.
function CountPicker({ values, onChange, limits }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {TRADEABLE.map((k) => {
        const v = values[k] || 0;
        const max = limits ? (limits[k] ?? 0) : 99;
        if (limits && max <= 0 && v <= 0) return null;
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ flex: 1 }}>{cardIcon(k)} {cardLabel(k)}{limits ? ` (${max})` : ''}</span>
            <button type="button" aria-label={`Less ${cardLabel(k)}`} disabled={v <= 0}
              onClick={() => onChange(k, -1)}
              style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #555', background: '#27272a', color: '#fff', fontSize: 16, cursor: 'pointer' }}>−</button>
            <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{v}</span>
            <button type="button" aria-label={`More ${cardLabel(k)}`} disabled={v >= max}
              onClick={() => onChange(k, 1)}
              style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #555', background: '#27272a', color: '#fff', fontSize: 16, cursor: 'pointer' }}>+</button>
          </div>
        );
      })}
    </div>
  );
}

function cargoText(ship) {
  const parts = [];
  if (ship.cargo.settler > 0) parts.push('🧑‍🚀 settler');
  if (ship.cargo.crew > 0) parts.push(`👥 ${ship.cargo.crew} crew`);
  if (ship.cargo.spice > 0) parts.push(`🌶️ ${ship.cargo.spice} spice`);
  if (ship.cargo.fish > 0) parts.push('🐟 fish haul');
  return parts.join(' · ');
}

export default function ExplorersGame({ game, pid, onlineMode, move, onNewGame, logLines, notice, onFullscreen }) {
  const [selectedShip, setSelectedShip] = useState(null);
  const [buildMode, setBuildMode] = useState(null); // 'ship' | 'harbor' | null
  const [discardSel, setDiscardSel] = useState({});
  const [tradeOpen, setTradeOpen] = useState(false);
  const [offerTarget, setOfferTarget] = useState(null);
  const [offerGive, setOfferGive] = useState({});
  const [offerAsk, setOfferAsk] = useState({});
  const [counterOf, setCounterOf] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const me = game ? game.players[pid] : null;
  const actorId = game
    ? (game.phase === 'discard' && game.discardQueue.length > 0 ? game.discardQueue[0]
      : game.phase === 'placement' ? game.placementOrder[game.placementIndex]
      : onlineMode ? onlineActorId(game) : game.turn)
    : 0;
  const actor = game ? playerById(game, actorId) : null;
  const myTurn = !!game && !game.winner && actorId === pid;
  const isPlacement = game?.phase === 'placement';
  const canRoll = myTurn && game.phase === 'roll';
  const canBuild = myTurn && game.phase === 'build';
  const canMove = myTurn && game.phase === 'move';
  const mustDiscard = myTurn && game?.phase === 'discard';
  const mustPirate = myTurn && game?.phase === 'pirate';
  const incomingOffers = game ? openOffersFor(game, pid) : [];

  const bounds = game ? boardBounds(game.hexes) : { x: 0, y: 0, w: 100, h: 100 };

  const legalPlacement = game && isPlacement && actorId === pid ? legalPlacementSpots(game, pid) : [];
  const legalShipEdges = game && canBuild && buildMode === 'ship' ? legalShipBuildEdges(game, pid) : [];
  const legalHarbor = game && canBuild && buildMode === 'harbor' ? legalHarborSpots(game, pid) : [];
  const legalPirate = game && mustPirate ? legalPirateHexes(game) : [];
  const myShips = game ? shipsOf(game, pid) : [];
  const selShip = game && selectedShip != null ? game.ships.find((s) => s.id === selectedShip) : null;
  const legalMoves = game && canMove && selShip && selShip.player === pid ? legalShipMoves(game, pid, selShip.id) : [];
  const legalUnloads = game && canMove && selShip && selShip.player === pid ? legalSettlerUnloads(game, pid, selShip.id) : [];

  // The selected ship's neighbours, for the ship panel: what it can do
  // where it sits (computed from the board data, no engine import needed).
  const selEdge = selShip ? game.edges.get(selShip.edge) : null;
  const selAdjacentHexes = selEdge
    ? [...new Set([selEdge.v1, selEdge.v2].flatMap((vk) => game.vertices.get(vk)?.hexes || []))].map((id) => game.hexes[id])
    : [];
  const selNextToHarbor = selEdge ? [selEdge.v1, selEdge.v2].some((vk) => {
    const v = game.vertices.get(vk);
    return v?.settlement?.player === pid && v.settlement.kind === 'harbor';
  }) : false;
  const selLair = selShip ? selAdjacentHexes.find((h) => h && h.revealed && h.terrain === 'lair' && h.lair && !h.lair.defeated) : null;
  const selSpiceHex = selShip && cargoFree(selShip) >= 1
    ? selAdjacentHexes.find((h) => h && h.revealed && h.terrain === 'spice' && h.spice > 0) : null;
  const selFishHex = selShip && cargoFree(selShip) >= 2
    ? selAdjacentHexes.find((h) => h && h.revealed && h.terrain === 'fish' && h.fish > 0) : null;
  const selCommitted = selLair ? selLair.lair.assault.find((a) => a.shipId === selShip.id) : null;
  const selLairTotal = selLair ? selLair.lair.assault.reduce((n, a) => n + a.crew, 0) : 0;

  const discardTotal = Object.values(discardSel).reduce((a, n) => a + (n || 0), 0);
  const myLimits = me ? { ...me.resources, gold: me.gold } : {};

  function doMove(action) {
    setSelectedShip(null);
    move(action);
  }

  function toggleDiscard(r) {
    if (!mustDiscard) return;
    setDiscardSel((prev) => {
      const cur = { ...prev };
      const have = me.resources[r] || 0;
      if ((cur[r] || 0) >= have) delete cur[r];
      else if ((cur[r] || 0) >= game.discardNeed - discardTotal) { /* already at the count */ }
      else cur[r] = (cur[r] || 0) + 1;
      if ((cur[r] || 0) <= 0) delete cur[r];
      return cur;
    });
  }

  function onVertexTap(vKey) {
    if (!game || !myTurn) return;
    if (isPlacement && legalPlacement.includes(vKey)) { doMove({ type: 'placeSettlement', vertex: vKey }); return; }
    if (canBuild && buildMode === 'harbor' && legalHarbor.includes(vKey)) {
      doMove({ type: 'buildHarbor', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canMove && selShip && legalUnloads.includes(vKey)) {
      doMove({ type: 'unloadSettler', shipId: selShip.id, vertex: vKey });
    }
  }

  function onEdgeTap(edgeKey) {
    if (!game || !myTurn) return;
    if (canBuild && buildMode === 'ship' && legalShipEdges.includes(edgeKey)) {
      doMove({ type: 'buildShip', edge: edgeKey });
      setBuildMode(null);
      return;
    }
    if (canMove) {
      if (selShip && legalMoves.includes(edgeKey)) {
        doMove({ type: 'moveShip', shipId: selShip.id, to: edgeKey });
        return;
      }
      const shipHere = game.ships.find((s) => s.edge === edgeKey && s.player === pid);
      if (shipHere) { setSelectedShip(shipHere.id); return; }
      setSelectedShip(null);
    }
  }

  function onHexTap(hexId) {
    if (!game || !myTurn) return;
    if (mustPirate && legalPirate.includes(hexId)) doMove({ type: 'movePirate', hex: hexId });
  }

  function sendOffer() {
    const give = Object.fromEntries(Object.entries(offerGive).filter(([, n]) => n > 0));
    const ask = Object.fromEntries(Object.entries(offerAsk).filter(([, n]) => n > 0));
    if (!offerTarget || Object.keys(give).length === 0 || Object.keys(ask).length === 0) return;
    if (counterOf) {
      move({ type: 'respondTrade', offerId: counterOf.id, choice: 'counter', counterOffer: give, counterAsk: ask });
    } else {
      move({ type: 'offerTrade', to: offerTarget, offer: give, ask });
    }
    setTradeOpen(false);
    setCounterOf(null);
    setOfferGive({});
    setOfferAsk({});
  }

  if (!game) return null;
  const winner = game.winner !== null ? game.players[game.winner] : null;
  const waitingName = !game.winner && actorId !== pid ? actor?.name : null;

  const diceTotal = game.dice ? game.dice[0] + game.dice[1] : null;
  const rollTotal = game.phase === 'roll' ? null : diceTotal;
  const tiles = game.hexes.map((h) => {
    const c = hexCenter(h);
    return { id: h.id, terrain: h.revealed ? h.terrain : 'unexplored', token: h.token ?? null, cx: c.x, cy: c.y };
  });

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 12, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <OmegaMark size={36} />
          <h1 style={{ fontSize: 20, margin: '4px 0' }}>Explorers &amp; Pirates</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Fullscreen" onClick={onFullscreen}
            style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', background: '#27272a', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            ⛶
          </button>
          <button type="button" onClick={onNewGame}
            style={{ borderRadius: 999, border: '1px solid #555', background: '#27272a', color: '#fff', padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            New game
          </button>
        </div>
      </div>
      {notice && (
        <div style={{ background: '#7f1d1d', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 13 }}>{notice}</div>
      )}

      {/* Player strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
        {game.players.map((p) => {
          const vp = victoryPoints(game, p.id);
          const ships = shipsOf(game, p.id).length;
          const isActor = actorId === p.id && !game.winner;
          return (
            <div key={p.id} style={{
              background: '#141414', border: isActor ? '2px solid #fbbf24' : '1px solid #333',
              borderRadius: 8, padding: '6px 8px', fontSize: 11, lineHeight: 1.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLAYER_COLORS[p.id], flexShrink: 0 }} />
                <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              </div>
              <div>{vp} VP · 🏠 {p.settlements} · ⚓ {p.harbors} · 🚀 {ships}</div>
              <div>⚔️ {p.lairsDefeated} 🐟 {p.fishDelivered} 🌶️ {p.spiceDelivered}</div>
              {p.id === pid && <div>🪙 {p.gold} gold · 🧑‍🚀 {p.harborStock.settlers} 👥 {p.harborStock.crew}</div>}
            </div>
          );
        })}
      </div>

      {/* Dice + my hand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#141414', border: '1px solid #333', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 13 }}>
        {game.dice && (
          <span style={{ display: 'flex', gap: 4 }}>
            <DiceFace value={game.dice[0]} size={28} />
            <DiceFace value={game.dice[1]} size={28} />
          </span>
        )}
        {RESOURCES.map((r) => (
          <span key={r} title={RESOURCE_LABEL[r]}>{RESOURCE_ICON[r]} {me.resources[r] || 0}</span>
        ))}
        <span title="gold">🪙 {me.gold}</span>
        <span style={{ color: '#a1a1aa', fontSize: 12 }}>first to {EXPLORERS_WIN_TARGET} VP wins</span>
      </div>

      {/* Board: hex faces, video layer, top SVG */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: `${bounds.w} / ${bounds.h}`, overflow: 'hidden', borderRadius: 12, background: '#0b1026' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}>
          {game.hexes.map((h) => {
            const c = hexCenter(h);
            return <HexTileArt key={h.id} terrain={h.revealed ? h.terrain : 'unexplored'} size={HEX_SIZE} x={c.x - HEX_SIZE} y={c.y - HEX_SIZE} />;
          })}
        </svg>
        <TileVideoLayer tiles={tiles} bounds={bounds} size={HEX_SIZE} rollTotal={rollTotal} rollCount={game.rollCount} pirateMoveCount={0} voidPirateHex={game.pirateHex} />
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}>
          {/* Number tokens + mission counts */}
          {game.hexes.map((h) => {
            if (!h.revealed) return null;
            const c = hexCenter(h);
            return (
              <g key={`t${h.id}`}>
                {h.token != null && (
                  <g>
                    <circle cx={c.x} cy={c.y} r={13} fill="#f5f5f4" stroke="#a8a29e" strokeWidth={1} />
                    <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={(h.token === 6 || h.token === 8) ? '#dc2626' : '#111'}>{h.token}</text>
                  </g>
                )}
                {h.terrain === 'fish' && h.fish > 0 && (
                  <text x={c.x} y={c.y + 28} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">🐟×{h.fish}</text>
                )}
                {h.terrain === 'spice' && h.spice > 0 && (
                  <text x={c.x} y={c.y + 28} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">🌶️×{h.spice}</text>
                )}
                {h.terrain === 'lair' && h.lair && !h.lair.defeated && (
                  <text x={c.x} y={c.y + 28} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fca5a5">
                    ⚔️ {h.lair.assault.reduce((n, a) => n + a.crew, 0)}/{EXPLORERS_LAIR_STRENGTH}
                  </text>
                )}
                {h.terrain === 'lair' && h.lair && h.lair.defeated && (
                  <text x={c.x} y={c.y + 28} textAnchor="middle" fontSize={11} fontWeight={700} fill="#a7f3d0">⚔️ cleared</text>
                )}
              </g>
            );
          })}
          {/* Pirate ship */}
          {game.pirateHex != null && (() => {
            const c = hexCenter(game.hexes[game.pirateHex]);
            return <VoidPiratePiece x={c.x} y={c.y} size={30} />;
          })()}
          {/* Settlements + harbors */}
          {[...game.vertices.values()].filter((v) => v.settlement).map((v) => {
            const p = vertexPos(v.key);
            return v.settlement.kind === 'harbor'
              ? <HarborPiece key={v.key} x={p.x} y={p.y} size={26} color={PLAYER_COLORS[v.settlement.player]} />
              : <OutpostPiece key={v.key} x={p.x} y={p.y} size={26} color={PLAYER_COLORS[v.settlement.player]} />;
          })}
          {/* Ships */}
          {game.ships.map((s) => {
            const m = edgeMid(game, s.edge);
            const isSel = selShip && selShip.id === s.id;
            const cargo = cargoText(s);
            return (
              <g key={s.id}>
                {isSel && <circle cx={m.x} cy={m.y} r={20} fill="none" stroke="#fbbf24" strokeWidth={2.5} />}
                <StarshipPiece x={m.x} y={m.y} size={26} color={PLAYER_COLORS[s.player]} angle={m.angle} />
                {isSel && (
                  <text x={m.x} y={m.y - 24} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fbbf24">MP {s.mp}</text>
                )}
                {cargo && (
                  <text x={m.x} y={m.y + 24} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke">{cargo}</text>
                )}
              </g>
            );
          })}
          {/* Legal highlights */}
          {legalPlacement.map((vk) => {
            const p = vertexPos(vk);
            return <circle key={`hp-${vk}`} cx={p.x} cy={p.y} r={10} fill="none" stroke="#fbbf24" strokeWidth={2} />;
          })}
          {legalHarbor.map((vk) => {
            const p = vertexPos(vk);
            return <circle key={`hh-${vk}`} cx={p.x} cy={p.y} r={10} fill="none" stroke="#fbbf24" strokeWidth={2} />;
          })}
          {legalUnloads.map((vk) => {
            const p = vertexPos(vk);
            return <circle key={`hu-${vk}`} cx={p.x} cy={p.y} r={10} fill="none" stroke="#fbbf24" strokeWidth={2} />;
          })}
          {legalShipEdges.map((ek) => {
            const e = game.edges.get(ek);
            const a = vertexPos(e.v1);
            const b = vertexPos(e.v2);
            return <line key={`he-${ek}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={6} strokeLinecap="round" opacity={0.7} />;
          })}
          {legalMoves.map((ek) => {
            const e = game.edges.get(ek);
            const a = vertexPos(e.v1);
            const b = vertexPos(e.v2);
            return <line key={`hm-${ek}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={5} strokeLinecap="round" opacity={0.6} />;
          })}
          {legalPirate.map((hid) => (
            <polygon key={`hpix-${hid}`} points={hexPoints(game.hexes[hid])} fill="none" stroke="#fbbf24" strokeWidth={2.5} strokeDasharray="6 4" />
          ))}
          {/* Click targets (on top) */}
          {legalPirate.map((hid) => (
            <polygon key={`ct-${hid}`} points={hexPoints(game.hexes[hid])} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onHexTap(hid)} />
          ))}
          {[...new Set([...legalShipEdges, ...legalMoves, ...(canMove ? myShips.map((s) => s.edge) : [])])].map((ek) => {
            const e = game.edges.get(ek);
            if (!e) return null;
            const a = vertexPos(e.v1);
            const b = vertexPos(e.v2);
            return (
              <line key={`ce-${ek}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} strokeLinecap="round" style={{ cursor: 'pointer' }} onClick={() => onEdgeTap(ek)} />
            );
          })}
          {[...new Set([...legalPlacement, ...legalHarbor, ...legalUnloads])].map((vk) => {
            const p = vertexPos(vk);
            return (
              <circle key={`cv-${vk}`} cx={p.x} cy={p.y} r={14} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onVertexTap(vk)} />
            );
          })}
        </svg>
      </div>

      {/* Phase panels */}
      {winner && (
        <div style={{ background: '#141414', border: '2px solid #fbbf24', borderRadius: 8, padding: 12, marginTop: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🏆 {winner.name} wins with {victoryPoints(game, winner.id)} points!</div>
          <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4 }}>
            Settlements {winner.settlements} · Harbors {winner.harbors} · Lairs {winner.lairsDefeated} · Fish {winner.fishDelivered} · Spice {winner.spiceDelivered}
          </div>
          <div style={{ marginTop: 10 }}><Orb symbol="↺" label="Play again" onClick={onNewGame} /></div>
        </div>
      )}

      {!winner && waitingName && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 13, color: '#d4d4d8' }}>
          {waitingName} is playing…
        </div>
      )}

      {myTurn && isPlacement && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 13 }}>
          Place your settlement — tap a glowing vertex. Settle on the coast so you can launch ships.
          Your second settlement pays you the resources of its neighbouring hexes.
        </div>
      )}

      {canRoll && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <Orb symbol="🎲" label="Roll" onClick={() => doMove({ type: 'roll' })} />
          <div style={{ fontSize: 13, color: '#d4d4d8', paddingTop: 8 }}>Roll the dice. On a 7 the pirate ship moves — and hands over 7 cards mean discarding half.</div>
        </div>
      )}

      {mustDiscard && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>A 7 was rolled — tap {game.discardNeed} card{game.discardNeed === 1 ? '' : 's'} to discard ({discardTotal}/{game.discardNeed}).</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RESOURCES.map((r) => {
              const n = me.resources[r] || 0;
              const sel = discardSel[r] || 0;
              if (n === 0) return null;
              return (
                <button key={r} type="button" onClick={() => toggleDiscard(r)}
                  style={{
                    borderRadius: 8, border: sel > 0 ? '2px solid #fbbf24' : '1px solid #555',
                    background: '#27272a', color: '#fff', padding: '6px 10px', cursor: 'pointer', fontSize: 14,
                  }}>
                  {RESOURCE_ICON[r]} {n}{sel > 0 ? ` (−${sel})` : ''}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 10 }}>
            <Orb symbol="✓" label="Discard" disabled={discardTotal !== game.discardNeed}
              onClick={() => { doMove({ type: 'discard', cards: discardSel }); setDiscardSel({}); }} />
          </div>
        </div>
      )}

      {mustPirate && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 13 }}>
          Move the pirate ship — tap a glowing sea hex. It steals from a ship on that hex, and no ship can pass it without crew or a gold tribute.
        </div>
      )}

      {canBuild && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Orb symbol="🚀" label="Ship" active={buildMode === 'ship'}
              disabled={myShips.length >= EXPLORERS_SHIP_MAX}
              onClick={() => setBuildMode(buildMode === 'ship' ? null : 'ship')} />
            <Orb symbol="🧑‍🚀" label="Settler"
              onClick={() => doMove({ type: 'buildSettler' })} />
            <Orb symbol="👥" label="Crew" onClick={() => doMove({ type: 'buildCrew' })} />
            <Orb symbol="⚓" label="Harbor" active={buildMode === 'harbor'}
              disabled={me.harbors >= 2}
              onClick={() => setBuildMode(buildMode === 'harbor' ? null : 'harbor')} />
            <Orb symbol="🔄" label="Trade" onClick={() => { setTradeOpen(true); setCounterOf(null); }} />
            <Orb symbol="⛵" label="Set sail" onClick={() => doMove({ type: 'endBuild' })} />
          </div>
          <div style={{ fontSize: 11, color: '#a1a1aa', textAlign: 'center', marginTop: 6 }}>
            Ship {EXPLORERS_COSTS.ship.iron} iron + {EXPLORERS_COSTS.ship.silicon} silicon · Settler 1 iron + 1 water-ice + 1 silicon + 1 titanium ·
            Crew {EXPLORERS_COSTS.crew.iron} iron + {EXPLORERS_COSTS.crew.gold} gold · Harbor {EXPLORERS_COSTS.harbor.titanium} titanium + {EXPLORERS_COSTS.harbor.gold} gold ·
            2 gold buys 1 resource · 3 of one resource sells for 1 gold
          </div>
          {buildMode === 'ship' && (
            <div style={{ fontSize: 13, textAlign: 'center', marginTop: 6 }}>Tap a glowing sea edge next to one of your settlements to launch a ship.</div>
          )}
          {buildMode === 'harbor' && (
            <div style={{ fontSize: 13, textAlign: 'center', marginTop: 6 }}>Tap one of your settlements to raise it into a harbor (2 points, builds settlers and crew).</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: '#d4d4d8' }}>Gold:</span>
            {RESOURCES.map((r) => (
              <button key={`buy-${r}`} type="button" disabled={me.gold < 2}
                onClick={() => doMove({ type: 'buyResource', resource: r })}
                style={{ borderRadius: 999, border: '1px solid #555', background: '#27272a', color: '#fff', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>
                2🪙 → {RESOURCE_ICON[r]}
              </button>
            ))}
            {RESOURCES.map((r) => (
              <button key={`sell-${r}`} type="button" disabled={(me.resources[r] || 0) < 3}
                onClick={() => doMove({ type: 'sellResource', resource: r })}
                style={{ borderRadius: 999, border: '1px solid #555', background: '#27272a', color: '#fff', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>
                3{RESOURCE_ICON[r]} → 1🪙
              </button>
            ))}
          </div>
        </div>
      )}

      {canMove && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: 10, marginTop: 8 }}>
          {!selShip && (
            <div style={{ fontSize: 13, textAlign: 'center' }}>Tap one of your ships to sail it — each ship moves up to {EXPLORERS_SHIP_MP} steps, one per tap.</div>
          )}
          {selShip && (
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Ship — {selShip.mp} move{selShip.mp === 1 ? '' : 's'} left · hold: {cargoText(selShip) || 'empty'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Orb symbol="🧑‍🚀" label="Load settler" small
                  disabled={!selNextToHarbor || me.harborStock.settlers < 1 || cargoFree(selShip) < 2}
                  onClick={() => doMove({ type: 'loadSettler', shipId: selShip.id })} />
                <Orb symbol="👥" label="Load crew" small
                  disabled={!selNextToHarbor || me.harborStock.crew < 1 || cargoFree(selShip) < 1}
                  onClick={() => doMove({ type: 'loadCrew', shipId: selShip.id, count: 1 })} />
                <Orb symbol="👥" label="Unload crew" small
                  disabled={!selNextToHarbor || selShip.cargo.crew < 1}
                  onClick={() => doMove({ type: 'unloadCrew', shipId: selShip.id, count: 1 })} />
                <Orb symbol="🌶️" label="Load spice" small
                  disabled={!selSpiceHex}
                  onClick={() => doMove({ type: 'loadSpice', shipId: selShip.id })} />
                <Orb symbol="🐟" label="Load fish" small
                  disabled={!selFishHex}
                  onClick={() => doMove({ type: 'loadFish', shipId: selShip.id })} />
                <Orb symbol="🌶️" label="Deliver spice" small
                  disabled={!selNextToHarbor || selShip.cargo.spice < 1}
                  onClick={() => doMove({ type: 'unloadSpice', shipId: selShip.id })} />
                <Orb symbol="🐟" label="Deliver fish" small
                  disabled={!selNextToHarbor || selShip.cargo.fish < 1}
                  onClick={() => doMove({ type: 'unloadFish', shipId: selShip.id })} />
                <Orb symbol="⚔️" label="Join lair" small
                  disabled={!selLair || selShip.cargo.crew < 1 || (selCommitted && selCommitted.crew >= selShip.cargo.crew)}
                  onClick={() => doMove({ type: 'joinLair', shipId: selShip.id, lairHexId: selLair.id, crew: selShip.cargo.crew })} />
                <Orb symbol="🏴‍☠️" label="Attack lair" small
                  disabled={!selLair || selLairTotal < EXPLORERS_LAIR_STRENGTH}
                  onClick={() => doMove({ type: 'attackLair', lairHexId: selLair.id })} />
              </div>
              {selLair && (
                <div style={{ fontSize: 12, color: '#d4d4d8', textAlign: 'center', marginTop: 6 }}>
                  Pirate lair: {selLairTotal}/{EXPLORERS_LAIR_STRENGTH} crew committed.
                  {selLairTotal >= EXPLORERS_LAIR_STRENGTH ? ' Strong enough — attack for 2 points and 2 gold.' : ' Commit more crew, or sail a second ship in.'}
                </div>
              )}
              {selShip.cargo.settler > 0 && (
                <div style={{ fontSize: 12, color: '#d4d4d8', textAlign: 'center', marginTop: 6 }}>
                  Carrying a settler — sail to a coast and tap a glowing vertex to land them.
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            <Orb symbol="✓" label="End turn" onClick={() => doMove({ type: 'endTurn' })} />
          </div>
        </div>
      )}

      {/* Trade panel */}
      {myTurn && tradeOpen && (
        <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            {counterOf ? `Counter ${playerById(game, counterOf.from)?.name}'s offer` : 'Offer a trade'}
          </div>
          {!counterOf && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {game.players.filter((p) => p.id !== pid).map((p) => (
                <button key={p.id} type="button" onClick={() => setOfferTarget(p.id)}
                  style={{
                    borderRadius: 999, border: offerTarget === p.id ? '2px solid #fbbf24' : '1px solid #555',
                    background: '#27272a', color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 13,
                  }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>You give</div>
              <CountPicker values={offerGive} limits={myLimits}
                onChange={(k, d) => setOfferGive((prev) => ({ ...prev, [k]: Math.max(0, Math.min(myLimits[k] || 0, (prev[k] || 0) + d)) }))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>You ask</div>
              <CountPicker values={offerAsk}
                onChange={(k, d) => setOfferAsk((prev) => ({ ...prev, [k]: Math.max(0, (prev[k] || 0) + d) }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Orb symbol="✉️" label={counterOf ? 'Send counter' : 'Send offer'} onClick={sendOffer} />
            <Orb symbol="✕" label="Close" onClick={() => { setTradeOpen(false); setCounterOf(null); }} />
          </div>
        </div>
      )}

      {/* Incoming offers */}
      {incomingOffers.map((o) => (
        <div key={o.id} style={{ background: '#141414', border: '1px solid #fbbf24', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>
            {playerById(game, o.from)?.name} offers {Object.entries(o.offer).map(([k, n]) => `${n} ${cardLabel(k)}`).join(', ')} for {Object.entries(o.ask).map(([k, n]) => `${n} ${cardLabel(k)}`).join(', ')}.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Orb symbol="✓" label="Accept" small onClick={() => move({ type: 'respondTrade', offerId: o.id, choice: 'accept' })} />
            <Orb symbol="✕" label="Decline" small onClick={() => move({ type: 'respondTrade', offerId: o.id, choice: 'decline' })} />
            <Orb symbol="🔄" label="Counter" small onClick={() => { setCounterOf(o); setTradeOpen(true); setOfferGive({}); setOfferAsk({}); }} />
          </div>
        </div>
      ))}

      {/* Log */}
      <div ref={logRef} style={{ background: '#0f0f0f', border: '1px solid #333', borderRadius: 8, padding: '8px 10px', marginTop: 8, maxHeight: 120, overflowY: 'auto', fontSize: 12, lineHeight: 1.5, color: '#d4d4d8' }}>
        {(logLines || []).map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
