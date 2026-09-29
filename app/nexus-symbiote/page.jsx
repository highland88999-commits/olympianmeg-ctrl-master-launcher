"use client";

import { useEffect, useRef, useState } from "react";
import { createEngine } from "./symbiote-engine";
import { paintFeed, SCENES, FEED_W, FEED_H } from "./demo-feed";

/**
 * Nexus Symbiote — a handheld "particle symbiote" that turns any moving
 * image into a living point cloud.
 *
 * Source audit: the original page phoned home to a hosted database (a central
 * telemetry table plus a silent per-minute ping), grabbed the visitor's IP
 * through a public IP-lookup service, and loaded three.js from a CDN.
 * All of that is gone here:
 *   - no telemetry, no IP lookup, no database keys
 *   - no CDN scripts — the particle shader is plain WebGL1 in symbiote-engine.js
 *   - the two bundled demo MP4s are NOT shipped; the "Demo feed" is painted
 *     procedurally (demo-feed.js) and looks like what those clips did
 *   - camera, microphone, file upload and canvas recording are local device
 *     APIs only — nothing ever leaves the browser
 */

const MATRIX_GLYPHS = "アカサタナハマヤラワ0123456789$#*+=<>/\\|";

export default function NexusSymbiotePage() {
  const [entered, setEntered] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [recState, setRecState] = useState("idle"); // idle | recording | ready
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [facing, setFacing] = useState("user");
  const [fx, setFx] = useState({ vortex: false, pulse: false, ripple: false });
  const [sceneName, setSceneName] = useState(SCENES[0].name);

  const matrixRef = useRef(null);
  const rainRef = useRef(null);
  const mainRef = useRef(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const engineRef = useRef(null);
  const sourceRef = useRef({ kind: "demo" }); // demo | upload | camera
  const queueRef = useRef([]);
  const qIdxRef = useRef(0);
  const reducedMotion = useRef(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // ---------- matrix rain on the landing ----------
  useEffect(() => {
    const canvas = matrixRef.current;
    if (!canvas) return;
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const cols = Math.floor(canvas.width / 18);
    const drops = Array.from({ length: cols }, () => Math.random() * -60);
    const glyphColors = ["#00ffcc", "#ff4dff", "#ffe14d", "#00ffff", "#ffffff"];
    let raf = 0;
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "15px monospace";
      for (let i = 0; i < cols; i++) {
        const ch =
          MATRIX_GLYPHS[(Math.random() * MATRIX_GLYPHS.length) | 0];
        ctx.fillStyle =
          glyphColors[(Math.random() * glyphColors.length) | 0];
        ctx.fillText(ch, i * 18, drops[i] * 18);
        if (drops[i] * 18 > canvas.height && Math.random() > 0.975)
          drops[i] = 0;
        drops[i]++;
      }
      if (!reducedMotion.current) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ---------- rain overlay inside the handheld ----------
  useEffect(() => {
    if (!entered) return;
    const canvas = rainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 360;
    canvas.height = 760;
    const drops = Array.from({ length: 28 }, () => ({
      x: Math.random() * 360,
      y: Math.random() * 760,
    }));
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, 360, 760);
      ctx.strokeStyle = "rgba(0,255,204,0.14)";
      ctx.lineWidth = 1;
      for (const d of drops) {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + 12);
        ctx.stroke();
        d.y += 11;
        if (d.y > 760) {
          d.y = -20;
          d.x = Math.random() * 360;
        }
      }
      if (!reducedMotion.current) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [entered]);

  // ---------- symbiote engine ----------
  useEffect(() => {
    if (!entered) return;
    const canvas = mainRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const engine = createEngine(canvas);
    engineRef.current = engine;
    if (!engine) return;

    const demoStart = performance.now();
    engine.setFeedSource((sCtx) => {
      const src = sourceRef.current;
      if (src.kind === "demo") {
        const elapsed = (performance.now() - demoStart) / 1000;
        paintFeed(sCtx, elapsed);
        const id = (() => {
          let acc = 0;
          const t = elapsed % 27;
          for (const s of SCENES) {
            acc += s.seconds;
            if (t < acc) return s.name;
          }
          return SCENES[0].name;
        })();
        setSceneName((prev) => (prev === id ? prev : id));
      } else if (video.readyState >= 2) {
        sCtx.drawImage(video, 0, 0, FEED_W, FEED_H);
      } else {
        sCtx.fillStyle = "#000";
        sCtx.fillRect(0, 0, FEED_W, FEED_H);
      }
    });
    engine.setEffects(fx);
    if (reducedMotion.current) {
      // one still frame only
      engine.setFeedSource((sCtx) => paintFeed(sCtx, 0));
      engine.start();
      const stopSoon = setTimeout(() => engine.stop(), 800);
      engineRef.current._stopSoon = stopSoon;
      return () => {
        clearTimeout(stopSoon);
        engine.stop();
      };
    }
    engine.start();
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  useEffect(() => {
    engineRef.current?.setEffects(fx);
  }, [fx]);

  // ---------- feed sources ----------
  const playNextUpload = () => {
    const q = queueRef.current;
    const video = videoRef.current;
    if (!q.length || !video) return;
    video.src = q[qIdxRef.current];
    video.play().catch(() => {});
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    stopCamera();
    queueRef.current = files.map((f) => URL.createObjectURL(f));
    qIdxRef.current = 0;
    sourceRef.current = { kind: "upload" };
    setCamOn(false);
    playNextUpload();
  };

  const stopCamera = () => {
    const video = videoRef.current;
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };

  const startCamera = async () => {
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) return;
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: micOn,
      });
      video.srcObject = stream;
      await video.play();
      sourceRef.current = { kind: "camera" };
      setCamOn(true);
    } catch {
      // camera unavailable — stay on the demo feed
    }
  };

  const toggleCamera = () => {
    if (camOn) {
      stopCamera();
      sourceRef.current = { kind: "demo" };
      setCamOn(false);
    } else {
      startCamera();
    }
  };

  const flipCamera = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    if (camOn) {
      setTimeout(startCamera, 0);
    }
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    if (camOn) setTimeout(startCamera, 0); // re-request stream with/without audio
  };

  const useDemo = () => {
    stopCamera();
    sourceRef.current = { kind: "demo" };
    setCamOn(false);
    if (videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  };

  // ---------- recording (local only) ----------
  const toggleRecord = () => {
    const btn = recorderRef.current;
    if (recState === "ready") {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nexus-symbiote.webm";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      chunksRef.current = [];
      setRecState("idle");
      return;
    }
    if (recState === "recording") {
      btn?.stop();
      setRecState("ready");
      return;
    }
    const engine = engineRef.current;
    const video = videoRef.current;
    if (!engine || !("MediaRecorder" in window)) return;
    try {
      const stream = engine.captureStream(30);
      if (micOn && video.srcObject) {
        const audio = video.srcObject.getAudioTracks();
        if (audio.length) stream.addTrack(audio[0]);
      }
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.start();
      setRecState("recording");
    } catch {
      // recording unsupported — stay idle
    }
  };

  const toggleFx = (key) => setFx((p) => ({ ...p, [key]: !p[key] }));

  const btn = (active) =>
    `nx-btn${active ? " active" : ""}`;

  return (
    <div className="nx-root">
      <style>{`
        .nx-root { background:#000; color:#fff; min-height:100dvh; font-family:'Courier New',monospace; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; }
        .nx-landing { position:fixed; inset:0; z-index:50; background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:opacity .5s; }
        .nx-landing.hidden { opacity:0; pointer-events:none; }
        .nx-landing canvas { position:absolute; inset:0; width:100%; height:100%; }
        .nx-brand { position:relative; text-align:center; padding:0 1rem; }
        .nx-brand h1 { font-size:clamp(1.4rem,6vw,2.2rem); letter-spacing:8px; color:#00ffcc; text-shadow:0 0 18px rgba(0,255,204,.8); margin:0 0 .6rem; }
        .nx-brand p { font-size:.7rem; letter-spacing:5px; opacity:.7; margin:0 0 1.4rem; }
        .nx-brand .tap { font-size:.8rem; letter-spacing:3px; color:#fff; opacity:.85; animation:nx-blink 1.6s infinite; }
        @keyframes nx-blink { 0%,100%{opacity:.85} 50%{opacity:.3} }
        .nx-handheld { position:relative; width:min(360px,94vw); background:#080808; border-radius:40px; border:1px solid rgba(0,255,204,.25); padding:14px; display:flex; flex-direction:column; box-shadow:0 0 40px rgba(0,0,0,.9); overflow:hidden; }
        .nx-rain { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.5; z-index:1; }
        .nx-screen { width:100%; aspect-ratio:3/4; background:#000; border-radius:20px; position:relative; overflow:hidden; margin-bottom:12px; border:1px solid #1a1a1a; z-index:2; }
        .nx-screen canvas { width:100%; height:100%; display:block; }
        .nx-scene { position:absolute; left:8px; bottom:6px; font-size:.6rem; letter-spacing:2px; color:#00ffcc; opacity:.8; z-index:3; background:rgba(0,0,0,.55); padding:2px 8px; border-radius:6px; }
        .nx-panel { position:relative; z-index:3; display:flex; flex-direction:column; gap:6px; }
        .nx-row { display:flex; gap:6px; }
        .nx-btn { flex:1; background:rgba(5,5,5,.95); border:1px solid #333; color:#00ffcc; padding:11px 2px; border-radius:8px; font-size:10px; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:1px; font-family:inherit; min-height:44px; display:flex; align-items:center; justify-content:center; text-align:center; }
        .nx-btn.active { background:#00ffcc; color:#000; box-shadow:0 0 10px rgba(0,255,204,.7); }
        .nx-btn.gold { border-color:#d4af37; color:#d4af37; width:100%; padding:12px; }
        .nx-btn.gold.active { background:#d4af37; color:#000; }
        .nx-btn:disabled { opacity:.45; cursor:default; }
        .nx-about { position:absolute; inset:0; z-index:10; background:rgba(2,4,6,.96); border-radius:40px; padding:26px 22px; overflow:auto; font-size:.78rem; line-height:1.55; }
        .nx-about h2 { color:#00ffcc; font-size:1rem; letter-spacing:3px; margin:0 0 .8rem; }
        .nx-about p { margin:0 0 .7rem; opacity:.9; }
        .nx-about .close { margin-top:1rem; }
        @media (prefers-reduced-motion: reduce) { .nx-brand .tap { animation:none; } }
      `}</style>

      <div
        className={`nx-landing${entered ? " hidden" : ""}`}
        onClick={() => setEntered(true)}
        role="button"
        aria-label="Enter Nexus Symbiote"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setEntered(true)}
      >
        <canvas ref={matrixRef} aria-hidden="true" />
        <div className="nx-brand">
          <h1>NEXUS SYMBIOTE</h1>
          <p>PARTICLE ORGANISM</p>
          <div className="tap">TAP TO WAKE IT</div>
        </div>
      </div>

      {entered && (
        <div className="nx-handheld">
          <canvas ref={rainRef} className="nx-rain" aria-hidden="true" />
          <div className="nx-screen">
            <canvas ref={mainRef} aria-label="Symbiote particle cloud" />
            <div className="nx-scene">
              {sourceRef.current.kind === "demo" ? `DEMO · ${sceneName}` : sourceRef.current.kind === "camera" ? "LIVE CAMERA" : "YOUR CLIP"}
            </div>
          </div>
          <div className="nx-panel">
            <div className="nx-row">
              <label htmlFor="nx-upload" className={btn(false)}>
                Upload
              </label>
              <button className={btn(camOn)} onClick={toggleCamera}>
                Cam
              </button>
              <button className={btn(false)} onClick={flipCamera} aria-label="Flip camera">
                Flip
              </button>
              <button className={btn(micOn)} onClick={toggleMic}>
                Mic
              </button>
            </div>
            <div className="nx-row">
              <button
                className={btn(fx.vortex)}
                onClick={() => toggleFx("vortex")}
              >
                Vortex
              </button>
              <button
                className={btn(fx.pulse)}
                onClick={() => toggleFx("pulse")}
              >
                Pulse
              </button>
              <button
                className={btn(fx.ripple)}
                onClick={() => toggleFx("ripple")}
              >
                Ripple
              </button>
            </div>
            <div className="nx-row">
              <button className={btn(false)} onClick={useDemo}>
                Demo feed
              </button>
              <button className={btn(recState === "recording")} onClick={toggleRecord}>
                {recState === "idle" && "Record"}
                {recState === "recording" && "Stop"}
                {recState === "ready" && "Download"}
              </button>
            </div>
            <button className="nx-btn gold" onClick={() => setShowAbout(true)}>
              What is this?
            </button>
          </div>

          {showAbout && (
            <div className="nx-about" role="dialog" aria-label="About Nexus Symbiote">
              <h2>NEXUS SYMBIOTE</h2>
              <p>
                The symbiote turns any moving image into a living cloud of
                coloured points. Bright pixels push their points forward;
                dark pixels fade away.
              </p>
              <p>
                <strong>Demo feed:</strong> the original page shipped two
                sample video files. This build paints the same ideas live
                instead — kinetic neon words, a plasma bloom, and waveform
                rings — so nothing large ever downloads.
              </p>
              <p>
                <strong>Upload</strong> plays one of your own video files
                through it. <strong>Cam</strong> uses your camera.
                <strong>Vortex / Pulse / Ripple</strong> bend the cloud.
                <strong>Record</strong> saves what you see as a video file.
              </p>
              <p>
                Everything runs on your device. No accounts, no uploads to
                anyone, no tracking.
              </p>
              <button
                className="nx-btn gold close"
                onClick={() => setShowAbout(false)}
              >
                Back to the symbiote
              </button>
              {/* Safari bottom-bar clearance */}
              <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))] shrink-0" />
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        id="nx-upload"
        type="file"
        accept="video/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFiles}
      />
      <video
        ref={videoRef}
        playsInline
        muted={!micOn}
        style={{ display: "none" }}
        onEnded={() => {
          const q = queueRef.current;
          if (q.length > 1) {
            qIdxRef.current = (qIdxRef.current + 1) % q.length;
            playNextUpload();
          }
        }}
      />
    </div>
  );
}
