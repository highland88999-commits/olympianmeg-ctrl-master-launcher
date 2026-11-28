// lib/ares/prison-video.js — the ARES Prison cell screens (Merlin, Nov 27, 2026).
//
// THE 3 CELL VIDEOS ("the 3 non area related videos" — not tied to any
// prison area; they play across all cells):
//   V0 volcanic-storm-earth — 10 s, silent (the Earth 1 batch-2 file, reused)
//   V1 volcanic-storm-sky  — 10 s, silent (the Earth 1 batch-2 file, reused)
//   V2 marvel-christmas    — 25.33 s, WITH audio (the new cut Merlin sent)
//
// ONE LOAD, MULTIPLE INSTANCES, ALTERNATING, BACK-TO-BACK LOOP:
//   - Each video loads ONCE: exactly 3 video elements + 3 video textures
//     exist, however many cells there are. A screen never owns a load.
//   - Alternation: the screen for cell index i STARTS at video (i % 3),
//     so neighbouring cells show different videos.
//   - Back-to-back loop: each screen cycles its videos in sequence
//     0 → 1 → 2 → 0, driven by the shared elements' 'ended' events —
//     never a fixed tick, nothing cut short. A screen joins its next
//     video mid-stream; that is what back-to-back means here.
//   - In-range (the billboard rule, components/GodTower.jsx): a video
//     plays only while at least one VISIBLE screen shows it; otherwise
//     it pauses and keeps its currentTime, resuming from where it
//     paused when a screen comes back into view.
//
// SOUND — ONE SOURCE, THE USER'S DEVICE: only V2 carries audio, and
// its element is the only stream ever unmuted. V0/V1 are always muted
// (they are silent files anyway). Mute toggles that one stream.
// iOS needs a user gesture before audio plays, so the stream starts
// muted until the first pointerdown unlocks it — the default is sound
// ON once the keeper has tapped (Merlin's call to change).
//
// Node-safe and DOM-free: the pool takes video/texture factories, so
// the node suite can drive it with fakes and prove one-load,
// alternation, the loop, the play/pause gate and the mute. The 3D
// scene (app/ares/prison/world3d.jsx) passes the real factories
// (document.createElement('video'), THREE.VideoTexture).

export const PRISON_CELL_VIDEOS = [
  { src: '/videos/ares-prison/volcanic-storm-earth.mp4', durationS: 10, hasAudio: false },
  { src: '/videos/ares-prison/volcanic-storm-sky.mp4', durationS: 10, hasAudio: false },
  { src: '/videos/ares-prison/marvel-christmas.mp4', durationS: 25.33, hasAudio: true },
];

/** The screen plane every cell screen wears (16:9, metres). */
export const PRISON_SCREEN_W = 2.2;
export const PRISON_SCREEN_H = 1.2375; // 2.2 × 9/16 — exactly 16:9

/** The video a cell's screen STARTS on: cell i starts at video (i % 3). */
export function cellVideoIndex(cellIndex) {
  const i = Math.floor(Number(cellIndex) || 0);
  return ((i % PRISON_CELL_VIDEOS.length) + PRISON_CELL_VIDEOS.length) % PRISON_CELL_VIDEOS.length;
}

/** The next video in the back-to-back loop: 0 → 1 → 2 → 0. */
export function nextVideoIndex(videoIndex) {
  const i = Math.floor(Number(videoIndex) || 0);
  return (i + 1) % PRISON_CELL_VIDEOS.length;
}

/** Which video carries the one audible stream. */
export function audioVideoIndex() {
  return PRISON_CELL_VIDEOS.findIndex((v) => v.hasAudio);
}

/**
 * Contain-fit for a video on a plane: the whole video stays visible
 * (a 9:16 video on a 16:9 screen gets pillarbox bars, never a stretch
 * and never a crop). Returns { repeat: [rx, ry], offset: [ox, oy] }.
 */
export function videoContainFit(planeW, planeH, videoW, videoH) {
  const pa = planeW / planeH;
  const va = videoW / videoH;
  if (!(pa > 0) || !(va > 0)) return { repeat: [1, 1], offset: [0, 0] };
  if (va >= pa) {
    // Video wider than the plane: fit the width, letterbox top/bottom.
    const ry = pa / va;
    return { repeat: [1, ry], offset: [0, (1 - ry) / 2] };
  }
  // Video taller than the plane: fit the height, pillarbox left/right.
  const rx = va / pa;
  return { repeat: [rx, 1], offset: [(1 - rx) / 2, 0] };
}

/**
 * The shared pool: 3 video elements + 3 textures, screens register
 * against them. Factories are injected so node tests can use fakes:
 *   createVideo(src) -> a video-like object with { muted, paused,
 *     currentTime, play(), pause(), addEventListener(type, fn),
 *     removeEventListener(type, fn), videoWidth, videoHeight }
 *   createTexture(video) -> a texture-like object with { repeat: {set},
 *     offset: {set} } (real: THREE.VideoTexture).
 */
