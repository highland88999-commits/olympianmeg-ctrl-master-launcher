'use client';
import { useState, useEffect, Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import { Canvas } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import { createClient } from '@supabase/supabase-js';

import RadialMenu from './components/RadialMenu';
import FloorMenu from './components/FloorMenu';
import Telemetry from './components/Telemetry';
import { MapProvider } from './components/MapContext';
import AphroIcon from '@/components/aphrodite/icons';
import { aphroPanel } from '@/components/aphrodite/ambience';
import CharacterPicker from '@/components/characters/CharacterPicker';

// APHRODITE light touch (per directive): icon glyphs on the page-level
// buttons + shared panel texture on the two modal panels. Nothing structural.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

// 🚀 CRASH FIX: Forcing NexusEngine to bypass Server-Side Rendering eliminates the Hydration Black Screen
const NexusEngine = dynamic(() => import("./components/NexusEngine"), { ssr: false });

const ExcaliburScene = dynamic(() => import("./components/ExcaliburScene"), { ssr: false, loading: () => null });
const VortexMirrorScene = dynamic(() => import("./components/VortexMirrorScene"), { ssr: false, loading: () => null });
const OmegaArchScene = dynamic(() => import("./components/OmegaArchScene"), { ssr: false, loading: () => null });
const HermesScene = dynamic(() => import("./components/HermesTerminalScene"), { ssr: false, loading: () => null });
const ApparelScene = dynamic(() => import("./components/ApparelRoomScene"), { ssr: false, loading: () => null }); 
const SwaSabersScene = dynamic(() => import("./components/DeathStarScene"), { ssr: false, loading: () => null }); 
const ColosseumScene = dynamic(() => import("./components/ColosseumScene"), { ssr: false, loading: () => null });

const BillboardScene = dynamic(() => import("./components/BillboardUniverseScene"), { ssr: false, loading: () => null });
const ForestScene = dynamic(() => import("./components/ForestUniverseScene"), { ssr: false, loading: () => null });
const DragonScene = dynamic(() => import("./components/DragonUniverseScene"), { ssr: false, loading: () => null });
const HamunaptraScene = dynamic(() => import("./components/HamunaptraUniverseScene"), { ssr: false, loading: () => null });

export default function OmegaTower() {
    const [isMobile, setIsMobile] = useState(true);
    const [hasEntered, setHasEntered] = useState(false);
    const [showLanding, setShowLanding] = useState(true); 
    const { progress } = useProgress(); 
    
    const [forceUnlock, setForceUnlock] = useState(false);
    useEffect(() => { const timer = setTimeout(() => setForceUnlock(true), 4000); return () => clearTimeout(timer); }, []);

    const isLoaded = progress >= 95 || forceUnlock;

    const [currentFloor, setCurrentFloor] = useState(0); 
    const [animState, setAnimState] = useState('FREE_ROAM');
    const [controlMode, setControlMode] = useState('LOOK');

    const [portalUrl, setPortalUrl] = useState(null);
    const [isBackpackOpen, setIsBackpackOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isFreeRoam, setIsFreeRoam] = useState(false);
    const [isGhostMode, setIsGhostMode] = useState(false);

    const [hp, setHp] = useState(100);
    const [isDead, setIsDead] = useState(false);
    const [showRespawnPrompt, setShowRespawnPrompt] = useState(false);
    
    const [isExcaliburUnlocked, setIsExcaliburUnlocked] = useState(false);
    const [showExcaliburModal, setShowExcaliburModal] = useState(false);

    const [inventoryData, setInventoryData] = useState([]);
    const [activePlot, setActivePlot] = useState(null); 
    const [showMilesModal, setShowMilesModal] = useState(false);
    const [inMilesRoom, setInMilesRoom] = useState(false);
    
    const [showRestrictedModal, setShowRestrictedModal] = useState(false);
    const [restrictedPassword, setRestrictedPassword] = useState("");
    
    const [user, setUser] = useState(null);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // WAVE 2: the walker's character pick (CharacterPicker reports
    // the effective pick — surface override > profile character —
    // and NexusEngine embodies it; undefined until the picker does)
    const [walkerPick, setWalkerPick] = useState(undefined);

    useEffect(() => {
        setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    }, []);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        window.takeDamage = (amount) => {
            setHp(prev => {
                const newHp = Math.max(0, prev - amount);
                if (newHp === 0 && !isDead) {
                    setIsDead(true);
                    setAnimState('FREE_ROAM'); 
                }
                return newHp;
            });
            const flash = document.getElementById('damage-flash');
            if (flash) {
                flash.style.opacity = 1;
                setTimeout(() => flash.style.opacity = 0, 150);
            }
        };
        return () => { delete window.takeDamage; };
    }, [isDead]);

    const mockInventory = useMemo(() => [
        { id: 1, name: "OMEGA CORE", qty: 1, url: "/media/skyscraper/Astronaut.glb" },
        { id: 2, name: "CYBER BLADE", qty: 3, url: "/media/skyscraper/DamagedHelmet.gltf" }
    ], []);

    useEffect(() => {
        if (isBackpackOpen && user) {
            setInventoryData(mockInventory);
        }
    }, [isBackpackOpen, user, mockInventory]);

    const handleRespawn = () => {
        setHp(100);
        setIsDead(false);
        setShowRespawnPrompt(true);
        setTimeout(() => setShowRespawnPrompt(false), 3000);
    };

    useEffect(() => {
        if (!showRespawnPrompt) return;
        const clearPrompt = () => setShowRespawnPrompt(false);
        window.addEventListener('keydown', clearPrompt);
        window.addEventListener('mousedown', clearPrompt);
        window.addEventListener('touchstart', clearPrompt);
        return () => {
            window.removeEventListener('keydown', clearPrompt);
            window.removeEventListener('mousedown', clearPrompt);
            window.removeEventListener('touchstart', clearPrompt);
        };
    }, [showRespawnPrompt]);

    return (
        <main id="skyscraper-root" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', backgroundColor: '#000', overflow: 'hidden', touchAction: 'none', fontFamily: 'monospace' }}>
            {/* Scoped reset ported from the original globals.css base layer --
                scoped under #skyscraper-root so nothing leaks into the launcher. */}
            <style>{`#skyscraper-root, #skyscraper-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
#skyscraper-root { z-index: 1; -webkit-user-select: none; user-select: none; }`}</style>
            <Script type="module" src="/skyscraper/model-viewer.min.js" strategy="lazyOnload" />
            
            <Telemetry />
            <FloorMenu animState={animState} setAnimState={setAnimState} currentFloor={currentFloor} setCurrentFloor={setCurrentFloor} />

            <div id="damage-flash" style={{ position: 'fixed', inset: 0, background: 'rgba(255,0,85,0.4)', zIndex: 9000, pointerEvents: 'none', opacity: 0, transition: 'opacity 0.1s' }} />

            {showRespawnPrompt && (
                <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff00ff', fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '4px', textShadow: '0 0 10px #ff00ff', zIndex: 7000, pointerEvents: 'none' }}>
                    DRIVE THROUGH THE PORTAL
                </div>
            )}

            {isDead && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}>
                    <video autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6, filter: 'contrast(1.2) sepia(1.1)' }}>
                        <source src="/media/skyscraper/8f5xpr.mov" type="video/mp4" />
                    </video>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 20%, rgba(20,0,0,0.8) 100%)', zIndex: 2 }} />
                    <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)', fontWeight: 900, color: '#ff0055', letterSpacing: '8px', margin: 0, textShadow: '0 0 20px rgba(255,0,85,0.8), 2px 2px 0px #00f0ff, -2px -2px 0px #ff00ff' }}>NEURAL LINK SEVERED</h1>
                        <div style={{ fontSize: 'clamp(0.8rem, 3vw, 1.2rem)', color: '#88a0b5', letterSpacing: '6px', marginTop: '10px', marginBottom: '40px' }}>CRITICAL BIOMETRIC FAILURE</div>
                        <button onClick={handleRespawn} style={{ background: 'rgba(255, 0, 85, 0.1)', border: '2px solid #ff0055', color: '#ff0055', padding: '15px 40px', fontSize: '1.2rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '4px', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 0 20px rgba(255,0,85,0.4)', transition: 'all 0.3s', display: 'inline-flex', alignItems: 'center', gap: 10 }}><AphroIcon name="bolt" size={18} /> RE-ESTABLISH LINK</button>
                    </div>
                </div>
            )}

            {isMobile && !isDead && (
                <div id="joystick-base" style={{ position: 'fixed', width: '100px', height: '100px', background: 'rgba(0, 240, 255, 0.1)', border: '2px solid rgba(0, 240, 255, 0.3)', borderRadius: '50%', display: 'none', zIndex: 100, pointerEvents: 'none', transform: 'translate(-50%, -50%)' }}>
                    <div id="joystick-stick" style={{ position: 'absolute', top: '50%', left: '50%', width: '40px', height: '40px', background: 'rgba(0, 240, 255, 0.5)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
                </div>
            )}

            {isBackpackOpen && (
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '85vw', maxWidth: '800px', height: '75vh', backdropFilter: 'blur(10px)', zIndex: 6000, borderRadius: '12px', border: '2px solid #00f0ff', boxShadow: '0 0 50px rgba(0,240,255,0.2)', display: 'flex', flexDirection: 'column', padding: '20px', ...aphroPanel({ backgroundColor: 'rgba(8,3,10,0.95)' }) }}>
                    <div style={{ paddingBottom: '15px', borderBottom: '1px solid #00f0ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ color: '#00f0ff', margin: 0, fontSize: '20px', letterSpacing: '4px', textShadow: '1px 1px 0 #000, -1px -1px 0 #000', display: 'flex', alignItems: 'center', gap: 10 }}><AphroIcon name="backpack" size={22} /> NEURAL BACKPACK</h2>
                        <button aria-label="Close backpack" onClick={() => setIsBackpackOpen(false)} style={{ background: 'transparent', border: 'none', color: '#ff00ff', cursor: 'pointer', display: 'flex', padding: 10 }}><AphroIcon name="x" size={26} /></button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                        {inventoryData.length > 0 ? inventoryData.map((item) => (
                            <div key={item.id} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <model-viewer src={item.url} auto-rotate camera-controls shadow-intensity="1" style={{ width: '100%', height: '160px', background: 'radial-gradient(circle, #222 0%, #000 100%)', borderRadius: '6px', marginBottom: '15px' }}></model-viewer>
                                <div style={{ color: '#00f0ff', fontWeight: 'bold', fontSize: '0.9rem', letterSpacing: '1px' }}>{item.name}</div>
                                <div style={{ color: '#88a0b5', fontSize: '0.75rem', marginTop: '5px' }}>QTY: {item.qty}</div>
                            </div>
                        )) : (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#88a0b5', padding: '50px 0', fontWeight: 'bold', letterSpacing: '2px' }}>BACKPACK EMPTY.</div>
                        )}
                    </div>
                </div>
            )}

            {!user && hasEntered && (
                <button onClick={() => setShowAuthModal(true)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 8000, background: 'rgba(0, 255, 255, 0.15)', border: '1px solid #00ffff', color: '#00ffff', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', letterSpacing: '2px', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="user" size={16} /> SYSTEM LOGIN</button>
            )}

            {/* WAVE 2: walk as your character — the pick defaults to
                your profile character; Deadpool stays the native
                body when you have none or a model fails to load */}
            {hasEntered && (
                <CharacterPicker
                    surface="skyscraper"
                    accent="#00f0ff"
                    onPick={setWalkerPick}
                    style={{ top: '70px', left: '20px', zIndex: 8000 }}
                />
            )}
            
            {isGhostMode && (
                <button onClick={() => setIsGhostMode(false)} style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 8000, background: 'rgba(255, 0, 0, 0.15)', border: '1px solid #ff0000', color: '#ff0000', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', letterSpacing: '2px', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="ghost" size={16} /> EXIT GHOST PROTOCOL</button>
            )}

            {hasEntered && !isDead && (
                <button onClick={() => window.takeDamage(20)} style={{ position: 'absolute', top: '70px', right: '20px', zIndex: 8000, background: 'rgba(255,0,0,0.2)', border: '1px solid #ff0000', color: '#ff0000', padding: '5px 10px', fontSize: '10px' }}>HP: {hp}/100 (TEST HIT)</button>
            )}

            {animState === 'DRIVING' && (
                <div style={{ position: 'fixed', bottom: '120px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '20px', zIndex: 6000 }}>
                    <button onClick={() => setAnimState('FREE_ROAM')} style={{ padding: '12px 24px', background: 'rgba(255,0,0,0.15)', border: '2px solid #ff0044', color: '#ff0044', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> DISMOUNT</button>
                    <button onClick={() => setIsFreeRoam(!isFreeRoam)} style={{ padding: '12px 24px', background: isFreeRoam ? 'rgba(0,255,0,0.15)' : 'rgba(0,255,255,0.15)', border: `2px solid ${isFreeRoam ? '#00ff00' : '#00ffff'}`, color: isFreeRoam ? '#00ff00' : '#00ffff', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name={isFreeRoam ? 'orbit' : 'grid'} size={16} />{isFreeRoam ? 'FREE ROAM: ON' : 'GRID LOCK: ON'}</button>
                </div>
            )}

            {showRestrictedModal && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 7002, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', padding: '16px' }}>
                    <div style={{ maxWidth: '400px', width: '100%', border: '2px solid #ff0000', padding: '32px', boxShadow: '0 0 40px rgba(255, 0, 0, 0.4)', position: 'relative', ...aphroPanel({ backgroundColor: 'rgba(10,2,4,0.97)' }) }}>
                        <button onClick={() => setShowRestrictedModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', color: '#ff0000', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>[X]</button>
                        <h1 style={{ fontSize: '20px', textAlign: 'center', letterSpacing: '4px', color: '#ff0000', textShadow: '0 0 15px #ff0000', marginBottom: '24px' }}>RESTRICTED SECTOR</h1>
                        <form onSubmit={(e) => { e.preventDefault(); if(restrictedPassword === "Redirection#94"){ setIsGhostMode(true); setShowRestrictedModal(false); } }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <input type="password" value={restrictedPassword} onChange={(e) => setRestrictedPassword(e.target.value)} required style={{ width: '100%', background: 'transparent', border: '1px solid #ff0000', color: 'white', padding: '12px', outline: 'none' }} />
                            <button type="submit" style={{ background: 'rgba(255, 0, 0, 0.2)', border: '1px solid #ff0000', color: '#ff0000', padding: '12px', letterSpacing: '4px', fontWeight: 'bold', cursor: 'pointer' }}>SUBMIT</button>
                        </form>
                    </div>
                </div>
            )}

            {activePlot === 'BILLBOARDS' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(0,229,255,0.2)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> RETURN TO CITY</button>
                    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 100], fov: 60 }}>
                        <Suspense fallback={null}><BillboardScene /></Suspense>
                    </Canvas>
                </div>
            )}

            {activePlot === 'FOREST' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(57,255,20,0.2)', border: '1px solid #39ff14', color: '#39ff14', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> RETURN TO CITY</button>
                    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 20, 80], fov: 60 }}>
                        <Suspense fallback={null}><ForestScene /></Suspense>
                    </Canvas>
                </div>
            )}

            {activePlot === 'DRAGON' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(0,255,255,0.2)', border: '1px solid #00ffff', color: '#00ffff', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> FLEE THE DRAGON</button>
                    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1500, 3500], fov: 60, near: 0.1, far: 15000 }}>
                        <Suspense fallback={null}><DragonScene /></Suspense>
                    </Canvas>
                </div>
            )}

            {activePlot === 'HAMUNAPTRA' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(212,175,55,0.2)', border: '1px solid #d4af37', color: '#d4af37', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> ESCAPE THE SANDS</button>
                    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 50, 1000], fov: 60, near: 1, far: 20000 }}>
                        <Suspense fallback={null}><HamunaptraScene /></Suspense>
                    </Canvas>
                </div>
            )}

            {activePlot === 'COLOSSEUM' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(0,255,255,0.2)', border: '1px solid #00ffff', color: '#00ffff', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> RETURN TO CITY</button>
                    <ColosseumScene onOpenFullscreen={() => setPortalUrl("https://colossus-xi.vercel.app")} />
                </div>
            )}

            {activePlot === 'APPAREL' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(255,215,0,0.2)', border: '1px solid #FFD700', color: '#FFD700', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> RETURN TO CITY</button>
                    <ApparelScene onOpenFullscreen={() => setPortalUrl("https://olympus-lac.vercel.app")} />
                </div>
            )}

            {activePlot === 'SWA_SABERS' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(255,0,0,0.2)', border: '1px solid #ff0000', color: '#ff0000', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> RETURN TO CITY</button>
                    <SwaSabersScene onOpenFullscreen={() => setPortalUrl("https://swasabers.com?sca_ref=12183767.7E1Om8BE4jRk")} />
                </div>
            )}

            {activePlot === 'EXCALIBUR' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: '#010103' }}>
                    <button onClick={() => setActivePlot(null)} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 7001, background: 'rgba(0,255,255,0.2)', border: '1px solid #00ffff', color: '#00ffff', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="door-exit" size={16} /> RETURN TO CITY</button>
                    <ExcaliburScene onObjectClick={() => { if (!isExcaliburUnlocked) setShowExcaliburModal(true); }} isUnlocked={isExcaliburUnlocked} />
                </div>
            )}

            {portalUrl && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '10px 20px', background: '#050505', borderBottom: '2px solid #d4af37', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#d4af37', letterSpacing: '4px', fontWeight: 'bold', fontSize: '12px' }}>SECURE UPLINK ESTABLISHED</span>
                        <button onClick={() => setPortalUrl(null)} style={{ background: 'rgba(255,0,0,0.2)', color: '#ff0044', border: '1px solid #ff0044', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', letterSpacing: '2px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 8 }}><AphroIcon name="x" size={14} /> CLOSE CONNECTION</button>
                    </div>
                    <iframe src={portalUrl} style={{ flex: 1, width: '100%', border: 'none' }} />
                </div>
            )}

            {hasEntered && <RadialMenu openPortalOverlay={setPortalUrl} openBackpack={setIsBackpackOpen} toggleMap={() => setIsMapOpen(!isMapOpen)} openSettings={setIsSettingsOpen} />}

            {showLanding && (
                <div onClick={() => isLoaded && (setHasEntered(true), setTimeout(() => setShowLanding(false), 1000))} style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', opacity: hasEntered ? 0 : 1, transition: 'opacity 1s ease', cursor: isLoaded ? 'pointer' : 'wait' }}>
                    <video autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 1 }}>
                        <source src="/media/skyscraper/uqokyy.mp4" type="video/mp4" />
                    </video>
                </div>
            )}

            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                {/* 🚀 Changed near plane to 0.1 to prevent logarithmicDepthBuffer crashing on mobile GPUs */}
                <Canvas dpr={[1, 1.5]} camera={{ position: [0, -478.3, 30], fov: isMobile ? 85 : 75, near: 0.1, far: 15000 }} gl={{ antialias: !isMobile, alpha: true, powerPreference: "high-performance", logarithmicDepthBuffer: true }}>
                    <MapProvider>
                        <Suspense fallback={null}>
                            <NexusEngine 
                                currentFloor={currentFloor} setCurrentFloor={setCurrentFloor} 
                                animState={animState} setAnimState={setAnimState} 
                                controlMode={controlMode} isMobile={isMobile} 
                                hasEntered={hasEntered} 
                                isMapOpen={isMapOpen} setIsMapOpen={setIsMapOpen}
                                isFreeRoam={isFreeRoam} isGhostMode={isGhostMode}
                                isDead={isDead}
                                setActivePlot={setActivePlot}
                                inMilesRoom={inMilesRoom} setInMilesRoom={setInMilesRoom}
                                setShowMilesModal={setShowMilesModal}
                                setShowRestrictedModal={setShowRestrictedModal}
                                supabase={supabase} user={user}
                                walkerCharacterId={walkerPick}
                            />
                        </Suspense>
                    </MapProvider>
                </Canvas>
            </div>
        </main>
    );
}
