// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAmbience, AmbienceToggle, panelTileStyle } from '@/lib/hestia/ambience';

// Chambers of the sanctuary — the HESTIA section hub docks every therapy module here.
const CHAMBERS = [
  { name: 'ANTI-LIFE', route: '/anti-life', epithet: 'Entropy Core',
    desc: 'An interactive study of impermanence. Drag through a world that withers — then begin again.' },
  { name: 'GRIEF GULLY', route: '/grief-gully', epithet: 'Healing Matrix',
    desc: 'A quiet place to rest: generative soundscapes and a private journal. A companion, not a therapist.' },
  { name: 'LIFE', route: '/life', epithet: 'Orbital Matrix',
    desc: 'Six rings in silent orbit around a breathing core. Watch the system align.' },
  { name: 'MAGIC MIRROR', route: '/magic-mirror', epithet: 'Vortex Mirror',
    desc: 'A procedural face behind glass. Ask anything — the mirror answers from on-device reflections alone.' },
  { name: 'MEANING OF LIFE', route: '/meaning-of-life', epithet: 'Visualizer',
    desc: 'Three movements: Genesis, Interconnection, Transcendence. The universe experiencing itself.' },
  { name: 'R.E.M.', route: '/rem', epithet: 'Provinces',
    desc: 'A dream-atlas of Canada — thirteen provinces and territories, every municipality.' },
  { name: 'THE AFTERLIFE', route: '/the-afterlife', epithet: 'Elysium Odyssey',
    desc: 'Eight tap-through scenes past the gate. An imagined quiet, not a doctrine.' },
  { name: 'SURVIVORS PLAYBOOK', route: '/playbook', epithet: '21 Chapters',
    desc: "Merlin's complete survival doctrine — the expanded twenty-one-chapter edition." },
];

