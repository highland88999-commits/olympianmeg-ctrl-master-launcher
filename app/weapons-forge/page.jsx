'use client';

// app/weapons-forge/page.jsx
// THE WEAPONS FORGE (Merlin, 2026-10-23) — seated under
// HEPHAESTUS / TOOLS in the master portal. Travellers forge
// weapons here and the weapons land in their BACKPACK (the pack
// in their profile that follows them into every realm). Every
// weapon on the shelf carries its reticle — the forge stamps it
// at creation (the reticle law, lib/backpack/backpack.js) — and
// its CGI: meta.cgi = { model, firing } from the shared spec
// (lib/weapons/cgi.js), stamped beside the reticle, so the gun
// system can render the real model and fire it the way the spec
// says. The shelf shows a live Three.js preview of each weapon's
// model on one shared stage (GLB where the spec says glb,
// procedural otherwise).
//
// Prices: gold bars (the refinery's currency — the balance of
// record is the refinery save, read + settled by
// /api/weapons-forge) plus backpack materials — fossil specimens
// and blood sacs gathered on Earth 2. Forging is a signed-in act:
// the server validates the price against the account's own
// records before the weapon is shelved.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  FORGE_WEAPONS,
  forgeAffordability,
  forgeMaterialStock,
  forgeWeaponById,
  forgeWeaponReticle,
} from '@/lib/backpack/weapons';
import { cgiForWeapon, normaliseWeaponGroup } from '@/lib/weapons/cgi';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { PATRONS, PATRON_IDS } from '@/lib/backpack/patrons';
import {
  flushBackpack,
  replaceBackpackRecord,
  useBackpack,
} from '@/lib/backpack/store';
import MuseEngineChat from '@/components/muse/MuseEngineChat';

const RETICLE_GLYPH = { crosshair: '✛', dot: '•', chevron: '»' };

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_CLASS = {
  common: 'text-neutral-300 border-white/20',
  uncommon: 'text-green-200 border-green-300/30',
  rare: 'text-sky-200 border-sky-300/30',
  epic: 'text-purple-200 border-purple-300/30',
  legendary: 'text-amber-200 border-amber-300/40',
};

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

function newIdemKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `forge-${crypto.randomUUID()}`;
  } catch { /* fall through */ }
  return `forge-${Date.now().toString(36)}-${Math.floor(Math.random() * 4294967296).toString(36)}`;
}

function costLabel(weapon) {
  const parts = [];
  if (weapon.cost.bars > 0) parts.push(`🧱 ${weapon.cost.bars} bars`);
  for (const m of weapon.cost.materials) {
    parts.push(m.item === 'fossil' ? `🦴 ${m.qty} fossil${m.qty > 1 ? 's' : ''}` : `🩸 ${m.qty} blood sac${m.qty > 1 ? 's' : ''}`);
  }
  return parts.length ? parts.join(' · ') : 'Free';
}

/** One short line for a CGI spec, for the forge/commission
 *  notices: "GLB model · bullet at 350 m/s". */
