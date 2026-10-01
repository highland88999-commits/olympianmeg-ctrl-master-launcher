"use client";
import React, { useRef, memo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Sparkles, Environment, Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// 🚀 STATIC MEMORY ALLOCATION
// Hoisting geometries and materials prevents VRAM leaks and duplicate draw calls
const silverMat = new THREE.MeshStandardMaterial({ color: "#e0e0e0", metalness: 1.0, roughness: 0.05 });
const bezelMat = new THREE.MeshStandardMaterial({ color: "#050505", metalness: 0.5, roughness: 0.8 });
const screenMat = new THREE.MeshBasicMaterial({ color: "#001100" });
const housingMat = new THREE.MeshStandardMaterial({ color: "#111", metalness: 0.9, roughness: 0.4 });
const floorMat = new THREE.MeshStandardMaterial({ color: "#a0a0a0", metalness: 1.0, roughness: 0.02 });

const bodyGeo = new THREE.BoxGeometry(7, 5, 5);
const neckGeo = new THREE.CylinderGeometry(1.5, 2, 2, 32);
const bezelGeo = new THREE.BoxGeometry(5.8, 3.8, 0.2);
const screenGeo = new THREE.PlaneGeometry(5.4, 3.4);
const deckGeo = new THREE.BoxGeometry(8, 0.5, 4);
const housingGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.4, 32);
const btnGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 32);
const floorGeo = new THREE.PlaneGeometry(200, 200);

const OldSchoolTerminal = memo(({ onActivate }) => {
  const btnRef = useRef();
  const btnMatRef = useRef();
  
  // Use a ref instead of useState to prevent heavy React re-renders when hovering
  const isHovered = useRef(false);

  // High-speed GPU pulse calculation
  useFrame((state) => {
    if (btnMatRef.current) {
      const baseIntensity = isHovered.current ? 4 : 1.5;
      btnMatRef.current.emissiveIntensity = baseIntensity + Math.sin(state.clock.elapsedTime * 6) * 0.5;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* MASSIVE CRT MONITOR BODY */}
      <mesh position={[0, 4, -2]} castShadow receiveShadow geometry={bodyGeo} material={silverMat} />

      {/* STURDY NECK / STAND */}
      <mesh position={[0, 1, -1.5]} castShadow receiveShadow geometry={neckGeo} material={silverMat} />

      {/* BLACK SCREEN BEZEL */}
      <mesh position={[0, 4, 0.6]} castShadow geometry={bezelGeo} material={bezelMat} />

      {/* 🌐 LIVE 3D WEBSITE PROJECTION ON SCREEN */}
      <mesh position={[0, 4, 0.72]} geometry={screenGeo} material={screenMat}>
        <Html transform distanceFactor={1.2} position={[0, 0, 0.01]} scale={5.4 / 1280}>
          <div
            style={{
              width: "1280px",
              height: "800px",
              backgroundColor: "#000",
              border: "8px solid #00ff00",
              boxShadow: "inset 0 0 50px rgba(0,255,0,0.5), 0 0 50px rgba(0,255,0,0.8)",
              borderRadius: "16px",
              overflow: "hidden",
              pointerEvents: "auto", 
            }}
          >
            <iframe
              src="/hermes"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        </Html>
      </mesh>

      {/* SLANTED KEYBOARD DECK */}
      <mesh position={[0, 1.5, 1.8]} rotation={[0.25, 0, 0]} castShadow receiveShadow geometry={deckGeo} material={silverMat} />

      {/* 🟩 THE BIG GREEN BUTTON */}
      <group position={[0, 2.0, 1.8]} rotation={[0.25, 0, 0]}>
        <mesh position={[0, -0.1, 0]} geometry={housingGeo} material={housingMat} />

        <mesh
          position={[0, 0.15, 0]}
          ref={btnRef}
          geometry={btnGeo}
          onPointerOver={() => (isHovered.current = true)}
          onPointerOut={() => (isHovered.current = false)}
          onPointerDown={(e) => {
            e.stopPropagation();
            onActivate();
          }}
        >
          {/* Keep material inline so it can uniquely hold the ref for the pulse animation */}
          <meshStandardMaterial ref={btnMatRef} color="#00ff00" emissive="#00ff00" />
        </mesh>

        <Text position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.25} color="#002200" fontWeight="bold" letterSpacing={0.1}>
          UPLINK
        </Text>
      </group>
    </group>
  );
});
OldSchoolTerminal.displayName = 'OldSchoolTerminal';

export default function HermesTerminalScene({ onOpenFullscreen }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#010203", cursor: "crosshair" }}>
      <Canvas camera={{ position: [0, 5, 12], fov: 55 }} shadows gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}>
        <color attach="background" args={["#010203"]} />
        <fog attach="fog" args={["#010203", 5, 45]} />

        <ambientLight intensity={0.4} />
        <spotLight position={[0, 15, 10]} intensity={80} color="#ffffff" penumbra={0.6} castShadow />
        <pointLight position={[0, 3, 3]} intensity={20} color="#00ff00" distance={15} />

        {/* 🪞 INFINITE MIRROR SILVER FLOOR */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow geometry={floorGeo} material={floorMat} />

        {/* THE TERMINAL */}
        <OldSchoolTerminal onActivate={onOpenFullscreen} />

        {/* ✨ CRISP & GENTLE LIGHT PARTICLES */}
        <Sparkles count={1500} scale={40} size={1.2} speed={0.15} opacity={0.6} color="#e0ffff" />

        <Environment preset="city" />

        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.2} />
        </EffectComposer>

        <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={5} maxDistance={20} enablePan={false} dampingFactor={0.05} />
      </Canvas>
    </div>
  );
}
