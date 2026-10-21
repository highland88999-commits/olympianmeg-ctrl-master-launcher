// lib/bike-flight.js
// Mounted TRON-bike flight kinematics for the hub scene. Pure math on plain
// {x,y,z} objects — no three.js — so the flight model is headless-testable
// and the component stays a thin wiring layer.
//
// Model: the bike has a heading (yaw, 0 = nose +Z), a forward speed, and a
// vertical speed. W/S (or joystick up/down) throttle; A/D (or joystick
// left/right) steer. The FLIGHT AXIS toggle switches W/S between
// forward/reverse (horizontal) and climb/descend (vertical).

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createBikeFlightState(parkPos, yaw = 0) {
  return {
    pos: { x: parkPos[0], y: parkPos[1], z: parkPos[2] },
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
export function stepBikeFlight(st, input, dt, T) {
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);

  // Steering always yaws the bike. Convention is the RIDER's point of view
  // (Merlin's report, 2026-10-21: "right make user turn right"): the rider
  // faces the nose (+Z at yaw 0), and in three.js' right-handed frame a
  // rider facing +Z has their right hand toward −X — so a RIGHT turn
  // rotates the nose from +Z toward −X, which is DECREASING rotation.y.
  // This line previously ADDED steer to yaw, swinging the nose toward +X
  // (the rider's left): every input path (keyboard, joystick) felt
  // inverted because they all share this one model.
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
export function bikeForward(yaw) {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

/** Rotate a rider/camera offset by the bike's yaw. */
export function rotateOffsetByYaw(offset, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: offset.x * c + offset.z * s,
    y: offset.y,
    z: -offset.x * s + offset.z * c,
  };
}
