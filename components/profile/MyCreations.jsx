// Profile — My Creations: the viewer's own World Engine forge items,
// grouped by forge category. Server-backed (unlike the rest of this
// profile page, which lives in browser storage).
//
// Per card: a live MiniViewport re-render from generation_params, the
// display name, Rename (inline, PATCH /api/world-engine/assets/:id), and
// List for sale (form, POST /api/auction/list). Listed items show a
// "Listed" state with Unlist (POST /api/auction/unlist).
//
// Phone-first: the 3D preview only mounts once its card scrolls near
// the viewport, so a profile with many creations does not open dozens
// of WebGL contexts at once.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MiniViewport from '@/components/world-engine/MiniViewport';
import { supabase } from '@/lib/supabase';

const SECTIONS = [
  { category: 'world', title: 'My Worlds', noun: 'worlds', sector: 'architect', builder: 'World Builder' },
  { category: 'character', title: 'My Characters', noun: 'characters', sector: 'characters', builder: 'Character Builder' },
  { category: 'weapon', title: 'My Weapons', noun: 'weapons', sector: 'weapons', builder: 'Weapon Builder' },
  { category: 'vehicle', title: 'My Vehicles', noun: 'vehicles', sector: 'vehicles', builder: 'Vehicle Builder' },
  { category: 'weather', title: 'My Weather', noun: 'weather', sector: 'weather', builder: 'Weather Builder' },
  { category: 'object', title: 'My Objects', noun: 'objects', sector: 'objects', builder: 'Object Builder' },
];

const PER_SECTION = 48;
const LISTING_LIMIT = 100;

const LISTING_LABELS = { auction: 'auction', fixed: 'fixed price', both: 'auction + buy now' };

function formatMoney(cents) {
  if (cents === null || cents === undefined) return '—';
  const n = Number(cents) / 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session && session.access_token
    ? { Authorization: 'Bearer ' + session.access_token }
    : null;
}

async function apiCall(path, { method = 'GET', body } = {}) {
  const auth = await authHeader();
  if (!auth) throw new Error('You are not signed in.');
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

async function getCreations(userId, category) {
  const res = await fetch(
    '/api/profiles/' + encodeURIComponent(userId) + '/creations?category=' +
    encodeURIComponent(category) + '&limit=' + PER_SECTION
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Could not load creations.');
  return data.creations || [];
}

// Mounts the 3D preview only once the card is near the viewport.
function InView({ children, className }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
      });
    }, { rootMargin: '240px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={className}>{visible ? children : null}</div>;
}

