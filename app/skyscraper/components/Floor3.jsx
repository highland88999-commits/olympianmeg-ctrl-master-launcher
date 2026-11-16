'use client';
import { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useVideoTexture } from '@react-three/drei';
import { AdaptivePOM } from './POMMaterial';
import CityViewWindow from './CityViewWindow';

const VIDEO_MAPS = { 1: '/media/skyscraper/0qdcn7.mp4', 2: 'https://files.catbox.moe/awr0ry.mp4', 0: '/media/skyscraper/lugn8p.mp4' };
const CORRECT_SEQUENCE = [1, 2, 0];

const VideoMaterial = ({ url }) => {
    const tex = useVideoTexture(url, { muted: true, loop: true, playsInline: true, start: true });
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    return <meshBasicMaterial map={tex} />;
};

const Pillar = ({ id, position, active, isError, onClick, isMobile }) => {
    let emissiveColor = 0xff0000;
    let intensity = 2;

    if (active) { emissiveColor = 0x39ff14; intensity = 2; } 
    else if (isError) { emissiveColor = 0x39ff14; intensity = 4; }

    return (
        <mesh position={position} onClick={(e) => onClick(e, id)}>
            <cylinderGeometry args={[2, 2, 15, 32]} />
            {active && !isMobile ? (
                <VideoMaterial url={VIDEO_MAPS[id]} />
            ) : (
                <meshStandardMaterial color={emissiveColor} emissive={emissiveColor} emissiveIntensity={intensity} roughness={0.1} />
            )}
        </mesh>
    );
};

export default function Floor3({ elevation, isMobile }) {
    const [isLocked, setIsLocked] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [activePillars, setActivePillars] = useState([]);
    const [errorPillarId, setErrorPillarId] = useState(null);
    const [roomBrightness, setRoomBrightness] = useState(1.0);
    
    const [animateScan, setAnimateScan] = useState(false);
    const scanRef = useRef();
    const vortexRef = useRef();

    useFrame(() => {
        if (animateScan && scanRef.current) {
            scanRef.current.position.y -= 1.0;
            if (scanRef.current.position.y < 0) setAnimateScan(false);
        }
        if (vortexRef.current) vortexRef.current.rotation.y -= 0.02;
    });

    const handlePillarClick = (e, id) => {
        e.stopPropagation();
        if (!isLocked || isProcessing || e.distance > 15 || activePillars.includes(id)) return;
        setIsProcessing(true);

        if (id === CORRECT_SEQUENCE[currentStep]) {
            setActivePillars(prev => [...prev, id]);
            setCurrentStep(prev => prev + 1);
            setIsProcessing(false);
        } else {
            setErrorPillarId(id);
            setTimeout(() => setErrorPillarId(null), 250);
            setTimeout(() => setErrorPillarId(id), 500);
            setTimeout(() => { setErrorPillarId(null); setActivePillars([]); setCurrentStep(0); setIsProcessing(false); }, 750);
        }
    };

    const handleButtonClick = async (e) => {
        e.stopPropagation();
        if (e.distance > 15 || currentStep < CORRECT_SEQUENCE.length || !isLocked) return;
        setIsProcessing(true); setIsLocked(false);
        setRoomBrightness(0.0);
        await new Promise(r => setTimeout(r, 1000));
        setAnimateScan(true);
        setIsProcessing(false);
    };

    const particles = useMemo(() => {
        const pCount = 800; const pos = new Float32Array(pCount * 3);
        for(let i = 0; i < pCount; i++) {
            const r = Math.random() * 25 + 2, a = Math.random() * Math.PI * 2;
            pos[i*3] = Math.cos(a) * r; pos[i*3+1] = Math.random() * 60; pos[i*3+2] = Math.sin(a) * r;
        }
        return pos;
    }, []);

    const btnColor = currentStep === CORRECT_SEQUENCE.length ? 0x39ff14 : 0xff0000;

    return (
        <group position-y={elevation}>
            <ambientLight intensity={roomBrightness === 1.0 ? 0.3 : 0} />
            
            <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[60, 60]} /><AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.03} brightness={roomBrightness} /></mesh>
            <mesh rotation-x={Math.PI / 2} position-y={60}><planeGeometry args={[60, 60]} /><AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.03} brightness={roomBrightness} /></mesh>
            <mesh position={[0, 30, -30]}><planeGeometry args={[60, 60]} /><AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.03} brightness={roomBrightness} /></mesh>
            <mesh position={[30, 30, 0]} rotation-y={-Math.PI/2}><planeGeometry args={[60, 60]} /><AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.03} brightness={roomBrightness} /></mesh>
            <mesh position={[0, 30, 30]} rotation-y={Math.PI}><planeGeometry args={[60, 60]} /><AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.03} brightness={roomBrightness} /></mesh>
            <mesh position={[-30, 30, 0]} rotation-y={Math.PI/2}><planeGeometry args={[60, 60]} /><AdaptivePOM isMobile={isMobile} imgUrl="/media/skyscraper/oxe2do.png" videoUrl="/media/skyscraper/3iyk49.mp4" scale={0.03} brightness={roomBrightness} /></mesh>

            <Pillar id={0} position={[0, 7.5, -15]} active={activePillars.includes(0)} isError={errorPillarId === 0} onClick={handlePillarClick} isMobile={isMobile} />
            <Pillar id={1} position={[20, 7.5, 10]} active={activePillars.includes(1)} isError={errorPillarId === 1} onClick={handlePillarClick} isMobile={isMobile} />
            <Pillar id={2} position={[-20, 7.5, 5]} active={activePillars.includes(2)} isError={errorPillarId === 2} onClick={handlePillarClick} isMobile={isMobile} />

            {/* CGI: one window onto the city far below — the puzzle
                room keeps its height. Pillars, button, scan and
                vortex untouched. */}
            <CityViewWindow position={[29.7, 30, 0]} rotation={[0, -Math.PI / 2, 0]} />

            <mesh position={[0, 10, -29.7]} onClick={handleButtonClick}>
                <boxGeometry args={[2, 2, 0.5]} />
                <meshStandardMaterial color={btnColor} emissive={btnColor} emissiveIntensity={currentStep === CORRECT_SEQUENCE.length ? 3 : 1} />
            </mesh>

            {animateScan && (
                <mesh ref={scanRef} rotation-x={Math.PI / 2} position-y={60}>
                    <planeGeometry args={[60, 60]} />
                    <meshBasicMaterial color={0x39ff14} transparent opacity={0.8} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
                </mesh>
            )}

            {!isLocked && !isMobile && (
                <points ref={vortexRef}>
                    <bufferGeometry><bufferAttribute attach="attributes-position" count={800} array={particles} itemSize={3} /></bufferGeometry>
                    <pointsMaterial color={0x39ff14} size={0.3} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
                </points>
            )}
        </group>
    );
}
