// app/monopoly/page.jsx — Olympus Monopoly: official Hasbro rules.
// Human vs 1-3 AI. Engine in lib/monopoly/engine.js (pure logic).

'use client';

import { useRef, useState } from 'react';
import {
  BOARD, GROUP_SPACES, START_CASH, GO_SALARY, JAIL_FINE,
  createGame, currentPlayer, ownerOf, playerProperties, ownsGroup,
  houseLevel, isMortgaged, rentFor, mortgageValue, unmortgageCost, netWorth,
  doRoll, decideBuy, auctionAct, auctionBidder,
  jailChoose, buildHouse, sellHouse, canBuild, canSell,
  mortgage, unmortgage, canMortgage,
  proposeTrade, respondTrade, aiRespondTrade, emptyTrade, validateTrade,
  payDebt, declareBankruptcy, raiseFundsLikeAI,
  aiPlayTurn, aiAuctionBid, aiWantsToBuy, fmt,
} from '@/lib/monopoly/engine.js';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Grid position for each of the 40 spaces on an 11x11 board.
// Go bottom-right, play runs counter-clockwise (official direction).
function spaceGrid(i) {
  if (i === 0) return { r: 10, c: 10 };
  if (i < 10) return { r: 10, c: 10 - i };
  if (i === 10) return { r: 10, c: 0 };
  if (i < 20) return { r: 10 - (i - 10), c: 0 };
  if (i === 20) return { r: 0, c: 0 };
  if (i < 30) return { r: 0, c: i - 20 };
  if (i === 30) return { r: 0, c: 10 };
  return { r: i - 30, c: 10 };
}

function SpaceCell({ idx, game, onTap }) {
  const s = BOARD[idx];
  const g = game;
  const owner = ownerOf(g, idx);
  const lvl = houseLevel(g, idx);
  const mort = isMortgaged(g, idx);
  const tokens = g.players.filter((p) => !p.bankrupt && p.pos === idx);
  const { r, c } = spaceGrid(idx);
  const corner = s.type === 'go' || s.type === 'jail' || s.type === 'parking' || s.type === 'gotojail';
  return (
    <button
      onClick={() => onTap(idx)}
      style={{ gridRow: r + 1, gridColumn: c + 1 }}
      className="relative border border-[#2a4a35] bg-[#f7f2df] overflow-hidden text-left p-0"
      title={s.name}
    >
      {(s.type === 'property' || s.type === 'railroad' || s.type === 'utility') && (
        <div className="h-[5px] w-full" style={{ background: s.color || '#999' }} />
      )}
      <div className="px-[2px] leading-none">
        <div className="text-[7px] font-bold text-[#1a2e1f] truncate">{s.short || s.name}</div>
        {s.price !== undefined && !mort && (
          <div className="text-[7px] text-[#1a2e1f]">${s.price}</div>
        )}
        {mort && <div className="text-[7px]">🔒</div>}
        {lvl > 0 && lvl < 5 && (
          <div className="text-[7px]">{'🏠'.repeat(Math.min(lvl, 4))}</div>
        )}
        {lvl === 5 && <div className="text-[7px]">🏨</div>}
        {!corner && s.type !== 'property' && s.type !== 'railroad' && s.type !== 'utility' && s.price === undefined && (
          <div className="text-[9px]">{iconFor(s.type)}</div>
        )}
      </div>
      {owner !== null && owner !== undefined && (
        <div
          className="absolute top-[1px] right-[1px] w-[6px] h-[6px] rounded-full border border-black"
          style={{ background: g.players[owner].token }}
        />
      )}
      {tokens.length > 0 && (
        <div className="absolute bottom-[1px] left-[1px] flex">
          {tokens.slice(0, 4).map((p) => (
            <div
              key={p.id}
              className="w-[7px] h-[7px] rounded-full border border-black -ml-[2px]"
              style={{ background: p.token }}
              title={p.name}
            />
          ))}
        </div>
      )}
    </button>
  );
}

