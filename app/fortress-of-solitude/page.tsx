"use client";

import React, { useEffect, useState, useRef } from "react";
import { Plus, Share2, Download, Eye, Upload, Palette, MonitorPlay, Grid } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import gsap from "gsap";
import JSZip from "jszip";
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

import HoloframeViewer from "@/components/fortress/HoloframeViewer";

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

  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  const [activeFileData, setActiveFileData] = useState<{url: string, meta: any} | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [longPressedNode, setLongPressedNode] = useState<any>(null);
  
  const engineRef = useRef<any>({}); 
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
                color: '#00ffff',
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

    return () => subscription?.unsubscribe()
  }, [router]);

  const syncDatabase = async (newMatrix: any[]) => {
      setMatrixData(newMatrix);
      if(!user) return;
      await supabase.from('fortresses_').upsert({ id: user.id, crystal_matrix: newMatrix, updated_at: new Date().toISOString() });
      const used = newMatrix.reduce((acc: number, curr: any) => acc + (curr.rawSize || 0), 0);
      setStorageUsed(used);
  };

  const initThreeJSEngine = (matrix: any[]) => {
    if (engineRef.current.initialized || !canvasContainerRef.current) return;
    engineRef.current.initialized = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 15, 35);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    canvasContainerRef.current.appendChild(renderer.domElement);

    const carouselGroup = new THREE.Group();
    scene.add(carouselGroup);

    const loader = new THREE.TextureLoader();
    
    const outerDome = new THREE.Mesh(
      new THREE.SphereGeometry(60, 40, 40), 
      new THREE.MeshBasicMaterial({ map: loader.load('/IMG_2875.png'), side: THREE.BackSide, transparent: true, opacity: 0.2 })
    );
    scene.add(outerDome);

    const innerDome = new THREE.Mesh(
      new THREE.SphereGeometry(59, 40, 40), 
      new THREE.MeshBasicMaterial({ map: loader.load('/IMG_2876.png'), side: THREE.BackSide, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending })
    );
    scene.add(innerDome);
    
    const floorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(15, 128), 
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.85);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI * 0.48;

    matrix.forEach((nodeData, i) => {
        const angle = (i / matrix.length) * Math.PI * 2;
        const node = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.4, nodeData.height, 6), 
            new THREE.MeshStandardMaterial({ 
              map: loader.load('/IMG_2876.png'), 
              color: nodeData.color,
              emissive: nodeData.color, 
              emissiveIntensity: 0.4, 
              metalness: 0.9, 
              roughness: 0.1,
              transparent: true,
              opacity: 0.85,
              blending: THREE.AdditiveBlending
            })
        );
        node.position.set(Math.cos(angle) * 11, nodeData.height / 2, Math.sin(angle) * 11);
        node.userData = nodeData;
        carouselGroup.add(node);
    });

    engineRef.current = { scene, camera, renderer, composer, controls, carouselGroup, outerDome, floorMesh };

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      carouselGroup.rotation.y += 0.0015;
      composer.render();
    };
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    const { camera, carouselGroup } = engineRef.current;
    if(!camera || !carouselGroup) return;

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(carouselGroup.children);

    if (hits.length > 0) {
      const hit = hits[0].object as THREE.Mesh;
      pointerTimerRef.current = setTimeout(() => setLongPressedNode(hit.userData), 2000);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dist = Math.hypot(e.clientX - pointerDownPos.current.x, e.clientY - pointerDownPos.current.y);
    if (dist > 10 && pointerTimerRef.current) {
      clearTimeout(pointerTimerRef.current);
      pointerTimerRef.current = null;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerTimerRef.current) clearTimeout(pointerTimerRef.current);
    
    if (longPressedNode) {
       setLongPressedNode(null); 
       return; 
    }

    const dist = Math.hypot(e.clientX - pointerDownPos.current.x, e.clientY - pointerDownPos.current.y);
    if (dist > 10) return; 

    const { camera, carouselGroup } = engineRef.current;
    if(!camera || !carouselGroup) return;

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
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
       gsap.to(hit.position, { y: 3.5, duration: 0.4, ease: "back.out" }); 
    } else {
       if(selectedMeshRef.current) {
         const defaultY = (selectedMeshRef.current.userData.height || 4) / 2;
         gsap.to(selectedMeshRef.current.position, { y: defaultY, duration: 0.4 });
       }
       setSelectedNodeData(null);
       selectedMeshRef.current = null;
    }
  };

  const processMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    if (uploadTarget === 'crystal' && selectedNodeData) {
      setStatusMsg("Preparing your file...");
      try {
        const zip = new JSZip();
        const manifest = { originName: file.name, mimeType: file.type, rawSizeBytes: file.size, timestamp: Date.now(), nodeId: selectedNodeData.id };
        
        zip.file("manifest.json", JSON.stringify(manifest));
        zip.file("payload.dat", await file.arrayBuffer(), { binary: true });
        const compressedBlob = await zip.generateAsync({ type: "blob" });

        setStatusMsg("Getting your upload link...");
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch('/api/request-upload-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ nodeId: manifest.nodeId })
        });
        const { uploadUrl, fileStorageKey, error } = await response.json();
        if(error) throw new Error(error);
        
        setStatusMsg("Saving to your vault...");
        const putRes = await fetch(uploadUrl, { method: 'PUT', body: compressedBlob, headers: { 'Content-Type': 'application/zip' }});
        if (!putRes.ok) throw new Error(`Server rejected file: ${putRes.status} ${putRes.statusText}. Please verify CORS rules.`);
        
        if(selectedMeshRef.current) {
           selectedMeshRef.current.userData.fileStorageKey = fileStorageKey;
           selectedMeshRef.current.userData.name = manifest.originName;
           selectedMeshRef.current.userData.rawSize = manifest.rawSizeBytes;
           
           const updatedNode = selectedMeshRef.current.userData;
           setSelectedNodeData({...updatedNode});
           
           const newMatrix = matrixData.map(c => c.id === updatedNode.id ? updatedNode : c);
           await syncDatabase(newMatrix);
        }
        
        setStatusMsg("");
        alert("File saved!");
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

  const handleExtract = async (action: 'view' | 'download') => {
    if(!selectedNodeData?.fileStorageKey) return;
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

      setStatusMsg("Opening your file...");
      const cloudStream = await fetch(downloadUrl);
      if (!cloudStream.ok) throw new Error(`Access Denied (${cloudStream.status}). Please check CORS configuration.`);
      
      const unzipped = await JSZip.loadAsync(await cloudStream.blob());
      const manifestStr = await unzipped.file("manifest.json")?.async("string");
      if(!manifestStr) throw new Error("File could not be read. Payload corrupted.");
      const manifest = JSON.parse(manifestStr);
      
      const payloadBlob = await unzipped.file("payload.dat")?.async("blob");
      const reconstructedBlob = new Blob([payloadBlob!], { type: manifest.mimeType });
      const localUrl = URL.createObjectURL(reconstructedBlob);
      
      setStatusMsg("");
      if(action === 'view') setActiveFileData({ url: localUrl, meta: manifest });
      else {
        const a = document.createElement('a'); a.href = localUrl; a.download = manifest.originName; a.click();
      }
    } catch(err:any) {
       setStatusMsg("Extraction Error: " + err.message);
       setTimeout(() => setStatusMsg(""), 4000);
    }
  }

  const handleShareLink = async () => {
      const url = window.location.href;
      if (navigator.share) {
         try {
            await navigator.share({ url, title: 'My Olympus Vault' });
            return;
         } catch (err: any) {
            if (err?.name === 'AbortError') return;
         }
      }
      // Web Share isn't available on this device/browser — copy the link instead.
      try {
         await navigator.clipboard.writeText(url);
         setStatusMsg("Share is not supported here — the page link was copied to your clipboard instead.");
      } catch {
         setStatusMsg("Share is not supported here — copy this page's address from the browser bar.");
      }
      setTimeout(() => setStatusMsg(""), 5000);
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
      gsap.to(hit.position, { y: 3.5, duration: 0.4, ease: "back.out" });
  };

  const handleRecenter = () => {
      if(!engineRef.current.camera) return;
      gsap.to(engineRef.current.camera.position, { x: 0, y: 15, z: 35, duration: 1, ease: "power2.out" });
      gsap.to(engineRef.current.controls.target, { x: 0, y: 0, z: 0, duration: 1, ease: "power2.out" });
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
          color: '#00ffff',
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
            color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 0.4, 
            metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending 
          })
      );
      node.position.set(Math.cos(angle) * 11, newHeight / 2, Math.sin(angle) * 11);
      node.userData = newNodeData;
      group.add(node);
      
      await syncDatabase(newMatrix);
  }

  if (cloudOffline) return (
    <div className="w-screen h-screen bg-black flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-zinc-300 tracking-widest uppercase text-sm mb-3">Cloud features are offline</p>
        <p className="text-zinc-500 text-sm mb-6">
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-[10px] font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded bg-black/80 border-zinc-700 hover:text-fuchsia-400 hover:border-fuchsia-400"
        >
          Exit matrix
        </button>
      </div>
    </div>
  )

  if (!mounted || !user) return <div className="w-screen h-screen bg-black" />

  return (
    <div className="w-full h-full relative">
      <button 
        onClick={() => router.push('/')} 
        className="absolute z-[9999] px-4 py-2 text-[10px] font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-fuchsia-400 hover:border-fuchsia-400"
      >
        EXIT MATRIX
      </button>

      <div 
        ref={canvasContainerRef} 
        className="absolute inset-0 z-0 pointer-events-auto" 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <input type="file" ref={fileInputRef} className="hidden" accept="*/*" onChange={processMediaUpload} />

      <div className="fixed top-6 left-0 w-full z-10 flex justify-center pointer-events-none">
        <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => searchCrystals(e.target.value)}
            placeholder="Search your crystals..." 
            className="w-11/12 max-w-[700px] bg-black/60 border border-cyan-400/50 rounded-full py-3 px-6 text-center text-sm tracking-wider text-white backdrop-blur-md shadow-[0_5px_20px_rgba(0,0,0,0.5)] focus:border-cyan-400 pointer-events-auto outline-none transition-colors"
        />
      </div>

      <button onClick={handleRecenter} className="fixed top-20 right-6 z-10 w-12 h-12 rounded-full glass-panel flex items-center justify-center text-cyan-400 text-xl hover:bg-cyan-400 hover:text-black transition-all pointer-events-auto shadow-[0_0_15px_rgba(0,255,255,0.3)]">⌖</button>

      {longPressedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm">
          <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center border-cyan-400 shadow-[0_0_50px_rgba(0,255,255,0.4)] animate-pulse min-w-[280px]">
             <span className="text-cyan-400 tracking-widest text-xs mb-2">TARGET LOCKED</span>
             <h2 className="text-3xl text-white font-bold tracking-widest drop-shadow-[0_0_10px_#00ffff] mb-4">
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
         <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 glass-panel p-6 rounded-2xl flex flex-col gap-5 w-11/12 max-w-[320px] shadow-[0_0_50px_rgba(0,255,255,0.15)] pointer-events-auto">
            <input 
              type="text" 
              value={selectedNodeData.name} 
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full bg-transparent border-b border-cyan-400/50 focus:border-cyan-400 text-center text-lg text-white outline-none pb-2 font-bold tracking-wider transition-colors"
              placeholder="Name this crystal..."
            />
            
            {!selectedNodeData.fileStorageKey ? (
               <button className="btn w-full flex items-center justify-center gap-2 py-4" onClick={() => { setUploadTarget('crystal'); fileInputRef.current?.click(); }}><Upload size={18}/> Store File Inside</button>
            ) : (
               <div className="flex gap-3">
                 <button className="btn flex-1 flex items-center justify-center gap-2" onClick={() => handleExtract('view')}><Eye size={16}/> Inspect</button>
                 <button className="btn flex-1 flex items-center justify-center gap-2 border-fuchsia-500 text-fuchsia-500 hover:bg-fuchsia-500/10 hover:shadow-[0_0_15px_#d946ef]" onClick={() => handleExtract('download')}><Download size={16}/> Extract</button>
               </div>
            )}
            
            <div className="flex flex-col items-center mt-2 p-3 bg-black/40 rounded-xl border border-white/10">
               <span className="text-[10px] tracking-widest text-white/50 mb-3 flex items-center gap-2"><Palette size={12}/> CHOOSE RESONANCE</span>
               <input type="color" value={selectedNodeData.color} onChange={(e) => handleColorChange(e.target.value)} className="w-full h-10 cursor-pointer rounded-lg border-none bg-transparent" />
            </div>
         </div>
      )}

      <div className="fixed bottom-6 left-6 z-20 flex flex-col-reverse items-start gap-4 pointer-events-auto">
        <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`w-14 h-14 rounded-full glass-panel flex items-center justify-center text-cyan-400 transition-all duration-300 ${isMenuOpen ? 'rotate-45 shadow-[0_0_20px_#00ffff]' : 'shadow-[0_0_15px_rgba(0,255,255,0.2)]'}`}
        >
            <Plus size={28} />
        </button>

        <div className={`flex flex-col gap-3 transition-all duration-300 origin-bottom-left ${isMenuOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
            <button className="btn flex items-center gap-2 py-3 px-5" onClick={handleAddCrystal}><Plus size={16}/> Generate Crystal</button>
            <button className="btn flex items-center gap-2 py-3 px-5 border-green-500 text-green-500 hover:shadow-[0_0_20px_#00ff66] hover:bg-green-500/10" onClick={handleShareLink}><Share2 size={16}/> Share Link</button>
            
            <div className="flex gap-2">
              <button className="btn flex-1 flex justify-center py-3 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => { setUploadTarget('floor'); fileInputRef.current?.click(); }}><Grid size={16} className="mr-2"/> Set Floor</button>
              <button className="btn flex-1 flex justify-center py-3 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => { setUploadTarget('wall'); fileInputRef.current?.click(); }}><MonitorPlay size={16} className="mr-2"/> Set Walls</button>
            </div>
            
            <div className="glass-panel p-4 rounded-xl mt-2 w-full max-w-[280px]">
                <div className="text-[10px] text-cyan-400 tracking-wider mb-3 flex justify-between">
                   <span>STORAGE</span>
                   <span>{(storageUsed / (1024*1024)).toFixed(2)} / 2000 MB</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 shadow-[0_0_10px_#00ffff]" style={{ width: `${Math.min((storageUsed / (2000 * 1024 * 1024)) * 100, 100)}%` }} />
                </div>
            </div>
        </div>
      </div>

      {statusMsg && (
          <div className="fixed top-[10%] left-1/2 -translate-x-1/2 z-50 glass-panel px-6 py-3 rounded-xl text-cyan-400 font-bold tracking-wider text-sm pointer-events-none shadow-[0_0_20px_rgba(0,255,255,0.3)] backdrop-blur-xl">
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

    </div>
  );
}


