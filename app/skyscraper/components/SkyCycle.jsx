'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import SunCalc from '../utils/suncalc'; // vendored: launcher has no suncalc package
import { Clouds, Cloud } from '@react-three/drei';
import {
    makeSkyDome, updateSkyDome, makeStarField, updateStars,
    skyStateFor, skyStateKey,
} from '@/lib/skyscraper-cgi/sky.js';
import { makeMoonTexture } from '@/components/HubMoon';

export default function SkyCycle() {
    const { scene } = useThree();
    const sunLightRef = useRef();
    const moonLightRef = useRef();
    const moonMeshRef = useRef();
    const sunMeshRef = useRef();
    const sunGlowRef = useRef();

    // Merlin's lunar photograph on the Moon (shared maker, node-safe:
    // procedural fallback without a DOM, photo swapped in on load).
    // Basic (unlit) material: the Moon wears the photo of the lit
    // Moon, and its own directional light sits at the Moon, so a
    // lit material would leave the Earth-facing side black.
    const moonMaps = useMemo(makeMoonTexture, []);
    // Radial glow texture for the sun's halo (browser canvas; the
    // sprite simply has no map without a document).
    const sunGlowTex = useMemo(() => {
        if (typeof document === 'undefined') return null;
        try {
            const cv = document.createElement('canvas');
            cv.width = 128; cv.height = 128;
            const c = cv.getContext('2d');
            if (!c) return null;
            const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.fillRect(0, 0, 128, 128);
            return new THREE.CanvasTexture(cv);
        } catch { return null; }
    }, []);

    // CGI (Nov 15, 2026): the sky was one flat background colour.
    // The gradient dome + star field + city-glow horizon now ride
    // the same SunCalc altitude the lights already use — the
    // day/night law does not change, only what it paints.
    const skyDome = useMemo(() => makeSkyDome(), []);
    const starField = useMemo(() => makeStarField('omega-tower'), []);
    const lastSkyKey = useRef(null);

    // Default to Edmonton coordinates (53.5461° N, 113.4938° W)
    const [coords, setCoords] = useState({ lat: 53.5461, lon: -113.4938 });

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                (err) => console.warn("GPS access denied. Defaulting to Edmonton, AB.")
            );
        }
    }, []);

    // Memoize colors for performance
    const dayColor = useMemo(() => new THREE.Color(0x87CEEB), []);
    const sunsetColor = useMemo(() => new THREE.Color(0xFF7E00), []);
    const nightColor = useMemo(() => new THREE.Color(0x020408), []);

    useFrame(() => {
        const date = new Date();
        const sunPos = SunCalc.getPosition(date, coords.lat, coords.lon);
        const moonPos = SunCalc.getMoonPosition(date, coords.lat, coords.lon);

        const r = 5000; // Orbit radius

        // Move the Sun (Directional Light)
        if (sunLightRef.current) {
            sunLightRef.current.position.set(
                r * Math.cos(sunPos.altitude) * Math.sin(sunPos.azimuth),
                r * Math.sin(sunPos.altitude),
                r * Math.cos(sunPos.altitude) * Math.cos(sunPos.azimuth)
            );
        }

        // The visible Sun rides the light: bright core sphere + glow
        // halo, gone once the sun drops below the horizon (house
        // treatment — the light alone used to be the whole sun).
        const sunUp = sunPos.altitude > -0.05;
        if (sunMeshRef.current) {
            sunMeshRef.current.visible = sunUp;
            if (sunLightRef.current) sunMeshRef.current.position.copy(sunLightRef.current.position);
        }
        if (sunGlowRef.current) {
            sunGlowRef.current.visible = sunUp;
            if (sunLightRef.current) sunGlowRef.current.position.copy(sunLightRef.current.position);
        }

        // Move the Moon (Physical Mesh + Directional Light)
        if (moonMeshRef.current && moonLightRef.current) {
            const mX = r * Math.cos(moonPos.altitude) * Math.sin(moonPos.azimuth);
            const mY = r * Math.sin(moonPos.altitude);
            const mZ = r * Math.cos(moonPos.altitude) * Math.cos(moonPos.azimuth);

            moonMeshRef.current.position.set(mX, mY, mZ);
            moonLightRef.current.position.set(mX, mY, mZ);
        }

        // Lerp Sky and Fog Colors based on Sun Altitude
        if (sunPos.altitude > 0.1) {
            scene.background = dayColor;
            if (scene.fog) scene.fog.color.copy(dayColor);
            if (sunLightRef.current) sunLightRef.current.intensity = 3;
        } else if (sunPos.altitude > -0.1 && sunPos.altitude <= 0.1) {
            const lerpFactor = (sunPos.altitude + 0.1) / 0.2;
            const lerped = nightColor.clone().lerp(sunsetColor, lerpFactor);
            scene.background = lerped;
            if (scene.fog) scene.fog.color.copy(lerped);
            if (sunLightRef.current) sunLightRef.current.intensity = lerpFactor * 3;
        } else {
            scene.background = nightColor;
            if (scene.fog) scene.fog.color.copy(nightColor);
            if (sunLightRef.current) sunLightRef.current.intensity = 0;
        }

        // CGI: repaint the gradient dome + stars only when the sky
        // itself moves (quantized key) — the vertex colours are a
        // ~500-vertex repaint, not a per-frame cost.
        const skyState = skyStateFor(sunPos.altitude);
        const skyKey = skyStateKey(skyState);
        if (skyKey !== lastSkyKey.current) {
            lastSkyKey.current = skyKey;
            updateSkyDome(skyDome, skyState);
        }
        updateStars(starField, skyState);
    });

    return (
        <group>
            {/* CGI: the gradient dome + stars sit behind everything
                (renderOrder -1, depthWrite off, fog off). The flat
                scene.background above stays as the fallback behind
                the dome. */}
            <primitive object={skyDome} />
            <primitive object={starField} />

            {/* The Harvested Sun */}
            <directionalLight ref={sunLightRef} color={0xffffee} castShadow />

            {/* The visible Sun: bright core + glow halo, following the
                light above (gone at night — see useFrame). */}
            <mesh ref={sunMeshRef}>
                <sphereGeometry args={[150, 32, 32]} />
                <meshBasicMaterial color={0xffffee} fog={false} />
            </mesh>
            <sprite ref={sunGlowRef} scale={[600, 600, 1]}>
                <spriteMaterial
                    map={sunGlowTex || undefined}
                    color={0xffffee}
                    transparent
                    opacity={0.9}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    fog={false}
                />
            </sprite>

            {/* The Moon */}
            <directionalLight ref={moonLightRef} color={0x88bbff} intensity={0.5} />
            <mesh ref={moonMeshRef}>
                <sphereGeometry args={[100, 32, 32]} />
                <meshBasicMaterial map={moonMaps.map} fog={false} />
            </mesh>

            {/* SECOND CLOUD SYSTEM: High-Altitude Stratosphere */}
            <Clouds material={THREE.MeshBasicMaterial}>
                <Cloud position={[0, 800, 0]} bounds={[1000, 50, 1000]} volume={300} color="#ffffff" opacity={0.15} speed={0.8} />
                <Cloud position={[500, 900, 500]} bounds={[800, 50, 800]} volume={200} color="#ffccaa" opacity={0.1} speed={1.2} />
            </Clouds>
        </group>
    );
}