function iconFor(type) {
  switch (type) {
    case 'chance': return '❓';
    case 'chest': return '🎁';
    case 'tax': return '🧾';
    case 'gotojail': return '🚔';
    case 'jail': return '🔒';
    case 'parking': return '🅿️';
    case 'go': return '➡️';
    default: return '';
  }
}

export default function MonopolyPage() {
  const gameRef = useRef(null);
  const pumpRef = useRef(false);
  const [, setTick] = useState(0);
  const [numAI, setNumAI] = useState(3);
  const [selected, setSelected] = useState(null); // space idx for detail sheet
  const [showTrade, setShowTrade] = useState(false);
  const [bidInput, setBidInput] = useState('');
  const tick = () => setTick((t) => t + 1);

  const g = gameRef.current;
  const me = g ? g.players[0] : null;
  const myTurn = g && !g.winner && g.turn === 0 && !me.bankrupt;

  function startGame() {
    gameRef.current = createGame(numAI + 1, (Date.now() % 2147483647) >>> 0);
    setSelected(null);
    setShowTrade(false);
    tick();
  }

  // Run AI turns / AI auction bids until a human decision is needed.
  async function pumpAi() {
    if (pumpRef.current) return;
    pumpRef.current = true;
    try {
      const game = gameRef.current;
      for (let guard = 0; guard < 600 && game && !game.winner; guard++) {
        const p = game.players[game.turn];
        if (game.phase === 'roll' || game.phase === 'jail') {
          if (p.bankrupt || !p.isAI) break;
          await sleep(550);
          aiPlayTurn(game);
          tick();
        } else if (game.phase === 'auction' && game.auction) {
          const bidder = auctionBidder(game);
          const bp = game.players[bidder];
          if (bp.bankrupt || !bp.isAI) break;
          await sleep(450);
          auctionAct(game, bidder, aiAuctionBid(game, bidder));
          tick();
        } else {
          break; // buy / debt / trade need the human (or are terminal)
        }
      }
    } finally {
      pumpRef.current = false;
      tick();
    }
  }

  // After the human goes bankrupt, let the AIs finish the game fast.
  async function autoFinish() {
    const game = gameRef.current;
    for (let guard = 0; guard < 3000 && game && !game.winner; guard++) {
      const p = game.players[game.turn];
      if (game.phase === 'roll') {
        if (p.bankrupt) break;
        if (!p.isAI) break;
        aiPlayTurn(game);
      } else if (game.phase === 'jail') {
        if (p.bankrupt || !p.isAI) break;
        aiPlayTurn(game);
      } else if (game.phase === 'buy' && game.pendingBuy !== null) {
        const cp = game.players[game.turn];
        if (!cp.isAI || cp.bankrupt) break;
        decideBuy(game, aiWantsToBuy(game, cp, game.pendingBuy));
      } else if (game.phase === 'auction' && game.auction) {
        const bidder = auctionBidder(game);
        auctionAct(game, bidder, aiAuctionBid(game, bidder));
      } else if (game.phase === 'debt' && game.debt) {
        const dp = game.players[game.debt.playerId];
        if (dp.bankrupt) break;
        if (!dp.isAI) break;
        raiseFundsLikeAI(game, dp.id);
        if (dp.cash >= game.debt.amount) payDebt(game);
        else declareBankruptcy(game);
      } else if (game.phase === 'trade') {
        respondTrade(game, false);
      } else {
        break;
      }
    }
    tick();
  }

  function humanRoll() {
    const game = gameRef.current;
    if (!game || game.phase !== 'roll' || game.turn !== 0) return;
    doRoll(game);
    tick();
    pumpAi();
  }

  function humanJail(choice) {
    const game = gameRef.current;
    if (!game || game.phase !== 'jail' || game.turn !== 0) return;
    jailChoose(game, choice);
    tick();
    if (game.phase === 'roll' || game.phase === 'jail') pumpAi();
  }

  function humanBuy(buy) {
    const game = gameRef.current;
    if (!game || game.phase !== 'buy') return;
    decideBuy(game, buy);
    setSelected(null);
    tick();
    pumpAi();
  }

  function humanBid(amount) {
    const game = gameRef.current;
    if (!game || !game.auction) return;
    if (auctionBidder(game) !== 0) return;
    auctionAct(game, 0, amount);
    setBidInput('');
    tick();
    pumpAi();
  }

  function humanPassAuction() {
    const game = gameRef.current;
    if (!game || !game.auction) return;
    if (auctionBidder(game) !== 0) return;
    auctionAct(game, 0, null);
    tick();
    pumpAi();
  }

  function humanPayDebt() {
    const game = gameRef.current;
    if (!game || game.phase !== 'debt' || !game.debt || game.debt.playerId !== 0) return;
    payDebt(game);
    tick();
    if (!game.winner) pumpAi();
  }

  function humanBankrupt() {
    const game = gameRef.current;
    if (!game || game.phase !== 'debt') return;
    declareBankruptcy(game);
    setSelected(null);
    tick();
    if (!game.winner) autoFinish();
  }

  function humanAutoRaise() {
    const game = gameRef.current;
    if (!game || game.phase !== 'debt' || !game.debt || game.debt.playerId !== 0) return;
    raiseFundsLikeAI(game, 0);
    tick();
  }

  function spaceAction(fn, idx) {
    const game = gameRef.current;
    if (!game) return;
    fn(game, 0, idx);
    tick();
    if (game.phase === 'debt' && game.debt && game.debt.playerId === 0) {
      // still in debt — stay; the debt panel remains
    }
  }

  // ---- setup screen ----
  if (!g) {
    return (
      <div className="min-h-screen bg-[#0a120c] text-[#f5f0e1] flex flex-col items-center justify-center p-6">
        <div className="text-5xl mb-3">🎩</div>
        <h1 className="text-3xl font-bold mb-1">Monopoly</h1>
        <p className="text-sm opacity-70 mb-6 text-center">Official rules. Buy it all, build it up,<br />bankrupt everyone else.</p>
        <div className="mb-2 text-sm opacity-80">Opponents</div>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setNumAI(n)}
              className={`w-12 h-12 rounded-xl text-lg font-bold border-2 ${numAI === n ? 'bg-[#ffd23f] text-black border-[#ffd23f]' : 'border-[#3a5a40] text-[#f5f0e1]'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={startGame}
          className="bg-[#1fb25a] text-white font-bold px-10 py-3 rounded-xl text-lg"
        >
          Start game
        </button>
        <p className="text-xs opacity-50 mt-6 text-center max-w-[280px]">
          You start with {fmt(START_CASH)}. Pass Go to collect {fmt(GO_SALARY)}.
          Doubles roll again — three in a row sends you to Jail.
        </p>
      </div>
    );
  }

  const cp = currentPlayer(g);
  const lastEvents = g.log.slice(-8).reverse();
  const dice = g.lastDice;

  return (
    <div className="min-h-screen bg-[#0a120c] text-[#f5f0e1] flex flex-col">
      {/* standings */}
      <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto">
        {g.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs whitespace-nowrap border ${g.turn === p.id && !g.winner ? 'border-[#ffd23f]' : 'border-transparent'} ${p.bankrupt ? 'opacity-40 line-through' : ''}`}
            style={{ background: '#14241a' }}
          >
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.token }} />
            <span className="font-bold">{p.name}{p.id === 0 ? ' (you)' : ''}</span>
            <span>{fmt(p.cash)}</span>
            {p.inJail && <span>🔒</span>}
            {p.gojf.length > 0 && <span>🃏{p.gojf.length}</span>}
          </div>
        ))}
      </div>

      {/* board */}
      <div className="px-2">
        <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(11, 1fr)', gridTemplateRows: 'repeat(11, 1fr)' }}>
            {BOARD.map((s, i) => (
              <SpaceCell key={i} idx={i} game={g} onTap={setSelected} />
            ))}
          </div>
          {/* center control panel */}
          <div className="absolute flex flex-col items-center justify-center text-center p-2"
            style={{ top: '9.5%', left: '9.5%', right: '9.5%', bottom: '9.5%', background: '#cfe3c8', borderRadius: 8 }}>
            <CenterPanel
              g={g} cp={cp} dice={dice} myTurn={myTurn}
              onRoll={humanRoll}
              onTrade={() => setShowTrade(true)}
              lastEvents={lastEvents}
              onPayDebt={humanPayDebt}
              onAutoRaise={humanAutoRaise}
              onBankrupt={humanBankrupt}
            />
          </div>
        </div>
      </div>

      <div className="h-2" />

      {/* modals & sheets */}
      {g.phase === 'buy' && g.turn === 0 && g.pendingBuy !== null && (
        <BuyModal g={g} onBuy={() => humanBuy(true)} onDecline={() => humanBuy(false)} />
      )}
      {g.phase === 'auction' && g.auction && (
        <AuctionModal g={g} bidInput={bidInput} setBidInput={setBidInput} onBid={humanBid} onPass={humanPassAuction} />
      )}
      {g.phase === 'jail' && g.turn === 0 && me.inJail && (
        <JailModal g={g} onChoice={humanJail} />
      )}
      {selected !== null && (
        <SpaceSheet g={g} idx={selected} onClose={() => setSelected(null)} onAction={spaceAction} myTurn={myTurn} />
      )}
      {showTrade && (
        <TradeModal g={g} onClose={() => setShowTrade(false)} onDone={() => { setShowTrade(false); tick(); pumpAi(); }} />
      )}
      {g.winner !== null && (
        <GameOverModal g={g} onRestart={startGame} />
      )}
    </div>
  );
}

