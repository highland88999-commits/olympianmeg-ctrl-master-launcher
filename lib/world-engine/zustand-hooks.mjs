// Resolve-hook helper for test-store.mjs: maps bare 'zustand' imports to the
// copy already installed in the master launcher worktree, so the real
// useEngineStore.js file (with its static `import ... from 'zustand'`) can be
// exercised under plain node without touching the master worktree.
import { pathToFileURL } from 'node:url';

const ZUSTAND_DIR = '/home/hatch/workspace/github-work/olympianmeg-ctrl-master-launcher/node_modules/zustand';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'zustand') {
    return { url: pathToFileURL(`${ZUSTAND_DIR}/esm/index.mjs`).href, shortCircuit: true };
  }
  if (specifier === 'zustand/middleware') {
    return { url: pathToFileURL(`${ZUSTAND_DIR}/esm/middleware.mjs`).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
