// World Engine — HologramPreview: the Hologram Studio preview as a REAL
// 3D hologram (Nov 15). Replaces the old 2D CSS div (text-shadow glow in
// a div) with a three.js scene: the text is drawn onto a canvas texture
// and lives on a plane in 3D space with additive blending, scanlines, a
// depth echo plane, a projector ring, orbit controls and a gentle float.
//
// Why a canvas-texture plane and not extruded TextGeometry: TextGeometry
// needs a typeface JSON font file served from public/, and no font asset
// exists anywhere in the repo (only inside node_modules/three/examples/
// fonts, which is not served). The canvas texture draws the same
// monospace bold letterforms the CSS preview used, so the design is
// unchanged — only the rendering is now genuinely 3D.
//
// Renderer pattern is the MiniViewport one (components/world-engine/
// MiniViewport.jsx): guardCanvasContext, context-loss freeze, dispose on
// unmount. Slider values arrive as props and drive the scene live
// through the pure hologramPreview3D() mapping in the studio datasheet.
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { guardCanvasContext } from '@/lib/scene-context-guard';
import { applyScratchedToMaterial } from '@/lib/portal/scratched-textures';
import {
  STUDIO_3D,
  STUDIO_LIMITS,
  hologramPreview3D,
} from '@/lib/world-engine/datasheets/studio';

/**
 * Draw the hologram text onto the offscreen canvas: bold monospace (the
 * studio's font), glow via shadowBlur — the same capped-glow rule as the
 * old CSS preview (glow capped at 3, 8 px blur per unit) — then scanlines
 * across the whole texture for the hologram read. Resizing the canvas
 * resets its context, so the font is set after the size is fixed.
 * Returns the canvas so the caller can read its real aspect.
 */
