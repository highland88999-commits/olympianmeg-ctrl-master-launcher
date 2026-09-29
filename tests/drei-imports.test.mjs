// tests/drei-imports.test.mjs
// Regression test for the /persephone production crash (2026-09-29):
// components/persephone/HallScene.jsx imported { useReducedMotion } from
// '@react-three/drei', but drei@9 does NOT export that name. Webpack leaves
// a missing ESM named export as `undefined` with only a build warning, so
// `npm run build` stayed green while every browser render threw
// "TypeError: useReducedMotion is not a function" into the Next.js error
// boundary ("Application error: a client-side exception has occurred").
//
// This test fails the suite if ANY source file imports a name that the
// installed @react-three/drei / @react-three/fiber does not actually export.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const CHECKED_PACKAGES = ['@react-three/drei', '@react-three/fiber'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(extname(name))) yield full;
  }
}

// import { A, B } from 'pkg'  /  import { A as B } from 'pkg'
const NAMED_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;

function namedImportsOf(source) {
  const out = [];
  let m;
  NAMED_IMPORT_RE.lastIndex = 0;
  while ((m = NAMED_IMPORT_RE.exec(source)) !== null) {
    const [, names, pkg] = m;
    if (!CHECKED_PACKAGES.includes(pkg)) continue;
    for (const part of names.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) out.push({ pkg, name });
    }
  }
  return out;
}

describe('r3f named imports resolve to real exports', () => {
  const pkgExports = {};
  const pkgTypeDecls = {};
  for (const pkg of CHECKED_PACKAGES) {
    // eslint-disable-next-line import/no-dynamic-require
    pkgExports[pkg] = require(pkg);
    // Type-only imports in .ts/.tsx files are elided by SWC (e.g. fiber's
    // ThreeEvent, used only as a type in TargetingGrid.tsx), so a name that
    // is a declared *type* export is fine there too. Scan every .d.ts in the
    // package (excluding nested node_modules) for the type declaration.
    const dtsRoot = join(ROOT, 'node_modules', pkg);
    let declText = '';
    for (const f of walk(dtsRoot)) {
      if (f.endsWith('.d.ts')) {
        try { declText += readFileSync(f, 'utf8') + '\n'; } catch { /* skip */ }
      }
    }
    pkgTypeDecls[pkg] = declText;
  }

  function isTypeExport(pkg, name) {
    // matches: export declare type X, export type { X }, export interface X
    const re = new RegExp(`export\\s+(declare\\s+)?(type|interface)\\s+${name}\\b|export\\s+type\\s*\\{[^}]*\\b${name}\\b`, 'm');
    return re.test(pkgTypeDecls[pkg]);
  }

  const missing = [];
  let checkedFiles = 0;
  let checkedImports = 0;
  function scan(dir) {
    for (const file of walk(dir)) {
      checkedFiles++;
      const isTs = /\.tsx?$/.test(file);
      for (const { pkg, name } of namedImportsOf(readFileSync(file, 'utf8'))) {
        checkedImports++;
        if (typeof pkgExports[pkg][name] !== 'undefined') continue;
        if (isTs && isTypeExport(pkg, name)) continue; // elided type-only import
        missing.push(`${file}: ${name} is not exported by ${pkg}`);
      }
    }
  }
  scan(join(ROOT, 'components'));
  scan(join(ROOT, 'app'));

  it(`checked ${checkedImports} named imports across ${checkedFiles} files`, () => {
    assert.ok(checkedImports > 0, 'expected to find at least one r3f named import');
  });

  it('every named drei/fiber import exists in the installed package', () => {
    assert.deepEqual(missing, [], `missing exports:\n${missing.join('\n')}`);
  });
});
