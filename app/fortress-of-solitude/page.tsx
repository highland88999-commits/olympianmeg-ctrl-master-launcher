"use client";

import React, { useEffect, useState, useRef } from "react";
import { Plus, Download, Eye, Upload, Palette, MonitorPlay, Grid, ArrowUpCircle, Trash2, Link2, Copy, XCircle, Crosshair } from "lucide-react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import gsap from "gsap";
import JSZip from "jszip";
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { lockBlob, unlockBlob, isLockedNode } from '@/lib/fortress/vault-crypto';
import { formatBytes, FREE_QUOTA_BYTES, VAULT_PER_FILE_LIMIT_BYTES } from '@/lib/fortress/tiers';
import { SHARE_PASSPHRASE_NOTE } from '@/lib/fortress/shares';

import HoloframeViewer from "@/components/fortress/HoloframeViewer";
import StorageTiers from "@/components/fortress/StorageTiers";
import TempUpload from "@/components/fortress/TempUpload";
import ControlsCore from "@/components/world/ControlsCore";
import OrbButton, { OrbLabel } from "@/components/world/OrbButton";
import { createWalker, stepWalker, applyLook, WALK_EYE } from "@/lib/world/walk-controls";
import { createKeyInput } from "@/lib/world/walk-input";
import { buildPlutoWorld } from "@/components/fortress/PlutoWorld";
import { createPlutoState, stepPluto, crystalColliders, speedForMode, distanceToDisc, plutoGroundHeight } from "@/lib/fortress/pluto";

