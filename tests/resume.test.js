// tests/resume.test.js
// Headless tests for the Resume Studio module. Run: node tests/resume.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';

const src = readFileSync('app/resume/page.jsx', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- content ---
t('renders the Resume Studio header', /Resume Studio/.test(src));
t('has professional summary section', /Professional Summary/.test(src));
t('has experience section', /Professional Experience/.test(src));
t('has education and skills sections', /Education &amp; Training|Education & Training/.test(src) && /Skills/.test(src));
t('editable template with print button', /Customize/.test(src) && /Print \/ Save PDF/.test(src));
t('can add and remove positions', /Add position/.test(src) && /Remove position/.test(src));
t('persists edits to localStorage', /resume-template/.test(src));
t('background is a local canvas, not three.js', /getContext\('2d'\)/.test(src));

// --- PII audit: the source resume's personal details must not ship ---
t('no source name', !/Richard High/.test(src));
t('no source street address', !/Redwater|T0A 2W0|4712 49/.test(src));
t('no source email', !/stakeme10000/.test(src));
t('no source phone', !/3688852145|368-885-2145/.test(src));
t('no source employer names', !/L\.I\.D\. Roofing|The Peak Roofing|Kelson Group|Haley Roofing|Chartwell Exteriors|Boston Pizza|Rainbow Wok/.test(src));
t('placeholder contact is generic', /your\.email@example\.com/.test(src));

// --- external requests / telemetry ---
t('no external URLs at all', !/https?:\/\//.test(src));
t('no telemetry', !/central_telemetry|ipify|supabase|logBrainAction|track_ping/i.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
