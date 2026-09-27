// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const defaultNodes = [
    { id: "DHUnz4dyb54", name: "AQUARIUM" }, // Renamed from GEORGIA AQUARIUM
    { id: "XsOU8JnEpNM", name: "OL DONYO LODGE" },
    { id: "5e4lsEe4Vew", name: "WOLF CENTER NORTH" },
    { id: "3n-5EA9augs", name: "TEXAS WILDLIFE" },
    { id: "dIChLG4_WNs", name: "NKORHO BUSH LODGE" },
    { id: "ItdXaWUVF48", name: "ROSIE'S PAN AFRICA" },
    { id: "ydYDqZQpim8", name: "NAMIB DESERT LIVE" },
    { id: "S46DdA8Mc4I", name: "MAKOV STORK NEST" },
    { id: "qHXFLsnKDq0", name: "MOUNTAIN STREAM" },
    { id: "F0GOOP82094", name: "MORTEN HILMER FOREST" },
    { id: "4BrvMGznLTo", name: "MOUNTAIN WATERFALL" },
    { id: "ayMw6zvsUpQ", name: "PACIFIC REEF CAM" },
    { id: "iws3rh5vLAQ", name: "KILAUEA VOLCANO" },
    { id: "jzx_n25g3kA", name: "UTOPIA UNDERWATER" },
    { id: "ouWBQoVFegI", name: "BALD EAGLE NEST" },
    { id: "3szkFHfr6sA", name: "WOLONG PANDA GROVE" },
    { id: "FqQJmDiW0xs", name: "ANCIENT EGYPT LIVE" },
    { id: "aXAsMcmtJTc", name: "NETHERLANDS SEAL CAM" },
    { id: "qJ8lYplu1y0", name: "MAUNAKEA METEOR CAM" },
    { id: "yfSyjwY6zSQ", name: "GRACE GORILLA FOREST" },
    { id: "azNqXbUW-K4", name: "TROPICAL FISH CAM" },
    { id: "yuIm1V7Ne7I", name: "ONGUMA WATERHOLE" },
    { id: "QOzC_AbsPlw", name: "SPACE AMBIENT HUD" },
    { id: "XyPU5-pNg5E", name: "AQUARIUM FEED 01" },
    { id: "Io1Kle7QR-E", name: "AQUARIUM FEED 02" },
    { id: "RZFMYVNhd4k", name: "AQUARIUM FEED 03" },
    { id: "JMMoRwYo5kE", name: "AQUARIUM FEED 04" },
    { id: "HlJ4aRtYhoo", name: "AQUARIUM FEED 05" },
    { id: "iWCeBAxRCBo", name: "AQUARIUM FEED 06" },
    { id: "g6wxYiESkE4", name: "AQUARIUM FEED 07" },
    { id: "-qvYCbvbeN8", name: "AQUARIUM FEED 08" },
    { id: "SUXPnIEpbn4", name: "AQUARIUM FEED 09" },
    { id: "tEtg5Kg3voQ", name: "AQUARIUM FEED 10" },
    { id: "abbR-Ttd-cA", name: "AQUARIUM FEED 11" },
    { id: "dN1uDn-Luno", name: "AQUARIUM FEED 12" },
    { id: "-479TZi-EAs", name: "AQUARIUM FEED 13" },
    { id: "qi0mY6zVQnY", name: "AQUARIUM FEED 14" },
    { id: "MwcqP3ta6RI", name: "AQUARIUM FEED 15" },
    { id: "fIMbMz2P7Bs", name: "AQUARIUM FEED 16" },
    { id: "h8O0UXsL7uk", name: "AQUARIUM FEED 17" },
    { id: "0FBiyFpV__g", name: "AQUARIUM FEED 18" },
    { id: "UDAZWxehMAI", name: "AQUARIUM FEED 19" },
    { id: "w3LjpFhySTg", name: "AQUARIUM FEED 20" },
    { id: "3e_uPkJCTNo", name: "AQUARIUM FEED 21" },
    { id: "ZrePsYz4c6g", name: "AQUARIUM FEED 22" },
    { id: "gJVnp5fF0vM", name: "AQUARIUM FEED 23" },
    { id: "-Vck0hn-zqk", name: "AQUARIUM FEED 24" },
    { id: "typxqJU-pFQ", name: "AQUARIUM FEED 25" },
    { id: "UpwNqncnqTE", name: "AQUARIUM FEED 26" },
    { id: "E0TZTmTK-Ws", name: "AQUARIUM FEED 27" }
];

