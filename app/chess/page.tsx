'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// UI Components
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

// OASIS — universal multiplayer lobby (min-max participation, NPC backfill, bosses)
import OasisLobby from '@/components/oasis/Lobby';

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
  const [mode, setMode] = useState<string | null>(null);
  const [oasisOpen, setOasisOpen] = useState(false);
  const [npcName, setNpcName] = useState<string | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');
      
      const cached = localStorage.getItem('nexus_user');
      setUser(cached || session.user.email?.split('@')[0].toUpperCase() || 'OPERATOR');
      setUserId(session.user.id);
      // Universal deep link: /chess?code=XXXXXX opens the OASIS lobby, which auto-joins.
      const params = new URLSearchParams(window.location.search);
      if (params.get('code')) setOasisOpen(true);
    };
    initSession();
  }, [router]);

  const { 
    sectorId, playerColor, gameStatus, opponentMove, opponentResigned,
    hostMatch, joinMatch, adoptRoom, broadcastMove, broadcastResign,
    broadcastState, fullStateSync, hostNeedsToSync 
  } = useMatchmaking(user);
  
  const { 
    pieces, currentTurn, isGameOver, winner, isCheck, 
    initGame, isValidMove, executeMove, setGameState, resignGame
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
    setCyanSkinTex(loadSkinTexture("https://files.catbox.moe/ktdwd1.mov")); 
    setPinkSkinTex(loadSkinTexture("https://files.catbox.moe/46h29k.mov")); 

    const loadBoardTexture = (src: string) => {
      const vid = document.createElement("video");
      vid.src = src; vid.crossOrigin = "Anonymous"; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.play().catch(e => console.warn("Auto-play prevented", e));
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };
    setBoardTex(loadBoardTexture("/chess/gemini_generated_video_789958CD.mov")); 

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
    setRookWallTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_8A9D1A5A.mov'));
    setKingHoleTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_758D2655.mov'));
    setBishopBookTex(loadEffectVideo('/chess/assets/effects/gemini_generated_video_40DA2773.mov'));
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
      executeMove(opponentMove.pieceId, opponentMove.to.x, opponentMove.to.z, true);
    }
  }, [opponentMove, isGameOver]); 

  useEffect(() => {
    if (mode === 'ai' && currentTurn === 'pink' && !isGameOver) {
      const timer = setTimeout(() => {
        const aiPieces = pieces.filter(p => p.team === 'pink' && p.alive);
        for (let p of aiPieces) {
          for (let z = 0; z < 8; z++) {
            for (let x = 0; x < 8; x++) {
              if (isValidMove(p, x, z)) {
                executeMove(p.id, x, z);
                return;
              }
            }
          }
        }
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [currentTurn, mode, isGameOver, pieces, isValidMove, executeMove]);

  const handleModeSelect = async (selectedMode: string, code: string | null = null) => {
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
    if (isGameOver) return;
    if (mode === 'ai' && currentTurn === 'pink') return;
    
    if (mode === 'global') {
      if (gameStatus === 'waiting') return;
      if (currentTurn !== playerColor) return;
    }

    if (selectedPieceId) {
      const piece = pieces.find(p => p.id === selectedPieceId);
      if (piece && isValidMove(piece, x, z)) {
        executeMove(piece.id, x, z);
      }
      setSelectedPieceId(null);
    }
  };

  if (!user) return <div className="w-screen h-screen bg-black" />

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050505]">
      
      <button 
        onClick={() => router.push('/')}
        className="absolute z-50 px-4 py-2 text-xs font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-cyan-400 hover:border-cyan-400"
      >
        EXIT MATRIX
      </button>

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
            user={user} sectorId={sectorId} gameMode={mode} gameStatus={gameStatus}
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

      {isGameOver && <GameOver winner={winner} onRestart={() => window.location.reload()} />}

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

        <Board onTileClick={handleTileClick} boardTex={boardTex} />
        
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
                if (p.team === currentTurn) setSelectedPieceId(p.id);
              }}
            />
          );
        })}

        <OrbitControls enableDamping={false} maxPolarAngle={Math.PI * 0.48} minDistance={4} maxDistance={45} target={[0, 4.5, 0]} />
        
        <EffectComposer>
          <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.2} intensity={1.5} />
        </EffectComposer>
      </Canvas>
    </main>
  );
}


