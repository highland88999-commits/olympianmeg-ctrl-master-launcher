'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TARGETS, getTarget, nextIndex, prevIndex } from './targets';
import { makeStarField, hashSeed } from './stars';
import { drawTelescopeView, clampZoom, MIN_ZOOM, MAX_ZOOM } from './telescope';
import { createAmbience } from './audio';

const BTN =
  'px-4 py-2 border border-amber-300/40 bg-black/60 text-amber-100/90 text-xs tracking-[2px] uppercase font-mono hover:bg-amber-200/10 hover:border-amber-200 transition-all cursor-pointer inline-flex items-center gap-2';
const BTN_ACTIVE = 'px-4 py-2 border border-amber-200 bg-amber-200/80 text-black text-xs tracking-[2px] uppercase font-mono font-bold transition-all cursor-pointer inline-flex items-center gap-2';

const TILE = '/images/apollo-shared/apollo-panel-tile.webp';
const BG = '/images/pearl/pearl-bg.webp';

// Inline SVG glyph system (zero image weight) — APOLLO amber/gold treatment.
const G = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: 'none' }} {...props} />
);
const IconPrev = () => (<G><path d="M15 5l-7 7 7 7" /></G>);
const IconNext = () => (<G><path d="M9 5l7 7-7 7" /></G>);
const IconScope = () => (<G><path d="M3 8l14-4 4 3-14 4z" /><path d="M7 10v6M17 7v6" /><circle cx="19" cy="17" r="2.5" /></G>);
const IconRotate = () => (<G><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v5h-5" /></G>);
const IconFull = () => (<G><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></G>);
const IconVolume = () => (<G><path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></G>);
const IconMute = () => (<G><path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" stroke="none" /><path d="m16 9 5 6M21 9l-5 6" /></G>);
const IconClose = () => (<G><path d="M6 6l12 12M18 6 6 18" /></G>);
const IconSpin = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#e8b93c" strokeWidth="3"
    strokeLinecap="round" aria-hidden="true" style={{ animation: 'pearlspin 0.9s linear infinite' }}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export default function PearlPage() {
  const mountRef = useRef(null);
  const scopeCanvasRef = useRef(null);
  const ambienceRef = useRef(null);
  const threeRef = useRef(null);

  const [entered, setEntered] = useState(false);
  const [targetIdx, setTargetIdx] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [scopeMode, setScopeMode] = useState(false);
  const [zoom, setZoom] = useState(2.5);
  const [muted, setMuted] = useState(false);
  const [fullOn, setFullOn] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [domeWarming, setDomeWarming] = useState(false); // styled loading veil while the dome charges
  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const target = getTarget(targetIdx);

  // ---------- three.js observatory scene ----------
  useEffect(() => {
    if (!entered || !mountRef.current) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      setWebglOk(false);
      return;
    }
    const mount = mountRef.current;
    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030308);
    scene.fog = new THREE.FogExp2(0x030308, 0.0016);

    const camera = new THREE.PerspectiveCamera(55, W / H, 1, 6000);
    const cam = { lon: 20, lat: 12, dist: 150 };

    // lights
    scene.add(new THREE.AmbientLight(0x8899bb, 0.5));
    const moonLight = new THREE.DirectionalLight(0xbfd0ff, 1.1);
    moonLight.position.set(-120, 200, 80);
    scene.add(moonLight);
    const domeGlow = new THREE.PointLight(0x88aaff, 0.8, 220);
    domeGlow.position.set(0, 40, 0);
    scene.add(domeGlow);

    // stars
    const field = makeStarField(2200, hashSeed('pearl-sky'));
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(field.colors, 3));
    const starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 });
    scene.add(new THREE.Points(starGeo, starMat));

    // ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(600, 48),
      new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // observatory
    const obs = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ae, roughness: 0.85, metalness: 0.1 });
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd8, roughness: 0.5, metalness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 20, 40), stoneMat);
    base.position.y = 10;
    obs.add(base);

    const domeGroup = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.y = 20;
    domeGroup.add(dome);
    // slit opening
    const slit = new THREE.Mesh(new THREE.BoxGeometry(7, 26, 4), darkMat);
    slit.position.set(0, 32, 27);
    slit.rotation.x = -0.35;
    domeGroup.add(slit);
    // slit rim glow
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 1.2, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x33415e, emissive: 0x223355, emissiveIntensity: 0.7 })
    );
    rim.position.set(0, 44.5, 22.4);
    rim.rotation.x = -0.35;
    domeGroup.add(rim);
    domeGroup.position.y = 0;
    obs.add(domeGroup);

    // telescope tube inside slit
    const scope = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 26, 20), darkMat);
    tube.rotation.x = Math.PI / 2 - 0.5;
    scope.add(tube);
    const tubeRim = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.35, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.8, roughness: 0.3 })
    );
    tubeRim.position.set(0, 6.2, 11.2);
    scope.add(tubeRim);
    scope.position.set(0, 30, 8);
    domeGroup.add(scope);

    scene.add(obs);

    // faint horizon ring
    const ringGeo = new THREE.RingGeometry(120, 121.5, 96);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x1c2b45, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.5;
    scene.add(ring);

    // drag-to-orbit
    let dragging = false, px = 0, py = 0, vLon = 0, vLat = 0;
    const el = renderer.domElement;
    const onDown = (e) => { dragging = true; px = e.clientX; py = e.clientY; vLon = 0; vLat = 0; };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      vLon = -dx * 0.12; vLat = dy * 0.08;
      cam.lon += vLon; cam.lat = Math.max(2, Math.min(60, cam.lat + vLat));
    };
    const onUp = () => { dragging = false; };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let slew = 0; // telescope slew progress 0..1
    let slewFrom = 0.5, slewTo = 0.5;
    const tiltFor = (i) => 0.35 + (i % 4) * 0.14;

    threeRef.current = {
      setTarget(i) {
        slewFrom = slewTo;
        slewTo = tiltFor(i);
        slew = 0;
      },
    };
    threeRef.current.setTarget(targetIdx);

    const clock = new THREE.Clock();
    let staticDrawn = false;

    function frame() {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);

      if (!dragging) {
        cam.lon += vLon; cam.lat = Math.max(2, Math.min(60, cam.lat + vLat));
        vLon *= 0.94; vLat *= 0.94;
        if (!reduced && autoRotateRef.current) cam.lon += dt * 2.2;
      }
      const phi = THREE.MathUtils.degToRad(90 - cam.lat);
      const theta = THREE.MathUtils.degToRad(cam.lon);
      camera.position.set(
        cam.dist * Math.sin(phi) * Math.cos(theta),
        cam.dist * Math.cos(phi),
        cam.dist * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(0, 28, 0);

      if (!reduced && autoRotateRef.current) domeGroup.rotation.y += dt * 0.12;

      // telescope slew easing
      if (slew < 1) {
        slew = Math.min(1, slew + dt * 0.8);
        const e = 1 - Math.pow(1 - slew, 3);
        scope.rotation.x = -(slewFrom + (slewTo - slewFrom) * e);
      }

      // gentle star twinkle via material size
      starMat.size = 2.2 + Math.sin(clock.elapsedTime * 1.7) * 0.25;

      renderer.render(scene, camera);
      if (reduced && !staticDrawn) { staticDrawn = true; cancelAnimationFrame(raf); }
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerdown', onDown);
      starGeo.dispose(); starMat.dispose();
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
      threeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  // slew telescope when target changes
  useEffect(() => {
    if (threeRef.current) threeRef.current.setTarget(targetIdx);
    if (ambienceRef.current) ambienceRef.current.retune(getTarget(targetIdx).baseFreq);
  }, [targetIdx]);

  // ---------- telescope eyepiece overlay ----------
  useEffect(() => {
    if (!scopeMode || !scopeCanvasRef.current) return;
    const canvas = scopeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = (canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1));
      const h = (canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1));
      const t = (performance.now() - t0) / 1000;
      if (reduced) {
        drawTelescopeView(ctx, getTarget(targetIdx), w, h, clampZoom(zoom), 0);
        cancelAnimationFrame(raf);
        return;
      }
      drawTelescopeView(ctx, getTarget(targetIdx), w, h, clampZoom(zoom), t);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [scopeMode, targetIdx, zoom, reduced]);

  const enter = useCallback(() => {
    setEntered(true);
    setDomeWarming(true);
    setTimeout(() => setDomeWarming(false), 900);
    if (!ambienceRef.current) ambienceRef.current = createAmbience();
    ambienceRef.current.start(getTarget(0).baseFreq);
    ambienceRef.current.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => { if (ambienceRef.current) ambienceRef.current.dispose(); };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullOn(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullOn(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nm = !m;
      if (ambienceRef.current) ambienceRef.current.setMuted(nm);
      return nm;
    });
  }, []);

  return (
    <>
    <main className="relative w-full h-[100dvh] bg-black text-slate-200 overflow-hidden font-mono select-none">
      {!entered && (
        <button
          onClick={enter}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
          style={{
            backgroundImage: `linear-gradient(rgba(3,2,1,0.55), rgba(0,0,0,0.78)), url(${BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-label="Enter the observatory"
        >
          <h1 className="text-5xl md:text-6xl tracking-[14px] text-amber-100 animate-pulse" style={{ textShadow: '0 0 34px rgba(232,185,60,0.45)' }}>THE PEARL</h1>
          <p className="mt-3 text-xs tracking-[6px] text-amber-200/70">SEQUENTIAL OBSERVATORY · V23.5</p>
          <p className="mt-8 text-[11px] tracking-[4px] text-amber-100/60 inline-flex items-center gap-3">
            <IconScope />( CLICK TO ENTER )
          </p>
        </button>
      )}

      {entered && (
        <>
          <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />
          {domeWarming && (
            <div
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4"
              role="status"
              aria-label="Charging the dome"
              style={{
                backgroundImage: `linear-gradient(rgba(3,2,1,0.8), rgba(3,2,1,0.88)), url(${BG})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <IconSpin />
              <div className="text-amber-200/90 text-xs tracking-[0.35em] uppercase font-semibold">
                Charging the dome…
              </div>
            </div>
          )}
          {!webglOk && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm tracking-widest text-amber-100/80 p-8 text-center"
              style={{
                backgroundImage: `linear-gradient(rgba(3,2,1,0.82), rgba(3,2,1,0.9)), url(${BG})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              role="status"
            >
              <IconScope />
              <div>WEBGL UNAVAILABLE ON THIS DEVICE</div>
              <div className="text-xs text-amber-100/50 tracking-normal normal-case max-w-sm">
                The observatory needs WebGL to raise its dome. Try a browser with hardware acceleration enabled.
              </div>
            </div>
          )}

          {/* instructions */}
          <div className="absolute top-4 w-full text-center text-[11px] tracking-[4px] text-slate-400/80 pointer-events-none z-10">
            DRAG TO ORBIT THE DOME
          </div>

          {/* target fact card */}
          <div
            className="absolute top-14 left-4 max-w-xs z-10 border border-amber-300/30 backdrop-blur-sm p-4"
            style={{
              backgroundImage: `url(${TILE})`,
              backgroundSize: '220px',
              backgroundColor: 'rgba(8,5,2,0.72)',
              boxShadow: '0 0 28px rgba(232,185,60,0.08)',
            }}
          >
            <div className="text-[10px] tracking-[3px] text-amber-200/60">
              TARGET {String(targetIdx + 1).padStart(2, '0')} / {String(TARGETS.length).padStart(2, '0')} · {target.catalog}
            </div>
            <h2 className="text-xl tracking-[3px] text-amber-100 mt-1">{target.name.toUpperCase()}</h2>
            <div className="text-[11px] text-amber-100/60 mt-1">{target.type} — {target.distance}</div>
            <p className="text-xs text-amber-50/80 mt-3 leading-relaxed">{target.fact}</p>
            <div className="flex gap-2 mt-4">
              <button className={BTN} onClick={() => setTargetIdx(prevIndex(targetIdx))} aria-label="Previous target"><IconPrev />Prev</button>
              <button className={BTN} onClick={() => setTargetIdx(nextIndex(targetIdx))} aria-label="Next target">Next<IconNext /></button>
            </div>
          </div>

          {/* telescope overlay */}
          {scopeMode && (
            <div className="absolute inset-0 z-20 bg-black/85 flex flex-col items-center justify-center p-4">
              <canvas ref={scopeCanvasRef} className="w-full max-w-3xl aspect-[4/3] rounded" aria-label="Telescope view" />
              <div className="flex items-center gap-4 mt-4">
                <label className="text-[11px] tracking-[2px] text-slate-400" htmlFor="pearl-zoom">MAGNIFICATION</label>
                <input
                  id="pearl-zoom"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(clampZoom(parseFloat(e.target.value)))}
                  className="w-48 accent-slate-300"
                />
                <span className="text-xs text-slate-300 w-12">×{clampZoom(zoom).toFixed(1)}</span>
                <button className={BTN} onClick={() => setScopeMode(false)}><IconClose />Close</button>
              </div>
            </div>
          )}

          {/* control bar */}
          <div
            className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-2 px-4 py-2 rounded-xl border border-amber-300/25"
            style={{
              backgroundImage: `url(${TILE})`,
              backgroundSize: '220px',
              backgroundColor: 'rgba(8,5,2,0.72)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <button className={scopeMode ? BTN_ACTIVE : BTN} onClick={() => setScopeMode((s) => !s)}>
              <IconScope />Telescope{scopeMode ? ': ON' : ''}
            </button>
            <button className={autoRotate ? BTN_ACTIVE : BTN} onClick={() => setAutoRotate((a) => !a)}>
              <IconRotate />Auto-Rotate: {autoRotate ? 'ON' : 'OFF'}
            </button>
            <button className={fullOn ? BTN_ACTIVE : BTN} onClick={toggleFullscreen}><IconFull />Full Screen</button>
            <button className={BTN} onClick={toggleMute}>{muted ? <IconMute /> : <IconVolume />}{muted ? 'Unmute' : 'Mute'}</button>
          </div>
          <style>{`@keyframes pearlspin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed observatory viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
