// lib/world-engine/weapon-builder.js — CoD-level procedural weapon builder
// for the World Engine weapon forge.
//
// Builds three detailed military-grade firearm archetypes in Three.js,
// matching the ENYO standard: assault rifle, SMG, precision rifle. Every
// forged weapon carries the gold Omega manufacturer's mark.
// Zero external assets; modest poly counts for phones.
//
// buildWeapon(THREE, params) -> THREE.Group, muzzle toward -Z, origin at
// the receiver. Params are sanitized defensively here AND clamped upstream
// by lib/world-engine/aesthetic.js — hostile values can never reach the
// geometry code in a dangerous shape.

import { makeOmegaDecal } from '@/lib/omega-brand';

export const WEAPON_TYPES = ['rifle', 'smg', 'precision'];

function sanitizeParams(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const weaponType = WEAPON_TYPES.includes(p.weaponType) ? p.weaponType : 'rifle';
  const finishColor = typeof p.finishColor === 'string' && /^#[0-9A-F]{6}$/i.test(p.finishColor)
    ? p.finishColor
    : '#1c1f26';
  const barrelLength = Number.isFinite(+p.barrelLength)
    ? Math.max(0.3, Math.min(2.0, +p.barrelLength))
    : 0.9;
  const opticType = ['iron', 'red-dot', 'scope', 'none'].includes(p.opticType)
    ? p.opticType
    : weaponType === 'smg' ? 'red-dot' : weaponType === 'precision' ? 'scope' : 'iron';
  const stockType = ['telescoping', 'wire', 'precision', 'none'].includes(p.stockType)
    ? p.stockType
    : weaponType === 'smg' ? 'wire' : weaponType === 'precision' ? 'precision' : 'telescoping';
  return { weaponType, finishColor, barrelLength, opticType, stockType };
}

