"use client";

import { useEffect, useRef } from "react";
import { VERTEX_SHADER, FRAGMENT_SHADER } from "./shaders";
import { guardCanvasContext } from "../../lib/scene-context-guard.js";

// --- DIONYSUS interior treatment: icon set (no text buttons on this page) ---
const BH_BG = "/images/beehive/bg.webp";
function HiveGlyph({ size = 22, className = "" }) {
  // Hex-cell glyph: no text, inline SVG, zero image weight.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 2 21 7v10l-9 5-9-5V7z" stroke="rgba(255,210,120,0.95)" strokeWidth="2" />
      <path d="M12 7.5 16 10v5l-4 2.5L8 15v-5z" fill="rgba(255,210,120,0.55)" />
    </svg>
  );
}

/**
 * Beehive — a room-sized interactive beehive rendered as a single
 * raymarched WebGL fragment shader. Shaders are preserved verbatim from the
 * original single-file app; all telemetry trackers were removed.
 */
export default function BeehivePage() {
  const canvasRef = useRef(null);

  useEffect(() => {
    document.title = "Beehive";
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) {
      const msg = document.createElement("p");
      msg.textContent =
        "Sorry — your browser could not start WebGL, so the beehive cannot be shown.";
      msg.style.cssText =
        "color:#ffd278;font-family:system-ui,sans-serif;padding:2rem;text-align:center;";
      canvas.replaceWith(msg);
      return;
    }

    function compileShader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.error("Beehive shader error:", gl.getShaderInfoLog(s));
      }
      return s;
    }

    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.error("Beehive program link error:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Context-loss guard (fleet rollout 2026-10-15). Raw WebGL state does
    // NOT heal on webglcontextrestored the way three.js state does, so a
    // loss (or a restore) lands on the recoverable FEED LOST state, and
    // the render loop below freezes while the context is lost.
    const contextGuard = guardCanvasContext(canvas, {
      label: "BEEHIVE",
      onRestored: () => contextGuard.showFallback(),
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttrib = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

    const locTime = gl.getUniformLocation(program, "u_time");
    const locRes = gl.getUniformLocation(program, "u_res");
    const locCamRot = gl.getUniformLocation(program, "u_camRot");
    const locZoom = gl.getUniformLocation(program, "u_zoom");

    // Interaction state — starts looking slightly down into the room.
    let camRot = { x: 0, y: 0 };
    let targetRot = { x: 0.5, y: -0.2 };
    let camZoom = 1.0;
    let targetZoom = 1.0;
    let isDragging = false;
    let lastPos = { x: 0, y: 0 };
    let initialPinchDist = null;
    let rafId = 0;
    let disposed = false;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function handleStart(x, y) {
      isDragging = true;
      lastPos = { x, y };
    }
    function handleMove(x, y) {
      if (!isDragging) return;
      const dx = x - lastPos.x;
      const dy = y - lastPos.y;
      // Inverted for a natural look-around feel inside a room
      targetRot.x -= dx * 0.005;
      targetRot.y -= dy * 0.005;
      targetRot.y = Math.max(-1.5, Math.min(1.5, targetRot.y)); // clamp pitch
      lastPos = { x, y };
    }
    function handleEnd() {
      isDragging = false;
    }

    const onMouseDown = (e) => handleStart(e.clientX, e.clientY);
    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onWheel = (e) => {
      targetZoom += e.deltaY * 0.002;
      // Smaller zoom = wider view. Larger zoom = narrower view (close to walls).
      targetZoom = Math.max(0.3, Math.min(6.0, targetZoom));
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 1 && !initialPinchDist) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (initialPinchDist) {
          const delta = dist - initialPinchDist; // push out to zoom in
          targetZoom += delta * 0.01;
          targetZoom = Math.max(0.3, Math.min(6.0, targetZoom));
          initialPinchDist = dist;
        }
      }
    };
    const onTouchEnd = (e) => {
      handleEnd();
      if (e.touches.length < 2) initialPinchDist = null;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("wheel", onWheel, { passive: true });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    function drawFrame(timeSeconds) {
      // Smooth easing for camera rotation and zoom
      camRot.x += (targetRot.x - camRot.x) * 0.1;
      camRot.y += (targetRot.y - camRot.y) * 0.1;
      camZoom += (targetZoom - camZoom) * 0.1;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayWidth = Math.floor(window.innerWidth * dpr);
      const displayHeight = Math.floor(window.innerHeight * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.uniform1f(locTime, timeSeconds);
      gl.uniform2f(locRes, canvas.width, canvas.height);
      gl.uniform2f(locCamRot, camRot.x, camRot.y);
      gl.uniform1f(locZoom, camZoom);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (reducedMotion) {
      // Accessibility: a single still frame, no animation loop.
      drawFrame(0);
    } else {
      const render = (time) => {
        if (disposed) return;
        if (contextGuard.isLost()) { rafId = requestAnimationFrame(render); return; } // frozen while the context is gone
        drawFrame(time * 0.001);
        rafId = requestAnimationFrame(render);
      };
      rafId = requestAnimationFrame(render);
    }

    return () => {
      disposed = true;
      contextGuard.dispose();
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
  }, []);

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
      aria-label="Interactive beehive"
    >
      {/* Ambient backdrop behind the WebGL canvas (shows at boot, before first frame) */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${BH_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.45,
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "1.25rem",
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255, 210, 120, 0.95)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "1.5rem",
          fontWeight: 700,
          letterSpacing: "0.35em",
          textTransform: "uppercase",
          textShadow: "0 2px 10px rgba(0,0,0,0.9)",
          pointerEvents: "none",
          textAlign: "center",
          paddingLeft: "0.35em",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
        }}
      >
        <HiveGlyph size={26} />
        Beehive
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "calc(4.5rem + env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255, 210, 120, 0.9)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "0.9rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          pointerEvents: "none",
          animation: "beehive-hint-fade 6s forwards 5s",
          padding: "0 1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,210,120,0.9)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6m0-2a1.5 1.5 0 0 1 3 0v2m0-1a1.5 1.5 0 0 1 3 0v4c0 3.5-2.5 6-6 6s-5-1.6-7-5l-1.6-2.8c-.5-.9.1-2 1.2-2.1.7 0 1.3.3 1.7.9L9 14" />
        </svg>
        <span>Drag to look around · scroll or pinch to zoom into the walls</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,210,120,0.9)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
        </svg>
      </div>
      <style>{`@keyframes beehive-hint-fade { to { opacity: 0; visibility: hidden; } }`}</style>
    </main>
  );
}
