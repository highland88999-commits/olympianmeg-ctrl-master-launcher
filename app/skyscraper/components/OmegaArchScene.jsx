"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export default function OmegaArchScene() {
  const containerRef = useRef(null);
  const [appState, setAppState] = useState("LANDING");
  const [showRealmMenu, setShowRealmMenu] = useState(false);
  const unlockMediaRef = useRef(() => {});

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // ────────────────────────────────────────────────
    // Scene Setup
    // ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010103, 0.0015);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.001, 4000);
    camera.position.set(0, 80, 450);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      1.5,
      0.4,
      0.1
    );
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.target.set(0, 40, 0);
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 500;

    // ────────────────────────────────────────────────
    // Dynamic Video Textures Pipeline
    // ────────────────────────────────────────────────
    const currentHour = new Date().getHours();
    const isDaytime = currentHour >= 5 && currentHour < 20;

    const skyVideoUrl = isDaytime
      ? "/media/skyscraper/YTDown.com_Shorts_above-the-clouds-sunset-ethereal-ocean-v_Media_FfDVZAOQIio_001_1080p.mp4"
      : "/media/skyscraper/ScreenRecording_07-14-2026_01-15-31_1.mov";

    const createVideo = (url) => {
      const v = document.createElement("video");
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.crossOrigin = "anonymous";
      v.setAttribute("webkit-playsinline", "webkit-playsinline");
      v.setAttribute("playsinline", "playsinline");
      v.setAttribute("loop", "true");
      return v;
    };

    const skyVid = createVideo(skyVideoUrl);
    const vortexVid = createVideo("/media/skyscraper/4ab3h5.mp4"); // Vortex Portal Core
    const archVid = createVideo("/media/skyscraper/wmhz50.mp4");   // Omega Arch Architecture
    const floorVid = createVideo("/media/skyscraper/gemini_generated_video_B04513D4.mp4");

    const mediaPool = [skyVid, vortexVid, archVid, floorVid];
    unlockMediaRef.current = () => {
      mediaPool.forEach((vid) => vid.play().catch(() => {}));
    };

    const skyTex = new THREE.VideoTexture(skyVid);
    skyTex.colorSpace = THREE.SRGBColorSpace;

    const vortexTex = new THREE.VideoTexture(vortexVid);
    vortexTex.colorSpace = THREE.SRGBColorSpace;
    vortexTex.wrapS = THREE.MirroredRepeatWrapping;
    vortexTex.wrapT = THREE.MirroredRepeatWrapping;
    vortexTex.repeat.set(1, 1);

    const archTex = new THREE.VideoTexture(archVid);
    archTex.colorSpace = THREE.SRGBColorSpace;
    archTex.wrapS = THREE.RepeatWrapping;
    archTex.wrapT = THREE.RepeatWrapping;
    archTex.repeat.set(4, 1);

    const floorTex = new THREE.VideoTexture(floorVid);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = THREE.MirroredRepeatWrapping;
    floorTex.wrapT = THREE.MirroredRepeatWrapping;
    floorTex.repeat.set(8, 8);

    // ────────────────────────────────────────────────
    // Environment Mesh
    // ────────────────────────────────────────────────
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(2000, 64, 32),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
      )
    );

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        emissive: 0xffffff,
        emissiveMap: floorTex,
        emissiveIntensity: 0.25,
        roughness: 0.7
      })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // ────────────────────────────────────────────────
    // The Giant OMEGA Arch (Ω)
    // ────────────────────────────────────────────────
    const omegaGroup = new THREE.Group();

    const archRadius = 80;
    const archTube = 15;
    const archMat = new THREE.MeshStandardMaterial({
      map: archTex,
      emissiveMap: archTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.8
    });

    // Torus spanning 288 degrees to create the Omega horseshoe gap
    const archGeo = new THREE.TorusGeometry(archRadius, archTube, 64, 128, Math.PI * 1.6);
    const archMesh = new THREE.Mesh(archGeo, archMat);
    archMesh.rotation.z = -Math.PI * 0.3;
    omegaGroup.add(archMesh);

    const offsetY = archRadius * Math.sin(-Math.PI * 0.3);
    const offsetX = archRadius * Math.cos(-Math.PI * 0.3);

    // Baseline feet
    const footGeo = new THREE.CylinderGeometry(archTube, archTube, 40, 64);
    
    const rightFoot = new THREE.Mesh(footGeo, archMat);
    rightFoot.rotation.z = Math.PI / 2;
    rightFoot.position.set(offsetX + 20, offsetY, 0);
    omegaGroup.add(rightFoot);

    const leftFoot = new THREE.Mesh(footGeo, archMat);
    leftFoot.rotation.z = Math.PI / 2;
    leftFoot.position.set(-offsetX - 20, offsetY, 0);
    omegaGroup.add(leftFoot);

    omegaGroup.position.y = Math.abs(offsetY) + archTube;

    // The Vortex Portal (Inside the Arch)
    const portalMat = new THREE.MeshBasicMaterial({
      map: vortexTex,
      transparent: true,
      opacity: 0,
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const portalMesh = new THREE.Mesh(new THREE.CircleGeometry(archRadius - archTube - 5, 64), portalMat);
    portalMesh.position.set(0, omegaGroup.position.y, 0);
    scene.add(portalMesh);
    scene.add(omegaGroup);

    // ────────────────────────────────────────────────
    // Lighting
    // ────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const archGlowLight = new THREE.PointLight(0x00ffff, 150, 400);
    archGlowLight.position.set(0, omegaGroup.position.y, 20);
    scene.add(archGlowLight);

    const rimLight = new THREE.DirectionalLight(0xaa00ff, 2.0);
    rimLight.position.set(-100, 200, -100);
    scene.add(rimLight);

    // ────────────────────────────────────────────────
    // Raycasting & Interaction
    // ────────────────────────────────────────────────
    let engineState = "ORBITING";
    let orbitAngle = 0;
    let portalOpacity = 0;
    const insideCameraPos = new THREE.Vector3(0, 0.001, 120);
    const archCenter = new THREE.Vector3(0, omegaGroup.position.y, 0);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (appState === "LANDING" || engineState !== "INSIDE") return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      if (raycaster.intersectObject(portalMesh).length > 0 || raycaster.intersectObjects(omegaGroup.children).length > 0) {
        setShowRealmMenu(true);
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

    // ────────────────────────────────────────────────
    // Render Loop
    // ────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let reqId;

    const loop = () => {
      reqId = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();

      // Flow texture
      vortexTex.offset.y = t * 0.2;

      // Arch breathing animation
      omegaGroup.position.y = Math.abs(offsetY) + archTube + Math.sin(t * 1.5) * 2;
      portalMesh.position.y = omegaGroup.position.y;
      archGlowLight.intensity = 150 + Math.sin(t * 3.0) * 50;

      if (appState === "ACTIVE" && engineState === "ORBITING") {
        engineState = "ZOOMING";
      }

      if (engineState === "ORBITING") {
        orbitAngle += 0.0015;
        camera.position.set(
          Math.sin(orbitAngle) * 350,
          80 + Math.sin(t * 0.5) * 20,
          Math.cos(orbitAngle) * 350
        );
        camera.lookAt(archCenter);
      } else if (engineState === "ZOOMING") {
        camera.position.lerp(insideCameraPos, 0.025);
        camera.lookAt(archCenter);
        if (camera.position.distanceTo(insideCameraPos) < 2.0) {
          engineState = "INSIDE";
          controls.enabled = true;
          controls.target.copy(archCenter);
        }
      } else if (engineState === "INSIDE") {
        controls.update();
        if (portalOpacity < 1.0) {
          portalOpacity += 0.015;
          portalMat.opacity = Math.min(portalOpacity, 1.0);
        }
      }

      composer.render();
    };
    loop();

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);

      // Deep GPU Resource Cleanup
      mediaPool.forEach((vid) => {
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      });

      scene.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            if (m.emissiveMap) m.emissiveMap.dispose();
            m.dispose();
          });
        }
      });

      renderer.dispose();
      composer.dispose();
      if (container) container.innerHTML = "";
    };
  }, [appState]);

  // Telemetry Uplink -- REMOVED (2026-10-01 /skyscraper port): the original
  // called a `track_ping` RPC on a FOREIGN Supabase project
  // (ezfwzqxwafvdjtwnmyrx.supabase.co) with a per-visitor id on every mount --
  // phone-home. Per Merlin's standing rule this is inert now; the scene is
  // otherwise untouched. No foreign keys are wired anywhere.

  const handleMasterClick = () => {
    if (appState === "LANDING") {
      setAppState("ACTIVE");
      unlockMediaRef.current();
    }
  };

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", backgroundColor: "#010103", cursor: "pointer", fontFamily: "monospace" }}
      onClick={handleMasterClick}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0, outline: "none", display: "block" }} />

      {/* Initial Landing Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          transition: "opacity 1s ease",
          opacity: appState === "ACTIVE" ? 0 : 1,
          pointerEvents: appState === "ACTIVE" ? "none" : "auto",
          background: "linear-gradient(rgba(1,1,3,0.35), rgba(1,1,3,0.75)), url('/media/skyscraper/4o8srk.jpeg') center/cover no-repeat"
        }}
      >
        <h1 style={{ fontSize: "clamp(1.5rem, 5vw, 3rem)", letterSpacing: "6px", color: "#ffffff", textShadow: "0 0 25px #00ffff, 0 0 60px #00ffff, 0 0 90px #0088ff", margin: 0 }}>
          THE OMEGA ARCH
        </h1>
        <p style={{ fontSize: "clamp(0.85rem, 2.5vw, 1.15rem)", letterSpacing: "4px", color: "#00ffcc", marginTop: "18px" }}>
          TAP TO INITIALIZE
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "10%",
          width: "100%",
          textAlign: "center",
          color: "#00ffff",
          fontSize: "14px",
          letterSpacing: "5px",
          textShadow: "0 0 15px #00ffff",
          transition: "opacity 1s ease",
          pointerEvents: "none",
          opacity: appState === "ACTIVE" && !showRealmMenu ? 0.7 : 0
        }}
      >
        TAP THE VORTEX TO OPEN REALMS
      </div>

      {/* REALM CHOOSER MODAL */}
      {showRealmMenu && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            padding: "16px"
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "600px",
              height: "70vh",
              backgroundColor: "#030305",
              border: "1px solid #ff00ff",
              boxShadow: "0 0 50px rgba(255, 0, 255, 0.3)",
              borderRadius: "8px",
              overflow: "hidden",
              position: "relative",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px",
                borderBottom: "1px solid rgba(255, 0, 255, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#0a0a10"
              }}
            >
              <h2 style={{ color: "#ff00ff", fontWeight: "bold", letterSpacing: "4px", fontSize: "16px", textShadow: "0 0 8px #ff00ff", margin: 0 }}>
                REALM MATRIX UPLINK
              </h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRealmMenu(false);
                }}
                style={{ color: "#00ffff", background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Realm Matrix List (Empty State) */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "24px"
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  border: "2px dashed #00ffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <div style={{ width: "30px", height: "30px", backgroundColor: "rgba(0, 255, 255, 0.2)", borderRadius: "50%" }} />
              </div>

              <p style={{ color: "#00ffff", textAlign: "center", letterSpacing: "2px", lineHeight: "1.8", margin: 0 }}>
                NO EXTERNAL REALMS DETECTED.
                <br />
                <span style={{ color: "#ff00ff", fontSize: "12px" }}>AWAITING MATRIX UPLOAD.</span>
              </p>

              <div style={{ width: "100%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(0,255,255,0.5), transparent)", marginTop: "16px" }} />

              <div
                style={{
                  width: "100%",
                  maxWidth: "400px",
                  padding: "16px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  opacity: 0.5,
                  cursor: "not-allowed"
                }}
              >
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", letterSpacing: "3px", textAlign: "center", margin: 0 }}>
                  LIST INVENTORY [EMPTY]
                </p>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px", borderTop: "1px solid rgba(0, 255, 255, 0.2)", backgroundColor: "#0a0a10", textAlign: "center" }}>
              <span style={{ color: "rgba(0, 255, 255, 0.5)", fontSize: "11px", letterSpacing: "4px" }}>
                CONNECTION ESTABLISHED
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
