// OLYMPIAN MONSTERVERSE — procedural roar audio (browser only).
//
// No audio assets exist for the monsters, so roars are
// synthesized: a low oscillator at the tone's base frequency
// plus filtered noise, shaped by the tone's length. Distinct
// tones stay distinct because they come from behavior.js
// ROAR_TONES, where (baseHz, waveform) is unique per monster.
// Everything is guarded: no AudioContext is created until the
// first call (after user interaction, so autoplay rules are
// satisfied), and any failure is silent — a roar that cannot
// play is a missing sound, never a crash.

let ctx = null;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

export function playRoarTone(tone) {
  try {
    if (!tone) return;
    const ac = ensureCtx();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const t0 = ac.currentTime;
    const dur = Math.max(0.3, Math.min(3, tone.seconds || 1.4));
    const osc = ac.createOscillator();
    osc.type = tone.waveform || 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, tone.baseHz || 70), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, (tone.baseHz || 70) * 0.6), t0 + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t0);
    filter.frequency.exponentialRampToValueAtTime(200, t0 + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    // Roar audio is enhancement, never requirement.
  }
}
