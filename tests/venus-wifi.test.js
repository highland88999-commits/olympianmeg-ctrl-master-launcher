// tests/venus-wifi.test.js
// Headless tests for the ARtemis_NAV module. Run: node tests/venus-wifi.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';

const src = readFileSync('app/venus-wifi/page.jsx', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- content ---
t('renders the system core header', /SYSTEM_CORE_v3/.test(src));
t('has waypoint search and scan', /ENTER VECTOR/.test(src) && /Scan/.test(src));
t('has voice input', /Voice input/.test(src));
t('has GPS position lock', /Engage GPS \/ Position Lock/.test(src));
t('has waypoint vault with save', /WAYPOINT VAULT/.test(src) && /Waypoint name/.test(src));
t('supports route locking with distance and bearing', /ROUTE LOCKED/.test(src) && /haversineKm/.test(src) && /bearingDeg/.test(src));
t('tactical radar is a local canvas', /getContext\('2d'\)/.test(src) && /radar rings|sweep/.test(src));
t('waypoints persist locally', /venus-waypoints/.test(src));
t('works offline notice shown', /Offline console/.test(src));

// --- audit: no external maps, geocoding, or tracking ---
t('no central_telemetry', !/central_telemetry/.test(src));
t('no ipify', !/ipify/.test(src));
t('no supabase', !/supabase/i.test(src));
t('no leaflet or routing machine', !/leaflet|L\.Routing/i.test(src));
t('no OSM tiles or nominatim', !/openstreetmap|nominatim/i.test(src));
t('no external URLs at all', !/https?:\/\//.test(src));
t('no tracking scripts', !/logBrainAction|track_ping|nexus_visitor_id|createClient/.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
