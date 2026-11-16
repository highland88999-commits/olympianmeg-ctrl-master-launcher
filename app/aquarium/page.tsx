// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { IcPlus, IcMinus, AquariumCrest } from '@/app/artemis-ui/icons';
import {
  BUILTIN_NODES,
  extractYouTubeID,
  isUserFeed,
  loadUserFeedsBackup,
  mergeNodes,
  saveUserFeedsBackup,
} from '@/lib/aquarium/nodes';
import { verifyAresPin } from '@/lib/aquarium/pin-gate';

// Built-in rotation (40 live feeds) — lib/aquarium/nodes.js. The 10
// dead feeds were deleted from the list (see DELETED_DEAD_NODES there);
// the live site also needs supabase/aquarium-feed-cleanup.sql to run
// before the dead feeds leave the database rotation.
const defaultNodes = BUILTIN_NODES;

export default function AquariumConsole() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [nodes, setNodes] = useState(defaultNodes);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // The page opens on the fullscreen feed, not on the menu card — tap
  // the feed to open the menu (ADD / REMOVE / REQUEST CONSOLE).
  const [uiOpen, setUiOpen] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [isFading, setIsFading] = useState(false);
  // The id of the feed whose embed document has actually loaded. The
  // "ESTABLISHING CONNECTION..." line shows only while the current
  // feed has not loaded yet — it used to ride the fade timer and sit
  // over a playing feed for 2.5 s after every swipe.
  const [loadedId, setLoadedId] = useState(null);
  // PIN gate for REMOVE FEED (same PIN as the ARES login — see
  // lib/aquarium/pin-gate.js). Nothing is deleted until the gate
  // answers yes.
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [statusText, setStatusText] = useState("ESTABLISHING DATABASE UPLINK...");
  const [cloudOffline, setCloudOffline] = useState(false);
  
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isDragging = useRef(false);
  const safetyTimeout = useRef(null);

  // Universal Auth Check & Init
  useEffect(() => {
    let auth;
    try {
      auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
    } catch {
      setCloudOffline(true);
      return;
    }
    auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
        return;
      }
      setMounted(true);
      initSystem();
    });

    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function initSystem() {
    const localUserFeeds = loadUserFeedsBackup();
    const { data, error } = await supabase
        .from('nexus_nodes')
        .select('*')
        .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
        // Database did not answer (or is empty): built-ins plus the
        // local-backup user feeds, so a user feed survives an outage
        // and is never lost from view.
        setStatusText("UPLINK FAILED. USING LOCAL CACHE.");
        setNodes(mergeNodes({ builtin: defaultNodes, dbRows: null, localUserFeeds }));
    } else {
        // Database is the source of truth; local-backup user feeds
        // missing from it are appended, never dropped.
        const merged = mergeNodes({ builtin: defaultNodes, dbRows: data, localUserFeeds });
        setNodes(merged);
        // Keep the backup current from the server's own user rows.
        saveUserFeedsBackup(merged.filter(isUserFeed));
    }
  }

  // Trigger fade when index changes
  useEffect(() => {
    setIsFading(true);
    setLoadedId(null);
    if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
    
    safetyTimeout.current = setTimeout(() => {
        setIsFading(false);
    }, 2500);

    return () => clearTimeout(safetyTimeout.current);
  }, [currentIndex]);

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

      const newNode = { id: ytId, name: customName.toUpperCase(), origin: 'user' };
      // NOTE: the insert sends {id, name} only — the nexus_nodes.origin
      // column defaults to 'user' once supabase/aquarium-feed-cleanup.sql
      // runs; sending origin today would fail on the live table, which
      // does not have the column yet.
      const { error } = await supabase
          .from('nexus_nodes')
          .insert([{ id: ytId, name: customName.toUpperCase() }]);

      if (error) {
          console.error("Insert error:", error);
          alert("UPLOAD FAILED. Node ID may already exist in the database.");
          return;
      }

      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      setCurrentIndex(newNodes.length - 1);
      // Permanence backstop: the user feed is also kept in localStorage,
      // so it survives a database outage and is never pruned by a sweep.
      saveUserFeedsBackup([...loadUserFeedsBackup(), newNode]);
      setUiOpen(false);
  };

  const removeCurrentNode = async () => {
      if (nodes.length <= 1) {
          alert("SYSTEM LOCK: Cannot remove the final active feed.");
          setUiOpen(false);
          return;
      }
      // Deletion needs Merlin's PIN — the same PIN as the ARES login
      // (see lib/aquarium/pin-gate.js). The PIN form opens inside the
      // menu; nothing is deleted until the gate answers yes.
      setPinValue('');
      setPinError('');
      setPinOpen(true);
  };

  const confirmRemoveWithPin = async () => {
      if (pinBusy) return;
      setPinError('');
      setPinBusy(true);
      const ok = await verifyAresPin(pinValue);
      setPinBusy(false);
      if (!ok) {
          setPinError("That didn't open it.");
          setPinValue('');
          return;
      }
      setPinOpen(false);
      setPinValue('');

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
          // A deleted user feed leaves the local backup too.
          saveUserFeedsBackup(newNodes.filter(isUserFeed));

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

  if (!mounted) {
    if (cloudOffline) {
      return (
        <div style={{ width: '100vw', height: '100dvh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#00f2ff', fontFamily: 'Courier New, monospace', fontSize: '0.8rem', letterSpacing: '2px', lineHeight: 2 }}>
            CLOUD FEATURES OFFLINE — THIS CONSOLE NEEDS THE DATABASE CONNECTION.
          </p>
        </div>
      );
    }
    return <div style={{width: '100vw', height: '100dvh', background: '#000'}}></div>;
  }

  const currentNode = nodes[currentIndex] || { id: '', name: 'INITIALIZING' };

  return (
    <>
      <style>{`
        .aquarium-wrapper {
            --glow: #00f2ff;
            --gold: #ffd700;
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
            /* Moved off the top-right corner: the Concourse orb lives
               there and the two overlapped on his phone. Left edge,
               below the EXIT MATRIX button. */
            position: fixed; top: 76px; left: 20px; z-index: 250; width: 45px; height: 45px;
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
            width: min(420px, 85vw); padding: 40px;
            background-image: linear-gradient(var(--ui-bg), var(--ui-bg)), url(/images/aquarium/tile.webp);
            background-size: auto, 170px;
            border: 2.5px solid var(--glow); border-radius: 30px; text-align: center;
            color: #fff; pointer-events: auto; box-shadow: 0 0 30px rgba(0, 242, 255, 0.1); cursor: default;
        }
        .holo-crest { display: flex; justify-content: center; margin-bottom: 14px; }

        .btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: 15px; padding: 12px; text-decoration: none;
            border-radius: 50px; font-weight: bold; font-size: 0.7rem; text-transform: uppercase;
            letter-spacing: 2px; border: 1px solid var(--glow); color: var(--glow);
            background: rgba(0, 242, 255, 0.05); transition: 0.3s; cursor: pointer; width: 100%; box-sizing: border-box;
        }
        .btn:hover { background: var(--glow); color: #000; box-shadow: 0 0 15px var(--glow); }
        .btn-danger { border-color: var(--danger); color: var(--danger); }
        .btn-danger:hover { background: var(--danger); color: #000; box-shadow: 0 0 15px var(--danger); }

        .btn-row { display: flex; gap: 10px; margin-top: 15px; }
        .btn-row .btn { margin-top: 0; }

        /* One bottom HUD bar: the node counter on its own row, the
           swipe hint on its own row. The two used to share bottom:60px
           as separate fixed elements and run into each other on his
           phone ("NODE: 04/50 SWIPE NEXUS" as one colliding line).
           bottom:60px clears the global RadioBar, as before. */
        .hud-bar {
            position: fixed; bottom: 60px; left: 0; right: 0; z-index: 150;
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            pointer-events: none;
            font-size: 0.65rem; letter-spacing: 3px;
            color: rgba(255,255,255,0.6); text-shadow: 0 0 5px rgba(0,0,0,0.8);
            transition: 0.5s;
        }

        .hud-swipe {
            font-size: 0.6rem; letter-spacing: 4px; color: var(--glow); opacity: 0.5;
            display: flex; justify-content: center; align-items: center; gap: 15px;
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
        .aqua-spinner { display: inline-flex; align-items: center; gap: 10px; }
        .aqua-ring { width: 18px; height: 18px; border-radius: 50%;
            border: 2px solid rgba(0,242,255,0.2); border-top-color: var(--glow);
            animation: aqua-spin 1s linear infinite; }
        @keyframes aqua-spin { to { transform: rotate(360deg); } }
        .aqua-shimmer { background: linear-gradient(90deg, var(--glow) 25%, #fff 50%, var(--glow) 75%);
            background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
            animation: aqua-shimmer 2.2s linear infinite; }
        @keyframes aqua-shimmer { to { background-position: -200% 0; } }
        .aqua-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.55;
            background-image: linear-gradient(to bottom, rgba(0,8,12,0.55), rgba(0,8,12,0.25) 50%, rgba(0,8,12,0.7)), url(/images/aquarium/bg.webp);
            background-size: cover; background-position: center; }
      `}</style>
      
      <div 
        className="aquarium-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <div className="aqua-bg" aria-hidden="true" />
        <BackButton label="EXIT MATRIX" />

        <div className={`video-engine ${isFading ? 'fade-out' : ''} ${mirrored ? 'mirrored' : ''}`} onClick={() => setUiOpen(true)}>
            {currentNode.id && (
              <iframe
                className="yt-iframe"
                src={`https://www.youtube.com/embed/${currentNode.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentNode.id}&rel=0&modestbranding=1`}
                allow="autoplay; fullscreen"
                onLoad={() => { setIsFading(false); setLoadedId(currentNode.id); }}
              ></iframe>
            )}
        </div>

        <div className="mirror-btn" onClick={(e) => { e.stopPropagation(); setMirrored(!mirrored); }} title="Mirror Perspective">
            <svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
        </div>

        <div className={`nexus-overlay ${!uiOpen ? 'hidden' : ''}`} onClick={() => { setUiOpen(false); setPinOpen(false); setPinValue(''); setPinError(''); }}>
            <div className="holo-frame" onClick={(e) => e.stopPropagation()}>
                <div className="holo-crest"><AquariumCrest size={34} /></div>
                <h1 style={{margin:0, fontSize: '1.1rem', letterSpacing: '4px', color: 'var(--glow)'}}>{currentNode.name}</h1>
                <p style={{fontSize: '0.6rem', opacity: 0.6, marginTop: '10px'}}>
                  {loadedId !== currentNode.id ? (
                    <span className="aqua-spinner"><span className="aqua-ring" aria-hidden="true" /><span className="aqua-shimmer">{statusText}</span></span>
                  ) : `ACTIVE FEED: NODE_${String(currentIndex + 1).padStart(2, '0')}`}
                </p>

                <div className="btn-row">
                    <button className="btn" onClick={promptAddNode}><IcPlus /><span>Add Feed</span></button>
                    <button className="btn btn-danger" onClick={removeCurrentNode}><IcMinus /><span>Remove Feed</span></button>
                </div>

                {pinOpen ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); confirmRemoveWithPin(); }}
                      style={{ marginTop: '15px', textAlign: 'left' }}
                    >
                        <label htmlFor="aquarium-pin" style={{ fontSize: '0.6rem', letterSpacing: '2px', opacity: 0.7 }}>
                          PIN REQUIRED TO REMOVE &ldquo;{currentNode.name}&rdquo;
                        </label>
                        <input
                          id="aquarium-pin"
                          type="password"
                          autoComplete="off"
                          value={pinValue}
                          onChange={(e) => setPinValue(e.target.value)}
                          placeholder="Enter your PIN"
                          style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '8px', padding: '12px', borderRadius: '12px', border: '1px solid var(--danger)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '1rem', fontFamily: 'inherit' }}
                        />
                        {pinError && <p style={{ color: '#ff8095', fontSize: '0.65rem', margin: '8px 0 0' }}>{pinError}</p>}
                        <div className="btn-row">
                            <button type="submit" className="btn btn-danger" disabled={pinBusy || !pinValue}>
                              {pinBusy ? 'Checking…' : 'Confirm removal'}
                            </button>
                            <button type="button" className="btn" onClick={() => { setPinOpen(false); setPinValue(''); setPinError(''); }}>
                              Cancel
                            </button>
                        </div>
                    </form>
                ) : null}

                <a href="mailto:stakeme10000@gmail.com" className="btn">Request Console</a>
            </div>
        </div>

        <div className={`hud-bar ${uiOpen ? 'hidden' : ''}`}>
            <div>
                {loadedId !== currentNode.id ? (
                  <span className="aqua-spinner"><span className="aqua-ring" aria-hidden="true" /><span className="aqua-shimmer">ESTABLISHING CONNECTION...</span></span>
                ) : (
                  `NODE: ${String(currentIndex + 1).padStart(2, '0')}/${nodes.length}`
                )}
            </div>
            <div className="hud-swipe">
                <span className="chevron left">‹‹</span> SWIPE NEXUS <span className="chevron right">››</span>
            </div>
        </div>
        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </>
  );
}


