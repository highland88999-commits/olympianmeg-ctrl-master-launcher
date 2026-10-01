"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export default function VortexMirrorScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [appState, setAppState] = useState<"LANDING" | "ACTIVE">("LANDING");
  const unlockMediaRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 4000);
    camera.position.set(0, 50, 250);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 1.0, 0.5, 0.2);
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.target.set(0, 15, 0);
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 8;
    controls.maxDistance = 140;

    const currentHour = new Date().getHours();
    const isDaytime = currentHour >= 5 && currentHour < 20;
    const skyVideoUrl = isDaytime
      ? "/media/skyscraper/YTDown.com_Shorts_above-the-clouds-sunset-ethereal-ocean-v_Media_FfDVZAOQIio_001_1080p.mp4"
      : "/media/skyscraper/ScreenRecording_07-14-2026_01-15-31_1.mov";

    const createVideo = (url: string) => {
      const v = document.createElement("video");
      v.src = url; v.muted = true; v.playsInline = true; v.loop = true; v.crossOrigin = "anonymous";
      return v;
    };

    const skyVid = createVideo(skyVideoUrl);
    const vortexVid = createVideo("/media/skyscraper/4ab3h5.mp4");
    const frameVid = createVideo("/media/skyscraper/wmhz50.mp4");
    const floorVid = createVideo("/media/skyscraper/gemini_generated_video_B04513D4.mp4");
    const innerVid = createVideo("/media/skyscraper/ut650a.mp4");
    const outerVid = createVideo("/media/skyscraper/cfxyi1.mp4");

    const mediaPool = [skyVid, vortexVid, frameVid, floorVid, innerVid, outerVid];
    unlockMediaRef.current = () => {
      mediaPool.forEach((vid) => vid.play().catch(() => {}));
    };

    const createTex = (vid: HTMLVideoElement) => {
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const skyTex = createTex(skyVid);
    const vortexTex = createTex(vortexVid);
    const frameTex = createTex(frameVid);
    const floorTex = createTex(floorVid);
    const innerTex = createTex(innerVid);
    const outerTex = createTex(outerVid);

    [skyTex, innerTex, outerTex].forEach(tex => { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; });
    [vortexTex, frameTex, floorTex].forEach(tex => { tex.wrapS = THREE.MirroredRepeatWrapping; tex.wrapT = THREE.MirroredRepeatWrapping; });
    floorTex.repeat.set(4, 4);

    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })));
    
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ map: floorTex, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.3, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: innerTex, emissive: 0xffffff, emissiveMap: innerTex, emissiveIntensity: 0.35, side: THREE.BackSide })));
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(102, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: outerTex, emissive: 0xffffff, emissiveMap: outerTex, emissiveIntensity: 0.45, side: THREE.FrontSide })));

    const portalGeo = new THREE.TorusGeometry(12, 1.5, 16, 100);
    
    const entryPortalMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2.0 });
    const entryPortal = new THREE.Mesh(portalGeo, entryPortalMat);
    entryPortal.position.set(0, 30, 140); 
    scene.add(entryPortal);

    const exitPortalMat = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2.0 });
    const exitPortal = new THREE.Mesh(portalGeo, exitPortalMat);
    exitPortal.position.set(0, 20, -50); 
    exitPortal.visible = false; 
    scene.add(exitPortal);

    const mirrorGroup = new THREE.Group();
    const frameSize = 12;
    
    const videoMat = new THREE.MeshBasicMaterial({ map: vortexTex, transparent: true, opacity: 0, color: 0xd0d0d0 });
    const videoMesh = new THREE.Mesh(new THREE.CircleGeometry((frameSize * 0.26) + 0.04, 64), videoMat);
    videoMesh.position.set(0, 0, -0.02);
    mirrorGroup.add(videoMesh);

    const frameMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: frameTex }, time: { value: 0 }, globalAlpha: { value: 0.0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; uniform float globalAlpha; varying vec2 vUv; 
        void main() { 
          vec4 c = texture2D(tDiffuse, vUv); 
          float d = distance(vUv, vec2(0.5)); 
          float innerAlpha = smoothstep(0.24, 0.27, d); 
          float innerShadow = smoothstep(0.24, 0.32, d);
          vec3 pulsedColor = c.rgb * (1.0 + sin(time * 1.5) * 0.25); 
          float outerAlpha = smoothstep(0.48, 0.44, d); 
          gl_FragColor = vec4(pulsedColor * innerShadow, globalAlpha * innerAlpha * outerAlpha); 
        }`,
      transparent: true, side: THREE.DoubleSide
    });
    const frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(frameSize, frameSize), frameMat);
    mirrorGroup.add(frameMesh);
    camera.add(mirrorGroup);

    scene.add(new THREE.AmbientLight(0xffffff, 0.1));
    // PORT NOTE (2026-10-01): the original chained .position.set() inside
    // scene.add() below -- set() returns the Vector3, not the light -- so
    // three.js ignored the add (not an Object3D) and these two PointLights
    // NEVER entered the scene. Kept identical on purpose: the program's
    // visuals stay exactly as Merlin shipped them. (tsc rejects the original
    // chaining, and the launcher build is kept tsc-clean.)
    const _vortexLightA = new THREE.PointLight(0x00ffff, 40, 150);
    _vortexLightA.position.set(-20, 30, 20);
    const _vortexLightB = new THREE.PointLight(0xaa00ff, 40, 150);
    _vortexLightB.position.set(20, 30, -20);
    scene.add(new THREE.DirectionalLight(0x4466ff, 1.0));

    let engineState = "ORBITING";
    let orbitAngle = 0;
    let mirrorOpacity = 0;
    const insideCameraPos = new THREE.Vector3(0, 12, 35);
    const centerTarget = new THREE.Vector3(0, 15, 0);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event: MouseEvent) => {
      if (appState === "LANDING") return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      if (engineState === "ORBITING") {
        if (raycaster.intersectObject(entryPortal).length > 0) {
          engineState = "ZOOMING_IN";
          entryPortal.visible = false;
        }
      } else if (engineState === "INSIDE") {
        if (raycaster.intersectObject(exitPortal).length > 0) {
          engineState = "ZOOMING_OUT";
          controls.enabled = false;
          exitPortal.visible = false;
        }
      }
    };
    container.addEventListener("pointerdown", onPointerDown);

    let targetMirrorZ = -14;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        camera.aspect = width / height; camera.updateProjectionMatrix();
        renderer.setSize(width, height); composer.setSize(width, height);
        targetMirrorZ = (width / height) < 1 ? -24 : -14;
      }
    });
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let reqId: number;

    const loop = () => {
      reqId = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      
      entryPortal.rotation.y += 0.01;
      entryPortal.rotation.z = Math.sin(t) * 0.1;
      exitPortal.rotation.y += 0.01;
      exitPortal.rotation.x = Math.cos(t) * 0.1;

      frameMat.uniforms.time.value = t;
      mirrorGroup.position.set(0, Math.sin(t * 1.2) * 0.35, targetMirrorZ);
      mirrorGroup.rotation.set(Math.sin(t * 0.8) * 0.02, Math.cos(t * 0.9) * 0.02, 0);

      if (engineState === "ORBITING") {
        orbitAngle += 0.002;
        camera.position.set(Math.sin(orbitAngle) * 250, 50 + Math.sin(t * 0.5) * 10, Math.cos(orbitAngle) * 250);
        camera.lookAt(centerTarget);
        if (mirrorOpacity > 0) {
          mirrorOpacity -= 0.02;
          videoMat.opacity = Math.max(0, mirrorOpacity);
          frameMat.uniforms.globalAlpha.value = Math.max(0, mirrorOpacity);
        }
      } 
      else if (engineState === "ZOOMING_IN") {
        camera.position.lerp(insideCameraPos, 0.04);
        camera.lookAt(centerTarget);
        if (camera.position.distanceTo(insideCameraPos) < 2.0) {
          engineState = "INSIDE";
          controls.enabled = true;
          exitPortal.visible = true; 
        }
      } 
      else if (engineState === "INSIDE") {
        controls.update();
        if (mirrorOpacity < 1.0) {
          mirrorOpacity += 0.015;
          videoMat.opacity = Math.min(1, mirrorOpacity);
          frameMat.uniforms.globalAlpha.value = Math.min(1, mirrorOpacity);
        }
      }
      else if (engineState === "ZOOMING_OUT") {
        const targetX = Math.sin(orbitAngle) * 250;
        const targetY = 50 + Math.sin(t * 0.5) * 10;
        const targetZ = Math.cos(orbitAngle) * 250;
        
        camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.03);
        camera.lookAt(centerTarget);
        
        if (mirrorOpacity > 0) {
          mirrorOpacity -= 0.04; 
          videoMat.opacity = Math.max(0, mirrorOpacity);
          frameMat.uniforms.globalAlpha.value = Math.max(0, mirrorOpacity);
        }

        if (camera.position.distanceTo(new THREE.Vector3(targetX, targetY, targetZ)) < 5.0) {
          engineState = "ORBITING";
          entryPortal.visible = true; 
        }
      }

      composer.render();
    };
    loop();

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      
      // 🚀 DEEP DISPOSAL ALGORITHM
      mediaPool.forEach((vid) => {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      });

      scene.traverse((object: any) => {
        if (!object.isMesh) return;
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((mat: any) => {
            if (mat.map) mat.map.dispose();
            if (mat.emissiveMap) mat.emissiveMap.dispose();
            mat.dispose();
          });
        }
      });
      
      renderer.dispose();
      composer.dispose();
      if (container) container.innerHTML = "";
    };
  }, [appState]);

  const handleMasterClick = () => {
    if (appState === "LANDING") {
      setAppState("ACTIVE");
      unlockMediaRef.current();
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#010103] cursor-pointer" onClick={handleMasterClick}>
      <div ref={containerRef} className="absolute inset-0 outline-none block" />

      <div 
        className={`absolute inset-0 z-50 flex flex-col items-center justify-center text-center transition-opacity duration-1000 ${
          appState === "ACTIVE" ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{ background: "linear-gradient(rgba(1,1,3,0.35), rgba(1,1,3,0.75)), url('/media/skyscraper/4o8srk.jpeg') center/cover no-repeat" }}
      >
        <h1 className="text-3xl md:text-5xl tracking-[6px] text-white drop-shadow-[0_0_25px_#00ffff,0_0_60px_#00ffff,0_0_90px_#0088ff] animate-[float_4.5s_ease-in-out_infinite]">
          MIRROR, MIRROR ON THE WALL
        </h1>
        <p className="text-lg tracking-[4px] text-[#00ffcc] mt-5 animate-[ticker_1.6s_linear_infinite]">
          TAP TO INITIALIZE
        </p>
      </div>

      <div className={`absolute bottom-[10%] w-full text-center text-[#00ffff] text-sm md:text-lg tracking-[5px] drop-shadow-[0_0_15px_#00ffff] transition-opacity duration-1000 pointer-events-none ${
        appState === "ACTIVE" ? "opacity-70" : "opacity-0"
      }`}>
        TAP GLOWING PORTALS TO TRAVERSE
      </div>
    </div>
  );
}