function cgiLine(cgi) {
  if (!cgi || !cgi.model || !cgi.firing) return '';
  const model = cgi.model.kind === 'glb' ? 'GLB model' : `procedural ${cgi.model.build}`;
  return ` CGI: ${model} · ${cgi.firing.kind} ${cgi.firing.speedMps} m/s.`;
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

/**
 * The procedural builds named by lib/weapons/cgi.js — small
 * THREE-primitive stand-ins for weapons with no GLB (and for
 * AI-commissioned weapons, known only by class). Each build
 * stands ~1 unit tall around the origin so the viewer can frame
 * it the same way it frames a GLB.
 */
function buildProcedural(THREE, build) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.85, roughness: 0.35 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x4a4d55, metalness: 0.8, roughness: 0.45 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, metalness: 0.1, roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5230, metalness: 0.05, roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xb78cff, emissive: 0x8a5cff, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.4 });
  const box = (w, h, d, mat, x = 0, y = 0, z = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, rx = 0, rz = 0, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  const cone = (r, h, mat, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  const ball = (r, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (build === 'bow') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 10, 32, Math.PI), wood);
    g.add(arc);
    cyl(0.008, 0.008, 0.9, grip, 0, 0, 0, 0, Math.PI / 2, 6); // the string
    box(0.05, 0.16, 0.05, grip, 0, 0, 0); // the grip
  } else if (build === 'spear') {
    cyl(0.03, 0.03, 1.1, wood, 0, 0, 0);
    cone(0.05, 0.28, steel, 0, 0.68, 0);
    cone(0.035, 0.12, darkSteel, 0, -0.6, 0, Math.PI);
  } else if (build === 'blunt') {
    cyl(0.035, 0.04, 0.9, wood, 0, -0.15, 0);
    ball(0.17, darkSteel, 0, 0.48, 0);
    cone(0.04, 0.12, steel, 0.17, 0.48, 0, 0, -Math.PI / 2);
    cone(0.04, 0.12, steel, -0.17, 0.48, 0, 0, Math.PI / 2);
    cone(0.04, 0.12, steel, 0, 0.48, 0.17, Math.PI / 2);
    cone(0.04, 0.12, steel, 0, 0.48, -0.17, -Math.PI / 2);
    cone(0.04, 0.12, steel, 0, 0.65, 0);
  } else if (build === 'cane') {
    cyl(0.032, 0.038, 1.0, wood, 0, -0.05, 0);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 10, 24, Math.PI), wood);
    hook.position.set(0.09, 0.45, 0);
    g.add(hook);
    ball(0.05, gold, 0.09, 0.45, 0);
  } else if (build === 'staff') {
    cyl(0.03, 0.035, 1.1, wood, 0, -0.1, 0);
    ball(0.12, glow, 0, 0.62, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 8, 32), gold);
    ring.position.set(0, 0.62, 0);
    ring.rotation.x = 1.1;
    g.add(ring);
  } else if (build === 'firearm') {
    box(0.1, 0.14, 0.4, darkSteel, 0, 0.05, 0);
    cyl(0.035, 0.035, 0.3, steel, 0, 0.08, 0.32, Math.PI / 2); // the barrel
    box(0.09, 0.22, 0.11, grip, 0, -0.12, -0.14, 0.25); // the grip
    box(0.04, 0.06, 0.06, gold, 0, 0.15, -0.1); // the hammer
  } else {
    // 'blade' (and any unknown build key — a blade, never a void)
    box(0.09, 0.28, 0.05, grip, 0, -0.36, 0);
    box(0.26, 0.04, 0.06, gold, 0, -0.2, 0);
    box(0.09, 0.7, 0.02, steel, 0, 0.17, 0);
    cone(0.045, 0.16, steel, 0, 0.6, 0);
  }
  return g;
}

/**
 * WeaponPreview — ONE shared live Three.js viewer for the whole
 * shelf (one renderer, one canvas: thirteen per-card canvases
 * would starve a phone of WebGL contexts). three.js loads lazily
 * on mount, so the page costs nothing until this renders. The
 * selected weapon's CGI spec drives it: a GLB file when the spec
 * says glb (the revolver shows the real revolver-handgun.glb),
 * a procedural primitive build otherwise. The model is run
 * through the shared normaliseWeaponGroup first, so the preview
 * shows each weapon the way it is held — the revolver upright
 * and revolver-sized, the spear without its Tripo display disc
 * — and the camera then frames whatever that leaves. Auto-rotates;
 * drag to orbit. Fully disposes on unmount and when the model changes.
 */
