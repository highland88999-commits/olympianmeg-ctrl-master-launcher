// app/job-board/page.jsx — Job Board, branded under Omega.
//
// One place to search every live job source: upload a resume (or paste
// it), pick how far from home to look, and the board ranks real listings
// from the sources — it never invents jobs, and it never takes the
// application: Apply always opens the source's own posting in a new tab.
//
// Data comes from the contracted API routes (Worker A):
//   GET  /api/job-board/sources        -> the source registry (array)
//   GET  /api/job-board/search?...     -> { jobs[], sources[] }; takes
//     q, category, radiusKm (number, or 'province' / 'country' / 'any'),
//     lat, lon, remote, type, sources, and resume= (JSON resume — the
//     server scores and ranks, attaching job.match { score, reasons }).
//     Province/country lift the distance cap server-side; the page
//     region-filters those scopes itself on real results when the
//     centre's region/country is known.
//   POST /api/job-board/parse-resume   -> { ok, resume } or { ok, error }
// A typed place is geocoded on the device via lib/job-board/geo.js
// (built-in city table first, Nominatim fallback) — the search API
// takes lat/lon, not a place string.
// The category grid below ships with a built-in copy of the taxonomy
// (same shape as lib/job-board/taxonomy.js CATEGORIES); when that module
// is in the tree the page swaps in the real one, and the same for the
// match scorer in lib/job-board/match.js. Until then the built-ins
// stand in and the page still works against the API.
//
// Laws: plain English throughout, normal flow layout (no-overlap),
// thumb-friendly buttons at phone widths. The circle-orb law is for
// game screens only — this is a utility, so normal buttons are fine.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resumeTemplateToText } from '@/lib/job-board/resume.js';

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

const JOB_TYPES = [
  { id: '', label: 'Any type' },
  { id: 'full-time', label: 'Full-time' },
  { id: 'part-time', label: 'Part-time' },
  { id: 'contract', label: 'Contract' },
  { id: 'temporary', label: 'Temporary' },
];

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const SAVED_KEY = 'olympus:job-board:saved';
const RESUME_KEY = 'olympus:job-board:resume';

// --- category graphics ---

// One 900x600 WebP per real taxonomy category, in
// public/images/job-board/categories/<id>.webp, plus the page background
// at public/images/job-board/background.webp (1920x1080, very dark
// low-contrast gold nebula). Only the 20 real taxonomy ids have art:
// a fallback-grid id, or a job whose category is null / unmapped,
// renders NO image — never a wrong one, never a broken one.
const CATEGORY_IMAGE_IDS = new Set([
  'trades', 'healthcare', 'tech', 'retail-sales', 'hospitality-food',
  'transport-logistics', 'admin-office', 'education', 'finance-accounting',
  'manufacturing', 'agriculture-natural-resources',
  'government-public-service', 'construction', 'engineering', 'legal',
  'arts-media', 'science-research', 'social-services', 'energy-mining',
  'security-protective',
]);
const BACKGROUND_IMAGE_SRC = '/images/job-board/background.webp';

function categoryImageSrc(id) {
  if (!id || typeof id !== 'string') return null;
  return CATEGORY_IMAGE_IDS.has(id) ? `/images/job-board/categories/${id}.webp` : null;
}

