'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import SunCalc from '../utils/suncalc'; // vendored: launcher has no suncalc package
import { Clouds, Cloud } from '@react-three/drei';

export default function SkyCycle() {
    const { scene } = useThree();
    const sunLightRef = useRef();
    const moonLightRef = useRef();
    const moonMeshRef = useRef();

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
    });

    return (
        <group>
            {/* The Harvested Sun */}
            <directionalLight ref={sunLightRef} color={0xffffee} castShadow />
            
            {/* The Moon */}
            <directionalLight ref={moonLightRef} color={0x88bbff} intensity={0.5} />
            <mesh ref={moonMeshRef}>
                <sphereGeometry args={[100, 32, 32]} />
                <meshStandardMaterial color={0xdddddd} roughness={0.9} metalness={0.1} emissive={0x223344} emissiveIntensity={0.2} />
            </mesh>

            {/* SECOND CLOUD SYSTEM: High-Altitude Stratosphere */}
            <Clouds material={THREE.MeshBasicMaterial}>
                <Cloud position={[0, 800, 0]} bounds={[1000, 50, 1000]} volume={300} color="#ffffff" opacity={0.15} speed={0.8} />
                <Cloud position={[500, 900, 500]} bounds={[800, 50, 800]} volume={200} color="#ffccaa" opacity={0.1} speed={1.2} />
            </Clouds>
        </group>
    );
}