function WeaponPreview({ cgi, name, weaponClass }) {
  const mountRef = useRef(null);
  const stageRef = useRef(null);
  const [stage, setStage] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    let renderer;
    let controls;
    let raf = 0;
    let contextGuard = null;
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (cancelled || !mountRef.current) return;
        const mount = mountRef.current;
        const w = mount.clientWidth || 300;
        const h = 220;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);
        contextGuard = guardCanvasContext(renderer.domElement, { label: 'WEAPON PREVIEW' });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        camera.position.set(0.9, 0.5, 1.6);
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c22, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(3, 5, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
        rim.position.set(-4, 2, -3);
        scene.add(rim);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minDistance = 0.6;
        controls.maxDistance = 6;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.4;
        const holder = { THREE, scene, camera, renderer, controls, model: null };
        stageRef.current = holder;
        setStage(holder);
        const tick = () => {
          raf = requestAnimationFrame(tick);
          if (contextGuard && contextGuard.isLost()) return;
          controls.update();
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          console.error('WeaponPreview failed to start', e);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (contextGuard) contextGuard.dispose();
      if (raf) cancelAnimationFrame(raf);
      const s = stageRef.current;
      if (s) {
        if (s.model) { s.scene.remove(s.model); disposeGroup(s.model); }
        if (s.controls) s.controls.dispose();
        if (s.renderer) {
          s.renderer.dispose();
          if (s.renderer.domElement && s.renderer.domElement.parentNode) {
            s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
          }
        }
      }
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!stage || !cgi || !cgi.model) return;
    let cancelled = false;
    setStatus('loading');
    const { THREE, scene, camera, controls } = stage;
    void (async () => {
      try {
        let model = null;
        if (cgi.model.kind === 'glb') {
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
          const gltf = await new GLTFLoader().loadAsync(cgi.model.src);
          model = gltf.scene;
        } else {
          model = buildProcedural(THREE, cgi.model.build);
        }
        // The shared fit: grip at the origin, long axis on the
        // aim axis, true in-hand size. A failure here must never
        // blank the preview — the raw model still shows.
        try {
          normaliseWeaponGroup(THREE, model, { weaponClass, src: cgi.model.src });
        } catch (e) { /* raw model stands */ }
        if (cancelled) { disposeGroup(model); return; }
        if (stage.model) { scene.remove(stage.model); disposeGroup(stage.model); }
        stage.model = model;
        scene.add(model);
        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        controls.target.copy(center);
        camera.position.set(center.x + maxDim * 1.1, center.y + maxDim * 0.5, center.z + maxDim * 1.8);
        camera.lookAt(center);
        controls.update();
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          console.error('WeaponPreview failed to load', cgi.model, e);
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stage, cgi]);

  return (
    <div>
      <div
        ref={mountRef}
        style={{ width: '100%', height: 220, position: 'relative' }}
        className="overflow-hidden rounded-xl border border-white/10 bg-black/40"
      >
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.3em] text-neutral-500">
            Loading model…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs uppercase tracking-widest text-red-300/80">
            Could not load this model. Check your connection and try again.
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-neutral-400">
        {name} — {cgi && cgi.model.kind === 'glb' ? 'GLB model' : `procedural ${cgi ? cgi.model.build : ''}`} · fires{' '}
        {cgi ? `${cgi.firing.kind} at ${cgi.firing.speedMps} m/s` : '—'} · drag to orbit
      </p>
    </div>
  );
}

