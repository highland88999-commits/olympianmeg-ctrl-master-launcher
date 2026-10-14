'use client';
import { useRef, useEffect, useMemo, memo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Html } from '@react-three/drei';

import Exterior from './Exterior';
import Elevator from './Elevator';
import FloorLoader from './FloorLoader';
import SkyCycle from './SkyCycle';
import MiniMap from './MiniMap';
import GuidanceArrow from './GuidanceArrow'; 

// 🚀 IMPORT THE PROCEDURAL DEADPOOL
import DeadpoolAvatar from './DeadpoolAvatar';

// WAVE 2 (characters-everywhere) — social embodiment: the player
// and their hub_room peers stand in this world as their profile
// characters (Wave 0 module), with the bespoke Deadpool (self) and
// the wireframe capsules (peers) as the native bodies that stay
// until a model is ready — and forever on failure (fallback law).
// The pick crosses the wire in the broadcast payload's `char`
// field (validated against the roster on receipt); peers whose
// clients don't send one are resolved once through the public
// profile-character API by their authId. Seated/driving poses do
// not exist yet (Wave 6): while DRIVING the bespoke hero rides.
import {
    createPresenceEmbodiments, characterIdFromPresencePayload,
} from '@/lib/characters/presence-embodiment';
import { resolveSurfaceCharacterId } from '@/lib/characters/embodiment';

// Measured footprint of the peer wireframe capsule
// (CapsuleGeometry(0.4, 1.2): Ø0.8 across, 2.0 tall — its center
// sits 1.0 above the floor) and the scale the self embodiment
// takes inside the avatar group.
const FIGURE_PROC_SIZE = { x: 0.8, y: 2.0, z: 0.8 };
// A peer silent this long is gone (mirrors STALE_MS in
// lib/presence.js): retire its mesh AND its embodiment, so a
// capped scene never leaks GLB slots to ghosts.
const PEER_STALE_MS = 15000;

const PULL_IN_POS = new THREE.Vector3(0, 1.7, 0);
const PULL_IN_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));
const PUSH_OUT_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ'));
const VALID_LOOK_STATES = ['FREE_ROAM', 'ELEVATOR_MOVING', 'DRIVING'];

const applySkyscraperCollision = (objOrCamera) => {
    if (objOrCamera.position.x > -80 && objOrCamera.position.x < 80 && objOrCamera.position.z > -35 && objOrCamera.position.z < -5) {
        const dZF = Math.abs(objOrCamera.position.z - (-5));
        const dZB = Math.abs(objOrCamera.position.z - (-35));
        const dXL = Math.abs(objOrCamera.position.x - (-80));
        const dXR = Math.abs(objOrCamera.position.x - (80));
        
        const minD = Math.min(dZF, dZB, dXL, dXR);
        if (minD === dZF) objOrCamera.position.z = -4.9;
        else if (minD === dZB) objOrCamera.position.z = -35.1;
        else if (minD === dXL) objOrCamera.position.x = -80.1;
        else if (minD === dXR) objOrCamera.position.x = 80.1;
    }
};

const Lightcycle = memo(({ bikeRef, onMount, color, animState, isActive }) => (
    <group ref={bikeRef} onPointerDown={onMount}>
        <mesh position={[0, 0.5, -1.2]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.5, 0.5, 0.2, 32]} /><meshStandardMaterial color="#050505" metalness={0.8} roughness={0.5} /></mesh>
        <mesh position={[0, 0.5, -1.2]} rotation={[0, 0, Math.PI/2]}><torusGeometry args={[0.5, 0.05, 16, 64]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} /></mesh>
        <mesh position={[0, 0.5, 1.2]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.5, 0.5, 0.2, 32]} /><meshStandardMaterial color="#050505" metalness={0.8} roughness={0.5} /></mesh>
        <mesh position={[0, 0.5, 1.2]} rotation={[0, 0, Math.PI/2]}><torusGeometry args={[0.5, 0.05, 16, 64]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} /></mesh>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.4, 0.4, 2.0]} /><meshStandardMaterial color="#0a0a0f" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[0, 0.7, -0.2]}><boxGeometry args={[0.4, 0.2, 1.2]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.6} /></mesh>
        <pointLight position={[0, 0.5, 0]} color={color} intensity={2} distance={10} />
        
        {/* 🚀 RENDER AVATAR IN DRIVING POSTURE */}
        {animState === 'DRIVING' && isActive && (
             <DeadpoolAvatar isDriving={true} velocity={1} />
        )}

        {animState !== 'DRIVING' && (
            <Html position={[0, 2, 0]} center zIndexRange={[100, 0]}>
                <div style={{ color: color, background: 'rgba(0,0,0,0.8)', padding: '6px 12px', border: `1px solid ${color}`, borderRadius: '4px', fontSize: '10px', pointerEvents: 'none', whiteSpace: 'nowrap', fontWeight: 'bold', letterSpacing: '2px', boxShadow: `0 0 10px ${color}66` }}>
                    MOUNT LIGHTCYCLE
                </div>
            </Html>
        )}
    </group>
));
Lightcycle.displayName = 'Lightcycle';

