'use client';
import { useRef, useEffect, useMemo, memo, useState } from 'react';
import * as THREE from 'three';
import { useVideoTexture, Clouds, Cloud, Text, Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

import EternalFlame from './EternalFlame';
import ProceduralRoads from './ProceduralRoads';
import StreetLights from './StreetLights';
import { useMapObjects } from './MapContext';

// CGI (Nov 15, 2026): procedural tower/city textures, tower wind +
// cloud drift, air traffic + crown beacon. Emissive only — no new
// real lights anywhere in this file (the four pointLights that
// were already here stay exactly four).
import { materialForSkyscraper } from '@/lib/skyscraper-cgi/textures.js';
import { cloudBankAt } from '@/lib/skyscraper-cgi/weather.js';
import {
    airTaxiFor, AIR_TAXI_COUNT, AIR_TAXI_COLORS, elevatorBeaconAt,
} from '@/lib/skyscraper-cgi/life.js';

const BLOCK_SIZE = 100; 
const ROAD_WIDTH = 12;  
// CGI: the plot slabs were flat #111. Same geometry, same edges —
// the tops now wear dark paving with panel seams + a faint glow.
const slabMaterial = materialForSkyscraper('plaza', 'omega-city', '#ffffff', { repeat: { x: 8, y: 8 } });
const lineMaterial = new THREE.LineBasicMaterial({ color: "#00ffff", transparent: true, opacity: 0.3 });

const RespawnCube = memo(({ position }) => {
    const portalVid = useVideoTexture('/media/skyscraper/va51ee.mp4', { muted: true, loop: true, playsInline: true });
    portalVid.colorSpace = THREE.SRGBColorSpace;
    
    const sideMat = useMemo(() => new THREE.MeshBasicMaterial({ map: portalVid }), [portalVid]);
    const capMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000 }), []);
    const materials = useMemo(() => [sideMat, sideMat, capMat, capMat, sideMat, sideMat], [sideMat, capMat]);

    return (
        <group position={position}>
            <mesh name="PORTAL_Respawn" material={materials} dispose={null}>
                <boxGeometry args={[10, 15, 10]} />
            </mesh>
            <Sparkles count={50} scale={[15, 20, 15]} size={8} color="#ffffff" speed={2} />
        </group>
    );
});
RespawnCube.displayName = 'RespawnCube';

// 🚀 PORTAL WARP — the drive-through / walk-through warp gates the
// NexusEngine teleports on (PORTAL_Respawn ⇄ surface, PORTAL_WarpB ⇄
// underworld). This component was referenced at four sites (the
// underworld pair, the roving surface respawn gate, the Abyssal Gate
// plot) but never defined, so rendering Exterior threw
// "Can't find variable: PortalWarp" and killed the whole /skyscraper
// scene on load (bug report 2026-10-22, filed under Aethelgard — the
// crash digest's own URL is /skyscraper). It generalizes RespawnCube
// above: same 10×15×10 video-texture gate, but the mesh carries the
// caller's `name` (the engine raycasts for exactly PORTAL_Respawn /
// PORTAL_WarpB) and an optional `color` tints the gate (WarpB's
// #ff0044); the default white leaves the portal video untinted.
const PortalWarp = memo(({ name, position, color = '#ffffff' }) => {
    const portalVid = useVideoTexture('/media/skyscraper/va51ee.mp4', { muted: true, loop: true, playsInline: true });
    portalVid.colorSpace = THREE.SRGBColorSpace;

    const groupRef = useRef();
    useFrame((_, delta) => {
        if (groupRef.current) groupRef.current.rotation.y += delta * 0.6;
    });

    const sideMat = useMemo(() => new THREE.MeshBasicMaterial({ map: portalVid, color }), [portalVid, color]);
    const capMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000 }), []);
    const materials = useMemo(() => [sideMat, sideMat, capMat, capMat, sideMat, sideMat], [sideMat, capMat]);

    return (
        <group position={position} ref={groupRef}>
            <mesh name={name} material={materials} dispose={null}>
                <boxGeometry args={[10, 15, 10]} />
            </mesh>
            <Sparkles count={50} scale={[15, 20, 15]} size={8} color={color} speed={2} />
        </group>
    );
});
PortalWarp.displayName = 'PortalWarp';

const NeonTunnel = memo(({ startPos, color, isUnderworld }) => {
    const tubeGeo = useMemo(() => {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 300),
            new THREE.Vector3(150, 150, 450),
            new THREE.Vector3(450, 300, 450),
            new THREE.Vector3(600, 150, 300),
            new THREE.Vector3(600, 0, -100)
        ], false, 'catmullrom', 0.5);
        return new THREE.TubeGeometry(curve, 100, 16, 16, false);
    }, []);
    
    const tubeMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: isUnderworld ? "#000000" : "#050508", roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide 
    }), [isUnderworld]);

    const wireMat = useMemo(() => new THREE.MeshBasicMaterial({
        color: color, wireframe: true, transparent: true, opacity: 0.15
    }), [color]);

    return (
        <group position={startPos}>
            <mesh name="DRIVE_Tunnel" geometry={tubeGeo} material={tubeMat} dispose={null} />
            <mesh name="IGNORE_TunnelWire" geometry={tubeGeo} material={wireMat} dispose={null} />
        </group>
    );
});
NeonTunnel.displayName = 'NeonTunnel';