export default function WeaponsForgePage() {
  const record = useBackpack();
  const [bars, setBars] = useState(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [patronThemes, setPatronThemes] = useState(() => Object.fromEntries(PATRON_IDS.map((p) => [p, ''])));
  const [patronBusy, setPatronBusy] = useState('');
  const [patronDone, setPatronDone] = useState(() => Object.fromEntries(PATRON_IDS.map((p) => [p, false])));
  // The shared CGI viewer: one canvas for the whole shelf, showing
  // the selected weapon's real model. The revolver leads — it is
  // the proof the GLB path works (revolver-handgun.glb on disk).
  const [previewId, setPreviewId] = useState('ember-revolver');
  const previewRef = useRef(null);
  const previewWeapon = useMemo(() => forgeWeaponById(previewId) || FORGE_WEAPONS[0], [previewId]);
  const previewCgi = useMemo(
    () => cgiForWeapon({ id: previewWeapon.id, weaponClass: previewWeapon.weaponClass }),
    [previewWeapon]
  );

  const loadBars = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setSignedIn(false);
      setBars(null);
      return;
    }
    setSignedIn(true);
    try {
      const res = await fetch('/api/weapons-forge', { headers, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (data && typeof data.bars === 'number') setBars(data.bars);
      else setBars(null);
    } catch {
      setBars(null);
    }
  }, []);

  useEffect(() => { void loadBars(); }, [loadBars]);

  const loadCommissions = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const res = await fetch('/api/weapons-forge/commission', { headers, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (data && data.commissions) {
        const next = {};
        for (const p of PATRON_IDS) next[p] = data.commissions[p] === true;
        setPatronDone(next);
      }
    } catch { /* the cards stay commissionable; the server guards the day */ }
  }, []);

  useEffect(() => { void loadCommissions(); }, [loadCommissions]);

  const commission = useCallback(async (patronId) => {
    setNotice('');
    setPatronBusy(patronId);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setNotice('Sign in to commission — the patrons forge for account holders.');
        return;
      }
      await flushBackpack();
      const res = await fetch('/api/weapons-forge/commission', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ patron: patronId, theme: patronThemes[patronId] || '' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (data && data.backpack) replaceBackpackRecord(data.backpack);
        if (data && data.alreadyCommissioned) {
          setPatronDone((d) => ({ ...d, [patronId]: true }));
        }
        setNotice((data && data.error) || 'The patron could not forge that. Try again.');
        return;
      }
      if (data.backpack) replaceBackpackRecord(data.backpack);
      setPatronDone((d) => ({ ...d, [patronId]: true }));
      setNotice(
        `${PATRONS[patronId].glyph} ${PATRONS[patronId].name} forged you the ${data.weapon.name} ` +
        `(${data.weapon.rarity}, ${data.weapon.weaponClass}, dmg ${data.weapon.damage}) — ` +
        `it is shelved in your backpack.${data.weapon.cgi ? cgiLine(data.weapon.cgi) : ''}`
      );
    } catch {
      setNotice('The forge could not be reached. Your pack is unchanged.');
    } finally {
      setPatronBusy('');
    }
  }, [patronThemes]);

  const stock = useMemo(() => forgeMaterialStock(record), [record]);
  const ownedNames = useMemo(
    () => new Set(record.items.filter((e) => e.kind === 'weapon').map((e) => e.id)),
    [record]
  );

  const forge = useCallback(async (weapon) => {
    setNotice('');
    setBusyId(weapon.id);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setNotice('Sign in to forge — the smith works for account holders.');
        return;
      }
      // The server judges the price against the account copy of
      // the pack: flush this device's record first so the freshest
      // finds are on the scale.
      await flushBackpack();
      const res = await fetch('/api/weapons-forge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ weaponId: weapon.id, idemKey: newIdemKey() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (data && data.backpack) replaceBackpackRecord(data.backpack);
        if (data && typeof data.bars === 'number') setBars(data.bars);
        setNotice((data && data.error) || 'The forge refused that work. Try again.');
        return;
      }
      if (data.backpack) replaceBackpackRecord(data.backpack);
      if (typeof data.bars === 'number') setBars(data.bars);
      setNotice(data.duplicate
        ? `${weapon.name} was already on the anvil — no double charge.${data.cgi ? cgiLine(data.cgi) : ''}`
        : `⚒️ ${weapon.name} forged and shelved in your backpack — reticle set (${forgeWeaponReticle(weapon)}).${data.cgi ? cgiLine(data.cgi) : ''}`);
    } catch {
      setNotice('The forge could not be reached. Your pack is unchanged.');
    } finally {
      setBusyId('');
    }
  }, []);

  const shelf = useMemo(
    () => [...FORGE_WEAPONS]
      .sort((a, b) => (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || (a.damage - b.damage))
      .map((w) => ({ ...w, cgi: cgiForWeapon({ id: w.id, weaponClass: w.weaponClass }) })),
    []
  );

  const showPreview = useCallback((weaponId) => {
    setPreviewId(weaponId);
    if (previewRef.current && typeof previewRef.current.scrollIntoView === 'function') {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  return (
    <main className="min-h-dvh bg-[#0a0705] text-neutral-100 px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[0.35em] uppercase text-orange-300/80">
            Hephaestus · Tools
          </p>
          <h1 className="text-3xl font-black tracking-tight">⚒️ The Weapons Forge</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
            Forge a weapon and it is shelved in your{' '}
            <Link href="/profile" className="text-amber-200 underline">backpack</Link>{' '}
            — the pack that follows you into every realm. Every weapon leaves the anvil
            with its reticle set and its CGI stamped in — the model and the way it
            fires, carried in your pack. Prices are gold bars plus what the wilds provide:
            fossil specimens and blood sacs from Earth 2.
          </p>
        </header>

        {/* The purse — bars (server balance) + pack materials. */}
        <section aria-label="Your purse" className="flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🧱 <strong className="text-yellow-100">{bars === null ? '—' : bars.toLocaleString('en-US')}</strong>{' '}
            <span className="text-xs text-neutral-400">gold bars{signedIn ? '' : ' (sign in to forge)'}</span>
          </span>
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🦴 <strong className="text-amber-100">{stock.fossils}</strong>{' '}
            <span className="text-xs text-neutral-400">fossils in pack</span>
          </span>
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🩸 <strong className="text-red-200">{stock.bloodSacs}</strong>{' '}
            <span className="text-xs text-neutral-400">blood sacs in pack</span>
          </span>
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            🎒 <strong className="text-neutral-100">{record.items.filter((e) => e.kind === 'weapon').length}</strong>{' '}
            <span className="text-xs text-neutral-400">weapons owned</span>
          </span>
        </section>

        {notice && (
          <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {notice}
          </p>
        )}
        {!signedIn && (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-400">
            You are browsing the shelf signed out. The catalogue is open to everyone;
            forging needs an account so the price can be judged against your own
            bars and pack.
          </p>
        )}

        {/* Patron smiths — Hammond and Dracula commission
            AI-created weapons and distribute them to travellers:
            one commission per patron per day, free of bars and
            materials; the scarcity is the day, not the price. */}
        <section aria-label="Patron smiths" className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight">👑 Patron Smiths</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
              Four old hands keep an anvil here. Each will invent a weapon for you —
              once a day, shaped by their craft — and hand it straight to your
              backpack. Give them a hint, or let them surprise you.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PATRON_IDS.map((patronId) => {
              const patron = PATRONS[patronId];
              const done = patronDone[patronId];
              const busy = patronBusy === patronId;
              return (
                <article
                  key={patronId}
                  className="flex flex-col gap-2 rounded-2xl border border-amber-200/20 bg-gradient-to-b from-white/[0.05] to-transparent p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold leading-snug">
                      {patron.glyph} {patron.name}, {patron.title}
                    </h3>
                  </div>
                  <p className="text-sm italic text-neutral-300">“{patron.line}”</p>
                  <p className="text-xs leading-relaxed text-neutral-400">
                    📍 {patron.seat}
                  </p>
                  <p className="text-xs leading-relaxed text-neutral-400">
                    Favours: {patron.favours.join(' · ')}
                  </p>
                  <label className="flex flex-col gap-1 text-xs text-neutral-400">
                    A hint for the smith (optional)
                    <input
                      type="text"
                      maxLength={120}
                      value={patronThemes[patronId]}
                      disabled={!signedIn || done || busy}
                      onChange={(e) => setPatronThemes((t) => ({ ...t, [patronId]: e.target.value }))}
                      placeholder="e.g. a spear that remembers the sea"
                      className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 disabled:opacity-40"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!signedIn || done || busy}
                    onClick={() => void commission(patronId)}
                    className="min-h-[44px] rounded-xl border border-amber-300/40 bg-amber-500/20 px-4 py-2 text-sm font-bold text-amber-50 transition hover:bg-amber-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy
                      ? 'The patron is at the anvil…'
                      : done
                        ? 'Forged for you today — return tomorrow'
                        : `✨ Commission a weapon from ${patron.name}`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* The viewer — one shared live 3D stage for the whole
            shelf. Tap Preview on any weapon below to see its real
            model here: GLB where the forge has one, a procedural
            build where it does not. */}
        <section aria-label="Weapon viewer" ref={previewRef} className="flex flex-col gap-2">
          <h2 className="text-xl font-black tracking-tight">🔍 Inspect the steel</h2>
          <WeaponPreview cgi={previewCgi} name={previewWeapon.name} weaponClass={previewWeapon.weaponClass} />
        </section>

        {/* The shelf. */}
        <section aria-label="Forge catalogue" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shelf.map((weapon) => {
            const afford = forgeAffordability(record, weapon, bars === null ? 0 : bars);
            const owned = ownedNames.has(weapon.id);
            const reticle = forgeWeaponReticle(weapon);
            return (
              <article
                key={weapon.id}
                className="flex flex-col gap-2 rounded-2xl border border-orange-200/15 bg-gradient-to-b from-white/[0.05] to-transparent p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold leading-snug">{weapon.name}</h2>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${RARITY_CLASS[weapon.rarity] || RARITY_CLASS.common}`}>
                    {weapon.rarity}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-neutral-400">{weapon.blurb}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-300">
                  <span>Class: <strong>{weapon.weaponClass}</strong></span>
                  <span>Damage: <strong>{weapon.damage}</strong></span>
                  <span title="Reticle — set at the forge, carried in your pack">
                    Reticle: <strong>{RETICLE_GLYPH[reticle] || '◎'} {reticle}</strong>
                  </span>
                  <span title="CGI — the model and firing behaviour stamped into your pack when forged">
                    CGI: <strong>{weapon.cgi.model.kind === 'glb' ? 'GLB' : weapon.cgi.model.build} · {weapon.cgi.firing.kind} {weapon.cgi.firing.speedMps} m/s</strong>
                  </span>
                </div>
                <div className="mt-auto flex flex-col gap-2 pt-1">
                  <span className="text-xs text-neutral-400">{costLabel(weapon)}</span>
                  <button
                    type="button"
                    onClick={() => showPreview(weapon.id)}
                    className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-neutral-100 transition hover:bg-white/10"
                  >
                    👁 Preview {previewId === weapon.id ? '— showing above' : ''}
                  </button>
                  <button
                    type="button"
                    disabled={!signedIn || busyId === weapon.id}
                    onClick={() => void forge(weapon)}
                    className="min-h-[44px] rounded-xl border border-orange-300/40 bg-orange-500/20 px-4 py-2 text-sm font-bold text-orange-50 transition hover:bg-orange-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyId === weapon.id
                      ? 'Forging…'
                      : owned
                        ? 'Forge another'
                        : afford.ok
                          ? '⚒️ Forge it'
                          : '⚒️ Forge it'}
                  </button>
                  {signedIn && !afford.ok && (
                    <span className="text-[11px] leading-snug text-neutral-500">
                      Still needed:{' '}
                      {afford.missing.map((m) => (m.item === 'bars'
                        ? `🧱 ${m.need - m.held} more bars`
                        : m.item === 'fossil'
                          ? `🦴 ${m.need - m.held} more fossils`
                          : `🩸 ${m.need - m.held} more blood sacs`)).join(' · ')}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <footer className="text-xs leading-relaxed text-neutral-500">
          Bars are minted at the <Link href="/liquid-gold" className="text-amber-200 underline">Liquid Gold refinery</Link>;
          fossils and blood sacs are gathered on <span className="text-neutral-300">Earth 2</span> —
          hunt the Bay, mind the mosquitos, and trade kindly with its residents.
          Forged weapons ride in your backpack from realm to realm.
        </footer>
      </div>
      <MuseEngineChat engine="weapons-forge" title="Weapons Forge"
        context={{ signedIn, bars }} accent="#ef4444" />
    </main>
  );
}
