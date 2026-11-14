// lib/auction/species.js
// Species databases in the Auction House — pure catalogue + pricing law.
// No imports, no I/O — safe to unit-test in plain Node.
//
// The species files are HOUSE files, not World Engine forge assets:
// they are repeatable downloads, not unique items that change hands.
// That is why they do NOT live in `auction_listings` — the buy-now flow
// there transfers a unique asset and closes the listing after ONE sale,
// which would end a file after its first buyer. Instead the house shows
// them on their own Species tab (the Land Tiles precedent: a browse
// category with its own panel, not a forge category), and the download
// API (app/api/auction/species) enforces the price rule server-side.
//
// PRICING (Merlin, 2026-11-12, standing rule): the first 20 downloads
// of EACH FILE are free, then $5.00 USD per download. The counter is
// GLOBAL per file — the first 20 people to download a file get it free,
// then everyone pays $5.00. (If Merlin meant per-user instead, the
// counter table would key on (file_key, user_id) — a one-line change;
// the panel copy says "first 20 downloads" so the meaning is visible.)

export const SPECIES_BUCKET = 'species-files';

/** Free downloads per file, worldwide, before the $5 price starts. */
export const SPECIES_FREE_DOWNLOADS = 20;

/** Price of one download once the free 20 are gone, in integer cents. */
export const SPECIES_PRICE_CENTS = 500; // $5.00 USD

/** How long a granted download link stays open (1 hour, like earth2-models). */
export const SPECIES_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * The catalogue. One entry per dataset; one file per row in `files`.
 * `bytes` are the exact on-disk sizes, measured Nov 14 2026. `rows` is
 * the COL25 accepted-species count every dataset shares; `sheets` is the
 * workbook sheet count (26 everywhere — verified from each XLSX).
 * `storageKey` is the object's key inside the `species-files` bucket —
 * the upload step places each file there; until it lands, the file shows
 * as unavailable and the download API refuses honestly.
 * Anatomy is `coming-soon`: its files are being built by a parallel
 * agent and do not exist yet. Its entry appears in the house now, greyed
 * out, and flips live the moment its files land in the bucket — the
 * download API checks the bucket, so no code change is needed.
 */
export const SPECIES_DATASETS = [
  {
    id: 'naming',
    title: 'Species — The Complete List',
    description:
      'Every accepted species on Earth, from the Catalogue of Life 2025. Names, authorship, kingdom down to genus, distribution and realms — 2,137,451 species: 1,986,228 living, 151,223 extinct.',
    rows: 2137451,
    sheets: 26,
    coverage: '2,137,451 accepted species',
    status: 'live',
    files: [
      {
        key: 'naming-csv',
        label: 'Complete List — CSV',
        format: 'CSV',
        bytes: 337145808,
        storageKey: 'species/species-complete.csv',
        note: 'The raw spine — one row per species.',
      },
      {
        key: 'naming-xlsx',
        label: 'Complete List — Spreadsheet',
        format: 'XLSX',
        bytes: 212420891,
        storageKey: 'species/species-complete.xlsx',
        note: '26 sheets, one row per species.',
      },
      {
        key: 'naming-pdf',
        label: 'Complete List — PDF',
        format: 'PDF',
        bytes: 211169130,
        storageKey: 'species/species-complete.pdf',
        note: 'The full list as a book.',
      },
    ],
  },
  {
    id: 'characteristics',
    title: 'Species — Characteristics',
    description:
      'Size, colour, diet, habitat, lifespan and more for every species — filled wherever a real source holds a value (EOL TraitBank, PanTHERIA, FishBase); the rest read “Not listed”, nothing guessed.',
    rows: 2137451,
    sheets: 26,
    coverage: 'Size 87,178 · Diet 123,749 · Habitat 390,652 species with a real value',
    status: 'live',
    files: [
      {
        key: 'characteristics-xlsx',
        label: 'Characteristics — Spreadsheet',
        format: 'XLSX',
        bytes: 260000246,
        storageKey: 'species/species-characteristics.xlsx',
        note: '26 sheets, one row per species.',
      },
      {
        key: 'characteristics-pdf',
        label: 'Characteristics — PDF',
        format: 'PDF',
        bytes: 193444255,
        storageKey: 'species/species-characteristics.pdf',
        note: 'The full tables as a book.',
      },
    ],
  },
  {
    id: 'behavior',
    title: 'Species — Behavior',
    description:
      'How each species lives: activity pattern, movement, social behaviour, parental care, reproduction, migration and more. 44,062 species carry at least one real value.',
    rows: 2137451,
    sheets: 26,
    coverage: '44,062 species with at least one real value',
    status: 'live',
    files: [
      {
        key: 'behavior-xlsx',
        label: 'Behavior — Spreadsheet',
        format: 'XLSX',
        bytes: 301786188,
        storageKey: 'species/species-behavior.xlsx',
        note: '26 sheets, one row per species.',
      },
      {
        key: 'behavior-pdf',
        label: 'Behavior — PDF',
        format: 'PDF',
        bytes: 187886706,
        storageKey: 'species/species-behavior.pdf',
        note: 'The full tables as a book.',
      },
    ],
  },
  {
    id: 'movement',
    title: 'Species — Movement & Physics',
    description:
      'How each species moves: body mass, home range, speed, wingspan, dispersal. 16,447 species carry at least one real value.',
    rows: 2137451,
    sheets: 26,
    coverage: '16,447 species with at least one real value',
    status: 'live',
    files: [
      {
        key: 'movement-xlsx',
        label: 'Movement & Physics — Spreadsheet',
        format: 'XLSX',
        bytes: 282599274,
        storageKey: 'species/species-movement.xlsx',
        note: '26 sheets, one row per species.',
      },
      {
        key: 'movement-pdf',
        label: 'Movement & Physics — PDF',
        format: 'PDF',
        bytes: 188017237,
        storageKey: 'species/species-movement.pdf',
        note: 'The full tables as a book.',
      },
    ],
  },
  {
    id: 'sounds',
    title: 'Species — Sounds',
    description:
      'What each species sounds like: 961,002 recordings across 12,798 species — birds, bats, frogs, grasshoppers, land mammals — plus hearing range, echolocation and underwater sound.',
    rows: 2137451,
    sheets: 26,
    coverage: '12,798 species · 961,002 recordings',
    status: 'live',
    files: [
      {
        key: 'sounds-xlsx',
        label: 'Sounds — Spreadsheet',
        format: 'XLSX',
        bytes: 303944312,
        storageKey: 'species/species-sounds.xlsx',
        note: '26 sheets, one row per species.',
      },
      {
        key: 'sounds-pdf',
        label: 'Sounds — PDF',
        format: 'PDF',
        bytes: 186430532,
        storageKey: 'species/species-sounds.pdf',
        note: '36,229 pages, A4 landscape.',
      },
    ],
  },
  {
    id: 'anatomy',
    title: 'Species — Anatomy',
    description:
      'What each species looks like, part by part: body plan, body parts, organs, textures — plus a build map for every species, a blueprint a generation model can follow to build a digital version. The PDF renders each build map; the JSONL is the machine-first twin.',
    rows: 2137451,
    sheets: 26,
    coverage: 'Anatomy + build map for every species',
    status: 'coming-soon',
    files: [
      {
        key: 'anatomy-xlsx',
        label: 'Anatomy — Spreadsheet',
        format: 'XLSX',
        bytes: null,
        storageKey: 'species/species-anatomy.xlsx',
        note: '26 sheets, one row per species.',
      },
      {
        key: 'anatomy-pdf',
        label: 'Anatomy — PDF',
        format: 'PDF',
        bytes: null,
        storageKey: 'species/species-anatomy.pdf',
        note: 'Each species’ build map, rendered.',
      },
      {
        key: 'anatomy-build-map',
        label: 'Anatomy — Build Map',
        format: 'JSONL',
        bytes: null,
        storageKey: 'species/species-build-map.jsonl',
        note: 'One blueprint per species, machine-readable.',
      },
    ],
  },
];