function CenterPanel({ g, cp, dice, myTurn, onRoll, onTrade, lastEvents, onPayDebt, onAutoRaise, onBankrupt }) {
  const d = g.debt;
  const inDebt = g.phase === 'debt' && d && d.playerId === 0;
  return (
    <>
      <div className="text-[#1a2e1f]">
        <div className="font-bold text-sm">
          {g.winner !== null ? 'Game over' : myTurn ? 'Your turn' : `${cp.name}'s turn`}
        </div>
        <div className="text-2xl my-1 h-8">
          {dice ? <span>{DICE_FACES[dice[0] - 1]} {DICE_FACES[dice[1] - 1]}</span> : <span className="opacity-30">🎲🎲</span>}
        </div>
      </div>

      {inDebt ? (
        <div className="w-full bg-[#7a1f1f] text-white rounded-lg p-2 text-xs">
          <div className="font-bold mb-1">⚠️ You owe {fmt(d.amount)}</div>
          <div className="opacity-80 mb-2">{d.reason} → {d.creditor === 'bank' ? 'the bank' : g.players[d.creditor].name}. You have {fmt(g.players[0].cash)}.</div>
          <div className="text-[11px] opacity-80 mb-2">Tap your properties on the board to mortgage or sell houses, then pay.</div>
          <div className="flex gap-1 justify-center flex-wrap">
            <button onClick={onAutoRaise} className="bg-[#3a5a40] px-2 py-1 rounded font-bold">Raise funds for me</button>
            <button onClick={onPayDebt} className="bg-[#1fb25a] px-2 py-1 rounded font-bold">Pay {fmt(d.amount)}</button>
            <button onClick={onBankrupt} className="bg-black px-2 py-1 rounded font-bold">Go bankrupt</button>
          </div>
        </div>
      ) : (
        <>
          {myTurn && g.phase === 'roll' && (
            <button onClick={onRoll} className="bg-[#1fb25a] text-white font-bold px-8 py-2 rounded-xl text-base mb-1">
              🎲 Roll
            </button>
          )}
          {myTurn && (g.phase === 'roll' || g.phase === 'debt') && (
            <button onClick={onTrade} className="bg-[#2a4a35] text-white text-xs px-3 py-1 rounded-lg mb-1">
              🤝 Trade
            </button>
          )}
          {!myTurn && g.winner === null && (
            <div className="text-xs text-[#1a2e1f] opacity-70 mb-1">
              {g.phase === 'auction' ? 'Auction running…' : `${cp.name} is thinking…`}
            </div>
          )}
        </>
      )}

      <div className="w-full mt-1 overflow-y-auto text-left" style={{ maxHeight: 110 }}>
        {lastEvents.map((e, i) => (
          <div key={i} className="text-[10px] text-[#1a2e1f] leading-tight opacity-80">{e}</div>
        ))}
      </div>
    </>
  );
}

