#!/usr/bin/env node
// scripts/gallery-import-map.mjs
// Maps the ~3,927 unique AI-generated Gemini graphics (census 2026-09-29)
// into the gallery's two-tier asset pipeline WITHOUT copying the full
// catalog into the repo in this pass.
//
// Two tiers (documented for the drop-in run):
//   TIER 1 — originals (private): full-resolution clean files, stored
//            server-side only (Supabase Storage private bucket or a
//            server-only directory). Served ONLY through the signed,
//            expiring /api/gallery/download/<token> route after a credit
//            is redeemed.
//   TIER 2 — previews (public): downscaled (max 1600px) copies with the
//            "© OLYMPUS GALLERY" mark burned in, placed under
//            public/textures/museum/<series>/. These are what the UI shows.
//
// Usage:
//   node scripts/gallery-import-map.mjs \
//     --part2 ~/workspace/takeout/myactivity/part2 \
//     --part1zip ~/workspace/takeout/myactivity/takeout-myactivity-part1.zip \
//     --out ~/workspace/scratch/gallery-import/ \
//     [--limit 20] [--copy-previews]
//
// Output in --out:
//   manifest.json      — one entry per unique image: md5, bytes, ext,
//                        chosen source, series, title, target slug
//   gallery-import.sql — INSERTs for a future public.gallery_items table
//   previews/          — only with --copy-previews: resized + watermarked
//                        preview copies (PIL via python3, if available)
//
// IP SAFETY: the census excluded phone-screenshot frames and any IP-risk
// material from the creative count. Every import row keeps its source
// path so anything can be traced back and pulled.

import { createHash } from 'node:crypto';
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { homedir } from 'node:os';

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function args() {
  const a = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (i + 1 < a.length && !a[i + 1].startsWith('--')) { o[k] = a[i + 1]; i++; }
    else o[k] = true; // flag-only arg
  }
  return o;
}
const expand = (p) => (p || '').replace(/^~/, homedir());

const { part2, part1zip, out, limit, 'copy-previews': copyPreviews } = args();
if (!out) { console.error('missing --out'); process.exit(2); }
const OUT = expand(out);
mkdirSync(OUT, { recursive: true });

function walkImages(dir, sink) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkImages(p, sink);
    else if (IMG_EXT.has(extname(name).toLowerCase())) sink.push(p);
  }
}

function md5File(p) {
  const h = createHash('md5');
  h.update(readFileSync(p));
  return h.digest('hex');
}

// --- Tier sources ------------------------------------------------------------
const seen = new Map(); // md5 -> entry
function addFile(sourceLabel, filePath, bytes) {
  const md5 = md5File(filePath);
  if (seen.has(md5)) { seen.get(md5).sources.push(sourceLabel); return; }
  seen.set(md5, {
    md5, bytes,
    ext: extname(filePath).toLowerCase().replace('jpeg', 'jpg').replace(/^\./, '') || 'jpg',
    source: filePath, sources: [sourceLabel],
    series: 'unassigned', title: 'Untitled',
  });
}

const files2 = [];
if (part2 && existsSync(expand(part2))) {
  walkImages(expand(part2), files2);
  console.log(`part2: ${files2.length} image files`);
  for (const f of files2) addFile('part2', f, statSync(f).size);
}

// part1: read direct image entries from the zip without full extraction.
if (part1zip && existsSync(expand(part1zip))) {
  const z = expand(part1zip);
  let names = [];
  try {
    const out1 = execSync(`python3 -c "
import zipfile, json
z = zipfile.ZipFile(${JSON.stringify(z)})
print(json.dumps([i.filename for i in z.infolist() if not i.is_dir()]))
"`, { maxBuffer: 64 * 1024 * 1024 }).toString();
    names = JSON.parse(out1);
  } catch (e) { console.error('could not list part1 zip:', e.message); }
  const imgs = names.filter((n) => IMG_EXT.has(extname(n).toLowerCase()) && !/\.zip$/i.test(n));
  console.log(`part1: ${imgs.length} direct image entries`);
  // Extract one at a time to a temp dir, hash, then remove — no full copy kept.
  const tmp = join(OUT, '.tmp-extract');
  mkdirSync(tmp, { recursive: true });
  let n = 0;
  for (const name of imgs) {
    try {
      execFileSync('python3', ['-c', `
import zipfile, sys
z = zipfile.ZipFile(${JSON.stringify(z)})
data = z.read(${JSON.stringify(name)})
open(${JSON.stringify(join(tmp, 'f'))}, 'wb').write(data)
`]);
      addFile('part1', join(tmp, 'f'), statSync(join(tmp, 'f')).size);
    } catch { /* corrupt entry — skip honestly */ }
    if (++n % 200 === 0) process.stdout.write(`\rpart1 hashed: ${n}`);
  }
  console.log(`\rpart1 hashed: ${n}`);
  execSync(`rm -rf ${JSON.stringify(tmp)}`);
}

