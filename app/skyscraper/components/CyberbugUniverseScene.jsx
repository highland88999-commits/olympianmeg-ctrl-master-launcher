'use client';
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        // Forces the plane to perfectly cover the entire screen in clip space
        gl_Position = vec4(position, 1.0);
    }
`;

const fragmentShader = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;

    #define MAX_STEPS 90
    #define SURF_DIST 0.002
    #define MAX_DIST 30.0

    float g_plasma = 0.0;
    float g_ladyGlow = 0.0;
    float g_spiderGlow = 0.0;
    float g_webGlow = 0.0;
    float g_sparks = 0.0;

    mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
    }

    float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
    }

    float sdSphere(vec3 p, float r) { return length(p) - r; }
    
    float sdEllipsoid(vec3 p, vec3 r) {
        float k0 = length(p / r);
        float k1 = length(p / (r * r));
        return k0 * (k0 - 1.0) / k1;
    }

    float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
        vec3 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h) - r;
    }

    float sdWeb(vec3 p, float t) {
        float dFloor = p.y + 1.2;
        float r = length(p.xz);
        float ring = abs(sin(r * 4.0 - t * 2.0)) * 0.08;
        float radial = abs(sin(atan(p.z, p.x) * 8.0)) * 0.08;
        return dFloor + ring * 0.3 + radial * 0.3;
    }

    float mapSpider(vec3 p, float t) {
        vec3 sp = p - vec3(0.0, -0.2, 0.1);
        sp.xz *= rot(0.2);
        float glitch = sin(p.y * 40.0 + t * 20.0) * 0.015;
        float abdomen = sdEllipsoid(sp - vec3(0.0, -0.1, 0.75), vec3(0.38, 0.3, 0.52) + glitch);
        float thorax = sdSphere(sp - vec3(0.0, 0.0, 0.1), 0.28);
        
        vec3 ep = sp - vec3(0.0, 0.1, -0.12);
        ep.x = abs(ep.x);
        float eyes = sdSphere(ep - vec3(0.08, 0.02, 0.0), 0.04);
        eyes = min(eyes, sdSphere(ep - vec3(0.14, -0.04, 0.03), 0.03));
        g_spiderGlow += 0.003 / (0.01 + eyes * eyes * 8.0);

        float legs = 1e5;
        for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float side = 1.0;
            for (int s = 0; s < 2; s++) {
                side = (s == 0) ? 1.0 : -1.0;
                float twitch = sin(t * 8.0 + fi * 1.5 + side) * 0.12;
                vec3 root = sp + vec3(side * 0.18, 0.0, 0.25 - fi * 0.18);
                vec3 knee = root + vec3(side * (0.6 + fi * 0.08), 0.5 + twitch, -0.2 + fi * 0.2);
                vec3 tip = knee + vec3(side * 0.4, -0.8 - twitch, 0.2);
                legs = min(legs, min(sdCapsule(sp, root, knee, 0.03), sdCapsule(sp, knee, tip, 0.02)));
            }
        }

        vec3 fp = sp - vec3(0.0, -0.12, -0.2);
        fp.x = abs(fp.x) - 0.07;
        float fangs = sdCapsule(fp, vec3(0.0), vec3(0.02, -0.15, -0.08), 0.025);
        return min(min(min(smin(abdomen, thorax, 0.1), eyes), fangs), legs);
    }

    float mapLadybug(vec3 p, float t) {
        vec3 lp = p - vec3(0.0, 0.25 + sin(t * 4.0) * 0.04, -0.25 + cos(t * 2.0) * 0.03);
        lp.yz *= rot(0.35 + sin(t * 3.0) * 0.05);

        float chassis = sdEllipsoid(lp, vec3(0.7, 0.45, 0.65));
        vec3 el = lp;
        el.x = abs(el.x) - 0.18 - sin(t * 1.5) * 0.05;
        el.xy *= rot(0.25); el.xz *= rot(-0.15);
        float elytra = sdEllipsoid(el - vec3(0.25, 0.18, 0.05), vec3(0.48, 0.38, 0.62));
        
        vec3 spotP = el - vec3(0.4, 0.32, 0.1);
        float spots = sdSphere(spotP, 0.15);
        spots = min(spots, sdSphere(el - vec3(0.32, 0.38, -0.25), 0.12));
        spots = min(spots, sdSphere(el - vec3(0.5, 0.18, 0.35), 0.11));
        
        elytra = max(elytra, -spots * 0.8);
        g_ladyGlow += 0.005 / (0.015 + spots * spots * 12.0);

        vec3 hp = lp - vec3(0.0, -0.05, -0.65);
        float head = sdEllipsoid(hp, vec3(0.32, 0.22, 0.26));
        
        vec3 vp = hp - vec3(0.0, 0.08, -0.15);
        vp.x = abs(vp.x) - 0.14;
        float visor = sdSphere(vp, 0.08);
        g_plasma += 0.004 / (0.01 + visor * visor * 20.0);

        vec3 mp = hp - vec3(0.0, -0.12, -0.25);
        mp.x = abs(mp.x) - 0.12;
        mp.xy *= rot(-0.3 + sin(t * 12.0) * 0.15);
        float mandible = min(sdCapsule(mp, vec3(0.0), vec3(0.18, -0.15, -0.35), 0.035), sdCapsule(mp, vec3(0.18, -0.15, -0.35), vec3(0.02, -0.2, -0.45), 0.02));

        float legs = 1e5;
        for (int j = 0; j < 3; j++) {
            float fj = float(j);
            float side = 1.0;
            for (int s = 0; s < 2; s++) {
                side = (s == 0) ? 1.0 : -1.0;
                vec3 lroot = lp + vec3(side * 0.35, -0.1, -0.3 + fj * 0.3);
                vec3 lknee = lroot + vec3(side * 0.45, 0.25, -0.1);
                vec3 ltip = lknee + vec3(side * 0.15, -0.65, 0.1 - fj * 0.1);
                legs = min(legs, min(sdCapsule(lp, lroot, lknee, 0.045), sdCapsule(lp, lknee, ltip, 0.035)));
            }
        }

        float core = sdSphere(lp - vec3(0.0, 0.15, 0.1), 0.22);
        g_plasma += 0.008 / (0.01 + core * core * 16.0);

        return min(min(min(min(min(smin(chassis, elytra, 0.08), head, 0.05), mandible), visor), legs), core);
    }

    float mapEnergyVortex(vec3 p, float t) {
        vec3 beamStart = vec3(0.0, 0.05, -0.9);
        vec3 beamEnd = vec3(0.0, -0.2, -0.1);   
        float beam = sdCapsule(p, beamStart, beamEnd, 0.06 + 0.02 * sin(p.y * 30.0 - t * 25.0));
        float sparkDist = length(p - mix(beamStart, beamEnd, fract(sin(t * 37.0) * 0.5 + 0.5))) - 0.08;
        g_sparks += 0.008 / (0.005 + sparkDist * sparkDist * 30.0);
        g_plasma += 0.012 / (0.008 + beam * beam * 25.0);
        return min(beam, sparkDist);
    }

    vec2 map(vec3 p) {
        float dSpider = mapSpider(p, u_time);
        float dLady = mapLadybug(p, u_time);
        float dBeam = mapEnergyVortex(p, u_time);
        float dFloor = sdWeb(p, u_time);

        vec2 res = vec2(dLady, 1.0);
        if (dSpider < res.x) res = vec2(dSpider, 2.0);
        if (dFloor < res.x) res = vec2(dFloor, 3.0);
        if (dBeam < res.x) res = vec2(dBeam, 4.0);
        return res;
    }

    vec3 calcNormal(vec3 p) {
        vec2 e = vec2(0.001, -0.001);
        return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
    }

    float pseudoNoise(vec2 p) { return sin(p.x * 10.0) * cos(p.y * 10.0); }

    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        vec2 mouse = (u_mouse / u_resolution - 0.5) * 2.0;

        float camDist = 3.2;
        float camTime = u_time * 0.25 + mouse.x * 2.0;
        float camY = 1.2 + sin(u_time * 0.3) * 0.5 - mouse.y * 1.5;
        
        vec3 ro = vec3(sin(camTime) * camDist, camY, cos(camTime) * camDist);
        vec3 ta = vec3(0.0, 0.0, -0.1); 

        vec3 ww = normalize(ta - ro);
        vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
        vec3 vv = normalize(cross(uu, ww));
        vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.4 * ww);

        float t = 0.0;
        vec2 res = vec2(-1.0);
        
        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * t;
            res = map(p);
            if (res.x < SURF_DIST || t > MAX_DIST) break;
            t += res.x * 0.75; 
        }

        vec3 col = vec3(0.02, 0.015, 0.04) * (1.0 - length(uv) * 0.5);
        float grid = abs(sin(atan(rd.z, rd.x) * 16.0 + u_time * 0.5));
        col += vec3(0.1, 0.0, 0.25) * smoothstep(0.8, 1.0, grid) * 0.3;

        if (t < MAX_DIST) {
            vec3 p = ro + rd * t;
            vec3 n = calcNormal(p);
            vec3 ref = reflect(rd, n);

            vec3 light1Pos = vec3(2.0, 3.0, -2.0); vec3 light1Col = vec3(1.0, 0.05, 0.4);
            vec3 light2Pos = vec3(-2.5, 2.0, 2.0); vec3 light2Col = vec3(0.0, 0.9, 1.0);
            
            vec3 l1 = normalize(light1Pos - p); vec3 l2 = normalize(light2Pos - p);
            float diff1 = max(dot(n, l1), 0.0); float diff2 = max(dot(n, l2), 0.0);
            float spec1 = pow(max(dot(ref, l1), 0.0), 32.0); float spec2 = pow(max(dot(ref, l2), 0.0), 32.0);
            float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

            vec3 albedo = vec3(0.05);
            if (res.y == 1.0) {
                float isShell = smoothstep(0.1, 0.5, p.y);
                albedo = mix(vec3(0.03, 0.03, 0.04), vec3(0.9, 0.01, 0.15), isShell);
                col = albedo * (diff1 * light1Col + diff2 * light2Col) + (spec1 + spec2 * 1.5) * vec3(1.0, 0.6, 0.7) + fresnel * vec3(1.0, 0.1, 0.4) * 1.2;
            } else if (res.y == 2.0) {
                float glitchLine = step(0.7, sin(p.y * 60.0 + u_time * 15.0));
                albedo = mix(vec3(0.08, 0.07, 0.1), vec3(0.0, 1.0, 0.4), glitchLine * 0.6);
                col = albedo * (diff1 * light1Col * 0.8 + diff2 * light2Col * 1.2) + (spec2 * 2.0) * vec3(0.3, 1.0, 0.8) + fresnel * vec3(0.6, 0.0, 1.0) * 0.8;
            } else if (res.y == 3.0) {
                float r = length(p.xz);
                vec3 webPattern = vec3(0.0, 0.8, 1.0) * abs(sin(r * 6.0 - u_time * 3.0)) + vec3(1.0, 0.0, 0.6) * abs(sin(atan(p.z, p.x) * 12.0));
                col = webPattern * 0.4 + spec2 * vec3(0.2, 0.8, 1.0);
            } else if (res.y == 4.0) {
                col = vec3(1.5, 0.2, 0.8) * 2.0;
            }
            col = mix(col, vec3(0.02, 0.01, 0.05), 1.0 - exp(-0.04 * t * t));
        }

        col += vec3(1.0, 0.02, 0.3) * g_ladyGlow * 1.2 + vec3(0.0, 1.0, 0.6) * g_spiderGlow * 1.5 + vec3(0.1, 0.9, 1.0) * g_plasma * 2.0 + vec3(1.0, 0.8, 0.1) * g_sparks * 2.5;

        vec2 caOffset = vec2(0.003 * sin(u_time * 2.0), 0.0);
        col.r = col.r * 0.9 + 0.1 * pseudoNoise(uv + caOffset);
        col.b = col.b * 0.9 + 0.1 * pseudoNoise(uv - caOffset);
        col -= sin(gl_FragCoord.y * 1.8) * 0.04;

        float pulse = pow(sin(u_time * 4.0) * 0.5 + 0.5, 8.0) * 0.15;
        col += vec3(pulse * 0.8, pulse * 0.1, pulse * 0.5);

        col = max(vec3(0.0), col);
        col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
        col *= clamp(1.0 - dot(uv * 0.7, uv * 0.7), 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
    }
`;

