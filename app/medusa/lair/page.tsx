// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';

export default function MedusasLair() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [isVideoActive, setIsVideoActive] = useState(false);

  // Universal Auth Check & Telemetry[span_5](start_span)[span_5](end_span)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#00f3ff; text-align:center; padding:50px;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
        return;
      }
      setMounted(true);
      
      const REPO_NAME = window.location.hostname || 'Unknown-Node';
      supabase.from('central_telemetry').insert([{
          repository_name: REPO_NAME,
          action_type: 'page_load',
          details: { node: 'medusa', url: window.location.href, timestamp: new Date().toISOString() }
      }]);
    });

    fetchArtifacts();
  }, [router]);

  // Three.js Vortex Implementation (Replaces iframe[span_6](start_span)[span_6](end_span))
  useEffect(() => {
    if (!mounted || !canvasRef.current) return;
    
    let reqId;
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030305, 0.05); 

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 

    const particleCount = 2500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorCyan = new THREE.Color(0x00f3ff);
    const colorPink = new THREE.Color(0xbc00ff);

    for (let i = 0; i < particleCount; i++) {
        const z = Math.random() * 40 - 20; 
        const angle = Math.random() * Math.PI * 2 + (z * 0.5); 
        const radius = 2 + Math.random() * 1.5; 

        positions[i * 3] = Math.cos(angle) * radius;    
        positions[i * 3 + 1] = Math.sin(angle) * radius; 
        positions[i * 3 + 2] = z;                        

        const mixedColor = Math.random() > 0.5 ? colorCyan : colorPink;
        colors[i * 3] = mixedColor.r;
        colors[i * 3 + 1] = mixedColor.g;
        colors[i * 3 + 2] = mixedColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending 
    });

    const vortexMesh = new THREE.Points(geometry, material);
    scene.add(vortexMesh);

    function animate() {
        reqId = requestAnimationFrame(animate);
        vortexMesh.rotation.z -= 0.002; 
        camera.position.z -= 0.01;
        if (camera.position.z < -10) {
            camera.position.z = 5; 
        }
        renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        cancelAnimationFrame(reqId);
        window.removeEventListener('resize', handleResize);
    };
  }, [mounted]);

  // Video End Handler
  useEffect(() => {
      const vid = videoRef.current;
      if (!vid) return;
      const onEnded = () => setIsVideoActive(false);
      vid.addEventListener('ended', onEnded);
      return () => vid.removeEventListener('ended', onEnded);
  }, [mounted]);

  async function fetchArtifacts() {
    try {
        const response = await fetch('/api/medusa/artifacts');
        if (response.ok) {
            const data = await response.json();
            setGallery(data);
        }
    } catch (e) {
        console.error("Failed to load artifacts.");
    }
  }

  const processImage = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024;
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl.split(',')[1]); 
            };
            img.onerror = () => reject(new Error("Failed to process visual data."));
            img.src = event.target.result;
        };
        reader.onerror = error => reject(error);
    });
  };

  const triggerGeminiUplink = async () => {
      if (!promptText && !file) return;
      setLoading(true);
      
      try {
          const hasFile = !!file;
          const isPetrification = hasFile || promptText.toLowerCase().includes("stone");
          let cleanPrompt = promptText.replace(/^(turn to stone|stone)\s*/i, "").trim();

          if (isPetrification && cleanPrompt === "") {
              cleanPrompt = "A highly detailed, petrified solid stone statue version of the uploaded subject. Realistic weathered granite texture, cinematic dark background, glowing cyan and pink ambient lighting.";
          }

          let fileBase64 = null;
          if (hasFile) fileBase64 = await processImage(file);

          const response = await fetch('/api/medusa/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: cleanPrompt, isImagePrompt: isPetrification, fileData: fileBase64 })
          });
          
          const data = await response.json();
          if (data.error) throw new Error(data.error.message || data.error);

          if (isPetrification) {
              if (data.predictions && data.predictions[0].bytesBase64Encoded) {
                  const base64 = data.predictions[0].bytesBase64Encoded;
                  const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
                  
                  // Upload to Supabase Artifacts bucket
                  const fileName = `medusa_${Date.now()}.png`;
                  const { error: uploadError } = await supabase.storage.from('artifacts').upload(fileName, blob, { contentType: 'image/png' });
                  if (uploadError) throw uploadError;

                  // Trigger Video
                  if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play();
                      setIsVideoActive(true);
                  }

                  fetchArtifacts(); // Refresh gallery
                  setLogs(prev => [[promptText || "Visual Petrification Sequence", "ARCHIVED_IMAGE"], ...prev]);
              } else {
                  throw new Error("Imagen failed to return visual data.");
              }
          } else {
              const responseText = data.candidates[0].content.parts[0].text;
              setLogs(prev => [[promptText, responseText], ...prev]);
          }
          
          setPromptText('');
          setFile(null);
          
      } catch (error) {
          console.error("Uplink Failed:", error);
          setLogs(prev => [[promptText || "UPLOAD", `[CRITICAL ERROR]: ${error.message}`], ...prev]);
      } finally {
          setLoading(false);
      }
  };

  if (!mounted) return <div className="bg-[#030305] w-screen h-screen"></div>;

  return (
    <>
      <button 
        onClick={() => router.push('/')} 
        className="absolute z-[9999] px-4 py-2 text-[10px] font-bold tracking-widest text-[#00f3ff] uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-[#00f3ff] hover:text-black hover:bg-[#00f3ff]"
      >
        EXIT LAIR
      </button>

      {/* 3D Vortex Background */}
      <canvas ref={canvasRef} className="absolute inset-0 z-[1] w-full h-full pointer-events-none" />
      
      {/* Medusa Video Layer (Fades in/out) */}
      <video 
        ref={videoRef} 
        src="https://files.catbox.moe/medusa.mp4" 
        muted 
        playsInline 
        className={`absolute inset-0 z-[2] w-full h-full object-cover pointer-events-none transition-opacity duration-[1200ms] ease-in-out ${isVideoActive ? 'opacity-100' : 'opacity-0'}`}
      ></video>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-[10] flex flex-col items-center overflow-y-auto pb-20 custom-scrollbar">
        
        <header className="w-full p-4 bg-gradient-to-r from-black to-[#030305] border-b-2 border-[#00f3ff] flex justify-between items-center shadow-[0_0_15px_rgba(0,243,255,0.2)]">
            <div className="text-2xl font-bold text-white drop-shadow-[0_0_8px_#00f3ff] tracking-widest">MEDUSA'S ⚡ LAIR</div>
            <div className="text-sm text-[#bc00ff] drop-shadow-[0_0_5px_#bc00ff] hidden sm:block">[ AUTH: ARTEMIS ] // SYSTEM: ONLINE</div>
        </header>

        <div className="w-[95%] max-w-[1200px] grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            
            {/* Control Panel */}
            <div className="bg-[rgba(10,10,15,0.85)] border border-[#00f3ff] p-5 flex flex-col gap-4 backdrop-blur-md">
                <div className="text-lg text-[#00f3ff] border-b border-[#00f3ff] pb-1">UPLINK COMMAND</div>
                <textarea 
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={4} 
                    placeholder="Command Medusa... (e.g., 'Turn to stone a cyberpunk warrior')"
                    className="bg-black/50 border border-[#00f3ff] text-[#00f3ff] p-3 resize-y outline-none focus:shadow-[0_0_8px_rgba(0,243,255,0.5)]"
                />
                <input 
                    type="file" 
                    onChange={(e) => setFile(e.target.files[0])}
                    accept="image/*" 
                    className="bg-black/50 border border-[#00f3ff] text-[#00f3ff] p-2"
                />
                <button 
                    onClick={triggerGeminiUplink}
                    disabled={loading}
                    className="bg-transparent text-[#bc00ff] border-2 border-[#bc00ff] p-3 text-lg font-bold uppercase transition-all hover:bg-[#bc00ff] hover:text-black hover:shadow-[0_0_10px_rgba(188,0,255,0.4)] disabled:opacity-50"
                >
                    {loading ? 'TRANSMITTING...' : 'TRANSMIT TO MEDUSA'}
                </button>
            </div>

            {/* Session Logs */}
            <div className="bg-[rgba(10,10,15,0.85)] border border-[#00f3ff] p-5 flex flex-col gap-4 backdrop-blur-md max-h-[400px]">
                <div className="text-lg text-[#00f3ff] border-b border-[#00f3ff] pb-1">SESSION LOGS</div>
                <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2">
                    {logs.map((log, idx) => (
                        <div key={idx} className={`p-3 text-sm ${log[1].includes('CRITICAL ERROR') ? 'bg-red-900/20 border-l-4 border-red-500 text-white' : 'bg-[#bc00ff]/10 border-l-4 border-[#bc00ff] text-white'}`}>
                            <div className="text-[#00f3ff] mb-1">Q: {log[0]}</div>
                            {log[1] === "ARCHIVED_IMAGE" ? <span className="text-[#bc00ff]">[ IMAGE PETRIFIED AND ARCHIVED ]</span> : <div>{log[1]}</div>}
                        </div>
                    ))}
                    {logs.length === 0 && <div className="text-zinc-500 italic">No comms established in this session.</div>}
                </div>
            </div>

            {/* Artifact Gallery */}
            <div className="md:col-span-2 bg-[rgba(10,10,15,0.85)] border border-[#00f3ff] p-5 flex flex-col gap-4 backdrop-blur-md mb-10">
                <div className="text-lg text-[#00f3ff] border-b border-[#00f3ff] pb-1">LAIR ARTIFACTS // CLOUD ARCHIVE</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {gallery.map((item, idx) => (
                        <div key={idx} className="border border-[#bc00ff] bg-black p-1 transition-transform hover:scale-105 hover:border-[#00f3ff] cursor-pointer" onClick={() => window.open(item.url, '_blank')}>
                            <img src={item.url} alt="Artifact" className="w-full aspect-square object-cover" />
                        </div>
                    ))}
                    {gallery.length === 0 && <div className="col-span-full text-zinc-500 italic">Archive is empty.</div>}
                </div>
            </div>

        </div>
      </div>
    </>
  );
}