/** Every file in the catalogue, flat, in catalogue order. */
export function speciesAllFiles() {
  return SPECIES_DATASETS.flatMap((d) =>
    d.files.map((f) => ({ ...f, datasetId: d.id, datasetTitle: d.title, datasetStatus: d.status }))
  );
}

/**
 * Look a file up by its key. Returns { file, dataset } or null.
 * The key is the ONLY thing a download request may name — the server
 * never trusts a client-supplied path or URL.
 */
export function speciesFileByKey(key) {
  const k = String(key || '').trim();
  if (!k) return null;
  for (const d of SPECIES_DATASETS) {
    const file = d.files.find((f) => f.key === k);
    if (file) return { file, dataset: d };
  }
  return null;
}

/** Price of the next download of a file, in integer cents: $0 while the free 20 last, $5.00 after. */
export function speciesPriceCents(downloadCount) {
  const n = Math.max(0, Math.round(Number(downloadCount) || 0));
  return n < SPECIES_FREE_DOWNLOADS ? 0 : SPECIES_PRICE_CENTS;
}

/** True while the next download of a file is still one of the free 20. */
export function speciesIsFree(downloadCount) {
  return speciesPriceCents(downloadCount) === 0;
}

/** Free downloads left for a file: 20 at launch, 0 once the price starts. */
export function speciesFreeLeft(downloadCount) {
  const n = Math.max(0, Math.round(Number(downloadCount) || 0));
  return Math.max(0, SPECIES_FREE_DOWNLOADS - n);
}

/** Plain-English file size: 337145808 -> "337.1 MB". */
export function formatSpeciesBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1000) return `${Math.round(n)} B`;
  if (n < 1000000) return `${(n / 1000).toFixed(1)} KB`;
  if (n < 1000000000) return `${(n / 1000000).toFixed(1)} MB`;
  return `${(n / 1000000000).toFixed(2)} GB`;
}

/**
 * Idempotency reference for one paid species download. The purchase id
 * is a server-generated UUID per attempt, so buying the same file twice
 * is two real purchases, never a duplicate — unlike the auction legs,
 * whose reference is per listing and must fire only once.
 */
export function speciesPurchaseRef(fileKey, userId, purchaseId) {
  return `species:buy:${String(fileKey)}:${String(userId)}:${String(purchaseId)}`;
}

/** Idempotency reference for the house's credit on a paid species download. */
export function speciesSaleRef(fileKey, purchaseId) {
  return `species:sale:${String(fileKey)}:${String(purchaseId)}`;
}

/** Idempotency reference for the $1.00 platform fee on a paid species download. */
export function speciesFeeRef(fileKey, purchaseId) {
  return `species:${String(fileKey)}:${String(purchaseId)}`;
}