export default function AquariumConsole() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [nodes, setNodes] = useState(defaultNodes);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [uiOpen, setUiOpen] = useState(true);
  const [mirrored, setMirrored] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [statusText, setStatusText] = useState("ESTABLISHING DATABASE UPLINK...");
  
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isDragging = useRef(false);
  const safetyTimeout = useRef(null);

  // Universal Auth Check & Init
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
        return;
      }
      setMounted(true);
      initSystem();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function initSystem() {
    const { data, error } = await supabase
        .from('nexus_nodes')
        .select('*')
        .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
        setStatusText("UPLINK FAILED. USING LOCAL CACHE.");
        setNodes(defaultNodes);
    } else {
        setNodes(data);
    }
  }

  // Trigger fade when index changes
  useEffect(() => {
    setIsFading(true);
    if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
    
    safetyTimeout.current = setTimeout(() => {
        setIsFading(false);
    }, 2500);

    return () => clearTimeout(safetyTimeout.current);
  }, [currentIndex]);

  const extractYouTubeID = (url) => {
      const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([\w-]{11})/;
      const match = url.match(regExp);
      return match ? match[1] : null;
  };

  const promptAddNode = async () => {
      const url = window.prompt("Enter YouTube URL (Live, Shorts, or Standard):");
      if (!url) {
          setUiOpen(false); 
          return;
      }

      const ytId = extractYouTubeID(url);
      if (!ytId) {
          alert("SYSTEM ERROR: Invalid or unrecognizable YouTube URL format.");
          setUiOpen(false);
          return;
      }

      const customName = window.prompt("Enter a Name for this feed:", "CUSTOM USER FEED") || "CUSTOM FEED";
      
      const { error } = await supabase
          .from('nexus_nodes')
          .insert([{ id: ytId, name: customName.toUpperCase() }]); 

      if (error) {
          console.error("Insert error:", error);
          alert("UPLOAD FAILED. Node ID may already exist in the database.");
          return;
      }

      const newNodes = [...nodes, { id: ytId, name: customName.toUpperCase() }];
      setNodes(newNodes);
      setCurrentIndex(newNodes.length - 1);
      setUiOpen(false); 
  };

  const removeCurrentNode = async () => {
      if (nodes.length <= 1) {
          alert("SYSTEM LOCK: Cannot remove the final active feed.");
          setUiOpen(false);
          return;
      }
      
      const nodeToDelete = nodes[currentIndex];
      
      if (window.confirm(`PURGE "${nodeToDelete.name}" FROM GLOBAL DATABASE?`)) {
          const { error } = await supabase
              .from('nexus_nodes')
              .delete()
              .eq('id', nodeToDelete.id);

          if (error) {
              console.error("Delete error:", error);
              alert("PURGE FAILED. Check console for details.");
              return;
          }

          const newNodes = [...nodes];
          newNodes.splice(currentIndex, 1);
          setNodes(newNodes);
          
          if (currentIndex >= newNodes.length) {
              setCurrentIndex(0);
          } else {
              setIsFading(true);
          }
          
          setUiOpen(false);
      } else {
          setUiOpen(false); 
      }
  };

  const cycleNode = (direction) => {
      let nextIndex = (currentIndex + direction + nodes.length) % nodes.length;
      setCurrentIndex(nextIndex);
  };

  const handleSwipe = () => {
      const distance = touchEndX.current - touchStartX.current;
      const swipeThreshold = 40;
      
      if (distance < -swipeThreshold) {
          cycleNode(1);
      } else if (distance > swipeThreshold) {
          cycleNode(-1);
      }
  };

  const handleTouchStart = (e) => { touchStartX.current = e.changedTouches[0].screenX; };
  const handleTouchEnd = (e) => { 
      touchEndX.current = e.changedTouches[0].screenX; 
      if(!uiOpen) handleSwipe(); 
  };
  const handleMouseDown = (e) => { isDragging.current = true; touchStartX.current = e.screenX; };
  const handleMouseUp = (e) => { 
      if (!isDragging.current) return; 
      isDragging.current = false; 
      touchEndX.current = e.screenX; 
      if(!uiOpen) handleSwipe(); 
  };

  if (!mounted) return <div style={{width: '100vw', height: '100vh', background: '#000'}}></div>;

  const currentNode = nodes[currentIndex] || { id: '', name: 'INITIALIZING' };

  return (
    <>
      <style>{`
        .aquarium-wrapper {
            --glow: #00f2ff;
            --gold: #d4af37;
            --danger: #ff3366;
            --ui-bg: rgba(0, 10, 20, 0.85);
            margin: 0; padding: 0;
            width: 100vw; height: 100dvh;
            overflow: hidden;
            background-color: #000;
            font-family: 'Courier New', monospace;
            user-select: none; 
            -webkit-user-select: none;
            touch-action: none; 
        }

        .video-engine {
            position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 1; overflow: hidden;
            transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease-in-out;
            opacity: 1; background-color: #000;
        }
        
        .video-engine.fade-out { opacity: 0; }
        .video-engine.mirrored { transform: scaleX(-1); }

        .yt-iframe {
            width: 100vw; height: 56.25vw; min-height: 100dvh; min-width: 177.77vh;
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            border: none; pointer-events: none;
        }

        .mirror-btn {
            position: fixed; top: 20px; right: 20px; z-index: 250; width: 45px; height: 45px;
            background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(0, 242, 255, 0.3); border-radius: 8px;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px); transition: 0.3s; opacity: 0.6;
        }
        .mirror-btn:hover { opacity: 1; border-color: var(--glow); box-shadow: 0 0 15px var(--glow); }
        .mirror-btn svg { width: 20px; fill: var(--glow); }

        .nexus-overlay {
            position: fixed; inset: 0; z-index: 100; display: flex; justify-content: center; align-items: center;
            background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(12px);
            transition: opacity 0.4s ease, visibility 0.4s; cursor: pointer;
        }

        .holo-frame {
            width: min(420px, 85vw); padding: 40px; background: var(--ui-bg);
            border: 2.5px solid var(--glow); border-radius: 30px; text-align: center;
            color: #fff; pointer-events: auto; box-shadow: 0 0 30px rgba(0, 242, 255, 0.1); cursor: default;
        }

        .btn {
            display: block; margin-top: 15px; padding: 12px; text-decoration: none;
            border-radius: 50px; font-weight: bold; font-size: 0.7rem; text-transform: uppercase;
            letter-spacing: 2px; border: 1px solid var(--glow); color: var(--glow);
            background: rgba(0, 242, 255, 0.05); transition: 0.3s; cursor: pointer; width: 100%; box-sizing: border-box;
        }
        .btn:hover { background: var(--glow); color: #000; box-shadow: 0 0 15px var(--glow); }
        .btn-danger { border-color: var(--danger); color: var(--danger); }
        .btn-danger:hover { background: var(--danger); color: #000; box-shadow: 0 0 15px var(--danger); }

        .btn-row { display: flex; gap: 10px; margin-top: 15px; }
        .btn-row .btn { margin-top: 0; }

        .hud {
            position: fixed; bottom: 60px; font-size: 0.65rem; letter-spacing: 3px;
            color: rgba(255,255,255,0.6); z-index: 150; transition: 0.5s; text-shadow: 0 0 5px rgba(0,0,0,0.8);
        }

        .swipe-indicator {
            position: fixed; bottom: 60px; width: 100%; text-align: center; font-size: 0.6rem;
            letter-spacing: 4px; color: var(--glow); z-index: 150; opacity: 0.5;
            pointer-events: none; display: flex; justify-content: center; align-items: center; gap: 15px;
        }
        .chevron { font-size: 1.2rem; animation: swipe-pulse 2s infinite ease-in-out; }
        .chevron.left { animation-delay: 0s; }
        .chevron.right { animation-delay: 1s; }

        @keyframes swipe-pulse {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); text-shadow: 0 0 10px var(--glow); }
        }

        .hidden { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.3s ease, visibility 0.3s; pointer-events: none; }
        .loading-text { color: var(--gold); animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      `}</style>
      
      <div 
        className="aquarium-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <button 
          onClick={(e) => { e.stopPropagation(); router.push('/'); }}
          className="absolute z-[9999] px-4 py-2 text-[10px] font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 left-5 bg-black/80 border-zinc-700 hover:text-amber-400 hover:border-amber-400"
        >
          EXIT MATRIX
        </button>

        <div className={`video-engine ${isFading ? 'fade-out' : ''} ${mirrored ? 'mirrored' : ''}`} onClick={() => setUiOpen(true)}>
            {currentNode.id && (
              <iframe 
                className="yt-iframe" 
                src={`https://www.youtube.com/embed/${currentNode.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentNode.id}&rel=0&modestbranding=1`} 
                allow="autoplay; fullscreen"
                onLoad={() => setIsFading(false)}
              ></iframe>
            )}
        </div>

        <div className="mirror-btn" onClick={(e) => { e.stopPropagation(); setMirrored(!mirrored); }} title="Mirror Perspective">
            <svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
        </div>

        <div className={`nexus-overlay ${!uiOpen ? 'hidden' : ''}`} onClick={() => setUiOpen(false)}>
            <div className="holo-frame" onClick={(e) => e.stopPropagation()}>
                <h1 style={{margin:0, fontSize: '1.1rem', letterSpacing: '4px', color: 'var(--glow)'}}>{currentNode.name}</h1>
                <p style={{fontSize: '0.6rem', opacity: 0.6, marginTop: '10px'}}>
                  {isFading ? statusText : `ACTIVE FEED: NODE_${String(currentIndex + 1).padStart(2, '0')}`}
                </p>
                
                <div className="btn-row">
                    <button className="btn" onClick={promptAddNode}>+ Add Feed</button>
                    <button className="btn btn-danger" onClick={removeCurrentNode}>- Remove Feed</button>
                </div>
                
                <a href="mailto:stakeme10000@gmail.com" className="btn">Request Console</a>
            </div>
        </div>

        <div className={`hud ${uiOpen ? 'hidden' : ''}`} style={{left: '30px'}}>
            {isFading ? (
              <>[ <span className="loading-text">ESTABLISHING CONNECTION...</span> ]</>
            ) : (
              `NODE: ${String(currentIndex + 1).padStart(2, '0')}/${nodes.length}`
            )}
        </div>
        
        <div className={`swipe-indicator hud ${uiOpen ? 'hidden' : ''}`}>
            <span className="chevron left">‹‹</span> SWIPE NEXUS <span className="chevron right">››</span>
        </div>
      </div>
    </>
  );
}


