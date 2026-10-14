// Test-harness three wrap: re-export the REAL three (the repo's own
// dependency), with only WebGLRenderer stubbed — rendering is not
// under test; every game-logic line of the real engine runs
// unmodified against the real three math/scene classes.
import * as REAL from '../../node_modules/three/build/three.module.js';

export * from '../../node_modules/three/build/three.module.js';

export class WebGLRenderer {
  constructor() { this.domElement = null; }
  setPixelRatio() {}
  setSize() {}
  render() {}
  dispose() {}
}
// keep every other export identical to the real module
export const __real = REAL;
