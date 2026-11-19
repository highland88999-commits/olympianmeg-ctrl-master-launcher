'use client';
import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { grantAchievement } from '@/lib/achievements/award';
import AchievementBanner from '@/components/achievements/AchievementBanner';

// UI Components
import { BackButton } from '@/components/ui';
import Modes from '@/components/chess/Modes';
import Board from '@/components/chess/Board';
import HUD from '@/components/chess/HUD';
import GameOver from '@/components/chess/GameOver';
import RulesOverlay from '@/components/chess/RulesOverlay';

// 3D Piece Components
import Pawn from '@/components/chess/pieces/Pawn';
import Knight from '@/components/chess/pieces/Knight';
import Bishop from '@/components/chess/pieces/Bishop';
import Rook from '@/components/chess/pieces/Rook';
import Queen from '@/components/chess/pieces/Queen';
import King from '@/components/chess/pieces/King';

// Hooks
import { useChessEngine } from '@/hooks/chess/useChessEngine';
import { useMatchmaking } from '@/hooks/chess/useMatchmaking';
import { chooseAiMove } from '@/lib/chess/ai';
import { PROMOTION_CHOICES } from '@/lib/chess/rules';

// OASIS — universal multiplayer lobby (min-max participation, NPC backfill, bosses)
import OasisLobby from '@/components/oasis/Lobby';
import { fx, unlockFx } from '@/lib/fx';
import { AresBackdrop, AresLoader } from '@/components/ares/ares-chrome';

const PIECE_COMPONENTS = {
  pawn: Pawn,
  knight: Knight,
  bishop: Bishop,
  rook: Rook,
  queen: Queen,
  king: King
};

