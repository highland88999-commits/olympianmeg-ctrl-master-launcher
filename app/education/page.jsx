// app/education/page.jsx — Omega Education, branded under Omega.
//
// One place to find learning: pick a level (daycare to university), a
// field of study, and how far from home to look, and the page shows real
// schools, colleges, universities, daycare providers and trades
// authorities — each with a link to its own official site. It never
// invents an institution, and it never takes the application: Visit
// always opens the institution's own site in a new tab.
//
// Data comes from the contracted API routes:
//   GET  /api/education/sources        -> the source registry (array)
//   GET  /api/education/search?...     -> { results[], sources[] }; takes
//     q, level, field, radiusKm (number, or 'province' / 'country' /
//     'any'), lat, lon, state, sources, limit. Province/country lift the
//     distance cap server-side; the page region-filters those scopes
//     itself on real results when the centre's region/country is known.
// A typed place is geocoded on the device via lib/education/geo.js
// (built-in city table first, Nominatim fallback) — the search API
// takes lat/lon, not a place string.
//
// The search covers the baked-in directory (615 entries: 476 Alberta
// K-12 schools from Alberta open data, plus 139 universities, colleges,
// daycare providers and trades authorities). K-12 schools teach the full
// curriculum, so they show for any field you pick — the page says so
// next to the field picker. College Scorecard joins the search once its
// free key is set on the server; until then US coverage is the bundled
// universities.
//
// Below the search, the original Education space is kept: Miles'
// embark referral at the top of that section, and the Olympus learning
// links (lessons, Alexandria, Playbook, IQ Test, Meet the Gods, News).
//
// Laws: plain English throughout, normal flow layout (no-overlap),
// thumb-friendly buttons at phone widths. The circle-orb law is for
// game screens only — this is a utility, so normal buttons are fine.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LEVELS, levelImageSrc, BACKGROUND_IMAGE_SRC } from '@/lib/education/levels.js';
import { FIELDS, fieldForKeywords, fieldById } from '@/lib/education/fields.js';

// --- constants ------------------------------------------------------------

// Redwater, AB — Merlin's town, the default search centre.
// 53.94889° N, 113.10667° W (Wikipedia, Town of Redwater).
const DEFAULT_CENTRE = { lat: 53.9489, lon: -113.1067, label: 'Redwater, AB', region: 'Alberta', country: 'Canada' };

const RADIUS_OPTIONS = [
  { id: '5', km: 5, label: '5 km' },
  { id: '10', km: 10, label: '10 km' },
  { id: '25', km: 25, label: '25 km' },
  { id: '50', km: 50, label: '50 km' },
  { id: '100', km: 100, label: '100 km' },
  { id: 'province', km: null, scope: 'province', label: 'Province / state-wide' },
  { id: 'country', km: null, scope: 'country', label: 'Country-wide' },
  { id: 'anywhere', km: null, scope: 'anywhere', label: 'Abroad / anywhere' },
];

const SAVED_KEY = 'olympus:education:saved';

// Miles' affiliate referral code — set to his real code once confirmed.
const MILES_REFERRAL_CODE = 'MILES';

const OLYMPUS_OPTIONS = [
  {
    route: '/olympian-education',
    title: 'Lessons',
    name: 'Olympian Education',
    desc: 'Twelve lessons across three schools: Wisdom of Athens, The Open Scrolls, and The Forge. Finish them all to earn the Olympian Scholar achievement.',
    tag: '12 lessons',
  },
  {
    route: '/alexandria',
    title: 'Archive',
    name: 'Alexandria',
    desc: 'The great archive — a library of knowledge for every curious mind.',
    tag: 'Library',
  },
  {
    route: '/playbook',
    title: 'E-Book Reader',
    name: 'Playbook',
    desc: 'Read the books that build worlds, right inside Olympus.',
    tag: 'Reading',
  },
  {
    route: '/iq-test',
    title: '3D Puzzle',
    name: 'IQ Test',
    desc: 'Test your mind in three dimensions.',
    tag: 'Challenge',
  },
  {
    route: '/meet-the-gods',
    title: 'God Guide',
    name: 'Meet the Gods',
    desc: 'Learn who rules Olympus and what each god stands for.',
    tag: 'Guide',
  },
  {
    route: '/trifold',
    title: 'News',
    name: 'News',
    desc: 'The weekly newspaper — read the multiverse every Tuesday.',
    tag: 'Weekly',
  },
];