export default function FortressApp() {
  const router = useRouter();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0); 
  const [matrixData, setMatrixData] = useState<any[]>([]);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  
  const [statusMsg, setStatusMsg] = useState("");

  // Crystal-saved cue (Merlin, 2026-10-27): a short SAVED badge in the
  // crystal's own panel, in flow — it clears itself after 4 seconds.
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimerRef = useRef<any>(null);

  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  const [activeFileData, setActiveFileData] = useState<{url: string, meta: any} | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [longPressedNode, setLongPressedNode] = useState<any>(null);
  // Passphrase flow for real client-side encryption (never stored, never sent).
  const [passphrase, setPassphrase] = useState("");
  const [lockStep, setLockStep] = useState<null | 'store' | 'extract'>(null);
  const [pendingAction, setPendingAction] = useState<null | 'view' | 'download'>(null);

  // Storage tiers: the signed-in user's position in their vault allowance.
  const [quota, setQuota] = useState<{ tier: string, tierLabel: string, quotaBytes: number, usedBytes: number, stackedBytes?: number } | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [ascending, setAscending] = useState(false);

  // Temporary upload lane: locked-in-browser copies on Litterbox, Catbox,
  // Filegarden (manual), or the user's own Dropbox — pullable into the vault.
  const [tempOpen, setTempOpen] = useState(false);

  // Vault readiness, ensured ONCE per session (never per render, never per
  // save): the first load creates-or-loads the user's private bucket and
  // caches the success for the session, so later visits skip the network
  // call entirely. A failed ensure is never cached, so the next load
  // retries. Quota stays live (fetched on load, refreshed on usage adds and
  // Stripe returns) — only bucket readiness + the live cap are cached, since
  // those never change mid-session. A preparation failure surfaces HERE,
  // on load, in plain words — never mid-save.
  const [vault, setVault] = useState<{ ready: boolean, bucket: string | null, fileSizeLimitBytes: number | null, capAligned: boolean, capFallback?: boolean, error: string | null } | null>(null);
  const vaultEnsureRef = useRef(false);
  const VAULT_STATE_KEY = 'fortress:vault-state:v1';

  // Real share links for the selected crystal's file.
  const [share, setShare] = useState<{ url: string, expiresAt: string, token: string } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  // Removing a stored file for good.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  const authHeaders = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  };

  const resetLockState = () => {
    setPassphrase("");
    setLockStep(null);
    setPendingAction(null);
    setShare(null);
    setConfirmRemove(false);
  };

  // Crystal-saved pulse (Merlin, 2026-10-27): the saved crystal itself
  // glows — its emissive intensity pulses through the bloom pass, then
  // settles back to its resting glow — while the SAVED badge shows in
  // its panel. A pulse must never break the save flow, so any failure
  // here is swallowed. Call only on actual save success.
  const flashCrystalSaved = (mesh: THREE.Mesh | null) => {
    if (mesh) {
      try {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && typeof mat.emissiveIntensity === 'number') {
          gsap.fromTo(mat, { emissiveIntensity: 0.4 },
            { emissiveIntensity: 1.8, duration: 0.35, yoyo: true, repeat: 5,
              onComplete: () => { mat.emissiveIntensity = 0.4; } });
        }
      } catch { /* the save already succeeded; a missed pulse is cosmetic */ }
    }
    setSavedFlash(true);
    if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    savedFlashTimerRef.current = setTimeout(() => setSavedFlash(false), 4000);
  };

  // Start a real Stripe checkout for a storage tier (subscription, CAD/month).
  const handleAscend = async (tierId: string) => {
    setAscending(true);
    try {
      const res = await fetch('/api/fortress/checkout', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ tier: tierId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setTiersOpen(false);
      setStatusMsg(err.message);
      setTimeout(() => setStatusMsg(""), 6000);
    } finally {
      setAscending(false);
    }
  };

  // Start a real Stripe checkout for a CUSTOM amount (stacking): the
  // purchased GB add to the allowance on webhook completion, monthly CAD.
  // Rate default ($0.04/GB) lives in lib/fortress/tiers.js and needs
  // Merlin's ratification — see the tiers overlay.
  const handleAscendCustom = async (gb: number) => {
    setAscending(true);
    try {
      const res = await fetch('/api/fortress/checkout', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ customGb: gb })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setTiersOpen(false);
      setStatusMsg(err.message);
      setTimeout(() => setStatusMsg(""), 6000);
    } finally {
      setAscending(false);
    }
  };
  
  const engineRef = useRef<any>({});
  // Pluto walk mode (Merlin, Nov 28): the Fortress is a walkable 3D
  // space on Pluto. You land on the crystal floor; walk off the edge
  // and you levitate; the gravity orb lets you rise and come back down.
  const walkerRef = useRef<any>(null);
  const plutoRef = useRef<any>(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<any>(null);
  const collidersRef = useRef<any[]>([]);
  const lookDownRef = useRef(false);
  const lastLookPos = useRef({ x: 0, y: 0 });
  const [gravityOn, setGravityOn] = useState(true);
  const gravityOnRef = useRef(true);
  const [airState, setAirState] = useState<{ mode: string, heightM: number, distM: number }>({ mode: 'grounded', heightM: 0, distM: 0 });
  const airStateRef = useRef(airState);
  // Any overlay open freezes walking (keyboard + stick), so you never
  // walk away while reading a crystal panel or a tier sheet.
  const uiOpenRef = useRef(false);

  // The gravity switch: tap to turn gravity off and rise, tap again
  // to turn it back on and come back down. The orb always shows what
  // the tap will do (UP while gravity is on, DOWN while it is off).
  const toggleGravity = () => {
    const next = !gravityOnRef.current;
    gravityOnRef.current = next;
    setGravityOn(next);
  }; 
  const selectedMeshRef = useRef<THREE.Mesh | null>(null);
  const pointerTimerRef = useRef<any>(null);
  const pointerDownPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // The shared supabase client throws when the database connection isn't
    // configured. Catch that (and any auth failure) and say so honestly
    // instead of crashing into the error boundary.
    let subscription: { unsubscribe(): void } | undefined;
    try {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return router.push('/')
        setUser(session.user)

        const { data } = await supabase.from('fortresses_').select('crystal_matrix').eq('id', session.user.id).maybeSingle();
        let loadedMatrix = data?.crystal_matrix;

        if (!loadedMatrix || loadedMatrix.length === 0) {
            loadedMatrix = Array.from({length: 12}).map((_, i) => ({
                id: `node_${Date.now()}_${i}`,
                name: `Crystal ${i + 1}`,
                color: '#00f2ff',
                fileStorageKey: "",
                rawSize: 0,
                height: 4 + Math.random() * 1.5
            }));
            await supabase.from('fortresses_').upsert({ id: session.user.id, crystal_matrix: loadedMatrix });
        }

        setMatrixData(loadedMatrix);
        const used = loadedMatrix.reduce((acc: number, curr: any) => acc + (curr.rawSize || 0), 0);
        setStorageUsed(used);
        setMounted(true);

        // The user's real storage position: tier, allowance, and used bytes.
        // (The quota read creates the row on first read — free users get
        // their 1 GB from the start; an existing row is never overwritten.)
        try {
          const qres = await fetch('/api/fortress/quota', { headers: await authHeaders() });
          const q = await qres.json();
          if (!q.error) setQuota({ tier: q.tier, tierLabel: q.tierLabel, quotaBytes: q.quotaBytes, usedBytes: q.usedBytes, stackedBytes: q.stackedBytes ?? 0 });
        } catch { /* the storage widget falls back to the crystal matrix */ }

        // First-load vault ensure, once per session: create-or-load the
        // private bucket (idempotent server-side). A cached success skips
        // the network entirely; a failure is shown on load, never mid-save.
        if (!vaultEnsureRef.current) {
          vaultEnsureRef.current = true;
          try {
            let cached: { bucket: string, fileSizeLimitBytes: number, capFallback?: boolean } | null = null;
            try {
              const raw = window.sessionStorage.getItem(VAULT_STATE_KEY);
              cached = raw ? JSON.parse(raw) : null;
            } catch { cached = null; }
            if (cached && cached.bucket && Number.isFinite(cached.fileSizeLimitBytes)) {
              setVault({ ready: true, bucket: cached.bucket, fileSizeLimitBytes: cached.fileSizeLimitBytes, capAligned: false, capFallback: !!cached.capFallback, error: null });
            } else {
              const eres = await fetch('/api/fortress/vault/ensure', { method: 'POST', headers: await authHeaders() });
              const e = await eres.json();
              if (e.error) throw new Error(e.error);
              const limit = Number.isFinite(e.fileSizeLimitBytes) ? e.fileSizeLimitBytes : VAULT_PER_FILE_LIMIT_BYTES;
              setVault({ ready: true, bucket: e.bucket, fileSizeLimitBytes: limit, capAligned: !!e.capAligned, capFallback: !!e.capFallback, error: null });
              try { window.sessionStorage.setItem(VAULT_STATE_KEY, JSON.stringify({ bucket: e.bucket, fileSizeLimitBytes: limit, capFallback: !!e.capFallback })); } catch { /* private mode — the next load re-ensures */ }
            }
          } catch (err: any) {
            setVault({ ready: false, bucket: null, fileSizeLimitBytes: null, capAligned: false, error: err?.message || 'Could not prepare your vault.' });
          }
        }

        // Return from Stripe: settle on the webhook's word, then refresh.
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get('checkout') === 'success') {
            setStatusMsg("Your vault has ascended — the new tier is active.");
            try {
              const qres = await fetch('/api/fortress/quota', { headers: await authHeaders() });
              const q = await qres.json();
              if (!q.error) setQuota({ tier: q.tier, tierLabel: q.tierLabel, quotaBytes: q.quotaBytes, usedBytes: q.usedBytes, stackedBytes: q.stackedBytes ?? 0 });
            } catch { /* keep the earlier reading */ }
            setTimeout(() => setStatusMsg(""), 5000);
            window.history.replaceState({}, '', window.location.pathname);
          } else if (params.get('checkout') === 'cancelled') {
            setStatusMsg("Checkout cancelled — nothing was charged.");
            setTimeout(() => setStatusMsg(""), 5000);
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch { /* URL params are best-effort */ }

        setTimeout(() => initThreeJSEngine(loadedMatrix), 100);
      }).catch(() => setCloudOffline(true))

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) router.push('/')
        else setUser(session.user)
      })
      subscription = sub
    } catch {
      setCloudOffline(true)
    }

    return () => {
      subscription?.unsubscribe();
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      // Stop the three.js engine loop + resize listener on unmount (Phase 2b).
      try { (engineRef.current as any)?.dispose?.(); } catch { /* noop */ }
    }
  }, [router]);

  // Keyboard: WASD/arrows move (universal controls), G toggles
  // gravity — the keyboard twin of the gravity orb.
  useEffect(() => {
    if (!keysRef.current) keysRef.current = createKeyInput();
    const keys = keysRef.current;
    keys.attach();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') toggleGravity();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      keys.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any overlay open freezes walking, so you never walk away while
  // reading a crystal panel, a tier sheet, or the temp lane.
  useEffect(() => {
    uiOpenRef.current = !!(selectedNodeData || tiersOpen || tempOpen || activeFileData || isMenuOpen || longPressedNode);
  }, [selectedNodeData, tiersOpen, tempOpen, activeFileData, isMenuOpen, longPressedNode]);

  const syncDatabase = async (newMatrix: any[]) => {
      setMatrixData(newMatrix);
      if(!user) return;
      await supabase.from('fortresses_').upsert({ id: user.id, crystal_matrix: newMatrix, updated_at: new Date().toISOString() });
      const used = newMatrix.reduce((acc: number, curr: any) => acc + (curr.rawSize || 0), 0);
      setStorageUsed(used);
  };

  // Pluto walk mode (Merlin, Nov 28): the Fortress is a walkable 3D
  // space on the frozen world Pluto. You LAND on the floor that holds
  // the crystals; walk off its edge and you levitate — you hover, you
  // never fall. The gravity orb rises you up and brings you back down.
  // The old orbit camera is gone: the camera is the walker now
  // (first-person, universal controls — joystick + drag-look + keys).
  //
  // LANDING: the ring holds 12 crystals at 30° intervals, so the gaps
  // sit at 15° + 30°k. You land in a gap — r=12 at 15° (11.59, 3.11),
  // facing the centre (yaw 1.309) — so the nearest crystals frame the
  // view instead of filling it. Landing dead on a crystal's angle
  // (0, 12) put a solid crystal 1 m in front of the camera and the
  // whole screen went cyan. Recenter returns here too.
  const LANDING = { x: 11.59, z: 3.11, yaw: 1.309 };
  const initThreeJSEngine = (matrix: any[]) => {
    if (engineRef.current.initialized || !canvasContainerRef.current) return;
    engineRef.current.initialized = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    canvasContainerRef.current.appendChild(renderer.domElement);
    // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
    // in place; a loss that stays gone surfaces the FEED LOST fallback,
    // and the loop below freezes while the context is lost.
    const contextGuard = guardCanvasContext(renderer.domElement, { label: 'FORTRESS OF SOLITUDE' });

    const carouselGroup = new THREE.Group();
    const floorGroup = new THREE.Group();
    scene.add(floorGroup);
    floorGroup.add(carouselGroup);

    const loader = new THREE.TextureLoader();

    // Pluto: the frozen world, the ice plain, the crystal floor, the
    // sky domes, the spires, the beacon home. The returned floorMesh
    // is the crystal-floor top (Set Floor retextures it) and the
    // outerDome is the sky (Set Walls retextures it) — exactly as before.
    const pluto = buildPlutoWorld(THREE, scene);
    const { floorMesh, outerDome, innerDome } = pluto;

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.85);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // The walker: you land on the crystal floor in the LANDING gap,
    // facing the ring and the beacon at its centre. The crystals are
    // solid — you walk around them, never through them.
    const walker = createWalker({ x: LANDING.x, z: LANDING.z, yaw: LANDING.yaw, pitch: 0 });
    const plutoState = createPlutoState({ x: LANDING.x, z: LANDING.z });
    walkerRef.current = walker;
    plutoRef.current = plutoState;
    collidersRef.current = crystalColliders(matrix);
    if (!keysRef.current) keysRef.current = createKeyInput();

    matrix.forEach((nodeData, i) => {
        const angle = (i / matrix.length) * Math.PI * 2;
        const node = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.4, nodeData.height, 6), 
            new THREE.MeshStandardMaterial({ 
              map: loader.load('/IMG_2876.png'), 
              color: nodeData.color,
              emissive: nodeData.color, 
              emissiveIntensity: 0.85, 
              metalness: 0.25, 
              roughness: 0.15,
            })
        );
        node.position.set(Math.cos(angle) * 11, nodeData.height / 2, Math.sin(angle) * 11);
        node.userData = nodeData;
        carouselGroup.add(node);
    });

    engineRef.current = { scene, camera, renderer, composer, carouselGroup, outerDome, innerDome, floorMesh, floorGroup, pluto };

    let rafId = 0;
    let lastT = performance.now();
    let lastAirKey = '';
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (contextGuard.isLost()) return; // frozen while the context is gone
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;

      // Walk input: joystick + WASD/arrows, frozen while any panel is open.
      const keys = keysRef.current;
      const frozen = uiOpenRef.current;
      const fwd = frozen ? 0 : (keys ? keys.state.fwd : 0) + joyRef.current.y;
      const strafe = frozen ? 0 : (keys ? keys.state.strafe : 0) + joyRef.current.x;
      stepWalker(walker, { fwd, strafe, sprint: keys ? keys.state.sprint : false, jump: false }, dt, {
        speed: speedForMode(plutoState.mode),
        groundHeight: () => 0,
        colliders: collidersRef.current,
      });
      stepPluto(plutoState, { x: walker.pos.x, z: walker.pos.z, gravityOn: gravityOnRef.current, dt });

      // First-person camera: eye above the walker's feet, looking
      // where the walker looks. A gentle bob while levitating so the
      // hover reads in the view, not just in the pill.
      const bob = plutoState.mode === 'levitating' ? Math.sin(now / 350) * 0.12 : 0;
      camera.position.set(walker.pos.x, plutoState.y + WALK_EYE + bob, walker.pos.z);
      camera.rotation.set(walker.pitch, walker.yaw, 0);

      // Air state for the pill + gravity orb (React state, only on change).
      const heightM = Math.max(0, plutoState.y - plutoGroundHeight(walker.pos.x, walker.pos.z));
      const distM = distanceToDisc(walker.pos.x, walker.pos.z);
      const airKey = `${plutoState.mode}|${Math.round(heightM)}|${Math.round(distM)}`;
      if (airKey !== lastAirKey) {
        lastAirKey = airKey;
        airStateRef.current = { mode: plutoState.mode, heightM: Math.round(heightM), distM: Math.round(distM) };
        setAirState(airStateRef.current);
      }

      composer.render();
    };
    animate();

    const handleEngineResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleEngineResize);

    // Cleanup handle so unmount stops the loop + listener (Phase 2b).
    engineRef.current.dispose = () => {
      contextGuard.dispose();
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleEngineResize);
      try { pluto.dispose(); } catch { /* noop */ }
    };
  };

  // Pluto walk mode (Merlin, Nov 28): drags turn the walker's view
  // (drag-look, universal controls) — the floor disc never translates.
  // The floor group still holds the disc + the crystal ring together
  // (one platform, structurally), but its position never moves.

  // Tap math from the CANVAS rect, not the window: when the browser chrome
  // shows or hides, window size drifts from the drawing surface and taps
  // land off-target. The canvas rect is the surface the user actually sees.
  const canvasMouse = (e: React.PointerEvent) => {
    const dom = engineRef.current.renderer?.domElement;
    if (dom) {
      const rect = dom.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      }
    }
    return new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    lookDownRef.current = true;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
    const { camera, carouselGroup } = engineRef.current;
    if(!camera || !carouselGroup) return;

    const mouse = canvasMouse(e);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(carouselGroup.children);

    if (hits.length > 0) {
      const hit = hits[0].object as THREE.Mesh;
      pointerTimerRef.current = setTimeout(() => setLongPressedNode(hit.userData), 2000);
      return;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dist = Math.hypot(e.clientX - pointerDownPos.current.x, e.clientY - pointerDownPos.current.y);
    if (dist > 10 && pointerTimerRef.current) {
      clearTimeout(pointerTimerRef.current);
      pointerTimerRef.current = null;
    }
    // Drag-look (Pluto walk mode): a drag turns the walker's view.
    // Short, still taps still reach the crystal select below.
    if (lookDownRef.current && walkerRef.current && !uiOpenRef.current) {
      const dx = e.clientX - lastLookPos.current.x;
      const dy = e.clientY - lastLookPos.current.y;
      lastLookPos.current = { x: e.clientX, y: e.clientY };
      if (Math.abs(dx) + Math.abs(dy) > 0) applyLook(walkerRef.current, dx, dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    lookDownRef.current = false;
    if (pointerTimerRef.current) clearTimeout(pointerTimerRef.current);

    if (longPressedNode) {
       setLongPressedNode(null); 
       return; 
    }

    const dist = Math.hypot(e.clientX - pointerDownPos.current.x, e.clientY - pointerDownPos.current.y);
    if (dist > 10) return; 

    const { camera, carouselGroup } = engineRef.current;
    if(!camera || !carouselGroup) return;

    const mouse = canvasMouse(e);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(carouselGroup.children);

    if(hits.length > 0) {
       const hit = hits[0].object as THREE.Mesh;
       
       if(selectedMeshRef.current && selectedMeshRef.current !== hit) {
         const defaultY = (selectedMeshRef.current.userData.height || 4) / 2;
         gsap.to(selectedMeshRef.current.position, { y: defaultY, duration: 0.4 });
       }
       
       selectedMeshRef.current = hit;
       setSelectedNodeData(hit.userData);
       resetLockState();
       gsap.to(hit.position, { y: 3.5, duration: 0.4, ease: "back.out" }); 
    } else {
       if(selectedMeshRef.current) {
         const defaultY = (selectedMeshRef.current.userData.height || 4) / 2;
         gsap.to(selectedMeshRef.current.position, { y: defaultY, duration: 0.4 });
       }
       setSelectedNodeData(null);
       selectedMeshRef.current = null;
       resetLockState();
    }
  };

  const processMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    if (uploadTarget === 'crystal' && selectedNodeData) {
      const phrase = passphrase.trim();
      if (!phrase) {
        setStatusMsg("Enter a passphrase to lock this file first.");
        setTimeout(() => setStatusMsg(""), 3000);
        setUploadTarget(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setStatusMsg("Locking your file...");
      try {
        const zip = new JSZip();
        const manifest = { originName: file.name, mimeType: file.type, rawSizeBytes: file.size, timestamp: Date.now(), nodeId: selectedNodeData.id, encrypted: true };
        
        zip.file("manifest.json", JSON.stringify(manifest));
        zip.file("payload.dat", await file.arrayBuffer(), { binary: true });
        const zipBytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
        // Genuine client-side AES-GCM-256 (PBKDF2-SHA256 600k, per-file salt/IV).
        // The server only ever receives ciphertext — never the file, never the passphrase.
        const lockedBytes = await lockBlob(zipBytes, phrase);
        const lockedBlob = new Blob([lockedBytes as unknown as BlobPart], { type: 'application/octet-stream' });

        // The vault's per-file cap applies to the STORED (locked) blob, not
        // the original file — refuse up front in plain words instead of
        // failing mid-save on a bare size error. Client-side only: no extra
        // round trip; the server gate still runs on the upload-link call.
        const vaultLimit = vault?.fileSizeLimitBytes ?? VAULT_PER_FILE_LIMIT_BYTES;
        if (lockedBlob.size > vaultLimit) {
          setStatusMsg(`That file is ${formatBytes(lockedBlob.size)} once locked — the vault allows files up to ${formatBytes(vaultLimit)} each.`);
          setTimeout(() => setStatusMsg(""), 6000);
          setUploadTarget(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        setStatusMsg("Getting your upload link...");
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch('/api/request-upload-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ nodeId: manifest.nodeId, encrypted: true, fileSize: lockedBlob.size })
        });
        const { uploadUrl, fileStorageKey, error } = await response.json();
        if(error) throw new Error(error);
        
        setStatusMsg("Saving to your vault...");
        const putRes = await fetch(uploadUrl, { method: 'PUT', body: lockedBlob, headers: { 'Content-Type': 'application/octet-stream' }});
        if (!putRes.ok) throw new Error(`Server rejected file: ${putRes.status} ${putRes.statusText}. Please verify CORS rules.`);

        // The bytes landed — report them so the vault's used bytes stay true.
        try {
          const ures = await fetch('/api/fortress/usage', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ op: 'add', bytes: lockedBlob.size })
          });
          const u = await ures.json();
          if (!u.error) setQuota({ tier: u.tier, tierLabel: u.tierLabel, quotaBytes: u.quotaBytes, usedBytes: u.usedBytes, stackedBytes: u.stackedBytes ?? 0 });
        } catch { /* accounting refreshes on the next visit; the file itself is stored */ }
        
        if(selectedMeshRef.current) {
           selectedMeshRef.current.userData.fileStorageKey = fileStorageKey;
           selectedMeshRef.current.userData.name = manifest.originName;
           selectedMeshRef.current.userData.rawSize = manifest.rawSizeBytes;
           selectedMeshRef.current.userData.encrypted = true;
           
           const updatedNode = selectedMeshRef.current.userData;
           setSelectedNodeData({...updatedNode});
           
           const newMatrix = matrixData.map(c => c.id === updatedNode.id ? updatedNode : c);
           await syncDatabase(newMatrix);
        }
        
        // Crystal-saved cue: only here, after the PUT landed and the
        // matrix persisted — never on attempt, never on failure.
        flashCrystalSaved(selectedMeshRef.current);
        setStatusMsg("");
        resetLockState();
        alert("File encrypted and saved to your vault. Keep your passphrase — without it the file cannot be opened.");
      } catch(err: any) {
        setStatusMsg("Issue saving file: " + err.message);
        setTimeout(() => setStatusMsg(""), 4000);
      }
    } 
    else if (uploadTarget === 'floor' || uploadTarget === 'wall') {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      let texture: THREE.Texture;

      if (isVideo) {
         const video = document.createElement('video');
         video.src = url;
         video.loop = true;
         video.muted = true;
         video.playsInline = true;
         video.play();
         texture = new THREE.VideoTexture(video);
      } else {
         texture = new THREE.TextureLoader().load(url);
      }

      if (uploadTarget === 'floor' && engineRef.current.floorMesh) {
         engineRef.current.floorMesh.material.map = texture;
         engineRef.current.floorMesh.material.color.setHex(0xffffff); 
         engineRef.current.floorMesh.material.needsUpdate = true;
      } else if (uploadTarget === 'wall' && engineRef.current.outerDome) {
         engineRef.current.outerDome.material.map = texture;
         engineRef.current.outerDome.material.color.setHex(0xffffff);
         engineRef.current.outerDome.material.opacity = 0.5;
         engineRef.current.outerDome.material.needsUpdate = true;
      }
      setIsMenuOpen(false);
    }

    if(fileInputRef.current) fileInputRef.current.value = "";
    setUploadTarget(null);
  };

  // Locked files need the passphrase step; legacy (pre-encryption) files open directly.
  const beginExtract = (action: 'view' | 'download') => {
    if (isLockedNode(selectedNodeData)) {
      setPendingAction(action);
      setLockStep('extract');
    } else {
      handleExtract(action);
    }
  };

  const handleExtract = async (action: 'view' | 'download') => {
    if(!selectedNodeData?.fileStorageKey) return;
    const locked = isLockedNode(selectedNodeData);
    const phrase = passphrase.trim();
    if (locked && !phrase) {
      setStatusMsg("Enter the passphrase for this file to unlock it.");
      setTimeout(() => setStatusMsg(""), 3000);
      return;
    }
    setStatusMsg("Getting your download link...");
    
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const res = await fetch('/api/request-download-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ fileStorageKey: selectedNodeData.fileStorageKey })
      });
      const { downloadUrl, error } = await res.json();
      if(error) throw new Error(error);

      setStatusMsg(locked ? "Unlocking your file..." : "Opening your file...");
      const cloudStream = await fetch(downloadUrl);
      if (!cloudStream.ok) throw new Error(`Access Denied (${cloudStream.status}). Please check CORS configuration.`);

      let zipBytes: Uint8Array;
      if (locked) {
        try {
          zipBytes = await unlockBlob(new Uint8Array(await cloudStream.arrayBuffer()), phrase);
        } catch {
          throw new Error("Wrong passphrase — the file could not be unlocked.");
        }
      } else {
        // Legacy files stored before encryption existed: plain zip.
        zipBytes = new Uint8Array(await cloudStream.arrayBuffer());
      }

      const unzipped = await JSZip.loadAsync(zipBytes);
      const manifestStr = await unzipped.file("manifest.json")?.async("string");
      if(!manifestStr) throw new Error("File could not be read. Payload corrupted.");
      const manifest = JSON.parse(manifestStr);
      
      const payloadBlob = await unzipped.file("payload.dat")?.async("blob");
      const reconstructedBlob = new Blob([payloadBlob!], { type: manifest.mimeType });
      const localUrl = URL.createObjectURL(reconstructedBlob);
      
      setStatusMsg("");
      resetLockState();
      if(action === 'view') setActiveFileData({ url: localUrl, meta: manifest });
      else {
        const a = document.createElement('a'); a.href = localUrl; a.download = manifest.originName; a.click();
      }
    } catch(err:any) {
       setStatusMsg("Extraction Error: " + err.message);
       setTimeout(() => setStatusMsg(""), 4000);
    }
  }

  // Real share links: a time-limited bearer token into the selected crystal's
  // file. Encrypted files stay locked — the passphrase travels separately.
  const handleCreateShare = async () => {
    if (!selectedNodeData?.fileStorageKey) {
      setStatusMsg("Select a crystal holding a file to share it.");
      setTimeout(() => setStatusMsg(""), 4000);
      return;
    }
    setShareBusy(true);
    try {
      const res = await fetch('/api/fortress/shares', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ fileStorageKey: selectedNodeData.fileStorageKey, expiresInHours: 24 })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setShare({ url: data.url, expiresAt: data.expiresAt, token: data.token });
    } catch (err: any) {
      setStatusMsg("Could not create the share link: " + err.message);
      setTimeout(() => setStatusMsg(""), 4000);
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!share) return;
    setShareBusy(true);
    try {
      const res = await fetch('/api/fortress/shares', {
        method: 'DELETE',
        headers: await authHeaders(),
        body: JSON.stringify({ token: share.token })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setShare(null);
      setStatusMsg("Share link revoked.");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err: any) {
      setStatusMsg("Could not revoke the share link: " + err.message);
      setTimeout(() => setStatusMsg(""), 4000);
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShare = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setStatusMsg("Share link copied to your clipboard.");
    } catch {
      setStatusMsg("Copy this link from the field above.");
    }
    setTimeout(() => setStatusMsg(""), 4000);
  };

  // Remove the stored file for good: cloud object deleted, bytes released.
  const handleRemoveFile = async () => {
    if (!selectedNodeData?.fileStorageKey || !selectedMeshRef.current) return;
    setRemoveBusy(true);
    try {
      const res = await fetch('/api/fortress/delete-file', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          fileStorageKey: selectedNodeData.fileStorageKey,
          bytes: selectedNodeData.rawSize || 0,
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const updatedNode: any = {
        ...selectedMeshRef.current.userData,
        fileStorageKey: "",
        name: `Crystal ${matrixData.findIndex((c: any) => c.id === selectedNodeData.id) + 1}`,
        rawSize: 0,
      };
      delete updatedNode.encrypted;
      setSelectedNodeData({ ...updatedNode });
      const newMatrix = matrixData.map((c: any) => c.id === updatedNode.id ? updatedNode : c);
      await syncDatabase(newMatrix);
      setQuota({ tier: data.tier, tierLabel: data.tierLabel, quotaBytes: data.quotaBytes, usedBytes: data.usedBytes, stackedBytes: data.stackedBytes ?? 0 });

      setConfirmRemove(false);
      resetLockState();
      setShare(null);
      setStatusMsg("File removed from your vault.");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err: any) {
      setStatusMsg("Could not remove the file: " + err.message);
      setTimeout(() => setStatusMsg(""), 4000);
    } finally {
      setRemoveBusy(false);
    }
  };
  
  const searchCrystals = (query: string) => {
      setSearchQuery(query);
      const q = query.trim().toLowerCase();
      const { carouselGroup } = engineRef.current;
      if (!q || !carouselGroup) return;
      // Select the first crystal whose name matches, the same as tapping it.
      const hit = (carouselGroup.children as THREE.Mesh[])
        .find((mesh) => String(mesh.userData?.name || "").toLowerCase().includes(q));
      if (!hit) return;
      if (selectedMeshRef.current && selectedMeshRef.current !== hit) {
        const defaultY = (selectedMeshRef.current.userData.height || 4) / 2;
        gsap.to(selectedMeshRef.current.position, { y: defaultY, duration: 0.4 });
      }
      selectedMeshRef.current = hit;
      setSelectedNodeData({ ...hit.userData });
      resetLockState();
      gsap.to(hit.position, { y: 3.5, duration: 0.4, ease: "back.out" });
  };

  const handleRecenter = () => {
      // Walk mode: back to the landing point on the crystal floor,
      // facing the ring, gravity back on — the place you land when
      // you arrive.
      const walker = walkerRef.current;
      const plutoState = plutoRef.current;
      if (!walker || !plutoState) return;
      walker.pos.x = LANDING.x;
      walker.pos.z = LANDING.z;
      walker.yaw = LANDING.yaw;
      walker.pitch = 0;
      walker.jumpY = 0;
      walker.jumpV = 0;
      walker.grounded = true;
      plutoState.mode = 'grounded';
      plutoState.y = plutoGroundHeight(LANDING.x, LANDING.z);
      plutoState.onDisc = true;
      gravityOnRef.current = true;
      setGravityOn(true);
  };
  
  const handleColorChange = async (color: string) => {
      if(selectedMeshRef.current) {
          const mat = selectedMeshRef.current.material as THREE.MeshStandardMaterial;
          mat.color.set(color);
          mat.emissive.set(color);
          selectedMeshRef.current.userData.color = color;
          
          const updatedNode = selectedMeshRef.current.userData;
          setSelectedNodeData({...updatedNode});
          const newMatrix = matrixData.map(c => c.id === updatedNode.id ? updatedNode : c);
          await syncDatabase(newMatrix);
      }
  }
  
  const handleNameChange = async (newName: string) => {
      if(selectedMeshRef.current) {
          selectedMeshRef.current.userData.name = newName;
          const updatedNode = selectedMeshRef.current.userData;
          setSelectedNodeData({...updatedNode});
          const newMatrix = matrixData.map(c => c.id === updatedNode.id ? updatedNode : c);
          await syncDatabase(newMatrix);
      }
  }

  const handleAddCrystal = async () => {
      const group = engineRef.current.carouselGroup;
      if(!group) return;
      
      const newHeight = 4 + Math.random() * 1.5;
      const newNodeData = {
          id: `node_${Date.now()}_new`,
          name: `Crystal ${matrixData.length + 1}`,
          color: '#00f2ff',
          fileStorageKey: "",
          rawSize: 0,
          height: newHeight
      };
      
      const newMatrix = [...matrixData, newNodeData];
      
      group.children.forEach((mesh: THREE.Mesh, i: number) => {
         const angle = (i / newMatrix.length) * Math.PI * 2;
         gsap.to(mesh.position, { x: Math.cos(angle) * 11, z: Math.sin(angle) * 11, duration: 1 });
      });
      
      const angle = ((newMatrix.length - 1) / newMatrix.length) * Math.PI * 2;
      const node = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.4, newHeight, 6), 
          new THREE.MeshStandardMaterial({ 
            map: new THREE.TextureLoader().load('/IMG_2876.png'), 
            color: '#00f2ff', emissive: '#00f2ff', emissiveIntensity: 0.4, 
            metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending 
          })
      );
      node.position.set(Math.cos(angle) * 11, newHeight / 2, Math.sin(angle) * 11);
      node.userData = newNodeData;
      group.add(node);
      collidersRef.current = crystalColliders(newMatrix);

      await syncDatabase(newMatrix);
  }

  if (cloudOffline) return (
    <div className="w-screen h-dvh bg-black flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-zinc-300 tracking-widest uppercase text-sm mb-3">Cloud features are offline</p>
        <p className="text-zinc-500 text-sm mb-6">
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <BackButton label="Exit matrix" />
      </div>
    </div>
  )

  if (!mounted || !user) return <div className="w-screen h-dvh bg-black" />

  return (
    <div className="w-full h-full relative">
      <BackButton label="EXIT MATRIX" />

      <div 
        ref={canvasContainerRef} 
        className="absolute inset-0 z-0 pointer-events-auto" 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <input type="file" ref={fileInputRef} className="hidden" accept="*/*" onChange={processMediaUpload} />

      {/* Pluto walk controls (universal controls core): joystick to
          walk, drag to look, gravity orb to rise and come back down.
          The hint sits below the search bar (topOffsetPx 76) so it
          never covers it; there is no fullscreen orb here — the page
          is already full-viewport. */}
      <ControlsCore
        world="fortress-of-solitude"
        accent="#00f2ff"
        onMove={(x, y) => { joyRef.current = { x, y }; }}
        hint="Joystick to walk · drag to look · walk off the floor to levitate"
        topOffsetPx={76}
        onJump={undefined}
        onFire={undefined}
        onOpenBackpack={undefined}
        onOpenMerchant={undefined}
        hp={undefined}
        orbs={undefined}
        fullscreen={undefined}
        onToggleFullscreen={undefined}
        columnBottom={undefined}
      >
        {/* Gravity orb — the switch Merlin ordered: tap to turn
            gravity off and rise, tap again to come back down. It
            always shows what the tap will do: RISE while gravity is
            on, DOWN while you are rising or levitating. Plain
            circle orb, bottom-right, fixed so it is always findable.
            It sits at bottom 168 — NOT the usual 80 px floor: the
            site-wide Concourse orb (fixed, z-58, draggable, default
            home bottom 96 right ~17) covers the bottom-right slot
            and swallowed every tap meant for this orb (its face sat
            on top of the gravity orb, so the tap never reached it).
            Bottom 168 clears the Concourse orb's home by 16 px and
            sits far above the radio bar too. It fires on pointerdown,
            not click — the press-action pattern JUMP and FIRE use in
            this core, so it answers the instant the finger lands. */}
        <OrbButton
          fn={gravityOn ? 'ascend' : 'descend'}
          accent="#00f2ff"
          size={56}
          ariaLabel={gravityOn ? 'Gravity on — tap to turn gravity off and rise' : 'Gravity off — tap to turn gravity on and come back down'}
          title={gravityOn ? 'Gravity off — rise' : 'Gravity on — come back down'}
          active={!gravityOn}
          art={undefined}
          bg={undefined}
          href={undefined}
          onPointerDown={toggleGravity}
          style={{ position: 'absolute', right: 14, bottom: 'calc(168px + env(safe-area-inset-bottom))', zIndex: 7, pointerEvents: 'auto' }}
        >
          <OrbLabel>{gravityOn ? 'RISE' : 'DOWN'}</OrbLabel>
        </OrbButton>
      </ControlsCore>

      {/* Airborne pill — only while levitating, rising or descending. */}
      {airState.mode !== 'grounded' && (
        <div role="status" style={{ position: 'absolute', left: '50%', top: 132, transform: 'translateX(-50%)', zIndex: 8, maxWidth: 'calc(100% - 32px)', textAlign: 'center', background: 'rgba(0,0,0,0.65)', border: '1px solid #00f2ff', borderRadius: 999, padding: '7px 14px', fontSize: 12, letterSpacing: 0.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
          {airState.mode === 'levitating' && `LEVITATING — tap the gravity orb to rise${airState.distM > 0 ? ` · ${airState.distM} m from the floor` : ''}`}
          {airState.mode === 'rising' && `RISING — ${airState.heightM} m up · tap the orb to come back down`}
          {airState.mode === 'descending' && `COMING DOWN — ${airState.heightM} m up`}
        </div>
      )}

      <div className="fixed top-6 left-0 w-full z-10 flex justify-center pointer-events-none">
        <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => searchCrystals(e.target.value)}
            placeholder="Search your crystals..." 
            className="w-11/12 max-w-[700px] bg-black/60 border border-cyan-400/50 rounded-full py-3 px-6 text-center text-sm tracking-wider text-white backdrop-blur-md shadow-[0_5px_20px_rgba(0,0,0,0.5)] focus:border-cyan-400 pointer-events-auto outline-none transition-colors"
        />
      </div>

      {/* Top-right controls: Recenter + the menu toggle share one row
          below the search bar. The menu used to live bottom-left, where
          the browser's bottom bar pushed it off-screen on his phone and
          its invisible collapsed box swallowed taps on the low crystals;
          the top row stays visible in every view, and the cluster box
          itself never takes taps — only its buttons do. */}

      {longPressedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm">
          <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center border-cyan-400 shadow-[0_0_50px_rgba(0,242,255,0.4)] animate-pulse min-w-[280px]">
             <span className="text-cyan-400 tracking-widest text-xs mb-2">TARGET LOCKED</span>
             <h2 className="text-3xl text-white font-bold tracking-widest drop-shadow-[0_0_10px_#00f2ff] mb-4">
                {longPressedNode.name}
             </h2>
             {longPressedNode.fileStorageKey ? (
                <span className="bg-green-500/20 border border-green-400 text-green-400 text-[10px] px-3 py-1 rounded-full tracking-widest">DATA MATRIX ACTIVE</span>
             ) : (
                <span className="bg-red-500/20 border border-red-400 text-red-400 text-[10px] px-3 py-1 rounded-full tracking-widest">EMPTY CORE</span>
             )}
          </div>
        </div>
      )}

      {selectedNodeData && !longPressedNode && (
         <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 glass-panel p-6 rounded-2xl flex flex-col gap-5 w-11/12 max-w-[320px] shadow-[0_0_50px_rgba(0,242,255,0.15)] pointer-events-auto">
            {savedFlash && (
              <div className="w-full rounded-xl border border-green-400/60 bg-green-500/15 px-3 py-2 text-center text-[11px] tracking-widest text-green-300">
                ✓ SAVED TO THIS CRYSTAL
              </div>
            )}
            <input 
              type="text" 
              value={selectedNodeData.name} 
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full bg-transparent border-b border-cyan-400/50 focus:border-cyan-400 text-center text-lg text-white outline-none pb-2 font-bold tracking-wider transition-colors"
              placeholder="Name this crystal..."
            />
            
            {!selectedNodeData.fileStorageKey ? (
               lockStep === 'store' ? (
                 <div className="flex flex-col gap-3">
                   <p className="text-[11px] tracking-widest text-cyan-300/80 text-center leading-relaxed">
                     LOCK IT WITH A PASSPHRASE —<br/>only you know it. It is never stored or sent anywhere.
                   </p>
                   <input
                     type="password"
                     value={passphrase}
                     onChange={(e) => setPassphrase(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') { setUploadTarget('crystal'); fileInputRef.current?.click(); } }}
                     placeholder="Your passphrase..."
                     className="w-full bg-black/60 border border-cyan-400/50 rounded-xl py-3 px-4 text-center text-sm text-white outline-none focus:border-cyan-400"
                   />
                   <div className="flex gap-2">
                     <button className="btn flex-1 flex items-center justify-center gap-2 py-3" onClick={() => { setUploadTarget('crystal'); fileInputRef.current?.click(); }}><Upload size={16}/> Choose file</button>
                     <button className="btn flex-1 py-3 border-gray-400 text-gray-400 hover:bg-white/10" onClick={resetLockState}>Cancel</button>
                   </div>
                   <p className="text-[10px] tracking-widest text-white/40 text-center">{vault?.capFallback ? 'Per-file size follows your Supabase plan' : `Files up to ${formatBytes(vault?.fileSizeLimitBytes ?? VAULT_PER_FILE_LIMIT_BYTES)} each once locked`}</p>
                 </div>
               ) : (
                 <button className="btn w-full flex items-center justify-center gap-2 py-4" onClick={() => setLockStep('store')}><Upload size={18}/> Store File Inside</button>
               )
            ) : (
               lockStep === 'extract' ? (
                 <div className="flex flex-col gap-3">
                   <p className="text-[11px] tracking-widest text-cyan-300/80 text-center leading-relaxed">
                     ENTER THE PASSPHRASE<br/>YOU LOCKED THIS FILE WITH.
                   </p>
                   <input
                     type="password"
                     value={passphrase}
                     onChange={(e) => setPassphrase(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter' && pendingAction) handleExtract(pendingAction); }}
                     placeholder="Your passphrase..."
                     className="w-full bg-black/60 border border-cyan-400/50 rounded-xl py-3 px-4 text-center text-sm text-white outline-none focus:border-cyan-400"
                   />
                   <div className="flex gap-2">
                     <button className="btn flex-1 py-3" onClick={() => pendingAction && handleExtract(pendingAction)}>Unlock</button>
                     <button className="btn flex-1 py-3 border-gray-400 text-gray-400 hover:bg-white/10" onClick={resetLockState}>Cancel</button>
                   </div>
                 </div>
               ) : (
                 <div className="flex gap-3">
                   <button className="btn flex-1 flex items-center justify-center gap-2" onClick={() => beginExtract('view')}><Eye size={16}/> Inspect</button>
                   <button className="btn flex-1 flex items-center justify-center gap-2 border-fuchsia-500 text-fuchsia-500 hover:bg-fuchsia-500/10 hover:shadow-[0_0_15px_#d946ef]" onClick={() => beginExtract('download')}><Download size={16}/> Extract</button>
                 </div>
               )
            )}

            {selectedNodeData.fileStorageKey && (
              <div className="flex flex-col gap-3 mt-1 p-3 bg-black/40 rounded-xl border border-white/10">
                <span className="text-[10px] tracking-widest text-white/50 flex items-center gap-2"><Link2 size={12}/> SHARE THIS FILE</span>
                {share ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text" readOnly value={share.url}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-black/60 border border-cyan-400/30 rounded-lg py-2 px-3 text-[11px] text-cyan-200 outline-none"
                    />
                    <div className="text-[10px] text-white/50 tracking-wider text-center">
                      Expires {new Date(share.expiresAt).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-amber-300/80 tracking-wider text-center leading-relaxed">
                      {SHARE_PASSPHRASE_NOTE}
                    </div>
                    <div className="flex gap-2">
                      <button className="btn flex-1 py-2 flex items-center justify-center gap-2" onClick={handleCopyShare}><Copy size={14}/> Copy</button>
                      <button className="btn flex-1 py-2 border-red-400 text-red-400 hover:bg-red-500/10" disabled={shareBusy} onClick={handleRevokeShare}><XCircle size={14}/> Revoke</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn w-full py-3 flex items-center justify-center gap-2" disabled={shareBusy} onClick={handleCreateShare}>
                    <Link2 size={16}/> {shareBusy ? "Creating…" : "Create share link"}
                  </button>
                )}
              </div>
            )}

            {selectedNodeData.fileStorageKey && (
              confirmRemove ? (
                <div className="flex flex-col gap-2 p-3 bg-red-950/40 rounded-xl border border-red-500/40">
                  <p className="text-[11px] tracking-widest text-red-300 text-center leading-relaxed">
                    REMOVE THIS FILE FOR GOOD?<br/>It cannot be recovered.
                  </p>
                  <div className="flex gap-2">
                    <button className="btn flex-1 py-2 border-red-400 text-red-400 hover:bg-red-500/20" disabled={removeBusy} onClick={handleRemoveFile}>
                      <Trash2 size={14}/> {removeBusy ? "Removing…" : "Remove"}
                    </button>
                    <button className="btn flex-1 py-2 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => setConfirmRemove(false)}>Keep</button>
                  </div>
                </div>
              ) : (
                <button className="btn w-full py-2 border-red-400/60 text-red-400/80 hover:bg-red-500/10 text-[10px] flex items-center justify-center gap-2" onClick={() => setConfirmRemove(true)}>
                  <Trash2 size={14}/> Remove stored file
                </button>
              )
            )}
            
            <div className="flex flex-col items-center mt-2 p-3 bg-black/40 rounded-xl border border-white/10">
               <span className="text-[10px] tracking-widest text-white/50 mb-3 flex items-center gap-2"><Palette size={12}/> CHOOSE RESONANCE</span>
               <input type="color" value={selectedNodeData.color} onChange={(e) => handleColorChange(e.target.value)} className="w-full h-10 cursor-pointer rounded-lg border-none bg-transparent" />
            </div>
         </div>
      )}

      <div className="fixed top-20 right-6 z-20 flex flex-col items-end gap-3 pointer-events-none">
        <div className="flex gap-3 pointer-events-auto">
          <button onClick={handleRecenter} aria-label="Recenter view" className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-cyan-400 hover:bg-cyan-400 hover:text-black transition-all shadow-[0_0_15px_rgba(0,242,255,0.3)]"><Crosshair size={20} /></button>
          <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Fortress menu"
              className={`w-12 h-12 rounded-full glass-panel flex items-center justify-center text-cyan-400 transition-all duration-300 ${isMenuOpen ? 'rotate-45 shadow-[0_0_20px_#00f2ff]' : 'shadow-[0_0_15px_rgba(0,242,255,0.2)]'}`}
          >
              <Plus size={28} />
          </button>
        </div>

        <div className={`flex flex-col gap-3 transition-all duration-300 origin-top-right ${isMenuOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-0 opacity-0 pointer-events-none'}`}>
            <button className="btn flex items-center gap-2 py-3 px-5" onClick={handleAddCrystal}><Plus size={16}/> Generate Crystal</button>
            <button className="btn flex items-center gap-2 py-3 px-5" onClick={() => setTiersOpen(true)}><ArrowUpCircle size={16}/> Vault storage{quota ? ` — ${quota.tierLabel}` : ""}</button>
            <button className="btn flex items-center gap-2 py-3 px-5" onClick={() => setTempOpen(true)}><Upload size={16}/> Temporary upload</button>

            <div className="flex gap-2">
              <button className="btn flex-1 flex justify-center py-3 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => { setUploadTarget('floor'); fileInputRef.current?.click(); }}><Grid size={16} className="mr-2"/> Set Floor</button>
              <button className="btn flex-1 flex justify-center py-3 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => { setUploadTarget('wall'); fileInputRef.current?.click(); }}><MonitorPlay size={16} className="mr-2"/> Set Walls</button>
            </div>

            <div className="glass-panel p-4 rounded-xl mt-2 w-full max-w-[280px]">
                <div className="text-[10px] text-cyan-400 tracking-wider mb-3 flex justify-between">
                   <span>{quota ? quota.tierLabel.toUpperCase() : "STORAGE"}</span>
                   <span>{quota ? `${formatBytes(quota.usedBytes)} of ${formatBytes(quota.quotaBytes)}` : `${(storageUsed / (1024*1024)).toFixed(2)} MB`}</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 shadow-[0_0_10px_#00f2ff]" style={{ width: `${quota ? Math.min((quota.usedBytes / Math.max(quota.quotaBytes, 1)) * 100, 100) : Math.min((storageUsed / (2000 * 1024 * 1024)) * 100, 100)}%` }} />
                </div>
                {!quota && vault === null && <div className="text-[10px] text-white/40 tracking-wider mt-2 text-center">Connecting to your vault…</div>}
                {vault !== null && !vault.ready && vault.error && <div className="text-[10px] text-red-300/90 tracking-wider mt-2 text-center leading-relaxed">Vault not ready: {vault.error}</div>}
                {vault !== null && vault.ready && <div className="text-[10px] text-cyan-300/80 tracking-wider mt-2 text-center">{vault.capFallback ? 'Vault connected · per-file size follows your Supabase plan' : `Vault connected · Files up to ${formatBytes(vault.fileSizeLimitBytes ?? VAULT_PER_FILE_LIMIT_BYTES)} each${vault.capAligned ? ' · vault cap updated' : ''}`}</div>}
            </div>
        </div>
      </div>

      {statusMsg && (
          <div className="fixed top-[10%] left-1/2 -translate-x-1/2 z-50 glass-panel px-6 py-3 rounded-xl text-cyan-400 font-bold tracking-wider text-sm pointer-events-none shadow-[0_0_20px_rgba(0,242,255,0.3)] backdrop-blur-xl">
              {statusMsg}
          </div>
      )}

      {activeFileData && (
          <HoloframeViewer 
             url={activeFileData.url} 
             meta={activeFileData.meta} 
             onClose={() => {
                URL.revokeObjectURL(activeFileData.url);
                setActiveFileData(null);
             }} 
          />
      )}

      {tiersOpen && (
        <StorageTiers
          currentTier={quota?.tier || 'free'}
          usedBytes={quota?.usedBytes ?? storageUsed}
          quotaBytes={quota?.quotaBytes ?? FREE_QUOTA_BYTES}
          stackedBytes={quota?.stackedBytes ?? 0}
          onAscend={handleAscend}
          onAscendCustom={handleAscendCustom}
          onClose={() => setTiersOpen(false)}
        />
      )}

      {tempOpen && (
        <TempUpload
          matrixData={matrixData}
          syncDatabase={syncDatabase}
          authHeaders={authHeaders}
          onClose={() => setTempOpen(false)}
        />
      )}

    </div>
  );
}