function EarthBackground() {
  const earthRef = useRef<THREE.Mesh>(null!);
  const colorMap = useTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg');
  useFrame((state, delta) => { if (earthRef.current) earthRef.current.rotation.y += delta * 0.05; });
  return (
    <mesh ref={earthRef} position={[0, -50, -80]}>
      <sphereGeometry args={[45, 64, 64]} />
      <meshStandardMaterial map={colorMap} roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

function MarsBackground() {
  const marsRef = useRef<THREE.Mesh>(null!);
  useFrame((state, delta) => { if (marsRef.current) marsRef.current.rotation.y += delta * 0.05; });
  return (
    <group position={[0, -20, 80]}>
      <mesh ref={marsRef}>
        <sphereGeometry args={[25, 64, 64]} />
        <meshStandardMaterial color="#b33900" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh scale={[1.02, 1.02, 1.02]}>
        <sphereGeometry args={[25, 64, 64]} />
        <meshBasicMaterial color="#ff5500" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

export default function QuantumChess() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [oasisOpen, setOasisOpen] = useState(false);
  const [npcName, setNpcName] = useState<string | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  const [legalTargets, setLegalTargets] = useState<Array<{ x: number; z: number }>>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ pieceId: number; x: number; z: number } | null>(null);

  const [celebrateKey, setCelebrateKey] = useState<string | null>(null); // achievement celebration

  // Fire-and-forget achievement grant. Signed-in users only (guests earn
  // nothing server-side); the banner shows only when the server confirms
  // a fresh award (awarded=false means already held — no repeat celebration).
  const getToken = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  }, []);
  const award = useCallback((key: string) => {
    grantAchievement(key, getToken).then((r) => {
      if (r && r.awarded) setCelebrateKey((cur) => cur ?? key);
    }).catch(() => {});
  }, [getToken]);
  
  const [cyanSkinTex, setCyanSkinTex] = useState<THREE.VideoTexture | null>(null);
  const [pinkSkinTex, setPinkSkinTex] = useState<THREE.VideoTexture | null>(null);

  const [pawnLaserTex, setPawnLaserTex] = useState<THREE.Texture | null>(null);
  const [queenSwordTex, setQueenSwordTex] = useState<THREE.Texture | null>(null);
  const [rookWallTex, setRookWallTex] = useState<THREE.VideoTexture | null>(null);
  const [kingHoleTex, setKingHoleTex] = useState<THREE.VideoTexture | null>(null);
  const [bishopBookTex, setBishopBookTex] = useState<THREE.VideoTexture | null>(null);
  const [kingAsteroidTex, setKingAsteroidTex] = useState<THREE.Texture | null>(null);
  const [boardTex, setBoardTex] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return router.push('/');

        const cached = localStorage.getItem('nexus_user');
        setUser(cached || session.user.email?.split('@')[0].toUpperCase() || 'OPERATOR');
        setUserId(session.user.id);
        // Universal deep link: /chess?code=XXXXXX opens the OASIS lobby, which auto-joins.
        const params = new URLSearchParams(window.location.search);
        if (params.get('code')) setOasisOpen(true);
      } catch {
        // Database connection unavailable (not configured, or unreachable).
        // Say so honestly instead of leaving a dead black screen.
        setCloudOffline(true);
      }
    };
    initSession();
  }, [router]);

  const { 
    sectorId, playerColor, gameStatus, opponentMove, opponentResigned,
    hostMatch, joinMatch, adoptRoom, broadcastMove, broadcastResign,
    broadcastState, fullStateSync, hostNeedsToSync 
  } = useMatchmaking(user);
  
  const { 
    pieces, currentTurn, isGameOver, winner, isCheck, lastMove,
    initGame, isValidMove, getLegalMoves, executeMove, setGameState, resignGame
  } = useChessEngine(mode, playerColor || 'cyan', broadcastMove);

  const gameStateRef = useRef({ pieces, currentTurn });
  useEffect(() => {
    gameStateRef.current = { pieces, currentTurn };
  }, [pieces, currentTurn]);

  useEffect(() => {
    if (mode === 'global' && playerColor === 'cyan' && hostNeedsToSync > 0) {
      broadcastState(gameStateRef.current.pieces, gameStateRef.current.currentTurn);
    }
  }, [hostNeedsToSync]); 

  useEffect(() => {
    if (mode === 'global' && playerColor === 'pink' && fullStateSync) {
      setGameState(fullStateSync.pieces, fullStateSync.currentTurn);
    }
  }, [fullStateSync, mode, playerColor, setGameState]);

  useEffect(() => {
    if (opponentResigned) {
      resignGame(playerColor === 'cyan' ? 'pink' : 'cyan');
    }
  }, [opponentResigned, playerColor, resignGame]);

  useEffect(() => {
    const loadSkinTexture = (src: string) => {
      const vid = document.createElement("video");
      vid.src = src; vid.crossOrigin = "Anonymous"; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.play().catch(e => console.warn("Auto-play prevented", e));
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; 
      tex.repeat.set(1.5, 0.9); tex.offset.set(0, 0.05); 
      return tex;
    };
    setCyanSkinTex(loadSkinTexture("/assets/chess/cyan-skin.mp4")); 
    setPinkSkinTex(loadSkinTexture("/assets/chess/pink-skin.mp4")); 

    const loadBoardTexture = (src: string) => {
      const vid = document.createElement("video");
      vid.src = src; vid.crossOrigin = "Anonymous"; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.play().catch(e => console.warn("Auto-play prevented", e));
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };
    setBoardTex(loadBoardTexture("/chess/gemini_generated_video_789958CD.mp4")); 

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/chess/assets/effects/640461e59c5fb5c122b6325b2a575b42.jpeg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; setPawnLaserTex(tex);
    });
    textureLoader.load('/chess/assets/effects/d0ef9a559b04f3b25b952dd20c0c1d8f.jpeg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; setQueenSwordTex(tex);
    });
    textureLoader.load('/chess/assets/effects/c160bbfd6745af3e1f2a5970b42fc540.jpeg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; setKingAsteroidTex(tex); 
    });

    const loadEffectVideo = (src: string) => {
      const vid = document.createElement("video");
      vid.src = src; vid.crossOrigin = "Anonymous"; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.play().catch(e => console.warn("Auto-play prevented", e));
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };
    setRookWallTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_8A9D1A5A.mp4'));
    setKingHoleTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_758D2655.mp4'));
    setBishopBookTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_40DA2773.mp4'));
  }, []);

  useEffect(() => {
    if (user && !mode) {
      const params = new URLSearchParams(window.location.search);
      const joinCode = params.get('code');
      if (joinCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
        handleModeSelect('join', joinCode.toUpperCase());
      }
    }
  }, [user, mode]);

  useEffect(() => {
    if (mode) initGame();
  }, [mode, initGame]);

  useEffect(() => {
    if (opponentMove && !isGameOver) {
      executeMove(opponentMove.pieceId, opponentMove.to.x, opponentMove.to.z, true, opponentMove.promotion || 'queen');
    }
  }, [opponentMove, isGameOver]); 

  // Quantum AI: real minimax search (alpha-beta, piece-square tables) —
  // it evaluates the position and plays the strongest move it finds.
  useEffect(() => {
    if (mode === 'ai' && currentTurn === 'pink' && !isGameOver) {
      const timer = setTimeout(() => {
        const mv = chooseAiMove(pieces, 'pink', lastMove, 3);
        if (mv) executeMove(mv.pieceId, mv.x, mv.z);
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [currentTurn, mode, isGameOver, pieces, lastMove, executeMove]);

  // Legal-move highlights for the selected piece.
  useEffect(() => {
    if (selectedPieceId == null) {
      setLegalTargets([]);
      return;
    }
    setLegalTargets(getLegalMoves(selectedPieceId));
  }, [selectedPieceId, pieces, getLegalMoves]);

  // --- game-feel FX ----------------------------------------------------------
  // unlock on first gesture (deep links may land here without the hub)
  useEffect(() => {
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // capture: a piece just died -> hit-lite
  const aliveRef = useRef<Record<number, boolean>>({});
  useEffect(() => {
    let captured = false;
    for (const p of pieces) {
      if (p.alive === false && aliveRef.current[p.id] !== false) captured = true;
      aliveRef.current[p.id] = p.alive;
    }
    if (captured) fx.hit();
  }, [pieces]);

  // check: soft chime + tick
  useEffect(() => {
    if (isCheck && !isGameOver) fx.checkpoint();
  }, [isCheck, isGameOver]);

  // checkmate / draw: full fanfare for a win, soft settle for a draw
  const overFxRef = useRef(false);
  useEffect(() => {
    if (!isGameOver || overFxRef.current) return;
    overFxRef.current = true;
    if (winner && winner !== 'draw') fx.gameWin();
    else fx.menuClose();
    // Achievements: the user plays playerColor (cyan by default in AI mode).
    const userColor = playerColor || 'cyan';
    const userWon = winner === userColor;
    const STREAK_KEY = 'olympus:achievements:streak:chess';
    if (userWon) {
      award('chess-first-blood');
      try {
        const streak = (Number(localStorage.getItem(STREAK_KEY)) || 0) + 1;
        localStorage.setItem(STREAK_KEY, String(streak));
        if (streak >= 3) award('chess-tactician');
      } catch { /* private mode: streak just doesn't persist */ }
      // PvP: 'global' mode means a human opponent (OASIS PvP launch).
      // NOTE: the grant route verifies PvP wins via pvp_matches — no match
      // records are written anywhere yet, so this 403s until that path exists.
      if (mode === 'global') award('chess-sector-champion');
    } else {
      try { localStorage.setItem(STREAK_KEY, '0'); } catch { /* private mode */ }
    }
  }, [isGameOver, winner, mode, playerColor, award]);

  const handleModeSelect = async (selectedMode: string, code: string | null = null) => {
    fx.tap(); // mode confirmed
    if (selectedMode === 'oasis') { setOasisOpen(true); return; }
    setMode(selectedMode);
    if (selectedMode === 'host') { await hostMatch(); setMode('global'); }
    if (selectedMode === 'join' && code) { await joinMatch(code); setMode('global'); }
  };

  // OASIS lobby launch: PvP rooms adopt the shared DB transport; NPC/boss
  // seats fall back to the local AI engine branded with the rival's name
  // (Merlin's min-max rule: nobody waits forever for a human opponent).
  const handleOasisLaunch = async ({ mode: launchMode, room, roster, boss }: any) => {
    const humans = (roster || []).filter((s: any) => s.kind === 'human');
    const rivals = (roster || []).filter((s: any) => s.kind !== 'human');
    const rivalName = boss ? boss.name : rivals[0]?.name || null;

    if (launchMode === 'pvp' && room && humans.length >= 2) {
      const isHost = room.host_id === userId;
      const ok = await adoptRoom(room.room_code, isHost ? 'cyan' : 'pink');
      if (ok) {
        setNpcName(null);
        setOasisOpen(false);
        setMode('global');
        return;
      }
    }
    // Solo vs NPC / boss, or a PvP room that backfilled to NPCs: play the AI.
    setNpcName(rivalName);
    setOasisOpen(false);
    setMode('ai');
  };

  const handleTileClick = (x: number, z: number) => {
    if (isGameOver || pendingPromotion) return;
    if (mode === 'ai' && currentTurn === 'pink') return;
    
    if (mode === 'global') {
      if (gameStatus === 'waiting') return;
      if (currentTurn !== playerColor) return;
    }

    if (selectedPieceId) {
      const piece = pieces.find(p => p.id === selectedPieceId);
      if (piece && isValidMove(piece, x, z)) {
        // A pawn reaching the far rank promotes — the player picks the piece.
        const lastRank = piece.team === 'cyan' ? 7 : 0;
        if (piece.type === 'pawn' && z === lastRank) {
          setPendingPromotion({ pieceId: piece.id, x, z });
        } else {
          executeMove(piece.id, x, z);
        }
      }
      setSelectedPieceId(null);
    }
  };

  const confirmPromotion = (choice: string) => {
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.pieceId, pendingPromotion.x, pendingPromotion.z, false, choice);
    setPendingPromotion(null);
    setSelectedPieceId(null);
  };

  if (cloudOffline) return (
    <main className="relative w-screen h-dvh overflow-hidden bg-[#050505] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-zinc-300 tracking-widest uppercase text-sm mb-3">Cloud features are offline</p>
        <p className="text-zinc-500 text-sm mb-6">
          This page needs the database connection. Check back once the cloud is connected.
        </p>
        <BackButton label="Exit matrix" href="/" />
      </div>
    </main>
  )

  if (!user) return <AresLoader label="ENTERING THE GRID" />

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-[#050505]">
      {/* ARES interior art: page backdrop behind menus/HUD (3D scene keeps its own sky) */}
      <AresBackdrop src="/images/chess/chess-bg.webp" strength={0.3} />
      <div className="absolute z-50 top-5 right-5">
        <BackButton label="EXIT MATRIX" href="/" />
      </div>

      {!mode && !oasisOpen && <Modes onSelectMode={handleModeSelect} />}

      {oasisOpen && !mode && userId && (
        <OasisLobby
          gameSlug="chess"
          supabase={supabase}
          userId={userId}
          callsign={user || 'OPERATOR'}
          onLaunch={handleOasisLaunch}
          onExit={() => setOasisOpen(false)}
        />
      )}
      
      {mode && (
        <>
          <HUD 
            user={user} sectorId={sectorId} gameMode={mode} gameStatus={mode === 'global' ? gameStatus : 'active'}
            currentTurn={currentTurn} playerColor={playerColor || 'cyan'} 
            isCheck={isCheck} opponentName={mode === 'ai' ? npcName : null}
            onResign={() => {
              resignGame(playerColor);
              broadcastResign();
            }}
          />
          <RulesOverlay />
        </>
      )}

      {pendingPromotion && !isGameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 p-8 bg-zinc-950 border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(0,242,255,0.15)]">
            <h2 className="text-sm font-bold tracking-[0.25em] uppercase text-cyan-300">Promote pawn to</h2>
            <div className="flex gap-3">
              {PROMOTION_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => confirmPromotion(c)}
                  className="min-h-[56px] px-5 py-3 text-xs font-bold tracking-widest uppercase border rounded border-zinc-600 text-zinc-100 hover:border-cyan-400 hover:bg-cyan-500/20 active:bg-cyan-500/40"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isGameOver && <GameOver winner={winner} onRestart={() => window.location.reload()} />}

      <AchievementBanner
        achievementKey={celebrateKey}
        show={!!celebrateKey}
        onDismiss={() => setCelebrateKey(null)}
      />

      <div className="absolute inset-0 overflow-y-auto">
      <Canvas camera={{ position: [0, 14, playerColor === 'pink' ? -25 : 25], fov: 52 }}>
        <color attach="background" args={['#050505']} />
        <fogExp2 attach="fog" args={['#050505', 0.015]} />
        
        <Stars radius={100} depth={50} count={7000} factor={4} saturation={0} fade speed={1} />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[-30, 20, 30]} color="#0088ff" intensity={4.0} />
        <directionalLight position={[30, 20, -30]} color="#cc00ff" intensity={4.0} />
        
        <Suspense fallback={null}>
          <EarthBackground />
          <MarsBackground />
        </Suspense>

        <Board onTileClick={handleTileClick} boardTex={boardTex} highlights={legalTargets} />
        
        {pieces.map(p => {
          const PieceComponent = PIECE_COMPONENTS[p.type] || Pawn;
          return (
            <PieceComponent 
              key={p.id} 
              team={p.team} 
              gridX={p.x} 
              gridZ={p.z} 
              isAlive={p.alive}
              isSelected={selectedPieceId === p.id}
              isAttacking={p.isAttacking}
              cyanSkinTex={cyanSkinTex}
              pinkSkinTex={pinkSkinTex}
              pawnLaserTex={pawnLaserTex}
              queenSwordTex={queenSwordTex}
              rookWallTex={rookWallTex}
              kingHoleTex={kingHoleTex}
              bishopBookTex={bishopBookTex}
              kingAsteroidTex={kingAsteroidTex}
              onClick={(e: any) => {
                e.stopPropagation();
                if (pendingPromotion) return;
                const selectableTeam = mode === 'global' ? playerColor : currentTurn;
                if (p.team === currentTurn && p.team === selectableTeam) {
                  fx.tap(); // piece selected
                  setSelectedPieceId(p.id);
                }
              }}
            />
          );
        })}

        <OrbitControls enableDamping={false} maxPolarAngle={Math.PI * 0.48} minDistance={4} maxDistance={45} target={[0, 4.5, 0]} />
        
        <EffectComposer>
          <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.2} intensity={1.5} />
        </EffectComposer>
      </Canvas>
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}


