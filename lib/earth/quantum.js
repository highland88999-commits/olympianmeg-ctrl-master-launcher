// lib/earth/quantum.js — the Quantum Realm master switch.
//
// Merlin (2026-10-22): "Get rid of the quantum realm on earth in the
// hub for now." — FOR NOW. Nothing quantum is deleted: the parachute
// shrink machinery (lib/earth/parachute.js), the QuantumSkyDome, the
// MicroGroundDisc and the hub's QuantumGate seal all stay in the
// tree, fully wired and tested. This flag gates the ENTRY points
// only:
//   - app/page.jsx parachuteTo() — the funnel every shrink entry
//     runs through (the EarthConsole Quantum door, and the globe's
//     double-click / double-tap tile handlers via onParachute)
//   - the EarthConsole 🔬 Quantum Realm button (hidden while off)
//   - the NexusEarth QuantumSkyDome + MicroGroundDisc mounts
//   - the HomeScene QuantumGate seal (renders its children straight
//     through while off, so the hub can never be sealed away)
// Normal Earth — dive, street level, swimming, bike, walker — never
// reads this flag and behaves exactly as before.
//
// RE-ENABLE: flip this one constant to true. Every gated path comes
// back exactly as it was; that is the whole point of the flag.
export const QUANTUM_ENABLED = false;