export default function NexusEngine({
    currentFloor, setCurrentFloor, animState, setAnimState, controlMode, isMobile,
    hasEntered, isMapOpen, setIsMapOpen, isFreeRoam, isGhostMode, setActivePlot,
    inMilesRoom, setInMilesRoom, setShowMilesModal, setShowRestrictedModal,
    isDead, supabase, user, walkerCharacterId
}) {
    const { camera, scene } = useThree();
    
    // 🚀 THIRD-PERSON COORDINATE TRACKING
    const playerPos = useRef(new THREE.Vector3(0, -478.3, 30));
    const playerEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
    const avatarWalkingRef = useRef();
    
    const targetEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
    const currentEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
    const velocity = useRef(new THREE.Vector3(0, 0, 0));
    const bikeSteer = useRef(0);
    
    const touchState = useRef({ move: { id: null, startX: 0, startY: 0, curX: 0, curY: 0 }, look: { id: null, prevX: 0, prevY: 0 } });
    const isDraggingMouse = useRef(false);
    const prevMouse = useRef({ x: 0, y: 0 });
    const wasDriving = useRef(false);

    const vDir = useMemo(() => new THREE.Vector3(), []);
    const vRight = useMemo(() => new THREE.Vector3(), []);
    const rayOrigin = useMemo(() => new THREE.Vector3(), []);
    const localDown = useMemo(() => new THREE.Vector3(), []);
    const localUp = useMemo(() => new THREE.Vector3(), []);
    const localForward = useMemo(() => new THREE.Vector3(), []);
    const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
    
    const tempVec1 = useMemo(() => new THREE.Vector3(), []);
    const tempVec2 = useMemo(() => new THREE.Vector3(), []);
    const tempVec3 = useMemo(() => new THREE.Vector3(), []);
    const tempEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

    const alignQuat = useMemo(() => new THREE.Quaternion(), []);
    const yawQuat = useMemo(() => new THREE.Quaternion(), []);
    const targetQuat = useMemo(() => new THREE.Quaternion(), []);
    const rotMatrix = useMemo(() => new THREE.Matrix4(), []);
    
    const camOffset = useMemo(() => new THREE.Vector3(), []);
    const targetCamPos = useMemo(() => new THREE.Vector3(), []);
    const lookTarget = useMemo(() => new THREE.Vector3(), []);

    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const activeBike = useRef('surface');
    
    const bikeRef = useRef();
    const bikeScale = useRef(1);
    const parkedPos = useRef(new THREE.Vector3(0, -479.9, 15)); 
    const bikeQuat = useRef(new THREE.Quaternion());

    const underworldBikeRef = useRef();
    const underworldBikeScale = useRef(1);
    const underworldParkedPos = useRef(new THREE.Vector3(0, -548.3, 15)); 
    const underworldBikeQuat = useRef(new THREE.Quaternion());

    const fogColor = isGhostMode ? 0x0a0000 : 0x000000;
    const fogFar = isGhostMode ? 1500 : (currentFloor === 0 ? 800 : 180);

    const remotePlayersRef = useRef({});
    const playerGroupRef = useRef();
    const avatarGeo = useMemo(() => new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), []);
    const avatarMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true }), []);
    const lastBroadcast = useRef(0);
    const sessionToken = useMemo(() => Math.random().toString(36).substring(2), []);

    // WAVE 2 embodiment state: one presence manager for the whole
    // scene (self + peers share the live-GLB cap, slot keys are
    // per-instance). walkerCharRef is the effective self pick —
    // the page's CharacterPicker reports it through the
    // walkerCharacterId prop; until it does, the engine resolves
    // the Wave 0 chain itself so the first frames are already right.
    const embRef = useRef(null);
    if (!embRef.current) {
        embRef.current = createPresenceEmbodiments({ keyPrefix: 'skyscraper' });
    }
    const walkerCharRef = useRef(undefined);
    const selfHost = useMemo(() => embRef.current.hostFor('self'), []);
    const nativeAvatarRef = useRef();
    const peerFetchRef = useRef({}); // peerId -> true once its pick lookup ran

    // Attach (or swap/clear) a peer's embodiment inside the player
    // group. Refs only — safe to call from the channel handler.
    const attachPeerEmbodiment = (peerId, characterId) => {
        const emb = embRef.current;
        if (!emb) return null;
        const handle = emb.sync(peerId, characterId, FIGURE_PROC_SIZE);
        if (handle && playerGroupRef.current) {
            const host = emb.hostFor(peerId);
            if (host.parent !== playerGroupRef.current) playerGroupRef.current.add(host);
        }
        return handle;
    };

    // Peers whose broadcast carries no pick: one lookup of their
    // public profile character by authId (the profiles API already
    // serves exactly this, roster-validated). Failure leaves the
    // wireframe capsule — the fallback law, not an error state.
    const fetchPeerCharacter = (peerId, authId) => {
        if (!authId || peerFetchRef.current[peerId]) return;
        peerFetchRef.current[peerId] = true;
        fetch(`/api/profiles/${encodeURIComponent(authId)}/character`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const rec = remotePlayersRef.current[peerId];
                const id = characterIdFromPresencePayload({ char: data ? data.characterId : null });
                if (!rec || !id || rec.charId) return;
                rec.charId = id;
                attachPeerEmbodiment(peerId, id);
            })
            .catch(() => { /* the capsule stays — fallback law */ });
    };

    // The self pick: prop reports win; self-resolve until then.
    useEffect(() => {
        const id = walkerCharacterId !== undefined
            ? walkerCharacterId
            : resolveSurfaceCharacterId('skyscraper');
        walkerCharRef.current = id;
        embRef.current.sync('self', id, FIGURE_PROC_SIZE);
    }, [walkerCharacterId]);

    // Scene teardown frees every embodiment (models + slots).
    useEffect(() => () => { embRef.current?.disposeAll(); }, []);

    useEffect(() => {
        if (!hasEntered) return;
        const channel = supabase.channel('hub_room', { config: { broadcast: { ack: false } } });
        channel.on('broadcast', { event: 'player_move' }, ({ payload }) => {
            if (payload.id === sessionToken) return;
            const rec = remotePlayersRef.current[payload.id];
            if (!rec) {
                const mesh = new THREE.Mesh(avatarGeo, avatarMat);
                if (playerGroupRef.current) playerGroupRef.current.add(mesh);
                const fresh = {
                    mesh,
                    targetPos: new THREE.Vector3(payload.x, payload.y, payload.z),
                    targetRot: payload.ry,
                    // WAVE 2: the peer's pick rides the payload —
                    // validated against the roster, never trusted raw
                    charId: characterIdFromPresencePayload(payload),
                    lastSeen: Date.now(),
                };
                remotePlayersRef.current[payload.id] = fresh;
                if (fresh.charId) attachPeerEmbodiment(payload.id, fresh.charId);
                else fetchPeerCharacter(payload.id, payload.authId);
            } else {
                rec.targetPos.set(payload.x, payload.y, payload.z);
                rec.targetRot = payload.ry;
                rec.lastSeen = Date.now();
                const charId = characterIdFromPresencePayload(payload);
                if (charId && charId !== rec.charId) {
                    rec.charId = charId;
                    attachPeerEmbodiment(payload.id, charId);
                }
            }
        }).subscribe();
        return () => supabase.removeChannel(channel);
    }, [hasEntered, supabase, sessionToken, avatarGeo, avatarMat]);

    useEffect(() => {
        if (isDead) { playerPos.current.set(0, -548.3, 0); camera.position.set(0, -548.3, 3); }
    }, [isDead, camera]);

    useEffect(() => {
        if (!hasEntered || isDead) return;

        const onTouchStart = (e) => {
            if (!VALID_LOOK_STATES.includes(animState) || controlMode === 'INTERACT') return;
            const tState = touchState.current;
            const joyBase = document.getElementById('joystick-base');
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.clientX < window.innerWidth / 2) {
                    if (tState.move.id === null) { 
                        tState.move.id = t.identifier; tState.move.startX = t.clientX; tState.move.startY = t.clientY; 
                        if (joyBase) { joyBase.style.display = 'block'; joyBase.style.left = `${t.clientX}px`; joyBase.style.top = `${t.clientY}px`; }
                    }
                } else {
                    if (tState.look.id === null) { tState.look.id = t.identifier; tState.look.prevX = t.clientX; tState.look.prevY = t.clientY; }
                }
            }
        };

        const onTouchMove = (e) => {
            if (!VALID_LOOK_STATES.includes(animState) || controlMode === 'INTERACT') return;
            const tState = touchState.current;
            const joyStick = document.getElementById('joystick-stick');
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === tState.move.id) {
                    tState.move.curX = t.clientX; tState.move.curY = t.clientY;
                    if (joyStick) {
                        const dx = t.clientX - tState.move.startX; const dy = t.clientY - tState.move.startY;
                        const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 40);
                        const angle = Math.atan2(dy, dx);
                        joyStick.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px))`;
                    }
                } else if (t.identifier === tState.look.id) {
                    const dX = t.clientX - tState.look.prevX; const dY = t.clientY - tState.look.prevY;
                    tState.look.prevX = t.clientX; tState.look.prevY = t.clientY;
                    if (animState === 'FREE_ROAM') {
                        targetEuler.current.y -= dX * 0.004; targetEuler.current.x -= dY * 0.004; 
                        targetEuler.current.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, targetEuler.current.x));
                    } else if (animState === 'DRIVING') {
                        bikeSteer.current -= dX * 0.005; 
                    }
                }
            }
        };

        const onTouchEnd = (e) => {
            const tState = touchState.current;
            const joyBase = document.getElementById('joystick-base');
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === tState.move.id) { tState.move.id = null; if (joyBase) joyBase.style.display = 'none'; }
                if (t.identifier === tState.look.id) tState.look.id = null;
            }
        };

        const onMouseDown = (e) => { if (!VALID_LOOK_STATES.includes(animState)) return; isDraggingMouse.current = true; prevMouse.current = { x: e.clientX, y: e.clientY }; };
        const onMouseMove = (e) => {
            if (!isDraggingMouse.current || !VALID_LOOK_STATES.includes(animState)) return;
            const dX = e.clientX - prevMouse.current.x; const dY = e.clientY - prevMouse.current.y;
            prevMouse.current = { x: e.clientX, y: e.clientY };

            if (controlMode === 'LOOK') {
                if (animState === 'FREE_ROAM') {
                    targetEuler.current.y -= dX * 0.003; targetEuler.current.x -= dY * 0.003;
                    targetEuler.current.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, targetEuler.current.x));
                } else if (animState === 'DRIVING') { bikeSteer.current -= dX * 0.004; }
            } 
            if (controlMode === 'MOVE' && (animState === 'FREE_ROAM' || animState === 'DRIVING')) {
                velocity.current.z += (-dY) * 0.01; velocity.current.x += dX * 0.01; 
            }
        };
        const onMouseUp = () => { isDraggingMouse.current = false; };
        
        const touchSurface = window.document;
        touchSurface.addEventListener('touchstart', onTouchStart, { passive: false });
        touchSurface.addEventListener('touchmove', onTouchMove, { passive: false });
        touchSurface.addEventListener('touchend', onTouchEnd);
        touchSurface.addEventListener('touchcancel', onTouchEnd);
        touchSurface.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            touchSurface.removeEventListener('touchstart', onTouchStart);
            touchSurface.removeEventListener('touchmove', onTouchMove);
            touchSurface.removeEventListener('touchcancel', onTouchEnd);
            touchSurface.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [controlMode, animState, hasEntered, isDead]);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        if (isDead) return;

        if (scene.fog) {
            const isUnderworldCam = camera.position.y < -200;
            scene.fog.far = isUnderworldCam || isGhostMode ? 2000 : 800;
            scene.fog.color.setHex(isUnderworldCam || isGhostMode ? 0x0a0000 : 0x000000);
        }

        // Peers: glide the native capsule; its embodiment (when the
        // peer has a pick) stands on the floor beneath it and the
        // capsule steps aside while the model is live (fallback
        // law). A peer silent past PEER_STALE_MS is retired —
        // mesh AND embodiment — so capped slots never leak.
        const frameNow = Date.now();
        Object.entries(remotePlayersRef.current).forEach(([peerId, p]) => {
            if (frameNow - (p.lastSeen || 0) > PEER_STALE_MS) {
                if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                const host = embRef.current.remove(peerId);
                if (host && host.parent) host.parent.remove(host);
                delete remotePlayersRef.current[peerId];
                delete peerFetchRef.current[peerId];
                return;
            }
            p.mesh.position.lerp(p.targetPos, 0.15);
            p.mesh.rotation.y += (p.targetRot - p.mesh.rotation.y) * 0.15;
            const handle = embRef.current.handleFor(peerId);
            if (handle) {
                const host = embRef.current.hostFor(peerId);
                host.position.set(
                    p.mesh.position.x,
                    p.mesh.position.y - FIGURE_PROC_SIZE.y / 2,
                    p.mesh.position.z
                );
                host.rotation.y = p.mesh.rotation.y;
                p.mesh.visible = !handle.isReady();
                if (handle.isReady()) handle.update('idle', dt, state.clock.elapsedTime, {});
            } else {
                p.mesh.visible = true;
            }
        });

        if (!isGhostMode && Date.now() - lastBroadcast.current > 66) {
            supabase.channel('hub_room').send({
                type: 'broadcast', event: 'player_move',
                // WAVE 2: `char` carries our effective pick so peers
                // embody us as our character (null = native capsule)
                payload: { id: sessionToken, authId: user ? user.id : null, char: walkerCharRef.current || null, x: playerPos.current.x, y: playerPos.current.y, z: playerPos.current.z, ry: currentEuler.current.y }
            });
            lastBroadcast.current = Date.now();
        }
        
        // Yield camera controls exclusively to Floor 4 (The 99 Level Ascent)
        if (currentFloor === 4) return;

        const tState = touchState.current;
        if (animState === 'FREE_ROAM') {
            currentEuler.current.x = THREE.MathUtils.lerp(currentEuler.current.x, targetEuler.current.x, 0.25);
            currentEuler.current.y = THREE.MathUtils.lerp(currentEuler.current.y, targetEuler.current.y, 0.25);
        }

        if (tState.move.id !== null && (animState === 'FREE_ROAM' || animState === 'DRIVING') && controlMode !== 'INTERACT') {
            const m = tState.move; const dX = m.curX - m.startX; const dY = m.curY - m.startY;
            const distance = Math.sqrt(dX * dX + dY * dY);
            if (distance > 10) { 
                const intensity = Math.min(distance / 80, 1.0);
                const normX = dX / distance; const normY = dY / distance;
                velocity.current.z += (-normY) * intensity * 0.1; 
                if (animState === 'FREE_ROAM') velocity.current.x += normX * intensity * 0.1; 
                if (animState === 'DRIVING') bikeSteer.current -= normX * intensity * 0.04;
            }
        }

        if (animState === 'DRIVING') {
            wasDriving.current = true;
            const isUnder = activeBike.current === 'underworld';
            const currentScaleRef = isUnder ? underworldBikeScale : bikeScale;
            const currentPosRef = isUnder ? underworldParkedPos : parkedPos;
            const currentQuatRef = isUnder ? underworldBikeQuat : bikeQuat;
            const currentMeshRef = isUnder ? underworldBikeRef : bikeRef;

            currentScaleRef.current = THREE.MathUtils.lerp(currentScaleRef.current, 0.05, 0.1);
            if (!isFreeRoam) {
                const snap = Math.round(bikeSteer.current / (Math.PI / 2)) * (Math.PI / 2);
                bikeSteer.current = THREE.MathUtils.lerp(bikeSteer.current, snap, 0.15);
            }

            yawQuat.setFromAxisAngle(worldUp, bikeSteer.current);
            tempVec3.set(0, 0, -1).applyQuaternion(yawQuat); 
            
            localDown.set(0, -1, 0).applyQuaternion(currentQuatRef.current);
            localUp.set(0, 1, 0).applyQuaternion(currentQuatRef.current);
            
            rayOrigin.copy(currentPosRef.current).addScaledVector(localUp, 2.0); 
            raycaster.set(rayOrigin, localDown);
            
            const hits = raycaster.intersectObjects(scene.children, true);
            const groundHit = hits.find(h => h.object.name && h.object.name.startsWith('DRIVE_'));

            let targetNormal = tempVec2.copy(worldUp);
            let isMagnetized = false;

            if (groundHit && groundHit.distance < 4.0) {
                if (groundHit.object.name.includes('Tunnel')) {
                    isMagnetized = true; 
                    targetNormal.copy(groundHit.normal);
                    currentPosRef.current.copy(groundHit.point).addScaledVector(targetNormal, 0.5); 
                } else {
                    currentPosRef.current.copy(groundHit.point); 
                    currentPosRef.current.y += 0.5; 
                }
                velocity.current.y = 0; 
            } else {
                velocity.current.y -= 50 * dt; 
                currentPosRef.current.y += velocity.current.y * dt;
            }

            if (isMagnetized) {
                const dot = tempVec3.dot(targetNormal);
                tempVec3.subScaledVector(targetNormal, dot).normalize();
                if (tempVec3.lengthSq() < 0.001) tempVec3.set(0, 0, -1).applyQuaternion(currentQuatRef.current);
            } else {
                targetNormal.copy(worldUp);
                tempVec3.y = 0; 
                tempVec3.normalize();
            }

            vRight.crossVectors(tempVec3, targetNormal).normalize();
            vDir.crossVectors(targetNormal, vRight).normalize();
            
            tempVec1.copy(vDir).negate(); 
            rotMatrix.makeBasis(vRight, targetNormal, tempVec1);
            targetQuat.setFromRotationMatrix(rotMatrix);
            
            if (groundHit && groundHit.distance < 4.0) {
                currentQuatRef.current.slerp(targetQuat, 0.25); 
            } else {
                currentQuatRef.current.slerp(targetQuat, 0.05); 
            }

            localForward.set(0, 0, -1).applyQuaternion(currentQuatRef.current);
            tempVec3.copy(currentPosRef.current).addScaledVector(localUp, 0.5); 
            
            raycaster.set(tempVec3, localForward);
            const forwardHits = raycaster.intersectObjects(scene.children, true);
            
            const wallHit = forwardHits.find(h => {
                if (!h.object.isMesh) return false;
                const objName = h.object.name || "";
                if (objName.startsWith('PORTAL_') || objName.startsWith('IGNORE_') || objName.includes('Sparkles')) return false;
                if (objName.startsWith('DRIVE_Tunnel')) return Math.abs(h.normal.dot(localUp)) < 0.6;
                return !objName.startsWith('DRIVE_');
            });

            if (wallHit && wallHit.distance < 2.5 && velocity.current.z > 0) velocity.current.z = 0; 

            const portalHit = forwardHits.find(h => h.object.isMesh && h.object.name.startsWith('PORTAL_'));
            if (portalHit && portalHit.distance < 3.0) {
                if (portalHit.object.name === 'PORTAL_Respawn') {
                    if (currentPosRef.current.y < -500) {
                        currentPosRef.current.set(0, -478.3, 0); 
                    } else {
                        currentPosRef.current.set(150, -548.3, 0); 
                    }
                } else if (portalHit.object.name === 'PORTAL_WarpB') {
                    if (currentPosRef.current.y < -500) {
                        currentPosRef.current.set(200, -478.3, 10); 
                    } else {
                        currentPosRef.current.set(200, -548.3, 10); 
                    }
                }
            }

            const driveSpeed = 280; 
            currentPosRef.current.addScaledVector(localForward, velocity.current.z * (driveSpeed / 25));
            velocity.current.multiplyScalar(0.93); 
    
            if (currentFloor === 0 && !isUnder) applySkyscraperCollision({ position: currentPosRef.current });
    
            if (currentMeshRef.current) {
                currentMeshRef.current.position.copy(currentPosRef.current);
                currentMeshRef.current.quaternion.copy(currentQuatRef.current);
                currentMeshRef.current.scale.setScalar(currentScaleRef.current);
            }
    
            const speedFactor = Math.abs(velocity.current.z);
            const dynamicZOffset = -6 - (speedFactor * 2.5);
            const dynamicYOffset = 2 + (speedFactor * 0.6);

            tempVec1.copy(localForward).multiplyScalar(dynamicZOffset * currentScaleRef.current);
            camOffset.copy(localUp).multiplyScalar(dynamicYOffset * currentScaleRef.current).add(tempVec1);
            targetCamPos.copy(currentPosRef.current).add(camOffset);
            
            camera.position.lerp(targetCamPos, 0.2);
            tempVec1.copy(localForward).multiplyScalar(10);
            lookTarget.copy(currentPosRef.current).add(tempVec1);
            camera.up.lerp(localUp, 0.2); 
            camera.lookAt(lookTarget);

        } else if (animState === 'FREE_ROAM') {
            
            bikeScale.current = THREE.MathUtils.lerp(bikeScale.current, 1.0, 0.1);
            if (bikeRef.current) {
                bikeRef.current.scale.setScalar(bikeScale.current);
                bikeRef.current.position.copy(parkedPos.current);
                bikeRef.current.quaternion.copy(bikeQuat.current);
            }

            underworldBikeScale.current = THREE.MathUtils.lerp(underworldBikeScale.current, 1.0, 0.1);
            if (underworldBikeRef.current) {
                underworldBikeRef.current.scale.setScalar(underworldBikeScale.current);
                underworldBikeRef.current.position.copy(underworldParkedPos.current);
                underworldBikeRef.current.quaternion.copy(underworldBikeQuat.current);
            }

            if (wasDriving.current) {
                wasDriving.current = false;
                const pRef = activeBike.current === 'underworld' ? underworldParkedPos : parkedPos;
                const qRef = activeBike.current === 'underworld' ? underworldBikeQuat : bikeQuat;
                
                tempEuler.setFromQuaternion(qRef.current, 'YXZ');
                currentEuler.current.set(0, tempEuler.y, 0, 'YXZ');
                targetEuler.current.copy(currentEuler.current);

                let targetNormalY = isGhostMode ? -548.3 : ((pRef.current.y > -200) ? 1.7 : -478.3);
                
                playerPos.current.set(pRef.current.x, targetNormalY, pRef.current.z);
            }

            const eulerY = currentEuler.current.y;
            vDir.set(-Math.sin(eulerY), 0, -Math.cos(eulerY)).normalize();
            vRight.set(Math.cos(eulerY), 0, -Math.sin(eulerY)).normalize();
            
            // 🚀 MOVE PLAYER COORDINATES
            playerPos.current.addScaledVector(vDir, velocity.current.z);
            playerPos.current.addScaledVector(vRight, velocity.current.x);
            
            velocity.current.multiplyScalar(0.85);

            if (currentFloor === 0) {
                playerPos.current.x = Math.max(-1950, Math.min(1950, playerPos.current.x));
                playerPos.current.z = Math.max(-1950, Math.min(1950, playerPos.current.z));
                
                const step = Math.floor(Date.now() / 60000);
                const spots = [[3, -2], [-5, 4], [2, 4], [-3, -4], [4, -4]];
                const rX = spots[step % spots.length][0] * 100;
                const rZ = spots[step % spots.length][1] * 100;

                if (playerPos.current.y < -500) {
                    tempVec2.set(150, -548.3, 0); 
                    if (playerPos.current.distanceToSquared(tempVec2) < 64) playerPos.current.set(0, -478.3, 0); 
                    
                    tempVec2.set(200, -548.3, 0); 
                    if (playerPos.current.distanceToSquared(tempVec2) < 64) playerPos.current.set(200, -478.3, 10); 
                } else {
                    tempVec2.set(rX, -478.3, rZ); 
                    if (playerPos.current.distanceToSquared(tempVec2) < 64) playerPos.current.set(150, -548.3, 10); 
                    
                    tempVec2.set(200, -478.3, 0); 
                    if (playerPos.current.distanceToSquared(tempVec2) < 64) playerPos.current.set(200, -548.3, 10); 
                }

                let targetNormalY = isGhostMode ? -548.3 : ((playerPos.current.y > -200) ? 1.7 : -478.3);
                playerPos.current.y = THREE.MathUtils.lerp(playerPos.current.y, targetNormalY, 0.15);
                
                if (!isGhostMode && !inMilesRoom) applySkyscraperCollision({ position: playerPos.current });
            } else {
                // Strict bounds for internal rooms
                playerPos.current.x = Math.max(-28, Math.min(28, playerPos.current.x));
                playerPos.current.z = Math.max(-28, Math.min(28, playerPos.current.z));
                playerPos.current.y = 0; 
            }

            // 🚀 ANIMATE THE AVATAR
            if (Math.abs(velocity.current.z) > 0.1 || Math.abs(velocity.current.x) > 0.1) {
                const moveAngle = Math.atan2(velocity.current.x, velocity.current.z);
                playerEuler.current.y = eulerY + moveAngle;
            }

            if (avatarWalkingRef.current) {
                avatarWalkingRef.current.position.copy(playerPos.current);
                tempEuler.set(0, playerEuler.current.y, 0, 'YXZ');
                targetQuat.setFromEuler(tempEuler);
                avatarWalkingRef.current.quaternion.slerp(targetQuat, 0.2);
            }

            // 🚀 WAVE 2: the embodied self lives inside the avatar
            // group (it inherits this position + facing). Deadpool
            // is the native body: visible until the model is ready,
            // back instantly if the pick clears or the load failed.
            const selfHandle = embRef.current.handleFor('self');
            if (nativeAvatarRef.current) {
                nativeAvatarRef.current.visible = !(selfHandle && selfHandle.isReady());
            }
            if (selfHandle && selfHandle.isReady()) {
                const selfMoving = Math.abs(velocity.current.z) > 0.1 || Math.abs(velocity.current.x) > 0.1;
                selfHandle.update(selfMoving ? 'walk' : 'idle', dt, state.clock.elapsedTime, { moveDir: selfMoving ? 1 : 0 });
            }

            // 🚀 SMOOTH 3RD PERSON CAMERA TRAILING
            camera.quaternion.setFromEuler(currentEuler.current);
            tempVec3.set(0, 1.4, 3.5); // 1.4m high, 3.5m back
            tempVec3.applyEuler(currentEuler.current);
            targetCamPos.copy(playerPos.current).add(tempVec3);
            camera.position.lerp(targetCamPos, 0.3);
        }

        if (animState === 'PULLING_IN') {
            camera.position.lerp(PULL_IN_POS, 0.04); camera.quaternion.slerp(PULL_IN_QUAT, 0.05);
            if (camera.position.distanceTo(PULL_IN_POS) < 0.2) { camera.position.copy(PULL_IN_POS); setAnimState('UI_ACTIVE'); }
        } else if (animState === 'PUSHING_OUT') {
            camera.position.lerp(targetCamPos, 0.035); camera.quaternion.slerp(PUSH_OUT_QUAT, 0.04);
            if (camera.position.distanceTo(targetCamPos) < 0.2) { camera.position.copy(targetCamPos); setAnimState('FREE_ROAM'); targetEuler.current.setFromQuaternion(camera.quaternion); currentEuler.current.copy(targetEuler.current); }
        }
    });

    return (
        <>
            <ambientLight intensity={0.5} />
            <SkyCycle />
            <fog attach="fog" args={[fogColor, 10, fogFar]} />
            
            {!isMobile && <EffectComposer><Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} intensity={0.15} /></EffectComposer>}
            
            <Elevator currentFloor={currentFloor} animState={animState} setAnimState={setAnimState} isMobile={isMobile} />
            
            <group ref={playerGroupRef} />

            {currentFloor === 0 && (
                <>
                    <Exterior 
                        currentFloor={currentFloor} setCurrentFloor={setCurrentFloor} 
                        animState={animState} setAnimState={setAnimState} 
                        setActivePlot={setActivePlot} inMilesRoom={inMilesRoom} 
                        setInMilesRoom={setInMilesRoom} setShowMilesModal={setShowMilesModal}
                        isGhostMode={isGhostMode} isDead={isDead} setShowRestrictedModal={setShowRestrictedModal} 
                    />

                    <Lightcycle 
                        bikeRef={bikeRef} color="#00ffff" animState={animState} 
                        isActive={activeBike.current === 'surface'}
                        onMount={(e) => {
                            e.stopPropagation();
                            if (animState === 'FREE_ROAM') {
                                activeBike.current = 'surface';
                                setAnimState('DRIVING');
                                bikeSteer.current = currentEuler.current.y; 
                                camera.position.copy(parkedPos.current);
                            }
                        }} 
                    />

                    {(isGhostMode || activeBike.current === 'underworld') && (
                        <Lightcycle 
                            bikeRef={underworldBikeRef} color="#ff0000" animState={animState} 
                            isActive={activeBike.current === 'underworld'}
                            onMount={(e) => {
                                e.stopPropagation();
                                if (animState === 'FREE_ROAM') {
                                    activeBike.current = 'underworld';
                                    setAnimState('DRIVING');
                                    bikeSteer.current = currentEuler.current.y;
                                    camera.position.copy(underworldParkedPos.current);
                                }
                            }} 
                        />
                    )}
                    
                    <GuidanceArrow />
                </>
            )}

            {/* 🚀 THE THIRD PERSON AVATAR — the bespoke Deadpool is
                the native body; the Wave 2 embodiment host stands
                inside the same group and takes over when ready */}
            {!isDead && animState === 'FREE_ROAM' && (
                <group ref={avatarWalkingRef}>
                     <group ref={nativeAvatarRef}>
                         <DeadpoolAvatar isDriving={false} velocity={velocity.current.lengthSq()} />
                     </group>
                     <primitive object={selfHost} />
                </group>
            )}
            
            <FloorLoader currentFloor={currentFloor} setCurrentFloor={setCurrentFloor} isMobile={isMobile} />
            {isMapOpen && currentFloor === 0 && <MiniMap onClose={() => setIsMapOpen(false)} />}
        </>
    );
}
