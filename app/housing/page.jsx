// app/housing/page.jsx — Housing, branded under Omega.
//
// One place to look for a home: houses for sale, long-term rentals, and
// a place to stay for a night or two. Three sections, one search.
//
// Data comes from the contracted API routes:
//   GET  /api/housing/sources        -> the source registry (array)
//   GET  /api/housing/search?...     -> { listings[], sources[] }; takes
//     section, q, place, lat, lon, radiusKm (number, or 'province' /
//     'country' / 'any'), minPrice, maxPrice, beds, type, sources.
//     A typed place is geocoded on the server, so the page sends the
//     place string and the API returns each listing with distanceKm.
// Listings are always real: the page never invents one, and View always
// opens the source's own page in a new tab. A listing whose source gives
// no link shows no View button. Stays from OpenStreetMap carry no price
// — the card says so plainly.
//
// Laws: plain English throughout, normal flow layout (no-overlap),
// thumb-friendly buttons at phone widths. The circle-orb law is for
// game screens only — this is a utility, so normal buttons are fine.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SECTIONS, PROPERTY_TYPES } from '@/lib/housing/taxonomy.js';

// Redwater, AB — Merlin's town, the default search centre.
// 53.94889° N, 113.10667° W (Wikipedia, Town of Redwater).
const DEFAULT_CENTRE = { lat: 53.9489, lon: -113.1067, label: 'Redwater, AB' };

const RADIUS_OPTIONS = [
  { id: '5', km: 5, label: '5 km' },
  { id: '10', km: 10, label: '10 km' },
  { id: '25', km: 25, label: '25 km' },
  { id: '50', km: 50, label: '50 km' },
  { id: '100', km: 100, label: '100 km' },
  { id: 'province', km: null, scope: 'province', label: 'Province / state-wide' },
  { id: 'country', km: null, scope: 'country', label: 'Country-wide' },
  { id: 'anywhere', km: null, scope: 'anywhere', label: 'Anywhere' },
];

const SAVED_KEY = 'olympus:housing:saved';

// --- section + type graphics -------------------------------------------------

// One 900x600 WebP per real section and per real property type, in
// public/images/housing/sections/<id>.webp and
// public/images/housing/types/<id>.webp, plus the page background at
// public/images/housing/background.webp (1920x1080, very dark
// low-contrast gold nebula). Only the real ids have art: 'other' and
// anything unmapped renders NO image — never a wrong one, never a
// broken one. A listing wears its type's graphic; when the type has
// none, it falls back to its section's graphic.
const SECTION_IMAGE_IDS = new Set(['real-estate', 'rentals', 'temporary']);
const TYPE_IMAGE_IDS = new Set([
  'house', 'condo', 'townhouse', 'duplex', 'land',
  'hotel', 'hostel', 'guest-house', 'motel',
]);
const BACKGROUND_IMAGE_SRC = '/images/housing/background.webp';

function sectionImageSrc(id) {
  if (!id || typeof id !== 'string') return null;
  return SECTION_IMAGE_IDS.has(id) ? `/images/housing/sections/${id}.webp` : null;
}

function listingImageSrc(listing) {
  if (!listing) return null;
  if (listing.type && TYPE_IMAGE_IDS.has(listing.type)) {
    return `/images/housing/types/${listing.type}.webp`;
  }
  return sectionImageSrc(listing.section);
}

// --- small pure helpers ---------------------------------------------------

function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function formatPrice(price) {
  if (!price || price.min == null) return null;
  const n = price.min;
  const money = `$${Math.round(n).toLocaleString('en-CA')}`;
  if (price.unit === 'monthly') return `${money}/mo`;
  if (price.unit === 'nightly') return `${money}/night`;
  return money;
}