// Built-in taxonomy — the same shape as lib/job-board/taxonomy.js
// CATEGORIES ({ id, label, subcategories[], keywords[] }). The page swaps
// in the real taxonomy when that module exists in the tree (see the
// dynamic import in the mount effect); until then this stands in so the
// category grid is never empty.
const FALLBACK_CATEGORIES = [
  { id: 'trades', label: 'Skilled Trades', subcategories: ['Welding', 'Electrical', 'Plumbing', 'Carpentry', 'Heavy Equipment'], keywords: ['welder', 'welding', 'electrician', 'plumber', 'carpenter', 'millwright', 'mechanic', 'heavy equipment'] },
  { id: 'healthcare', label: 'Healthcare', subcategories: ['Nursing', 'Care Aide', 'Medical Lab', 'Pharmacy'], keywords: ['nurse', 'nursing', 'care aide', 'healthcare', 'medical', 'paramedic', 'pharmacy'] },
  { id: 'technology', label: 'Technology', subcategories: ['Software', 'IT Support', 'Data', 'Design'], keywords: ['developer', 'software', 'programmer', 'IT', 'data analyst', 'designer', 'engineer'] },
  { id: 'construction', label: 'Construction', subcategories: ['Labour', 'Framing', 'Concrete', 'Roofing'], keywords: ['construction', 'labourer', 'framer', 'concrete', 'roofer', 'site'] },
  { id: 'transport', label: 'Driving & Transport', subcategories: ['Truck Driving', 'Delivery', 'Dispatch'], keywords: ['driver', 'truck', 'delivery', 'dispatch', 'courier', 'operator'] },
  { id: 'hospitality', label: 'Hospitality & Food', subcategories: ['Cook', 'Server', 'Hotel', 'Bar'], keywords: ['cook', 'chef', 'server', 'bartender', 'hotel', 'restaurant', 'kitchen'] },
  { id: 'retail', label: 'Retail & Sales', subcategories: ['Store', 'Sales', 'Customer Service'], keywords: ['retail', 'sales', 'cashier', 'customer service', 'store'] },
  { id: 'office', label: 'Office & Admin', subcategories: ['Admin', 'Reception', 'Bookkeeping'], keywords: ['admin', 'receptionist', 'office', 'bookkeeper', 'clerk', 'assistant'] },
  { id: 'education', label: 'Education', subcategories: ['Teaching', 'Childcare', 'Tutoring'], keywords: ['teacher', 'teaching', 'childcare', 'tutor', 'educator', 'school'] },
  { id: 'agriculture', label: 'Agriculture', subcategories: ['Farm Hand', 'Ranch', 'Greenhouse'], keywords: ['farm', 'agriculture', 'ranch', 'harvest', 'greenhouse'] },
  { id: 'oil-gas', label: 'Oil, Gas & Energy', subcategories: ['Field Work', 'Plant Operator', 'Safety'], keywords: ['oil', 'gas', 'energy', 'rig', 'plant operator', 'field'] },
  { id: 'remote', label: 'Remote & Online', subcategories: ['Remote Support', 'Writing', 'Virtual Assistant'], keywords: ['remote', 'online', 'virtual assistant', 'freelance', 'work from home'] },
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

function formatSalary(salary) {
  if (!salary || salary.min == null) return null;
  const cur = salary.currency === 'USD' ? '$' : salary.currency === 'CAD' || !salary.currency ? '$' : `${salary.currency} `;
  const unit = salary.unit === 'hour' ? '/hr' : salary.unit === 'year' ? '/yr' : salary.unit === 'month' ? '/mo' : salary.unit ? `/${salary.unit}` : '';
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  if (salary.max != null && salary.max !== salary.min) return `${cur}${fmt(salary.min)}–${cur}${fmt(salary.max)}${unit}`;
  return `${cur}${fmt(salary.min)}${unit}`;
}

function relativePosted(postedAt) {
  if (!postedAt) return null;
  const t = new Date(postedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 30) return `Posted ${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Posted 1mo ago' : `Posted ${months}mo ago`;
}

// Built-in scorer — used until lib/job-board/match.js is in the tree.
// Same return shape as scoreJob(resume, job): { score 0-100, reasons[] }.
// Plain keyword overlap between the resume and the posting, so every
// reason shown is something the posting actually says.
function fallbackScore(resume, job) {
  if (!resume) return { score: 0, reasons: [] };
  const hay = `${job.title || ''} ${job.description || ''} ${job.category || ''}`.toLowerCase();
  const skills = (resume.skills || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const matched = skills.filter((s) => s && hay.includes(s));
  const reasons = [];
  let score = 0;
  if (matched.length) {
    score += Math.min(70, matched.length * 25);
    reasons.push(`matches ${matched.length} skill${matched.length === 1 ? '' : 's'}: ${matched.slice(0, 4).join(', ')}`);
  }
  const titles = (resume.titles || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  if (titles.some((t) => t && (job.title || '').toLowerCase().includes(t))) {
    score += 20;
    reasons.push('matches a past job title of yours');
  }
  if (job.location && job.location.remote) {
    score += 5;
    reasons.push('remote — no commute');
  }
  if (resume.location && job.location && job.location.city &&
      resume.location.city && job.location.city.toLowerCase() === resume.location.city.toLowerCase()) {
    score += 5;
    reasons.push(`in ${job.location.city}, where your resume puts you`);
  }
  return { score: Math.min(100, score), reasons };
}

function jobLocationLabel(job) {
  if (!job.location) return 'Location not listed';
  if (job.location.remote) return 'Remote';
  const parts = [job.location.city, job.location.region, job.location.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Location not listed';
}

// --- page -----------------------------------------------------------------

export default function JobBoardPage() {
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [sources, setSources] = useState(null);
  const [sourcesError, setSourcesError] = useState('');

  const [resume, setResume] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [rememberResume, setRememberResume] = useState(false);

  const [centre, setCentre] = useState({ ...DEFAULT_CENTRE, from: 'default' });
  const [placeInput, setPlaceInput] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [radiusId, setRadiusId] = useState('25');
  const [geoError, setGeoError] = useState('');
  const geoAskedRef = useRef(false);

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [jobType, setJobType] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [jobSources, setJobSources] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const [savedIds, setSavedIds] = useState([]);
  const matchRef = useRef(null); // scoreJob from lib/job-board/match.js, when present
  const geoRef = useRef(null); // geocodePlace from lib/job-board/geo.js, when present
  const builtImportRef = useRef(false); // ?resume=built import runs once

  // Swap in Worker A's real taxonomy + scorer when the modules exist in
  // the tree. The dynamic import path is built from parts so the build
  // does not hard-fail while lib/job-board/ is still landing — a miss
  // just leaves the built-ins in place.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tax = await import('@/lib/job-board/' + 'taxonomy.js');
        if (alive && Array.isArray(tax.CATEGORIES) && tax.CATEGORIES.length) setCategories(tax.CATEGORIES);
      } catch {
        /* taxonomy not in the tree yet — built-in grid stands in */
      }
      try {
        const m = await import('@/lib/job-board/' + 'match.js');
        if (alive && typeof m.scoreJob === 'function') matchRef.current = m.scoreJob;
      } catch {
        /* scorer not in the tree yet — built-in scorer stands in */
      }
      try {
        const g = await import('@/lib/job-board/' + 'geo.js');
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
        const res = await fetch('/api/job-board/sources');
        if (!res.ok) throw new Error(`sources returned ${res.status}`);
        const data = await res.json();
        if (alive) setSources(Array.isArray(data) ? data : data.sources || []);
      } catch (e) {
        if (alive) setSourcesError('The source list is not available yet — the Job Board’s sources are still being connected.');
      }
    })();
    return () => { alive = false; };
  }, []);

  // Saved jobs + remembered resume, from this device only.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
      if (Array.isArray(saved)) setSavedIds(saved);
      const stored = window.localStorage.getItem(RESUME_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setResume(parsed);
          setRememberResume(true);
        }
      }
    } catch {
      /* private mode / no storage — the page still works */
    }
  }, []);

  const persistResume = useCallback((next) => {
    setResume(next);
    try {
      if (next) window.localStorage.setItem(RESUME_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(RESUME_KEY);
    } catch {
      /* storage unavailable — state still holds it for this visit */
    }
  }, []);

  const scoreJob = useCallback((job) => {
    if (!resume) return { score: 0, reasons: [] };
    try {
      if (matchRef.current) return matchRef.current(resume, job);
    } catch {
      /* fall through to the built-in scorer */
    }
    return fallbackScore(resume, job);
  }, [resume]);

  const liveSourceCount = useMemo(
    () => (sources || []).filter((s) => s.status === 'live').length,
    [sources],
  );

  // --- search -------------------------------------------------------------

  const runSearch = useCallback(async (overrides = {}) => {
    const q = overrides.keyword !== undefined ? overrides.keyword : keyword;
    const cat = overrides.category !== undefined ? overrides.category : category;
    const type = overrides.jobType !== undefined ? overrides.jobType : jobType;
    const remote = overrides.remoteOnly !== undefined ? overrides.remoteOnly : remoteOnly;
    const rad = overrides.radiusId !== undefined ? overrides.radiusId : radiusId;
    const ctr = overrides.centre !== undefined ? overrides.centre : centre;
    const minSal = overrides.minSalary !== undefined ? overrides.minSalary : minSalary;

    const radius = RADIUS_OPTIONS.find((r) => r.id === rad) || RADIUS_OPTIONS[2];
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (cat) params.set('category', cat);
    if (type) params.set('type', type);
    if (remote) params.set('remote', 'true');
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
    // Send the resume along (trimmed — no raw text) so the server scores
    // and ranks server-side; the page still scores client-side as a
    // fallback when the server returns unscored jobs.
    const res = overrides.resume !== undefined ? overrides.resume : resume;
    if (res) {
      params.set('resume', JSON.stringify({
        skills: res.skills || [],
        titles: res.titles || [],
        experienceYears: res.experienceYears ?? 0,
        education: res.education || [],
        location: res.location || null,
        locationCoords: ctr && ctr.lat != null ? { lat: ctr.lat, lon: ctr.lon } : null,
      }));
    }

    setSearching(true);
    setSearchError('');
    try {
      const res2 = await fetch(`/api/job-board/search?${params.toString()}`);
      if (!res2.ok) throw new Error(`search returned ${res2.status}`);
      const data = await res2.json();
      let list = Array.isArray(data.jobs) ? data.jobs : [];
      // Province / country scopes: the API lifts the distance cap but
      // does not region-filter, so the page does that part itself, on
      // real results, when the centre's region/country is known.
      if (radius.scope === 'province' && ctr && ctr.region) {
        const want = String(ctr.region).toLowerCase();
        list = list.filter((j) => !j.location || !j.location.region || String(j.location.region).toLowerCase() === want || (j.location && j.location.remote));
      }
      if (radius.scope === 'country' && ctr && ctr.country) {
        const want = String(ctr.country).toLowerCase();
        list = list.filter((j) => !j.location || !j.location.country || String(j.location.country).toLowerCase() === want || (j.location && j.location.remote));
      }
      // Salary minimum is a client-side filter (the search contract
      // carries no salary param): drop postings below the floor.
      const floor = Number(minSal);
      if (Number.isFinite(floor) && floor > 0) {
        list = list.filter((j) => {
          if (!j.salary || j.salary.min == null) return false;
          const hourly = j.salary.unit === 'year' ? j.salary.min / 2080
            : j.salary.unit === 'month' ? j.salary.min / 173
            : j.salary.min;
          return hourly >= floor;
        });
      }
      setJobs(list);
      setJobSources(Array.isArray(data.sources) ? data.sources : []);
      setHasSearched(true);
    } catch (e) {
      setSearchError('Job search is not live yet — the sources are still being connected. Your resume and filters stay on this page; try again once the board is wired up.');
      setJobs([]);
    } finally {
      setSearching(false);
    }
  }, [keyword, category, jobType, remoteOnly, radiusId, centre, minSalary, resume]);

  // A radius change re-filters the current search, once one has run.
  const changeRadius = useCallback((nextId) => {
    setRadiusId(nextId);
    if (hasSearched) runSearch({ radiusId: nextId });
  }, [hasSearched, runSearch]);

  const searchCategory = useCallback((catId) => {
    setCategory(catId);
    const cat = categories.find((c) => c.id === catId);
    if (cat && cat.keywords && cat.keywords[0] && !keyword.trim()) setKeyword(cat.keywords[0]);
    runSearch({ category: catId });
    document.getElementById('job-board-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [categories, keyword, runSearch]);

  // --- resume ---------------------------------------------------------------

  const applyParsedResume = useCallback((parsed) => {
    if (!parsed || typeof parsed !== 'object') {
      setResumeError('That resume came back empty — try the paste box instead.');
      return;
    }
    const clean = {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      experienceYears: parsed.experienceYears ?? null,
      education: Array.isArray(parsed.education) ? parsed.education : [],
      location: parsed.location || null,
      rawText: parsed.rawText || '',
    };
    if (rememberResume) persistResume(clean);
    else setResume(clean);
    setResumeError('');
  }, [rememberResume, persistResume]);

  // Import a resume built in the in-house Resume Builder: the builder
  // sends the user back here with ?resume=built, and the autosaved
  // template lives in localStorage under 'resume-template'. Render it to
  // plain text, parse it through the normal parse route, and load it
  // through applyParsedResume. Runs once (ref guard); the param is
  // stripped with replaceState so a refresh does not re-import.
  useEffect(() => {
    if (builtImportRef.current) return;
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    if (params.get('resume') !== 'built') return;
    builtImportRef.current = true;
    const stripParam = () => {
      try {
        params.delete('resume');
        const qs = params.toString();
        window.history.replaceState(
          null, '',
          `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`,
        );
      } catch { /* ignore */ }
    };
    (async () => {
      try {
        const raw = window.localStorage.getItem('resume-template');
        if (!raw) throw new Error('no built resume on this device');
        const stored = JSON.parse(raw);
        if (!stored || !stored.data || typeof stored.data !== 'object') {
          throw new Error('no built resume on this device');
        }
        const text = resumeTemplateToText(stored.data);
        const res = await fetch('/api/job-board/parse-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error((errBody && errBody.error) || `parse returned ${res.status}`);
        }
        const data = await res.json();
        if (!data || !data.resume) throw new Error('parse came back empty');
        applyParsedResume(data.resume);
      } catch {
        setResumeError("Couldn't bring your built resume over — try the upload or paste box instead.");
      } finally {
        stripParam();
      }
    })();
  }, [applyParsedResume]);

  const parseResumeFile = useCallback(async (file) => {
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      setResumeError('That file is over the 5 MB limit — try a shorter resume or paste the text instead.');
      return;
    }
    setResumeBusy(true);
    setResumeError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/job-board/parse-resume', { method: 'POST', body: form });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error((errBody && errBody.error) || `parse returned ${res.status}`);
      }
      const data = await res.json();
      setResumeFileName(file.name);
      applyParsedResume(data.resume || data);
    } catch (e) {
      setResumeError(e && e.message && !/parse returned/.test(e.message)
        ? e.message
        : 'Resume parsing is not live yet — the parser is still being connected. You can paste your resume text below and try again, or type your skills in by hand.');
    } finally {
      setResumeBusy(false);
    }
  }, [applyParsedResume]);

  const parseResumeText = useCallback(async () => {
    if (!resumeText.trim()) {
      setResumeError('Paste your resume text first, or choose a file above.');
      return;
    }
    setResumeBusy(true);
    setResumeError('');
    try {
      const res = await fetch('/api/job-board/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: resumeText }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error((errBody && errBody.error) || `parse returned ${res.status}`);
      }
      const data = await res.json();
      setResumeFileName('');
      applyParsedResume(data.resume || data);
    } catch (e) {
      setResumeError(e && e.message && !/parse returned/.test(e.message)
        ? e.message
        : 'Resume parsing is not live yet — the parser is still being connected. Try again once it is wired up.');
    } finally {
      setResumeBusy(false);
    }
  }, [resumeText, applyParsedResume]);

  const updateResumeField = useCallback((field, value) => {
    setResume((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (rememberResume) {
        try { window.localStorage.setItem(RESUME_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [rememberResume]);

  const clearResume = useCallback(() => {
    setResume(null);
    setResumeFileName('');
    setResumeText('');
    try { window.localStorage.removeItem(RESUME_KEY); } catch { /* ignore */ }
  }, []);

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
    // Nominatim via lib/job-board/geo.js when it is in the tree). A hit
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

  // --- saved jobs ---------------------------------------------------------------

  const toggleSave = useCallback((jobId) => {
    setSavedIds((prev) => {
      const next = prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId];
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // --- derived ------------------------------------------------------------------

  const scoredJobs = useMemo(() => {
    if (!resume) return jobs.map((j) => ({ job: j, score: 0, reasons: [] }));
    // The server scores when the resume rode along (job.match); the
    // client scorer is the fallback for unscored jobs.
    return jobs
      .map((j) => (j.match && typeof j.match.score === 'number'
        ? { job: j, score: j.match.score, reasons: j.match.reasons || [] }
        : { job: j, ...scoreJob(j) }))
      .sort((a, b) => b.score - a.score);
  }, [jobs, resume, scoreJob]);

  const matchesForYou = useMemo(
    () => (resume ? scoredJobs.filter((s) => s.score > 0) : []),
    [resume, scoredJobs],
  );

  // The rest: everything not already shown under Matches for you, so no
  // job ever appears twice on the page.
  const restJobs = useMemo(
    () => (resume ? scoredJobs.filter((s) => s.score === 0) : scoredJobs),
    [resume, scoredJobs],
  );

  const centreLabel = radiusId === 'anywhere' ? 'Anywhere' : `Near ${centre.label}`;
  const radius = RADIUS_OPTIONS.find((r) => r.id === radiusId) || RADIUS_OPTIONS[2];

  // --- render -----------------------------------------------------------------

  return (
    <main style={styles.page}>
      <img src={BACKGROUND_IMAGE_SRC} alt="" aria-hidden="true" data-testid="job-board-background" style={styles.bgImg} />
      <div style={styles.wrap}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.mark} aria-hidden="true">Ω</div>
          <div>
            <h1 style={styles.title}>Job Board</h1>
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

        {/* Resume */}
        <section style={styles.card} aria-label="Your resume">
          <h2 style={styles.h2}>Your resume</h2>
          <p style={styles.note}>
            Upload your resume and the board ranks real openings against it.
            Your resume stays yours — it is never shared with employers or
            job sources; it only ranks jobs on your screen.
          </p>
          <label style={styles.fileLabel} htmlFor="job-board-resume-file">
            Choose a resume file (PDF, DOCX or TXT, up to 5 MB)
          </label>
          <input
            id="job-board-resume-file"
            data-testid="resume-file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => parseResumeFile(e.target.files && e.target.files[0])}
            disabled={resumeBusy}
            style={styles.fileInput}
          />
          {resumeFileName ? <p style={styles.note}>File: {resumeFileName}</p> : null}
          <p style={styles.or}>or paste your resume text:</p>
          <textarea
            data-testid="resume-text"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={5}
            placeholder="Paste your resume here…"
            style={styles.textarea}
          />
          <div style={styles.row}>
            <button type="button" data-testid="parse-resume" onClick={parseResumeText} disabled={resumeBusy} style={styles.buttonPrimary}>
              {resumeBusy ? 'Reading resume…' : 'Read my resume'}
            </button>
            {resume ? (
              <button type="button" onClick={clearResume} style={styles.buttonGhost}>Clear resume</button>
            ) : null}
          </div>
          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={rememberResume}
              onChange={(e) => {
                const on = e.target.checked;
                setRememberResume(on);
                try {
                  if (on && resume) window.localStorage.setItem(RESUME_KEY, JSON.stringify(resume));
                  if (!on) window.localStorage.removeItem(RESUME_KEY);
                } catch { /* ignore */ }
              }}
            />
            <span>Remember my resume on this device (off by default)</span>
          </label>
          {resumeError ? <p role="alert" style={styles.error}>{resumeError}</p> : null}

          <div style={{ marginTop: 14 }}>
            <p style={styles.note}>
              Don&rsquo;t have a resume? Build one with our Resume Builder —
              it saves on this device, and you can send it straight back here.
            </p>
            <a
              href="/resume?return=/job-board"
              data-testid="build-resume-link"
              style={{ ...styles.buttonGhost, display: 'inline-block', textDecoration: 'none' }}
            >
              Build a resume
            </a>
          </div>

          {resume ? (
            <div style={styles.resumeBox} data-testid="parsed-resume">
              <h3 style={styles.h3}>Your resume, as read — fix anything wrong</h3>
              <label style={styles.fieldLabel}>
                Skills (comma-separated)
                <input
                  data-testid="resume-skills"
                  type="text"
                  value={(resume.skills || []).join(', ')}
                  onChange={(e) => updateResumeField('skills', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  style={styles.input}
                />
              </label>
              <label style={styles.fieldLabel}>
                Past job titles (comma-separated)
                <input
                  data-testid="resume-titles"
                  type="text"
                  value={(resume.titles || []).join(', ')}
                  onChange={(e) => updateResumeField('titles', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  style={styles.input}
                />
              </label>
              <label style={styles.fieldLabel}>
                Years of experience
                <input
                  data-testid="resume-experience"
                  type="number"
                  min="0"
                  max="60"
                  value={resume.experienceYears ?? ''}
                  onChange={(e) => updateResumeField('experienceYears', e.target.value === '' ? null : Number(e.target.value))}
                  style={styles.input}
                />
              </label>
              <label style={styles.fieldLabel}>
                Education (comma-separated)
                <input
                  data-testid="resume-education"
                  type="text"
                  value={(resume.education || []).join(', ')}
                  onChange={(e) => updateResumeField('education', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  style={styles.input}
                />
              </label>
              <label style={styles.fieldLabel}>
                Location
                <input
                  data-testid="resume-location"
                  type="text"
                  value={resume.location ? [resume.location.city, resume.location.region, resume.location.country].filter(Boolean).join(', ') : ''}
                  onChange={(e) => {
                    const parts = e.target.value.split(',').map((s) => s.trim());
                    updateResumeField('location', { city: parts[0] || null, region: parts[1] || null, country: parts[2] || null });
                  }}
                  placeholder="City, Province, Country"
                  style={styles.input}
                />
              </label>
            </div>
          ) : null}
        </section>

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
        <section style={styles.card} aria-label="Search jobs">
          <h2 style={styles.h2}>Search jobs</h2>
          <label style={styles.fieldLabel}>
            Keywords
            <input
              data-testid="search-keywords"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
              placeholder="e.g. welder, nurse, driver"
              style={styles.input}
            />
          </label>
          <div style={styles.grid2}>
            <label style={styles.fieldLabel}>
              Job type
              <select data-testid="search-type" value={jobType} onChange={(e) => setJobType(e.target.value)} style={styles.input}>
                {JOB_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <label style={styles.fieldLabel}>
              Minimum pay ($/hr)
              <input
                data-testid="search-min-salary"
                type="number"
                min="0"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="e.g. 25"
                style={styles.input}
              />
            </label>
          </div>
          <label style={styles.checkRow}>
            <input
              type="checkbox"
              data-testid="search-remote-only"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
            />
            <span>Remote only</span>
          </label>
          {category ? (
            <p style={styles.note}>
              Category: <strong>{(categories.find((c) => c.id === category) || {}).label || category}</strong>
              {' '}<button type="button" onClick={() => { setCategory(''); if (hasSearched) runSearch({ category: '' }); }} style={styles.linkButton}>clear</button>
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
        <section style={styles.card} aria-label="Results" id="job-board-results">
          <h2 style={styles.h2}>
            {hasSearched ? `${jobs.length} job${jobs.length === 1 ? '' : 's'}` : 'Results'}
          </h2>
          {jobSources.length ? (
            <p style={styles.note}>
              {jobSources.map((s) => `${s.id}: ${s.count != null ? `${s.count} found` : s.error || s.status}`).join(' · ')}
            </p>
          ) : null}

          {resume && matchesForYou.length > 0 ? (
            <div data-testid="matches-for-you">
              <h3 style={styles.h3}>Matches for you</h3>
              <p style={styles.note}>Ranked by how well each opening fits your resume.</p>
              {matchesForYou.map(({ job, score, reasons }) => (
                <JobRow
                  key={job.id}
                  job={job}
                  score={score}
                  reasons={reasons}
                  centre={centre}
                  radiusId={radiusId}
                  saved={savedIds.includes(job.id)}
                  onToggleSave={() => toggleSave(job.id)}
                />
              ))}
            </div>
          ) : null}

          {!hasSearched && !searching ? (
            <p style={styles.note}>Search above, or pick a category below, to see real openings from the live sources.</p>
          ) : null}
          {hasSearched && jobs.length === 0 && !searching && !searchError ? (
            <p style={styles.note}>No jobs matched — try widening the distance, clearing the category, or dropping the pay floor.</p>
          ) : null}
          {hasSearched && resume && matchesForYou.length > 0 && restJobs.length > 0 ? (
            <h3 style={styles.h3}>More results</h3>
          ) : null}
          <div data-testid="results-list">
            {restJobs.map(({ job, score, reasons }) => (
              <JobRow
                key={job.id}
                job={job}
                score={resume ? score : null}
                reasons={resume ? reasons : []}
                centre={centre}
                radiusId={radiusId}
                saved={savedIds.includes(job.id)}
                onToggleSave={() => toggleSave(job.id)}
              />
            ))}
          </div>
        </section>

        {/* Browse by category */}
        <section style={styles.card} aria-label="Browse by category">
          <h2 style={styles.h2}>Browse by category</h2>
          <p style={styles.note}>Tap a category to search it.</p>
          <div style={styles.catGrid}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-testid={`category-${cat.id}`}
                onClick={() => searchCategory(cat.id)}
                style={category === cat.id ? styles.catActive : styles.cat}
              >
                {categoryImageSrc(cat.id) ? (
                  <img src={categoryImageSrc(cat.id)} alt="" data-testid={`category-image-${cat.id}`} style={styles.catImg} />
                ) : null}
                <span style={styles.catLabel}>{cat.label}</span>
                <span style={styles.catSub}>{(cat.subcategories || []).slice(0, 3).map((s) => (typeof s === 'string' ? s : s.label)).join(' · ')}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Sources */}
        <section style={styles.card} aria-label="Sources">
          <h2 style={styles.h2}>Sources</h2>
          <p style={styles.note}>
            Every board the Job Board searches. A source marked staged is not
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

// --- one job row ------------------------------------------------------------

function JobRow({ job, score, reasons, centre, radiusId, saved, onToggleSave }) {
  const distKm = job.location && job.location.lat != null && centre && centre.lat != null
    ? haversineKm(centre, job.location)
    : null;
  const distance = job.location && job.location.remote
    ? 'Remote'
    : radiusId === 'anywhere'
      ? null
      : formatDistance(distKm);
  const salary = formatSalary(job.salary);
  const posted = relativePosted(job.postedAt);
  const thumbSrc = categoryImageSrc(job.category);
  return (
    <article style={styles.job} data-testid={`job-${job.id}`}>
      <div style={styles.jobMedia}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="" data-testid={`job-thumb-${job.category}`} style={styles.jobThumb} />
        ) : null}
        <div style={styles.jobMain}>
      <div style={styles.jobTop}>
        <h3 style={styles.jobTitle}>{job.title}</h3>
        {score != null ? (
          <span style={score >= 70 ? styles.badgeHigh : score >= 40 ? styles.badgeMid : styles.badgeLow} data-testid="match-score">
            {score}% match
          </span>
        ) : null}
      </div>
      {reasons && reasons.length ? (
        <p style={styles.reasons} data-testid="match-reasons">{reasons.join(' — ')}</p>
      ) : null}
      <p style={styles.jobMeta}>
        {job.company || 'Company not listed'}
        {' · '}
        {jobLocationLabel(job)}
        {distance ? ` (${distance})` : ''}
      </p>
      <p style={styles.jobMeta}>
        {[posted, salary, job.category].filter(Boolean).join(' · ')}
      </p>
      {job.description ? <p style={styles.jobDesc}>{job.description.slice(0, 220)}{job.description.length > 220 ? '…' : ''}</p> : null}
      {job.attribution ? (
        <p style={styles.attribution}>
          {typeof job.attribution === 'object' && job.attribution.url ? (
            <a href={job.attribution.url} target="_blank" rel="noopener noreferrer" style={styles.attributionLink}>
              {job.attribution.label || 'Listings by Adzuna'}
            </a>
          ) : (
            String(job.attribution)
          )}
        </p>
      ) : null}
      <div style={styles.row}>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="apply-link"
          style={styles.buttonPrimary}
        >
          Apply on {job.source || 'source site'}
        </a>
        <button
          type="button"
          data-testid="save-job"
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
  or: { margin: '12px 0 6px', color: MUTED, fontSize: 14 },
  error: { margin: '12px 0 0', color: '#ffb4a2', fontSize: 14, lineHeight: 1.5 },
  fileLabel: { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 },
  fileInput: { width: '100%', boxSizing: 'border-box', color: TEXT, fontSize: 14, marginBottom: 4 },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#0d0d1f', color: TEXT, border: `1px solid ${INDIGO_LINE}`, borderRadius: 10, padding: 10, fontSize: 14, fontFamily: 'inherit' },
  input: { width: '100%', boxSizing: 'border-box', background: '#0d0d1f', color: TEXT, border: `1px solid ${INDIGO_LINE}`, borderRadius: 10, padding: '10px 12px', fontSize: 15, marginTop: 4 },
  fieldLabel: { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  checkRow: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '8px 0', cursor: 'pointer' },
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
  resumeBox: { borderTop: `1px solid ${INDIGO_LINE}`, marginTop: 16, paddingTop: 4 },
  catGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  cat: { background: '#0d0d1f', border: `1px solid ${INDIGO_LINE}`, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer', color: TEXT },
  catActive: { background: '#3a2f10', border: `1px solid ${GOLD}`, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer', color: TEXT },
  catLabel: { display: 'block', fontSize: 15, fontWeight: 700 },
  // Category graphic, full width of the card above the label. Fixed 3:2
  // aspect (the art is 900x600) so the grid never shifts as images load.
  catImg: { display: 'block', width: '100%', height: 'auto', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8, marginBottom: 8 },
  catSub: { display: 'block', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.4 },
  sourceRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: `1px solid ${INDIGO_LINE}` },
  sourceBody: { flex: 1, fontSize: 14, lineHeight: 1.45 },
  sourceKind: { color: MUTED },
  sourceGap: { margin: '4px 0 0', color: '#ffcf99', fontSize: 13 },
  sourceNote: { margin: '4px 0 0', color: GOLD_SOFT, fontSize: 13 },
  dotLive: { width: 12, height: 12, borderRadius: '50%', background: '#3ddc84', marginTop: 4, flexShrink: 0 },
  dotStaged: { width: 12, height: 12, borderRadius: '50%', background: '#ffb020', marginTop: 4, flexShrink: 0 },
  job: { borderTop: `1px solid ${INDIGO_LINE}`, padding: '14px 0 6px' },
  jobTop: { display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' },
  jobTitle: { margin: 0, fontSize: 16, lineHeight: 1.35, flex: 1 },
  badgeHigh: { background: '#14532d', color: '#86efac', borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeMid: { background: '#3a2f10', color: GOLD_SOFT, borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeLow: { background: '#262640', color: MUTED, borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  reasons: { margin: '6px 0 0', color: GOLD_SOFT, fontSize: 13, lineHeight: 1.45 },
  jobMeta: { margin: '6px 0 0', color: MUTED, fontSize: 14, lineHeight: 1.45 },
  jobDesc: { margin: '8px 0 10px', color: TEXT, fontSize: 14, lineHeight: 1.5 },
  attribution: { margin: '2px 0 10px', fontSize: 12, color: MUTED },
  attributionLink: { color: GOLD_SOFT },
  // Thumb row: the category thumb sits left of the title/meta column,
  // in normal flow — it never overlaps anything, it just widens the
  // card's first row by its own 72 px.
  jobMedia: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  jobMain: { flex: 1, minWidth: 0 },
  jobThumb: { width: 72, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
};