// Inline SVG glyph system for the chambers — zero image weight, warm gold accents.
function ChamberIcon({ name }) {
  const p = {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };
  switch (name) {
    case 'ANTI-LIFE': // entropy cycle
      return (<svg {...p}><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8" /><path d="M3 3v5h5" /></svg>);
    case 'GRIEF GULLY': // teardrop
      return (<svg {...p}><path d="M12 3c3.2 4.2 6 7.2 6 10.2a6 6 0 0 1-12 0C6 10.2 8.8 7.2 12 3Z" /><path d="M9.5 13.5a2.6 2.6 0 0 0 2.4 2.7" /></svg>);
    case 'LIFE': // orbit
      return (<svg {...p}><circle cx="12" cy="12" r="3.4" /><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-18 12 12)" /></svg>);
    case 'MAGIC MIRROR': // hand mirror
      return (<svg {...p}><circle cx="12" cy="8.5" r="5" /><path d="M12 13.5V21" /><path d="M9.5 21h5" /></svg>);
    case 'MEANING OF LIFE': // sun
      return (<svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
    case 'R.E.M.': // crescent
      return (<svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);
    case 'THE AFTERLIFE': // gate arch
      return (<svg {...p}><path d="M5 21V11a7 7 0 0 1 14 0v10" /><path d="M2.5 21h19" /><path d="M12 4v3" /></svg>);
    default: // playbook — open book
      return (<svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>);
  }
}

function Glyph({ d, size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className="shrink-0">
      {d}
    </svg>
  );
}

export default function Sanctuary() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);
  const amb = useAmbience('sanctuary', 'video');

  // Universal Auth Check (telemetry phone-home removed 2026-09-28).
  // If the database connection is missing, the lair still opens with an
  // honest banner — cloud features (uplink, archive) stay disabled.
  useEffect(() => {
    (async () => {
      let session = null;
      try {
        ({ data: { session } } = await supabase.auth.getSession());
      } catch {
        setCloudOffline(true);
        setMounted(true);
        return;
      }
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#00f2ff; text-align:center; padding:50px;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
        return;
      }
      setMounted(true);
    })();

    fetchArtifacts();
  }, [router]);

  // Hand-rolled 2D vortex (replaces the old Three.js scene — no 'three' import needed)
  useEffect(() => {
    if (!mounted || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let reqId;
    let w = 0, h = 0, cx = 0, cy = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2; cy = h / 2;
    };
    resize();

    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const maxR = () => Math.hypot(w, h) / 2;

    const spawn = (p, anywhere) => {
      const R = maxR();
      p.a = Math.random() * Math.PI * 2;
      p.r = anywhere ? R * (0.25 + Math.random() * 0.75) : R * (0.92 + Math.random() * 0.08);
      p.spin = 0.0016 + Math.random() * 0.0032;
      p.inward = R * (0.0006 + Math.random() * 0.0012);
      p.cyan = Math.random() > 0.42;
      p.tw = Math.random() * Math.PI * 2;
      return p;
    };

    const N = 700;
    const P = [];
    for (let i = 0; i < N; i++) P.push(spawn({}, true));

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const R = maxR();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of P) {
        const depth = 1 - p.r / R; // 0 at rim → 1 at the eye
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r * 0.62; // elliptical tilt, like looking down a funnel
        const twinkle = 0.55 + 0.45 * Math.sin(t * 0.001 + p.tw);
        const alpha = (0.10 + 0.55 * depth) * twinkle;
        const size = 0.6 + 2.6 * depth;
        ctx.beginPath();
        ctx.fillStyle = p.cyan
          ? 'rgba(0,243,255,' + alpha.toFixed(3) + ')'
          : 'rgba(188,0,255,' + alpha.toFixed(3) + ')';
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      // Restrained glow at the eye of the vortex (lighting rule: never drown the scene)
      const gr = R * 0.16;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
      g.addColorStop(0, 'rgba(0,243,255,0.10)');
      g.addColorStop(1, 'rgba(0,243,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
    };

    if (reduced) { draw(0); return; }

    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(50, now - last); last = now;
      const k = dt / 16.667;
      const floor = maxR() * 0.03;
      for (const p of P) {
        p.a += p.spin * k;
        p.r -= p.inward * k;
        if (p.r < floor) spawn(p, false);
      }
      draw(now);
      reqId = requestAnimationFrame(frame);
    };
    reqId = requestAnimationFrame(frame);

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', resize);
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
    setGalleryLoading(true);
    try {
        const response = await fetch('/api/medusa/artifacts');
        if (response.ok) {
            const data = await response.json();
            setGallery(data);
        }
    } catch (e) {
        console.error("Failed to load artifacts.");
    } finally {
        setGalleryLoading(false);
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
                  const fileName = `sanctuary_${Date.now()}.png`;
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

  if (!mounted) return <div className="bg-[#030305] w-screen h-dvh"></div>;

  return (
    <>
      {/* Ambient sanctuary background — Video → Still → Off, persisted. Sits behind the vortex canvas. */}
      {amb.hydrated && amb.mode !== 'off' && (
        <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
          {amb.mode === 'video' ? (
            <video
              autoPlay muted loop playsInline preload="metadata"
              poster="/images/sanctuary/bg-ambient.webp"
              src="/images/sanctuary/bg-ambient.mp4"
              className="w-full h-full object-cover opacity-50"
            />
          ) : (
            <img src="/images/sanctuary/bg-ambient.webp" alt="" className="w-full h-full object-cover opacity-50" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#030305]/60 via-transparent to-[#030305]/80" />
        </div>
      )}

      <div className="absolute z-[9999] top-5 right-5 flex items-center gap-2">
        <AmbienceToggle mode={amb.mode} onCycle={amb.cycle} />
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-[10px] font-bold tracking-widest text-[#00f2ff] uppercase transition-colors border rounded bg-black/80 border-[#00f2ff] hover:text-black hover:bg-[#00f2ff] inline-flex items-center gap-2"
        >
          <Glyph d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>} />
          EXIT SANCTUARY
        </button>
      </div>

      {/* 2D Vortex Background (hand-rolled canvas — no three.js) */}
      <canvas ref={canvasRef} className="absolute inset-0 z-[1] w-full h-full pointer-events-none" />
      
      {/* Sanctuary Video Layer (Fades in/out) */}
      <video 
        ref={videoRef} 
        src="/sanctuary.mp4" 
        muted 
        playsInline 
        className={`absolute inset-0 z-[2] w-full h-full object-cover pointer-events-none transition-opacity duration-[1200ms] ease-in-out ${isVideoActive ? 'opacity-100' : 'opacity-0'}`}
      ></video>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-[10] flex flex-col items-center overflow-y-auto pb-20 custom-scrollbar">
        
        <header className="relative w-full p-4 bg-gradient-to-r from-black to-[#030305] border-b-2 border-[#00f2ff] overflow-hidden shadow-[0_0_15px_rgba(0,243,255,0.2)]">
            <img src="/images/sanctuary/header-serpent.webp" alt="" aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-[#030305]/90 pointer-events-none" aria-hidden="true" />
            <div className="relative flex justify-between items-center">
              <div className="text-2xl font-bold text-white drop-shadow-[0_0_8px_#00f2ff] tracking-widest">SANCTUARY</div>
              <div className="text-sm text-[#bc00ff] drop-shadow-[0_0_5px_#bc00ff] hidden sm:block">[ AUTH: ARTEMIS ] // SYSTEM: ONLINE</div>
            </div>
        </header>

        <div className="w-[95%] max-w-[1200px] mt-5 flex flex-col gap-5">

            {/* Honest offline state — no fake data, no fake archive */}
            {cloudOffline && (
                <div className="bg-[rgba(10,10,15,0.9)] border border-amber-400 p-4 text-amber-200 text-sm leading-relaxed backdrop-blur-md">
                    Cloud features are offline — this page needs the database connection.
                    You can browse the chambers below, but the uplink, petrification uploads,
                    and the cloud artifact archive are unavailable until the connection is set up.
                </div>
            )}

            {/* Chambers of the Sanctuary — HESTIA section hub */}
            <div className="relative bg-[rgba(10,10,15,0.85)] border border-[#bc00ff] p-5 backdrop-blur-md overflow-hidden">
                <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
                <div className="relative">
                <div className="text-lg text-[#bc00ff] border-b border-[#bc00ff] pb-1">CHAMBERS OF THE SANCTUARY // HESTIA SECTION HUB</div>
                <p className="text-zinc-400 text-sm mt-2">Eight chambers orbit this sanctuary — each a pocket universe of its own. Enter where you are called.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    {CHAMBERS.map((c) => (
                        <button
                            key={c.route}
                            onClick={() => router.push(c.route)}
                            className="text-left border border-[#00f2ff]/40 bg-black/50 p-4 flex flex-col gap-2 hover:border-[#00f2ff] hover:bg-[#00f2ff]/10 transition-all group min-h-[44px] relative overflow-hidden"
                        >
                            <div aria-hidden="true" className="absolute inset-0 opacity-25 pointer-events-none" style={panelTileStyle()} />
                            <div className="relative text-amber-200/90"><ChamberIcon name={c.name} /></div>
                            <div className="relative text-[#00f2ff] font-bold tracking-widest text-sm group-hover:text-white">{c.name}</div>
                            <div className="relative text-[10px] text-[#bc00ff] tracking-widest uppercase">{c.epithet}</div>
                            <div className="relative text-xs text-zinc-400 leading-relaxed">{c.desc}</div>
                            <div className="relative text-[10px] text-[#00f2ff] tracking-widest uppercase mt-auto pt-2 inline-flex items-center gap-1.5">
                              Enter <Glyph size={11} d={<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>} />
                            </div>
                        </button>
                    ))}
                </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
                {/* Control Panel */}
                <div className="bg-[rgba(10,10,15,0.85)] border border-[#00f2ff] p-5 flex flex-col gap-4 backdrop-blur-md">
                    <div className="text-lg text-[#00f2ff] border-b border-[#00f2ff] pb-1">UPLINK COMMAND</div>
                    <textarea 
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        rows={4} 
                        placeholder="Ask Sanctuary... (e.g., 'Turn to stone a cyberpunk warrior')"
                        className="bg-black/50 border border-[#00f2ff] text-[#00f2ff] p-3 resize-y outline-none focus:shadow-[0_0_8px_rgba(0,243,255,0.5)]"
                    />
                    <input 
                        type="file" 
                        onChange={(e) => setFile(e.target.files[0])}
                        accept="image/*" 
                        className="bg-black/50 border border-[#00f2ff] text-[#00f2ff] p-2"
                    />
                    <button 
                        onClick={triggerGeminiUplink}
                        disabled={loading || cloudOffline}
                        className="bg-transparent text-[#bc00ff] border-2 border-[#bc00ff] p-3 text-lg font-bold uppercase transition-all hover:bg-[#bc00ff] hover:text-black hover:shadow-[0_0_10px_rgba(188,0,255,0.4)] disabled:opacity-50 inline-flex items-center justify-center gap-3"
                    >
                        <Glyph size={18} d={<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>} />
                        {cloudOffline ? 'CLOUD OFFLINE' : loading ? 'TRANSMITTING...' : 'TRANSMIT TO SANCTUARY'}
                    </button>
                </div>

                {/* Session Logs */}
                <div className="bg-[rgba(10,10,15,0.85)] border border-[#00f2ff] p-5 flex flex-col gap-4 backdrop-blur-md max-h-[400px]">
                    <div className="text-lg text-[#00f2ff] border-b border-[#00f2ff] pb-1">SESSION LOGS</div>
                    <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2">
                        {logs.map((log, idx) => (
                            <div key={idx} className={`p-3 text-sm ${log[1].includes('CRITICAL ERROR') ? 'bg-red-900/20 border-l-4 border-red-500 text-white' : 'bg-[#bc00ff]/10 border-l-4 border-[#bc00ff] text-white'}`}>
                                <div className="text-[#00f2ff] mb-1">Q: {log[0]}</div>
                                {log[1] === "ARCHIVED_IMAGE" ? <span className="text-[#bc00ff]">[ IMAGE PETRIFIED AND ARCHIVED ]</span> : <div>{log[1]}</div>}
                            </div>
                        ))}
                        {logs.length === 0 && <div className="text-zinc-500 italic">No comms established in this session.</div>}
                        {/* Safari bottom-bar clearance */}
                        <div aria-hidden="true" className="player-clear shrink-0" />
                    </div>
                </div>

            </div>

            {/* Artifact Gallery */}
            <div className="relative bg-[rgba(10,10,15,0.85)] border border-[#00f2ff] p-5 flex flex-col gap-4 backdrop-blur-md mb-10 overflow-hidden">
                <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
                <div className="relative flex flex-col gap-4">
                <div className="text-lg text-[#00f2ff] border-b border-[#00f2ff] pb-1">SANCTUARY ARTIFACTS // CLOUD ARCHIVE</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {galleryLoading ? (
                        [0, 1, 2, 3, 4].map((i) => (
                            <div key={i} aria-hidden="true"
                              className="aspect-square border border-[#00f2ff]/20 bg-gradient-to-br from-[#00f2ff]/5 via-transparent to-[#bc00ff]/10 animate-pulse" />
                        ))
                    ) : (
                        gallery.map((item, idx) => (
                            <div key={idx} className="border border-[#bc00ff] bg-black p-1 transition-transform hover:scale-105 hover:border-[#00f2ff] cursor-pointer" onClick={() => window.open(item.url, '_blank')}>
                                <Image src={item.url} alt="Artifact" width={600} height={600} unoptimized className="w-full aspect-square object-cover" />
                            </div>
                        ))
                    )}
                    {!galleryLoading && gallery.length === 0 && (
                        <div className="col-span-full text-zinc-500 italic">
                            {cloudOffline ? 'Archive unavailable — cloud features are offline.' : 'Archive is empty.'}
                        </div>
                    )}
                </div>
                </div>
            </div>

        </div>
        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear shrink-0" />
      </div>
    </>
  );
}
