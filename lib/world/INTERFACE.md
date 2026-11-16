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
| `controls-core.js` | The UNIVERSAL CONTROLS CORE (pure half): layout constants, hint clock, per-world config, drag-look step. No DOM, no React, no THREE — node-testable in `tests/controls-core.test.mjs`. |
| `components/world/ControlsCore.jsx` | The core's React half: fixed joystick, right column (BACKPACK/JUMP/FIRE), HP/ORBS pill, hint pill, fullscreen orb. Composes WalkJoystick + OrbButton + useOrbDock — never re-implements them. |
| `orb-dock.js` | The ONE shared free-floating draggable orb dock (pure functions, no DOM/React/THREE — node-testable in `tests/orb-dock.test.mjs`). Fractions, 8 px tap-vs-drag, grab offset, live clamp, localStorage + `/api/ui-state`. Hollow Earth (one cluster spot) and Jupiter 2 (one spot per orb, via `components/world/useOrbDock.js`) both use it. |
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

## orb-dock.js

### Key pattern
One key per world: `orbDockStorageKeyFor(world)` → `` `olympus:<world>:orb-dock:v1` ``
(device copy) and `orbDockUiStateKeyFor(world)` → `` `<world>_orb_dock` ``
(`/api/ui-state` account copy). Hollow Earth keeps its own pre-existing
constants (`ORB_DOCK_STORAGE_KEY`, `ORB_DOCK_UI_STATE_KEY`) — same shape,
unchanged. The `/api/ui-state` keys are NOT whitelisted in
`app/api/ui-state/route.js` yet, so the server copy is ignored today and
the device copy stands alone.

### Shapes
- Single spot (Hollow Earth cluster): `{x, y}` fractions via
  `loadOrbDockPosition` / `saveOrbDockPosition` /
  `resolveOrbDockPosition`.
- Per-orb map (Jupiter 2): `{ [orbId]: {x, y} }` via
  `loadOrbDockMap` / `saveOrbDockMap` / `resolveOrbDockMap`.
  Malformed entries are dropped, never trusted; corrupt saves return
  the empty shape, never throw.

### Drag math (all parameterized by key / box size — the Hollow Earth
values are the defaults, never a per-realm fork)
`isOrbDockDrag(dx, dy)` (8 px threshold) · `orbDockFracToPx` /
`orbDockPxToFrac` · `clampOrbDockPx` (8 px edge margin) ·
`dragOrbDockTopLeft` (grab offset kept) · `defaultOrbDockFractions`.

## controls-core.js + components/world/ControlsCore.jsx

The UNIVERSAL CONTROLS CORE (Merlin, Nov 16 ~03:49) — one shared
implementation of the confirmed universal controls. Worlds keep
their own content (vehicles, monsters, art); the controls come
from the core. No per-world copies of the control layer.

### The confirmed layout
- Joystick FIXED bottom-left (`JOYSTICK_HOME` { left 14, bottom 14 }
  + safe-area inset, `JOYSTICK_SIZE` 124) — works, never moves,
  never docked. Shared `WalkJoystick` (x+ = right, y+ = forward).
- Right column, top-to-bottom: BACKPACK / JUMP / FIRE
  (`RIGHT_COLUMN_SLOTS`, `rightColumnHomeSlots(columnBottom)` —
  56 px orbs, 10 px gaps, FIRE on the floor, JUMP above, BACKPACK
  on top). Each orb drags individually through the shared orb dock
  (`useOrbDock(world)` — one `olympus:<world>:orb-dock:v1` key).
  A world with a bottom-right button row parks the column above it
  (`columnBottom` — Earth 3 / Earth 4 pass 80 for their FLY rows).
- ORBS counter orb beside the HP pill, top-left; clicking it opens
  the merchant for upgrades. Only rendered when the world has a
  merchant (`onOpenMerchant`).
- Hint pill fades after 5 s (`CONTROLS_HINT_FADE_MS` 5000, 500 ms
  fade-out — `hintVisibleAt` / `hintOpacityAt`).
- Auto-center recenter (`recenterLookOffset`, `LOOK_RECENTER_RATE`
  0.8) lives in `lib/planet-walker.js` — consumed here, never
  re-implemented. Finger-follows drag-look uses the same shared
  helpers (`lookTurnForDrag`, `dampLookAngle`).
- Per-function button faces: JUMP wears `tron-jump`, FIRE wears
  `tron-fire` (`OrbButton fn=`). BACKPACK and ORBS have no TRON
  face yet — they wear icon + label until one is drawn.

### What a world passes in / what the core owns
`resolveControlsCore({ world, accent, showJoystick, showJump,
showFire, showBackpack, showHpOrbs, showFullscreen, showHint,
columnBottom, hint, hp, orbs })` — every slot is opt-in (only the
joystick defaults on); unknown keys are dropped; `world` is
required. `visibleSlots(config)` / `visibleDockOrbIds(config)`
list the slots the config actually shows. A world with no
backpack, no weapon and no merchant shows a joystick and a JUMP
orb and nothing invented.
The React half takes the same shape as props: `world`, `accent`,
`onMove(x, y)`, `onJump()` (edge, pointerdown), `onFire()` (edge),
`onOpenBackpack()`, `onOpenMerchant()`, `hp`, `orbs`, `hint`,
`fullscreen`, `onToggleFullscreen`, `columnBottom`, `children`
(the world's own extra orbs, caller-positioned).

### dragLookStep — the shared drag-look shape (next pass)
`dragLookStep({ yaw, pitch }, dx, dy, viewportWidthPx, pitchLimit
= 1.25)` — drag right → look right (yaw decreases), drag up →
look up, pitch clamped. The scenes that still run bespoke
drag-look (Earth 3 / Earth 4 / Mars 2: fixed 0.0048 walk / 0.0042
fly rad/px) keep their feel this round — the shared full-swipe
turn (180° per viewport width) changes look speed under the
finger and needs Merlin's phone check before it lands. The
conversion is a one-line call per scene when he says go; the
tap-vs-drag threshold and tap handling stay the scene's own.

### Typical wiring (per world)

```jsx
import ControlsCore from '@/components/world/ControlsCore';

// Inside the stage (position: relative), replacing the world's
// bespoke joystick + JUMP orb. World-specific orbs (FLY, TOUR,
// rover summon…) stay in the page.
<ControlsCore world="new-earth" accent="#7ddf9a"
  onMove={(x, y) => worldRef.current && worldRef.current.setMove(x, y)}
  onJump={mode === 'walk' ? () => worldRef.current && worldRef.current.jump() : undefined}
  hint="Drag to look · stick to move · FLY to soar"
  fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(!fullscreen)}
  columnBottom={80}
/>
```

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
