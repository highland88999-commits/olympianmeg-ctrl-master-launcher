// lib/hub-glider-flight.js
// Mounted solar-sail glider flight kinematics for the hub scene.
// Pure math on plain {x,y,z} objects — no three.js — so the flight
// model is headless-testable and the component stays a thin wiring
// layer.
//
// Model: same shape as the hub bike (lib/bike-flight.js) — a heading
// (yaw, 0 = nose +Z), a forward speed, and a vertical speed. W/S (or
// joystick up/down) throttles; A/D (or joystick left/right) steers.
// The FLIGHT AXIS toggle switches W/S between forward/reverse
// (horizontal) and climb/descend (vertical). The steering sign is the
// bike's rider's-eye convention (right turn = decreasing yaw), so
// every input path feels the same on the bike and the glider.
//
// TUNING (Merlin, Nov 27, 2026 — the glider is a sail, not a rocket):
// the hub disc is 245.7 units to its edge and the rings run out to
// ~1965, so the glider must still cover ground — but it is the
// scenic sail, not the travel vehicle, so it sits below the bike's
// 150 cruise. 110 crosses the hub disc in ~4.5 s at cruise and
// reaches the asteroid belt (~420 out) in ~8 s: fast and sail-like,
// still controllable. Turn rate 1.4 (bike 1.7) — a sail banks into
// its turns instead of snapping. Accel 120 (bike 170) — a sail
// picks up speed gradually, no rocket punch. Climb 70 (bike 95) —
// a sail climbs slower than it runs. Reverse 30 — sails barely
// reverse at all.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The glider's flight tuning — see the header for the reasoning. */
export const GLIDER_TUNING = {
  maxSpeed: 110, // full-throttle cruise
  reverseSpeed: 30, // gentle reverse — sails barely reverse
  climbSpeed: 70, // vertical-axis W/S
  accel: 120, // throttle ramp — a sail picks up gradually
  brake: 200, // release/S braking
  turnRate: 1.4, // rad/s steering — lazier than the bike's 1.7
};

export function createGliderFlightState(pos, yaw = 0) {
  return {
    pos: { x: pos[0], y: pos[1], z: pos[2] },
    yaw,
    speed: 0, // forward (+)/reverse (−), units/s
    vertSpeed: 0, // climb (+)/descend (−), units/s
  };
}

/**
 * Advance the flight state by dt seconds.
 * input: { throttle: -1..1, steer: -1..1 (+ = right), vertical: bool }
 * T: tuning { maxSpeed, reverseSpeed, climbSpeed, accel, brake, turnRate }
 * Mutates and returns st.
 */
export function stepGliderFlight(st, input, dt, T) {
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);

  // Same rider's-eye convention as the bike: a RIGHT turn rotates
  // the nose from +Z toward −X, which is DECREASING rotation.y.
  st.yaw -= steer * T.turnRate * dt;

  if (input.vertical) {
    // Vertical axis: W/S climbs/dives; horizontal speed coasts to a stop.
    const targetV = throttle * T.climbSpeed;
    st.vertSpeed += clamp(targetV - st.vertSpeed, -T.accel * dt, T.accel * dt);
    st.speed += clamp(0 - st.speed, -T.brake * dt, T.brake * dt);
  } else {
    // Horizontal axis: W/S drives forward/reverse; vertical speed decays.
    const target = throttle >= 0 ? throttle * T.maxSpeed : throttle * T.reverseSpeed;
    const rate = Math.abs(target) > Math.abs(st.speed) ? T.accel : T.brake;
    st.speed += clamp(target - st.speed, -rate * dt, rate * dt);
    st.vertSpeed += clamp(0 - st.vertSpeed, -T.brake * dt, T.brake * dt);
  }

  const fx = Math.sin(st.yaw);
  const fz = Math.cos(st.yaw);
  st.pos.x += fx * st.speed * dt;
  st.pos.z += fz * st.speed * dt;
  st.pos.y += st.vertSpeed * dt;
  return st;
}

/** Forward unit vector for a heading yaw. */
export function gliderForward(yaw) {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}
