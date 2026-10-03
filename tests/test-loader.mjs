// tests/test-loader.mjs — headless test support.
// Resolves the repo's `@/` path alias to the checkout root so lib modules can
// be imported with plain `node` (no Next.js, no bundler).
// Usage (top of a test file, before any lib imports):
//   import { register } from 'node:module';
//   register(new URL('./test-loader.mjs', import.meta.url));
//   const { something } = await import('../lib/something.js');
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The repo's `@/` imports often omit the extension (Next.js resolves them);
// plain node ESM needs it, so probe for the file.
function probe(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const cand of [base + '.js', base + '.jsx', path.join(base, 'index.js')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@' || specifier.startsWith('@/')) {
    const rel = specifier === '@' ? '' : specifier.slice(2);
    const found = probe(path.join(ROOT, rel));
    if (found) {
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
