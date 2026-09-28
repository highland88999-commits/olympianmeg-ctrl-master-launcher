"use client";

import { useEffect, useRef, useState } from "react";
import {
  SCHOOLS,
  LESSONS,
  lessonsForSchool,
  getProgress,
  toggleCompleted,
  loadProgress,
  saveProgress,
} from "./curriculum";

/**
 * Olympian Education — three schools of learning drifting as orbital orbs
 * around a central oracle shield. Tap a lesson orb to open its lesson.
 *
 * Source audit: the original page phoned home to a hosted database (a central
 * telemetry table plus a silent per-minute ping), grabbed the visitor's IP
 * through a public IP-lookup service, played a hotlinked background video,
 * and opened external school websites inside iframes. All of that is gone:
 *   - no telemetry, no IP lookup, no database keys, no CDN scripts
 *   - no remote iframes, no hotlinked video, no external links at all
 *   - lessons are written for this module; progress stays on the device
 */

const SHORT_LABEL = {
  socratic: "SOCRATIC METHOD",
  democracy: "DEMOCRACY",
  alphabet: "GREEK ALPHABET",
  stoicism: "STOICISM",
  pythagoras: "PYTHAGORAS",
  nightsky: "NIGHT SKY",
  levers: "LEVERS",
  watercycle: "WATER CYCLE",
  binary: "BINARY",
  algorithms: "ALGORITHMS",
  webpage: "FIRST WEB PAGE",
  pixels: "LIGHT & PIXELS",
};

