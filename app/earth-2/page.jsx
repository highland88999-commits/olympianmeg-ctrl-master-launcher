'use client';

// app/earth-2/page.jsx
// EARTH 2 — THE OWNER TEST CHAMBER (Phase 2 foundation, 2026-10-21).
//
// Merlin's order: Phase 2 begins now, locked behind his account alone
// (olympiannexus@gmail.com) "for testing purposes — no other account
// should be able to see it." So this page gates on the Supabase
// browser session before it renders anything at all: signed-out
// visitors and every other account get a plain not-found screen with
// no Earth 2 branding and no content, and every /api/earth2/* route
// re-verifies access server-side (and 404s) besides. The portal
// entries that lead here (Portal Room + Concourse Portals 3D) only
// exist for the owner too — lib/portal-roster.js withOwnerPortals.
//
// PROOF OF CONCEPT (Merlin, 2026-10-23): exactly one more account is
// admitted beside the owner — the named guest in
// lib/earth2/access.js, the one source of truth for Earth 2 access —
// so the two of them can hold one granted parcel each and land on
// their own land. Access here is about rendering and spawning; the
// write routes (buy / forge / rent / builds) stay owner-only.
//
// Inside: the parcel map of the new world — 2,500 parcels, of which
// exactly 1,000 are ownable and 1,500 are Free Commons (Merlin's
// rule: more free tiles than owned tiles) — with buying in gold, the
// First Round Land Sale frame, home-base spawn, the Gold Forge
// (claim what time pours), the rent rule and its ledger, and
// Dinosaur Bay — the Tripo3D foundry's real rigged dinosaurs,
// placed and breathing for inspection (2026-10-22).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { OWNER_EMAIL } from '@/lib/owner';
import { hasEarth2Access } from '@/lib/earth2/access';
import {
  PARCELS,
  PARCEL_COLS,
  PARCEL_OWNABLE_COUNT,
  PARCEL_COMMONS_COUNT,
  parcelById,
  isCastleParcel,
} from '@/lib/earth2/parcels';
import { rollGift } from '@/lib/earth2/gifts';
import { useBackpack, updateBackpack } from '@/lib/backpack/store';
import {
  bloodStateFromRecord,
  collectSacInRecord,
  offerSacInRecord,
  applyFossilExchangeInRecord,
} from '@/lib/backpack/earth2-bridge';
import {
  resolveHomeBase,
  ownedRowsFor,
  loadHomeBaseChoice,
  saveHomeBaseChoice,
} from '@/lib/earth2/home-base';
import {
  firstRoundListings,
  firstRoundSoldOut,
  createLandListing,
} from '@/lib/earth2/land-sale';
import {
  forgeAccrued,
  FORGE_RATE_GOLD_PER_HOUR,
  FORGE_DAILY_CAP_GOLD,
} from '@/lib/earth2/forge';
import { formatGold } from '@/lib/economy/config';
import { AIRPORT_NAME, AIRPORT_TOWN, airportGroundsIds } from '@/lib/earth2/airport';
import { VEHICLE_SPECS, VEHICLE_SLUGS, BOAT_SPEC } from '@/lib/earth2/vehicles';
import { worldBridges } from '@/lib/earth2/bridges';
import { scatteredVehicleSpots, boatMoorings } from '@/lib/earth2/fleet';
import { earth2BuildContext, validateEarth2Build } from '@/lib/earth2/building';
import {
  claimHomestead,
  releaseClaim,
  activeClaimFor,
} from '@/lib/building/rights';
import {
  buildModeGate,
  loadLocalBuilds,
  saveLocalBuilds,
  loadLocalClaims,
  saveLocalClaims,
  loadLocalPackups,
  saveLocalPackups,
  upsertBuild,
  removeBuild,
  myBuildFor,
  settleLocalClaims,
  pushBuildToApi,
  fetchBuildFromApi,
  postClaimToApi,
  deleteClaimFromApi,
} from '@/lib/earth2/build-store';

// The Bay is a three.js scene — load it lazily, client-side only, so
// the chamber's gate never waits on (or leaks) the 3D chunk.
const DinosaurBay = dynamic(() => import('@/components/earth2/DinosaurBay'), {
  ssr: false,
  loading: () => (
    <section className="mt-5 rounded-[1.5rem] border border-dashed border-emerald-300/30 bg-emerald-400/[0.04] p-6 text-center backdrop-blur-md">
      <div aria-hidden="true" className="text-4xl">🦕</div>
      <h2 className="mt-2 text-sm font-black tracking-[0.25em] text-emerald-100">
        DINOSAUR BAY
      </h2>
      <p className="mt-2 text-sm text-zinc-400">Waking the dinosaurs…</p>
    </section>
  ),
});

// The walkable planet — same rule as the Bay: lazy, client-side
// only, mounted only behind this page's owner gate, so the 3D
// chunk never loads for anyone the gate turns away.
const Earth2World = dynamic(() => import('@/components/earth2/Earth2World'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0a1410]">
      <p className="text-sm font-bold tracking-[0.25em] text-emerald-100">
        🚶 STEPPING ONTO EARTH 2…
      </p>
    </div>
  ),
});

const TIER_LABEL = { standard: 'Standard', prime: 'Prime', landmark: 'Landmark' };
const KIND_LABEL = { buy: 'Parcel bought', rent: 'Rent', forge: 'Forge claim' };
const RARITY_CHIP = {
  common: 'border-white/20 bg-white/5 text-zinc-200',
  uncommon: 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100',
  rare: 'border-sky-300/40 bg-sky-400/10 text-sky-100',
  epic: 'border-purple-300/40 bg-purple-400/10 text-purple-100',
  legendary: 'border-amber-300/60 bg-amber-300/15 text-amber-100',
};

const fmtDeg = (n) => `${Number(n).toFixed(1)}°`;

