// Generative ambient pad for The Pearl. Browser-only (WebAudio).
// Gesture-gated: call start() from a user gesture. No remote audio, no files.

export function freqForTarget(baseFreq) {
  return Number.isFinite(baseFreq) && baseFreq > 0 ? baseFreq : 110;
}

export function createAmbience() {
  let ctx = null;
  let master = null;
  let oscs = [];
  let muted = false;
  let started = false;

  function build(baseFreq) {
    const f = freqForTarget(baseFreq);
    // tear down old voices
    for (const o of oscs) {
      try { o.stop(); } catch (e) { /* already stopped */ }
      try { o.disconnect(); } catch (e) { /* already gone */ }
    }
    oscs = [];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    filter.connect(master);

    // slow filter sweep
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);

    // detuned pad voices: root, fifth, octave
    const ratios = [1, 1.5, 2, 2.02];
    for (const r of ratios) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * r;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(filter);
      o.start();
      oscs.push(o);
    }
  }

  return {
    start(baseFreq) {
      if (started) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      build(baseFreq);
      started = true;
    },
    retune(baseFreq) {
      if (!started || !ctx) return;
      build(baseFreq);
    },
    setMuted(m) {
      muted = m;
      if (master && ctx) {
        master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.2);
      }
    },
    isMuted() {
      return muted;
    },
    dispose() {
      for (const o of oscs) {
        try { o.stop(); } catch (e) { /* noop */ }
      }
      oscs = [];
      if (ctx) {
        try { ctx.close(); } catch (e) { /* noop */ }
      }
      started = false;
      ctx = null;
    },
  };
}