export function createCellVideoPool({ createVideo, createTexture } = {}) {
  if (typeof createVideo !== 'function' || typeof createTexture !== 'function') {
    throw new Error('createCellVideoPool needs createVideo + createTexture factories');
  }
  const videos = PRISON_CELL_VIDEOS.map((v) => {
    const el = createVideo(v.src);
    el.muted = true; // starts muted; unlockAudio() opens the one audio stream
    el.loop = false; // the loop is the 0→1→2→0 cycle, driven by 'ended'
    el.playsInline = true;
    el.preload = 'auto';
    return el;
  });
  const textures = videos.map((el) => createTexture(el));
  const audioIndex = audioVideoIndex();
  // screens: cellIndex -> { material, videoIndex }
  const screens = new Map();
  let userMuted = false; // the mute button's state: sound ON by default
  let audioUnlocked = false; // iOS: no audio before the first user gesture
  let disposed = false;

  function applyAudio() {
    for (let k = 0; k < videos.length; k += 1) {
      // Only the audio video may ever sound, and only once unlocked
      // and unmuted. Everything else is muted, always.
      videos[k].muted = k !== audioIndex || !audioUnlocked || userMuted;
    }
  }

  // Fit each texture to its video once its size is known (V2 is 9:16
  // on a 16:9 screen — pillarbox, never stretch, never crop).
  videos.forEach((el, k) => {
    const fit = () => {
      const vw = Number(el.videoWidth) || 0;
      const vh = Number(el.videoHeight) || 0;
      if (vw > 0 && vh > 0 && textures[k] && textures[k].repeat && textures[k].offset) {
        const f = videoContainFit(PRISON_SCREEN_W, PRISON_SCREEN_H, vw, vh);
        textures[k].repeat.set(f.repeat[0], f.repeat[1]);
        textures[k].offset.set(f.offset[0], f.offset[1]);
      }
    };
    if (typeof el.addEventListener === 'function') el.addEventListener('loadedmetadata', fit);
  });

  // The back-to-back loop: when video k ends, every screen showing k
  // advances to the next video, and k rewinds so it is at 0 when a
  // screen cycles back to it. No fixed tick — the 'ended' event drives it.
  function onEnded(k) {
    if (disposed) return;
    const video = videos[k];
    try { video.currentTime = 0; } catch { /* a fake may not allow a seek */ }
    for (const screen of screens.values()) {
      if (screen.videoIndex === k) {
        screen.videoIndex = nextVideoIndex(k);
        if (screen.material) {
          screen.material.map = textures[screen.videoIndex];
          screen.material.needsUpdate = true;
        }
      }
    }
  }
  videos.forEach((el, k) => {
    if (typeof el.addEventListener === 'function') el.addEventListener('ended', () => onEnded(k));
  });

  return {
    videos,
    textures,
    /** How many video elements exist: always 3, however many screens. */
    get videoCount() { return videos.length; },
    get screenCount() { return screens.size; },
    get muted() { return userMuted; },
    get unlocked() { return audioUnlocked; },

    /** A cell's screen registers its material; it starts at (cellIndex % 3). */
    registerScreen(cellIndex, material) {
      if (disposed) return -1;
      const videoIndex = cellVideoIndex(cellIndex);
      screens.set(cellIndex, { material, videoIndex });
      if (material) {
        material.map = textures[videoIndex];
        material.needsUpdate = true;
      }
      return videoIndex;
    },
    unregisterScreen(cellIndex) {
      screens.delete(cellIndex);
    },
    screenVideoIndex(cellIndex) {
      const s = screens.get(cellIndex);
      return s ? s.videoIndex : -1;
    },

    /**
     * The in-range gate (the billboard rule): video k plays while at
     * least one VISIBLE screen shows it, pauses otherwise. Pause keeps
     * currentTime — coming back resumes from where it paused.
     * visibleCellIndices: a Set (or array) of the cell indices whose
     * screens are in range right now.
     */
    refreshPlayback(visibleCellIndices) {
      if (disposed) return;
      const visible = visibleCellIndices instanceof Set
        ? visibleCellIndices
        : new Set(Array.isArray(visibleCellIndices) ? visibleCellIndices : []);
      for (let k = 0; k < videos.length; k += 1) {
        let wanted = false;
        for (const cellIndex of visible) {
          const s = screens.get(cellIndex);
          if (s && s.videoIndex === k) { wanted = true; break; }
        }
        const video = videos[k];
        if (wanted && video.paused) {
          const p = video.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else if (!wanted && !video.paused) {
          video.pause();
        }
      }
    },

    /** The mute button: toggles the ONE audio stream. */
    setMuted(muted) {
      userMuted = !!muted;
      applyAudio();
    },
    /** First user gesture (iOS rule): audio may sound from here on. */
    unlockAudio() {
      if (audioUnlocked) return;
      audioUnlocked = true;
      applyAudio();
    },
    /** Test hook: drive one video's 'ended' without playing it. */
    fireEnded(videoIndex) {
      onEnded(videoIndex);
    },
    dispose() {
      disposed = true;
      for (const video of videos) {
        try { video.pause(); } catch { /* already gone */ }
        try { video.src = ''; } catch { /* fake */ }
      }
      screens.clear();
    },
  };
}