const BillboardNode = memo(({ onActivate, videoTex }) => {
    return (
        <group position={[0, 0, 0]}>
            <ScrollingHalo text="VIDEO MATRIX UPLINK" height={2} color="#00e5ff" yOffset={18} speed={0.15} />
            <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }} style={{ cursor: 'pointer' }}>
                <mesh name="PORTAL_Billboards" position={[0, 8, 0]} dispose={null}>
                    <planeGeometry args={[16, 9]} />
                    <meshBasicMaterial map={videoTex} transparent opacity={0.9} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, 8, 0]} dispose={null}>
                    <planeGeometry args={[16.5, 9.5]} />
                    <meshBasicMaterial color="#00e5ff" wireframe />
                </mesh>
                <mesh position={[0, 2, 0]} dispose={null}>
                    <cylinderGeometry args={[0.5, 0.5, 4]} />
                    <meshStandardMaterial color="#222" metalness={0.9} />
                </mesh>
            </group>
            <Sparkles count={80} scale={[20, 20, 5]} color="#00e5ff" size={6} position={[0, 8, 0]} speed={2} />
        </group>
    );
});
BillboardNode.displayName = 'BillboardNode';

const ForestNode = memo(({ onActivate }) => {
    // CGI: the signpost tree was wireframe green — a placeholder
    // silhouette. Same geometry, real canopy + bark textures now.
    const leafMat = useMemo(() => materialForSkyscraper('canopy', 'outland-forest'), []);
    const trunkMat = useMemo(() => materialForSkyscraper('bark', 'outland-forest'), []);
    
    return (
        <group position={[0, 0, 0]}>
            <ScrollingHalo text="OUTLAND FOREST" height={2} color="#39ff14" yOffset={18} speed={0.15} />
            <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }} style={{ cursor: 'pointer' }}>
                <mesh name="PORTAL_Forest" position={[0, 2, 0]} material={trunkMat} dispose={null}>
                    <cylinderGeometry args={[0.8, 1.2, 4, 6]} />
                </mesh>
                <mesh position={[0, 7, 0]} material={leafMat} dispose={null}>
                    <icosahedronGeometry args={[5, 0]} />
                </mesh>
                <mesh position={[0, 11, 0]} material={leafMat} dispose={null}>
                    <icosahedronGeometry args={[3, 0]} />
                </mesh>
            </group>
            <Sparkles count={80} scale={[15, 20, 15]} color="#39ff14" size={6} position={[0, 8, 0]} speed={1} />
        </group>
    );
});
ForestNode.displayName = 'ForestNode';

const DragonNode = memo(({ onActivate }) => {
    return (
        <group position={[0, 0, 0]}>
            <ScrollingHalo text="THE GLACIAL DRAGON" height={2} color="#ffffff" yOffset={18} speed={0.15} />
            <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }} style={{ cursor: 'pointer' }}>
                <mesh name="PORTAL_Dragon" position={[0, 5, 0]} dispose={null}>
                    <octahedronGeometry args={[6, 0]} />
                    <meshStandardMaterial color="#00ffff" wireframe emissive="#00ffff" emissiveIntensity={2} />
                </mesh>
            </group>
            <Sparkles count={150} scale={[20, 20, 20]} color="#ffffff" size={6} position={[0, 5, 0]} speed={3} />
        </group>
    );
});
DragonNode.displayName = 'DragonNode';

// 🚀 NEW: ANUBIS STATUE PORTAL NODE
const AnubisNode = memo(({ onActivate }) => {
    return (
        <group position={[0, 0, 0]}>
            <ScrollingHalo text="CITY OF THE DEAD" height={2} color="#d4af37" yOffset={28} speed={0.15} />
            <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }} style={{ cursor: 'pointer' }}>
                <mesh position={[0, 2, 0]} dispose={null}>
                    <boxGeometry args={[14, 4, 14]} />
                    <meshStandardMaterial color="#111" metalness={0.8} />
                </mesh>
                <mesh position={[0, 12, 0]} dispose={null} castShadow>
                    <capsuleGeometry args={[3, 14, 4, 8]} />
                    <meshStandardMaterial color="#050505" metalness={0.9} roughness={0.2} />
                </mesh>
                <mesh position={[0, 22, 3]} rotation={[Math.PI/2, 0, 0]} dispose={null} castShadow>
                    <coneGeometry args={[3.5, 12, 4]} />
                    <meshStandardMaterial color="#000" metalness={0.9} roughness={0.1} />
                </mesh>
                <pointLight position={[1.5, 22, 6]} color="#ff0000" intensity={50} distance={15} />
                <pointLight position={[-1.5, 22, 6]} color="#ff0000" intensity={50} distance={15} />
                <mesh name="PORTAL_Hamunaptra" position={[0, 12, 0]} visible={false}>
                    <boxGeometry args={[15, 30, 15]} />
                    <meshBasicMaterial />
                </mesh>
            </group>
            <Sparkles count={100} scale={[20, 30, 20]} color="#d4af37" size={5} position={[0, 15, 0]} speed={2} />
        </group>
    );
});
AnubisNode.displayName = 'AnubisNode';

const portalCircleGeo = new THREE.CircleGeometry(10, 64);
const portalRingGeo = new THREE.RingGeometry(10, 11, 64);
const portalRingMat = new THREE.MeshStandardMaterial({ color: "#aa00ff", emissive: "#aa00ff", emissiveIntensity: 2 });

const HorizontalPortalNode = memo(({ onActivate, portalVidTex }) => {
    const portalVidMat = useMemo(() => new THREE.MeshBasicMaterial({ map: portalVidTex, side: THREE.DoubleSide }), [portalVidTex]);
    return (
        <group position={[0, 0.5, 0]}>
            <ScrollingHalo text="RESTRICTED SECTOR" height={2} color="#aa00ff" yOffset={15} speed={0.15} />
            <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }} style={{ cursor: 'pointer' }}>
                <mesh name="PORTAL_Restricted" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} geometry={portalCircleGeo} material={portalVidMat} dispose={null} />
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} geometry={portalRingGeo} material={portalRingMat} dispose={null} />
            </group>
        </group>
    );
});
HorizontalPortalNode.displayName = 'HorizontalPortalNode';