export default function OlympianEducationPage() {
  const bgRef = useRef(null);
  const containerRef = useRef(null);
  const oracleRef = useRef(null);
  const [panel, setPanel] = useState(null); // {type:'lesson', lesson} | {type:'overview'}
  const [completed, setCompleted] = useState([]);
  const completedRef = useRef(completed);
  completedRef.current = completed;
  const panelRef = useRef(panel);
  panelRef.current = panel;

  useEffect(() => {
    setCompleted(loadProgress(localStorage));
  }, []);

  const openLesson = (lesson) => setPanel({ type: "lesson", lesson });
  const openOverview = () => setPanel({ type: "overview" });
  const closePanel = () => setPanel(null);
  const openLessonRef = useRef(openLesson);
  openLessonRef.current = openLesson;
  const openOverviewRef = useRef(openOverview);
  openOverviewRef.current = openOverview;

  const toggleDone = (id) => {
    setCompleted((prev) => {
      const next = toggleCompleted(prev, id);
      saveProgress(localStorage, next);
      return next;
    });
  };

  const resetProgress = () => {
    setCompleted([]);
    saveProgress(localStorage, []);
  };

  // ---------- background: starfield + grid tunnel (replaces hotlinked video) ----------
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() * 1.6 + 0.4,
      tw: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    let t = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#00050a";
      ctx.fillRect(0, 0, w, h);
      // grid tunnel lines drifting toward viewer
      ctx.strokeStyle = "rgba(0,242,255,0.05)";
      ctx.lineWidth = 1;
      const cx = w / 2;
      const cy = h / 2;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + t * 0.02;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h);
        ctx.stroke();
      }
      for (const st of stars) {
        const a = 0.35 + Math.abs(Math.sin(t * 0.8 + st.tw)) * 0.65;
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
      }
      if (!reduced) {
        t += 0.016;
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ---------- orbital physics (ported from the source's orb engine) ----------
  useEffect(() => {
    const container = containerRef.current;
    const oracle = oracleRef.current;
    if (!container || !oracle) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = window.innerWidth;
    let H = window.innerHeight;
    const ORB_R = Math.max(84, Math.min(120, W * 0.17));
    const ORACLE_R = Math.min(140, Math.max(90, Math.min(W, H) * 0.19));
    oracle.style.width = `${ORACLE_R * 2}px`;
    oracle.style.height = `${ORACLE_R * 2}px`;

    const bigOrbs = [];

    function createSpark(x, y, color) {
      for (let i = 0; i < 3; i++) {
        const s = document.createElement("div");
        s.className = "oe-spark";
        s.style.setProperty("--spark-color", color);
        s.style.transform = `translate(${x}px, ${y}px) rotate(${Math.random() * 360}deg)`;
        container.appendChild(s);
        setTimeout(() => s.remove(), 450);
      }
    }

    class LessonOrb {
      constructor(lesson, parent, color) {
        this.lesson = lesson;
        this.parent = parent;
        this.radius = 34;
        this.relX = (Math.random() - 0.5) * 90;
        this.relY = (Math.random() - 0.5) * 90;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.el = document.createElement("button");
        this.el.className = "oe-lesson-orb";
        this.el.style.setProperty("--m-color", color);
        this.el.textContent = SHORT_LABEL[lesson.id] || lesson.title.toUpperCase();
        this.el.setAttribute("aria-label", `Open lesson: ${lesson.title}`);
        this.el.addEventListener("click", (e) => {
          e.stopPropagation();
          openLessonRef.current(lesson);
        });
        container.appendChild(this.el);
      }
      update(px, py, pr) {
        this.vx += (Math.random() - 0.5) * 0.2;
        this.vy += (Math.random() - 0.5) * 0.2;
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 1.5) {
          this.vx *= 0.9;
          this.vy *= 0.9;
        }
        this.relX += this.vx;
        this.relY += this.vy;
        const dist = Math.hypot(this.relX, this.relY);
        if (dist > pr - this.radius) {
          const angle = Math.atan2(this.relY, this.relX);
          this.relX = Math.cos(angle) * (pr - this.radius);
          this.relY = Math.sin(angle) * (pr - this.radius);
          this.vx *= -0.8;
          this.vy *= -0.8;
          if (Math.abs(this.vx) > 0.5 || Math.abs(this.vy) > 0.5) {
            createSpark(px + this.relX, py + this.relY, this.parent.color);
          }
        }
        this.el.style.transform = `translate3d(${px + this.relX - this.radius}px, ${py + this.relY - this.radius}px, 0)`;
      }
      destroy() {
        this.el.remove();
      }
    }

    class SchoolOrb {
      constructor(school) {
        this.school = school;
        this.color = school.color;
        this.radius = ORB_R;
        this.x = Math.max(this.radius, Math.random() * Math.max(W - this.radius * 2, this.radius * 2));
        this.y = Math.max(this.radius, Math.random() * Math.max(H - this.radius * 2, this.radius * 2));
        this.vx = (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random());
        this.vy = (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random());
        this.el = document.createElement("div");
        this.el.className = "oe-school-orb";
        this.el.style.width = `${this.radius * 2}px`;
        this.el.style.height = `${this.radius * 2}px`;
        this.el.style.setProperty("--m-color", school.color);
        const label = document.createElement("div");
        label.className = "oe-school-label";
        label.textContent = school.name.toUpperCase();
        this.el.appendChild(label);
        container.appendChild(this.el);
        this.children = lessonsForSchool(school.id).map(
          (l) => new LessonOrb(l, this, school.color)
        );
      }
      update() {
        const speed = Math.hypot(this.vx, this.vy);
        if (speed < 0.8) {
          this.vx += (Math.random() - 0.5) * 0.1;
          this.vy += (Math.random() - 0.5) * 0.1;
        } else if (speed > 2.0) {
          this.vx *= 0.98;
          this.vy *= 0.98;
        }
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < this.radius) { this.x = this.radius; this.vx *= -1; }
        if (this.x > W - this.radius) { this.x = W - this.radius; this.vx *= -1; }
        if (this.y < this.radius) { this.y = this.radius; this.vy *= -1; }
        if (this.y > H - this.radius) { this.y = H - this.radius; this.vy *= -1; }
        // bounce off the oracle shield
        const dx = this.x - W / 2;
        const dy = this.y - H / 2;
        const dist = Math.hypot(dx, dy);
        if (dist < this.radius + ORACLE_R && dist > 0.001) {
          const angle = Math.atan2(dy, dx);
          this.x = W / 2 + Math.cos(angle) * (this.radius + ORACLE_R);
          this.y = H / 2 + Math.sin(angle) * (this.radius + ORACLE_R);
          const sp = Math.hypot(this.vx, this.vy) || 1;
          this.vx = Math.cos(angle) * sp;
          this.vy = Math.sin(angle) * sp;
        }
        this.el.style.transform = `translate3d(${this.x - this.radius}px, ${this.y - this.radius}px, 0)`;
        this.children.forEach((c) => c.update(this.x, this.y, this.radius));
      }
      destroy() {
        this.children.forEach((c) => c.destroy());
        this.el.remove();
      }
    }

    function resolveCollisions() {
      for (let i = 0; i < bigOrbs.length; i++) {
        for (let j = i + 1; j < bigOrbs.length; j++) {
          const b1 = bigOrbs[i];
          const b2 = bigOrbs[j];
          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const distance = Math.hypot(dx, dy) || 0.001;
          const minDistance = b1.radius + b2.radius + 5;
          if (distance < minDistance) {
            const overlap = minDistance - distance;
            const nx = dx / distance;
            const ny = dy / distance;
            b1.x -= (nx * overlap) / 2;
            b1.y -= (ny * overlap) / 2;
            b2.x += (nx * overlap) / 2;
            b2.y += (ny * overlap) / 2;
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const dot = kx * nx + ky * ny;
            b1.vx -= dot * nx;
            b1.vy -= dot * ny;
            b2.vx += dot * nx;
            b2.vy += dot * ny;
          }
        }
      }
    }

    SCHOOLS.forEach((s) => bigOrbs.push(new SchoolOrb(s)));

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      bigOrbs.forEach((b) => {
        if (b.x < b.radius) b.x = b.radius;
        if (b.x > W - b.radius) b.x = W - b.radius;
        if (b.y < b.radius) b.y = b.radius;
        if (b.y > H - b.radius) b.y = H - b.radius;
      });
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const loop = () => {
      bigOrbs.forEach((b) => b.update());
      resolveCollisions();
      raf = requestAnimationFrame(loop);
    };
    if (reduced) {
      bigOrbs.forEach((b) => b.update());
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      bigOrbs.forEach((b) => b.destroy());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = getProgress(completed);
  const activeLesson = panel?.type === "lesson" ? panel.lesson : null;
  const activeSchool =
    activeLesson && SCHOOLS.find((s) => s.id === activeLesson.school);

  return (
    <div className="oe-root">
      <style>{`
        .oe-root { position:fixed; inset:0; background:#00050a; overflow:hidden; font-family:'Courier New',monospace; color:#fff; }
        .oe-bg { position:absolute; inset:0; width:100%; height:100%; }
        .oe-oracle { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); border-radius:50%; border:4px solid #d4af37; box-shadow:0 0 50px rgba(212,175,55,.3); z-index:10; cursor:pointer; background:radial-gradient(circle, rgba(212,175,55,.12), transparent 70%); display:flex; align-items:center; justify-content:center; font-size:.65rem; letter-spacing:3px; color:#d4af37; text-align:center; padding:1rem; font-family:inherit; }
        .oe-oracle:hover { box-shadow:0 0 70px rgba(212,175,55,.5); }
        .oe-container { position:absolute; inset:0; z-index:20; pointer-events:none; overflow:hidden; }
        .oe-school-orb { position:absolute; top:0; left:0; border:2px dashed color-mix(in srgb, var(--m-color) 55%, transparent); border-radius:50%; background:radial-gradient(circle, rgba(255,255,255,.05), transparent 80%); will-change:transform; display:flex; align-items:center; justify-content:center; }
        .oe-school-label { font-size:.6rem; letter-spacing:3px; color:var(--m-color); opacity:.85; text-align:center; padding:0 1rem; pointer-events:none; }
        .oe-lesson-orb { position:absolute; top:0; left:0; width:68px; height:68px; background:radial-gradient(circle at 30% 30%, rgba(255,255,255,.22), rgba(0,0,0,.95)); border:1px solid var(--m-color); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:.42rem; font-weight:bold; cursor:pointer; pointer-events:auto; box-shadow:0 0 15px var(--m-color); text-align:center; padding:6px; will-change:transform; font-family:inherit; line-height:1.3; }
        .oe-lesson-orb:active { transform:scale(.9); }
        .oe-spark { position:absolute; top:0; left:0; background:#fff; width:2px; height:20px; box-shadow:0 0 10px var(--spark-color,#d4af37); pointer-events:none; animation:oe-spark-fade .45s ease-out forwards; }
        @keyframes oe-spark-fade { 0%{opacity:1} 100%{opacity:0} }
        .oe-holo { position:fixed; inset:15px; z-index:100; background:rgba(8,8,25,.96); border:2px solid #00f2ff; border-radius:20px; display:flex; flex-direction:column; overflow:hidden; max-width:640px; margin:0 auto; }
        .oe-holo-head { padding:14px 16px; display:flex; justify-content:space-between; align-items:center; font-size:.75rem; color:#00f2ff; letter-spacing:2px; border-bottom:1px solid rgba(0,242,255,.2); background:rgba(0,0,0,.5); gap:.8rem; }
        .oe-holo-body { padding:1.1rem 1.2rem 1.4rem; overflow:auto; font-size:.85rem; line-height:1.65; }
        .oe-holo-body h2 { margin:0 0 .3rem; font-size:1.15rem; letter-spacing:1px; }
        .oe-holo-body .oe-min { color:#9a9a9a; font-size:.72rem; letter-spacing:2px; margin-bottom:.8rem; }
        .oe-holo-body ul { padding-left:1.1rem; margin:.4rem 0 1rem; }
        .oe-holo-body li { margin-bottom:.5rem; }
        .oe-try { border-left:3px solid #d4af37; padding:.4rem .8rem; background:rgba(212,175,55,.07); border-radius:0 8px 8px 0; margin-bottom:1rem; }
        .oe-btn { cursor:pointer; font-family:inherit; border-radius:10px; padding:.75rem 1.2rem; font-size:.8rem; letter-spacing:2px; min-height:44px; }
        .oe-btn-gold { background:transparent; border:1px solid #d4af37; color:#d4af37; }
        .oe-btn-gold.done { background:#d4af37; color:#000; font-weight:bold; }
        .oe-btn-quiet { background:none; border:none; color:#d4af37; letter-spacing:2px; }
        .oe-progress-row { margin:.9rem 0; }
        .oe-progress-row .oe-row-head { display:flex; justify-content:space-between; font-size:.75rem; letter-spacing:1px; margin-bottom:.35rem; }
        .oe-bar { height:10px; background:#1a1a1a; border-radius:999px; overflow:hidden; border:1px solid #333; }
        .oe-bar > div { height:100%; border-radius:999px; transition:width .4s; }
        .oe-overall { text-align:center; font-size:1.6rem; color:#ffd700; margin:.4rem 0 1rem; letter-spacing:2px; }
        @media (prefers-reduced-motion: reduce) { .oe-spark { animation:none; opacity:0; } }
      `}</style>

      <canvas ref={bgRef} className="oe-bg" aria-hidden="true" />
      <button
        ref={oracleRef}
        className="oe-oracle"
        onClick={openOverview}
        aria-label="Open your learning progress"
      >
        <span>
          ORACLE
          <br />
          {progress.totalDone}/{progress.total}
        </span>
      </button>
      <div ref={containerRef} className="oe-container" />

      {panel && (
        <div className="oe-holo" role="dialog" aria-modal="true" aria-label={activeLesson ? activeLesson.title : "Your progress"}>
          <div className="oe-holo-head">
            <span>
              {activeLesson
                ? `LESSON // ${activeSchool.name.toUpperCase()}`
                : "ORACLE // YOUR PROGRESS"}
            </span>
            <button className="oe-btn-quiet" onClick={closePanel} aria-label="Close panel">
              [ CLOSE ]
            </button>
          </div>
          <div className="oe-holo-body">
            {activeLesson ? (
              <>
                <h2 style={{ color: activeSchool.color }}>{activeLesson.title}</h2>
                <div className="oe-min">
                  {activeLesson.minutes} MIN READ · {activeSchool.name.toUpperCase()}
                </div>
                <p>{activeLesson.intro}</p>
                <ul>
                  {activeLesson.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                <div className="oe-try">
                  <strong>Try it: </strong>
                  {activeLesson.tryIt}
                </div>
                <button
                  className={`oe-btn oe-btn-gold${completed.includes(activeLesson.id) ? " done" : ""}`}
                  onClick={() => toggleDone(activeLesson.id)}
                >
                  {completed.includes(activeLesson.id)
                    ? "✓ COMPLETED — TAP TO UNDO"
                    : "MARK AS COMPLETE"}
                </button>
              </>
            ) : (
              <>
                <div className="oe-overall">
                  {progress.overallPct}% COMPLETE
                </div>
                {SCHOOLS.map((s) => {
                  const p = progress.bySchool[s.id];
                  return (
                    <div className="oe-progress-row" key={s.id}>
                      <div className="oe-row-head">
                        <span style={{ color: s.color }}>{s.name.toUpperCase()}</span>
                        <span>
                          {p.done}/{p.total} · {p.pct}%
                        </span>
                      </div>
                      <div className="oe-bar">
                        <div style={{ width: `${p.pct}%`, background: s.color }} />
                      </div>
                      <div style={{ fontSize: ".72rem", color: "#9a9a9a", marginTop: ".3rem" }}>
                        {s.tagline}
                      </div>
                    </div>
                  );
                })}
                <p style={{ fontSize: ".75rem", color: "#9a9a9a" }}>
                  Progress is saved on this device only. Nothing is sent anywhere.
                </p>
                <button className="oe-btn oe-btn-gold" onClick={resetProgress}>
                  START OVER
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