export default function Earth2Page() {
  const [gate, setGate] = useState('checking'); // 'checking' | 'locked' | 'open'
  // Walking the planet (2026-10-22): the full-screen world mounts
  // over the chamber and the Bay unmounts while it is up, so the
  // device only ever runs one 3D scene.
  const [walking, setWalking] = useState(false);
  const [myEmail, setMyEmail] = useState('');
  const [myId, setMyId] = useState('');
  // Building (Phase 2): my builds, my homestead claims, and the
  // blueprint shelf (pack-ups from sold claims). The device store
  // is the truth while supabase/earth2-buildings.sql is unrun;
  // the API sync is opportunistic (lib/earth2/build-store.js).
  const [buildDataLoaded, setBuildDataLoaded] = useState(false);
  const [myBuilds, setMyBuilds] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [packups, setPackups] = useState([]);
  const [buildSpawnId, setBuildSpawnId] = useState(null);
  const [buildRequest, setBuildRequest] = useState(null);
  const buildUser = useMemo(
    () => ({ id: myId || null, email: myEmail || null }),
    [myId, myEmail]
  );
  const [state, setState] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // Home base (Merlin's rule): the stored "Set as home base" choice
  // for this device; resolution against live ownership happens below.
  const [homeChoice, setHomeChoice] = useState(null);
  // Preview resale listings (Land Tiles) created from the inspector —
  // they go live with the Earth 2 tables; see lib/earth2/land-sale.js.
  const [landListings, setLandListings] = useState([]);
  const [listPrice, setListPrice] = useState('');
  // The blood-sac loop (2026-10-22): sacs shot down in the Bay,
  // Dracula's gift tallies + history. Since 2026-10-23 the tallies
  // live in the BACKPACK (Merlin's order — the pack in the profile
  // that follows the traveller): account-persisted via the
  // backpack store, read here through the Earth 2 bridge in the
  // engine's own state shape (lib/backpack/earth2-bridge.js).
  const backpackRecord = useBackpack();
  const blood = useMemo(
    () => bloodStateFromRecord(backpackRecord),
    [backpackRecord]
  );
  const [lastGift, setLastGift] = useState(null);
  const [greetSignal, setGreetSignal] = useState(0);
  const homeFocusRef = useRef(false);
  // Preview mode (database tables not landed yet): the forge clock
  // runs locally from page open so the math is visible; nothing is
  // written anywhere until the real tables exist.
  const [previewStart] = useState(() => Date.now());

  const authHeaders = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data && data.session && data.session.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/earth2/state', { headers: await authHeaders() });
      if (res.status === 404) {
        setGate('locked');
        return;
      }
      const data = await res.json().catch(() => null);
      if (data && data.ok) setState(data);
    } catch {
      /* keep the last good state on screen */
    }
  }, [authHeaders]);

  // Oblivion release (Merlin, 2026-10-26): once the 72-hour
  // countdown ends, members of passing teams are released —
  // decided server-side by /api/earth2/release, never claimed
  // by the client. Fails closed: any error leaves the gate
  // locked. Returns true when it opened the gate.
  const checkReleaseGate = useCallback(async (email, id) => {
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/earth2/release', { headers, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (data && data.released) {
        setMyEmail(email);
        setMyId(id || '');
        setGate('open');
        loadState();
        return true;
      }
    } catch {}
    return false;
  }, [authHeaders, loadState]);

  // The gate: whose session is this? Only an account with Earth 2
  // access opens the door — the owner, or the one named POC guest
  // (lib/earth2/access.js is the one definition).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email || '';
        if (!alive) return;
        if (hasEarth2Access(email)) {
          setMyEmail(email);
          setMyId(data?.session?.user?.id || '');
          setGate('open');
          loadState();
        } else if (!(await checkReleaseGate(email, data?.session?.user?.id || ''))) {
          setGate('locked');
        }
      } catch {
        if (alive) setGate('locked');
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return;
      const email = session?.user?.email || '';
      if (hasEarth2Access(email)) {
        setMyEmail(email);
        setMyId(session?.user?.id || '');
        setGate('open');
        loadState();
      } else if (!(await checkReleaseGate(email, session?.user?.id || ''))) {
        setGate('locked');
      }
    });
    return () => {
      alive = false;
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, [loadState]);

  // One tick a second so the forge accrual visibly climbs.
  useEffect(() => {
    if (gate !== 'open') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gate]);

  const owners = useMemo(() => {
    const map = new Map();
    (state?.parcels || []).forEach((row) => map.set(row.parcel_id, row));
    return map;
  }, [state]);

  // Home base: my ownership rows (state order = acquisition order),
  // my stored choice, and the parcel I spawn at. No land → null →
  // the default entry, unchanged.
  const myRows = useMemo(
    () => ownedRowsFor(state?.parcels, myEmail),
    [state, myEmail]
  );
  const homeBaseId = useMemo(
    () => resolveHomeBase(myRows, homeChoice),
    [myRows, homeChoice]
  );
  const homeParcel = homeBaseId ? parcelById(homeBaseId) : null;

  // The First Round Land Sale frame's data.
  const saleListings = useMemo(
    () => firstRoundListings(state?.parcels || []),
    [state]
  );
  const soldOut = useMemo(
    () => firstRoundSoldOut(state?.parcels || []),
    [state]
  );

  // Read the stored home-base choice once we are in.
  useEffect(() => {
    if (gate === 'open') setHomeChoice(loadHomeBaseChoice());
  }, [gate]);

  // Building state: read the device store once we are in, then
  // keep it written back on every change (the Phase 1 pattern —
  // the localStorage ledger in lib/earth2/build-store.js).
  useEffect(() => {
    if (gate !== 'open') return;
    setMyBuilds(loadLocalBuilds());
    setMyClaims(loadLocalClaims());
    setPackups(loadLocalPackups());
    setBuildDataLoaded(true);
  }, [gate]);
  useEffect(() => {
    if (buildDataLoaded) saveLocalBuilds(myBuilds);
  }, [myBuilds, buildDataLoaded]);
  useEffect(() => {
    if (buildDataLoaded) saveLocalClaims(myClaims);
  }, [myClaims, buildDataLoaded]);
  useEffect(() => {
    if (buildDataLoaded) saveLocalPackups(packups);
  }, [packups, buildDataLoaded]);

  // The pack-up law, locally: whenever fresh ownership lands, any
  // claimed parcel of mine that now has an owner is settled —
  // bought by me (claim converts to title, build stays) or by
  // someone else (build packs up onto the blueprint shelf).
  useEffect(() => {
    if (!buildDataLoaded || !state?.parcels || !myClaims.length) return;
    const res = settleLocalClaims({
      claims: myClaims,
      builds: myBuilds,
      ownerRows: state.parcels,
      user: buildUser,
      atMs: Date.now(),
    });
    if (!res.changed) return;
    setMyClaims(res.claims);
    if (res.builds !== myBuilds) setMyBuilds(res.builds);
    if (res.packUps.length) {
      setPackups((prev) => [...prev, ...res.packUps]);
      setNotice(
        `📦 ${res.packUps[0].parcelId} sold — your homestead build there packed itself up, pieces intact. It waits on your blueprint shelf below.`
      );
    } else if (res.claims.some((c, i) => myClaims[i] && c !== myClaims[i] && c.status === 'purchased')) {
      setNotice('🏠 You bought a parcel you had claimed — the claim became title, and your build stays exactly where it stands.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, buildDataLoaded]);

  // Opportunistic server merge: once per visit, ask the builds
  // API for my parcels' builds. While it answers setupRequired
  // (or 404s for this account) the device store stands; when the
  // tables land, server builds merge over local ones.
  const buildSyncTriedRef = useRef(false);
  useEffect(() => {
    if (!buildDataLoaded || !state || buildSyncTriedRef.current) return;
    buildSyncTriedRef.current = true;
    (async () => {
      const headers = await authHeaders();
      const token = headers.Authorization
        ? headers.Authorization.replace('Bearer ', '')
        : null;
      const fetchImpl = (p, init) => fetch(p, init);
      const targets = new Set();
      for (const row of myRows) targets.add(row.parcel_id);
      for (const c of myClaims) if (c.status === 'active') targets.add(c.parcelId);
      for (const parcelId of targets) {
        const data = await fetchBuildFromApi({ token, fetchImpl }, parcelId);
        if (data && data.ok && data.build) {
          setMyBuilds((prev) => upsertBuild(prev, data.build));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildDataLoaded, state]);

  // A sac collected down in the Bay — it lands in the backpack.
  const collectSacFromBay = useCallback(() => {
    updateBackpack((rec) => collectSacInRecord(rec));
  }, []);

  // Offer one sac to Dracula: consume it from the pack, roll his
  // gift table, apply the gift to the pack's field tallies (and a
  // gifted weapon onto its shelves), keep the reveal on show.
  const offerSac = () => {
    if (blood.sacs < 1) return;
    const gift = rollGift();
    const res = offerSacInRecord(backpackRecord, gift, Date.now());
    if (res.ok) {
      updateBackpack(() => res.record);
      setLastGift(gift);
    }
  };

  // A fossil settled at Hammond's counter out on the planet: the
  // record lands in the same tallies Dracula's gifts land in —
  // gold, aether shards, gifted weapons, history — now kept in
  // the backpack (bridge over lib/earth2/blood-sacs.js
  // applyFossilExchange).
  const applyFossilPayout = useCallback((record) => {
    updateBackpack((rec) => applyFossilExchangeInRecord(rec, record, Date.now()));
  }, []);

  // The Bay's "Bring sacs to Dracula" / clicking the Count himself
  // opens the exchange.
  const openExchange = useCallback(() => {
    document
      .getElementById('draculas-exchange')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Summon the Count (he greets by transforming) and bring his
  // stage into view — the Bay normally; while walking the planet,
  // the world itself receives the greeting.
  const summonDracula = () => {
    setGreetSignal((n) => n + 1);
    if (walking) return;
    document
      .getElementById('dinosaur-bay')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Entry focus: entering Earth 2 starts at the home base — the map
  // focuses it (and the spawn banner names it) the first time the
  // ownership state resolves one.
  useEffect(() => {
    if (homeBaseId && !homeFocusRef.current) {
      homeFocusRef.current = true;
      setSelectedId(homeBaseId);
    }
  }, [homeBaseId]);

  const setupRequired = !!(state && state.setupRequired);
  const selected = selectedId ? parcelById(selectedId) : null;
  const selectedRow = selectedId ? owners.get(selectedId) || null : null;
  const selectedIsMine = !!(selectedRow && selectedRow.owner_email === myEmail);
  const selectedIsHome = !!(selected && selected.id === homeBaseId);
  const selectedListing = selected
    ? landListings.find((l) => l.parcelId === selected.id) || null
    : null;
  // Building on the selected parcel: the rights engine's verdict
  // (with its sentence), my claim there, and my build there.
  const selectedClaim = selected ? activeClaimFor(myClaims, selected.id) : null;
  const selectedGate = selected
    ? buildModeGate(buildUser, selected, selectedRow, selectedClaim)
    : null;
  const selectedBuild = selected ? myBuildFor(myBuilds, selected.id, buildUser) : null;
  const selectedClaimIsMine = !!(
    selectedClaim &&
    myEmail &&
    String(selectedClaim.builderEmail || '').toLowerCase() === myEmail.toLowerCase()
  );

  const forgeLastClaim = setupRequired
    ? previewStart
    : state?.forge?.lastClaim ?? null;
  const accrued = forgeAccrued(forgeLastClaim, now);

  const post = useCallback(
    async (path, payload) => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload || {}),
      });
      return res.json().catch(() => null);
    },
    [authHeaders]
  );

  const buyParcel = async (parcel) => {
    if (!parcel || busy) return;
    setBusy('buy');
    setNotice('');
    const data = await post('/api/earth2/buy', { parcelId: parcel.id });
    if (data?.setupRequired) setNotice('Database setup is still pending — buying switches on when the earth2 tables land.');
    else if (data?.ok) setNotice(`${parcel.id} is yours — ${parcel.name} joins your titles.`);
    else setNotice(data?.error || 'That purchase did not go through.');
    await loadState();
    setBusy('');
  };

  const buy = () => {
    if (selected) return buyParcel(selected);
    return undefined;
  };

  const setHome = () => {
    if (!selected) return;
    saveHomeBaseChoice(selected.id);
    setHomeChoice(selected.id);
    setNotice(
      `🏠 ${selected.id} · ${selected.name} is your home base — you enter Earth 2 here.`
    );
  };

  const listForResale = () => {
    if (!selected) return;
    const res = createLandListing(
      selected,
      state?.parcels || [],
      Number(listPrice),
      myEmail,
      Date.now()
    );
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setLandListings((prev) => [
      ...prev.filter((l) => l.parcelId !== selected.id),
      res.listing,
    ]);
    setListPrice('');
    setNotice(
      `Listed ${selected.id} for resale at ${res.listing.askingGold} gold under Land Tiles (preview — listings go live with the Earth 2 tables).`
    );
  };

  const claimForge = async () => {
    if (busy || setupRequired) return;
    setBusy('forge');
    setNotice('');
    const data = await post('/api/earth2/forge');
    if (data?.setupRequired) setNotice('Database setup is still pending — the forge lights when the earth2 tables land.');
    else if (data?.lit) setNotice('The forge is lit. Gold is pouring — come back and claim it.');
    else if (data?.ok && data.claimed > 0) setNotice(`The forge poured out ${data.claimed} gold.`);
    else if (data?.ok) setNotice('Nothing to claim yet — the forge is still pouring.');
    else setNotice(data?.error || 'The forge did not answer.');
    await loadState();
    setBusy('');
  };

  const testEntry = async () => {
    if (!selected || busy) return;
    setBusy('rent');
    setNotice('');
    const data = await post('/api/earth2/rent', {
      parcelId: selected.id,
      entryId: `${selected.id}-${Date.now()}`,
    });
    if (data?.setupRequired) setNotice('Database setup is still pending — rent switches on when the earth2 tables land.');
    else if (data?.ok) setNotice(data.message || 'Stepped in free.');
    else setNotice(data?.error || 'That step did not register.');
    await loadState();
    setBusy('');
  };

  // ── Building (Phase 2) ──────────────────────────────────────
  // A build changed out on the planet (or a blueprint re-placed
  // here): the device store takes it immediately, and the API
  // gets its copy opportunistically — while it answers
  // setupRequired the local save is the whole story.
  const handleBuildChange = useCallback(
    (build) => {
      if (!build) return;
      setMyBuilds((prev) =>
        build.pieces && build.pieces.length
          ? upsertBuild(prev, build)
          : removeBuild(prev, build.groundId, { id: build.ownerId, email: build.ownerEmail })
      );
      (async () => {
        const headers = await authHeaders();
        const token = headers.Authorization
          ? headers.Authorization.replace('Bearer ', '')
          : null;
        await pushBuildToApi({ token, fetchImpl: (p, init) => fetch(p, init) }, build);
      })();
    },
    [authHeaders]
  );

  // Enter the planet aimed at one parcel with build mode opening
  // on arrival (the world spawns the walker on the parcel; the
  // build request fires the moment the HUD confirms it).
  const openBuildOnParcel = (parcel) => {
    if (!parcel) return;
    setBuildSpawnId(parcel.id);
    setBuildRequest({ parcelId: parcel.id, nonce: Date.now() });
    setWalking(true);
  };

  const exitWorld = useCallback(() => {
    setWalking(false);
    setBuildSpawnId(null);
    setBuildRequest(null);
  }, []);

  const apiToken = useCallback(async () => {
    const headers = await authHeaders();
    return headers.Authorization ? headers.Authorization.replace('Bearer ', '') : null;
  }, [authHeaders]);

  const claimSelected = async () => {
    if (!selected) return;
    const ctx = earth2BuildContext(
      selected,
      selectedRow,
      activeClaimFor(myClaims, selected.id)
    );
    const res = claimHomestead(myClaims, buildUser, ctx, Date.now());
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setMyClaims(res.claims);
    setNotice(
      `🏕️ Homestead claimed on ${selected.id} · ${selected.name}. Walk there and build — if this parcel sells, your build packs itself up and returns to you as a blueprint.`
    );
    const token = await apiToken();
    await postClaimToApi({ token, fetchImpl: (p, init) => fetch(p, init) }, selected.id);
  };

  const releaseSelected = async () => {
    if (!selected) return;
    const res = releaseClaim(myClaims, buildUser, selected.id, Date.now());
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setMyClaims(res.claims);
    setNotice(
      `Homestead claim on ${selected.id} released — the ground is open again. Any build you left there stays in your records.`
    );
    const token = await apiToken();
    await deleteClaimFromApi({ token, fetchImpl: (p, init) => fetch(p, init) }, selected.id);
  };

  // Re-place a packed-up blueprint on the selected parcel: the
  // builder must hold rights there, and the blueprint must pass
  // the Earth 2 validator (catalog law + castle exclusion)
  // before a single piece lands.
  const applyBlueprint = (packup) => {
    if (!packup || !selected) return;
    const gate = buildModeGate(
      buildUser,
      selected,
      selectedRow,
      activeClaimFor(myClaims, selected.id)
    );
    if (!gate.ok) {
      setNotice(`📦 ${gate.text}`);
      return;
    }
    const existing = myBuildFor(myBuilds, selected.id, buildUser);
    if (existing && existing.pieces && existing.pieces.length) {
      setNotice('📦 You already have a build standing on that parcel — the blueprint waits until the ground is empty.');
      return;
    }
    const v = validateEarth2Build({
      groundType: 'earth2-parcel',
      groundId: selected.id,
      pieces: (packup.pieces || []).map((p) => ({ ...p })),
    });
    if (!v.ok) {
      setNotice(`📦 That blueprint does not fit here: ${v.errors[0]}`);
      return;
    }
    handleBuildChange({
      ...v.build,
      ownerId: buildUser.id,
      ownerEmail: buildUser.email,
      updatedAt: new Date().toISOString(),
    });
    setPackups((prev) => prev.filter((p) => p.id !== packup.id));
    setNotice(
      `📦 Blueprint re-placed on ${selected.id} — ${(packup.pieces || []).length} pieces stand again. Walk there to see it.`
    );
  };

  const discardBlueprint = (packup) => {
    if (!packup) return;
    setPackups((prev) => prev.filter((p) => p.id !== packup.id));
    setNotice('📦 Blueprint discarded.');
  };

  if (gate === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050310] text-zinc-500">
        <p className="text-sm tracking-widest">Loading…</p>
      </main>
    );
  }

  if (gate === 'locked') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center text-zinc-900">
        <p className="text-5xl font-light">404</p>
        <p className="mt-3 text-sm text-zinc-500">This page could not be found.</p>
        <a href="/" className="mt-6 text-sm text-zinc-700 underline underline-offset-4">
          Return home
        </a>
      </main>
    );
  }

  const cellClass = (parcel) => {
    const row = owners.get(parcel.id);
    let base = 'bg-white/10';
    if (isCastleParcel(parcel)) base = 'bg-purple-500/70'; // 🏰 Castle Transylvania
    else if (!parcel.ownable) base = 'bg-emerald-300/[0.14]'; // Free Commons
    else if (parcel.tier === 'landmark') base = 'bg-white/30';
    else if (parcel.tier === 'prime') base = 'bg-emerald-200/25';
    if (row && row.owner_email === myEmail) base = 'bg-sky-400'; // mine reads BLUE (Merlin, 2026-10-23)
    else if (row && row.owner_email === OWNER_EMAIL) base = 'bg-violet-400';
    else if (row) base = 'bg-cyan-300';
    const ring =
      parcel.id === selectedId
        ? ' ring-2 ring-white ring-inset z-10'
        : parcel.id === homeBaseId
          ? ' ring-2 ring-amber-300 ring-inset'
          : '';
    return `h-3 w-full rounded-[2px] transition hover:brightness-150 sm:h-3.5 ${base}${ring}`;
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050310] text-zinc-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 480px at 50% -120px, rgba(255,176,66,0.13), transparent 60%), radial-gradient(900px 620px at 85% 18%, rgba(88,60,220,0.16), transparent 62%), radial-gradient(760px 560px at 12% 30%, rgba(0,180,220,0.10), transparent 60%)',
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-6">
        <a href="/portal-room" className="text-xs tracking-widest text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          ← PORTAL ROOM
        </a>

        {/* Header */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black tracking-[0.18em] text-amber-100 drop-shadow-[0_0_18px_rgba(255,190,80,0.45)]">
              EARTH 2
            </h1>
            <p className="mt-1 text-[11px] font-bold tracking-[0.3em] text-cyan-200">
              TEST BUILD — PHASE 2
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1.5 text-[11px] font-bold tracking-widest text-amber-100">
              🔒 PROOF OF CONCEPT
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-zinc-200">
              🪙 {state && state.gold != null ? formatGold(state.gold) : '—'}
            </span>
          </div>
        </div>

        {setupRequired && (
          <div className="mt-5 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
            Database setup pending — the <span className="font-mono">earth2</span> tables
            (supabase/earth2.sql) have not landed yet. The map and the forge math below are
            live in preview; buying, claiming and rent switch on the moment the tables exist.
          </div>
        )}
        {notice && (
          <div className="mt-5 rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-sm leading-relaxed text-cyan-100">
            {notice}
          </div>
        )}
        {homeParcel && (
          <div className="mt-5 rounded-2xl border border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-sm leading-relaxed text-emerald-100">
            🏠 You enter Earth 2 at your home base —{' '}
            <span className="font-bold">{homeParcel.name}</span> ({homeParcel.id}).
            It is focused on the map below: that is your spawn point.
          </div>
        )}

        {/* Walk the planet (Merlin, 2026-10-22): the parcel map
            below IS the ground — step onto it and walk it, long
            before Earth 1 is mapped. Display-only on foot: no
            rent, no buying out there. */}
        <section className="mt-5 rounded-[1.5rem] border border-emerald-300/35 bg-emerald-400/[0.07] p-4 backdrop-blur-md sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black tracking-[0.25em] text-emerald-100">
                🚶 WALK THE PLANET
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-300">
                The whole map below, as ground under your feet: 1.4 km of Earth 2 —
                herds on the plains, swimmers in the great sea, flyers overhead,
                Castle Transylvania at the south pole — and the Royal Tyrrell Museum
                in Earth 2&rsquo;s Drumheller, where John Hammond trades your hunted
                fossils for gold, aether, or the occasional weapon. You spawn at{' '}
                {homeParcel ? (
                  <>your home base, <span className="font-bold text-emerald-100">{homeParcel.name}</span> ({homeParcel.id})</>
                ) : (
                  <>the landing meadow at the world&rsquo;s heart</>
                )}
                . Stepping on a parcel just reads it out — no rent, no buying on foot.
                Building is the exception: on land you own (or hold a homestead claim
                on), the 🔨 button out there opens the workbench — 62 pieces, 12
                finishes, builds that stream in as you approach.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWalking(true)}
              className="rounded-full border border-emerald-300/60 bg-emerald-400/25 px-5 py-3 text-sm font-black tracking-widest text-emerald-50 transition hover:bg-emerald-400/40"
            >
              🚶 WALK THE PLANET
            </button>
          </div>
        </section>

        {/* Tyrrell Field & the fleet (Vehicles Phase 1,
            2026-10-23): Earth 2's first airport, on Free Commons
            ground west of the museum, and the four machines that
            sleep on its apron — all of it lives out on the
            walkable planet. */}
        <section className="mt-5 rounded-[1.5rem] border border-sky-300/35 bg-sky-400/[0.07] p-4 backdrop-blur-md sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black tracking-[0.25em] text-sky-100">
                🛩️ {AIRPORT_NAME.toUpperCase()} — THE FLEET
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-300">
                Earth 2&rsquo;s first airport stands on Free Commons ground
                ({airportGroundsIds().join(', ')}) a short walk west of the museum, in
                Earth 2&rsquo;s {AIRPORT_TOWN} — public infrastructure on public
                land, never sold, never built on. Four machines sleep on its apron.
                Walk up to one out on the planet and it offers you the controls;
                step out and it stays exactly where you left it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWalking(true)}
              className="rounded-full border border-sky-300/60 bg-sky-400/25 px-5 py-3 text-sm font-black tracking-widest text-sky-50 transition hover:bg-sky-400/40"
            >
              🛩️ GO TO THE FIELD
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {VEHICLE_SLUGS.map((slug) => {
              const spec = VEHICLE_SPECS[slug];
              return (
                <div key={slug} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-zinc-50">
                      {spec.air ? '🛩️' : slug === 'speed-bike' ? '🏍️' : slug === 'scarab' ? '🪲' : '🛻'} {spec.name}
                    </span>
                    <span className="block text-[11px] text-zinc-400">
                      {spec.verb} · top speed {Math.round(spec.maxSpeed * 3.6)} km/h
                      {spec.air ? ' · flies — crosses water, lands on flat ground' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-sky-300/40 bg-sky-400/15 px-2.5 py-1 text-[11px] font-bold text-sky-100">
                    On the apron
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            On foot out there: W/S to move, A/D to steer, the joystick drives too.
            Ground machines follow the terrain and stop at deep water — no swimming
            vehicles. The VTOL climbs on Space and settles on C, and needs flat
            ground to land. E or Esc steps you out, wherever you are.
          </p>
        </section>

        {/* Terrain Wave B (2026-10-23): the crossings, the wild
            fleet and the River Runners — the planet got its
            bridges, its scattered machines and its boats, and the
            Free Commons got their dressing. All of it lives out
            on the walkable planet like everything else here. */}
        <section className="mt-5 rounded-[1.5rem] border border-emerald-300/30 bg-emerald-400/[0.06] p-4 backdrop-blur-md sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black tracking-[0.25em] text-emerald-100">
                🌉 THE CROSSINGS &amp; THE WILD FLEET
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-300">
                {worldBridges().length} stone-arch bridges now cross Earth 2&rsquo;s rivers
                and its lake — a crossing roughly every six parcels, so no stretch of
                shoreline is far from a deck. Walk them or drive them; the River Runner
                passes beneath the arch. The two shallow ponds need no bridge (they never
                stop a walker), and the west-edge river has no far bank to reach. Nine
                more machines sleep out in the wilds on Free Commons, and three River
                Runner boats ride at anchor — walk up to any of them and take the controls.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWalking(true)}
              className="rounded-full border border-emerald-300/60 bg-emerald-400/25 px-5 py-3 text-sm font-black tracking-widest text-emerald-50 transition hover:bg-emerald-400/40"
            >
              🌉 WALK THE PLANET
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {scatteredVehicleSpots().map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-zinc-50">
                    {s.slug === 'speed-bike' ? '🏍️' : s.slug === 'scarab' ? '🪲' : '🛻'} {s.label}
                  </span>
                  <span className="block text-[11px] text-zinc-400">
                    {VEHICLE_SPECS[s.slug].name} · parked on {s.parcelId}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
                  In the wilds
                </span>
              </div>
            ))}
            {boatMoorings().map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-zinc-50">
                    ⛵ {m.label}
                  </span>
                  <span className="block text-[11px] text-zinc-400">
                    {BOAT_SPEC.name} · moored off {m.parcelId} · top speed {Math.round(BOAT_SPEC.maxSpeed * 3.6)} km/h on open water
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
                  At anchor
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            The Free Commons are dressed now, too — extra trees and shrubs, boulders,
            and the odd crater out on the steppe — and all of it is solid: rocks,
            craters and tree trunks stop a walker and a machine alike. Ownable and
            owned parcels stay clean; the dressing belongs to the commons, and it
            steps aside wherever a build stands.
          </p>
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* The parcel map */}
          <section className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-4 backdrop-blur-md sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black tracking-[0.25em] text-zinc-100">
                THE PARCEL MAP
              </h2>
              <span className="text-xs text-zinc-400">
                2,500 parcels · {PARCEL_OWNABLE_COUNT.toLocaleString('en-US')} ownable ·{' '}
                {PARCEL_COMMONS_COUNT.toLocaleString('en-US')} Free Commons · tap one to see it
              </span>
            </div>
            <div
              className="mt-4 grid gap-[2px]"
              style={{ gridTemplateColumns: `repeat(${PARCEL_COLS}, minmax(0, 1fr))` }}
              role="grid"
              aria-label="Earth 2 parcel map"
            >
              {PARCELS.map((parcel) => (
                <button
                  key={parcel.id}
                  type="button"
                  title={`${parcel.id} · ${parcel.name}${isCastleParcel(parcel) ? ' 🏰' : ''}`}
                  aria-label={`${parcel.id} ${parcel.name}`}
                  onClick={() => setSelectedId(parcel.id)}
                  className={cellClass(parcel)}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-sky-400" />Mine</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-violet-400" />The house</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-cyan-300" />Other owners</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-white/30" />Landmark land</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-emerald-200/25" />Prime land</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-white/10" />Open land</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-emerald-300/[0.14]" />🌿 Free Commons — never sold, never rented</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] ring-2 ring-amber-300 ring-inset" />🏠 Home base (spawn)</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-purple-500/70" />🏰 Castle Transylvania — Dracula&rsquo;s seat (Free Commons)</span>
            </div>
          </section>

          {/* Right column: parcel detail, forge, rent */}
          <div className="flex flex-col gap-5">
            <section className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-5 backdrop-blur-md">
              <h2 className="text-sm font-black tracking-[0.25em] text-zinc-100">THE PARCEL</h2>
              {selected ? (
                <div className="mt-3">
                  <div className="text-2xl font-bold text-zinc-50">{selected.name}</div>
                  <div className="mt-0.5 text-xs tracking-widest text-zinc-400">
                    {selected.id} ·{' '}
                    {selected.ownable
                      ? `${TIER_LABEL[selected.tier]} land`
                      : 'Free Commons'}
                    {selectedIsHome ? ' · 🏠 HOME BASE' : ''}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-zinc-300">
                    <p>
                      {fmtDeg(selected.latMin)} to {fmtDeg(selected.latMax)} latitude ·{' '}
                      {fmtDeg(selected.lonMin)} to {fmtDeg(selected.lonMax)} longitude
                    </p>
                    {isCastleParcel(selected) && (
                      <div className="rounded-xl border border-purple-300/30 bg-purple-400/10 px-3 py-2.5">
                        <p>
                          🏰 <span className="font-semibold text-purple-100">Castle Transylvania</span>{' '}
                          — Dracula&rsquo;s seat at the South Pole. Free Commons forever: even
                          the Count&rsquo;s castle is nobody&rsquo;s property. Bring him blood
                          sacs from the Bay&rsquo;s mosquitos and he trades them for gifts.
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <a
                            href="#draculas-exchange"
                            className="rounded-full border border-purple-300/50 bg-purple-400/15 px-3 py-1.5 text-xs font-bold text-purple-100 transition hover:bg-purple-400/25"
                          >
                            🧛 Dracula&rsquo;s Exchange
                          </a>
                          <button
                            type="button"
                            onClick={summonDracula}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-purple-300/50"
                          >
                            🦇 Summon Dracula in the Bay
                          </button>
                        </div>
                      </div>
                    )}
                    {!selected.ownable ? (
                      <p>
                        🌿 <span className="font-semibold text-emerald-200">Free Commons</span>{' '}
                        — open land for everyone. It can never be bought, sold, listed, or
                        rented.
                      </p>
                    ) : selectedRow ? (
                      <p>
                        {selectedIsMine
                          ? 'Owned by you — the title is in your name.'
                          : `Owned by ${selectedRow.owner_email}.`}
                        {selectedIsHome
                          ? ' This is your home base — you spawn here when you enter Earth 2.'
                          : ''}
                      </p>
                    ) : (
                      <p>
                        <span className="font-semibold text-amber-100">For sale</span> —{' '}
                        {TIER_LABEL[selected.tier]} land, unowned, waiting for a title.
                      </p>
                    )}
                    {selected.ownable ? (
                      <p className="text-amber-100">{formatGold(selected.priceGold)}</p>
                    ) : (
                      <p className="text-zinc-400">No price — Free Commons are never for sale.</p>
                    )}
                  </div>
                  {selectedGate && (
                    <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.06] px-3 py-3">
                      <div className="text-[11px] font-bold tracking-[0.25em] text-emerald-200">
                        🔨 BUILDING
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                        {selectedGate.text}
                        {selectedBuild && selectedBuild.pieces.length > 0
                          ? ` Your build here stands at ${selectedBuild.pieces.length} piece${selectedBuild.pieces.length > 1 ? 's' : ''}.`
                          : ''}
                        {selectedClaim && !selectedClaimIsMine
                          ? ' Another builder holds the homestead claim here.'
                          : ''}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {selectedGate.ok && (
                          <button
                            type="button"
                            onClick={() => openBuildOnParcel(selected)}
                            className="rounded-full border border-emerald-300/60 bg-emerald-400/20 px-4 py-2 text-xs font-bold text-emerald-50 transition hover:bg-emerald-400/35"
                          >
                            🔨 Build here — walk &amp; build
                          </button>
                        )}
                        {selectedGate.reason === 'unclaimed' && (
                          <button
                            type="button"
                            onClick={claimSelected}
                            className="rounded-full border border-amber-300/60 bg-amber-300/10 px-4 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-300/20"
                          >
                            🏕️ Claim a homestead
                          </button>
                        )}
                        {selectedClaimIsMine && (
                          <button
                            type="button"
                            onClick={releaseSelected}
                            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-red-300/50"
                          >
                            Release my claim
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {!selectedRow && selected.ownable && (
                    <button
                      type="button"
                      onClick={buy}
                      disabled={!!busy || setupRequired}
                      className="mt-4 w-full rounded-full border border-amber-300/70 bg-amber-300/15 px-4 py-3 text-sm font-bold tracking-wide text-amber-100 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'buy' ? 'Buying…' : `Buy for ${formatGold(selected.priceGold)}`}
                    </button>
                  )}
                  {selectedIsMine && !selectedIsHome && (
                    <button
                      type="button"
                      onClick={setHome}
                      className="mt-4 w-full rounded-full border border-emerald-300/60 bg-emerald-300/10 px-4 py-3 text-sm font-bold tracking-wide text-emerald-100 transition hover:bg-emerald-300/20"
                    >
                      🏠 Set as home base
                    </button>
                  )}
                  {selectedIsMine && (
                    <div className="mt-3">
                      {selectedListing ? (
                        <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                          🏷️ Listed for resale under Land Tiles at{' '}
                          {formatGold(selectedListing.askingGold)} (preview — goes live
                          with the Earth 2 tables).
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={listPrice}
                            onChange={(e) => setListPrice(e.target.value)}
                            placeholder="Asking price (gold)"
                            aria-label="Asking price in gold"
                            className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                          />
                          <button
                            type="button"
                            onClick={listForResale}
                            className="shrink-0 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-amber-300/50"
                          >
                            List for resale
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {selected.ownable && (
                    <button
                      type="button"
                      onClick={testEntry}
                      disabled={!!busy || setupRequired}
                      className="mt-2 w-full rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'rent' ? 'Stepping…' : 'Test stepping onto this land'}
                    </button>
                  )}
                  {selected.ownable && (
                    <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                      Prices are placeholders from the plan — final tile pricing is still
                      Merlin&rsquo;s call.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Tap any square on the map. Every square is one parcel of the new world —
                  its name, its price, and whose title it carries.
                </p>
              )}
            </section>

            <section className="rounded-[1.5rem] border border-orange-300/25 bg-orange-400/[0.06] p-5 backdrop-blur-md">
              <h2 className="text-sm font-black tracking-[0.25em] text-orange-100">
                🔥 THE GOLD FORGE
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                The forge pours gold while it burns: {FORGE_RATE_GOLD_PER_HOUR} gold an
                hour, up to {FORGE_DAILY_CAP_GOLD.toLocaleString('en-US')} gold a day.
                Time in the world becomes gold in your pocket.
              </p>
              <div className="mt-4 text-3xl font-black text-amber-100">
                {accrued} <span className="text-base font-bold text-zinc-300">gold ready</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {forgeLastClaim
                  ? `Burning since ${new Date(forgeLastClaim).toLocaleString()}`
                  : 'Not lit yet — the first claim lights the forge.'}
              </p>
              <button
                type="button"
                onClick={claimForge}
                disabled={!!busy || setupRequired}
                className="mt-4 w-full rounded-full border border-orange-300/70 bg-orange-300/15 px-4 py-3 text-sm font-bold tracking-wide text-orange-100 transition hover:bg-orange-300/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {setupRequired
                  ? 'Forge (setup pending)'
                  : busy === 'forge'
                    ? 'Forging…'
                    : accrued > 0
                      ? `Claim ${accrued} gold`
                      : forgeLastClaim
                        ? 'Claim forge gold'
                        : 'Light the forge'}
              </button>
            </section>

            <section className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-5 backdrop-blur-md">
              <h2 className="text-sm font-black tracking-[0.25em] text-zinc-100">
                🚪 RENT — THE HOUSE RULE
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Step onto someone else&rsquo;s land and rent is charged the moment your
                foot lands: <span className="font-bold text-zinc-100">2 gold</span> — one
                gold to the owner, one gold to the house. Your own land is always free,
                and the Free Commons never charge anyone anything.
              </p>
              <div className="mt-4">
                <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-500">
                  RECENT LEDGER
                </div>
                {state && state.ledger && state.ledger.length ? (
                  <ul className="mt-2 space-y-2">
                    {state.ledger.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-baseline justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-zinc-100">
                            {KIND_LABEL[row.kind] || row.kind}
                          </span>
                          {row.parcel_id ? (
                            <span className="text-zinc-400"> · {row.parcel_id}</span>
                          ) : null}
                          {row.counterparty ? (
                            <span className="block truncate text-zinc-500">{row.counterparty}</span>
                          ) : null}
                        </span>
                        <span className={row.amount_gold > 0 ? 'font-bold text-emerald-300' : 'font-bold text-zinc-300'}>
                          {row.amount_gold > 0 ? `+${row.amount_gold}` : row.amount_gold} gold
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Nothing yet — buys, rent and forge claims land here as they happen.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* First Round Land Sale — its own frame: while any of the
            1,000 ownable parcels remain unsold, they sell here at
            tier price. Once every one has an owner, the frame flips
            to a sold-out card that sends buyers to the Auction
            House's Land Tiles category for peer-to-peer resale. */}
        {state && (
          <section className="mt-5 rounded-[1.5rem] border border-amber-300/25 bg-amber-300/[0.05] p-5 backdrop-blur-md">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black tracking-[0.25em] text-amber-100">
                🏷️ FIRST ROUND LAND SALE
              </h2>
              <span className="text-xs text-zinc-400">
                {soldOut
                  ? 'First round complete'
                  : `${saleListings.length} of ${PARCEL_OWNABLE_COUNT.toLocaleString('en-US')} ownable parcels still for sale`}
              </span>
            </div>
            {soldOut ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-300/10 p-5 text-center">
                <p className="font-black tracking-[0.2em] text-emerald-100">
                  🎉 THE FIRST ROUND IS SOLD OUT
                </p>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-300">
                  All {PARCEL_OWNABLE_COUNT.toLocaleString('en-US')} ownable parcels have
                  owners. From here, land changes hands peer-to-peer — owners list parcels
                  in the Auction House under Land Tiles, title and rent rights included.
                </p>
                <a
                  href="/auction-house?category=land_tiles"
                  className="mt-4 inline-block rounded-full border border-emerald-300/70 bg-emerald-300/15 px-5 py-2.5 text-sm font-bold tracking-wide text-emerald-100 transition hover:bg-emerald-300/25"
                >
                  Browse Land Tiles in the Auction House →
                </a>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  Every ownable parcel still waiting for its first owner, at its tier
                  price. The {PARCEL_COMMONS_COUNT.toLocaleString('en-US')} Free Commons
                  are never in this list — they belong to everyone.
                </p>
                <ul className="mt-4 grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {saleListings.slice(0, 90).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="min-w-0 text-left"
                      >
                        <span className="block truncate text-sm font-semibold text-zinc-100">
                          {p.name}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {p.id} · {TIER_LABEL[p.tier]}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => buyParcel(p)}
                        disabled={!!busy || setupRequired}
                        className="shrink-0 rounded-full border border-amber-300/60 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-100 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {formatGold(p.priceGold)}
                      </button>
                    </li>
                  ))}
                </ul>
                {saleListings.length > 90 && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Showing the first 90 — tap any square on the map above to inspect
                    and buy any other parcel.
                  </p>
                )}
              </>
            )}
            {landListings.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-400">
                  YOUR LAND TILES LISTINGS (PREVIEW)
                </div>
                <ul className="mt-2 space-y-2">
                  {landListings.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-baseline justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs"
                    >
                      <span className="text-zinc-200">
                        <span className="font-semibold">{l.name}</span>
                        <span className="text-zinc-400"> · {l.parcelId} · {TIER_LABEL[l.tier]}</span>
                      </span>
                      <span className="font-bold text-amber-100">{formatGold(l.askingGold)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  Preview listings — they go live in the Auction House&rsquo;s Land Tiles
                  category when the Earth 2 tables land.
                </p>
              </div>
            )}
          </section>
        )}

        {/* The blueprint shelf (Building Phase 2): when a parcel
            you homesteaded sells, your build packs itself up and
            lands here, pieces intact — re-place it on any parcel
            where you hold title or a claim. */}
        {packups.length > 0 && (
          <section className="mt-5 rounded-[1.5rem] border border-sky-300/25 bg-sky-400/[0.05] p-5 backdrop-blur-md">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black tracking-[0.25em] text-sky-100">
                📦 YOUR BLUEPRINT SHELF
              </h2>
              <span className="text-xs text-zinc-400">
                {packups.length} packed build{packups.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
              A homestead is a promise the land market can break: when a parcel you
              claimed sells, your build packs itself up and waits here — every piece,
              exactly as you placed it. Tap a parcel you own (or hold a claim on) in
              the map above, then re-place the blueprint there.
            </p>
            <ul className="mt-4 space-y-2">
              {packups.map((pk) => (
                <li
                  key={pk.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5"
                >
                  <span className="min-w-0 text-sm text-zinc-200">
                    <span className="font-semibold text-sky-100">
                      {(pk.pieces || []).length} pieces
                    </span>
                    <span className="text-zinc-400">
                      {' '}· packed from {pk.parcelId}
                      {pk.packedAt
                        ? ` · ${new Date(pk.packedAt).toLocaleDateString('en-CA')}`
                        : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyBlueprint(pk)}
                      disabled={!selected}
                      className="rounded-full border border-sky-300/60 bg-sky-400/15 px-3.5 py-1.5 text-xs font-bold text-sky-100 transition hover:bg-sky-400/30 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {selected
                        ? `Re-place on ${selected.id}`
                        : 'Pick a parcel above first'}
                    </button>
                    <button
                      type="button"
                      onClick={() => discardBlueprint(pk)}
                      className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-red-300/50"
                    >
                      Discard
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Dracula's Exchange — the blood-sac loop's trading post
            (2026-10-22). The Count presides from the Bay below;
            this panel is where his gifts change hands. */}
        <section
          id="draculas-exchange"
          className="mt-5 scroll-mt-6 rounded-[1.5rem] border border-purple-300/25 bg-purple-400/[0.05] p-4 backdrop-blur-md sm:p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-black tracking-[0.25em] text-purple-100">
              🧛 DRACULA&rsquo;S EXCHANGE
            </h2>
            <span className="text-xs text-zinc-400">
              Castle Transylvania · the South Pole parcel · E2-2476
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
            Giant mosquitos drink from the dinosaurs in the Bay below. Shoot one while
            it feeds — or after, while it drifts heavy and red — and it drops a{' '}
            <span className="font-semibold text-red-200">blood sac</span>. Bring your
            sacs to the Count and he trades each one for a gift of his choosing: gold,
            aether shards, or a weapon from the castle armoury. He greets visitors in
            the Bay by transforming — watch for the smoke.
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-red-300/30 bg-red-400/10 px-3 py-1.5 text-red-100">
              🩸 Blood sacs: {blood.sacs}
            </span>
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-amber-100">
              🪙 Gifts paid: {formatGold(blood.gold)}
            </span>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-cyan-100">
              ◆ Aether shards: {blood.aether}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-zinc-200">
              ⚔️ Weapons gifted: {blood.weapons.length}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={offerSac}
              disabled={blood.sacs < 1}
              className="rounded-full border border-purple-300/60 bg-purple-400/20 px-5 py-3 text-sm font-bold tracking-wide text-purple-50 transition hover:bg-purple-400/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🧛 Offer a blood sac
            </button>
            <button
              type="button"
              onClick={summonDracula}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-purple-300/50"
            >
              🦇 Summon Dracula in the Bay
            </button>
            <a
              href="/weapons-forge"
              className="rounded-full border border-purple-300/40 bg-purple-400/10 px-5 py-3 text-sm font-bold text-purple-100 transition hover:bg-purple-400/20"
            >
              ⚒️ Commission a weapon from the Count
            </a>
            {blood.sacs < 1 && (
              <span className="text-xs text-zinc-400">
                No sacs to offer — hunt a full mosquito in the Bay first.
              </span>
            )}
          </div>

          {lastGift && (
            <div className="mt-4 rounded-2xl border border-purple-300/40 bg-black/30 px-4 py-3">
              <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-400">
                THE COUNT GIVES YOU
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-lg font-black text-zinc-50">{lastGift.label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${RARITY_CHIP[lastGift.rarity] || RARITY_CHIP.common}`}>
                  {lastGift.rarity}
                </span>
                {lastGift.kind === 'jackpot' && <span aria-hidden="true">🦇</span>}
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {lastGift.gold > 0 ? `+${formatGold(lastGift.gold)} ` : ''}
                {lastGift.aether > 0 ? `+${lastGift.aether} aether shard${lastGift.aether > 1 ? 's' : ''} ` : ''}
                {lastGift.weapon ? `The ${lastGift.weapon} joins your gifted weapons.` : ''}
              </p>
            </div>
          )}

          {blood.weapons.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-400">
                GIFTED WEAPONS
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {blood.weapons.map((w, i) => (
                  <span
                    key={`${w}-${i}`}
                    className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
                  >
                    ⚔️ {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {blood.history.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="text-[11px] font-bold tracking-[0.25em] text-zinc-400">
                EXCHANGE HISTORY
              </div>
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                {blood.history.slice(0, 8).map((h, i) => (
                  <li key={`${h.at || 0}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                    <span aria-hidden="true">🩸</span>
                    <span className="font-semibold text-zinc-100">{h.label}</span>
                    <span className="capitalize text-zinc-500">{h.rarity}</span>
                    {h.at ? (
                      <span className="text-zinc-500">
                        {new Date(h.at).toLocaleString('en-CA')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
            Preview tallies, kept on this device: no server crediting happens until the
            Earth 2 tables land. The aether shards are an Earth 2 counter — Earth
            1&rsquo;s aether is a set of collected interior placements and stays its own
            thing. Gift rolls are true chance from the Count&rsquo;s weighted table.
          </p>
        </section>

        {/* Dinosaur Bay — the foundry's dinosaurs, live (2026-10-22).
            Unmounted while the planet is being walked, so the device
            only ever runs one 3D scene at a time. */}
        {!walking && (
          <div id="dinosaur-bay" className="scroll-mt-6">
            <DinosaurBay
              bloodSacs={blood.sacs}
              onBloodSac={collectSacFromBay}
              onOpenExchange={openExchange}
              greetSignal={greetSignal}
            />
          </div>
        )}
      </div>

      {/* The walkable planet, full-screen over the chamber. The
          chamber map's selection follows the walker (onParcelChange),
          so where you stand out there is what the map shows here. */}
      {walking && (
        <Earth2World
          spawnParcelId={buildSpawnId || homeBaseId}
          bloodSacs={blood.sacs}
          onBloodSac={collectSacFromBay}
          onFossilExchange={applyFossilPayout}
          onOpenExchange={() => {
            exitWorld();
            openExchange();
          }}
          greetSignal={greetSignal}
          onParcelChange={setSelectedId}
          onExit={exitWorld}
          buildUser={buildUser}
          ownersByParcel={owners}
          claims={myClaims}
          builds={myBuilds}
          onBuildChange={handleBuildChange}
          buildRequest={buildRequest}
        />
      )}
    </main>
  );
}