const bldgCylGeo = new THREE.CylinderGeometry(2, 2, 1);
const bldgOctaGeo = new THREE.OctahedronGeometry(0.6);
const bldgConeGeo = new THREE.ConeGeometry(0.8, 1, 4);

const edgesOcta = new THREE.EdgesGeometry(bldgOctaGeo);
const edgesCone = new THREE.EdgesGeometry(bldgConeGeo);

const TensegrityBuilding = memo(({ width, height, color }) => {
    // CGI: the neighbour towers were transparent glow cylinders —
    // light with no building behind it. Same silhouette, now dark
    // glass curtain wall with lit windows glowing in the node's
    // own colour (emissive tint, white map tint — the dark glass
    // would swallow a multiplied colour). Crown + cone lines stay.
    const facadeMat = useMemo(() => materialForSkyscraper('towerFacade', `node-${color}`, '#ffffff', {
        repeat: { x: 2, y: Math.max(2, Math.round(height / 32)) },
        emissive: color,
        emissiveIntensity: 1.4,
    }), [color, height]);
    const matTop = useMemo(() => new THREE.MeshStandardMaterial({ color: "#111", metalness: 0.9, roughness: 0.1 }), []);
    const matLine = useMemo(() => new THREE.LineBasicMaterial({ color }), [color]);
    const matLineTrans = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }), [color]);
    
    return (
        <group position={[0, 15, 0]}>
            <mesh position={[0, height / 2, 0]} scale={[1, height, 1]} geometry={bldgCylGeo} material={facadeMat} dispose={null} />
            <mesh position={[0, height, 0]} scale={[width, width, width]} geometry={bldgOctaGeo} material={matTop} dispose={null}>
                <lineSegments geometry={edgesOcta} material={matLine} dispose={null} />
            </mesh>
            <lineSegments position={[0, height / 2, 0]} scale={[width, height, width]} geometry={edgesCone} material={matLineTrans} dispose={null} />
        </group>
    );
});
TensegrityBuilding.displayName = 'TensegrityBuilding';

const colosseumRings = [
    { geo: new THREE.RingGeometry(10, 12, 32), mat: new THREE.MeshStandardMaterial({ color: "#00ffff", emissive: "#00ffff", emissiveIntensity: 1 }), y: 2 },
    { geo: new THREE.RingGeometry(8, 10, 32), mat: new THREE.MeshStandardMaterial({ color: "#ff00ff", emissive: "#ff00ff", emissiveIntensity: 1 }), y: 5 },
    { geo: new THREE.RingGeometry(6, 8, 32), mat: new THREE.MeshStandardMaterial({ color: "#00ffff", emissive: "#00ffff", emissiveIntensity: 1 }), y: 8 }
];
const colosseumBaseGeo = new THREE.CylinderGeometry(12, 12, 1, 32);
const colosseumBaseMat = new THREE.MeshStandardMaterial({ color: "#050505", metalness: 0.9 });
const colosseumCoreGeo = new THREE.OctahedronGeometry(2, 0);
const colosseumCoreMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2, wireframe: true });

const ColosseumNode = memo(({ onActivate }) => {
    return (
        <group position={[0, 0.5, 0]}>
            <ScrollingHalo text="THE COLOSSEUM" height={2} color="#00ffff" yOffset={25} speed={0.2} />
            <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }}>
                {colosseumRings.map((r, i) => (
                    <mesh key={i} position={[0, r.y, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={r.geo} material={r.mat} dispose={null} />
                ))}
                <mesh position={[0, 0.5, 0]} geometry={colosseumBaseGeo} material={colosseumBaseMat} dispose={null} />
                <mesh name="PORTAL_Colosseum" position={[0, 4, 0]} geometry={colosseumCoreGeo} material={colosseumCoreMat} dispose={null} />
            </group>
            <Sparkles count={150} scale={[25, 20, 25]} size={4} color="#ffd700" position={[0, 10, 0]} speed={1} />
        </group>
    );
});
ColosseumNode.displayName = 'ColosseumNode';

const saberHiltGeo = new THREE.CylinderGeometry(0.5, 0.5, 4, 16);
const saberBladeGeo = new THREE.CylinderGeometry(0.3, 0.3, 20, 16);
const saberHiltMat = new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.9 });
const saberRedMat = new THREE.MeshStandardMaterial({ color: "#ff0000", emissive: "#ff0000", emissiveIntensity: 5 });
const saberBlueMat = new THREE.MeshStandardMaterial({ color: "#0088ff", emissive: "#0088ff", emissiveIntensity: 5 });

const SwaSabersNode = memo(({ onActivate }) => {
    return (
        <group position={[0, 1, 0]}>
            <ScrollingHalo text="SWA SABERS UPLINK" height={2} color="#ff0000" yOffset={32} speed={0.2} />
            <group position={[0, 12, 0]} onPointerDown={(e) => { e.stopPropagation(); onActivate(); }}>
                <group rotation={[0, 0, Math.PI / 4]} position={[-3, -3, 0]}>
                    <mesh position={[0, -8, 0]} geometry={saberHiltGeo} material={saberHiltMat} dispose={null} />
                    <mesh name="PORTAL_SaberRed" position={[0, 4, 0]} geometry={saberBladeGeo} material={saberRedMat} dispose={null} />
                </group>
                <group rotation={[0, 0, -Math.PI / 4]} position={[3, -3, 0]}>
                    <mesh position={[0, -8, 0]} geometry={saberHiltGeo} material={saberHiltMat} dispose={null} />
                    <mesh name="PORTAL_SaberBlue" position={[0, 4, 0]} geometry={saberBladeGeo} material={saberBlueMat} dispose={null} />
                </group>
            </group>
            <Sparkles count={100} scale={[20, 30, 20]} size={6} color="#ff00ff" position={[0, 15, 0]} speed={2} />
        </group>
    );
});
SwaSabersNode.displayName = 'SwaSabersNode';

