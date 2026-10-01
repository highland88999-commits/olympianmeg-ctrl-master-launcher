'use client';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture, useVideoTexture } from '@react-three/drei';

export default function POMMaterial({ map, scale = 0.03, side = THREE.DoubleSide, brightness = 1.0 }) {
    const { camera } = useThree();
    const materialRef = useRef();

    useFrame(() => {
        if (materialRef.current) {
            materialRef.current.uniforms.cameraPos.value.copy(camera.position);
            materialRef.current.uniforms.brightness.value = brightness;
        }
    });

    const uniforms = useMemo(() => ({
        map: { value: map },
        heightScale: { value: scale },
        cameraPos: { value: new THREE.Vector3() },
        brightness: { value: brightness }
    }), [map, scale, brightness]);

    return (
        <shaderMaterial
            ref={materialRef}
            side={side}
            uniforms={uniforms}
            vertexShader={`varying vec2 vUv; varying vec3 vViewPosition; void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vViewPosition = -mvPosition.xyz; gl_Position = projectionMatrix * mvPosition; }`}
            fragmentShader={`uniform sampler2D map; uniform float heightScale; uniform float brightness; varying vec2 vUv; varying vec3 vViewPosition; void main() { vec3 viewDir = normalize(vViewPosition); float height = texture2D(map, vUv).r; vec4 texColor = texture2D(map, vUv - (viewDir.xy * (height * heightScale))); gl_FragColor = vec4(texColor.rgb * brightness, 1.0); }`}
        />
    );
}

// Memory-Safe iOS Image Component
export function StaticPOM({ imgUrl, scale, brightness = 1.0 }) {
    const tex = useTexture(imgUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return <POMMaterial map={tex} scale={scale} brightness={brightness} side={THREE.DoubleSide} />
}

// Heavy Desktop Video Component
export function VideoPOM({ videoUrl, scale, brightness = 1.0 }) {
    const tex = useVideoTexture(videoUrl, { muted: true, loop: true, playsInline: true });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return <POMMaterial map={tex} scale={scale} brightness={brightness} side={THREE.DoubleSide} />
}

// The Auto-Switcher
export function AdaptivePOM({ isMobile, imgUrl, videoUrl, scale, brightness = 1.0 }) {
    if (isMobile) return <StaticPOM imgUrl={imgUrl} scale={scale} brightness={brightness} />;
    return <VideoPOM videoUrl={videoUrl} scale={scale} brightness={brightness} />;
}