// --- small pure helpers ---------------------------------------------------

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function locationLabel(entry) {
  if (!entry.location) return 'Location not listed';
  if (entry.online) return `${[entry.location.city, entry.location.region, entry.location.country].filter(Boolean).join(', ')} · online too`;
  const parts = [entry.location.city, entry.location.region, entry.location.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Location not listed';
}

function levelLabel(id) {
  const found = LEVELS.find((l) => l.id === id);
  return found ? found.label : id;
}

// --- page -----------------------------------------------------------------

export default function EducationPage() {
  const [sources, setSources] = useState(null);
  const [sourcesError, setSourcesError] = useState('');

  const [centre, setCentre] = useState({ ...DEFAULT_CENTRE, from: 'default' });
  const [placeInput, setPlaceInput] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [radiusId, setRadiusId] = useState('100');
  // Default radius is 100 km, not the Job Board's 25 km: the nearest
  // college or university to Redwater is about 60 km away, so 25 km
  // would return nothing for most program searches.
  const [geoError, setGeoError] = useState('');
  const geoAskedRef = useRef(false);

  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState('');
  const [field, setField] = useState('');

  const [results, setResults] = useState([]);
  const [resultSources, setResultSources] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const [savedIds, setSavedIds] = useState([]);
  const [copied, setCopied] = useState(false);
  const geoRef = useRef(null); // geocodePlace from lib/education/geo.js, when present

  // Swap in the real geocoder when the module exists in the tree. The
  // dynamic import path is built from parts so the build does not
  // hard-fail while lib/education/ is still landing — a miss just leaves
  // typed places searching unplaced.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await import('@/lib/education/' + 'geo.js');
        if (alive && typeof g.geocodePlace === 'function') geoRef.current = g.geocodePlace;
      } catch {
        /* geocoder not in the tree yet — typed places search unplaced */
      }
    })();
    return () => { alive = false; };
  }, []);

  // Sources registry, once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/education/sources');
        if (!res.ok) throw new Error(`sources returned ${res.status}`);
        const data = await res.json();
        if (alive) setSources(Array.isArray(data) ? data : data.sources || []);
      } catch (e) {
        if (alive) setSourcesError('The source list is not available yet — the Education sources are still being connected.');
      }
    })();
    return () => { alive = false; };
  }, []);

  // Saved entries, from this device only.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
      if (Array.isArray(saved)) setSavedIds(saved);
    } catch {
      /* private mode / no storage — the page still works */
    }
  }, []);

  const liveSourceCount = useMemo(
    () => (sources || []).filter((s) => s.status === 'live').length,
    [sources],
  );

  // A typed keyword that names a field offers that field, when none is
  // picked yet — a hint, never an auto-pick.
  const suggestedField = useMemo(() => {
    if (field) return null;
    const id = fieldForKeywords(keyword);
    return id ? fieldById(id) : null;
  }, [keyword, field]);

  // --- search -------------------------------------------------------------

  const runSearch = useCallback(async (overrides = {}) => {
    const q = overrides.keyword !== undefined ? overrides.keyword : keyword;
    const lvl = overrides.level !== undefined ? overrides.level : level;
    const fld = overrides.field !== undefined ? overrides.field : field;
    const rad = overrides.radiusId !== undefined ? overrides.radiusId : radiusId;
    const ctr = overrides.centre !== undefined ? overrides.centre : centre;

    const radius = RADIUS_OPTIONS.find((r) => r.id === rad) || RADIUS_OPTIONS.find((r) => r.id === '100');
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (lvl) params.set('level', lvl);
    if (fld) params.set('field', fld);
    // The search API takes radiusKm as a number, or the words 'province',
    // 'country' and 'any' (province/country lift the distance cap but
    // still need lat/lon to annotate distances).
    if (radius.km) params.set('radiusKm', String(radius.km));
    else if (radius.scope === 'province') params.set('radiusKm', 'province');
    else if (radius.scope === 'country') params.set('radiusKm', 'country');
    else params.set('radiusKm', 'any');
    if (ctr && ctr.lat != null) {
      params.set('lat', String(ctr.lat));
      params.set('lon', String(ctr.lon));
    }

    setSearching(true);
    setSearchError('');
    try {
      const res2 = await fetch(`/api/education/search?${params.toString()}`);
      if (!res2.ok) throw new Error(`search returned ${res2.status}`);
      const data = await res2.json();
      let list = Array.isArray(data.results) ? data.results : [];
      // Province / country scopes: the API lifts the distance cap but
      // does not region-filter, so the page does that part itself, on
      // real results, when the centre's region/country is known.
      if (radius.scope === 'province' && ctr && ctr.region) {
        const want = String(ctr.region).toLowerCase();
        list = list.filter((e) => !e.location || !e.location.region || String(e.location.region).toLowerCase() === want || e.online);
      }
      if (radius.scope === 'country' && ctr && ctr.country) {
        const want = String(ctr.country).toLowerCase();
        list = list.filter((e) => !e.location || !e.location.country || String(e.location.country).toLowerCase() === want || e.online);
      }
      setResults(list);
      setResultSources(Array.isArray(data.sources) ? data.sources : []);
      setHasSearched(true);
    } catch (e) {
      setSearchError('Education search is not live yet — the sources are still being connected. Your filters stay on this page; try again once it is wired up.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [keyword, level, field, radiusId, centre]);

  // A radius change re-filters the current search, once one has run.
  const changeRadius = useCallback((nextId) => {
    setRadiusId(nextId);
    if (hasSearched) runSearch({ radiusId: nextId });
  }, [hasSearched, runSearch]);

  const searchLevel = useCallback((levelId) => {
    setLevel(levelId);
    runSearch({ level: levelId });
    document.getElementById('education-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [runSearch]);

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
        setCentre({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your location', from: 'device' });
        if (hasSearched) runSearch({ centre: { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your location', from: 'device' } });
      },
      () => {
        // Denied or unavailable: fall back gracefully, never block.
        setGeoError('Location is off or was not shared — no problem, the search stays on Redwater, AB until you type a place.');
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }, [hasSearched, runSearch]);

  const applyPlace = useCallback(async () => {
    const place = placeInput.trim();
    if (!place) return;
    setPlaceNote('');
    setGeoError('');
    // Geocode the typed place on the device (city table first, then
    // Nominatim via lib/education/geo.js when it is in the tree). A hit
    // gives real coordinates, so radius filtering works from that place.
    let nextCentre = { lat: null, lon: null, label: place, region: null, country: null, from: 'manual' };
    try {
      if (geoRef.current) {
        const hit = await geoRef.current(place);
        if (hit && hit.lat != null) {
          const parts = String(hit.label || '').split(',').map((s) => s.trim()).filter(Boolean);
          nextCentre = {
            lat: hit.lat,
            lon: hit.lon,
            label: parts.length > 2 ? parts.slice(0, parts.length - 2).join(', ') : (parts[0] || place),
            region: parts.length > 2 ? parts[parts.length - 2] : null,
            country: parts.length > 1 ? parts[parts.length - 1] : null,
            from: 'manual',
          };
        } else {
          setPlaceNote(`Could not place “${place}” — searching from everywhere for now. Try a city name or a postal code.`);
        }
      } else {
        setPlaceNote(`No geocoder on this build yet — searching from everywhere for now.`);
      }
    } catch {
      setPlaceNote(`Could not place “${place}” — searching from everywhere for now.`);
    }
    setCentre(nextCentre);
    if (hasSearched) runSearch({ centre: nextCentre });
  }, [placeInput, hasSearched, runSearch]);

  const resetCentre = useCallback(() => {
    setCentre({ ...DEFAULT_CENTRE, from: 'default' });
    setPlaceInput('');
    if (hasSearched) runSearch({ centre: { ...DEFAULT_CENTRE, from: 'default' } });
  }, [hasSearched, runSearch]);

  // --- saved entries ---------------------------------------------------------------

  const toggleSave = useCallback((entryId) => {
    setSavedIds((prev) => {
      const next = prev.includes(entryId) ? prev.filter((id) => id !== entryId) : [...prev, entryId];
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // --- Miles referral ---------------------------------------------------------------

  const embark = (e) => {
    e.preventDefault();
    const url = `${window.location.origin}/?ref=${encodeURIComponent(MILES_REFERRAL_CODE)}`;
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
    window.location.href = url;
  };

  // --- derived ------------------------------------------------------------------

  const centreLabel = radiusId === 'anywhere' ? 'Anywhere' : `Near ${centre.label}`;

  // --- render -----------------------------------------------------------------

  return (
    <main style={styles.page}>
      <img src={BACKGROUND_IMAGE_SRC} alt="" aria-hidden="true" data-testid="education-background" style={styles.bgImg} />
      <div style={styles.wrap}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.mark} aria-hidden="true">Ω</div>
          <div>
            <h1 style={styles.title}>Education</h1>
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

        {/* Location + radius */}
        <section style={styles.card} aria-label="Where to search">
          <h2 style={styles.h2}>Where to search</h2>
          <p style={styles.centreLabel} data-testid="centre-label">{centreLabel}</p>
          <div style={styles.row}>
            <button type="button" data-testid="use-my-location" onClick={useMyLocation} style={styles.buttonPrimary}>
              Use my location
            </button>
            {centre.from !== 'default' ? (
              <button type="button" onClick={resetCentre} style={styles.buttonGhost}>Back to Redwater, AB</button>
            ) : null}
          </div>
          {geoError ? <p role="status" style={styles.note}>{geoError}</p> : null}
          <label style={styles.fieldLabel}>
            Or a city or postal code
            <span style={styles.row}>
              <input
                data-testid="place-input"
                type="text"
                value={placeInput}
                onChange={(e) => setPlaceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPlace(); } }}
                placeholder="e.g. Edmonton, AB or T0A 2W0"
                style={{ ...styles.input, flex: 1 }}
              />
              <button type="button" data-testid="apply-place" onClick={applyPlace} style={styles.button}>Go</button>
            </span>
          </label>
          {placeNote ? <p role="status" style={styles.note}>{placeNote}</p> : null}
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>How far from there?</legend>
            <div style={styles.chipRow}>
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`radius-${opt.id}`}
                  onClick={() => changeRadius(opt.id)}
                  aria-pressed={radiusId === opt.id}
                  style={radiusId === opt.id ? styles.chipActive : styles.chip}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        {/* Search */}
        <section style={styles.card} aria-label="Search education">
          <h2 style={styles.h2}>Search education</h2>
          <label style={styles.fieldLabel}>
            Keywords
            <input
              data-testid="search-keywords"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
              placeholder="e.g. nursing, welding, daycare"
              style={styles.input}
            />
          </label>
          {suggestedField ? (
            <p style={styles.note}>
              Looks like {suggestedField.label} —{' '}
              <button type="button" onClick={() => setField(suggestedField.id)} style={styles.linkButton}>
                narrow to {suggestedField.label}
              </button>
            </p>
          ) : null}
          <div style={styles.grid2}>
            <label style={styles.fieldLabel}>
              Level
              <select data-testid="search-level" value={level} onChange={(e) => setLevel(e.target.value)} style={styles.input}>
                <option value="">Any level</option>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </label>
            <label style={styles.fieldLabel}>
              Field of study
              <select data-testid="search-field" value={field} onChange={(e) => setField(e.target.value)} style={styles.input}>
                <option value="">Any field</option>
                {FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p style={styles.note}>
            K-12 schools teach the full curriculum, so they show for any field you pick.
          </p>
          {level ? (
            <p style={styles.note}>
              Level: <strong>{levelLabel(level)}</strong>
              {' '}<button type="button" onClick={() => { setLevel(''); if (hasSearched) runSearch({ level: '' }); }} style={styles.linkButton}>clear</button>
            </p>
          ) : null}
          {field ? (
            <p style={styles.note}>
              Field: <strong>{(FIELDS.find((f) => f.id === field) || {}).label || field}</strong>
              {' '}<button type="button" onClick={() => { setField(''); if (hasSearched) runSearch({ field: '' }); }} style={styles.linkButton}>clear</button>
            </p>
          ) : null}
          <button
            type="button"
            data-testid="search-button"
            onClick={() => runSearch()}
            disabled={searching}
            style={styles.buttonPrimary}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
          {searchError ? <p role="alert" style={styles.error}>{searchError}</p> : null}
        </section>

        {/* Results */}
        <section style={styles.card} aria-label="Results" id="education-results">
          <h2 style={styles.h2}>
            {hasSearched ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Results'}
          </h2>
          {resultSources.length ? (
            <p style={styles.note}>
              {resultSources.map((s) => `${s.id}: ${s.count != null ? `${s.count} found` : s.error || s.status}`).join(' · ')}
            </p>
          ) : null}

          {!hasSearched && !searching ? (
            <p style={styles.note}>Search above, or pick a level below, to see real schools and programs from the live sources.</p>
          ) : null}
          {hasSearched && results.length === 0 && !searching && !searchError ? (
            <p style={styles.note}>Nothing matched — try widening the distance, clearing the level or field, or a different keyword.</p>
          ) : null}
          <div data-testid="results-list">
            {results.map((entry) => (
              <ResultRow
                key={entry.id}
                entry={entry}
                centre={centre}
                radiusId={radiusId}
                saved={savedIds.includes(entry.id)}
                onToggleSave={() => toggleSave(entry.id)}
              />
            ))}
          </div>
        </section>

        {/* Browse by level */}
        <section style={styles.card} aria-label="Browse by level">
          <h2 style={styles.h2}>Browse by level</h2>
          <p style={styles.note}>Tap a level to search it — from daycare to university.</p>
          <div style={styles.levelGrid}>
            {LEVELS.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                data-testid={`level-${lvl.id}`}
                onClick={() => searchLevel(lvl.id)}
                style={level === lvl.id ? styles.levelActive : styles.level}
              >
                {levelImageSrc(lvl.id) ? (
                  <img src={levelImageSrc(lvl.id)} alt="" data-testid={`level-image-${lvl.id}`} style={styles.levelImg} />
                ) : null}
                <span style={styles.levelLabel}>{lvl.label}</span>
                <span style={styles.levelSub}>{lvl.subs.join(' · ')}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Sources */}
        <section style={styles.card} aria-label="Sources">
          <h2 style={styles.h2}>Sources</h2>
          <p style={styles.note}>
            Every directory the Education search draws on. A source marked staged is not
            live yet — the page shows it honestly instead of pretending.
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

        {/* Learn inside Olympus — the original Education space, kept */}
        <section style={styles.card} aria-label="Learn inside Olympus">
          <h2 style={styles.h2}>Learn inside Olympus</h2>
          <p style={styles.note}>Every way to learn in Olympus, gathered in one space.</p>

          {/* Miles' embark referral — pinned at the top of this section */}
          <div data-testid="miles-referral" style={styles.referral}>
            <p style={styles.referralKicker}>Embark with Miles</p>
            <p style={styles.note}>
              New here? Create your account through Miles&apos; referral link and start your journey with the family.
            </p>
            <button
              type="button"
              onClick={embark}
              style={styles.buttonPrimary}
            >
              {copied ? 'Link copied ✓' : 'Create account'}
            </button>
          </div>

          <div style={styles.olympusGrid}>
            {OLYMPUS_OPTIONS.map((o) => (
              <a key={o.route} href={o.route} style={styles.olympusCard}>
                <span style={styles.olympusTag}>{o.tag}</span>
                <span style={styles.olympusName}>{o.name}</span>
                <span style={styles.olympusDesc}>{o.desc}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// --- one result row ------------------------------------------------------------

function ResultRow({ entry, centre, radiusId, saved, onToggleSave }) {
  const distKm = entry.location && entry.location.lat != null && centre && centre.lat != null
    ? haversineKm(centre, entry.location)
    : null;
  const distance = entry.online
    ? 'Online too'
    : radiusId === 'anywhere'
      ? null
      : formatDistance(entry.distanceKm != null ? entry.distanceKm : distKm);
  const thumbSrc = levelImageSrc(entry.level);
  const fieldLabels = (entry.fields || [])
    .map((f) => (FIELDS.find((x) => x.id === f) || {}).label || f)
    .filter(Boolean);
  return (
    <article style={styles.result} data-testid={`result-${entry.id}`}>
      <div style={styles.resultMedia}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="" data-testid={`result-thumb-${entry.level}`} style={styles.resultThumb} />
        ) : null}
        <div style={styles.resultMain}>
          <div style={styles.resultTop}>
            <h3 style={styles.resultTitle}>{entry.name}</h3>
            <span style={styles.levelBadge} data-testid="result-level">{levelLabel(entry.level)}</span>
          </div>
          <p style={styles.resultMeta}>
            {locationLabel(entry)}
            {distance ? ` (${distance})` : ''}
          </p>
          <p style={styles.resultMeta}>
            {[fieldLabels.join(', ')].filter(Boolean).join(' · ')}
          </p>
          {entry.programs && entry.programs.length ? (
            <p style={styles.resultDesc}>{entry.programs.slice(0, 4).join(' · ')}</p>
          ) : null}
          {entry.description ? <p style={styles.resultDesc}>{entry.description}</p> : null}
          <div style={styles.row}>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="visit-link"
              style={styles.buttonPrimary}
            >
              Visit official site
            </a>
            <button
              type="button"
              data-testid="save-result"
              onClick={onToggleSave}
              aria-pressed={saved}
              style={saved ? styles.buttonSaved : styles.buttonGhost}
            >
              {saved ? '★ Saved' : '☆ Save'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// --- styles (gold / indigo Omega house family, plain flow layout) ----------

const GOLD = '#d4a017';
const GOLD_SOFT = '#f5c542';
const INDIGO_BG = '#0d0d1f';
const INDIGO_CARD = '#171730';
const INDIGO_LINE = '#2c2c52';
const TEXT = '#f2f0ff';
const MUTED = '#b9b4d6';

const styles = {
  page: { background: INDIGO_BG, color: TEXT, minHeight: '100vh', padding: '16px 12px 48px', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", position: 'relative' },
  // Page background graphic, fixed behind the content (the dark page
  // background above stays underneath as the fallback). Dimmed so the
  // cards and text stay fully legible; cards are opaque.
  bgImg: { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.35, pointerEvents: 'none' },
  wrap: { maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', zIndex: 1 },
  header: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  mark: {
    width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 30, fontWeight: 900, color: '#201600',
    background: 'radial-gradient(circle at 35% 30%, #fff3c4, #ffd700 45%, #c9962e 75%, #8a5a14)',
    border: `2px solid ${GOLD_SOFT}`, boxShadow: '0 0 18px rgba(255, 200, 60, 0.35)',
  },
  title: { margin: 0, fontSize: 30, lineHeight: 1.1, color: GOLD_SOFT },
  byline: { margin: '2px 0 0', color: MUTED, fontSize: 14 },
  sourceCount: { marginLeft: 'auto', color: GOLD_SOFT, fontSize: 13, fontWeight: 600 },
  card: { background: INDIGO_CARD, border: `1px solid ${INDIGO_LINE}`, borderRadius: 14, padding: 16 },
  h2: { margin: '0 0 8px', fontSize: 20, color: GOLD_SOFT },
  h3: { margin: '16px 0 8px', fontSize: 16, color: TEXT },
  note: { margin: '0 0 12px', color: MUTED, fontSize: 14, lineHeight: 1.5 },
  error: { margin: '12px 0 0', color: '#ffb4a2', fontSize: 14, lineHeight: 1.5 },
  input: { width: '100%', boxSizing: 'border-box', background: '#0d0d1f', color: TEXT, border: `1px solid ${INDIGO_LINE}`, borderRadius: 10, padding: '10px 12px', fontSize: 15, marginTop: 4 },
  fieldLabel: { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  buttonPrimary: {
    display: 'inline-block', background: `linear-gradient(180deg, ${GOLD_SOFT}, ${GOLD})`, color: '#201600',
    border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none', textAlign: 'center',
  },
  button: {
    background: INDIGO_LINE, color: TEXT, border: `1px solid ${INDIGO_LINE}`,
    borderRadius: 10, padding: '10px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  buttonGhost: {
    background: 'transparent', color: TEXT, border: `1px solid ${INDIGO_LINE}`,
    borderRadius: 10, padding: '10px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  buttonSaved: {
    background: '#3a2f10', color: GOLD_SOFT, border: `1px solid ${GOLD}`,
    borderRadius: 10, padding: '10px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  linkButton: { background: 'none', border: 'none', color: GOLD_SOFT, fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 },
  centreLabel: { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: TEXT },
  fieldset: { border: `1px solid ${INDIGO_LINE}`, borderRadius: 10, padding: 12, margin: '12px 0 0' },
  legend: { fontSize: 14, fontWeight: 600, padding: '0 6px' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: '#0d0d1f', color: TEXT, border: `1px solid ${INDIGO_LINE}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, cursor: 'pointer' },
  chipActive: { background: GOLD, color: '#201600', border: `1px solid ${GOLD_SOFT}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  levelGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  level: { background: '#0d0d1f', border: `1px solid ${INDIGO_LINE}`, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer', color: TEXT },
  levelActive: { background: '#3a2f10', border: `1px solid ${GOLD}`, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer', color: TEXT },
  levelLabel: { display: 'block', fontSize: 15, fontWeight: 700 },
  // Level graphic, full width of the card above the label. Fixed 3:2
  // aspect (the art is 900x600) so the grid never shifts as images load.
  levelImg: { display: 'block', width: '100%', height: 'auto', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8, marginBottom: 8 },
  levelSub: { display: 'block', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.4 },
  sourceRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: `1px solid ${INDIGO_LINE}` },
  sourceBody: { flex: 1, fontSize: 14, lineHeight: 1.45 },
  sourceKind: { color: MUTED },
  sourceGap: { margin: '4px 0 0', color: '#ffcf99', fontSize: 13 },
  sourceNote: { margin: '4px 0 0', color: GOLD_SOFT, fontSize: 13 },
  dotLive: { width: 12, height: 12, borderRadius: '50%', background: '#3ddc84', marginTop: 4, flexShrink: 0 },
  dotStaged: { width: 12, height: 12, borderRadius: '50%', background: '#ffb020', marginTop: 4, flexShrink: 0 },
  result: { borderTop: `1px solid ${INDIGO_LINE}`, padding: '14px 0 6px' },
  resultTop: { display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' },
  resultTitle: { margin: 0, fontSize: 16, lineHeight: 1.35, flex: 1 },
  levelBadge: { background: '#3a2f10', color: GOLD_SOFT, borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  resultMeta: { margin: '6px 0 0', color: MUTED, fontSize: 14, lineHeight: 1.45 },
  resultDesc: { margin: '8px 0 10px', color: TEXT, fontSize: 14, lineHeight: 1.5 },
  // Thumb row: the level thumb sits left of the title/meta column,
  // in normal flow — it never overlaps anything, it just widens the
  // card's first row by its own 72 px.
  resultMedia: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  resultMain: { flex: 1, minWidth: 0 },
  resultThumb: { width: 72, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
  referral: { border: `1px solid ${GOLD}`, borderRadius: 12, background: 'rgba(212, 160, 23, 0.06)', padding: 14, marginBottom: 12, textAlign: 'center' },
  referralKicker: { margin: '0 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD_SOFT },
  olympusGrid: { display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' },
  olympusCard: { display: 'block', background: '#0d0d1f', border: `1px solid ${INDIGO_LINE}`, borderRadius: 12, padding: 14, textDecoration: 'none', color: TEXT },
  olympusTag: { display: 'inline-block', fontSize: 10, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#7dd3fc', border: '1px solid rgba(125, 211, 252, 0.3)', borderRadius: 999, padding: '2px 8px', marginBottom: 8 },
  olympusName: { display: 'block', fontSize: 15, fontWeight: 700, color: TEXT },
  olympusDesc: { display: 'block', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.45 },
};
