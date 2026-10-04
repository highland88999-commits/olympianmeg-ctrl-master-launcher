// app/shadow-realm/race.js — barrier collision + lap counting math.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly.
//
// STANDING GEOMETRY LAW: barriers are solid — the rider BOUNCES/DEFLECTS
// off them and is pushed back inside. resolveBarrier NEVER kills, never
// teleports, never resets speed to zero out of spite: it reflects the
// outward velocity component with restitution and clamps the position to
// the wall face.

// 2D helpers (XZ plane).
export function sub2(a, b) { return { x: a.x - b.x, z: a.z - b.z }; }
export function dot2(a, b) { return a.x * b.x + a.z * b.z; }
export function len2(a) { return Math.hypot(a.x, a.z); }

// Closest point on a closed polyline to pos. Returns { dist, point, nx, nz,
// segIndex } where (nx, nz) is the outward-from-centerline direction at the
// nearest segment (unit length), and segIndex is the segment start index.
export function closestOnPolyline(pos, pts) {
  let best = { dist: Infinity, point: null, nx: 0, nz: 0, segIndex: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ab = sub2(b, a);
    const abLen2 = dot2(ab, ab) || 1e-9;
    let t = dot2(sub2(pos, a), ab) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const p = { x: a.x + ab.x * t, z: a.z + ab.z * t };
    const d = len2(sub2(pos, p));
    if (d < best.dist) {
      // Normal: from centerline toward pos, fallback to segment perp.
      let nx = pos.x - p.x;
      let nz = pos.z - p.z;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-6) {
        nx /= nl;
        nz /= nl;
      } else {
        const sl = Math.hypot(ab.x, ab.z) || 1;
        nx = ab.z / sl;
        nz = -ab.x / sl;
      }
      best = { dist: d, point: p, nx, nz, segIndex: i };
    }
  }
  return best;
}

// resolveBarrier(pos, vel, center, halfW) -> { pos, vel, bounced }.
// pos/vel are mutated copies (inputs untouched). If the rider is outside
// the corridor (|lateral| > halfW), they are pushed back to the wall face
// and the outward velocity component is reflected with restitution 0.55.
// The tangential component is untouched — a graze keeps your speed.
export function resolveBarrier(pos, vel, center, halfW, restitution = 0.55) {
  const near = closestOnPolyline(pos, center);
  const p = { x: pos.x, z: pos.z };
  const v = { x: vel.x, z: vel.z };
  if (near.dist <= halfW) {
    return { pos: p, vel: v, bounced: false };
  }
  // Push back to the wall face.
  const excess = near.dist - halfW;
  p.x -= near.nx * excess;
  p.z -= near.nz * excess;
  // Reflect the outward component (outward = along near.n).
  const outwardSpeed = dot2(v, { x: near.nx, z: near.nz });
  if (outwardSpeed > 0) {
    v.x -= (1 + restitution) * outwardSpeed * near.nx;
    v.z -= (1 + restitution) * outwardSpeed * near.nz;
  }
  return { pos: p, vel: v, bounced: true };
}

// LapTracker — start/finish line at centerline[0], crossed in the loop's
// forward direction. Anti-farm: a lap only counts after the rider has
// passed the midway checkpoint (segment index ~n/2) since the last line
// crossing. Wrong-direction crossings are ignored entirely.
export class LapTracker {
  constructor(center) {
    this.center = center;
    this.n = center.length;
    const p0 = center[0];
    const p1 = center[1];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const l = Math.hypot(dx, dz) || 1;
    this.tx = dx / l; // forward tangent at the line
    this.tz = dz / l;
    // Line direction: segment from inner edge to outer edge at p0 —
    // the normal of the tangent.
    this.lx = p0.x;
    this.lz = p0.z;
    this.ldx = -this.tz;
    this.ldz = this.tx;
    this.reset();
  }

  reset() {
    this.laps = 0;
    // Spawn happens just behind the line: the first forward crossing STARTS
    // the race (starts the clock) but does NOT count a lap. A lap only
    // counts after the rider has gone around (midway checkpoint arms it).
    // (Merlin 2026-10-03: the old armed=true counted the start crossing as
    // a full lap — a 1-lap race "finished" 0.8s after spawn.)
    this.armed = false;
    this.started = false;
    this.prevSide = null;
    this.lastLapTime = null;
    this.lapStart = null;
  }

  // side of the line: sign of cross(lineDir, pos - linePoint).
  side(pos) {
    const rx = pos.x - this.lx;
    const rz = pos.z - this.lz;
    return Math.sign(this.ldx * rz - this.ldz * rx);
  }

  // update(pos, vel, now) -> 'lap' | null. now in seconds.
  //
  // The start/finish LINE is a segment (inner edge to outer edge at
  // centerline[0]), not the infinite line through it — a loop can cross
  // that infinite line twice per lap. So crossings only evaluate while the
  // rider is inside the line gate (segments adjacent to index 0).
  update(pos, vel, now) {
    const near = closestOnPolyline(pos, this.center);
    // Midway checkpoint: arms the next lap.
    const idx = near.segIndex;
    const mid = this.n / 2;
    if (Math.abs(idx - mid) < this.n * 0.08) {
      this.armed = true;
    }
    const atLine = idx <= 2 || idx >= this.n - 2;
    let event = null;
    if (atLine) {
      const s = this.side(pos);
      if (this.prevSide !== null && s !== 0 && s !== this.prevSide) {
        const forward = dot2(vel, { x: this.tx, z: this.tz }) > 0;
        if (forward && !this.started) {
          // Race start: the gun lap. Clock starts, no lap counted.
          this.started = true;
          this.lapStart = now;
        } else if (forward && this.armed) {
          this.laps += 1;
          if (this.lapStart !== null) this.lastLapTime = now - this.lapStart;
          this.lapStart = now;
          this.armed = false;
          event = 'lap';
        }
      }
      if (s !== 0) this.prevSide = s;
    } else {
      this.prevSide = null;
    }
    return event;
  }

  // progress(pos) -> 0..1 around the loop (for HUD mini-map).
  progress(pos) {
    const near = closestOnPolyline(pos, this.center);
    return near.segIndex / this.n;
  }
}
