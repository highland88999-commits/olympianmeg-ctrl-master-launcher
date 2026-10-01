"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

interface ExcaliburSceneProps {
  onObjectClick: () => void;
  isUnlocked: boolean;
}

export default function ExcaliburScene({ onObjectClick, isUnlocked }: ExcaliburSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawnRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010103, 0.001);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.001, 8000);
    camera.position.set(0, 300, 1000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 2.2, 0.5, 0.1);
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = true; 
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.target.set(0, 80, 0);
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 1500;

    const energyVid = document.createElement("video");
    energyVid.src = "/media/skyscraper/4ab3h5.mp4";
    energyVid.muted = true; energyVid.playsInline = true; energyVid.loop = true; energyVid.crossOrigin = "anonymous";
    energyVid.play().catch(() => {});

    const energyTex = new THREE.VideoTexture(energyVid); 
    energyTex.colorSpace = THREE.SRGBColorSpace;
    energyTex.wrapS = energyTex.wrapT = THREE.MirroredRepeatWrapping; 
    energyTex.repeat.set(1, 4);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const stoneGroup = new THREE.Group();
    const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.7, metalness: 0.8 });
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(80, 1), obsidianMat);
    stone.scale.set(1.5, 0.8, 1.2); stone.position.y = 40;
    stoneGroup.add(stone);
    scene.add(stoneGroup);

    const swordGroup = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ map: energyTex, emissiveMap: energyTex, emissive: 0x00ffff, emissiveIntensity: 2.0, color: 0x00ffff, metalness: 1.0, roughness: 0.1 });
    const bladeGeo = new THREE.CylinderGeometry(0.1, 12, 220, 4); bladeGeo.translate(0, 110, 0);
    const blade = new THREE.Mesh(bladeGeo, bladeMat); blade.scale.set(1, 1, 0.2);
    swordGroup.add(blade);
    
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 32), new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2.5 }));
    pommel.position.y = -50;
    swordGroup.add(pommel);

    const embeddedY = -30; const drawnY = 300;
    swordGroup.position.set(0, embeddedY, 0);
    scene.add(swordGroup);

    scene.add(new THREE.AmbientLight(0x050510, 1.5));
    const strikeLight = new THREE.PointLight(0x00ffff, 0, 2000); strikeLight.position.set(0, 150, 0);
    scene.add(strikeLight);
    const swordGlow = new THREE.PointLight(0x00ffff, 300, 600); swordGlow.position.set(0, 100, 0);
    swordGroup.add(swordGlow);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(swordGroup.children);
      
      if (intersects.length > 0 && !isDrawnRef.current) {
        onObjectClick(); 
      }
    };
    container.addEventListener("pointerdown", onPointerDown);

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        composer.setSize(width, height);
      }
    });
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let reqId: number;
    let drawProgress = 0;
    let orbitAngle = 0;

    const loop = () => {
      reqId = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      energyTex.offset.y = t * 0.5;

      if (isUnlocked && !isDrawnRef.current) {
        isDrawnRef.current = true;
        strikeLight.intensity = 5000; 
        strikeLight.color.setHex(0xffffff);
      }

      if (!isDrawnRef.current) {
        if (Math.random() > 0.95) {
          strikeLight.intensity = Math.random() * 400 + 200;
          strikeLight.color.setHex(Math.random() > 0.5 ? 0x00ffff : 0xff00ff);
        } else {
          strikeLight.intensity = THREE.MathUtils.lerp(strikeLight.intensity, 0, 0.1);
        }
        
        orbitAngle += 0.002;
        camera.position.set(Math.sin(orbitAngle) * 500, 150 + Math.sin(t * 0.8) * 30, Math.cos(orbitAngle) * 500);
        camera.lookAt(controls.target);

      } else {
        if (drawProgress < 1.0) {
          drawProgress += 0.004;
          const ease = drawProgress < 0.5 ? 2 * drawProgress * drawProgress : 1 - Math.pow(-2 * drawProgress + 2, 2) / 2;
          swordGroup.position.y = THREE.MathUtils.lerp(embeddedY, drawnY, ease);
          strikeLight.intensity = THREE.MathUtils.lerp(strikeLight.intensity, 0, 0.05);
        } else {
          swordGroup.position.y = drawnY + Math.sin(t * 1.5) * 15;
          swordGroup.rotation.y = t * 0.5;
          bladeMat.emissiveIntensity = 2.0 + Math.sin(t * 5) * 1.0;
          swordGlow.intensity = 500 + Math.sin(t * 5) * 200;
        }
      }

      controls.update();
      composer.render();
    };
    loop();

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      
      // 🚀 DEEP DISPOSAL ALGORITHM
      energyVid.pause();
      energyVid.removeAttribute('src');
      energyVid.load();
      
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
  }, [isUnlocked, onObjectClick]);

  return <div ref={containerRef} className="w-full h-full outline-none block" />;
}
