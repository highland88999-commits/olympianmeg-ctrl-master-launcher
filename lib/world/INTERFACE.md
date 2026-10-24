# lib/world — shared walk-mode interface (STABLE)

Merlin's standard: every explorable 3D world is walkable at ground level.
These modules are the hub's contract. **Additive changes only** — never
rename or remove an export, never change a default constant's meaning.
If you must change behavior, add a new option and document it here.

## Files

| File | Role |
|---|---|
| `walk-controls.js` | Pure movement/look/collision math. No DOM, no three.js. Headless-testable in node. |
| `walk-input.js` | Vanilla DOM bindings: keyboard state, drag-to-look. Attach/detach pairs. |
| `components/world/WalkJoystick.jsx` | Shared React virtual joystick (mobile). Pointer-events, `-1..1` output. |

## walk-controls.js

### Constants
`WALK_EYE` (2.4) · `WALK_SPEED` (10 u/s) · `WALK_SPRINT_MULT` (1.8) ·
`LOOK_SENS` (0.0032 rad/px) · `PITCH_LIMIT` (1.45 rad) ·
`WALK_GRAVITY` (18) · `WALK_JUMP_V` (6)

### createWalker({ x, z, yaw, pitch })
Returns walker state. `pos` is the FEET position; camera goes at `pos.y + eye`.

### stepWalker(w, input, dt, world)
Advances one frame, mutates and returns `w`.
- `input`: `{ fwd: -1..1, strafe: -1..1, sprint: bool, jump: bool }`
  (`jump` is edge-triggered — true for exactly one frame)
- `dt`: seconds since last frame
- `world`: `{ eye, speed, sprintMult, gravity, jumpV, groundHeight(x,z)->y, colliders: [{x,z,r}], bounds, snapY }`
  - `groundHeight` defaults to `() => 0` (flat plane)
  - `snapY: true` (additive, 2026-10-23): `pos.y` = ground + eye + jumpY
    EXACTLY each step — no settle lerp. For analytic-heightfield worlds
    whose walker must track the surface metre-for-metre (Star Wars
    zones); default off keeps the historical settle everywhere else.
  - `bounds`: `{ kind: 'circle'|'ring'|'box', max, min? }`
    - circle/ring: `max` (and `min` for ring) are numbers
    - box: `max` may be a number (`|x|,|z| <= max`) or an `{x, z}` object;
      `min` may be an `{x, z}` object (defaults to `-max` per axis)
- Solid-geometry rule: colliders push out (slide/deflect), bounds contain.
  The walker never passes through geometry.

### applyLook(w, dx, dy, sens)
Pixel deltas → yaw/pitch with clamp. yaw 0 faces −z (three.js convention).

### resolveColliders(pos, colliders) / clampBounds(pos, bounds)
Low-level helpers, exported for reuse and testing.

### walkerCamera(w, world)
Returns `{ x, y, z }` eye-level camera position. Set camera rotation
from `w.yaw`/`w.pitch` with rotation order `'YXZ'`.

## walk-input.js

### createKeyInput()
`{ state, consumeJump(), attach(), detach() }`.
`state` = `{ fwd, strafe, sprint, jump }`. WASD + arrows, Shift = sprint,
Space = jump (edge). `consumeJump()` reads and clears the jump flag.

### attachDragLook(el, { onLook(dx,dy), onTap(x,y), sens })
Mouse drag (desktop) and single-finger drag (touch) look. Quick taps fire
`onTap` so worlds keep tap-to-interact. Returns `detach()`.

## Typical wiring (per world)

```js
import { createWalker, stepWalker, applyLook, walkerCamera } from '@/lib/world/walk-controls';
import { createKeyInput, attachDragLook } from '@/lib/world/walk-input';

const w = createWalker({ x: 0, z: 34, yaw: Math.PI });
const keys = createKeyInput(); keys.attach();
const detachLook = attachDragLook(canvas, { onLook: (dx, dy) => applyLook(w, dx, dy) });
// mobile: <WalkJoystick onMove={(x, y) => { joy.x = x; joy.y = y; }} />

function frame(dt) {
  const jump = keys.consumeJump();
  stepWalker(w, { fwd: keys.state.fwd + joy.y, strafe: keys.state.strafe + joy.x,
                  sprint: keys.state.sprint, jump },
             dt, { groundHeight: myTerrainHeight, colliders: MY_COLLIDERS, bounds: MY_BOUNDS });
  const cam = walkerCamera(w);
  camera.position.set(cam.x, cam.y, cam.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(w.pitch, w.yaw, 0);
}
```
