// tests/datasheets-zustand-hooks.mjs — resolve-hook helper for
// tests/world-engine-datasheets.test.mjs only.
//
// lib/world-engine/zustand-hooks.mjs maps bare 'zustand' imports to the
// master launcher worktree, which does not exist in this checkout (so
// lib/world-engine/test-store.mjs currently fails here too — pre-existing,
// not caused by the datasheets). This hook maps to the zustand copy
// already installed in THIS repo's node_modules instead. It is used by
// exactly one test file; it does not change the shared hook.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZUSTAND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'zustand'
);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'zustand') {
    return { url: pathToFileURL(`${ZUSTAND_DIR}/esm/index.mjs`).href, shortCircuit: true };
  }
  if (specifier === 'zustand/middleware') {
    return { url: pathToFileURL(`${ZUSTAND_DIR}/esm/middleware.mjs`).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