const hoodieBodyGeo = new THREE.CylinderGeometry(2.5, 3, 7, 32);
const hoodieHoodGeo = new THREE.SphereGeometry(2.2, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.65);
const hoodieInsideGeo = new THREE.SphereGeometry(2.0, 32, 32);
const hoodieSleeveGeo = new THREE.CapsuleGeometry(0.9, 5, 16, 16);
const hoodiePocketGeo = new THREE.BoxGeometry(3.5, 2, 0.5);
const hoodieGoldMat = new THREE.MeshStandardMaterial({ color: "#FFD700", metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
const hoodieBlackMat = new THREE.MeshBasicMaterial({ color: "#000000" });

const GiantGoldHoodie = memo(({ onActivate }) => {
    return (
        <group onPointerDown={(e) => { e.stopPropagation(); onActivate(); }} position={[0, 0, 0]} scale={[1.5, 1.5, 1.5]}>
            <mesh name="PORTAL_Hoodie" position={[0, 4, 0]} geometry={hoodieBodyGeo} material={hoodieGoldMat} dispose={null} />
            <mesh position={[0, 8.5, -0.5]} rotation={[-0.2, 0, 0]} geometry={hoodieHoodGeo} material={hoodieGoldMat} dispose={null} />
            <mesh position={[0, 8.3, 0.2]} geometry={hoodieInsideGeo} material={hoodieBlackMat} dispose={null} />
            <mesh position={[-3.2, 4.5, 0]} rotation={[0, 0, -0.4]} geometry={hoodieSleeveGeo} material={hoodieGoldMat} dispose={null} />
            <mesh position={[3.2, 4.5, 0]} rotation={[0, 0, 0.4]} geometry={hoodieSleeveGeo} material={hoodieGoldMat} dispose={null} />
            <mesh position={[0, 2.5, 2.8]} rotation={[0.2, 0, 0]} geometry={hoodiePocketGeo} material={hoodieGoldMat} dispose={null} />
        </group>
    );
});
GiantGoldHoodie.displayName = 'GiantGoldHoodie';

// CGI: the tower's flanks had no face — only the front wore its
// video, the east/west sides were bare box edges. Two proud
// curtain-wall skins (lit windows, emissive) hug the flanks for
// the full 730 m shaft, 0.6 m clear of the video boxes so nothing
// z-fights. The video front is untouched.
const TowerFlanks = memo(() => {
    const flankMat = useMemo(() => materialForSkyscraper('towerFacade', 'omega-tower', '#ffffff', {
        repeat: { x: 1, y: 22 },
        emissiveIntensity: 1.2,
    }), []);
    return (
        <group>
            <mesh position={[80.6, -115, -20]} rotation={[0, Math.PI / 2, 0]} material={flankMat} dispose={null}>
                <planeGeometry args={[30, 730]} />
            </mesh>
            <mesh position={[-80.6, -115, -20]} rotation={[0, -Math.PI / 2, 0]} material={flankMat} dispose={null}>
                <planeGeometry args={[30, 730]} />
            </mesh>
        </group>
    );
});
TowerFlanks.displayName = 'TowerFlanks';

// CGI: six glowing air taxis circling the tower shaft at
// staggered heights and radii — the life at height. Positions
// are a pure function of the clock (lib/skyscraper-cgi/life.js);
// the scene only places what that says. Emissive bodies + a
// blinking beacon each; no new real lights.
const AirTraffic = memo(() => {
    const taxiRefs = useRef([]);
    useFrame(() => {
        const nowMs = Date.now();
        for (let i = 0; i < AIR_TAXI_COUNT; i++) {
            const g = taxiRefs.current[i];
            if (!g) continue;
            const taxi = airTaxiFor(i, nowMs);
            g.position.set(taxi.x, taxi.y, taxi.z);
            g.rotation.y = taxi.heading;
            const beacon = g.children[1];
            if (beacon) beacon.visible = taxi.blink;
        }
    });
    return (
        <group>
            {Array.from({ length: AIR_TAXI_COUNT }, (_, i) => (
                <group key={i} ref={(el) => { taxiRefs.current[i] = el; }}>
                    <mesh dispose={null}>
                        <boxGeometry args={[3, 0.8, 1.2]} />
                        <meshBasicMaterial color={AIR_TAXI_COLORS[i]} />
                    </mesh>
                    <mesh position={[0, 0.9, 0]} dispose={null}>
                        <sphereGeometry args={[0.35, 8, 8]} />
                        <meshBasicMaterial color="#ffffff" />
                    </mesh>
                </group>
            ))}
        </group>
    );
});
AirTraffic.displayName = 'AirTraffic';

// CGI: the tower top was a bare box edge. A red crown beacon
// pulses on the clock so the 250 m top reads from the city below.
// Emissive only — the pulse is an opacity ride, no light.
const TowerCrownBeacon = memo(() => {
    const matRef = useRef();
    useFrame(() => {
        if (matRef.current) matRef.current.opacity = 0.35 + elevatorBeaconAt(Date.now()) * 0.65;
    });
    return (
        <group position={[0, 252, -20]}>
            <mesh dispose={null}>
                <sphereGeometry args={[2, 16, 16]} />
                <meshBasicMaterial ref={matRef} color="#ff2244" transparent opacity={1} />
            </mesh>
            <mesh rotation-x={Math.PI / 2} dispose={null}>
                <ringGeometry args={[3, 4, 32]} />
                <meshBasicMaterial color="#ff2244" transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
});
TowerCrownBeacon.displayName = 'TowerCrownBeacon';

const Plot = memo(({ gridX, gridZ, spanX = 1, spanZ = 1, name, mapName, mapColor = '#ffffff', children }) => {
    const { registerPlot, unregisterPlot } = useMapObjects();

    const { posX, posZ, layers, parcelWidth, parcelDepth } = useMemo(() => {
        const pX = gridX * BLOCK_SIZE + ((spanX - 1) * BLOCK_SIZE) / 2;
        const pZ = gridZ * BLOCK_SIZE + ((spanZ - 1) * BLOCK_SIZE) / 2;
        const pWidth = spanX * BLOCK_SIZE - ROAD_WIDTH;
        const pDepth = spanZ * BLOCK_SIZE - ROAD_WIDTH;
        
        const stepCount = 4;
        const stepHeight = 0.5 / stepCount; 
        const stepOut = 0.8; 

        const generatedLayers = [];
        for (let i = 0; i < stepCount; i++) {
            const w = pWidth + (i * stepOut * 2);
            const d = pDepth + (i * stepOut * 2);
            const y = 0.5 - (i * stepHeight) - (stepHeight / 2);
            generatedLayers.push({
                geo: new THREE.BoxGeometry(w, stepHeight, d),
                edges: new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0, d)),
                y: y, edgeY: y + (stepHeight / 2) + 0.005 
            });
        }
        return { posX: pX, posZ: pZ, layers: generatedLayers, parcelWidth: pWidth, parcelDepth: pDepth };
    }, [gridX, gridZ, spanX, spanZ]);

    useEffect(() => {
        registerPlot({ id: name, name: mapName || name, x: posX, z: posZ, width: parcelWidth, height: parcelDepth, color: mapColor });
        return () => unregisterPlot(name);
    }, [name, mapName, posX, posZ, parcelWidth, parcelDepth, mapColor, registerPlot, unregisterPlot]);

    return (
        <group position={[posX, -479.75, posZ]} name={`Plot_${name}`}>
            {layers.map((layer, idx) => (
                <group key={`layer-${idx}`}>
                    <mesh position={[0, layer.y, 0]} geometry={layer.geo} material={slabMaterial} receiveShadow dispose={null} />
                    <lineSegments position={[0, layer.edgeY, 0]} geometry={layer.edges} material={lineMaterial} dispose={null} />
                </group>
            ))}
            <group position={[0, 0.5, 0]}>{children}</group>
        </group>
    );
});
Plot.displayName = 'Plot';

export default function Exterior({ 
    currentFloor, setCurrentFloor, animState, setAnimState, setActivePlot, 
    inMilesRoom, setInMilesRoom, setShowMilesModal, isGhostMode, isDead, setShowRestrictedModal 
}) {
    const videoTex = useVideoTexture('/media/skyscraper/0ihsu0.mp4', { muted: true, loop: true, playsInline: true });
    videoTex.colorSpace = THREE.SRGBColorSpace;
    videoTex.wrapS = THREE.RepeatWrapping;
    videoTex.wrapT = THREE.ClampToEdgeWrapping;

    const portalVidTex = useVideoTexture('/media/skyscraper/jmepsg.mp4', { muted: true, loop: true, playsInline: true });
    portalVidTex.colorSpace = THREE.SRGBColorSpace;

    const underworldRef = useRef();
    const windCloudRef = useRef();
    const [rovingPos, setRovingPos] = useState([0, 0]);

    // CGI: the city floor was flat #050508. Same plane, same
    // DRIVE_CityFloor name the bike raycasts against — now a
    // tileable night-city block (streets + rooftop lights), 40
    // repeats over the 4000 m floor, one tile per 100 m block.
    const cityGroundMat = useMemo(() => materialForSkyscraper('cityGround', 'omega-city', '#ffffff', {
        repeat: { x: 40, y: 40 },
        emissiveIntensity: 0.9,
    }), []);

    useEffect(() => {
        const updateRoving = () => {
            const step = Math.floor(Date.now() / 60000);
            const spots = [[3, -2], [-5, 4], [2, 4], [-3, -4], [4, -4]];
            const spot = spots[step % spots.length];
            setRovingPos([spot[0] * 100, spot[1] * 100]); 
        };
        updateRoving();
        const interval = setInterval(updateRoving, 1000);
        return () => clearInterval(interval);
    }, []);

    useFrame(({ camera }) => {
        if (underworldRef.current) {
            const isUnder = camera.position.y < -200 || isGhostMode || isDead;
            underworldRef.current.visible = isUnder;
        }
        // CGI: the mid-level cloud bank drifts around the tower
        // shaft on the Tower wind (pure function of the clock).
        if (windCloudRef.current) {
            const bank = cloudBankAt(Date.now());
            windCloudRef.current.position.set(bank.x, 0, bank.z);
        }
    });

    return (
        <group>
            {/* CGI: the low cloud hugs the city; the mid-level bank
                (y=-200, wrapping the shaft, + a high bank above the
                crown) drifts on the wind. */}
            <Clouds material={THREE.MeshBasicMaterial}>
                <Cloud position={[0, -5, 0]} bounds={[150, 10, 150]} volume={200} color="#112233" opacity={0.8} speed={0.2} />
            </Clouds>
            <group ref={windCloudRef}>
                <Clouds material={THREE.MeshBasicMaterial}>
                    <Cloud position={[0, -200, 0]} bounds={[400, 50, 400]} volume={400} color="#050a10" opacity={0.9} speed={0.1} />
                    <Cloud position={[0, 100, 0]} bounds={[300, 40, 300]} volume={300} color="#1a2436" opacity={0.7} speed={0.15} />
                </Clouds>
            </group>

            <group ref={underworldRef} position={[0, -550, 0]}>
                <mesh dispose={null}>
                    <sphereGeometry args={[3000, 32, 32]} />
                    <meshBasicMaterial color="#1a0033" side={THREE.BackSide} />
                </mesh>
                
                <mesh name="DRIVE_FloorUnder" rotation-x={-Math.PI / 2} position-y={0} dispose={null}>
                    <planeGeometry args={[4000, 4000]} />
                    <meshBasicMaterial color="#000000" transparent opacity={0.0} side={THREE.DoubleSide} />
                </mesh>
                <gridHelper args={[4000, 100, '#ff0000', '#330000']} />
                
                <NeonTunnel startPos={[-300, 0, 200]} color="#ff0000" isUnderworld={true} />
                
                <PortalWarp name="PORTAL_Respawn" position={[150, 7.5, 0]} />
                <PortalWarp name="PORTAL_WarpB" position={[200, 7.5, 0]} color="#ff0044" />

                <group position={[0, 69.95, 0]} rotation={[Math.PI, 0, 0]}>
                    <mesh rotation-x={-Math.PI / 2} dispose={null}>
                        <planeGeometry args={[4000, 4000]} />
                        <meshBasicMaterial color="#020005" side={THREE.FrontSide} />
                    </mesh>
                    <gridHelper args={[4000, 100, '#a200ff', '#4b0082']} position={[0, -0.05, 0]} />
                </group>
            </group>

            {!isGhostMode && currentFloor === 0 && (
                <group position={[rovingPos[0], -479.9, rovingPos[1]]}>
                    <PortalWarp name="PORTAL_Respawn" position={[0, 7.5, 0]} />
                </group>
            )}

            <mesh position={[0, 125, -20]} onPointerDown={(e) => e.stopPropagation()} dispose={null}><boxGeometry args={[160, 250, 30]} /><meshBasicMaterial map={videoTex} side={THREE.FrontSide} /></mesh>
            <mesh position={[0, -240, -20]} onPointerDown={(e) => e.stopPropagation()} dispose={null}><boxGeometry args={[160, 480, 30]} /><meshBasicMaterial map={videoTex} side={THREE.FrontSide} /></mesh>
            
            <mesh name="DRIVE_CloudFloor" rotation-x={-Math.PI / 2} position-y={0} onPointerDown={(e) => e.stopPropagation()} dispose={null}><planeGeometry args={[4000, 4000]} /><meshStandardMaterial color="#020202" roughness={1} metalness={0} side={THREE.FrontSide} /></mesh>
            <mesh name="DRIVE_CityFloor" rotation-x={-Math.PI / 2} position-y={-480} onPointerDown={(e) => e.stopPropagation()} material={cityGroundMat} dispose={null}><planeGeometry args={[4000, 4000]} /></mesh>
            
            <group position={[0, -479.9, 0]}>
                <ProceduralRoads gridSize={40} blockSize={BLOCK_SIZE} roadWidth={ROAD_WIDTH} />
                {/* CGI: StreetLights existed but was never mounted —
                    the roads had no lamps. Central 2000 m only
                    (fog far is 800, the rest is unseen); two
                    instanced draw calls. */}
                <StreetLights gridSize={20} blockSize={BLOCK_SIZE} />
                <NeonTunnel startPos={[300, 0, -200]} color="#00ffff" isUnderworld={false} />
            </group>

            {/* CGI: lit tower flanks, air traffic, crown beacon. */}
            <TowerFlanks />
            <AirTraffic />
            <TowerCrownBeacon />

            <EternalFlame position={[0, -479.9, 120]} />
            <pointLight position={[100, -450, 100]} color="#00ffff" intensity={2} distance={800} decay={1.5} />
            <pointLight position={[-100, -450, 100]} color="#ff00ff" intensity={2} distance={800} decay={1.5} />

            <Plot gridX={-6} gridZ={-6} name="NodeAlpha" mapName="Node Alpha" mapColor="#ff00ff"><TensegrityBuilding width={50} height={120} color="#ff00ff" /></Plot>
            <Plot gridX={6} gridZ={6} name="NodeBeta" mapName="Node Beta" mapColor="#00ffff"><TensegrityBuilding width={60} height={80} color="#00ffff" /></Plot>
            <Plot gridX={-6} gridZ={6} name="NodeGamma" mapName="Node Gamma" mapColor="#39ff14"><TensegrityBuilding width={40} height={180} color="#39ff14" /></Plot>
            <Plot gridX={6} gridZ={-6} name="NodeDelta" mapName="Node Delta" mapColor="#ffaa00"><TensegrityBuilding width={70} height={100} color="#ffaa00" /></Plot>

            <Plot gridX={0} gridZ={-4} name="RestrictedArea" mapName="Restricted Sector" mapColor="#aa00ff">
                <HorizontalPortalNode portalVidTex={portalVidTex} onActivate={() => setShowRestrictedModal(true)} />
            </Plot>

            <Plot gridX={0} gridZ={4} name="Vortex" mapName="Vortex Mirror" mapColor="#00ffff">
                <group position={[0, 1, 0]}>
                    <ScrollingHalo text="VORTEX MIRROR" height={2.2} color="#00ffff" yOffset={16} speed={0.12} />
                    <mesh name="PORTAL_Vortex" onPointerDown={(e) => { e.stopPropagation(); setActivePlot('VORTEX'); }} dispose={null}>
                        <boxGeometry args={[15, 20, 2]} />
                        <meshStandardMaterial color="#00ffff" wireframe />
                    </mesh>
                    <Sparkles count={80} scale={[16, 22, 4]} color="#00ffff" size={5} speed={1.5} />
                </group>
            </Plot>

            <Plot gridX={-4} gridZ={0} name="BillboardMatrix" mapName="Video Matrix" mapColor="#00e5ff">
                <BillboardNode onActivate={() => setActivePlot('BILLBOARDS')} videoTex={videoTex} />
            </Plot>

            <Plot gridX={2} gridZ={0} name="UnderworldGate" mapName="Abyssal Gate" mapColor="#ff0044">
                <group position={[0, 0, 0]}>
                    <ScrollingHalo text="ABYSSAL GATE" height={2} color="#ff0044" yOffset={18} speed={0.15} />
                    <PortalWarp name="PORTAL_WarpB" position={[0, 7.5, 0]} color="#ff0044" />
                </group>
            </Plot>

            {/* 🚀 HAMUNAPTRA NODE PLACED 1 PARCEL AWAY */}
            <Plot gridX={-1} gridZ={0} name="Hamunaptra" mapName="Hamunaptra" mapColor="#d4af37">
                <AnubisNode onActivate={() => setActivePlot('HAMUNAPTRA')} />
            </Plot>

            <Plot gridX={4} gridZ={0} name="ForestOutland" mapName="Outland Forest" mapColor="#39ff14">
                <ForestNode onActivate={() => setActivePlot('FOREST')} />
            </Plot>

            <Plot gridX={-3} gridZ={-3} name="Apparel" mapName="Olympus Apparel" mapColor="#FFD700">
                <group position={[0, 1, 0]}>
                    <ScrollingHalo text="OLYMPUS APPAREL" height={2} color="#FFD700" yOffset={22} speed={0.15} />
                    <GiantGoldHoodie onActivate={() => setActivePlot('APPAREL')} />
                    <Sparkles count={80} scale={[25, 25, 25]} color="#FFD700" size={6} speed={1.5} />
                </group>
            </Plot>

            <Plot gridX={3} gridZ={-3} name="SwaSabers" mapName="SWA Sabers" mapColor="#ff0000">
                <SwaSabersNode onActivate={() => setActivePlot('SWA_SABERS')} />
            </Plot>

            <Plot gridX={-4} gridZ={4} spanX={2} spanZ={2} name="Colosseum" mapName="The Colosseum" mapColor="#00ffff">
                <ColosseumNode onActivate={() => setActivePlot('COLOSSEUM')} />
            </Plot>

            <Plot gridX={4} gridZ={4} name="OmegaArch" mapName="Omega Arch" mapColor="#ffaa00">
                <group position={[0, 0, 0]} onPointerDown={(e) => { e.stopPropagation(); setActivePlot('OMEGA_ARCH'); }}>
                    <ScrollingHalo text="THE OMEGA ARCH" height={2.5} color="#cc0000" yOffset={28} speed={0.15} />
                    <group position={[0, 10.09, 0]}>
                        <mesh rotation={[0, 0, -Math.PI * 0.3]} dispose={null}><torusGeometry args={[10, 2, 16, 64, Math.PI * 1.6]} /><meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.8} /></mesh>
                        <mesh position={[8.37, -8.09, 0]} rotation={[0, 0, Math.PI / 2]} dispose={null}><cylinderGeometry args={[2, 2, 5, 16]} /><meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.8} /></mesh>
                        <mesh position={[-8.37, -8.09, 0]} rotation={[0, 0, Math.PI / 2]} dispose={null}><cylinderGeometry args={[2, 2, 5, 16]} /><meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.8} /></mesh>
                        <mesh name="PORTAL_Arch" position={[0, 0, 0]} dispose={null}><circleGeometry args={[7, 32]} /><meshBasicMaterial color="#000" transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
                    </group>
                    <Sparkles position={[0, 10, 0]} count={100} scale={[20, 20, 4]} color="#ffaa00" size={5} speed={1.5} />
                </group>
            </Plot>

            <Plot gridX={-3} gridZ={3} name="HermesLink" mapName="Hermes Uplink" mapColor="#00ff00">
                <group position={[0, 1, 0]}>
                    <ScrollingHalo text="HERMES UPLINK TERMINAL" height={2} color="#00ff00" yOffset={15} speed={0.15} />
                    <mesh name="PORTAL_Hermes" onPointerDown={(e) => { e.stopPropagation(); setActivePlot('HERMES'); }} dispose={null}>
                        <boxGeometry args={[15, 12, 10]} />
                        <meshStandardMaterial color="#c0c0c0" metalness={1} roughness={0.1} />
                    </mesh>
                    <Sparkles count={50} scale={[18, 18, 18]} color="#00ff00" size={5} speed={1.5} />
                </group>
            </Plot>

            <Plot gridX={3} gridZ={3} name="Excalibur" mapName="Excalibur" mapColor="#ff00ff">
                <group position={[0, 0, 0]}>
                    <ScrollingHalo text="EXCALIBUR" height={1.8} color="#cc0000" yOffset={14} speed={0.2} />
                    <mesh name="PORTAL_Excalibur" position={[0, 4, 0]} onPointerDown={(e) => { e.stopPropagation(); setActivePlot('EXCALIBUR'); }} dispose={null}>
                        <dodecahedronGeometry args={[5, 1]} />
                        <meshStandardMaterial color="#050508" metalness={0.9} roughness={0.2} />
                    </mesh>
                    <Sparkles count={40} position={[0, 4, 0]} scale={[10, 10, 10]} color="#ff00ff" size={4} speed={3} />
                </group>
            </Plot>

            <Plot gridX={0} gridZ={6} name="GlacialDragon" mapName="Glacial Dragon" mapColor="#ffffff">
                <DragonNode onActivate={() => setActivePlot('DRAGON')} />
            </Plot>
            
            <Plot gridX={0} gridZ={-6} name="MilesRoom" mapName="Diamond In The Rough" mapColor="#0088ff">
                <group position={[0, 0, 0]}>
                    <ScrollingHalo text="ONLY MY SON MAY ENTER HERE." height={2.8} color="#cc0000" yOffset={20} speed={0.08} />
                    <mesh name="PORTAL_Miles" position={[0, 6, 0]} onPointerDown={(e) => { e.stopPropagation(); setShowMilesModal(true); }} dispose={null}>
                        <boxGeometry args={[10, 14, 0.5]} />
                        <meshStandardMaterial color="#000" metalness={1} roughness={0} />
                        <lineSegments dispose={null}><edgesGeometry args={[new THREE.BoxGeometry(10, 14, 0.5)]} /><lineBasicMaterial color="#0088ff" /></lineSegments>
                    </mesh>
                    <Sparkles count={80} position={[0, 6, 0]} scale={[12, 16, 4]} color="#0088ff" size={4} speed={2} />
                </group>
            </Plot>

            <group position={[0, 0, -4.5]}>
                <group position={[0, -479.9, 0]}>
                    <ScrollingHalo text="ASCENSION PORTAL" height={1.5} color="#ff00ff" yOffset={5} speed={0.2} />
                    <mesh name="PORTAL_Ascend" rotation={[-Math.PI/2, 0, 0]} onPointerDown={(e) => { e.stopPropagation(); setCurrentFloor(1); }} dispose={null}>
                        <circleGeometry args={[4, 32]} />
                        <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={2} transparent opacity={0.4} />
                    </mesh>
                    <Sparkles count={60} scale={[8, 10, 8]} size={4} color="#ff00ff" speed={2} position={[0, 4, 0]} />
                </group>

                <group position={[0, 0.1, 0]}>
                    <ScrollingHalo text="DESCENSION PORTAL" height={1.5} color="#00ffff" yOffset={5} speed={0.2} />
                    <mesh name="PORTAL_Descend" rotation={[-Math.PI/2, 0, 0]} onPointerDown={(e) => { e.stopPropagation(); e.camera.position.set(0, -476.6, -10); }} dispose={null}>
                        <circleGeometry args={[4, 32]} />
                        <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} transparent opacity={0.4} />
                    </mesh>
                    <Sparkles count={60} scale={[8, 10, 8]} size={4} color="#00ffff" speed={2} position={[0, 4, 0]} />
                </group>
            </group>

            <group position={[0, 0, -4.9]}>
                <mesh position={[0, 5, 0]} onPointerDown={(e) => e.stopPropagation()} dispose={null}><boxGeometry args={[12, 10, 0.5]} /><meshStandardMaterial color="#111111" /></mesh>
                <mesh position={[4, 5, 0.3]} onPointerDown={(e) => { e.stopPropagation(); setCurrentFloor(1); }} dispose={null}>
                    <boxGeometry args={[1, 1.5, 0.2]} />
                    <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={2} />
                </mesh>
                <Text position={[0, 5, 0.3]} fontSize={2} color="#00ffff">ENTER TOWER</Text>
            </group>
        </group>
    );
}

