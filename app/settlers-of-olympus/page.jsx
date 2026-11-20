// app/settlers-of-olympus/page.jsx — Settlers of Olympus: solo vs 3 agents,
// or online rooms (host + join code, agents fill empty seats), with the
// Seafarers / Cities & Knights / Fishermen / Caravans expansions and
// human-to-human trading in online games.
// Engine in lib/settlers-of-olympus/engine.js (pure logic). Solo turns run
// here through pumpAi() (Monopoly pattern); online turns go through the
// room API (POST .../action) and agents step server-side — the client
// NEVER steps AI in online mode. Who must act is onlineActorId(), not
// always the turn player (discard queue, barbarian loser, placement).
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
  PROGRESS_LABEL, FISH_COSTS, BARBARIAN_TRACK_LENGTH,
  axialToPixel,
  createGame, currentPlayer, playerById,
  legalSettlementSpots, legalRoadSpots, legalShipSpots, legalShipMoveDestinations,
  legalKnightSpots, legalCamelSpots, legalDowngradeCities,
  legalRobberHexes, legalPirateHexes,
  placeSettlement, placeRoad, placeShip, moveShip, buildCity,
  rollDice, discardCards, moveRobber, movePirate,
  tradeRate, tradeWithBank, buyDevCard, playKnight, playMonopoly,
  playYearOfPlenty, playRoadBuilding, canPlayDev, endTurn,
  chooseFreeResource, spendFish, passBoot, placeCamel,
  buyImprovement, buyKnight, activateKnight, upgradeKnight, knightAction,
  buildWall, playProgressCard, downgradeCity,
  offerTrade, respondTrade,
  victoryPoints, vpBreakdown, aiStep,
  deserializeState, onlineActorId, openOffersFor, pendingFreePicks,
  expansionsOn, winTarget, winTargetFor,
} from '@/lib/settlers-of-olympus/engine.js';
import {
  OmegaMark, HexTileArt, PortArt, CardFace, CardBack, DiceFace,
  BarbarianShipMarker, SettlementPiece, CityPiece, RoadPiece, ShipPiece,
  KnightPiece, RobberPiece, PiratePiece, MenuArt,
} from '@/components/settlers-of-olympus/graphics.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEX_SIZE = 34;
const TRADEABLE = [...RESOURCES, ...COMMODITIES];
const cardIcon = (k) => RESOURCE_ICON[k] || COMMODITY_ICON[k] || '🃏';
const cardLabel = (k) => RESOURCE_LABEL[k] || COMMODITY_LABEL[k] || k;

const EXPANSION_INFO = [
  { key: 'seafarers', name: 'Seafarers', desc: 'Ships, new islands, gold rivers and the pirate.' },
  { key: 'citiesKnights', name: 'Cities & Knights', desc: 'Commodities, improvements, knights and the barbarians.' },
  { key: 'fishermen', name: 'Fishermen', desc: 'Fish tokens to spend, and the old boot.' },
  { key: 'caravans', name: 'Caravans', desc: 'Camels on the caravan route, worth extra points.' },
];

// Progress cards that need a pick before they can be played, and what pick.
const PROGRESS_PICK = {
  bishop: 'hex', merchant: 'hex', inventor: 'hex2',
  deserter: 'vertex', intrigue: 'vertex', diplomat: 'edge',
  alchemist: 'dice', resourceMonopoly: 'resource', tradeMonopoly: 'commodity',
};

