// app/starforge/page.jsx — Starforge: solo vs 3 agents,
// or online rooms (host + join code, agents fill empty seats), with the
// Starfarers / Stations & Starfighters / Harvesters / Rover Caravans expansions and
// human-to-human trading in online games.
// Engine in lib/starforge/engine.js (pure logic). Solo turns run
// here through pumpAi() (Monopoly pattern); online turns go through the
// room API (POST .../action) and agents step server-side — the client
// NEVER steps AI in online mode. Who must act is onlineActorId(), not
// always the turn player (discard queue, voidFleet loser, placement).
//
// Laws: circle orb controls (plain circle orbs, per-function symbol, no
// words ON the orb face; fullscreen orb top-right), no-overlap (normal
// flow, stacked panels), plain English throughout.

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RESOURCES, RESOURCE_LABEL, RESOURCE_ICON,
  COMMODITIES, COMMODITY_LABEL, COMMODITY_ICON,
  IMPROVEMENT_TRACKS, IMPROVEMENT_LABEL, IMPROVEMENT_COMMODITY,
  PROGRESS_LABEL, BIOMASS_COSTS, VOID_FLEET_TRACK_LENGTH,
  axialToPixel,
  createGame, currentPlayer, playerById,
  legalOutpostSpots, legalWarpLaneSpots, legalStarshipSpots, legalStarshipMoveDestinations,
  legalStarfighterSpots, legalRoverSpots, legalDowngradeStations,
  legalVoidPirateHexes, legalCorsairHexes,
  placeOutpost, placeWarpLane, placeStarship, moveStarship, buildStation,
  rollDice, discardCards, moveVoidPirate, moveCorsair,
  tradeRate, tradeWithBank, buyDevCard, playStarfighter, playMarketCorner,
  playSupplyDrop, playWarpLaneRush, canPlayDev, endTurn,
  chooseFreeResource, spendBiomass, passScrapHull, placeRover,
  buyImprovement, buyStarfighter, activateStarfighter, upgradeStarfighter, starfighterAction,
  buildWall, playProgressCard, downgradeStation,
  offerTrade, respondTrade,
  victoryPoints, vpBreakdown, aiStep,
  deserializeState, onlineActorId, openOffersFor, pendingFreePicks, phaseReason,
  expansionsOn, winTarget, winTargetFor,
} from '@/lib/starforge/engine.js';
import {
  createTileHold, tileHoldWake, tileHoldDuration, tileHoldEnd, tileHoldActive,
  tileHoldBackstopMs,
} from '@/lib/starforge/tile-hold.js';
import {
  OmegaMark, HexTileArt, TileVideoLayer, TradeHubArt, CardFace, CardBack, DiceFace,
  VoidFleetShipMarker, OutpostPiece, StationPiece, WarpLanePiece, StarshipPiece,
  StarfighterPiece, VoidPiratePiece, CorsairPiece, MenuArt,
} from '@/components/starforge/graphics.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEX_SIZE = 34;
const TRADEABLE = [...RESOURCES, ...COMMODITIES];
const cardIcon = (k) => RESOURCE_ICON[k] || COMMODITY_ICON[k] || '🃏';
const cardLabel = (k) => RESOURCE_LABEL[k] || COMMODITY_LABEL[k] || k;

// Background: a universe from Myriad — public/images/myriad/bg.webp, the
// house Myriad sky (palette #0b1026 / #4c1d95 / #a78bfa), with a nebula
// layer in the same palette over it. Same asset Myriad itself uses.
const MYRIAD_BG = {
  backgroundColor: '#0b1026',
  backgroundImage: `radial-gradient(ellipse 60% 40% at 70% 8%, rgba(167,139,250,0.25), transparent 70%), radial-gradient(ellipse 50% 35% at 12% 88%, rgba(76,29,149,0.4), transparent 70%), linear-gradient(rgba(11,16,38,0.82), rgba(11,16,38,0.9)), url('/images/myriad/bg.webp')`,
  backgroundSize: 'cover',
  backgroundPosition: 'center top',
};

const EXPANSION_INFO = [
  { key: 'starfarers', name: 'Starfarers', desc: 'Starships, new islands, gold veins and the corsair.' },
  { key: 'stationsStarfighters', name: 'Stations & Starfighters', desc: 'Commodities, improvements, starfighters and the void fleets.' },
  { key: 'harvesters', name: 'Harvesters', desc: 'Biomass tokens to spend, and the scrap hull.' },
  { key: 'caravans', name: 'Rover Caravans', desc: 'Rovers on the rover route, worth extra points.' },
];

// Progress cards that need a pick before they can be played, and what pick.
const PROGRESS_PICK = {
  bishop: 'hex', merchant: 'hex', inventor: 'hex2',
  deserter: 'vertex', intrigue: 'vertex', diplomat: 'edge',
  alchemist: 'dice', resourceCorner: 'resource', tradeCorner: 'commodity',
};

const BIOMASS_MENU = [
  { action: 'removeVoidPirate', label: 'Void Pirate leaves the board', cost: BIOMASS_COSTS.removeVoidPirate },
  { action: 'steal', label: 'Steal 1 card from a player', cost: BIOMASS_COSTS.steal },
  { action: 'resource', label: 'Take 1 resource of your choice', cost: BIOMASS_COSTS.resource },
  { action: 'warpLane', label: 'A free warp lane or starship', cost: BIOMASS_COSTS.warpLane },
  { action: 'devCard', label: 'A development card', cost: BIOMASS_COSTS.devCard },
];

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
  const m = 52; // room for the coastal hubs
  return { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
}

function hubPos(hub, game) {
  const e = game.edges.get(hub.edgeKey);
  const a = vertexPos(e.v1);
  const b = vertexPos(e.v2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(mx, my) || 1;
  return { x: mx + (mx / len) * 26, y: my + (my / len) * 26 };
}

function edgeMid(game, edgeKey) {
  const e = game.edges.get(edgeKey);
  const a = vertexPos(e.v1);
  const b = vertexPos(e.v2);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}

function Orb({ symbol, label, onClick, disabled, active, small, image }) {
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
          background: image ? '#0b1026' : disabled ? '#3f3f46' : active ? '#78350f' : '#27272a',
          color: '#fff', fontSize: small ? 20 : 26, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
          padding: 0, flexShrink: 0, overflow: 'hidden',
        }}
      >
        {image ? <img src={image} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} /> : symbol}
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

