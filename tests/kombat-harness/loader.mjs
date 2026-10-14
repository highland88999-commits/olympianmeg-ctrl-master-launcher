// Test-harness loader (kombat-player-specials suite): redirect the
// bare 'three' specifier to the wrap in this folder so the whole
// module graph shares ONE copy of the real three classes — with
// WebGLRenderer stubbed, because no GL context exists in Node.
// Registered from the test file via node:module.register BEFORE the
// engine is imported; nothing here ships in the app bundle.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return {
      url: new URL('./three-wrap.mjs', import.meta.url).href,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}
