// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { supabase } from '@/lib/supabase';
import { BackButton } from '@/components/ui';
import { Orbitron, Rajdhani } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700'] });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['400', '600'] });

export default function GeometryEngine() {
  const router = useRouter();
  const canvasContainerRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    // The shared supabase client throws when the database connection isn't
    // configured. Catch that (and any auth failure) and say so honestly
    // instead of crashing into the error boundary.
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          if (window.top === window.self) router.push('/');
          else document.body.innerHTML = '<div style="color:#00f2ff; text-align:center; padding:50px; font-family:monospace;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
          return;
        }
        setMounted(true);
      }).catch(() => setCloudOffline(true));
    } catch {
      setCloudOffline(true);
    }

    if (!canvasContainerRef.current) return;
    let reqId;

    let canvasWidth = 380, canvasHeight = 570;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, canvasWidth / canvasHeight, 0.1, 100);
    camera.position.set(0, 0, 6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.2));
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setClearColor(0x000000, 0);
    canvasContainerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 2.5; controls.maxDistance = 12;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.4); dirLight.position.set(4, 6, 5); scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x88ccff, 1.1); rimLight.position.set(-5, -3, -6); scene.add(rimLight);

    let mesh, material, basePositions, historyStack = [], currentGeometryType = 'plane';
    material = new THREE.MeshStandardMaterial({ color: 0x08f7fe, metalness: 0.75, roughness: 0.25, side: THREE.DoubleSide });

    function createNewGeometry(type) {
        if (mesh) scene.remove(mesh);
        currentGeometryType = type;
        let geom;
        switch(type) {
            case 'torus': geom = new THREE.TorusGeometry(1.15, 0.42, 64, 96); break;
            case 'cylinder': geom = new THREE.CylinderGeometry(1.05, 1.05, 2.4, 64, 64); break;
            case 'cone': geom = new THREE.ConeGeometry(1.25, 2.4, 64, 64); break;
            case 'cube': geom = new THREE.BoxGeometry(1.9, 1.9, 1.9, 48, 48, 48); break;
            case 'icosahedron': geom = new THREE.IcosahedronGeometry(1.45, 10); break;
            case 'plane': geom = new THREE.PlaneGeometry(3.2, 4.8, 64, 64); break;
            case 'knot': geom = new THREE.TorusKnotGeometry(0.85, 0.32, 128, 64, 2, 3); break;
            default: geom = new THREE.SphereGeometry(1.45, 96, 96);
        }
        geom = geom.toNonIndexed();
        geom.attributes.position.setUsage(THREE.DynamicDrawUsage);
        mesh = new THREE.Mesh(geom, material);
        scene.add(mesh);
        basePositions = new Float32Array(mesh.geometry.attributes.position.array);
        historyStack = [];
        historyStack.push(new Float32Array(basePositions));
    }
    window.createNewGeometry = createNewGeometry;
    createNewGeometry('plane');

    function animate() {
        reqId = requestAnimationFrame(animate);
        controls.update();
        if (mesh) { mesh.rotation.y += 0.0035; mesh.rotation.x += 0.0018; }
        renderer.render(scene, camera);
    }
    animate();

    const panels = { cover: document.getElementById('panel-cover'), sculpt: document.getElementById('panel-sculpt'), shapes: document.getElementById('panel-shapes'), audio: document.getElementById('panel-audio'), ai: document.getElementById('panel-ai') };
    window.togglePanel = function(key) {
        Object.keys(panels).forEach(k => { const active = k === key; panels[k]?.classList.toggle('active', active); document.getElementById(`icon-${k}`)?.classList.toggle('active', active); });
    };

    window.exportGeometry = async function() {
        const originalText = document.getElementById('btn-export').innerText;
        document.getElementById('btn-export').innerText = "SYNTHESIZING...";
        renderer.render(scene, camera);
        
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasWidth; exportCanvas.height = canvasHeight;
        const ctx = exportCanvas.getContext('2d');
        ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(renderer.domElement, 0, 0);
        
        const base64Image = exportCanvas.toDataURL('image/png', 0.95);

        if (window.parent !== window) {
            window.parent.postMessage({ type: 'COVER_EXPORT', image: base64Image }, '*');
            document.getElementById('btn-export').innerText = "PUSH SUCCESSFUL";
        } else {
            const link = document.createElement('a'); link.download = `omni-cover-${Date.now()}.png`; link.href = base64Image; link.click();
            document.getElementById('btn-export').innerText = "DOWNLOAD COMPLETE";
        }
        setTimeout(() => { document.getElementById('btn-export').innerText = originalText; }, 3000);
    };

    return () => cancelAnimationFrame(reqId);
  }, [router]);

  if (cloudOffline) return (
    <div style={{ background: '#050508', width: '100vw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', fontFamily: 'monospace' }}>
        <p style={{ color: '#00f2ff', letterSpacing: 3, fontSize: 13, textTransform: 'uppercase', marginBottom: 12 }}>
          Cloud features are offline
        </p>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <BackButton label="Back to Hub" />
      </div>
    </div>
  );

  if (!mounted) return <div style={{background: '#050508', width: '100vw', height: '100dvh'}}></div>;

  return (
    <>
      <style>{`
        .engine-wrapper { --bg-obsidian: #050508; --neon-cyan: #00f2ff; --neon-magenta: #fe53bb; --neon-gold: #FFD700; --panel-bg: rgba(12, 12, 18, 0.94); margin: 0; overflow: hidden; background-color: var(--bg-obsidian); color: #fff; display: flex; flex-direction: column; height: 100dvh; width: 100vw; }
        .engine-wrapper::before { content: ""; position: fixed; inset: 0; background-image: linear-gradient(rgba(8, 247, 254, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(8, 247, 254, 0.03) 1px, transparent 1px); background-size: 40px 40px; z-index: 0; pointer-events: none; }
        header { width: 100%; background: rgba(5, 5, 8, 0.95); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(8, 247, 254, 0.3); padding: 12px 5%; display: flex; justify-content: space-between; align-items: center; z-index: 100; flex-shrink: 0; }
        .logo { font-size: 1.45rem; font-weight: bold; color: var(--neon-cyan); text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 12px rgba(8, 247, 254, 0.5); }
        .export-btn { background: rgba(8, 247, 254, 0.1); border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 0.65rem 1.8rem; border-radius: 4px; font-weight: bold; font-size: 0.88rem; cursor: pointer; transition: all 0.3s; letter-spacing: 1px; }
        .export-btn:hover { background: var(--neon-cyan); color: #000; box-shadow: 0 0 20px rgba(8, 247, 254, 0.7); }
        .video-hero { position: relative; width: 100%; height: 18vh; min-height: 120px; max-height: 200px; flex-shrink: 0; overflow: hidden; background: #000; border-bottom: 1px solid rgba(8, 247, 254, 0.2); z-index: 50; }
        .hero-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.8; mix-blend-mode: screen; }
        .hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(5,5,8,0.1) 0%, var(--bg-obsidian) 95%); z-index: 2; }
        #engine-workspace { position: relative; flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden; z-index: 10; }
        #canvas-container { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; padding-bottom: 80px; }
        #book-face { position: relative; box-shadow: 0 40px 110px rgba(0,0,0,0.95), 0 0 0 1px rgba(8,247,254,0.18), inset 0 0 90px rgba(8,247,254,0.06); border-radius: 8px; overflow: hidden; touch-action: none; width:380px; height:570px; background:#050508; }
        #book-face canvas { position: relative; z-index: 2; display: block; outline: none; }
        #footer-dock { position: absolute; bottom: max(20px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; gap: 18px; background: rgba(7,7,10,0.9); padding: 10px 22px; border-radius: 50px; border: 1px solid rgba(8,247,254,0.35); backdrop-filter: blur(16px); box-shadow: 0 10px 35px rgba(0,0,0,0.85); }
        .dock-icon { background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); color: #fff; width: 50px; height: 50px; border-radius: 50%; cursor: pointer; font-size: 1.35rem; display: flex; justify-content: center; align-items: center; transition: all 0.25s; }
        .dock-icon:hover, .dock-icon.active { border-color: var(--neon-cyan); color: var(--neon-cyan); box-shadow: 0 0 20px rgba(8, 247, 254, 0.5); transform: scale(1.12); background: rgba(8, 247, 254, 0.15); }
        .ui-panel { position: absolute; bottom: 95px; left: 25px; background: var(--panel-bg); border: 1px solid rgba(8, 247, 254, 0.25); border-left: 4px solid var(--neon-magenta); padding: 24px; width: 320px; max-height: calc(100% - 110px); overflow-y: auto; display: flex; flex-direction: column; gap: 18px; border-radius: 10px; backdrop-filter: blur(20px); z-index: 1000; opacity: 0; transform: translateY(25px) scale(0.94); pointer-events: none; transition: all 0.32s; }
        .ui-panel.active { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
        h2 { font-size: 0.98rem; color: var(--neon-magenta); text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid rgba(254,83,187,0.3); padding-bottom: 8px; margin: 0; }
        .shape-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .shape-btn { background: rgba(0,0,0,0.6); border: 1px solid #333; color: #ccc; padding: 16px 8px; cursor: pointer; text-align: center; font-size: 0.86rem; border-radius: 6px; }
      `}</style>
      <div className={`engine-wrapper ${rajdhani.className}`}>
        <header>
            <div className={`logo ${orbitron.className}`}>NEXUS ENGINE</div>
            <button className={`export-btn ${orbitron.className}`} id="btn-export" onClick={() => window.exportGeometry()}>Download PNG</button>
        </header>

        <div className="video-hero">
            <video id="hero-video" autoPlay loop muted playsInline className="hero-video" src="/assets/geometry-engine/hero-gemini.mp4"></video>
            <div className="hero-overlay"></div>
        </div>

        <div id="engine-workspace">
            <div id="canvas-container">
                <div id="book-face" ref={canvasContainerRef}></div>
            </div>

            <div id="footer-dock">
                <button className="dock-icon active" id="icon-shapes" onClick={() => window.togglePanel('shapes')} title="Geometry Library">🔷</button>
            </div>

            <div id="panel-shapes" className="ui-panel active">
                <h2 className={orbitron.className}>Geometry Library</h2>
                <div className="shape-grid">
                    <button className={`shape-btn ${orbitron.className}`} onClick={() => window.createNewGeometry('sphere')}>Sphere</button>
                    <button className={`shape-btn ${orbitron.className}`} onClick={() => window.createNewGeometry('torus')}>Torus</button>
                    <button className={`shape-btn ${orbitron.className}`} onClick={() => window.createNewGeometry('cylinder')}>Cylinder</button>
                    <button className={`shape-btn ${orbitron.className}`} onClick={() => window.createNewGeometry('cube')}>Cube</button>
                </div>
            </div>
        </div>
      </div>
    </>
  );
}