export default function CyberbugUniverseScene() {
    const materialRef = useRef();
    const { size, pointer } = useThree();

    const uniforms = useMemo(() => ({
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(size.width, size.height) },
        u_mouse: { value: new THREE.Vector2(0, 0) }
    }), [size]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
            // Map R3F normalized pointer (-1 to 1) into pixel coordinates expected by the shader
            materialRef.current.uniforms.u_mouse.value.set(
                (pointer.x + 1) / 2 * size.width,
                (pointer.y + 1) / 2 * size.height
            );
        }
    });

    useEffect(() => {
        if (materialRef.current) {
            materialRef.current.uniforms.u_resolution.value.set(size.width, size.height);
        }
    }, [size]);

    return (
        <group>
            {/* The Clip-Space Screen Quad */}
            <mesh>
                <planeGeometry args={[2, 2]} />
                <shaderMaterial 
                    ref={materialRef}
                    vertexShader={vertexShader}
                    fragmentShader={fragmentShader}
                    uniforms={uniforms}
                    depthWrite={false}
                    depthTest={false}
                />
            </mesh>

            <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
                <div style={{
                    position: 'absolute', bottom: '24px', left: '24px', color: '#00ffcc',
                    fontFamily: 'Courier New, Courier, monospace', fontSize: '13px', letterSpacing: '2px',
                    textTransform: 'uppercase', textShadow: '0 0 10px rgba(0,255,204,0.8), 0 0 20px rgba(255,0,102,0.6)',
                    background: 'rgba(5, 5, 12, 0.65)', padding: '10px 16px', border: '1px solid rgba(0, 255, 204, 0.3)',
                    borderLeft: '4px solid #ff0066', borderRadius: '2px', backdropFilter: 'blur(4px)'
                }}>
                    [TARGET ENGAGED] // CYBER-COCCINELLID v8.4 &gt; FEEDING ON &gt; ARACHNO-DROID_09<br/>
                    STATUS: SYSTEM OVERRIDE &amp; ENERGY EXTRACTION ACTIVE
                </div>
            </Html>
        </group>
    );
}