const ScrollingHalo = memo(({ text, height = 2.5, color = "#cc0000", yOffset = 10, speed = 0.15 }) => {
    const meshRef = useRef();
    const textureRef = useRef(null);

    const { dynamicRadius, texture } = useMemo(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = '900 120px "Arial Black", Impact, sans-serif';
        ctx.letterSpacing = '12px';
        const textString = `   ${text}   `;
        canvas.width = ctx.measureText(textString).width;
        canvas.height = 256; 
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color; ctx.fillRect(0, 30, canvas.width, 12); ctx.fillRect(0, 214, canvas.width, 12); 
        ctx.font = '900 120px "Arial Black", Impact, sans-serif';
        ctx.letterSpacing = '12px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 25;
        ctx.fillText(textString, canvas.width / 2, canvas.height / 2 + 5);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        const calculatedRadius = (canvas.width / (canvas.height / height)) / (2 * Math.PI);
        return { dynamicRadius: Math.max(calculatedRadius, 4), texture: tex };
    }, [text, color, height]);

    useEffect(() => {
        textureRef.current = texture;
        if (meshRef.current) {
            meshRef.current.material.map = texture;
            meshRef.current.material.emissiveMap = texture;
            meshRef.current.material.needsUpdate = true;
        }
        return () => texture.dispose();
    }, [texture]);

    useFrame((state, delta) => { if (textureRef.current) textureRef.current.offset.x -= delta * speed; });

    return (
        <group position={[0, yOffset, 0]}>
            <mesh ref={meshRef} onPointerDown={(e) => e.stopPropagation()} dispose={null}>
                <cylinderGeometry args={[dynamicRadius, dynamicRadius, height, 64, 1, true]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} transparent={true} side={THREE.FrontSide} />
            </mesh>
        </group>
    );
});
ScrollingHalo.displayName = 'ScrollingHalo';