function BuyModal({ g, onBuy, onDecline }) {
  const s = BOARD[g.pendingBuy];
  const cash = g.players[0].cash;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
      <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-t-2xl p-4 w-full max-w-md">
        <div className="h-2 rounded mb-2" style={{ background: s.color || '#999' }} />
        <h2 className="font-bold text-lg">{s.name}</h2>
        <p className="text-sm mb-1">Price: <b>{fmt(s.price)}</b> · You have {fmt(cash)}</p>
        {s.rents && <p className="text-xs opacity-70 mb-3">Rent: {fmt(s.rents[0])} (double with full set) · Houses: {s.rents.slice(1, 5).map(fmt).join(' / ')} · Hotel: {fmt(s.rents[5])}</p>}
        {s.type === 'railroad' && <p className="text-xs opacity-70 mb-3">Rent: $25 / $50 / $100 / $200 with 1–4 railroads.</p>}
        {s.type === 'utility' && <p className="text-xs opacity-70 mb-3">Rent: 4× dice roll (one) or 10× (both).</p>}
        <div className="flex gap-2">
          <button
            onClick={onBuy}
            disabled={cash < s.price}
            className="flex-1 bg-[#1fb25a] text-white font-bold py-3 rounded-xl disabled:opacity-40"
          >
            Buy {fmt(s.price)}
          </button>
          <button onClick={onDecline} className="flex-1 bg-[#2a4a35] text-white font-bold py-3 rounded-xl">
            Auction
          </button>
        </div>
        <p className="text-[11px] opacity-60 mt-2 text-center">Declining sends it to auction — anyone can bid, starting at $1.</p>
      </div>
    </div>
  );
}

