// tests/housing-architecture.test.js
// Headless tests for the Tensegrity Housing module. Run: node tests/housing-architecture.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';

const src = readFileSync('app/housing-architecture/page.jsx', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- content ---
t('renders the habitat title', /Tensegrity Habitat/.test(src));
t('has structural dimensions table', /Structural Dimensions/.test(src) && /Total Height/.test(src));
t('has material specifications', /Material Specifications/.test(src) && /Compression Struts/.test(src));
t('has supplier categories', /Supplier Categories/.test(src));
t('has the 6 installation steps', /Sequential Installation Methodology/.test(src) && /Modular Core Levitation/.test(src) && /Enclosure &amp; Commissioning|Enclosure & Commissioning/.test(src));
t('has the interactive build checklist', /Build Checklist/.test(src) && /housing-checklist/.test(src));
t('checklist shows progress', /role="progressbar"/.test(src));
t('hero is a procedural canvas net', /getContext\('2d'\)/.test(src) && /buildNet|struts/.test(src));

// --- audit: no external assets or tracking ---
t('no catbox video', !/catbox/.test(src));
t('no font-awesome CDN', !/font-awesome|fa-solid/.test(src));
t('no tailwind CDN', !/cdn\.tailwindcss/.test(src));
t('no Google fonts', !/fonts\.googleapis/.test(src));
t('no external URLs at all', !/https?:\/\//.test(src));
t('no telemetry', !/central_telemetry|ipify|supabase|logBrainAction|track_ping/i.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