export function buildWeapon(THREE, rawParams) {
  const { weaponType, finishColor, barrelLength, opticType, stockType } = sanitizeParams(rawParams);
  // Barrel scale factor: 0.9m reference -> 0.6x..1.4x subgroup stretch.
  const bk = Math.max(0.6, Math.min(1.4, barrelLength / 0.9));

  const g = new THREE.Group();
  const finish = new THREE.Color(finishColor);
  const dark = new THREE.MeshStandardMaterial({ color: finish, roughness: 0.5, metalness: 0.6 });
  const poly = new THREE.MeshStandardMaterial({
    color: finish.clone().multiplyScalar(0.55), roughness: 0.7, metalness: 0.3,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.35, metalness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.3, metalness: 0.9 });

  const M = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cylZ = (r1, r2, len, seg) => {
    const geo = new THREE.CylinderGeometry(r1, r2, len, seg || 12);
    geo.rotateX(Math.PI / 2);
    return geo;
  };
  // Barrel assembly in its own subgroup so barrelLength stretches it cleanly.
  const barrelAssembly = (parts) => {
    const bg = new THREE.Group();
    parts.forEach((m) => bg.add(m));
    bg.scale.z = bk;
    return bg;
  };

  if (weaponType === 'rifle') {
    // --- receiver ---
    g.add(M(box(0.09, 0.14, 0.42), dark, 0, 0, 0.02));
    // --- top Picatinny rail + ridges ---
    g.add(M(box(0.045, 0.025, 0.5), steel, 0, 0.085, -0.02));
    for (let i = 0; i < 9; i++) g.add(M(box(0.05, 0.015, 0.02), steel, 0, 0.1, -0.24 + i * 0.055));
    // --- octagonal handguard ---
    g.add(M(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8).rotateX(Math.PI / 2), poly, 0, 0.01, -0.32));
    // --- barrel + muzzle brake (stretches with barrelLength) ---
    const bg = barrelAssembly([
      M(cylZ(0.022, 0.022, 0.16), steel, 0, 0, -0.08),
      M(box(0.06, 0.06, 0.1), dark, 0, 0, -0.21),
      M(box(0.07, 0.02, 0.06), poly, 0, 0, -0.21),
    ]);
    bg.position.set(0, 0.01, -0.47);
    g.add(bg);
    // --- optics ---
    if (opticType === 'iron') {
      g.add(M(box(0.015, 0.05, 0.015), dark, 0, 0.125, -0.42));
      g.add(M(box(0.05, 0.05, 0.02), dark, 0, 0.12, 0.16));
    } else if (opticType === 'red-dot') {
      g.add(M(cylZ(0.03, 0.03, 0.1), dark, 0, 0.115, 0.02));
      g.add(M(cylZ(0.024, 0.024, 0.005), new THREE.MeshBasicMaterial({ color: 0xff2222 }), 0, 0.115, 0.068));
      g.add(M(box(0.02, 0.04, 0.06), dark, 0, 0.09, 0.02));
    } else if (opticType === 'scope') {
      g.add(M(box(0.03, 0.04, 0.04), steel, 0, 0.1, 0.0));
      g.add(M(box(0.03, 0.04, 0.04), steel, 0, 0.1, 0.14));
      g.add(M(cylZ(0.035, 0.035, 0.24), dark, 0, 0.14, 0.07));
      g.add(M(cylZ(0.045, 0.035, 0.07), dark, 0, 0.14, -0.07));
    }
    // --- charging handle + ejection port ---
    g.add(M(box(0.07, 0.02, 0.04), steel, 0, 0.08, 0.22));
    g.add(M(box(0.005, 0.05, 0.12), poly, 0.046, 0.01, 0.0));
    // --- curved 30-round magazine (3 segments) ---
    const mag1 = M(box(0.055, 0.1, 0.09), poly, 0, -0.11, -0.02); mag1.rotation.x = 0.15;
    const mag2 = M(box(0.055, 0.1, 0.09), poly, 0, -0.19, 0.0); mag2.rotation.x = 0.3;
    const mag3 = M(box(0.055, 0.09, 0.09), poly, 0, -0.26, 0.03); mag3.rotation.x = 0.45;
    g.add(mag1, mag2, mag3);
    // --- pistol grip + trigger ---
    const grip = M(box(0.06, 0.16, 0.08), poly, 0, -0.13, 0.14); grip.rotation.x = 0.35;
    g.add(grip);
    g.add(M(box(0.02, 0.02, 0.12), dark, 0, -0.085, 0.06));
    g.add(M(box(0.015, 0.05, 0.02), steel, 0, -0.07, 0.05));
    // --- foregrip ---
    const fg = M(box(0.05, 0.14, 0.06), poly, 0, -0.11, -0.3); fg.rotation.x = -0.1;
    g.add(fg);
    // --- stock ---
    if (stockType !== 'none') {
      g.add(M(cylZ(0.025, 0.025, 0.18), steel, 0, 0.0, 0.3));
      g.add(M(box(0.07, 0.12, 0.22), poly, 0, -0.01, 0.38));
      g.add(M(box(0.075, 0.14, 0.03), dark, 0, -0.01, 0.49));
      g.add(M(box(0.075, 0.02, 0.02), gold, 0, 0.045, 0.38)); // gold buttplate pin
    }
    // --- gold Omega: receiver left (manufacturer mark) + stock ---
    const d1 = makeOmegaDecal(THREE, 0.085); d1.position.set(-0.0465, 0.0, 0.02); g.add(d1);
    const d2 = makeOmegaDecal(THREE, 0.05); d2.position.set(-0.0365, -0.01, 0.38); g.add(d2);
  } else if (weaponType === 'smg') {
    // --- receiver ---
    g.add(M(box(0.08, 0.12, 0.34), dark, 0, 0, 0.05));
    // --- top rail ---
    g.add(M(box(0.04, 0.02, 0.36), steel, 0, 0.07, 0.03));
    for (let i = 0; i < 7; i++) g.add(M(box(0.045, 0.012, 0.018), steel, 0, 0.082, -0.12 + i * 0.05));
    // --- optics ---
    if (opticType === 'red-dot') {
      g.add(M(cylZ(0.03, 0.03, 0.1), dark, 0, 0.115, 0.02));
      g.add(M(cylZ(0.024, 0.024, 0.005), new THREE.MeshBasicMaterial({ color: 0xff2222 }), 0, 0.115, 0.068));
      g.add(M(box(0.02, 0.04, 0.06), dark, 0, 0.09, 0.02));
    } else if (opticType === 'iron') {
      g.add(M(box(0.015, 0.04, 0.015), dark, 0, 0.1, -0.1));
      g.add(M(box(0.04, 0.04, 0.02), dark, 0, 0.095, 0.14));
    }
    // --- suppressor (stretches with barrelLength) ---
    const bg = barrelAssembly([
      M(cylZ(0.035, 0.035, 0.22), dark, 0, 0, -0.11),
      M(new THREE.TorusGeometry(0.035, 0.008, 8, 16), steel, 0, 0, -0.03),
      M(new THREE.TorusGeometry(0.035, 0.008, 8, 16), steel, 0, 0, -0.17),
    ]);
    bg.position.set(0, 0.0, -0.17);
    g.add(bg);
    // --- extended stick magazine ---
    const smag = M(box(0.05, 0.26, 0.07), poly, 0, -0.18, 0.02); smag.rotation.x = 0.12;
    g.add(smag);
    g.add(M(box(0.055, 0.03, 0.075), dark, 0, -0.305, 0.035));
    // --- grip + trigger + foregrip ---
    const sgrip = M(box(0.055, 0.14, 0.07), poly, 0, -0.12, 0.16); sgrip.rotation.x = 0.3;
    g.add(sgrip);
    g.add(M(box(0.015, 0.02, 0.1), dark, 0, -0.07, 0.1));
    g.add(M(box(0.045, 0.12, 0.05), poly, 0, -0.1, -0.12));
    // --- wire stock ---
    if (stockType !== 'none') {
      g.add(M(cylZ(0.012, 0.012, 0.2), steel, -0.025, 0.01, 0.3));
      g.add(M(cylZ(0.012, 0.012, 0.2), steel, 0.025, 0.01, 0.3));
      g.add(M(box(0.08, 0.13, 0.025), poly, 0, 0.0, 0.4));
      g.add(M(box(0.02, 0.02, 0.02), gold, 0, 0.05, 0.4)); // gold stock pin
    }
    // --- gold Omega: receiver left + mag well ---
    const d1 = makeOmegaDecal(THREE, 0.075); d1.position.set(-0.0415, 0.0, 0.05); g.add(d1);
    const d2 = makeOmegaDecal(THREE, 0.045); d2.position.set(-0.0265, -0.14, 0.02); g.add(d2);
  } else {
    // --- precision rifle ---
    g.add(M(box(0.09, 0.13, 0.4), dark, 0, 0, 0.1));
    // --- heavy fluted barrel + muzzle brake (stretches with barrelLength) ---
    const barrelParts = [
      M(cylZ(0.02, 0.02, 0.75), steel, 0, 0, -0.375),
      M(cylZ(0.035, 0.035, 0.12), dark, 0, 0, -0.81),
      M(box(0.075, 0.02, 0.08), poly, 0, 0, -0.81),
    ];
    for (const rz of [-0.2, -0.35, -0.5]) {
      barrelParts.push(M(new THREE.TorusGeometry(0.021, 0.006, 8, 16), dark, 0, 0, rz));
    }
    const bg = barrelAssembly(barrelParts);
    bg.position.set(0, 0.01, -0.1);
    g.add(bg);
    // --- scope (unless explicitly none) ---
    if (opticType !== 'none') {
      g.add(M(box(0.03, 0.05, 0.04), steel, 0, 0.1, -0.05));
      g.add(M(box(0.03, 0.05, 0.04), steel, 0, 0.1, 0.15));
      g.add(M(cylZ(0.04, 0.04, 0.3), dark, 0, 0.145, 0.05));
      g.add(M(cylZ(0.055, 0.045, 0.1), dark, 0, 0.145, -0.14));
      g.add(M(cylZ(0.035, 0.04, 0.08), poly, 0, 0.145, 0.23));
      g.add(M(cylZ(0.05, 0.05, 0.015), new THREE.MeshBasicMaterial({ color: 0x1a2a3a }), 0, 0.145, 0.272));
      g.add(M(box(0.03, 0.04, 0.03), steel, 0, 0.2, 0.05)); // elevation turret
      const wt = M(cylZ(0.02, 0.02, 0.03), steel, 0.055, 0.145, 0.05); wt.rotation.z = Math.PI / 2; g.add(wt);
      g.add(M(box(0.025, 0.02, 0.025), gold, 0, 0.222, 0.05)); // gold turret cap
    }
    // --- bolt handle ---
    const bolt = M(cylZ(0.012, 0.012, 0.06), steel, 0.07, 0.03, 0.12); bolt.rotation.z = Math.PI / 2;
    g.add(bolt);
    g.add(M(new THREE.SphereGeometry(0.02, 10, 8), poly, 0.105, 0.03, 0.12));
    // --- bipod ---
    for (const s of [-1, 1]) {
      const leg = M(box(0.03, 0.22, 0.03), steel, s * 0.06, -0.14, -0.5);
      leg.rotation.z = s * 0.35;
      g.add(leg);
      g.add(M(box(0.05, 0.03, 0.08), poly, s * 0.1, -0.245, -0.5));
    }
    // --- precision stock ---
    if (stockType !== 'none') {
      g.add(M(box(0.075, 0.11, 0.3), poly, 0, -0.02, 0.36));
      g.add(M(box(0.06, 0.05, 0.16), dark, 0, 0.055, 0.36));
      g.add(M(box(0.08, 0.13, 0.03), dark, 0, -0.02, 0.51));
    }
    // --- magazine + trigger ---
    g.add(M(box(0.06, 0.1, 0.1), poly, 0, -0.11, 0.05));
    g.add(M(box(0.015, 0.05, 0.02), steel, 0, -0.075, 0.14));
    // --- gold Omega: receiver left + scope tube left ---
    const d1 = makeOmegaDecal(THREE, 0.085); d1.position.set(-0.0465, 0.0, 0.1); g.add(d1);
    const d2 = makeOmegaDecal(THREE, 0.055); d2.position.set(-0.0415, 0.145, 0.05); g.add(d2);
  }

  return g;
}