function AuctionModal({ g, bidInput, setBidInput, onBid, onPass }) {
  const a = g.auction;
  const s = BOARD[a.spaceIdx];
  const bidder = a.order[a.idx];
  const isMe = bidder === 0 && !g.players[0].bankrupt;
  const minBid = a.highBid + 1;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
      <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-t-2xl p-4 w-full max-w-md">
        <h2 className="font-bold text-lg">🔨 Auction: {s.name}</h2>
        <p className="text-sm mb-1">Worth {fmt(s.price)}</p>
        <p className="text-sm mb-3">
          {a.highBidder === null ? 'No bids yet.' : <>High bid: <b>{fmt(a.highBid)}</b> by {g.players[a.highBidder].name}</>}
        </p>
        {isMe ? (
          <>
            <div className="text-sm mb-1">Your bid (min {fmt(minBid)}, you have {fmt(g.players[0].cash)}):</div>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                placeholder={String(minBid)}
                className="flex-1 border border-[#2a4a35] rounded-xl px-3 py-2 text-black"
                min={minBid}
              />
              <button
                onClick={() => onBid(Math.max(minBid, parseInt(bidInput || '0', 10)))}
                className="bg-[#1fb25a] text-white font-bold px-6 rounded-xl"
              >
                Bid
              </button>
            </div>
            <button onClick={onPass} className="w-full bg-[#2a4a35] text-white font-bold py-2 rounded-xl">Pass</button>
          </>
        ) : (
          <p className="text-sm opacity-70">Waiting for {g.players[bidder].name}…</p>
        )}
      </div>
    </div>
  );
}

