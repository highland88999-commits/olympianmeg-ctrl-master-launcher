'use client';

// Broadcast studio — the keeper's mic, inside the ARES console.
//
// Hold the mic button, speak, release: the clip goes through the voice
// changer and out to every user on the site. Only the keeper can send —
// the API routes enforce that server-side; this panel only renders inside
// the owner-gated ARES console. Listeners hear it through the site-wide
// BroadcastListener banner, seconds after release (polling, not live
// streaming — a live relay is a later step).
//
// Voice changer, honestly: Deep/High shift pitch through a small worklet;
// Robot adds distortion. If the worklet fails to load, the broadcast still
// goes out in the original voice rather than failing.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRadio } from '@/components/radio/RadioProvider';
import { isFxEnabled, setFxEnabled } from '@/lib/fx';
import { collectPlayingMedia, resumeMedia } from '@/lib/broadcast/intercom-mute';
import {
  BROADCAST_MAX_SECONDS,
  BROADCAST_PRESETS,
  normalizeAudioType,
  pickMime,
} from '@/lib/broadcast/voice-changer';

function distortionCurve(amount = 40) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export default function BroadcastStudio() {
  const [preset, setPreset] = useState('deep');
  const [monitor, setMonitor] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [lastSent, setLastSent] = useState(null);
  const [sentAudioUrl, setSentAudioUrl] = useState(null);
  const radio = useRadio();
  const playingRef = useRef(false);
  const duckRef = useRef(null);

  useEffect(() => { playingRef.current = !!radio.playing; }, [radio.playing]);

  // Intercom duck: quiet everything else while the keeper speaks, restore
  // only what this duck changed when the voice ends.
  function duckSounds() {
    if (duckRef.current) return;
    const fxWas = isFxEnabled();
    try { setFxEnabled(false); } catch {}
    const radioWasPlaying = playingRef.current;
    if (radioWasPlaying) {
      try { radio.togglePlay(); } catch {}
    }
    duckRef.current = {
      fxWas,
      radioWasPlaying,
      media: collectPlayingMedia(null),
    };
  }

  function restoreSounds() {
    const d = duckRef.current;
    if (!d) return;
    duckRef.current = null;
    try {
      if (!isFxEnabled() && d.fxWas) setFxEnabled(true);
    } catch {}
    if (d.radioWasPlaying && !playingRef.current) {
      try { radio.togglePlay(); } catch {}
    }
    resumeMedia(d.media);
  }

  const holdingRef = useRef(false);
  const sessionRef = useRef(0);
  const discardRef = useRef(false);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const capTimerRef = useRef(null);
  const meterRafRef = useRef(null);
  const meterRef = useRef(null);
  const analyserRef = useRef(null);
  const unlockAudioRef = useRef(null);
  const sentAudioRef = useRef(null);

  useEffect(() => () => {
    holdingRef.current = false;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctxRef.current?.close(); } catch {}
    try { sentAudioRef.current?.pause(); } catch {}
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
  }, []);

  function drawMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
    if (meterRef.current) meterRef.current.style.width = `${Math.round(level * 100)}%`;
    meterRafRef.current = requestAnimationFrame(drawMeter);
  }

  // Audio unlock (the feedback fix): iOS Safari keeps a fresh
  // AudioContext suspended until a user gesture resumes it, and a
  // <audio> element will not play after async work until some audio
  // has played inside a gesture. Both unlocks happen here, inside the
  // press gesture, BEFORE any await — creating the context after
  // getUserMedia resolves is too late, and that is why the monitor
  // stayed silent even with the checkbox on.
  function ensureAudioContext() {
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (ctxRef.current.state === 'suspended') {
        const p = ctxRef.current.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch {}
  }

  function unlockAudioForPlayback() {
    try {
      if (!unlockAudioRef.current) {
        const el = new Audio();
        // 0.1s of silence: playing it inside the gesture unlocks this
        // page's media playback, so the post-send playback below is
        // allowed even though it runs after the async upload.
        el.src = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';
        el.volume = 0;
        unlockAudioRef.current = el;
      }
      const p = unlockAudioRef.current.play();
      if (p && p.catch) p.catch(() => {});
    } catch {}
  }

  async function startSession() {
    if (holdingRef.current) return;
    holdingRef.current = true;
    duckSounds();
    discardRef.current = false;
    const session = ++sessionRef.current;
    setStatus('starting');
    setMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== sessionRef.current || !holdingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      // Reuse the gesture-unlocked context when there is one; a closed
      // context from a previous session can never resume, so replace it.
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctxRef.current = ctx;
      }
      try { await ctx.resume(); } catch {}
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const destination = ctx.createMediaStreamDestination();
      const presetDef = BROADCAST_PRESETS[preset] || BROADCAST_PRESETS.original;
      let head = source;
      if (presetDef.pitch !== 1) {
        try {
          await ctx.audioWorklet.addModule('/worklets/pitch-shift-processor.js');
          const shifter = new AudioWorkletNode(ctx, 'pitch-shift', {
            parameterData: { pitch: presetDef.pitch },
          });
          head.connect(shifter);
          head = shifter;
        } catch {
          // Changer unavailable: fall through in the original voice.
        }
      }
      if (presetDef.robot) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = distortionCurve();
        head.connect(shaper);
        head = shaper;
      }
      head.connect(analyser);
      analyser.connect(destination);
      if (monitor) {
        const monitorGain = ctx.createGain();
        monitorGain.gain.value = 0.8;
        analyser.connect(monitorGain);
        monitorGain.connect(ctx.destination);
      }
      const mime = pickMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']);
      const recorder = mime ? new MediaRecorder(destination.stream, { mimeType: mime }) : new MediaRecorder(destination.stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => { void finishSession(session); };
      startTimeRef.current = Date.now();
      recorder.start(250);
      setStatus('holding');
      meterRafRef.current = requestAnimationFrame(drawMeter);
      capTimerRef.current = setTimeout(() => {
        if (holdingRef.current) {
          setMessage('2-minute cap reached — sending what you said.');
          stopSession();
        }
      }, BROADCAST_MAX_SECONDS * 1000);
    } catch {
      holdingRef.current = false;
      restoreSounds();
      setStatus('error');
      setMessage('Microphone unavailable. Allow mic access and try again.');
    }
  }

  function stopSession() {
    holdingRef.current = false;
    restoreSounds();
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
    if (meterRef.current) meterRef.current.style.width = '0%';
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      void finishSession(sessionRef.current, true);
    }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
  }

  // Cancel recording and start over: discard this take entirely — the
  // release handler must not send it. The discard flag was already
  // wired into finishSession; cancel sets it, stops the session, and
  // puts the panel back to idle so the next hold starts fresh.
  function cancelSession() {
    if (!holdingRef.current) return;
    discardRef.current = true;
    setStatus('idle');
    setMessage('Recording cancelled — hold to speak when ready.');
    stopSession();
  }

  async function finishSession(session, alreadyStopped = false) {
    const durationMs = Date.now() - (startTimeRef.current || Date.now());
    try { ctxRef.current?.close(); } catch {}
    ctxRef.current = null;
    if (discardRef.current || session !== sessionRef.current) return;
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' });
    chunksRef.current = [];
    if (alreadyStopped || durationMs < 500 || blob.size === 0) {
      setStatus('idle');
      if (durationMs < 500 && durationMs > 0) setMessage('Too short — hold the button while you speak.');
      return;
    }
    setStatus('uploading');
    setMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Sign in first.');
      const contentType = normalizeAudioType(blob.type) || 'audio/webm';
      const upRes = await fetch('/api/broadcasts/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contentType, sizeBytes: blob.size }),
      });
      const up = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !up.token || !up.path) throw new Error(up.error || 'Upload was not set up.');
      const { error: upErr } = await supabase.storage.from('broadcasts').uploadToSignedUrl(up.path, up.token, blob);
      if (upErr) throw new Error('Clip did not upload.');
      const pubRes = await fetch('/api/broadcasts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path: up.path, preset, durationMs }),
      });
      const pub = await pubRes.json().catch(() => ({}));
      if (!pubRes.ok || !pub.ok) throw new Error(pub.error || 'Broadcast did not publish.');
      setStatus('done');
      setLastSent(pub.latest);
      setMessage('Broadcast sent — every user on the site will hear it.');
      // Feedback after send: play the sent clip back on this device, so
      // the keeper hears what went out. The listener on this page must
      // not play it a second time, so the sent id is flagged for it.
      try { localStorage.setItem('broadcast-self-sent', pub.latest.id); } catch {}
      setSentAudioUrl(pub.latest.audioUrl);
      duckSounds();
      try {
        const el = sentAudioRef.current;
        if (el) {
          el.src = pub.latest.audioUrl;
          const p = el.play();
          if (p && p.catch) p.catch(() => {});
        }
      } catch {}
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Broadcast failed. Try again.');
    }
  }

  function pressStart(e) {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    ensureAudioContext();
    unlockAudioForPlayback();
    void startSession();
  }

  function pressEnd(e) {
    if (e) e.preventDefault();
    if (holdingRef.current) stopSession();
  }

  const holding = status === 'holding' || status === 'starting';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Intercom // All systems</p>
      <p className="text-xs leading-relaxed text-zinc-400">
        Hold the mic button, speak, release — your voice, through the changer,
        goes out to every user on the site. While you hold, every other sound
        on your page quiets; listeners hear your voice with their sounds
        muted until it ends. Only you can send; everyone hears.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(BROADCAST_PRESETS).map(([key, def]) => (
          <button key={key} type="button" onClick={() => setPreset(key)} disabled={holding}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${preset === key ? 'border-sky-400 bg-sky-900 text-sky-100' : 'border-zinc-700 bg-zinc-900 text-zinc-300'} disabled:opacity-50`}>
            {def.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <input type="checkbox" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} disabled={holding} />
        Hear my changed voice while I speak (headphones recommended)
      </label>
      <button
        type="button"
        onPointerDown={pressStart}
        onPointerUp={pressEnd}
        onPointerCancel={pressEnd}
        onPointerLeave={pressEnd}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === ' ') { e.preventDefault(); ensureAudioContext(); unlockAudioForPlayback(); void startSession(); }
          if (e.key === 'Escape' && holding) { e.preventDefault(); cancelSession(); }
        }}
        onKeyUp={(e) => { if (e.key === ' ') { e.preventDefault(); pressEnd(); } }}
        className={`touch-none select-none rounded-xl px-6 py-4 text-sm font-black uppercase tracking-widest ${holding ? 'bg-red-500 text-white' : 'bg-sky-400 text-black'}`}>
        {holding ? '● Speaking — release to send' : 'Hold to speak'}
      </button>
      {holding && (
        <button type="button" onClick={cancelSession}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Cancel recording
        </button>
      )}
      <audio
        ref={sentAudioRef}
        preload="none"
        className="hidden"
        onEnded={() => restoreSounds()}
        onPause={() => restoreSounds()}
      />
      {sentAudioUrl && (
        <button type="button"
          onClick={() => {
            const el = sentAudioRef.current;
            if (!el) return;
            duckSounds();
            el.src = sentAudioUrl;
            const p = el.play();
            if (p && p.catch) p.catch(() => {});
          }}
          className="rounded-lg border border-sky-700 bg-sky-950 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sky-200">
          Hear it back
        </button>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div ref={meterRef} className="h-full rounded-full bg-sky-400" style={{ width: '0%' }} />
      </div>
      {message && <p className={`text-xs ${status === 'error' ? 'text-red-400' : 'text-zinc-400'}`}>{message}</p>}
      {lastSent && (
        <p className="font-mono text-xs text-zinc-500">
          Last broadcast: {lastSent.preset} · {Math.round(lastSent.durationMs / 1000)}s · {new Date(lastSent.createdAt).toLocaleTimeString()}
        </p>
      )}
      <p className="text-[11px] text-zinc-600">
        Clips cap at 2 minutes. Delivery is polling, so users hear a broadcast seconds after release, not instantly.
      </p>
    </div>
  );
}