function cardListText(map) {
  return Object.entries(map)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${cardLabel(k).toLowerCase()}`)
    .join(', ');
}

export default function StarforgePage() {
  const gameRef = useRef(null);
  const pumpRef = useRef(false);
  const logRef = useRef(null);
  const pollRef = useRef(null);
  // Tile-video hold (Merlin, Nov 21): after a roll or pirate landing wakes
  // tiles, the turn lasts at least as long as the video. playing counts
  // woken tiles still playing; maxDurationMs is the longest video
  // duration reported so far (read off the video elements, never
  // hardcoded); timer is the backstop that ends the hold. The transitions
  // live in lib/starforge/tile-hold.js; this is the React/timer shell.
  // In-memory UI state only — never persisted — so a reload always
  // restores a playable game with no hold.
  const tileHoldRef = useRef({ ...createTileHold(), timer: null });
  const [tileHold, setTileHold] = useState(false);
  const [, setTick] = useState(0);
  const tick = () => setTick((t) => t + 1);

  // ---- screens & rooms ----
  const [screen, setScreen] = useState('menu'); // 'menu' | 'lobby' | 'game'
  const [onlineMode, setOnlineMode] = useState(false);
  const [playerName, setPlayerName] = useState('You');
  const [expansions, setExpansions] = useState({ starfarers: false, stationsStarfighters: false, harvesters: false, caravans: false });
  const [roomCode, setRoomCode] = useState('');
  const [playerToken, setPlayerToken] = useState('');
  const [mySeat, setMySeat] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [hostSeat, setHostSeat] = useState(null);
  const [roomPlayers, setRoomPlayers] = useState([]); // { name, seat, online }
  const [roomExpansions, setRoomExpansions] = useState({});
  const [joinCode, setJoinCode] = useState('');
  const [onlineError, setOnlineError] = useState('');
  const [connected, setConnected] = useState(true);

  // ---- play state ----
  const [buildMode, setBuildMode] = useState(null); // 'warpLane' | 'outpost' | 'station' | 'starship' | 'starshipMove' | 'starfighter' | 'wall' | null
  const [tradeOpen, setTradeOpen] = useState(false);
  const [giveSel, setGiveSel] = useState(null);
  const [getSel, setGetSel] = useState(null);
  const [devOpen, setDevOpen] = useState(false);
  const [devPick, setDevPick] = useState(null); // 'marketCorner' | 'supplyDrop' | null
  const [yopPicks, setYopPicks] = useState([]);
  const [discardSel, setDiscardSel] = useState({});
  const [logLines, setLogLines] = useState([]);
  const [notice, setNotice] = useState('');
  // Expansion modes
  const [starstarshipMoveFrom, setStarshipMoveFrom] = useState(null);
  const [voidPirateChoice, setVoidPirateChoice] = useState(null); // 'voidPirate' | 'corsair' | null
  const [progOpen, setProgOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [progPick, setProgPick] = useState(null); // progress card type awaiting a pick
  const [progHexA, setProgHexA] = useState(null);
  const [progDice, setProgDice] = useState({ d1: null, d2: null });
  const [starfighterOpen, setStarfighterOpen] = useState(false);
  const [selectedStarfighter, setSelectedStarfighter] = useState(null);
  const [starfighterMoveFrom, setStarfighterMoveFrom] = useState(null);
  const [biomassOpen, setBiomassOpen] = useState(false);
  const [biomassPick, setBiomassPick] = useState(null); // 'steal' | 'resource' | null
  const [scrapHullOpen, setScrapHullOpen] = useState(false);
  // Trade offers (online only)
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerTarget, setOfferTarget] = useState(null);
  const [offerGive, setOfferGive] = useState({});
  const [offerAsk, setOfferAsk] = useState({});
  const [counterOf, setCounterOf] = useState(null); // offer being countered

  const game = gameRef.current;
  const ex = game ? expansionsOn(game) : {};
  const pid = onlineMode ? mySeat : 0;
  const me = game ? game.players[pid] : null;
  const cur = game ? currentPlayer(game) : null;
  // Who must act right now — discard-queue head / voidFleet loser /
  // placement actor / turn player. NOT always the turn player.
  const actorId = game
    ? (onlineMode ? onlineActorId(game)
      : game.phase === 'discard' && game.discardQueue.length > 0 ? game.discardQueue[0]
      : game.phase === 'voidFleet' && game.voidFleetLosers.length > 0 ? game.voidFleetLosers[0]
      : game.turn)
    : 0;
  const actor = game ? playerById(game, actorId) : null;
  const myTurn = !!game && !game.winner && actorId === pid;
  const isPlacement = game?.phase === 'placement';
  const canRoll = myTurn && game.phase === 'roll';
  const canAct = myTurn && game.phase === 'play';
  const mustDiscard = myTurn && game?.phase === 'discard';
  const mustVoidPirate = myTurn && game?.phase === 'voidPirate';
  const mustVoidFleet = myTurn && game?.phase === 'voidFleet';
  const freePicks = game && me ? pendingFreePicks(game, pid) : 0;
  const incomingOffers = game && onlineMode ? openOffersFor(game, pid) : [];

  const legalOutposts = game && ((isPlacement && actorId === pid) || (canAct && buildMode === 'outpost'))
    ? legalOutpostSpots(game, pid) : [];
  const legalWarpLanes = game && ((isPlacement && actorId === pid && game.placementStep === 'warpLane')
    || (canAct && (buildMode === 'warpLane' || game.freeLanes > 0)))
    ? legalWarpLaneSpots(game, pid) : [];
  const legalStarships = game && ex.starfarers && ((isPlacement && actorId === pid && game.placementStep === 'warpLane')
    || (canAct && (buildMode === 'starship' || game.freeLanes > 0)))
    ? legalStarshipSpots(game, pid) : [];
  const legalStarfighters = game && ex.stationsStarfighters && canAct && buildMode === 'starfighter'
    ? legalStarfighterSpots(game, pid) : [];
  const legalRovers = game && ex.caravans && game.roverPending?.player === pid
    ? legalRoverSpots(game, pid) : [];
  const legalDowngrade = game && mustVoidFleet ? legalDowngradeStations(game, pid) : [];
  const legalVoidPirate = game && mustVoidPirate && voidPirateChoice !== 'corsair' ? legalVoidPirateHexes(game) : [];
  const legalCorsair = game && mustVoidPirate && voidPirateChoice === 'corsair' ? legalCorsairHexes(game) : [];
  const starshipMoveDests = game && starstarshipMoveFrom ? legalStarshipMoveDestinations(game, pid, starstarshipMoveFrom) : [];
  const myCities = game ? [...game.vertices.values()].filter((v) => v.outpost?.player === pid && v.outpost.kind === 'outpost') : [];
  const myWallCities = game ? [...game.vertices.values()].filter((v) => v.outpost?.player === pid && v.outpost.kind === 'station' && v.wall === null) : [];
  const myStarfighters = game ? [...game.vertices.values()].filter((v) => v.starfighter?.player === pid) : [];

  function applyEvents(events) {
    if (!events || events.length === 0) return;
    setLogLines((prev) => [...prev, ...events].slice(-60));
    const last = events[events.length - 1];
    if (last && (last.includes('Not enough') || last.includes('not open') || last.includes('must touch') || last.includes('not your') || last.includes('No ') || last.includes('cannot') || last.includes('need'))) {
      setNotice(last);
    }
  }

  // Local (solo) dispatch: one action object, same shapes as the server's
  // applyOnlineAction, so solo and online handlers stay identical.
  function dispatchLocal(action) {
    const g = gameRef.current;
    if (!g) return [];
    switch (action.type) {
      case 'roll': return rollDice(g);
      case 'discard': return discardCards(g, pid, action.cards);
      case 'endTurn': return endTurn(g);
      case 'placeOutpost': return placeOutpost(g, pid, action.vertex);
      case 'placeWarpLane': return placeWarpLane(g, pid, action.edge);
      case 'placeStarship': return placeStarship(g, pid, action.edge);
      case 'moveStarship': return moveStarship(g, pid, action.from, action.to);
      case 'buildStation': return buildStation(g, pid, action.vertex);
      case 'buyDevCard': return buyDevCard(g, pid);
      case 'playStarfighter': return playStarfighter(g, pid);
      case 'playMarketCorner': return playMarketCorner(g, pid, action.resource);
      case 'playSupplyDrop': return playSupplyDrop(g, pid, action.r1, action.r2);
      case 'playWarpLaneRush': return playWarpLaneRush(g, pid);
      case 'tradeWithBank': return tradeWithBank(g, pid, action.give, action.get);
      case 'chooseFreeResource': return chooseFreeResource(g, pid, action.resource);
      case 'moveVoidPirate': return moveVoidPirate(g, pid, action.hex);
      case 'moveCorsair': return moveCorsair(g, pid, action.hex);
      case 'spendBiomass': return spendBiomass(g, pid, action.action, action);
      case 'passScrapHull': return passScrapHull(g, pid, action.to);
      case 'placeRover': return placeRover(g, pid, action.edge);
      case 'buyImprovement': return buyImprovement(g, pid, action.track);
      case 'buyStarfighter': return buyStarfighter(g, pid, action.vertex);
      case 'activateStarfighter': return activateStarfighter(g, pid, action.vertex);
      case 'upgradeStarfighter': return upgradeStarfighter(g, pid, action.vertex);
      case 'starfighterAction': return starfighterAction(g, pid, action.from, action.to);
      case 'buildWall': return buildWall(g, pid, action.vertex);
      case 'playProgressCard': return playProgressCard(g, pid, action.cardType, action);
      case 'downgradeStation': return downgradeStation(g, pid, action.vertex);
      case 'offerTrade': return offerTrade(g, pid, action.to, action.offer, action.ask);
      case 'respondTrade': return respondTrade(g, action.offerId, pid, action.choice, action.counterOffer, action.counterAsk);
      default: return [];
    }
  }

  // Every move goes through here: online posts to the room route (the
  // server steps agent seats), solo runs the engine directly.
  async function move(action) {
    if (onlineMode) { await onlineAct(action); return; }
    const events = dispatchLocal(action);
    applyEvents(events);
    tick();
  }

  // ---- online rooms (authoritative server, poll every 2.5s) ----
  async function onlineAct(action) {
    setOnlineError('');
    try {
      const res = await fetch(`/api/settlers/rooms/${encodeURIComponent(roomCode)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: playerToken, action }),
      });
      const data = await res.json();
      if (!data.ok) { setOnlineError(data.error || 'That move was rejected.'); setNotice(data.error || 'That move was rejected.'); return; }
      gameRef.current = deserializeState(data.state);
      applyEvents(data.events);
      setLogLines(gameRef.current.log.slice());
      tick();
    } catch {
      setOnlineError('Connection lost — check your signal and try again.');
    }
  }

  async function createOnlineRoom() {
    setOnlineError('');
    const nm = (playerName || '').trim() || 'Player 1';
    try {
      const res = await fetch('/api/settlers/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nm, expansions }),
      });
      const data = await res.json();
      if (!data.ok) { setOnlineError(data.error || 'Could not create the room.'); return; }
      setRoomCode(data.code);
      setPlayerToken(data.playerToken);
      setMySeat(data.seat);
      setIsHost(true);
      setHostSeat(data.seat);
      setRoomExpansions(data.expansions || expansions);
      setOnlineMode(true);
      setScreen('lobby');
    } catch {
      setOnlineError('Connection failed. Try again.');
    }
  }

  async function joinOnlineRoom() {
    setOnlineError('');
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setOnlineError('Enter the 6-character room code.'); return; }
    const nm = (playerName || '').trim() || 'Player';
    try {
      const res = await fetch('/api/settlers/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: nm }),
      });
      const data = await res.json();
      if (!data.ok) { setOnlineError(data.error || 'Could not join the room.'); return; }
      setRoomCode(code);
      setPlayerToken(data.playerToken);
      setMySeat(data.seat);
      setIsHost(false);
      if (data.name) setPlayerName(data.name);
      setRoomExpansions(data.expansions || {});
      setOnlineMode(true);
      setScreen('lobby');
    } catch {
      setOnlineError('Connection failed. Try again.');
    }
  }

  async function startOnlineGame() {
    setOnlineError('');
    try {
      const res = await fetch(`/api/settlers/rooms/${encodeURIComponent(roomCode)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: playerToken }),
      });
      const data = await res.json();
      if (!data.ok) { setOnlineError(data.error || 'Could not start the game.'); return; }
      if (data.state) {
        gameRef.current = deserializeState(data.state);
        endTileHold();
        resetPanels();
        setLogLines(gameRef.current.log.slice());
        setScreen('game');
        tick();
      }
    } catch {
      setOnlineError('Connection failed. Try again.');
    }
  }

  function leaveOnline() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    gameRef.current = null;
    endTileHold();
    setOnlineMode(false);
    setScreen('menu');
    setRoomCode('');
    setPlayerToken('');
    setMySeat(0);
    setIsHost(false);
    setHostSeat(null);
    setRoomPlayers([]);
    setRoomExpansions({});
    setJoinCode('');
    setOnlineError('');
    setConnected(true);
    setLogLines([]);
    setNotice('');
    tick();
  }

  useEffect(() => {
    if (!onlineMode || (screen !== 'lobby' && screen !== 'game')) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/settlers/rooms/${encodeURIComponent(roomCode)}?token=${encodeURIComponent(playerToken)}`);
        const data = await res.json();
        if (stopped) return;
        if (!data.ok) {
          setConnected(false);
          if (data.error) setOnlineError(data.error);
          return;
        }
        setConnected(true);
        setRoomPlayers(data.players || []);
        setIsHost(!!data.isHost);
        if (data.hostSeat !== undefined && data.hostSeat !== null) setHostSeat(data.hostSeat);
        if (typeof data.yourSeat === 'number') setMySeat(data.yourSeat);
        if (data.expansions) setRoomExpansions(data.expansions);
        if (data.status === 'playing' && data.state) {
          gameRef.current = deserializeState(data.state);
          setLogLines(gameRef.current.log.slice());
          if (screen === 'lobby') { resetPanels(); setScreen('game'); }
          tick();
        }
      } catch {
        if (!stopped) setConnected(false);
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    pollRef.current = id;
    return () => { stopped = true; clearInterval(id); pollRef.current = null; };
  }, [onlineMode, screen, roomCode, playerToken]);

  function resetPanels() {
    setBuildMode(null); setTradeOpen(false); setDevOpen(false); setDevPick(null);
    setYopPicks([]); setDiscardSel({}); setGiveSel(null); setGetSel(null);
    setNotice(''); setStarshipMoveFrom(null); setVoidPirateChoice(null);
    setProgOpen(false); setProgPick(null); setProgHexA(null); setProgDice({ d1: null, d2: null });
    setStarfighterOpen(false); setSelectedStarfighter(null); setStarfighterMoveFrom(null);
    setBiomassOpen(false); setBiomassPick(null); setScrapHullOpen(false);
    setOfferOpen(false); setOfferTarget(null); setOfferGive({}); setOfferAsk({});
    setCounterOf(null);
  }

  function startSolo() {
    gameRef.current = createGame(Math.floor(Math.random() * 1000000000), (playerName || '').trim() || 'You', { expansions });
    endTileHold();
    resetPanels();
    setOnlineMode(false);
    setLogLines(gameRef.current.log.slice());
    setScreen('game');
    tick();
  }

  function newGame() {
    if (onlineMode) { leaveOnline(); return; }
    startSolo();
  }

  // ---- Tile-video hold -------------------------------------------------
  // A woken tile reports its own duration; the hold lasts until every
  // woken tile has ended, or the backstop timer (longest reported duration
  // + grace) fires — whichever comes first. A tile whose video errors or
  // whose play() is rejected reports an end, so a failed video never
  // deadlocks the turn. With no duration reported at all (metadata still
  // loading), the failsafe timer bounds the hold instead.
  function clearTileHoldTimer() {
    const h = tileHoldRef.current;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
  }
  function endTileHold() {
    const h = tileHoldRef.current;
    clearTileHoldTimer();
    h.playing = 0;
    h.maxDurationMs = 0;
    setTileHold(false);
  }
  function armTileHoldTimer() {
    const h = tileHoldRef.current;
    clearTileHoldTimer();
    h.timer = setTimeout(() => { endTileHold(); }, tileHoldBackstopMs(h));
  }
  function onTileWake(durationMs, restart) {
    const h = tileHoldRef.current;
    tileHoldWake(h, durationMs, restart);
    setTileHold(true);
    armTileHoldTimer();
  }
  function onTileDuration(durationMs) {
    const h = tileHoldRef.current;
    tileHoldDuration(h, durationMs);
    if (tileHoldActive(h)) armTileHoldTimer();
  }
  function onTileEnd() {
    const h = tileHoldRef.current;
    tileHoldEnd(h);
    if (!tileHoldActive(h)) endTileHold();
  }
  // A hold never survives leaving the game: new game / leave / unmount
  // clears the timer so no stale hold can lock a later game.
  useEffect(() => () => { clearTileHoldTimer(); }, []);

  // Run AI turns until a human must act. Solo only — online agents step
  // server-side, and this client must never touch their seats.
  // The no-deps effect below runs this after every render, so the cheap
  // check FIRST: when no agent is due, return WITHOUT ticking — ticking
  // here would re-render, re-run the effect, and loop forever (React
  // caps it with "Maximum update depth exceeded" warnings).
  async function pumpAi() {
    if (pumpRef.current || onlineMode) return;
    const g = gameRef.current;
    const actingNow = g.phase === 'discard' && g.discardQueue.length > 0
      ? playerById(g, g.discardQueue[0])
      : g.phase === 'voidFleet' && g.voidFleetLosers.length > 0
        ? playerById(g, g.voidFleetLosers[0])
        : currentPlayer(g);
    if (!actingNow || !actingNow.isAI) return;
    if (!['placement', 'roll', 'discard', 'voidPirate', 'play', 'voidFleet'].includes(g.phase)) return;
    pumpRef.current = true;
    try {
      for (let guard = 0; guard < 400 && g && !g.winner; guard++) {
        const acting = g.phase === 'discard' && g.discardQueue.length > 0
          ? playerById(g, g.discardQueue[0])
          : g.phase === 'voidFleet' && g.voidFleetLosers.length > 0
            ? playerById(g, g.voidFleetLosers[0])
            : currentPlayer(g);
        if (!acting || !acting.isAI) break;
        if (!['placement', 'roll', 'discard', 'voidPirate', 'play', 'voidFleet'].includes(g.phase)) break;
        // Tile-video hold: an AI that rolled a waking number (or moved the
        // pirate) waits the video out before its next step — the same
        // minimum turn duration as a human turn. The wait sits AFTER the
        // 600 ms pacing sleep, not before it: a wake from the step that
        // just ran only reaches the page (React commit -> TileVideo
        // effect -> onTileWake) during that sleep, so a check before the
        // sleep can never see it and the next step would run during the
        // video. Online agents step server-side and cannot be paused from
        // here; the hold still gates the human's End Turn in online rooms.
        await sleep(600);
        while (tileHoldActive(tileHoldRef.current)) await sleep(100);
        const ev = aiStep(g);
        applyEvents(ev);
        tick();
      }
    } finally {
      pumpRef.current = false;
    }
  }

  useEffect(() => { if (screen === 'game' && !onlineMode) pumpAi(); });
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  function toggleExpansion(key) {
    setExpansions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function playProgress(type, args = {}) {
    move({ type: 'playProgressCard', cardType: type, ...args });
    setProgPick(null); setProgHexA(null); setProgDice({ d1: null, d2: null });
    setProgOpen(false);
  }

  function onProgressCardTap(type) {
    if (!PROGRESS_PICK[type]) { playProgress(type); return; }
    setProgPick(type);
    setProgHexA(null); setProgDice({ d1: null, d2: null });
  }

  function onVertexTap(vKey) {
    if (!game || game.winner || !myTurn) return;
    if (progPick === 'deserter' || progPick === 'intrigue') {
      playProgress(progPick, { vertex: vKey, from: selectedStarfighter });
      return;
    }
    if (starfighterMoveFrom) {
      move({ type: 'starfighterAction', from: starfighterMoveFrom, to: vKey });
      setStarfighterMoveFrom(null); setSelectedStarfighter(null);
      return;
    }
    if (isPlacement && game.placementStep === 'outpost') {
      move({ type: 'placeOutpost', vertex: vKey });
      return;
    }
    if (mustVoidFleet) {
      move({ type: 'downgradeStation', vertex: vKey });
      return;
    }
    if (canAct && buildMode === 'outpost') {
      move({ type: 'placeOutpost', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'station') {
      move({ type: 'buildStation', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'starfighter') {
      move({ type: 'buyStarfighter', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'wall') {
      move({ type: 'buildWall', vertex: vKey });
      setBuildMode(null);
      return;
    }
    const v = game.vertices.get(vKey);
    if (ex.stationsStarfighters && v?.starfighter?.player === pid) {
      setSelectedStarfighter(vKey);
      setStarfighterOpen(true);
      if (v.starfighter.active) setStarfighterMoveFrom(vKey);
      else setStarfighterMoveFrom(null);
    }
  }

  function onEdgeTap(edgeKey) {
    if (!game || game.winner || !myTurn) return;
    if (progPick === 'diplomat') {
      playProgress('diplomat', { edge: edgeKey });
      return;
    }
    if (game.roverPending?.player === pid) {
      move({ type: 'placeRover', edge: edgeKey });
      return;
    }
    if (starstarshipMoveFrom) {
      move({ type: 'moveStarship', from: starstarshipMoveFrom, to: edgeKey });
      setStarshipMoveFrom(null); setBuildMode(null);
      return;
    }
    if (buildMode === 'starshipMove') {
      const e = game.edges.get(edgeKey);
      if (e?.starship === pid) setStarshipMoveFrom(edgeKey);
      return;
    }
    if (isPlacement && game.placementStep === 'warpLane') {
      if (ex.starfarers && legalStarships.includes(edgeKey)) move({ type: 'placeStarship', edge: edgeKey });
      else move({ type: 'placeWarpLane', edge: edgeKey });
      return;
    }
    if (canAct && buildMode === 'warpLane') {
      move({ type: 'placeWarpLane', edge: edgeKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'starship') {
      move({ type: 'placeStarship', edge: edgeKey });
      setBuildMode(null);
      return;
    }
    if (canAct && game.freeLanes > 0) {
      if (ex.starfarers && legalStarships.includes(edgeKey)) move({ type: 'placeStarship', edge: edgeKey });
      else move({ type: 'placeWarpLane', edge: edgeKey });
      setBuildMode(null);
    }
  }

  function onHexTap(hexId) {
    if (!game || game.winner) return;
    if (progPick === 'bishop') { playProgress('bishop', { hex: hexId }); return; }
    if (progPick === 'merchant') { playProgress('merchant', { hex: hexId }); return; }
    if (progPick === 'inventor') {
      if (progHexA === null) { setProgHexA(hexId); return; }
      playProgress('inventor', { hexA: progHexA, hexB: hexId });
      return;
    }
    if (mustVoidPirate) {
      move({ type: voidPirateChoice === 'corsair' ? 'moveCorsair' : 'moveVoidPirate', hex: hexId });
      setVoidPirateChoice(null);
    }
  }

  function phaseHint() {
    if (!game) return '';
    if (game.winner) {
      const w = playerById(game, game.winner);
      return `🏆 ${w.name} wins with ${victoryPoints(game, w.id)} points!`;
    }
    if (isPlacement) {
      return actorId === pid
        ? (game.placementStep === 'outpost'
          ? 'Opening placement: tap a glowing corner to settle.'
          : 'Now tap a glowing warp lane — or a starship, on the coast — next to your new outpost.')
        : `${actor.name} is placing…`;
    }
    if (game.phase === 'roll') return actorId === pid ? 'Your turn — roll the dice.' : `${actor.name} is rolling…`;
    if (game.phase === 'discard') {
      return actorId === pid
        ? `Seven! You hold too many cards — discard ${game.discardNeed}.`
        : `Seven! ${actor.name} must discard ${game.discardNeed} cards.`;
    }
    if (game.phase === 'voidPirate') {
      return actorId === pid
        ? (ex.starfarers && game.voidPirateChoice ? 'Seven! Move the void pirate — or the corsair.' : 'Seven! Tap a hex to move the void pirate.')
        : `${actor.name} is moving the void pirate…`;
    }
    if (game.phase === 'voidFleet') {
      return actorId === pid
        ? 'The void fleets broke through — tap one of your stations to lose it (a metropolis station is safe).'
        : `${actor.name} must lose a station to the void fleets…`;
    }
    if (game.phase === 'play') {
      if (actorId !== pid) return `${actor.name} is playing…`;
      if (game.roverPending?.player === pid) return 'Place your rover — tap a glowing path next to your new outpost or station.';
      if (freePicks > 0) return `You have ${freePicks} free resource${freePicks > 1 ? 's' : ''} to take — tap one below.`;
      if (starstarshipMoveFrom) return 'Tap a glowing edge to sail your starship there.';
      if (starfighterMoveFrom) return 'Tap a destination for your starfighter — an open corner, or a weaker enemy starfighter.';
      if (progPick) return 'Pick a target on the board for that card.';
      if (game.freeLanes > 0) return `Warp Lane Rush: tap ${game.freeLanes} warp lane or starship spot${game.freeLanes > 1 ? 's' : ''} — free.`;
      return 'Your turn — build, trade, play a card, or end your turn.';
    }
    return '';
  }

  // ---- Start screen: mode + expansion picker ----
  if (screen === 'menu') {
    return (
      <main style={{ minHeight: '100vh', ...MYRIAD_BG, color: '#f4f4f5', padding: '10px 10px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MenuArt width={440} height={238} />
          <p style={{ margin: 0, fontSize: 14, color: '#d4d4d8', textAlign: 'center' }}>
            Settle the island, build warp lanes and stations, and reach the points target first — alone against three agents, or around a table with friends.
          </p>
          <label style={{ fontSize: 13, color: '#d4d4d8', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Your name
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={20}
              style={{ background: '#141414', border: '1px solid #555', borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 15 }} />
          </label>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Expansions — pick any, or none</p>
            {EXPANSION_INFO.map((info) => (
              <button key={info.key} type="button" onClick={() => toggleExpansion(info.key)}
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', textAlign: 'left',
                  background: expansions[info.key] ? '#1e1b4b' : 'transparent',
                  border: expansions[info.key] ? '2px solid #fbbf24' : '1px solid #444',
                  borderRadius: 8, padding: '8px', marginBottom: 6, color: '#fff', cursor: 'pointer',
                }}>
                <span style={{ fontSize: 16 }}>{expansions[info.key] ? '☑️' : '⬜'}</span>
                <span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{info.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#a1a1aa' }}>{info.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Solo — you vs three agents</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Orb symbol="👤" label="Start solo" onClick={startSolo} />
            </div>
          </div>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Online room — play with friends, agents fill empty seats</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Orb symbol="🌐" label="Create room" onClick={createOnlineRoom} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#a1a1aa' }}>Or join with a code:</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABCDEF" maxLength={6}
                style={{ width: 110, textAlign: 'center', letterSpacing: 4, textTransform: 'uppercase', background: '#27272a', border: '1px solid #555', borderRadius: 8, padding: '8px 6px', color: '#fff', fontSize: 16 }} />
              <Orb symbol="🚪" label="Join room" small onClick={joinOnlineRoom} />
            </div>
          </div>
          {onlineError && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>{onlineError}</p>}
          {!connected && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>Connection lost — check your signal.</p>}
        </div>
      </main>
    );
  }

  // ---- Online lobby ----
  if (screen === 'lobby') {
    const lobbyExpansions = EXPANSION_INFO.filter((info) => roomExpansions[info.key]);
    return (
      <main style={{ minHeight: '100vh', ...MYRIAD_BG, color: '#f4f4f5', padding: '10px 10px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Starforge</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#a1a1aa' }}>Share this code with your friends:</p>
          <p style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: 8, color: '#fbbf24' }}>{roomCode}</p>
          <div style={{ width: '100%', background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Players ({roomPlayers.length}/4)</p>
            {roomPlayers.map((p) => (
              <div key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.online ? '#22c55e' : '#71717a', display: 'inline-block' }} />
                <span>{p.name}{p.seat === mySeat ? ' (you)' : ''}</span>
                <span style={{ marginLeft: 'auto', color: '#a1a1aa', fontSize: 12 }}>
                  Seat {p.seat + 1}{p.seat === hostSeat ? ' · Host' : ''}
                </span>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - roomPlayers.length) }).map((_, i) => (
              <div key={`agent-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0', color: '#a1a1aa' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#71717a', display: 'inline-block' }} />
                <span>Agent — fills this seat when the game starts</span>
              </div>
            ))}
          </div>
          <div style={{ width: '100%', background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Expansions for this room</p>
            {lobbyExpansions.length === 0
              ? <p style={{ margin: 0, fontSize: 13, color: '#d4d4d8' }}>Base game only.</p>
              : lobbyExpansions.map((info) => (
                <p key={info.key} style={{ margin: '2px 0', fontSize: 13, color: '#d4d4d8' }}>✓ {info.name}</p>
              ))}
          </div>
          {!connected && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>Connection lost — still trying…</p>}
          {onlineError && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>{onlineError}</p>}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            {isHost && <Orb symbol="▶️" label="Start game" onClick={startOnlineGame} />}
            <Orb symbol="🚪" label="Leave" onClick={leaveOnline} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>
            {isHost ? 'You are the host — start whenever everyone is in. Agents fill any empty seats.' : 'Waiting for the host to start…'}
          </p>
        </div>
      </main>
    );
  }

  // ---- Game screen (solo or online) ----
  const bounds = boardBounds(game.hexes);
  const discardNeed = mustDiscard ? game.discardNeed : 0;
  const discardPicked = Object.values(discardSel).reduce((n, x) => n + x, 0);
  const tradeRateText = giveSel ? `${tradeRate(game, pid, giveSel)}:1` : '—';
  const selStarfighter = selectedStarfighter ? game.vertices.get(selectedStarfighter)?.starfighter : null;
  const waitingName = onlineMode && !game.winner && actorId !== pid ? actor?.name : null;
  const myHand = me ? { ...me.resources } : {};
  const myCommodities = me ? { ...me.commodities } : {};

  function bumpMap(map, k, d, max) {
    const next = { ...map };
    const v = (next[k] || 0) + d;
    if (v <= 0) delete next[k];
    else next[k] = Math.min(v, max);
    return next;
  }

  function toggleDiscard(k) {
    if (!mustDiscard) return;
    const have = RESOURCES.includes(k) ? (me.resources[k] || 0) : (me.commodities[k] || 0);
    setDiscardSel((prev) => {
      const next = { ...prev };
      const picked = next[k] || 0;
      const pickedTotal = Object.values(next).reduce((n, x) => n + x, 0);
      if (picked > 0 && (picked >= have || pickedTotal >= discardNeed)) delete next[k];
      else if (picked < have && pickedTotal < discardNeed) next[k] = picked + 1;
      return next;
    });
  }

  const offerValid = offerTarget !== null
    && Object.values(offerGive).reduce((n, x) => n + x, 0) > 0
    && Object.values(offerAsk).reduce((n, x) => n + x, 0) > 0;

  return (
    <main style={{ minHeight: '100vh', ...MYRIAD_BG, color: '#f4f4f5', padding: '10px 10px 24px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header: omega + title + fullscreen + new game orbs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OmegaMark size={36} />
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Starforge</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" aria-label="New game" onClick={newGame}
              style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', background: '#27272a', color: '#fff', fontSize: 20, cursor: 'pointer' }}>↻</button>
            <button type="button" aria-label="Fullscreen" onClick={toggleFullscreen}
              style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', background: '#27272a', color: '#fff', fontSize: 18, cursor: 'pointer' }}>⛶</button>
          </div>
        </div>

        {/* Scoreboard: every player, points, titles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {game.players.map((p) => {
            const vp = victoryPoints(game, p.id);
            const b = vpBreakdown(game, p.id);
            const active = actorId === p.id && !game.winner;
            const metroCount = ex.stationsStarfighters ? IMPROVEMENT_TRACKS.filter((t) => game.metropolis[t] === p.id).length : 0;
            const roomP = onlineMode ? roomPlayers.find((r) => r.seat === p.id) : null;
            return (
              <div key={p.id} style={{
                flex: '1 1 100px', borderRadius: 10, padding: '6px 8px',
                background: active ? '#1e1b4b' : '#141414',
                border: active ? `2px solid ${p.color}` : '1px solid #333',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {onlineMode && <span style={{ width: 8, height: 8, borderRadius: '50%', background: roomP?.online ? '#22c55e' : '#71717a', display: 'inline-block' }} />}
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  <b style={{ fontSize: 13 }}>{p.name}{p.id === pid ? ' (you)' : ''}</b>
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800 }}>{vp} pts</span>
                </div>
                <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 2 }}>
                  🛰️{p.outposts} 🛸{p.stations} 🌀{p.warpLanes}
                  {ex.starfarers ? ` 🚀${p.starships}` : ''}
                  {ex.stationsStarfighters ? ` 🛩️${p.starfightersPlayed}` : ` 🛩️${p.starfightersPlayed}`}
                  {ex.harvesters ? ` 🌿${p.biomass}` : ''}
                  {game.longestLaneOwner === p.id ? ' 👑Warp Lane' : ''}
                  {game.largestFleetOwner === p.id ? ' 🛡️Army' : ''}
                  {b.vpCards > 0 ? ` 🃏${b.vpCards}` : ''}
                  {b.islandVP > 0 ? ` 🏝️+${b.islandVP}` : ''}
                  {b.roverVP > 0 ? ` 🐪+${b.roverVP}` : ''}
                  {metroCount > 0 ? ` 👑Metro×${metroCount}` : ''}
                  {b.defenderVP > 0 ? ` 🛡️Defender×${b.defenderVP}` : ''}
                  {ex.harvesters && game.scrapHullHolder === p.id ? ' 🛰️Scrap Hull' : ''}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ margin: 0, fontSize: 13, color: '#d4d4d8', textAlign: 'center' }}>{phaseHint()}</p>
        {waitingName && <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>Waiting for {waitingName}…</p>}
        {notice && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>{notice}</p>}
        {onlineError && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>{onlineError}</p>}
        {!connected && onlineMode && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>Connection lost — still trying…</p>}

        {/* Incoming trade offers (online only) */}
        {incomingOffers.map((o) => {
          const from = playerById(game, o.from);
          return (
            <div key={o.id} style={{ background: '#3f2d0b', border: '2px solid #fbbf24', borderRadius: 10, padding: 10, textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>
                <b>{from.name}</b> offers you <b>{cardListText(o.offer)}</b> for <b>{cardListText(o.ask)}</b>.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Orb symbol="✓" label="Accept" small onClick={() => move({ type: 'respondTrade', offerId: o.id, choice: 'accept' })} />
                <Orb symbol="✕" label="Decline" small onClick={() => move({ type: 'respondTrade', offerId: o.id, choice: 'decline' })} />
                <Orb symbol="🔄" label="Counter" small onClick={() => {
                  setCounterOf(o);
                  setOfferGive({ ...o.ask });
                  setOfferAsk({ ...o.offer });
                  setOfferTarget(o.from);
                  setOfferOpen(true);
                }} />
              </div>
            </div>
          );
        })}

        {/* Board — three stacked layers sharing one viewBox, so the HTML
          tile videos sit exactly over their hexes: (1) SVG hex faces,
          (2) the HTML tile-video layer, (3) a top SVG with the tokens,
          pieces and click targets above the videos. */}
        <div style={{ background: 'radial-gradient(ellipse at 50% 30%, #2a1a5e 0%, #0b1026 75%)', borderRadius: 14, padding: 6, border: '2px solid #e8b93c' }}>
          <div style={{ position: 'relative' }}>
            {/* Layer 1: hex faces (SVG art only — the poster/fallback under the videos) */}
            <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} aria-hidden="true">
              {game.hexes.map((h) => {
                const c = hexCenter(h);
                return <HexTileArt key={h.id} terrain={h.terrain} size={34} x={c.x - 34} y={c.y - 34} />;
              })}
            </svg>
            {/* Layer 2: HTML tile videos, one per hex, clipped to the hex shape */}
            <TileVideoLayer
              tiles={game.hexes.map((h) => { const c = hexCenter(h); return { id: h.id, terrain: h.terrain, token: h.token, cx: c.x, cy: c.y }; })}
              bounds={bounds} size={34}
              rollTotal={game.dice ? game.dice[0] + game.dice[1] : null}
              rollCount={game.rollCount || 0}
              pirateMoveCount={game.pirateMoveCount || 0}
              voidPirateHex={game.voidPirateHex}
              onTileWake={onTileWake} onTileEnd={onTileEnd} onTileDuration={onTileDuration} />
            {/* Layer 3: tokens, pirate, hubs, edges, vertices — above the videos */}
            <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} role="img" aria-label="Starforge board">
              {game.hexes.map((h) => {
                const c = hexCenter(h);
                const isVoidPirateHex = h.id === game.voidPirateHex;
                const isCorsairHex = h.id === game.corsairHex;
                const voidPirateHere = legalVoidPirate.includes(h.id);
                const corsairHere = legalCorsair.includes(h.id);
                const pickHere = (progPick === 'bishop' || progPick === 'merchant' || progPick === 'inventor') && canAct;
                return (
                  <g key={h.id} onClick={() => onHexTap(h.id)} style={{ cursor: (voidPirateHere || corsairHere || pickHere) ? 'pointer' : 'default' }}>
                    {/* Transparent hit area: the hex face itself lives in
                      layer 1, so this <g> needs its own clickable shape. */}
                    <polygon points={hexPoints(h)} fill="transparent" />
                    {(voidPirateHere || corsairHere || pickHere) && (
                      <polygon points={hexPoints(h)} fill="none" stroke="#fbbf24" strokeWidth={3} />
                    )}
                  {h.token && (
                    <g>
                      <circle cx={c.x} cy={c.y} r={13} fill="#f5eeda" stroke="#14141f" strokeWidth={1} />
                      <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize={15} fontWeight={h.token === 6 || h.token === 8 ? 800 : 600}
                        fill={h.token === 6 || h.token === 8 ? '#dc2626' : '#1c1917'}>{h.token}</text>
                      <text x={c.x} y={c.y + 22} textAnchor="middle" fontSize={8} fill="#57534e">
                        {'•'.repeat({ 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }[h.token] || 0)}
                      </text>
                    </g>
                  )}
                  {isVoidPirateHex && <VoidPiratePiece size={24} x={c.x - 12} y={c.y - 32} />}
                  {isCorsairHex && <CorsairPiece size={24} x={c.x - 12} y={c.y - 12} />}
                  {game.merchantHex === h.id && (
                    <g>
                      <circle cx={c.x + 20} cy={c.y - 20} r={8} fill="#fbbf24" stroke="#111" strokeWidth={1} />
                      <text x={c.x + 20} y={c.y - 16} textAnchor="middle" fontSize={10} fontWeight={800} fill="#111">M</text>
                    </g>
                  )}
                </g>
              );
            })}
            {/* Hubs on the coast */}
            {game.hubs.map((hub) => {
              const pos = hubPos(hub, game);
              return <TradeHubArt key={hub.edgeKey} type={hub.type} size={32} x={pos.x - 16} y={pos.y - 16} />;
            })}
            {/* Edges: warp lanes, starships, rovers, legal highlights */}
            {[...game.edges.values()].map((e) => {
              const mid = edgeMid(game, e.key);
              const legalWarpLane = legalWarpLanes.includes(e.key);
              const legalStarship = legalStarships.includes(e.key);
              const legalDest = starshipMoveDests.includes(e.key);
              const legalRover = legalRovers.includes(e.key);
              const legal = legalWarpLane || legalStarship || legalDest || legalRover;
              const a = vertexPos(e.v1);
              const b = vertexPos(e.v2);
              const perp = { x: -(b.y - a.y) / HEX_SIZE, y: (b.x - a.x) / HEX_SIZE };
              return (
                <g key={e.key} onClick={() => onEdgeTap(e.key)} style={{ cursor: legal ? 'pointer' : 'default' }}>
                  {legal && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={10} strokeLinecap="round" opacity={0.45} />}
                  {e.warpLane !== null && <WarpLanePiece color={game.players[e.warpLane].color} size={34} angle={mid.angle} x={mid.x - 17} y={mid.y - 17} />}
                  {e.starship !== null && <StarshipPiece color={game.players[e.starship].color} size={34} angle={mid.angle} x={mid.x - 17} y={mid.y - 17} />}
                  {e.rover !== null && e.rover !== undefined && (
                    <circle cx={mid.x + perp.x * 9} cy={mid.y + perp.y * 9} r={5} fill={game.players[e.rover].color} stroke="#111" strokeWidth={1.5} />
                  )}
                  {e.warpLane === null && e.starship === null && legal && (
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" strokeDasharray="5 4" />
                  )}
                  {legal && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} strokeLinecap="round" />}
                </g>
              );
            })}
            {/* Vertices: outposts / stations / starfighters / legal spots / harvest grounds */}
            {[...game.vertices.values()].map((v) => {
              const pos = vertexPos(v.key);
              const legal = legalOutposts.includes(v.key);
              const stationSpot = canAct && buildMode === 'station' && myCities.some((x) => x.key === v.key);
              const starfighterSpot = legalStarfighters.includes(v.key);
              const downgradeSpot = legalDowngrade.includes(v.key);
              const wallSpot = canAct && buildMode === 'wall' && myWallCities.some((x) => x.key === v.key);
              const highlighted = legal || stationSpot || starfighterSpot || downgradeSpot || wallSpot;
              const isMetropolis = v.metropolis && game.metropolis[v.metropolis] === v.outpost?.player;
              return (
                <g key={v.key} onClick={() => onVertexTap(v.key)}
                  style={{ cursor: highlighted || (v.starfighter?.player === pid && canAct) ? 'pointer' : 'default' }}>
                  {highlighted && (
                    <circle cx={pos.x} cy={pos.y} r={11} fill="none" stroke="#fbbf24" strokeWidth={2.5}>
                      <animate attributeName="r" values="9;12;9" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.5;1" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {v.outpost ? (
                    v.outpost.kind === 'station'
                      ? <StationPiece color={game.players[v.outpost.player].color} size={32} x={pos.x - 16} y={pos.y - 16} />
                      : <OutpostPiece color={game.players[v.outpost.player].color} size={24} x={pos.x - 12} y={pos.y - 12} />
                  ) : v.starfighter ? (
                    <StarfighterPiece color={game.players[v.starfighter.player].color} level={v.starfighter.level} size={22} x={pos.x - 11} y={pos.y - 12} />
                  ) : (
                    <circle cx={pos.x} cy={pos.y} r={legal || starfighterSpot ? 7 : 3.5} fill={legal || starfighterSpot ? '#fbbf24' : 'rgba(255,255,255,0.55)'} />
                  )}
                  {isMetropolis && <circle cx={pos.x} cy={pos.y} r={17} fill="none" stroke="#fbbf24" strokeWidth={2} />}
                  {v.outpost?.kind === 'station' && v.wall !== null && (
                    <text x={pos.x + 12} y={pos.y + 12} fontSize={10}>🧊</text>
                  )}
                  {v.harvestGround && (
                    <g>
                      <circle cx={pos.x + 13} cy={pos.y - 13} r={8} fill="#f5eeda" stroke="#14141f" strokeWidth={1} />
                      <text x={pos.x + 13} y={pos.y - 9} textAnchor="middle" fontSize={9}>🌿</text>
                      <text x={pos.x + 13} y={pos.y - 24} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">{v.harvestGround.token}</text>
                    </g>
                  )}
                  {highlighted && <circle cx={pos.x} cy={pos.y} r={14} fill="transparent" />}
                </g>
              );
            })}
            </svg>
          </div>
        </div>

        {/* Dice + hand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {game.dice ? (
              <>
                <DiceFace value={game.dice[0]} kind="red" size={40} />
                <DiceFace value={game.dice[1]} kind="yellow" size={40} />
                <span style={{ fontSize: 14, color: '#d4d4d8', marginLeft: 4 }}>= {game.dice[0] + game.dice[1]}</span>
              </>
            ) : (
              <>
                <DiceFace value={1} kind="red" size={40} />
                <DiceFace value={1} kind="yellow" size={40} />
              </>
            )}
            {ex.stationsStarfighters && game.eventDie && (
              <DiceFace kind="event" face={game.eventDie === 'starship' ? 'starship' : game.eventDie.replace('gate-', '')} size={40} />
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
            {RESOURCES.map((r) => (
              <span key={r} style={{
                background: '#141414', border: '1px solid #333', borderRadius: 8,
                padding: '3px 7px', fontSize: 12,
                outline: mustDiscard && discardSel[r] ? '2px solid #fbbf24' : 'none',
                cursor: mustDiscard ? 'pointer' : 'default',
              }} onClick={() => toggleDiscard(r)}>
                {RESOURCE_ICON[r]} {me.resources[r] || 0}{mustDiscard && discardSel[r] ? ` (−${discardSel[r]})` : ''}
              </span>
            ))}
            {ex.stationsStarfighters && COMMODITIES.map((c) => (
              <span key={c} style={{
                background: '#141414', border: '1px solid #333', borderRadius: 8,
                padding: '3px 7px', fontSize: 12,
                outline: mustDiscard && discardSel[c] ? '2px solid #fbbf24' : 'none',
                cursor: mustDiscard ? 'pointer' : 'default',
              }} onClick={() => toggleDiscard(c)}>
                {COMMODITY_ICON[c]} {me.commodities[c] || 0}{mustDiscard && discardSel[c] ? ` (−${discardSel[c]})` : ''}
              </span>
            ))}
            {ex.harvesters && (
              <span style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: '3px 7px', fontSize: 12 }}>
                🌿 {me.biomass}
              </span>
            )}
            <span style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: '3px 7px', fontSize: 12 }}>
              🃏 {me.devCards.length}
              {ex.stationsStarfighters ? ` 📜 ${me.progressCards.length}` : ''}
            </span>
          </div>
        </div>

        {/* Discard panel (void pirate 7, a player holds too many cards) */}
        {mustDiscard && (
          <div style={{ background: '#3f1d1d', border: '1px solid #7f1d1d', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>Tap your resource{ex.stationsStarfighters ? ' and commodity' : ''} chips above to pick {discardNeed} cards to discard ({discardPicked}/{discardNeed} picked).</p>
            <Orb symbol="✓" label="Discard" small
              disabled={discardPicked !== discardNeed}
              onClick={() => {
                move({ type: 'discard', cards: discardSel });
                setDiscardSel({});
              }} />
          </div>
        )}

        {/* Free-resource picks (gold vein / Aqueduct) */}
        {freePicks > 0 && myTurn && (
          <div style={{ background: '#1e1b4b', border: '1px solid #fbbf24', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>You have {freePicks} free resource{freePicks > 1 ? 's' : ''} to take — tap one:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
              {RESOURCES.map((r) => (
                <button key={r} type="button" onClick={() => move({ type: 'chooseFreeResource', resource: r })}
                  style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                  {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Void Pirate / corsair choice (Starfarers, on a 7) */}
        {mustVoidPirate && ex.starfarers && game.voidPirateChoice && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>Seven! Move the void pirate on land — or the corsair out at sea?</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Orb symbol="🥷" label="Void Pirate" small active={voidPirateChoice === 'voidPirate'} onClick={() => setVoidPirateChoice('voidPirate')} />
              <Orb symbol="🏴‍☠️" label="Corsair" small active={voidPirateChoice === 'corsair'} onClick={() => setVoidPirateChoice('corsair')} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#a1a1aa' }}>Then tap a {voidPirateChoice === 'corsair' ? 'deep-space hex' : 'land hex'} on the board.</p>
          </div>
        )}

        {/* Rover placement (Rover Caravans) */}
        {game.roverPending?.player === pid && (
          <div style={{ background: '#1e1b4b', border: '1px solid #fbbf24', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13 }}>Place your rover — tap a glowing path next to your new outpost or station. Outposts and stations next to a rover are worth +1 point each.</p>
          </div>
        )}

        {/* Starship move mode (Starfarers) */}
        {starstarshipMoveFrom && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {starshipMoveDests.length > 0 ? 'Tap a glowing edge to sail your starship there.' : 'That starship is locked in — it cannot move this turn.'}
            </p>
            <Orb symbol="✕" label="Cancel" small onClick={() => { setStarshipMoveFrom(null); setBuildMode(null); }} />
          </div>
        )}

        {/* Trade panel: bank / hubs (+ offers online) */}
        {tradeOpen && canAct && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Trade with the bank — rate {tradeRateText}</p>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#a1a1aa' }}>Give:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {RESOURCES.map((r) => (
                <button key={r} type="button" onClick={() => setGiveSel(r)}
                  style={{ background: giveSel === r ? '#78350f' : '#27272a', color: '#fff', border: giveSel === r ? '2px solid #fbbf24' : '1px solid #555', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                  {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]} ({me.resources[r] || 0})
                </button>
              ))}
            </div>
            <p style={{ margin: '8px 0 6px', fontSize: 12, color: '#a1a1aa' }}>Get:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {RESOURCES.map((r) => (
                <button key={r} type="button" onClick={() => setGetSel(r)}
                  style={{ background: getSel === r ? '#78350f' : '#27272a', color: '#fff', border: getSel === r ? '2px solid #fbbf24' : '1px solid #555', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                  {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="🔄" label="Trade" small
                disabled={!giveSel || !getSel || giveSel === getSel}
                onClick={() => {
                  move({ type: 'tradeWithBank', give: giveSel, get: getSel });
                  setGiveSel(null); setGetSel(null);
                }} />
              {onlineMode && (
                <Orb symbol="🤝" label="Offer" small onClick={() => { setOfferOpen(true); setTradeOpen(false); }} />
              )}
              <Orb symbol="✕" label="Close" small onClick={() => { setTradeOpen(false); setGiveSel(null); setGetSel(null); }} />
            </div>
          </div>
        )}

        {/* Player-to-player offer panel (online only) */}
        {offerOpen && onlineMode && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>
              {counterOf ? `Counter ${playerById(game, counterOf.from).name}'s offer` : 'Offer a trade'}
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#a1a1aa' }}>Trade with:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {game.players.filter((p) => p.id !== pid).map((p) => (
                <button key={p.id} type="button" disabled={!!counterOf}
                  onClick={() => setOfferTarget(p.id)}
                  style={{ background: offerTarget === p.id ? '#78350f' : '#27272a', color: '#fff', border: offerTarget === p.id ? '2px solid #fbbf24' : '1px solid #555', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: counterOf ? 'default' : 'pointer' }}>
                  {p.name}{p.isAI ? ' (agent)' : ''}
                </button>
              ))}
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#a1a1aa' }}>You give:</p>
            <CountPicker values={offerGive} limits={{ ...myHand, ...myCommodities }} onChange={(k, d) => setOfferGive((prev) => bumpMap(prev, k, d, (myHand[k] || 0) + (myCommodities[k] || 0)))} />
            <p style={{ margin: '8px 0 6px', fontSize: 12, color: '#a1a1aa' }}>You get:</p>
            <CountPicker values={offerAsk} onChange={(k, d) => setOfferAsk((prev) => bumpMap(prev, k, d, 99))} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="📨" label={counterOf ? 'Send counter' : 'Send offer'} small
                disabled={!offerValid || (!counterOf && !canAct)}
                onClick={() => {
                  if (counterOf) {
                    move({ type: 'respondTrade', offerId: counterOf.id, choice: 'counter', counterOffer: offerGive, counterAsk: offerAsk });
                  } else {
                    move({ type: 'offerTrade', to: offerTarget, offer: offerGive, ask: offerAsk });
                  }
                  setOfferOpen(false); setCounterOf(null);
                  setOfferGive({}); setOfferAsk({}); setOfferTarget(null);
                }} />
              <Orb symbol="✕" label="Close" small onClick={() => { setOfferOpen(false); setCounterOf(null); setOfferGive({}); setOfferAsk({}); setOfferTarget(null); }} />
            </div>
            {!counterOf && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>Offers to agents are answered at once. Offers to friends stay open until your turn ends.</p>}
          </div>
        )}

        {/* Development cards panel (base game) — open on your turn even
            before/after the roll, so the Buy button can show the true reason
            it is blocked instead of logging a confusing message. */}
        {devOpen && myTurn && !ex.stationsStarfighters && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Your development cards ({me.devCards.length})</p>
            {me.devCards.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa' }}>None yet — buy one below. A card cannot be played the turn you buy it.</p>}
            {devPick === 'marketCorner' && (
              <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Market Corner: tap a resource to take it from everyone.</p>
            )}
            {devPick === 'supplyDrop' && (
              <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Supply Drop: tap two resources ({yopPicks.length}/2 picked).</p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {me.devCards.map((c, i) => {
                const playable = canPlayDev(game, pid, c.type);
                const label = { starfighter: '🛩️ Starfighter', discovery: '⭐ Discovery', marketCorner: '👑 Market Corner', supplyDrop: '📦 Supply Drop', warpLaneRush: '🌀 Warp Lane Rush' }[c.type];
                return (
                  <button key={i} type="button" disabled={!playable || !!devPick}
                    onClick={() => {
                      if (c.type === 'starfighter') { move({ type: 'playStarfighter' }); setDevOpen(false); }
                      else if (c.type === 'marketCorner') setDevPick('marketCorner');
                      else if (c.type === 'supplyDrop') setDevPick('supplyDrop');
                      else if (c.type === 'warpLaneRush') { move({ type: 'playWarpLaneRush' }); setDevOpen(false); setBuildMode('warpLane'); }
                    }}
                    style={{ background: '#27272a', color: '#fff', border: '1px solid #555', borderRadius: 8, padding: '4px', fontSize: 12, cursor: playable && !devPick ? 'pointer' : 'default', opacity: playable ? 1 : 0.5 }}>
                    <CardFace kind={c.type} width={64} height={90} />
                    <span style={{ display: 'block', marginTop: 2 }}>{label}{c.boughtAtTurn >= game.turnCount ? ' (new)' : ''}</span>
                  </button>
                );
              })}
              {(devPick === 'marketCorner' || devPick === 'supplyDrop') && RESOURCES.map((r) => (
                <button key={r} type="button"
                  onClick={() => {
                    if (devPick === 'marketCorner') {
                      move({ type: 'playMarketCorner', resource: r });
                      setDevPick(null); setDevOpen(false);
                    } else {
                      const next = [...yopPicks, r];
                      setYopPicks(next);
                      if (next.length === 2) {
                        move({ type: 'playSupplyDrop', r1: next[0], r2: next[1] });
                        setYopPicks([]); setDevPick(null); setDevOpen(false);
                      }
                    }
                  }}
                  style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                  {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'flex-end', marginTop: 10 }}>
              <CardBack width={48} height={67} />
              <Orb symbol="🃏" label="Buy card" small
                disabled={game.phase !== 'play' || game.turn !== pid || !(me.resources.silicon >= 1 && me.resources.titanium >= 1 && me.resources.gold >= 1) || game.devDeck.length === 0}
                onClick={() => move({ type: 'buyDevCard' })} />
              <Orb symbol="✕" label="Close" small onClick={() => { setDevOpen(false); setDevPick(null); setYopPicks([]); }} />
            </div>
            {(game.phase !== 'play' || game.turn !== pid) && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#fbbf24', textAlign: 'center' }}>
                {game.turn !== pid ? 'Not your turn.' : phaseReason(game.phase, 'buy')}
              </p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
              Buy: 1 silicon + 1 titanium + 1 gold · {game.devDeck.length} cards left in the deck
            </p>
          </div>
        )}

        {/* Progress cards panel (Stations & Starfighters) */}
        {progOpen && canAct && ex.stationsStarfighters && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Your progress cards ({me.progressCards.length})</p>
            {me.progressCards.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa' }}>None yet — improve a station track to draw one when its colour comes up on the event die.</p>}
            {progPick && (
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#fbbf24' }}>
                {PROGRESS_PICK[progPick] === 'hex' && 'Tap a hex on the board.'}
                {PROGRESS_PICK[progPick] === 'hex2' && (progHexA === null ? 'Tap the first hex to swap.' : 'Tap the second hex to swap.')}
                {PROGRESS_PICK[progPick] === 'vertex' && 'Tap a starfighter on the board.'}
                {PROGRESS_PICK[progPick] === 'edge' && 'Tap one of your warp lanes or starships on the board.'}
                {PROGRESS_PICK[progPick] === 'dice' && 'Pick the two dice for your next roll.'}
                {PROGRESS_PICK[progPick] === 'resource' && 'Tap a resource to take from everyone.'}
                {PROGRESS_PICK[progPick] === 'commodity' && 'Tap a commodity to take from everyone.'}
              </p>
            )}
            {progPick === 'alchemist' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {[['d1', 'First die'], ['d2', 'Second die']].map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#a1a1aa', minWidth: 70 }}>{label}:</span>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button key={n} type="button" onClick={() => setProgDice((prev) => ({ ...prev, [key]: n }))}
                        style={{ width: 28, height: 28, borderRadius: '50%', border: progDice[key] === n ? '2px solid #fbbf24' : '1px solid #555', background: progDice[key] === n ? '#78350f' : '#27272a', color: '#fff', cursor: 'pointer' }}>{n}</button>
                    ))}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Orb symbol="🎲" label="Play" small disabled={progDice.d1 === null || progDice.d2 === null}
                    onClick={() => playProgress('alchemist', { d1: progDice.d1, d2: progDice.d2 })} />
                </div>
              </div>
            )}
            {progPick === 'resourceCorner' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {RESOURCES.map((r) => (
                  <button key={r} type="button" onClick={() => playProgress('resourceCorner', { resource: r })}
                    style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                    {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                  </button>
                ))}
              </div>
            )}
            {progPick === 'tradeCorner' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {COMMODITIES.map((c) => (
                  <button key={c} type="button" onClick={() => playProgress('tradeCorner', { commodity: c })}
                    style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                    {COMMODITY_ICON[c]} {COMMODITY_LABEL[c]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {me.progressCards.map((c, i) => (
                <button key={i} type="button" disabled={!!progPick}
                  onClick={() => onProgressCardTap(c.type)}
                  style={{ background: progPick === c.type ? '#78350f' : '#27272a', color: '#fff', border: progPick === c.type ? '2px solid #fbbf24' : '1px solid #555', borderRadius: 8, padding: '4px', fontSize: 12, cursor: progPick ? 'default' : 'pointer' }}>
                  <CardFace kind={c.type} width={64} height={90} />
                  <span style={{ display: 'block', marginTop: 2 }}>{PROGRESS_LABEL[c.type]}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              {progPick && <Orb symbol="✕" label="Cancel pick" small onClick={() => { setProgPick(null); setProgHexA(null); setProgDice({ d1: null, d2: null }); }} />}
              <Orb symbol="✕" label="Close" small onClick={() => { setProgOpen(false); setProgPick(null); setProgHexA(null); }} />
            </div>
          </div>
        )}

        {/* Improvements panel (Stations & Starfighters) */}
        {impOpen && ex.stationsStarfighters && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Station improvements</p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#a1a1aa' }}>Each level costs that many goods of its colour. Level 4 takes the metropolis (+2 points); level 3 gives a special power.</p>
            {IMPROVEMENT_TRACKS.map((track) => {
              const level = me.improvements[track];
              const comm = IMPROVEMENT_COMMODITY[track];
              const cost = level + 1;
              const metro = game.metropolis[track] === pid;
              return (
                <div key={track} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #222' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    <b>{IMPROVEMENT_LABEL[track]}</b>{metro ? ' 👑 Metropolis' : ''}
                    <span style={{ display: 'block', fontSize: 11, color: '#a1a1aa' }}>
                      {level < 5 ? `Next level costs ${cost} ${COMMODITY_ICON[comm]} ${COMMODITY_LABEL[comm]} (you hold ${me.commodities[comm] || 0})` : 'Fully improved'}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} style={{ width: 10, height: 10, borderRadius: '50%', background: n <= level ? '#fbbf24' : '#3f3f46', display: 'inline-block' }} />
                    ))}
                  </span>
                  <Orb symbol="⬆️" label="Improve" small
                    disabled={!canAct || me.stations < 1 || level >= 5 || (me.commodities[comm] || 0) < cost}
                    onClick={() => move({ type: 'buyImprovement', track })} />
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="🧊" label="Build wall" small
                disabled={!canAct || me.walls >= 3 || myWallCities.length === 0}
                onClick={() => setBuildMode('wall')} />
              <Orb symbol="✕" label="Close" small onClick={() => { setImpOpen(false); setBuildMode(null); }} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
              A wall costs 2 water-ice and goes under one of your stations — it lets you hold 2 more cards before discarding on a 7. You have {me.walls} of 3 walls.
            </p>
          </div>
        )}

        {/* Starfighters panel (Stations & Starfighters) */}
        {starfighterOpen && ex.stationsStarfighters && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Starfighters — your army against the void fleets</p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#a1a1aa' }}>
              Hire a starfighter (1 silicon + 1 gold) on an open corner of your warp lanes. Rally it (1 titanium) to fight, then tap it and tap a destination to move it or displace a weaker enemy starfighter. Starfighters in reserve: basic {me.starfighterSupply.basic}, strong {me.starfighterSupply.strong}, mighty {me.starfighterSupply.mighty}.
            </p>
            {myStarfighters.length === 0 && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#a1a1aa' }}>No starfighters on the board yet.</p>}
            {myStarfighters.map((v) => (
              <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>
                  Starfighter level {v.starfighter.level} — {v.starfighter.active ? 'active, ready to act' : 'resting'}
                </span>
                <button type="button" onClick={() => { setSelectedStarfighter(v.key); setStarfighterMoveFrom(v.starfighter.active ? v.key : null); }}
                  style={{ background: selectedStarfighter === v.key ? '#78350f' : '#27272a', color: '#fff', border: '1px solid #555', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                  Select
                </button>
              </div>
            ))}
            {selStarfighter && selectedStarfighter && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                <Orb symbol="🛩️" label="Rally" small
                  disabled={!canAct || selStarfighter.active}
                  onClick={() => move({ type: 'activateStarfighter', vertex: selectedStarfighter })} />
                <Orb symbol="⬆️" label="Upgrade" small
                  disabled={!canAct || selStarfighter.level >= 3}
                  onClick={() => move({ type: 'upgradeStarfighter', vertex: selectedStarfighter })} />
                <Orb symbol="➡️" label="Move" small
                  disabled={!canAct || !selStarfighter.active}
                  onClick={() => setStarfighterMoveFrom(selectedStarfighter)} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="🛡️" label="Hire starfighter" small
                disabled={!canAct || me.starfighterSupply.basic < 1}
                onClick={() => { setBuildMode('starfighter'); setStarfighterOpen(false); }} />
              <Orb symbol="✕" label="Close" small onClick={() => { setStarfighterOpen(false); setSelectedStarfighter(null); setStarfighterMoveFrom(null); }} />
            </div>
          </div>
        )}

        {/* Void Fleet track (Stations & Starfighters) */}
        {ex.stationsStarfighters && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <VoidFleetShipMarker size={28} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Void Fleet starship</span>
              <span style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                {Array.from({ length: VOID_FLEET_TRACK_LENGTH }).map((_, i) => (
                  <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < game.voidFleetTrack ? '#dc2626' : '#3f3f46', display: 'inline-block', border: '1px solid #555' }} />
                ))}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#a1a1aa' }}>
              {game.voidFleetTrack}/{VOID_FLEET_TRACK_LENGTH} — when the starship reaches 7, the void fleets attack. If your active starfighters are weaker than the stations, the weakest defender loses a station. The strongest defender earns a Defender of the Forge card (+1 point).
            </p>
          </div>
        )}

        {/* Biomass menu (Harvesters) */}
        {biomassOpen && ex.harvesters && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Spend your biomass — you hold {me.biomass}</p>
            {BIOMASS_MENU.map((item) => (
              <div key={item.action} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{item.label} — <b>{item.cost} 🌿</b></span>
                <Orb symbol="🌿" label="Spend" small
                  disabled={!canAct || me.biomass < item.cost || (item.action === 'devCard' && ex.stationsStarfighters)}
                  onClick={() => {
                    if (item.action === 'steal' || item.action === 'resource') setBiomassPick(item.action);
                    else move({ type: 'spendBiomass', action: item.action });
                  }} />
              </div>
            ))}
            {biomassPick === 'steal' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Steal from whom?</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {game.players.filter((p) => p.id !== pid).map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { move({ type: 'spendBiomass', action: 'steal', victim: p.id }); setBiomassPick(null); }}
                      style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {biomassPick === 'resource' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Take which resource?</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {RESOURCES.map((r) => (
                    <button key={r} type="button"
                      onClick={() => { move({ type: 'spendBiomass', action: 'resource', resource: r }); setBiomassPick(null); }}
                      style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                      {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ex.harvesters && game.scrapHullHolder === pid && (
              <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 8, textAlign: 'center' }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>🛰️ You hold the scrap hull — you need one more point to win. Pass it to someone with as many points as you.</p>
                <Orb symbol="🛰️" label="Pass scrap hull" small onClick={() => setScrapHullOpen((b) => !b)} />
                {scrapHullOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                    {game.players.filter((p) => p.id !== pid && victoryPoints(game, p.id) >= victoryPoints(game, pid)).map((p) => (
                      <button key={p.id} type="button"
                        onClick={() => { move({ type: 'passScrapHull', to: p.id }); setScrapHullOpen(false); }}
                        style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                        {p.name} ({victoryPoints(game, p.id)} pts)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="✕" label="Close" small onClick={() => { setBiomassOpen(false); setBiomassPick(null); }} />
            </div>
          </div>
        )}

        {/* Build submenu */}
        {canAct && buildMode && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {buildMode === 'warpLane' && 'Warp Lane — tap a glowing warp lane spot. Cost: 1 iron + 1 water-ice.'}
              {buildMode === 'outpost' && 'Outpost — tap a glowing corner on your warp lane. Cost: 1 iron + 1 water-ice + 1 silicon + 1 titanium.'}
              {buildMode === 'station' && 'Station — tap one of your outposts to upgrade it. Cost: 2 titanium + 3 gold.'}
              {buildMode === 'starship' && 'Starship — tap a glowing water edge. Cost: 1 iron + 1 silicon.'}
              {buildMode === 'starshipMove' && 'Move a starship — tap one of your starships, then a glowing edge.'}
              {buildMode === 'starfighter' && 'Hire a starfighter — tap a glowing corner on your warp lanes. Cost: 1 silicon + 1 gold.'}
              {buildMode === 'wall' && 'Build a wall — tap one of your stations with no wall. Cost: 2 water-ice.'}
              {game.freeLanes > 0 && ' (Warp Lane Rush: free!)'}
            </p>
            <Orb symbol="✕" label="Cancel" small onClick={() => { setBuildMode(null); setStarshipMoveFrom(null); }} />
          </div>
        )}

        {/* Action orbs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Orb symbol="🎲" label="Roll" disabled={!canRoll} image="/images/starforge/buttons/roll.webp"
            onClick={() => move({ type: 'roll' })} />
          <Orb symbol="🔨" label="Build" disabled={!canAct} active={!!buildMode} image="/images/starforge/buttons/build.webp"
            onClick={() => {
              setTradeOpen(false); setDevOpen(false); setProgOpen(false); setImpOpen(false); setStarfighterOpen(false); setBiomassOpen(false);
              setBuildMode((m) => (m ? null : 'warpLane'));
            }} />
          {buildMode && (
            <>
              <Orb symbol="🌀" label="Warp Lane" small active={buildMode === 'warpLane'}
                onClick={() => setBuildMode('warpLane')} />
              {ex.starfarers && (
                <>
                  <Orb symbol="🚀" label="Starship" small active={buildMode === 'starship'}
                    onClick={() => setBuildMode('starship')} />
                  <Orb symbol="🚀" label="Move starship" small active={buildMode === 'starshipMove'}
                    onClick={() => setBuildMode('starshipMove')} />
                </>
              )}
              <Orb symbol="🛰️" label="Settle" small active={buildMode === 'outpost'}
                onClick={() => setBuildMode('outpost')} />
              <Orb symbol="🛸" label="Station" small active={buildMode === 'station'}
                onClick={() => setBuildMode('station')} />
              {ex.stationsStarfighters && (
                <Orb symbol="🛩️" label="Starfighter" small active={buildMode === 'starfighter'}
                  onClick={() => setBuildMode('starfighter')} />
              )}
            </>
          )}
          <Orb symbol="🔄" label="Trade" disabled={!canAct} active={tradeOpen} image="/images/starforge/buttons/trade.webp"
            onClick={() => { setBuildMode(null); setDevOpen(false); setProgOpen(false); setImpOpen(false); setStarfighterOpen(false); setBiomassOpen(false); setTradeOpen((t) => !t); }} />
          {!ex.stationsStarfighters && (
            <Orb symbol="🃏" label="Cards" disabled={!myTurn} active={devOpen} image="/images/starforge/buttons/cards.webp"
              onClick={() => { setBuildMode(null); setTradeOpen(false); setDevOpen((d) => !d); }} />
          )}
          {ex.stationsStarfighters && (
            <>
              <Orb symbol="📜" label="Progress" disabled={!canAct} active={progOpen}
                onClick={() => { setBuildMode(null); setTradeOpen(false); setImpOpen(false); setStarfighterOpen(false); setProgOpen((d) => !d); }} />
              <Orb symbol="🏛️" label="Improve" disabled={!canAct} active={impOpen}
                onClick={() => { setBuildMode(null); setTradeOpen(false); setProgOpen(false); setStarfighterOpen(false); setImpOpen((d) => !d); }} />
              <Orb symbol="🛡️" label="Starfighters" disabled={!canAct} active={starfighterOpen}
                onClick={() => { setBuildMode(null); setTradeOpen(false); setProgOpen(false); setImpOpen(false); setStarfighterOpen((d) => !d); }} />
            </>
          )}
          {ex.harvesters && (
            <Orb symbol="🌿" label="Biomass" disabled={!canAct} active={biomassOpen}
              onClick={() => { setBuildMode(null); setTradeOpen(false); setBiomassOpen((d) => !d); }} />
          )}
          <Orb symbol="⏭" label="End turn" disabled={!canAct || tileHold} image="/images/starforge/buttons/end-turn.webp"
            onClick={() => { setBuildMode(null); setTradeOpen(false); setDevOpen(false); setProgOpen(false); setImpOpen(false); setStarfighterOpen(false); setBiomassOpen(false); move({ type: 'endTurn' }); }} />
        </div>
        {tileHold && (
          <p style={{ margin: 0, fontSize: 12, color: '#fbbf24', textAlign: 'center' }}>
            Tiles still playing — End turn unlocks when the video finishes.
          </p>
        )}

        {/* Build costs, plain English */}
        <p style={{ margin: 0, fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
          Warp Lane ⛏️🧊 · Outpost ⛏️🧊💠🔩 · Station 🔩🔩🪙🪙🪙 · Card 💠🔩🪙
          {ex.starfarers ? ' · Starship ⛏️💠' : ''}
          {ex.stationsStarfighters ? ' · Starfighter 💠🪙 · Wall 🧊🧊' : ''}
          {' '}· First to {winTarget(game)} points wins
          {ex.harvesters ? ' (scrap hull holders need one more)' : ''}
        </p>

        {/* Event log */}
        <div ref={logRef} style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 8, height: 110, overflowY: 'auto', fontSize: 12, lineHeight: 1.5 }}>
          {logLines.map((line, i) => (
            <div key={i} style={{ color: i === logLines.length - 1 ? '#fff' : '#a1a1aa' }}>{line}</div>
          ))}
        </div>

        {/* Win overlay */}
        {game.winner !== null && (
          <div style={{ background: '#78350f', border: '2px solid #fbbf24', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>
              🏆 {playerById(game, game.winner).name} wins!
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13 }}>
              {game.winner === pid ? `You reached ${winTargetFor(game, pid)} points. The island is yours.` : `${playerById(game, game.winner).name} reached ${winTargetFor(game, game.winner)} points first.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Orb symbol="↻" label={onlineMode ? 'Leave room' : 'New game'} onClick={newGame} />
            </div>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 11, color: '#71717a', textAlign: 'center' }}>
          {onlineMode
            ? `Online room ${roomCode} · You are ${me.name} · ${game.players.map((p) => `${p.name}${p.isAI ? ' (agent)' : ''}`).join(', ')}`
            : `You vs ${game.players.filter((p) => p.isAI).map((p) => p.name).join(', ')} · Bank and hub trading only — trade with other players in an online room.`}
        </p>
      </div>
    </main>
  );
}