function relativePosted(postedAt) {
  if (!postedAt) return null;
  const t = new Date(postedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'Listed today';
  if (days === 1) return 'Listed yesterday';
  if (days < 30) return `Listed ${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Listed 1mo ago' : `Listed ${months}mo ago`;
}

function locationLine(listing) {
  const loc = listing.location || {};
  return [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || null;
}

export default function HousingPage() {
  const [section, setSection] = useState('real-estate');
  const [query, setQuery] = useState('');
  const [placeInput, setPlaceInput] = useState('');
  const [centre, setCentre] = useState({ ...DEFAULT_CENTRE, from: 'default' });
  const [radiusId, setRadiusId] = useState('25');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [beds, setBeds] = useState('');
  const [type, setType] = useState('');
  const [listings, setListings] = useState([]);
  const [listingSources, setListingSources] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [sources, setSources] = useState(null);
  const [sourcesError, setSourcesError] = useState('');
  const [geoError, setGeoError] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [savedIds, setSavedIds] = useState([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const geoAskedRef = useRef(false);

  // --- sources registry, once ----------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/housing/sources');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) setSources(Array.isArray(data) ? data : data.sources || []);
      } catch {
        if (alive) setSourcesError('The source list is not available yet — Housing’s sources are still being connected.');
      }
    })();
    return () => { alive = false; };
  }, []);

  // --- saved listings --------------------------------------------------------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      if (raw) setSavedIds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const toggleSave = useCallback((listingId) => {
    setSavedIds((prev) => {
      const next = prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [...prev, listingId];
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // --- search ------------------------------------------------------------------
  const runSearch = useCallback(async (overrides = {}) => {
    const nextSection = overrides.section ?? section;
    const nextCentre = overrides.centre ?? centre;
    const nextRadiusId = overrides.radiusId ?? radiusId;
    setSearching(true);
    setSearchError('');
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      params.set('section', nextSection);
      if (query.trim()) params.set('q', query.trim());
      const place = (overrides.placeInput ?? placeInput).trim();
      if (place) params.set('place', place);
      if (nextCentre && nextCentre.lat != null && nextCentre.lon != null) {
        params.set('lat', String(nextCentre.lat));
        params.set('lon', String(nextCentre.lon));
      }
      params.set('radiusKm', nextRadiusId);
      if (minPrice !== '') params.set('minPrice', minPrice);
      if (maxPrice !== '') params.set('maxPrice', maxPrice);
      if (beds !== '') params.set('beds', beds);
      if (type !== '') params.set('type', type);
      const res = await fetch(`/api/housing/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setListings(Array.isArray(data.listings) ? data.listings : []);
      setListingSources(Array.isArray(data.sources) ? data.sources : []);
    } catch {
      setSearchError('The search did not come back — check your connection and try again.');
      setListings([]);
      setListingSources([]);
    } finally {
      setSearching(false);
    }
  }, [section, centre, radiusId, query, placeInput, minPrice, maxPrice, beds, type]);

  // --- location ---------------------------------------------------------------
  const useMyLocation = useCallback(() => {
    if (geoAskedRef.current) return; // never ask twice
    geoAskedRef.current = true;
    if (!('geolocation' in navigator)) {
      setGeoError('This device has no location to share — type a city or postal code instead.');
      return;
    }
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your location', from: 'device' };
        setCentre(next);
        if (hasSearched) runSearch({ centre: next });
      },
      () => {
        // Denied or unavailable: fall back gracefully, never block.
        setGeoError('Location is off or was not shared — no problem, the search stays on Redwater, AB until you type a place.');
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }, [hasSearched, runSearch]);

  const applyPlace = useCallback(() => {
    const place = placeInput.trim();
    if (!place) return;
    setPlaceNote('');
    setGeoError('');
    // The search API geocodes the place server-side; the page keeps the
    // typed text as the centre label until a search comes back.
    setCentre({ lat: null, lon: null, label: place, from: 'manual' });
    if (hasSearched) runSearch({ centre: { lat: null, lon: null, label: place, from: 'manual' } });
  }, [placeInput, hasSearched, runSearch]);

  const resetCentre = useCallback(() => {
    const next = { ...DEFAULT_CENTRE, from: 'default' };
    setCentre(next);
    setPlaceInput('');
    if (hasSearched) runSearch({ centre: next });
  }, [hasSearched, runSearch]);

  const switchSection = useCallback((id) => {
    setSection(id);
    if (hasSearched) runSearch({ section: id });
  }, [hasSearched, runSearch]);

  // --- derived ------------------------------------------------------------------
  const visibleListings = useMemo(
    () => (savedOnly ? listings.filter((l) => savedIds.includes(l.id)) : listings),
    [listings, savedOnly, savedIds],
  );
  const liveSourceCount = (sources || []).filter((s) => s.status === 'live').length;
  const centreLabel = radiusId === 'anywhere' ? 'Anywhere' : `Near ${centre.label}`;
  const sectionHint = SECTIONS.find((s) => s.id === section)?.hint || '';
  const needsPlace = section === 'temporary' && centre.lat == null;

  // --- render -----------------------------------------------------------------
  return (
    <main style={styles.page} data-testid="housing-page">
      <img src={BACKGROUND_IMAGE_SRC} alt="" aria-hidden="true" data-testid="housing-background" style={styles.bgImg} />
      <div style={styles.wrap}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.mark} aria-hidden="true">Ω</div>
          <div>
            <h1 style={styles.title}>Housing</h1>
            <p style={styles.byline}>by Omega</p>
          </div>
          <p style={styles.sourceCount}>
            {sources === null && !sourcesError
              ? 'Searching live sources…'
              : sourcesError
                ? 'Source list still connecting'
                : `Searching ${liveSourceCount} live source${liveSourceCount === 1 ? '' : 's'}`}
          </p>
        </header>

        {/* Sections */}
        <section style={styles.card} aria-label="Sections">
          <div style={styles.tabRow} role="tablist" aria-label="Housing sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={section === s.id}
                data-testid={`section-${s.id}`}
                onClick={() => switchSection(s.id)}
                style={section === s.id ? styles.tabActive : styles.tab}
              >
                {sectionImageSrc(s.id) ? (
                  <img src={sectionImageSrc(s.id)} alt="" data-testid={`section-image-${s.id}`} style={styles.sectionImg} />
                ) : null}
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <p style={styles.note}>{sectionHint} — real listings only, never invented.</p>
        </section>

        {/* Search */}
        <section style={styles.card} aria-label="Search">
          <h2 style={styles.h2}>Find a place</h2>
          <label style={styles.label}>
            Keywords
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. bungalow, downtown, pet friendly"
              style={styles.input}
              data-testid="housing-query"
            />
          </label>

          <div style={styles.row}>
            <label style={{ ...styles.label, flex: 1 }}>
              City or postal code
              <input
                type="text"
                value={placeInput}
                onChange={(e) => setPlaceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyPlace(); }}
                placeholder="Redwater, Edmonton, T0A 2W0…"
                style={styles.input}
                data-testid="housing-place"
              />
            </label>
            <button type="button" onClick={applyPlace} style={styles.button} data-testid="housing-apply-place">Use this place</button>
          </div>
          <div style={styles.row}>
            <button type="button" onClick={useMyLocation} style={styles.button} data-testid="housing-my-location">Use my location</button>
            <button type="button" onClick={resetCentre} style={styles.buttonSecondary} data-testid="housing-reset-place">Back to Redwater</button>
          </div>
          {geoError ? <p role="status" style={styles.note}>{geoError}</p> : null}
          {placeNote ? <p role="status" style={styles.note}>{placeNote}</p> : null}
          <p style={styles.note}>{centreLabel}</p>

          <div style={styles.grid2}>
            <label style={styles.label}>
              Distance
              <select value={radiusId} onChange={(e) => setRadiusId(e.target.value)} style={styles.input} data-testid="housing-radius">
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              Bedrooms
              <select value={beds} onChange={(e) => setBeds(e.target.value)} style={styles.input} data-testid="housing-beds">
                <option value="">Any</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
                <option value="5">5+</option>
              </select>
            </label>
            <label style={styles.label}>
              Min price
              <input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="No minimum" style={styles.input} data-testid="housing-min-price" />
            </label>
            <label style={styles.label}>
              Max price
              <input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="No maximum" style={styles.input} data-testid="housing-max-price" />
            </label>
          </div>
          <label style={styles.label}>
            Property type
            <select value={type} onChange={(e) => setType(e.target.value)} style={styles.input} data-testid="housing-type">
              <option value="">Any type</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => runSearch()}
            disabled={searching}
            style={styles.searchButton}
            data-testid="housing-search"
          >
            {searching ? 'Searching…' : 'Search housing'}
          </button>
          {searchError ? <p role="alert" style={styles.error}>{searchError}</p> : null}
          {needsPlace && !hasSearched ? (
            <p style={styles.note}>Stays are places near you — type a city or postal code, or use your location, to see hotels and hostels nearby.</p>
          ) : null}
        </section>

        {/* Results */}
        <section style={styles.card} aria-label="Results" id="housing-results">
          <h2 style={styles.h2}>
            {hasSearched ? `${visibleListings.length} place${visibleListings.length === 1 ? '' : 's'}` : 'Results'}
          </h2>
          {listingSources.length ? (
            <p style={styles.note}>
              {listingSources.map((s) => `${s.id}: ${s.count != null ? `${s.count} found` : s.error || s.status}`).join(' · ')}
            </p>
          ) : null}
          <label style={styles.checkRow}>
            <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} data-testid="housing-saved-only" />
            Saved only
          </label>

          {!hasSearched && !searching ? (
            <p style={styles.note}>Search above to see real listings from the live sources.</p>
          ) : null}
          {hasSearched && visibleListings.length === 0 && !searching && !searchError ? (
            <p style={styles.note}>Nothing matched — try widening the distance, clearing the price range, or dropping the bedroom minimum.</p>
          ) : null}
          <div data-testid="results-list">
            {visibleListings.map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                saved={savedIds.includes(listing.id)}
                onToggleSave={() => toggleSave(listing.id)}
              />
            ))}
          </div>
        </section>

        {/* Sources */}
        <section style={styles.card} aria-label="Sources">
          <h2 style={styles.h2}>Sources</h2>
          <p style={styles.note}>
            Every source Housing searches. A source marked staged is not
            live yet — the board shows it honestly instead of pretending.
          </p>
          {sourcesError ? <p role="status" style={styles.error}>{sourcesError}</p> : null}
          {sources === null && !sourcesError ? <p style={styles.note}>Loading sources…</p> : null}
          {(sources || []).map((src) => (
            <div key={src.id} style={styles.sourceRow} data-testid={`source-${src.id}`}>
              <span
                aria-label={src.status === 'live' ? 'live' : 'staged'}
                style={src.status === 'live' ? styles.dotLive : styles.dotStaged}
              />
              <div style={styles.sourceBody}>
                <strong>{src.name}</strong>
                <span style={styles.sourceKind}>{src.kind ? ` — ${src.kind}` : ''}</span>
                {src.status === 'staged' && src.gap ? (
                  <p style={styles.sourceGap}>Not live yet: {src.gap}</p>
                ) : null}
                {src.status === 'live' && src.notes ? (
                  <p style={styles.sourceNote}>{src.notes}</p>
                ) : null}
              </div>
              {src.url ? (
                <a href={src.url} target="_blank" rel="noopener noreferrer" style={styles.linkButton}>Visit</a>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

// --- one listing row ----------------------------------------------------------

function ListingRow({ listing, saved, onToggleSave }) {
  const price = formatPrice(listing.price);
  const posted = relativePosted(listing.postedAt);
  const where = locationLine(listing);
  const distance = listing.distanceKm != null ? formatDistance(listing.distanceKm) : null;
  const thumbSrc = listingImageSrc(listing);
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString('en-CA')} sqft` : null,
  ].filter(Boolean).join(' · ');
  return (
    <article style={styles.listing} data-testid={`listing-${listing.id}`}>
      <div style={styles.listingTop}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="" data-testid={`listing-thumb-${listing.id}`} style={styles.listingThumb} />
        ) : null}
        <div style={{ flex: 1 }}>
          <h3 style={styles.listingTitle}>{listing.title}</h3>
          <p style={styles.listingPrice}>{price || 'Price not listed'}</p>
        </div>
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save this place'}
          style={saved ? styles.saveActive : styles.save}
          data-testid={`save-${listing.id}`}
        >
          {saved ? '★ Saved' : '☆ Save'}
        </button>
      </div>
      {specs ? <p style={styles.listingMeta}>{specs}</p> : null}
      {where ? <p style={styles.listingMeta}>{where}{distance ? ` — ${distance}` : ''}</p> : null}
      {listing.description ? <p style={styles.listingDesc}>{listing.description}</p> : null}
      <p style={styles.listingMeta}>
        {listing.source}
        {posted ? ` · ${posted}` : ''}
      </p>
      <div style={styles.listingActions}>
        {listing.url ? (
          <a href={listing.url} target="_blank" rel="noopener noreferrer" style={styles.linkButton}>View</a>
        ) : null}
        {listing.attribution ? (
          <a href={listing.attribution.url} target="_blank" rel="noopener noreferrer" style={styles.attrLink}>{listing.attribution.label}</a>
        ) : null}
      </div>
    </article>
  );
}

// --- styles -------------------------------------------------------------------

const styles = {
  page: { minHeight: '100vh', background: '#0b0b12', color: '#f3f1e8', padding: '16px 12px 48px', position: 'relative' },
  // Page background graphic, fixed behind the content (the dark page
  // background above stays underneath as the fallback). Dimmed so the
  // cards and text stay fully legible; cards are opaque.
  bgImg: { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.35, pointerEvents: 'none' },
  wrap: { maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', zIndex: 1 },
  header: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  mark: { width: 44, height: 44, borderRadius: '50%', background: '#b8860b', color: '#0b0b12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 },
  title: { margin: 0, fontSize: 28 },
  byline: { margin: 0, fontSize: 13, color: '#b9b4a3' },
  sourceCount: { margin: '0 0 0 auto', fontSize: 13, color: '#b9b4a3' },
  card: { background: '#14141f', border: '1px solid #2a2a3a', borderRadius: 12, padding: 16 },
  h2: { margin: '0 0 8px', fontSize: 18 },
  h3: { margin: '0 0 4px', fontSize: 16 },
  note: { margin: '8px 0', fontSize: 14, color: '#b9b4a3' },
  error: { margin: '8px 0', fontSize: 14, color: '#f87171' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, margin: '10px 0' },
  input: { background: '#0b0b12', color: '#f3f1e8', border: '1px solid #3a3a4a', borderRadius: 8, padding: '10px 12px', fontSize: 15, width: '100%', boxSizing: 'border-box' },
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 4 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  button: { background: '#b8860b', color: '#0b0b12', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  buttonSecondary: { background: 'transparent', color: '#f3f1e8', border: '1px solid #3a3a4a', borderRadius: 8, padding: '10px 14px', fontSize: 15, cursor: 'pointer' },
  searchButton: { background: '#b8860b', color: '#0b0b12', border: 'none', borderRadius: 8, padding: '12px 16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: 12 },
  tabRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  tab: { background: 'transparent', color: '#f3f1e8', border: '1px solid #3a3a4a', borderRadius: 12, padding: 8, fontSize: 15, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', textAlign: 'center' },
  tabActive: { background: '#b8860b', color: '#0b0b12', border: '1px solid #b8860b', borderRadius: 12, padding: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', textAlign: 'center' },
  sectionImg: { display: 'block', width: '100%', height: 'auto', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8 },
  checkRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '8px 0', cursor: 'pointer' },
  listing: { borderTop: '1px solid #2a2a3a', padding: '14px 0' },
  listingTop: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  listingThumb: { width: 72, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
  listingTitle: { margin: 0, fontSize: 16 },
  listingPrice: { margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#e8c15a' },
  listingMeta: { margin: '4px 0', fontSize: 14, color: '#b9b4a3' },
  listingDesc: { margin: '8px 0', fontSize: 14, lineHeight: 1.5 },
  listingActions: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  save: { background: 'transparent', color: '#f3f1e8', border: '1px solid #3a3a4a', borderRadius: 8, padding: '8px 10px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  saveActive: { background: '#b8860b', color: '#0b0b12', border: '1px solid #b8860b', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  linkButton: { display: 'inline-block', background: '#b8860b', color: '#0b0b12', borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },
  attrLink: { fontSize: 13, color: '#b9b4a3' },
  sourceRow: { display: 'flex', gap: 10, alignItems: 'flex-start', borderTop: '1px solid #2a2a3a', padding: '12px 0' },
  sourceBody: { flex: 1, fontSize: 14 },
  sourceKind: { color: '#b9b4a3' },
  sourceGap: { margin: '6px 0 0', fontSize: 13, color: '#d9a441' },
  sourceNote: { margin: '6px 0 0', fontSize: 13, color: '#b9b4a3' },
  dotLive: { width: 10, height: 10, borderRadius: '50%', background: '#22c55e', marginTop: 5, flexShrink: 0 },
  dotStaged: { width: 10, height: 10, borderRadius: '50%', background: '#d9a441', marginTop: 5, flexShrink: 0 },
};