function drawHologramTexture(canvas, text, color, glowBlurPx) {
  const ctx = canvas.getContext('2d');
  const label = text || ' ';
  const fontPx = 160;
  const padX = 60;
  const padY = 40;
  ctx.font = `bold ${fontPx}px ${STUDIO_LIMITS.previewFontFamily}, monospace`;
  const textWidth = Math.ceil(ctx.measureText(label).width);
  canvas.width = Math.max(2, textWidth + padX * 2);
  canvas.height = fontPx + padY * 2;
  ctx.font = `bold ${fontPx}px ${STUDIO_LIMITS.previewFontFamily}, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = color;
  ctx.shadowBlur = glowBlurPx;
  ctx.fillStyle = color;
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  // Second pass lays a brighter core over the glow.
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  // Scanlines — the hologram read. Shadow off so the lines stay crisp.
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < canvas.height; y += 6) {
    ctx.fillRect(0, y, canvas.width, 2);
  }
  return canvas;
}

export default function HologramPreview({ text, color, scale, glowIntensity, rotationX, rotationY }) {
  const mountRef = useRef(null);
  const paramsRef = useRef({ text, color, scale, glowIntensity, rotationX, rotationY });
  const sceneRef = useRef(null);
  const holoRef = useRef(null);
  const requestRef = useRef(null);

  // Apply the current slider values to the live scene: redraw the
  // texture, re-size the planes to the text's real aspect, set scale,
  // tilt/turn, opacity, light and ring colour. Pure mapping lives in
  // hologramPreview3D(); this only writes the results into three.js.
  function applyHologramParams() {
    const holo = holoRef.current;
    if (!holo) return;
    const p = paramsRef.current;
    const mapped = hologramPreview3D(p);
    drawHologramTexture(holo.canvas, p.text, p.color, mapped.canvasGlowBlurPx);
    holo.texture.needsUpdate = true;
    const aspect = holo.canvas.width / Math.max(holo.canvas.height, 1);
    const height = STUDIO_3D.planeHeightUnits;
    const width = height * aspect;
    holo.plane.geometry.dispose();
    holo.plane.geometry = new THREE.PlaneGeometry(width, height);
    holo.echo.geometry.dispose();
    holo.echo.geometry = new THREE.PlaneGeometry(width, height);
    holo.group.scale.setScalar(mapped.groupScale);
    holo.tilt.rotation.x = mapped.rotationX;
    holo.tilt.rotation.y = mapped.rotationY;
    holo.material.opacity = mapped.opacity;
    holo.echoMaterial.opacity = mapped.opacity * STUDIO_3D.echoOpacityFactor;
    const tint = new THREE.Color(p.color);
    holo.light.color.copy(tint);
    holo.light.intensity = mapped.lightIntensity;
    // The projector ring wears the fixed magenta scratched-metal wrap
    // (Merlin, 2026-11-15) — it no longer follows the glow-colour
    // slider; the text, echo and light still do.
  }

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100);
    camera.position.set(0, 1.2, STUDIO_3D.cameraDistance);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Context-loss guard (fleet rollout 2026-10-15) — same as MiniViewport:
    // transient losses heal in place, a loss that stays gone surfaces the
    // FEED LOST fallback, and animate() freezes while the context is lost.
    const contextGuard = guardCanvasContext(renderer.domElement, { label: 'HOLOGRAM STUDIO' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = STUDIO_3D.autoRotateSpeed;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(10, 20, 0xa78bfa, 0x222222);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    // Hologram rig: outer group floats, inner group takes the Tilt/Turn
    // sliders, so the animation never fights the user's rotation.
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);

    const canvas = document.createElement('canvas');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    tilt.add(plane);

    // Echo plane — the same texture a touch behind and dimmer, so the
    // hologram reads as a volume from the side, not a flat card.
    const echoMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.15,
    });
    const echo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), echoMaterial);
    echo.position.z = STUDIO_3D.echoOffsetZ;
    echo.scale.setScalar(STUDIO_3D.echoScale);
    tilt.add(echo);

    // Glow spill: a point light tinted by the hologram colour, intensity
    // driven by the Glow slider (capped, like the old preview).
    const light = new THREE.PointLight(0x00ffcc, 1.5, 12);
    light.position.set(0, 0, 1.5);
    tilt.add(light);

    scene.add(group);

    // Projector ring on the floor — stays put while the text floats.
    // MAGENTA scratched-metal wrap (Merlin, 2026-11-15): the ring is
    // the hologram's glow-ring accent surface. Plain magenta metal
    // until the texture lands, so it never goes blank.
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xe600a8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      metalness: 0.9,
      roughness: 0.3,
    });
    applyScratchedToMaterial(ringMaterial, 'magenta');
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.55, 48), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.6;
    scene.add(ring);

    holoRef.current = { group, tilt, plane, echo, material, echoMaterial, texture, canvas, light, ringMaterial };
    applyHologramParams();

    const clock = new THREE.Clock();
    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      if (contextGuard.isLost()) return; // frozen while the context is gone
      controls.update();

      clock.getDelta();
      const t = clock.elapsedTime;
      const holo = holoRef.current;
      if (holo) {
        // Gentle float + breathe; the base opacity comes from the Glow
        // slider through the pure mapping, never from the animation.
        holo.group.position.y = STUDIO_3D.floatAmplitude * Math.sin(t * STUDIO_3D.floatSpeed);
        const breathe = 1 + STUDIO_3D.breatheAmplitude * Math.sin(t * 1.6);
        const base = hologramPreview3D(paramsRef.current);
        holo.material.opacity = Math.min(1, base.opacity * breathe);
        holo.echoMaterial.opacity = base.opacity * STUDIO_3D.echoOpacityFactor * breathe;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(requestRef.current);
      contextGuard.dispose();
      controls.dispose();
      if (holoRef.current) {
        const holo = holoRef.current;
        holo.plane.geometry.dispose();
        holo.echo.geometry.dispose();
        holo.material.dispose();
        holo.echoMaterial.dispose();
        holo.texture.dispose();
        holo.ringMaterial.dispose();
        ring.geometry.dispose();
        scene.remove(holo.group);
        scene.remove(ring);
      }
      grid.material.dispose();
      grid.geometry.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      holoRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every slider + the text and colour drive the live scene.
  useEffect(() => {
    paramsRef.current = { text, color, scale, glowIntensity, rotationX, rotationY };
    applyHologramParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, color, scale, glowIntensity, rotationX, rotationY]);

  return <div className="absolute inset-0 z-0 h-full w-full" ref={mountRef} />;
}