const FISH_MENU = [
  { action: 'removeRobber', label: 'Robber leaves the board', cost: FISH_COSTS.removeRobber },
  { action: 'steal', label: 'Steal 1 card from a player', cost: FISH_COSTS.steal },
  { action: 'resource', label: 'Take 1 resource of your choice', cost: FISH_COSTS.resource },
  { action: 'road', label: 'A free road or ship', cost: FISH_COSTS.road },
  { action: 'devCard', label: 'A development card', cost: FISH_COSTS.devCard },
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
  const m = 52; // room for the coastal ports
  return { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
}

function portPos(port, game) {
  const e = game.edges.get(port.edgeKey);
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

function cardListText(map) {
  return Object.entries(map)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${cardLabel(k).toLowerCase()}`)
    .join(', ');
}

export default function SettlersOfOlympusPage() {
  const gameRef = useRef(null);
  const pumpRef = useRef(false);
  const logRef = useRef(null);
  const pollRef = useRef(null);
  const [, setTick] = useState(0);
  const tick = () => setTick((t) => t + 1);

  // ---- screens & rooms ----
  const [screen, setScreen] = useState('menu'); // 'menu' | 'lobby' | 'game'
  const [onlineMode, setOnlineMode] = useState(false);
  const [playerName, setPlayerName] = useState('You');
  const [expansions, setExpansions] = useState({ seafarers: false, citiesKnights: false, fishermen: false, caravans: false });
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
  const [buildMode, setBuildMode] = useState(null); // 'road' | 'settlement' | 'city' | 'ship' | 'shipMove' | 'knight' | 'wall' | null
  const [tradeOpen, setTradeOpen] = useState(false);
  const [giveSel, setGiveSel] = useState(null);
  const [getSel, setGetSel] = useState(null);
  const [devOpen, setDevOpen] = useState(false);
  const [devPick, setDevPick] = useState(null); // 'monopoly' | 'yearOfPlenty' | null
  const [yopPicks, setYopPicks] = useState([]);
  const [discardSel, setDiscardSel] = useState({});
  const [logLines, setLogLines] = useState([]);
  const [notice, setNotice] = useState('');
  // Expansion modes
  const [shipMoveFrom, setShipMoveFrom] = useState(null);
  const [robberChoice, setRobberChoice] = useState(null); // 'robber' | 'pirate' | null
  const [progOpen, setProgOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [progPick, setProgPick] = useState(null); // progress card type awaiting a pick
  const [progHexA, setProgHexA] = useState(null);
  const [progDice, setProgDice] = useState({ d1: null, d2: null });
  const [knightOpen, setKnightOpen] = useState(false);
  const [selectedKnight, setSelectedKnight] = useState(null);
  const [knightMoveFrom, setKnightMoveFrom] = useState(null);
  const [fishOpen, setFishOpen] = useState(false);
  const [fishPick, setFishPick] = useState(null); // 'steal' | 'resource' | null
  const [bootOpen, setBootOpen] = useState(false);
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
  // Who must act right now — discard-queue head / barbarian loser /
  // placement actor / turn player. NOT always the turn player.
  const actorId = game
    ? (onlineMode ? onlineActorId(game)
      : game.phase === 'discard' && game.discardQueue.length > 0 ? game.discardQueue[0]
      : game.phase === 'barbarian' && game.barbarianLosers.length > 0 ? game.barbarianLosers[0]
      : game.turn)
    : 0;
  const actor = game ? playerById(game, actorId) : null;
  const myTurn = !!game && !game.winner && actorId === pid;
  const isPlacement = game?.phase === 'placement';
  const canRoll = myTurn && game.phase === 'roll';
  const canAct = myTurn && game.phase === 'play';
  const mustDiscard = myTurn && game?.phase === 'discard';
  const mustRob = myTurn && game?.phase === 'robber';
  const mustBarbarian = myTurn && game?.phase === 'barbarian';
  const freePicks = game && me ? pendingFreePicks(game, pid) : 0;
  const incomingOffers = game && onlineMode ? openOffersFor(game, pid) : [];

  const legalSettlements = game && ((isPlacement && actorId === pid) || (canAct && buildMode === 'settlement'))
    ? legalSettlementSpots(game, pid) : [];
  const legalRoads = game && ((isPlacement && actorId === pid && game.placementStep === 'road')
    || (canAct && (buildMode === 'road' || game.freeRoads > 0)))
    ? legalRoadSpots(game, pid) : [];
  const legalShips = game && ex.seafarers && ((isPlacement && actorId === pid && game.placementStep === 'road')
    || (canAct && (buildMode === 'ship' || game.freeRoads > 0)))
    ? legalShipSpots(game, pid) : [];
  const legalKnights = game && ex.citiesKnights && canAct && buildMode === 'knight'
    ? legalKnightSpots(game, pid) : [];
  const legalCamels = game && ex.caravans && game.camelPending?.player === pid
    ? legalCamelSpots(game, pid) : [];
  const legalDowngrade = game && mustBarbarian ? legalDowngradeCities(game, pid) : [];
  const legalRobber = game && mustRob && robberChoice !== 'pirate' ? legalRobberHexes(game) : [];
  const legalPirate = game && mustRob && robberChoice === 'pirate' ? legalPirateHexes(game) : [];
  const shipMoveDests = game && shipMoveFrom ? legalShipMoveDestinations(game, pid, shipMoveFrom) : [];
  const myCities = game ? [...game.vertices.values()].filter((v) => v.settlement?.player === pid && v.settlement.kind === 'settlement') : [];
  const myWallCities = game ? [...game.vertices.values()].filter((v) => v.settlement?.player === pid && v.settlement.kind === 'city' && v.wall === null) : [];
  const myKnights = game ? [...game.vertices.values()].filter((v) => v.knight?.player === pid) : [];

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
      case 'placeSettlement': return placeSettlement(g, pid, action.vertex);
      case 'placeRoad': return placeRoad(g, pid, action.edge);
      case 'placeShip': return placeShip(g, pid, action.edge);
      case 'moveShip': return moveShip(g, pid, action.from, action.to);
      case 'buildCity': return buildCity(g, pid, action.vertex);
      case 'buyDevCard': return buyDevCard(g);
      case 'playKnight': return playKnight(g, pid);
      case 'playMonopoly': return playMonopoly(g, pid, action.resource);
      case 'playYearOfPlenty': return playYearOfPlenty(g, pid, action.r1, action.r2);
      case 'playRoadBuilding': return playRoadBuilding(g, pid);
      case 'tradeWithBank': return tradeWithBank(g, pid, action.give, action.get);
      case 'chooseFreeResource': return chooseFreeResource(g, pid, action.resource);
      case 'moveRobber': return moveRobber(g, pid, action.hex);
      case 'movePirate': return movePirate(g, pid, action.hex);
      case 'spendFish': return spendFish(g, pid, action.action, action);
      case 'passBoot': return passBoot(g, pid, action.to);
      case 'placeCamel': return placeCamel(g, pid, action.edge);
      case 'buyImprovement': return buyImprovement(g, pid, action.track);
      case 'buyKnight': return buyKnight(g, pid, action.vertex);
      case 'activateKnight': return activateKnight(g, pid, action.vertex);
      case 'upgradeKnight': return upgradeKnight(g, pid, action.vertex);
      case 'knightAction': return knightAction(g, pid, action.from, action.to);
      case 'buildWall': return buildWall(g, pid, action.vertex);
      case 'playProgressCard': return playProgressCard(g, pid, action.cardType, action);
      case 'downgradeCity': return downgradeCity(g, pid, action.vertex);
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
    setNotice(''); setShipMoveFrom(null); setRobberChoice(null);
    setProgOpen(false); setProgPick(null); setProgHexA(null); setProgDice({ d1: null, d2: null });
    setKnightOpen(false); setSelectedKnight(null); setKnightMoveFrom(null);
    setFishOpen(false); setFishPick(null); setBootOpen(false);
    setOfferOpen(false); setOfferTarget(null); setOfferGive({}); setOfferAsk({});
    setCounterOf(null);
  }

  function startSolo() {
    gameRef.current = createGame(Math.floor(Math.random() * 1000000000), (playerName || '').trim() || 'You', { expansions });
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
      : g.phase === 'barbarian' && g.barbarianLosers.length > 0
        ? playerById(g, g.barbarianLosers[0])
        : currentPlayer(g);
    if (!actingNow || !actingNow.isAI) return;
    if (!['placement', 'roll', 'discard', 'robber', 'play', 'barbarian'].includes(g.phase)) return;
    pumpRef.current = true;
    try {
      for (let guard = 0; guard < 400 && g && !g.winner; guard++) {
        const acting = g.phase === 'discard' && g.discardQueue.length > 0
          ? playerById(g, g.discardQueue[0])
          : g.phase === 'barbarian' && g.barbarianLosers.length > 0
            ? playerById(g, g.barbarianLosers[0])
            : currentPlayer(g);
        if (!acting || !acting.isAI) break;
        if (!['placement', 'roll', 'discard', 'robber', 'play', 'barbarian'].includes(g.phase)) break;
        await sleep(600);
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
      playProgress(progPick, { vertex: vKey, from: selectedKnight });
      return;
    }
    if (knightMoveFrom) {
      move({ type: 'knightAction', from: knightMoveFrom, to: vKey });
      setKnightMoveFrom(null); setSelectedKnight(null);
      return;
    }
    if (isPlacement && game.placementStep === 'settlement') {
      move({ type: 'placeSettlement', vertex: vKey });
      return;
    }
    if (mustBarbarian) {
      move({ type: 'downgradeCity', vertex: vKey });
      return;
    }
    if (canAct && buildMode === 'settlement') {
      move({ type: 'placeSettlement', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'city') {
      move({ type: 'buildCity', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'knight') {
      move({ type: 'buyKnight', vertex: vKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'wall') {
      move({ type: 'buildWall', vertex: vKey });
      setBuildMode(null);
      return;
    }
    const v = game.vertices.get(vKey);
    if (ex.citiesKnights && v?.knight?.player === pid) {
      setSelectedKnight(vKey);
      setKnightOpen(true);
      if (v.knight.active) setKnightMoveFrom(vKey);
      else setKnightMoveFrom(null);
    }
  }

  function onEdgeTap(edgeKey) {
    if (!game || game.winner || !myTurn) return;
    if (progPick === 'diplomat') {
      playProgress('diplomat', { edge: edgeKey });
      return;
    }
    if (game.camelPending?.player === pid) {
      move({ type: 'placeCamel', edge: edgeKey });
      return;
    }
    if (shipMoveFrom) {
      move({ type: 'moveShip', from: shipMoveFrom, to: edgeKey });
      setShipMoveFrom(null); setBuildMode(null);
      return;
    }
    if (buildMode === 'shipMove') {
      const e = game.edges.get(edgeKey);
      if (e?.ship === pid) setShipMoveFrom(edgeKey);
      return;
    }
    if (isPlacement && game.placementStep === 'road') {
      if (ex.seafarers && legalShips.includes(edgeKey)) move({ type: 'placeShip', edge: edgeKey });
      else move({ type: 'placeRoad', edge: edgeKey });
      return;
    }
    if (canAct && buildMode === 'road') {
      move({ type: 'placeRoad', edge: edgeKey });
      setBuildMode(null);
      return;
    }
    if (canAct && buildMode === 'ship') {
      move({ type: 'placeShip', edge: edgeKey });
      setBuildMode(null);
      return;
    }
    if (canAct && game.freeRoads > 0) {
      if (ex.seafarers && legalShips.includes(edgeKey)) move({ type: 'placeShip', edge: edgeKey });
      else move({ type: 'placeRoad', edge: edgeKey });
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
    if (mustRob) {
      move({ type: robberChoice === 'pirate' ? 'movePirate' : 'moveRobber', hex: hexId });
      setRobberChoice(null);
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
        ? (game.placementStep === 'settlement'
          ? 'Opening placement: tap a glowing corner to settle.'
          : 'Now tap a glowing road — or a ship, on the coast — next to your new settlement.')
        : `${actor.name} is placing…`;
    }
    if (game.phase === 'roll') return actorId === pid ? 'Your turn — roll the dice.' : `${actor.name} is rolling…`;
    if (game.phase === 'discard') {
      return actorId === pid
        ? `Seven! You hold too many cards — discard ${game.discardNeed}.`
        : `Seven! ${actor.name} must discard ${game.discardNeed} cards.`;
    }
    if (game.phase === 'robber') {
      return actorId === pid
        ? (ex.seafarers && game.robberChoice ? 'Seven! Move the robber — or the pirate.' : 'Seven! Tap a hex to move the robber.')
        : `${actor.name} is moving the robber…`;
    }
    if (game.phase === 'barbarian') {
      return actorId === pid
        ? 'The barbarians broke through — tap one of your cities to lose it (a metropolis city is safe).'
        : `${actor.name} must lose a city to the barbarians…`;
    }
    if (game.phase === 'play') {
      if (actorId !== pid) return `${actor.name} is playing…`;
      if (game.camelPending?.player === pid) return 'Place your camel — tap a glowing path next to your new settlement or city.';
      if (freePicks > 0) return `You have ${freePicks} free resource${freePicks > 1 ? 's' : ''} to take — tap one below.`;
      if (shipMoveFrom) return 'Tap a glowing edge to sail your ship there.';
      if (knightMoveFrom) return 'Tap a destination for your knight — an open corner, or a weaker enemy knight.';
      if (progPick) return 'Pick a target on the board for that card.';
      if (game.freeRoads > 0) return `Road Building: tap ${game.freeRoads} road or ship spot${game.freeRoads > 1 ? 's' : ''} — free.`;
      return 'Your turn — build, trade, play a card, or end your turn.';
    }
    return '';
  }

  // ---- Start screen: mode + expansion picker ----
  if (screen === 'menu') {
    return (
      <main style={{ minHeight: '100vh', background: '#0b1f14', color: '#f4f4f5', padding: '10px 10px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MenuArt width={440} height={238} />
          <p style={{ margin: 0, fontSize: 14, color: '#d4d4d8', textAlign: 'center' }}>
            Settle the island, build roads and cities, and reach the points target first — alone against three agents, or around a table with friends.
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
                  background: expansions[info.key] ? '#1c2f22' : 'transparent',
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
      <main style={{ minHeight: '100vh', background: '#0b1f14', color: '#f4f4f5', padding: '10px 10px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Settlers of Olympus</h1>
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
  const selKnight = selectedKnight ? game.vertices.get(selectedKnight)?.knight : null;
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
    <main style={{ minHeight: '100vh', background: '#0b1f14', color: '#f4f4f5', padding: '10px 10px 24px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header: omega + title + fullscreen + new game orbs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OmegaMark size={36} />
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Settlers of Olympus</h1>
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
            const metroCount = ex.citiesKnights ? IMPROVEMENT_TRACKS.filter((t) => game.metropolis[t] === p.id).length : 0;
            const roomP = onlineMode ? roomPlayers.find((r) => r.seat === p.id) : null;
            return (
              <div key={p.id} style={{
                flex: '1 1 100px', borderRadius: 10, padding: '6px 8px',
                background: active ? '#1c2f22' : '#141414',
                border: active ? `2px solid ${p.color}` : '1px solid #333',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {onlineMode && <span style={{ width: 8, height: 8, borderRadius: '50%', background: roomP?.online ? '#22c55e' : '#71717a', display: 'inline-block' }} />}
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  <b style={{ fontSize: 13 }}>{p.name}{p.id === pid ? ' (you)' : ''}</b>
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800 }}>{vp} pts</span>
                </div>
                <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 2 }}>
                  🏠{p.settlements} 🏰{p.cities} 🛣️{p.roads}
                  {ex.seafarers ? ` 🚢${p.ships}` : ''}
                  {ex.citiesKnights ? ` ⚔️${p.knightsPlayed}` : ` ⚔️${p.knightsPlayed}`}
                  {ex.fishermen ? ` 🐟${p.fish}` : ''}
                  {game.longestRoadOwner === p.id ? ' 👑Road' : ''}
                  {game.largestArmyOwner === p.id ? ' 🛡️Army' : ''}
                  {b.vpCards > 0 ? ` 🃏${b.vpCards}` : ''}
                  {b.islandVP > 0 ? ` 🏝️+${b.islandVP}` : ''}
                  {b.camelVP > 0 ? ` 🐪+${b.camelVP}` : ''}
                  {metroCount > 0 ? ` 👑Metro×${metroCount}` : ''}
                  {b.defenderVP > 0 ? ` 🛡️Defender×${b.defenderVP}` : ''}
                  {ex.fishermen && game.oldBootHolder === p.id ? ' 🥾Boot' : ''}
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

        {/* Board */}
        <div style={{ background: '#123524', borderRadius: 14, padding: 6, border: '2px solid #e8b93c' }}>
          <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Settlers of Olympus board">
            {game.hexes.map((h) => {
              const c = hexCenter(h);
              const isRobberHex = h.id === game.robberHex;
              const isPirateHex = h.id === game.pirateHex;
              const robberHere = legalRobber.includes(h.id);
              const pirateHere = legalPirate.includes(h.id);
              const pickHere = (progPick === 'bishop' || progPick === 'merchant' || progPick === 'inventor') && canAct;
              return (
                <g key={h.id} onClick={() => onHexTap(h.id)} style={{ cursor: (robberHere || pirateHere || pickHere) ? 'pointer' : 'default' }}>
                  <HexTileArt terrain={h.terrain} size={34} x={c.x - 34} y={c.y - 34} />
                  {(robberHere || pirateHere || pickHere) && (
                    <polygon points={hexPoints(h)} fill="none" stroke="#fbbf24" strokeWidth={3} />
                  )}
                  {h.token && (
                    <g>
                      <circle cx={c.x} cy={c.y} r={13} fill="#f5eeda" stroke="#0b1f14" strokeWidth={1} />
                      <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize={15} fontWeight={h.token === 6 || h.token === 8 ? 800 : 600}
                        fill={h.token === 6 || h.token === 8 ? '#dc2626' : '#1c1917'}>{h.token}</text>
                      <text x={c.x} y={c.y + 22} textAnchor="middle" fontSize={8} fill="#57534e">
                        {'•'.repeat({ 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }[h.token] || 0)}
                      </text>
                    </g>
                  )}
                  {isRobberHex && <RobberPiece size={24} x={c.x - 12} y={c.y - 32} />}
                  {isPirateHex && <PiratePiece size={24} x={c.x - 12} y={c.y - 12} />}
                  {game.merchantHex === h.id && (
                    <g>
                      <circle cx={c.x + 20} cy={c.y - 20} r={8} fill="#fbbf24" stroke="#111" strokeWidth={1} />
                      <text x={c.x + 20} y={c.y - 16} textAnchor="middle" fontSize={10} fontWeight={800} fill="#111">M</text>
                    </g>
                  )}
                </g>
              );
            })}
            {/* Ports on the coast */}
            {game.ports.map((port) => {
              const pos = portPos(port, game);
              return <PortArt key={port.edgeKey} type={port.type} size={32} x={pos.x - 16} y={pos.y - 16} />;
            })}
            {/* Edges: roads, ships, camels, legal highlights */}
            {[...game.edges.values()].map((e) => {
              const mid = edgeMid(game, e.key);
              const legalRoad = legalRoads.includes(e.key);
              const legalShip = legalShips.includes(e.key);
              const legalDest = shipMoveDests.includes(e.key);
              const legalCamel = legalCamels.includes(e.key);
              const legal = legalRoad || legalShip || legalDest || legalCamel;
              const a = vertexPos(e.v1);
              const b = vertexPos(e.v2);
              const perp = { x: -(b.y - a.y) / HEX_SIZE, y: (b.x - a.x) / HEX_SIZE };
              return (
                <g key={e.key} onClick={() => onEdgeTap(e.key)} style={{ cursor: legal ? 'pointer' : 'default' }}>
                  {legal && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={10} strokeLinecap="round" opacity={0.45} />}
                  {e.road !== null && <RoadPiece color={game.players[e.road].color} size={34} angle={mid.angle} x={mid.x - 17} y={mid.y - 17} />}
                  {e.ship !== null && <ShipPiece color={game.players[e.ship].color} size={34} angle={mid.angle} x={mid.x - 17} y={mid.y - 17} />}
                  {e.camel !== null && e.camel !== undefined && (
                    <circle cx={mid.x + perp.x * 9} cy={mid.y + perp.y * 9} r={5} fill={game.players[e.camel].color} stroke="#111" strokeWidth={1.5} />
                  )}
                  {e.road === null && e.ship === null && legal && (
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" strokeDasharray="5 4" />
                  )}
                  {legal && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} strokeLinecap="round" />}
                </g>
              );
            })}
            {/* Vertices: settlements / cities / knights / legal spots / fishing grounds */}
            {[...game.vertices.values()].map((v) => {
              const pos = vertexPos(v.key);
              const legal = legalSettlements.includes(v.key);
              const citySpot = canAct && buildMode === 'city' && myCities.some((x) => x.key === v.key);
              const knightSpot = legalKnights.includes(v.key);
              const downgradeSpot = legalDowngrade.includes(v.key);
              const wallSpot = canAct && buildMode === 'wall' && myWallCities.some((x) => x.key === v.key);
              const highlighted = legal || citySpot || knightSpot || downgradeSpot || wallSpot;
              const isMetropolis = v.metropolis && game.metropolis[v.metropolis] === v.settlement?.player;
              return (
                <g key={v.key} onClick={() => onVertexTap(v.key)}
                  style={{ cursor: highlighted || (v.knight?.player === pid && canAct) ? 'pointer' : 'default' }}>
                  {highlighted && (
                    <circle cx={pos.x} cy={pos.y} r={11} fill="none" stroke="#fbbf24" strokeWidth={2.5}>
                      <animate attributeName="r" values="9;12;9" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.5;1" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {v.settlement ? (
                    v.settlement.kind === 'city'
                      ? <CityPiece color={game.players[v.settlement.player].color} size={32} x={pos.x - 16} y={pos.y - 16} />
                      : <SettlementPiece color={game.players[v.settlement.player].color} size={24} x={pos.x - 12} y={pos.y - 12} />
                  ) : v.knight ? (
                    <KnightPiece color={game.players[v.knight.player].color} level={v.knight.level} size={22} x={pos.x - 11} y={pos.y - 12} />
                  ) : (
                    <circle cx={pos.x} cy={pos.y} r={legal || knightSpot ? 7 : 3.5} fill={legal || knightSpot ? '#fbbf24' : 'rgba(255,255,255,0.55)'} />
                  )}
                  {isMetropolis && <circle cx={pos.x} cy={pos.y} r={17} fill="none" stroke="#fbbf24" strokeWidth={2} />}
                  {v.settlement?.kind === 'city' && v.wall !== null && (
                    <text x={pos.x + 12} y={pos.y + 12} fontSize={10}>🧱</text>
                  )}
                  {v.fishingGround && (
                    <g>
                      <circle cx={pos.x + 13} cy={pos.y - 13} r={8} fill="#f5eeda" stroke="#0b1f14" strokeWidth={1} />
                      <text x={pos.x + 13} y={pos.y - 9} textAnchor="middle" fontSize={9}>🐟</text>
                      <text x={pos.x + 13} y={pos.y - 24} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">{v.fishingGround.token}</text>
                    </g>
                  )}
                  {highlighted && <circle cx={pos.x} cy={pos.y} r={14} fill="transparent" />}
                </g>
              );
            })}
          </svg>
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
            {ex.citiesKnights && game.eventDie && (
              <DiceFace kind="event" face={game.eventDie === 'ship' ? 'ship' : game.eventDie.replace('gate-', '')} size={40} />
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
            {ex.citiesKnights && COMMODITIES.map((c) => (
              <span key={c} style={{
                background: '#141414', border: '1px solid #333', borderRadius: 8,
                padding: '3px 7px', fontSize: 12,
                outline: mustDiscard && discardSel[c] ? '2px solid #fbbf24' : 'none',
                cursor: mustDiscard ? 'pointer' : 'default',
              }} onClick={() => toggleDiscard(c)}>
                {COMMODITY_ICON[c]} {me.commodities[c] || 0}{mustDiscard && discardSel[c] ? ` (−${discardSel[c]})` : ''}
              </span>
            ))}
            {ex.fishermen && (
              <span style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: '3px 7px', fontSize: 12 }}>
                🐟 {me.fish}
              </span>
            )}
            <span style={{ background: '#141414', border: '1px solid #333', borderRadius: 8, padding: '3px 7px', fontSize: 12 }}>
              🃏 {me.devCards.length}
              {ex.citiesKnights ? ` 📜 ${me.progressCards.length}` : ''}
            </span>
          </div>
        </div>

        {/* Discard panel (robber 7, a player holds too many cards) */}
        {mustDiscard && (
          <div style={{ background: '#3f1d1d', border: '1px solid #7f1d1d', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>Tap your resource{ex.citiesKnights ? ' and commodity' : ''} chips above to pick {discardNeed} cards to discard ({discardPicked}/{discardNeed} picked).</p>
            <Orb symbol="✓" label="Discard" small
              disabled={discardPicked !== discardNeed}
              onClick={() => {
                move({ type: 'discard', cards: discardSel });
                setDiscardSel({});
              }} />
          </div>
        )}

        {/* Free-resource picks (gold river / Aqueduct) */}
        {freePicks > 0 && myTurn && (
          <div style={{ background: '#1c2f22', border: '1px solid #fbbf24', borderRadius: 10, padding: 10, textAlign: 'center' }}>
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

        {/* Robber / pirate choice (Seafarers, on a 7) */}
        {mustRob && ex.seafarers && game.robberChoice && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>Seven! Move the robber on land — or the pirate out at sea?</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Orb symbol="🥷" label="Robber" small active={robberChoice === 'robber'} onClick={() => setRobberChoice('robber')} />
              <Orb symbol="🏴‍☠️" label="Pirate" small active={robberChoice === 'pirate'} onClick={() => setRobberChoice('pirate')} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#a1a1aa' }}>Then tap a {robberChoice === 'pirate' ? 'sea hex' : 'land hex'} on the board.</p>
          </div>
        )}

        {/* Camel placement (Caravans) */}
        {game.camelPending?.player === pid && (
          <div style={{ background: '#1c2f22', border: '1px solid #fbbf24', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13 }}>Place your camel — tap a glowing path next to your new settlement or city. Settlements and cities next to a camel are worth +1 point each.</p>
          </div>
        )}

        {/* Ship move mode (Seafarers) */}
        {shipMoveFrom && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {shipMoveDests.length > 0 ? 'Tap a glowing edge to sail your ship there.' : 'That ship is locked in — it cannot move this turn.'}
            </p>
            <Orb symbol="✕" label="Cancel" small onClick={() => { setShipMoveFrom(null); setBuildMode(null); }} />
          </div>
        )}

        {/* Trade panel: bank / ports (+ offers online) */}
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

        {/* Development cards panel (base game) */}
        {devOpen && canAct && !ex.citiesKnights && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Your development cards ({me.devCards.length})</p>
            {me.devCards.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa' }}>None yet — buy one below. A card cannot be played the turn you buy it.</p>}
            {devPick === 'monopoly' && (
              <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Monopoly: tap a resource to take it from everyone.</p>
            )}
            {devPick === 'yearOfPlenty' && (
              <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Year of Plenty: tap two resources ({yopPicks.length}/2 picked).</p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {me.devCards.map((c, i) => {
                const playable = canPlayDev(game, pid, c.type);
                const label = { knight: '⚔️ Knight', victoryPoint: '⭐ Victory Point', monopoly: '👑 Monopoly', yearOfPlenty: '🌾 Year of Plenty', roadBuilding: '🛣️ Road Building' }[c.type];
                return (
                  <button key={i} type="button" disabled={!playable || !!devPick}
                    onClick={() => {
                      if (c.type === 'knight') { move({ type: 'playKnight' }); setDevOpen(false); }
                      else if (c.type === 'monopoly') setDevPick('monopoly');
                      else if (c.type === 'yearOfPlenty') setDevPick('yearOfPlenty');
                      else if (c.type === 'roadBuilding') { move({ type: 'playRoadBuilding' }); setDevOpen(false); setBuildMode('road'); }
                    }}
                    style={{ background: '#27272a', color: '#fff', border: '1px solid #555', borderRadius: 8, padding: '4px', fontSize: 12, cursor: playable && !devPick ? 'pointer' : 'default', opacity: playable ? 1 : 0.5 }}>
                    <CardFace kind={c.type} width={64} height={90} />
                    <span style={{ display: 'block', marginTop: 2 }}>{label}{c.boughtAtTurn >= game.turnCount ? ' (new)' : ''}</span>
                  </button>
                );
              })}
              {(devPick === 'monopoly' || devPick === 'yearOfPlenty') && RESOURCES.map((r) => (
                <button key={r} type="button"
                  onClick={() => {
                    if (devPick === 'monopoly') {
                      move({ type: 'playMonopoly', resource: r });
                      setDevPick(null); setDevOpen(false);
                    } else {
                      const next = [...yopPicks, r];
                      setYopPicks(next);
                      if (next.length === 2) {
                        move({ type: 'playYearOfPlenty', r1: next[0], r2: next[1] });
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
                disabled={!(me.resources.sheep >= 1 && me.resources.wheat >= 1 && me.resources.ore >= 1) || game.devDeck.length === 0}
                onClick={() => move({ type: 'buyDevCard' })} />
              <Orb symbol="✕" label="Close" small onClick={() => { setDevOpen(false); setDevPick(null); setYopPicks([]); }} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
              Buy: 1 sheep + 1 wheat + 1 ore · {game.devDeck.length} cards left in the deck
            </p>
          </div>
        )}

        {/* Progress cards panel (Cities & Knights) */}
        {progOpen && canAct && ex.citiesKnights && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Your progress cards ({me.progressCards.length})</p>
            {me.progressCards.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa' }}>None yet — improve a city track to draw one when its colour comes up on the event die.</p>}
            {progPick && (
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#fbbf24' }}>
                {PROGRESS_PICK[progPick] === 'hex' && 'Tap a hex on the board.'}
                {PROGRESS_PICK[progPick] === 'hex2' && (progHexA === null ? 'Tap the first hex to swap.' : 'Tap the second hex to swap.')}
                {PROGRESS_PICK[progPick] === 'vertex' && 'Tap a knight on the board.'}
                {PROGRESS_PICK[progPick] === 'edge' && 'Tap one of your roads or ships on the board.'}
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
            {progPick === 'resourceMonopoly' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {RESOURCES.map((r) => (
                  <button key={r} type="button" onClick={() => playProgress('resourceMonopoly', { resource: r })}
                    style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                    {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                  </button>
                ))}
              </div>
            )}
            {progPick === 'tradeMonopoly' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {COMMODITIES.map((c) => (
                  <button key={c} type="button" onClick={() => playProgress('tradeMonopoly', { commodity: c })}
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

        {/* Improvements panel (Cities & Knights) */}
        {impOpen && ex.citiesKnights && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>City improvements</p>
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
                    disabled={!canAct || me.cities < 1 || level >= 5 || (me.commodities[comm] || 0) < cost}
                    onClick={() => move({ type: 'buyImprovement', track })} />
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="🧱" label="Build wall" small
                disabled={!canAct || me.walls >= 3 || myWallCities.length === 0}
                onClick={() => setBuildMode('wall')} />
              <Orb symbol="✕" label="Close" small onClick={() => { setImpOpen(false); setBuildMode(null); }} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
              A wall costs 2 brick and goes under one of your cities — it lets you hold 2 more cards before discarding on a 7. You have {me.walls} of 3 walls.
            </p>
          </div>
        )}

        {/* Knights panel (Cities & Knights) */}
        {knightOpen && ex.citiesKnights && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Knights — your army against the barbarians</p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#a1a1aa' }}>
              Hire a knight (1 sheep + 1 ore) on an open corner of your roads. Rally it (1 wheat) to fight, then tap it and tap a destination to move it or displace a weaker enemy knight. Knights in reserve: basic {me.knightSupply.basic}, strong {me.knightSupply.strong}, mighty {me.knightSupply.mighty}.
            </p>
            {myKnights.length === 0 && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#a1a1aa' }}>No knights on the board yet.</p>}
            {myKnights.map((v) => (
              <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>
                  Knight level {v.knight.level} — {v.knight.active ? 'active, ready to act' : 'resting'}
                </span>
                <button type="button" onClick={() => { setSelectedKnight(v.key); setKnightMoveFrom(v.knight.active ? v.key : null); }}
                  style={{ background: selectedKnight === v.key ? '#78350f' : '#27272a', color: '#fff', border: '1px solid #555', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                  Select
                </button>
              </div>
            ))}
            {selKnight && selectedKnight && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                <Orb symbol="⚔️" label="Rally" small
                  disabled={!canAct || selKnight.active}
                  onClick={() => move({ type: 'activateKnight', vertex: selectedKnight })} />
                <Orb symbol="⬆️" label="Upgrade" small
                  disabled={!canAct || selKnight.level >= 3}
                  onClick={() => move({ type: 'upgradeKnight', vertex: selectedKnight })} />
                <Orb symbol="➡️" label="Move" small
                  disabled={!canAct || !selKnight.active}
                  onClick={() => setKnightMoveFrom(selectedKnight)} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="🛡️" label="Hire knight" small
                disabled={!canAct || me.knightSupply.basic < 1}
                onClick={() => { setBuildMode('knight'); setKnightOpen(false); }} />
              <Orb symbol="✕" label="Close" small onClick={() => { setKnightOpen(false); setSelectedKnight(null); setKnightMoveFrom(null); }} />
            </div>
          </div>
        )}

        {/* Barbarian track (Cities & Knights) */}
        {ex.citiesKnights && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarbarianShipMarker size={28} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Barbarian ship</span>
              <span style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                {Array.from({ length: BARBARIAN_TRACK_LENGTH }).map((_, i) => (
                  <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < game.barbarianTrack ? '#dc2626' : '#3f3f46', display: 'inline-block', border: '1px solid #555' }} />
                ))}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#a1a1aa' }}>
              {game.barbarianTrack}/{BARBARIAN_TRACK_LENGTH} — when the ship reaches 7, the barbarians attack. If your active knights are weaker than the cities, the weakest defender loses a city. The strongest defender earns a Defender of Catan card (+1 point).
            </p>
          </div>
        )}

        {/* Fish menu (Fishermen) */}
        {fishOpen && ex.fishermen && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Spend your fish — you hold {me.fish}</p>
            {FISH_MENU.map((item) => (
              <div key={item.action} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{item.label} — <b>{item.cost} 🐟</b></span>
                <Orb symbol="🐟" label="Spend" small
                  disabled={!canAct || me.fish < item.cost || (item.action === 'devCard' && ex.citiesKnights)}
                  onClick={() => {
                    if (item.action === 'steal' || item.action === 'resource') setFishPick(item.action);
                    else move({ type: 'spendFish', action: item.action });
                  }} />
              </div>
            ))}
            {fishPick === 'steal' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Steal from whom?</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {game.players.filter((p) => p.id !== pid).map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { move({ type: 'spendFish', action: 'steal', victim: p.id }); setFishPick(null); }}
                      style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fishPick === 'resource' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>Take which resource?</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {RESOURCES.map((r) => (
                    <button key={r} type="button"
                      onClick={() => { move({ type: 'spendFish', action: 'resource', resource: r }); setFishPick(null); }}
                      style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                      {RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ex.fishermen && game.oldBootHolder === pid && (
              <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 8, textAlign: 'center' }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#fbbf24' }}>🥾 You hold the old boot — you need one more point to win. Pass it to someone with as many points as you.</p>
                <Orb symbol="🥾" label="Pass boot" small onClick={() => setBootOpen((b) => !b)} />
                {bootOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                    {game.players.filter((p) => p.id !== pid && victoryPoints(game, p.id) >= victoryPoints(game, pid)).map((p) => (
                      <button key={p.id} type="button"
                        onClick={() => { move({ type: 'passBoot', to: p.id }); setBootOpen(false); }}
                        style={{ background: '#78350f', color: '#fff', border: '2px solid #fbbf24', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                        {p.name} ({victoryPoints(game, p.id)} pts)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <Orb symbol="✕" label="Close" small onClick={() => { setFishOpen(false); setFishPick(null); }} />
            </div>
          </div>
        )}

        {/* Build submenu */}
        {canAct && buildMode && (
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {buildMode === 'road' && 'Road — tap a glowing road spot. Cost: 1 wood + 1 brick.'}
              {buildMode === 'settlement' && 'Settlement — tap a glowing corner on your road. Cost: 1 wood + 1 brick + 1 sheep + 1 wheat.'}
              {buildMode === 'city' && 'City — tap one of your settlements to upgrade it. Cost: 2 wheat + 3 ore.'}
              {buildMode === 'ship' && 'Ship — tap a glowing water edge. Cost: 1 wood + 1 sheep.'}
              {buildMode === 'shipMove' && 'Move a ship — tap one of your ships, then a glowing edge.'}
              {buildMode === 'knight' && 'Hire a knight — tap a glowing corner on your roads. Cost: 1 sheep + 1 ore.'}
              {buildMode === 'wall' && 'Build a wall — tap one of your cities with no wall. Cost: 2 brick.'}
              {game.freeRoads > 0 && ' (Road Building: free!)'}
            </p>
            <Orb symbol="✕" label="Cancel" small onClick={() => { setBuildMode(null); setShipMoveFrom(null); }} />
          </div>
        )}

        {/* Action orbs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Orb symbol="🎲" label="Roll" disabled={!canRoll}
            onClick={() => move({ type: 'roll' })} />
          <Orb symbol="🔨" label="Build" disabled={!canAct} active={!!buildMode}
            onClick={() => {
              setTradeOpen(false); setDevOpen(false); setProgOpen(false); setImpOpen(false); setKnightOpen(false); setFishOpen(false);
              setBuildMode((m) => (m ? null : 'road'));
            }} />
          {buildMode && (
            <>
              <Orb symbol="🛣️" label="Road" small active={buildMode === 'road'}
                onClick={() => setBuildMode('road')} />
              {ex.seafarers && (
                <>
                  <Orb symbol="🚢" label="Ship" small active={buildMode === 'ship'}
                    onClick={() => setBuildMode('ship')} />
                  <Orb symbol="⛵" label="Move ship" small active={buildMode === 'shipMove'}
                    onClick={() => setBuildMode('shipMove')} />
                </>
              )}
              <Orb symbol="🏠" label="Settle" small active={buildMode === 'settlement'}
                onClick={() => setBuildMode('settlement')} />
              <Orb symbol="🏰" label="City" small active={buildMode === 'city'}
                onClick={() => setBuildMode('city')} />
              {ex.citiesKnights && (
                <Orb symbol="🛡️" label="Knight" small active={buildMode === 'knight'}
                  onClick={() => setBuildMode('knight')} />
              )}
            </>
          )}
          <Orb symbol="🔄" label="Trade" disabled={!canAct} active={tradeOpen}
            onClick={() => { setBuildMode(null); setDevOpen(false); setProgOpen(false); setImpOpen(false); setKnightOpen(false); setFishOpen(false); setTradeOpen((t) => !t); }} />
          {!ex.citiesKnights && (
            <Orb symbol="🃏" label="Cards" disabled={!canAct} active={devOpen}
              onClick={() => { setBuildMode(null); setTradeOpen(false); setDevOpen((d) => !d); }} />
          )}
          {ex.citiesKnights && (
            <>
              <Orb symbol="📜" label="Progress" disabled={!canAct} active={progOpen}
                onClick={() => { setBuildMode(null); setTradeOpen(false); setImpOpen(false); setKnightOpen(false); setProgOpen((d) => !d); }} />
              <Orb symbol="🏛️" label="Improve" disabled={!canAct} active={impOpen}
                onClick={() => { setBuildMode(null); setTradeOpen(false); setProgOpen(false); setKnightOpen(false); setImpOpen((d) => !d); }} />
              <Orb symbol="🛡️" label="Knights" disabled={!canAct} active={knightOpen}
                onClick={() => { setBuildMode(null); setTradeOpen(false); setProgOpen(false); setImpOpen(false); setKnightOpen((d) => !d); }} />
            </>
          )}
          {ex.fishermen && (
            <Orb symbol="🐟" label="Fish" disabled={!canAct} active={fishOpen}
              onClick={() => { setBuildMode(null); setTradeOpen(false); setFishOpen((d) => !d); }} />
          )}
          <Orb symbol="⏭" label="End turn" disabled={!canAct}
            onClick={() => { setBuildMode(null); setTradeOpen(false); setDevOpen(false); setProgOpen(false); setImpOpen(false); setKnightOpen(false); setFishOpen(false); move({ type: 'endTurn' }); }} />
        </div>

        {/* Build costs, plain English */}
        <p style={{ margin: 0, fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
          Road 🌲🧱 · Settlement 🌲🧱🐑🌾 · City 🌾🌾⛰️⛰️⛰️ · Card 🐑🌾⛰️
          {ex.seafarers ? ' · Ship 🌲🐑' : ''}
          {ex.citiesKnights ? ' · Knight 🐑⛰️ · Wall 🧱🧱' : ''}
          {' '}· First to {winTarget(game)} points wins
          {ex.fishermen ? ' (boot holders need one more)' : ''}
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
            : `You vs ${game.players.filter((p) => p.isAI).map((p) => p.name).join(', ')} · Bank and port trading only — trade with other players in an online room.`}
        </p>
      </div>
    </main>
  );
}