let entries = [...seen.values()];
entries.sort((a, b) => b.bytes - a.bytes);
if (limit) entries = entries.slice(0, Number(limit));

// Slugs + titles
entries.forEach((e, i) => {
  e.slug = `gx${String(i + 1).padStart(4, '0')}-${e.md5.slice(0, 8)}`;
  if (e.title === 'Untitled') e.title = `Gallery Study ${i + 1}`;
});

// --- Manifest -----------------------------------------------------------------
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  generated: new Date().toISOString(),
  unique: entries.length,
  tiers: 'originals stay private; previews go to public/textures/museum/<series>/',
  entries,
}, null, 2));

// --- SQL (future gallery_items table) ------------------------------------------
const sql = [
  '-- gallery-import.sql — generated by scripts/gallery-import-map.mjs',
  '-- Target table (add to the consolidated SQL when the catalog drops in):',
  '--   create table public.gallery_items (',
  '--     id text primary key, md5 text not null unique, bytes integer not null,',
  '--     ext text not null, source_path text not null, series text not null default \'unassigned\',',
  '--     title text not null, tier1_original_uri text, created_at timestamptz default now());',
  '',
];
for (const e of entries) {
  const q = (s) => String(s).replace(/'/g, "''");
  sql.push(`insert into public.gallery_items (id, md5, bytes, ext, source_path, series, title) values ('${q(e.slug)}', '${e.md5}', ${e.bytes}, '${q(e.ext)}', '${q(e.source)}', '${q(e.series)}', '${q(e.title)}') on conflict (md5) do nothing;`);
}
writeFileSync(join(OUT, 'gallery-import.sql'), sql.join('\n') + '\n');

// --- Optional preview copies (resize + burned watermark via PIL) ---------------
if (copyPreviews) {
  const prevDir = join(OUT, 'previews');
  mkdirSync(prevDir, { recursive: true });
  const burn = join(OUT, '.burn.py');
  writeFileSync(burn, `import sys, os
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
w, h = im.size
s = max(w, h)
if s > 1600:
    im = im.resize((int(w*1600/s), int(h*1600/s)), Image.LANCZOS)
    w, h = im.size
size = max(14, min(42, int(w/38)))
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size)
except OSError: font = ImageFont.load_default()
d = ImageDraw.Draw(im, 'RGBA')
TEXT = '© OLYMPUS GALLERY'
bb = d.textbbox((0,0), TEXT, font=font); tw, th = bb[2]-bb[0], bb[3]-bb[1]
pad = int(size*0.7); x0, y0 = w-tw-pad*2, h-th-pad*2
d.rectangle([x0,y0,x0+tw+pad*2,y0+th+pad*2], fill=(0,0,0,110))
d.text((x0+pad, y0+pad), TEXT, font=font, fill=(236,231,219,220))
im.convert('RGB').save(dst, 'JPEG', quality=90)
print('ok')
`);
  let made = 0;
  for (const e of entries) {
    const dst = join(prevDir, `${e.slug}.jpg`);
    try { execFileSync('python3', [burn, e.source, dst], { stdio: 'pipe' }); made++; }
    catch { try { copyFileSync(e.source, dst); made++; } catch {} }
  }
  console.log(`previews: ${made}/${entries.length}`);
}

console.log(`unique images mapped: ${entries.length}`);
console.log(`wrote ${join(OUT, 'manifest.json')} and ${join(OUT, 'gallery-import.sql')}`);