function JailModal({ g, onChoice }) {
  const p = g.players[0];
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
      <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-t-2xl p-4 w-full max-w-md">
        <h2 className="font-bold text-lg mb-1">🔒 You're in Jail</h2>
        <p className="text-sm opacity-70 mb-3">You can still collect rent. Three ways out:</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onChoice('pay')}
            disabled={p.cash < JAIL_FINE}
            className="bg-[#1fb25a] text-white font-bold py-3 rounded-xl disabled:opacity-40"
          >
            Pay {fmt(JAIL_FINE)} and roll
          </button>
          <button
            onClick={() => onChoice('card')}
            disabled={p.gojf.length === 0}
            className="bg-[#d93a96] text-white font-bold py-3 rounded-xl disabled:opacity-40"
          >
            Use Get Out of Jail Free ({p.gojf.length})
          </button>
          <button onClick={() => onChoice('roll')} className="bg-[#2a4a35] text-white font-bold py-3 rounded-xl">
            Roll for doubles (try {p.jailTurns + 1} of 3)
          </button>
        </div>
      </div>
    </div>
  );
}

function SpaceSheet({ g, idx, onClose, onAction, myTurn }) {
  const s = BOARD[idx];
  const owner = ownerOf(g, idx);
  const lvl = houseLevel(g, idx);
  const mort = isMortgaged(g, idx);
  const mine = owner === 0;
  const inDebt = g.phase === 'debt' && g.debt && g.debt.playerId === 0;
  const canManage = myTurn && mine && (g.phase === 'roll' || inDebt);
  const buildCheck = mine ? canBuild(g, 0, idx) : null;
  const sellCheck = mine ? canSell(g, 0, idx) : null;
  const mortCheck = mine ? canMortgage(g, 0, idx) : null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-t-2xl p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="h-2 rounded mb-2" style={{ background: s.color || '#999' }} />
        <h2 className="font-bold text-lg">{s.name}</h2>
        {owner !== null && owner !== undefined && (
          <p className="text-sm mb-1">Owned by <b style={{ color: g.players[owner].token === '#ffd23f' ? '#a07d00' : g.players[owner].token }}>{g.players[owner].name}</b>{mort ? ' (mortgaged 🔒)' : ''}</p>
        )}
        {owner === null && s.price !== undefined && <p className="text-sm mb-1">Unowned · Price {fmt(s.price)}</p>}
        {s.type === 'tax' && <p className="text-sm mb-1">Pay {fmt(s.amount)} when you land here.</p>}
        {(s.type === 'go' || s.type === 'parking') && <p className="text-sm mb-1">{s.type === 'go' ? 'Collect $200 every time you pass.' : 'Nothing happens here. Take a breath.'}</p>}
        {s.type === 'jail' && <p className="text-sm mb-1">Just visiting… unless the dice say otherwise.</p>}
        {s.type === 'gotojail' && <p className="text-sm mb-1">Land here and it's straight to Jail. Do not pass Go.</p>}
        {(s.type === 'chance' || s.type === 'chest') && <p className="text-sm mb-1">Draw a card. Could be great. Could be Jail.</p>}

        {s.rents && (
          <div className="text-xs mt-2 mb-1 grid grid-cols-2 gap-x-4">
            <span>Rent: <b>{fmt(s.rents[0])}</b>{owner !== null && lvl === 0 && ownsGroup(g, owner, s.group) ? ' ×2 (full set)' : ''}</span>
            <span>Mortgage: {fmt(Math.floor(s.price / 2))}</span>
            <span>1 house: {fmt(s.rents[1])}</span>
            <span>2 houses: {fmt(s.rents[2])}</span>
            <span>3 houses: {fmt(s.rents[3])}</span>
            <span>4 houses: {fmt(s.rents[4])}</span>
            <span>Hotel: {fmt(s.rents[5])}</span>
            <span>House cost: {fmt(s.houseCost)}</span>
          </div>
        )}
        {s.type === 'railroad' && <p className="text-xs mt-2">Rent with 1/2/3/4 railroads: $25 / $50 / $100 / $200. Mortgage {fmt(100)}.</p>}
        {s.type === 'utility' && <p className="text-xs mt-2">Rent: 4× your dice roll (one utility) or 10× (both). Mortgage {fmt(75)}.</p>}
        {lvl > 0 && <p className="text-xs mt-1">{lvl === 5 ? '🏨 Hotel here' : `🏠 ${lvl} house(s) here`}</p>}

        {canManage && (
          <div className="flex flex-col gap-2 mt-3">
            {!inDebt && buildCheck && (
              <button
                onClick={() => onAction(buildHouse, idx)}
                disabled={!buildCheck.ok}
                title={buildCheck.ok ? '' : buildCheck.why}
                className="bg-[#1fb25a] text-white font-bold py-2 rounded-xl disabled:opacity-40 text-sm"
              >
                {lvl === 4 ? `Build hotel (${fmt(s.houseCost)})` : `Build house (${fmt(s.houseCost)})`}
                {!buildCheck.ok && <span className="block text-[11px] font-normal opacity-80">{buildCheck.why}</span>}
              </button>
            )}
            {sellCheck && sellCheck.ok && (
              <button onClick={() => onAction(sellHouse, idx)} className="bg-[#8a6d1c] text-white font-bold py-2 rounded-xl text-sm">
                Sell {lvl === 5 ? 'hotel' : 'house'} (+{fmt(Math.floor(s.houseCost / 2))})
              </button>
            )}
            {mort && (
              <button onClick={() => onAction(unmortgage, idx)} className="bg-[#2a4a35] text-white font-bold py-2 rounded-xl text-sm">
                Unmortgage ({fmt(unmortgageCost(idx))})
              </button>
            )}
            {!mort && mortCheck && mortCheck.ok && (
              <button onClick={() => onAction(mortgage, idx)} className="bg-[#6b4a1c] text-white font-bold py-2 rounded-xl text-sm">
                Mortgage (+{fmt(mortgageValue(idx))})
              </button>
            )}
            {!mort && mortCheck && !mortCheck.ok && lvl === 0 && (
              <p className="text-[11px] opacity-60 text-center">{mortCheck.why}</p>
            )}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-3 text-sm opacity-60">Close</button>
      </div>
    </div>
  );
}

function TradeModal({ g, onClose, onDone }) {
  const me = g.players[0];
  const partners = g.players.filter((p) => p.id !== 0 && !p.bankrupt);
  const [to, setTo] = useState(partners[0] ? partners[0].id : null);
  const [offerCash, setOfferCash] = useState('');
  const [offerProps, setOfferProps] = useState([]);
  const [offerGojf, setOfferGojf] = useState(0);
  const [reqCash, setReqCash] = useState('');
  const [reqProps, setReqProps] = useState([]);
  const [reqGojf, setReqGojf] = useState(0);
  const [result, setResult] = useState(null);

  if (to === null) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
        <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-t-2xl p-4 w-full max-w-md">
          <p>No one left to trade with.</p>
          <button onClick={onClose} className="mt-2 bg-[#2a4a35] text-white px-4 py-2 rounded-xl">Close</button>
        </div>
      </div>
    );
  }
  const them = g.players[to];
  const myProps = playerProperties(g, 0);
  const theirProps = playerProperties(g, to);

  const toggle = (list, setList, idx) => {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx]);
  };

  const propose = () => {
    const offer = { cash: Math.max(0, parseInt(offerCash || '0', 10)), properties: offerProps, gojf: offerGojf };
    const request = { cash: Math.max(0, parseInt(reqCash || '0', 10)), properties: reqProps, gojf: reqGojf };
    const v = validateTrade(g, 0, to, offer, request);
    if (!v.ok) { setResult('⚠️ ' + v.why); return; }
    proposeTrade(g, 0, to, offer, request);
    const accepted = aiRespondTrade(g);
    respondTrade(g, accepted);
    setResult(accepted ? `✅ ${them.name} accepted your trade!` : `❌ ${them.name} turned it down.`);
    setTimeout(onDone, 1200);
  };

  const propRow = (idx, list, setList, ownerId) => (
    <label key={idx} className="flex items-center gap-1 text-xs py-[2px]">
      <input type="checkbox" checked={list.includes(idx)} onChange={() => toggle(list, setList, idx)} disabled={houseLevel(g, idx) > 0} />
      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: BOARD[idx].color || '#999' }} />
      <span className={houseLevel(g, idx) > 0 ? 'opacity-40' : ''}>{BOARD[idx].short || BOARD[idx].name}{isMortgaged(g, idx) ? ' 🔒' : ''}{houseLevel(g, idx) > 0 ? ' (has buildings)' : ''}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
      <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-t-2xl p-4 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <h2 className="font-bold text-lg mb-2">🤝 Trade</h2>
        <div className="flex gap-2 mb-3">
          {partners.map((p) => (
            <button key={p.id} onClick={() => { setTo(p.id); setResult(null); }}
              className={`px-3 py-1 rounded-lg text-sm font-bold ${to === p.id ? 'bg-[#ffd23f] text-black' : 'bg-[#2a4a35] text-white'}`}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="font-bold text-sm mb-1">You give</div>
            <div className="max-h-32 overflow-y-auto mb-1">{myProps.map((i) => propRow(i, offerProps, setOfferProps, 0))}</div>
            <input type="number" value={offerCash} onChange={(e) => setOfferCash(e.target.value)} placeholder="$ cash"
              className="w-full border rounded-lg px-2 py-1 text-sm text-black mb-1" />
            {me.gojf.length > 0 && (
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={offerGojf > 0} onChange={() => setOfferGojf(offerGojf > 0 ? 0 : 1)} />
                🃏 Get Out of Jail Free
              </label>
            )}
          </div>
          <div>
            <div className="font-bold text-sm mb-1">You get</div>
            <div className="max-h-32 overflow-y-auto mb-1">{theirProps.map((i) => propRow(i, reqProps, setReqProps, to))}</div>
            <input type="number" value={reqCash} onChange={(e) => setReqCash(e.target.value)} placeholder="$ cash"
              className="w-full border rounded-lg px-2 py-1 text-sm text-black mb-1" />
            {them.gojf.length > 0 && (
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={reqGojf > 0} onChange={() => setReqGojf(reqGojf > 0 ? 0 : 1)} />
                🃏 Get Out of Jail Free
              </label>
            )}
          </div>
        </div>
        {result && <p className="text-sm mt-2">{result}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={propose} className="flex-1 bg-[#1fb25a] text-white font-bold py-2 rounded-xl">Propose trade</button>
          <button onClick={onClose} className="bg-[#2a4a35] text-white px-4 rounded-xl">Close</button>
        </div>
        <p className="text-[11px] opacity-60 mt-2">Properties with buildings can't be traded — sell the houses first.</p>
      </div>
    </div>
  );
}

function GameOverModal({ g, onRestart }) {
  const winner = g.players[g.winner];
  const humanWon = g.winner === 0;
  const standings = g.players
    .map((p) => ({ p, worth: p.bankrupt ? 0 : netWorth(g, p.id) }))
    .sort((a, b) => b.worth - a.worth);
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#f7f2df] text-[#1a2e1f] rounded-2xl p-5 w-full max-w-md text-center">
        <div className="text-5xl mb-2">{humanWon ? '🏆' : '💸'}</div>
        <h2 className="font-bold text-2xl mb-1">{humanWon ? 'You win!' : `${winner.name} wins`}</h2>
        <p className="text-sm opacity-70 mb-4">
          {humanWon ? 'Every rival bankrupt. The board is yours.' : 'You went bankrupt. Better luck next time.'}
        </p>
        <div className="text-left text-sm mb-4">
          {standings.map(({ p, worth }, i) => (
            <div key={p.id} className="flex justify-between py-1 border-b border-[#d8d0b8]">
              <span>{i + 1}. {p.name}{p.id === 0 ? ' (you)' : ''} {p.bankrupt ? '💸' : ''}</span>
              <span className="font-bold">{p.bankrupt ? 'bankrupt' : fmt(worth)}</span>
            </div>
          ))}
        </div>
        <button onClick={onRestart} className="bg-[#1fb25a] text-white font-bold px-10 py-3 rounded-xl">
          Play again
        </button>
      </div>
    </div>
  );
}