function RenameForm({ formKey, initial, busy, onSave, onCancel }) {
  const [name, setName] = useState(initial || '');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(name.trim()); }}
      className="flex flex-col gap-2"
    >
      <label className="text-[11px] tracking-[0.2em] uppercase text-neutral-400" htmlFor={'rename-' + formKey}>
        Name
      </label>
      <input
        id={'rename-' + formKey}
        type="text"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Give it a name"
        className="w-full min-h-[44px] rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-300/70"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-[44px] px-4 rounded-lg bg-cyan-300/90 text-black text-sm font-bold hover:bg-cyan-200 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ListForm({ busy, error, onSubmit, onCancel }) {
  const [listingType, setListingType] = useState('auction');
  const [bidDollars, setBidDollars] = useState('');
  const [buyNowDollars, setBuyNowDollars] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const fieldCls =
    'w-full min-h-[44px] rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm ' +
    'text-neutral-100 outline-none focus:border-cyan-300/70';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const wantsBid = listingType === 'auction' || listingType === 'both';
        const wantsBuyNow = listingType === 'fixed' || listingType === 'both';
        const bid = bidDollars === '' ? null : Math.round(Number(bidDollars) * 100);
        const buyNow = buyNowDollars === '' ? null : Math.round(Number(buyNowDollars) * 100);
        onSubmit({
          listing_type: listingType,
          starting_bid_cents: bid,
          buy_now_price_cents: buyNow,
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          wantsBid,
          wantsBuyNow,
        });
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <label className="text-[11px] tracking-[0.2em] uppercase text-neutral-400 block mb-1.5" htmlFor="listing-type">
          Sale type
        </label>
        <select
          id="listing-type"
          value={listingType}
          onChange={(e) => setListingType(e.target.value)}
          className={fieldCls + ' bg-[#101018]'}
        >
          <option value="auction">Auction — buyers bid against each other</option>
          <option value="fixed">Fixed price — buy it now</option>
          <option value="both">Both — auction with a buy-now price</option>
        </select>
      </div>
      {(listingType === 'auction' || listingType === 'both') && (
        <div>
          <label className="text-[11px] tracking-[0.2em] uppercase text-neutral-400 block mb-1.5" htmlFor="starting-bid">
            Starting bid (USD)
          </label>
          <input
            id="starting-bid"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={bidDollars}
            onChange={(e) => setBidDollars(e.target.value)}
            placeholder="0.00"
            className={fieldCls}
          />
        </div>
      )}
      {(listingType === 'fixed' || listingType === 'both') && (
        <div>
          <label className="text-[11px] tracking-[0.2em] uppercase text-neutral-400 block mb-1.5" htmlFor="buy-now">
            Buy-now price (USD)
          </label>
          <input
            id="buy-now"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={buyNowDollars}
            onChange={(e) => setBuyNowDollars(e.target.value)}
            placeholder="0.00"
            className={fieldCls}
          />
        </div>
      )}
      <div>
        <label className="text-[11px] tracking-[0.2em] uppercase text-neutral-400 block mb-1.5" htmlFor="ends-at">
          Ends at (optional)
        </label>
        <input
          id="ends-at"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className={fieldCls + ' bg-[#101018]'}
        />
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-[44px] px-4 rounded-lg bg-cyan-300/90 text-black text-sm font-bold hover:bg-cyan-200 disabled:opacity-50"
        >
          {busy ? 'Listing…' : 'List it'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreationCard({ asset, listingId, busy, onRename, onList, onUnlist, onToggleCommuniverse, onDirect }) {
  const [editing, setEditing] = useState(false);
  const [listing, setListing] = useState(false);
  const [confirmUnlist, setConfirmUnlist] = useState(false);
  const [formError, setFormError] = useState(null);
  const [renameError, setRenameError] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [directPrompt, setDirectPrompt] = useState('');
  const [directError, setDirectError] = useState(null);

  const listed = !!asset.is_listed;
  // Worlds get the Communiverse treatment (Merlin, 2026-10-22): click the
  // world to go right to it, publish it into the Communiverse, and direct
  // its building with Muse (the Concourse Muse icon).
  const isWorld = asset.category === 'world';
  const inCommuniverse = !!asset.in_communiverse;

  const handleDirect = async (e) => {
    e.preventDefault();
    const text = directPrompt.trim();
    if (!text) return;
    setDirectError(null);
    try {
      await onDirect(asset.id, text);
      setDirecting(false);
      setDirectPrompt('');
    } catch (err) {
      setDirectError(err.message);
    }
  };

  const handleRename = async (name) => {
    setRenameError(null);
    if (!name || name === asset.display_name) { setEditing(false); return; }
    try {
      await onRename(asset.id, name);
      setEditing(false);
    } catch (err) {
      setRenameError(err.message);
    }
  };

  const handleList = async (values) => {
    setFormError(null);
    if (values.wantsBid && (values.starting_bid_cents === null || Number.isNaN(values.starting_bid_cents) || values.starting_bid_cents < 0)) {
      setFormError('Set a starting bid of $0 or more.');
      return;
    }
    if (values.wantsBuyNow && (values.buy_now_price_cents === null || Number.isNaN(values.buy_now_price_cents) || values.buy_now_price_cents <= 0)) {
      setFormError('Set a buy-now price above $0.');
      return;
    }
    try {
      const body = {
        asset_id: asset.id,
        listing_type: values.listing_type,
        title: asset.display_name || 'Untitled ' + asset.category,
      };
      if (values.wantsBid) body.starting_bid_cents = values.starting_bid_cents;
      if (values.wantsBuyNow) body.buy_now_price_cents = values.buy_now_price_cents;
      if (values.ends_at) body.ends_at = values.ends_at;
      await onList(asset.id, body);
      setListing(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleUnlist = async () => {
    if (!confirmUnlist) { setConfirmUnlist(true); return; }
    try {
      await onUnlist(asset.id, listingId);
      setConfirmUnlist(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden flex flex-col">
      {isWorld ? (
        <Link href={'/communiverse/world/' + asset.id} aria-label={'Enter ' + (asset.display_name || 'your world')} className="block">
          <InView className="relative h-40 w-full bg-[#07070c]">
            <MiniViewport category={asset.category} params={asset.generation_params || {}} />
          </InView>
        </Link>
      ) : (
        <InView className="relative h-40 w-full bg-[#07070c]">
          <MiniViewport category={asset.category} params={asset.generation_params || {}} />
        </InView>
      )}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          {isWorld ? (
            <Link href={'/communiverse/world/' + asset.id} className="text-sm font-semibold text-neutral-100 truncate hover:text-cyan-200" title={asset.display_name}>
              {asset.display_name || 'Untitled ' + asset.category}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-neutral-100 truncate" title={asset.display_name}>
              {asset.display_name || 'Untitled ' + asset.category}
            </p>
          )}
          {listed && (
            <span className="shrink-0 text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded bg-emerald-300/15 text-emerald-200 border border-emerald-300/30">
              Listed{asset.listing_type ? ' · ' + (LISTING_LABELS[asset.listing_type] || asset.listing_type) : ''}
            </span>
          )}
          {isWorld && inCommuniverse && (
            <span className="shrink-0 text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded bg-cyan-300/15 text-cyan-200 border border-cyan-300/30">
              In the Communiverse
            </span>
          )}
        </div>
        {listed && (
          <p className="text-[11px] text-neutral-500">
            {asset.listing_type === 'fixed' || asset.listing_type === 'both'
              ? 'Buy now: ' + formatMoney(asset.buy_now_price_cents)
              : 'Starts at: ' + formatMoney(asset.starting_bid_cents)}
          </p>
        )}
        {editing ? (
          <>
            <RenameForm formKey={asset.id} initial={asset.display_name} busy={busy} onSave={handleRename} onCancel={() => { setEditing(false); setRenameError(null); }} />
            {renameError && <p className="text-xs text-red-300">{renameError}</p>}
          </>
        ) : listing ? (
          <ListForm busy={busy} error={formError} onSubmit={handleList} onCancel={() => { setListing(false); setFormError(null); }} />
        ) : (
          <div className="flex flex-wrap gap-2 mt-auto pt-1">
            {isWorld && (
              <Link
                href={'/communiverse/world/' + asset.id}
                className="min-h-[44px] px-3 rounded-lg bg-cyan-300/90 text-black text-xs font-bold hover:bg-cyan-200 inline-flex items-center"
              >
                Enter world
              </Link>
            )}
            {isWorld && (
              <button
                type="button"
                onClick={() => { setDirecting((v) => !v); setDirectError(null); }}
                aria-expanded={directing}
                className="min-h-[44px] px-3 rounded-lg border border-white/15 text-xs text-neutral-200 hover:bg-white/10 inline-flex items-center gap-1.5"
              >
                {/* Same Muse icon as the Concourse Muse tile. */}
                <img src="/concourse-icons/muse.webp" alt="" width={16} height={16} className="rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ✦ Direct with Muse
              </button>
            )}
            {isWorld && (
              <button
                type="button"
                onClick={async () => {
                  setFormError(null);
                  try { await onToggleCommuniverse(asset.id, !inCommuniverse); }
                  catch (err) { setFormError(err.message); }
                }}
                disabled={busy}
                className="min-h-[44px] px-3 rounded-lg border border-cyan-300/40 text-xs text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-50"
              >
                {busy ? 'Working…' : inCommuniverse ? 'Remove from Communiverse' : 'Publish to Communiverse'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setEditing(true); setConfirmUnlist(false); }}
              className="min-h-[44px] px-3 rounded-lg border border-white/15 text-xs text-neutral-300 hover:bg-white/10"
            >
              Rename
            </button>
            {asset.prompt && (
              <button
                type="button"
                onClick={() => setShowPrompt((v) => !v)}
                aria-expanded={showPrompt}
                className="min-h-[44px] px-3 rounded-lg border border-white/15 text-xs text-neutral-300 hover:bg-white/10"
              >
                {showPrompt ? 'Hide prompt' : 'View prompt'}
              </button>
            )}
            {listed ? (
              <button
                type="button"
                onClick={handleUnlist}
                disabled={busy || !listingId}
                title={listingId ? 'Remove from the Auction House' : 'Listing not loaded yet'}
                className={
                  'min-h-[44px] px-3 rounded-lg border text-xs ' +
                  (confirmUnlist
                    ? 'border-red-400 bg-red-500/20 text-red-200'
                    : 'border-white/15 text-neutral-300 hover:bg-white/10') +
                  ' disabled:opacity-50'
                }
              >
                {busy ? 'Working…' : confirmUnlist ? 'Tap again to unlist' : 'Unlist'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setListing(true)}
                className="min-h-[44px] px-3 rounded-lg bg-cyan-300/90 text-black text-xs font-bold hover:bg-cyan-200"
              >
                List for sale
              </button>
            )}
          </div>
        )}
        {isWorld && directing && !editing && !listing && (
          <form onSubmit={handleDirect} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <label className="text-[11px] tracking-[0.2em] uppercase text-neutral-400" htmlFor={'direct-' + asset.id}>
              Direct this world with Muse
            </label>
            <textarea
              id={'direct-' + asset.id}
              value={directPrompt}
              onChange={(e) => setDirectPrompt(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Describe the planet you want — terrain, colors, mood…"
              className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-300/70"
            />
            {directError && <p className="text-xs text-red-300">{directError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !directPrompt.trim()}
                className="min-h-[44px] px-4 rounded-lg bg-cyan-300/90 text-black text-sm font-bold hover:bg-cyan-200 disabled:opacity-50"
              >
                {busy ? 'Forging…' : 'Re-forge my world'}
              </button>
              <button
                type="button"
                onClick={() => { setDirecting(false); setDirectError(null); }}
                className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              Muse rebuilds the planet from your words (World Engine generations: free monthly first, then Aether).
            </p>
          </form>
        )}
        {formError && !listing && <p className="text-xs text-red-300">{formError}</p>}
        {showPrompt && asset.prompt && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] tracking-[0.15em] uppercase text-neutral-500 mb-1">Original prompt</p>
            <p className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">{asset.prompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CategorySection({ def, items, loading, error, listingByAsset, busyByAsset, onRefresh, onRename, onList, onUnlist, onToggleCommuniverse, onDirect }) {
  return (
    <div aria-label={def.title}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold tracking-[0.25em] uppercase text-neutral-200">{def.title}</h3>
        {def.category === 'world' && (
          <Link href="/communiverse" className="text-[11px] text-cyan-300 hover:underline">
            Visit the Communiverse →
          </Link>
        )}
        {!loading && !error && items.length > 0 && (
          <span className="text-[11px] text-neutral-500">{items.length}</span>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500 py-2">Loading your {def.noun}…</p>
      ) : error ? (
        <p className="text-sm text-red-300 py-2">Could not load your {def.noun}. <button type="button" onClick={onRefresh} className="underline">Try again</button>.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500 py-1">
          You have not forged any {def.noun} yet —{' '}
          <Link href={'/world-engine/' + def.sector} className="text-cyan-300 hover:underline">
            try the {def.builder}
          </Link>.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((a) => (
            <CreationCard
              key={a.id}
              asset={a}
              listingId={listingByAsset[a.id] || null}
              busy={!!busyByAsset[a.id]}
              onRename={onRename}
              onList={onList}
              onUnlist={onUnlist}
              onToggleCommuniverse={onToggleCommuniverse}
              onDirect={onDirect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyCreations() {
  const [authState, setAuthState] = useState('loading'); // loading | signed-out | signed-in
  const [userId, setUserId] = useState(null);
  const [itemsByCategory, setItemsByCategory] = useState({});
  const [loadingByCategory, setLoadingByCategory] = useState({});
  const [errorByCategory, setErrorByCategory] = useState({});
  const [listingByAsset, setListingByAsset] = useState({});
  const [busyByAsset, setBusyByAsset] = useState({});
  const [loadError, setLoadError] = useState(null);

  const refreshListings = useCallback(async (uid) => {
    try {
      const res = await fetch('/api/auction/listings?limit=' + LISTING_LIMIT);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const map = {};
        (data.listings || []).forEach((l) => {
          if (l.seller_id === uid && l.asset_id) map[l.asset_id] = l.id;
        });
        setListingByAsset(map);
      }
    } catch { /* the Unlist button stays disabled until the map loads */ }
  }, []);

  const refreshCategory = useCallback(async (uid, category) => {
    setLoadingByCategory((s) => ({ ...s, [category]: true }));
    setErrorByCategory((s) => ({ ...s, [category]: null }));
    try {
      const items = await getCreations(uid, category);
      setItemsByCategory((s) => ({ ...s, [category]: items }));
    } catch (err) {
      setErrorByCategory((s) => ({ ...s, [category]: err.message }));
    } finally {
      setLoadingByCategory((s) => ({ ...s, [category]: false }));
    }
  }, []);

  // Sign-in state, then the six categories in parallel plus live listings.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session && session.user ? session.user.id : null;
        if (cancelled) return;
        if (!uid) { setAuthState('signed-out'); return; }
        setUserId(uid);
        setAuthState('signed-in');
        await Promise.all([
          ...SECTIONS.map((s) => refreshCategory(uid, s.category)),
          refreshListings(uid),
        ]);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshCategory, refreshListings]);

  const setBusy = useCallback((assetId, busy) => {
    setBusyByAsset((s) => ({ ...s, [assetId]: busy }));
  }, []);

  const handleRename = useCallback(async (assetId, name) => {
    setBusy(assetId, true);
    try {
      const data = await apiCall('/api/world-engine/assets/' + encodeURIComponent(assetId), {
        method: 'PATCH',
        body: { display_name: name },
      });
      const updated = data.asset || {};
      const category = updated.category;
      if (category) {
        setItemsByCategory((s) => ({
          ...s,
          [category]: (s[category] || []).map((a) => (a.id === assetId ? { ...a, display_name: updated.display_name || name } : a)),
        }));
      }
    } finally {
      setBusy(assetId, false);
    }
  }, [setBusy]);

  const handleList = useCallback(async (assetId, body) => {
    setBusy(assetId, true);
    try {
      const data = await apiCall('/api/auction/list', { method: 'POST', body });
      if (data.listing && data.listing.id) {
        setListingByAsset((s) => ({ ...s, [assetId]: data.listing.id }));
      }
      const category = data.listing && data.listing.category;
      if (userId && category) await refreshCategory(userId, category);
    } finally {
      setBusy(assetId, false);
    }
  }, [setBusy, userId, refreshCategory]);

  // Communiverse (Merlin, 2026-10-22): publish/unpublish a world, and
  // direct a world's building with Muse. Both write through the
  // owner-checked /api/communiverse routes, then the world section is
  // re-read so the card shows the new planet / new publish state.
  const handleToggleCommuniverse = useCallback(async (assetId, publish) => {
    setBusy(assetId, true);
    try {
      await apiCall('/api/communiverse/publish', { method: 'POST', body: { asset_id: assetId, publish } });
      if (userId) await refreshCategory(userId, 'world');
    } finally {
      setBusy(assetId, false);
    }
  }, [setBusy, userId, refreshCategory]);

  const handleDirect = useCallback(async (assetId, prompt) => {
    setBusy(assetId, true);
    try {
      await apiCall('/api/communiverse/direct', { method: 'POST', body: { asset_id: assetId, prompt } });
      if (userId) await refreshCategory(userId, 'world');
    } finally {
      setBusy(assetId, false);
    }
  }, [setBusy, userId, refreshCategory]);

  const handleUnlist = useCallback(async (assetId, listingId) => {
    if (!listingId) throw new Error('The listing is still loading — try again in a moment.');
    setBusy(assetId, true);
    try {
      await apiCall('/api/auction/unlist', { method: 'POST', body: { listing_id: listingId } });
      setListingByAsset((s) => {
        const next = { ...s };
        delete next[assetId];
        return next;
      });
      const cat = SECTIONS.find((s) => (itemsByCategory[s.category] || []).some((a) => a.id === assetId));
      if (userId && cat) await refreshCategory(userId, cat.category);
    } finally {
      setBusy(assetId, false);
    }
  }, [setBusy, userId, refreshCategory, itemsByCategory]);

  return (
    <section aria-label="My creations" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">My Creations</h2>
      <p className="text-xs text-neutral-500 mb-5">
        Everything you have forged in the World Engine, saved to your account.
        Rename anything, or list it for sale on the Auction House. Worlds can
        also be published into the{' '}
        <Link href="/communiverse" className="text-cyan-300 hover:underline">Communiverse</Link>,
        entered with one click, and directed with Muse — and if a world sells,
        all of that goes to its buyer with it.
      </p>

      {authState === 'loading' && (
        <p className="text-sm text-neutral-500">Checking sign-in…</p>
      )}
      {authState === 'signed-out' && (
        <p className="text-sm text-neutral-400">
          You are not signed in, so your creations are not shown here.
          Sign in to see what you have forged.
        </p>
      )}
      {authState === 'signed-in' && loadError && (
        <p className="text-sm text-red-300">Something went wrong: {loadError}</p>
      )}
      {authState === 'signed-in' && !loadError && (
        <div className="flex flex-col gap-7">
          {SECTIONS.map((def) => (
            <CategorySection
              key={def.category}
              def={def}
              items={itemsByCategory[def.category] || []}
              loading={!!loadingByCategory[def.category]}
              error={errorByCategory[def.category] || null}
              listingByAsset={listingByAsset}
              busyByAsset={busyByAsset}
              onRefresh={() => userId && refreshCategory(userId, def.category)}
              onRename={handleRename}
              onList={handleList}
              onUnlist={handleUnlist}
              onToggleCommuniverse={handleToggleCommuniverse}
              onDirect={handleDirect}
            />
          ))}
        </div>
      )}
    </section>
  );
}
