// components/keepsake/KeepsakeGlobe.jsx
// KEEPSAKE — a treasured photo, kept in a snow globe.
//
// A photo (uploaded, or one of the Cabin / Lake / Garden samples) is
// rebuilt as a layered 3D diorama sealed in a realistic glass globe.
// Shake the phone (or the Shake orb) and the snow flies; tilt or swipe
// to look around. The camera stays exactly where you leave it — no
// recoil, no snap-back.
//
// Controls law: every control is a circle orb. The gold orb bottom-right
// holds all the controls; the joystick sits bottom-left; swiping works
// anywhere else on the stage. Nothing overlaps anything.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createKeepsakeScene, loadImage, loadVideo } from '@/lib/keepsake/scene';
import { SAMPLES, DEFAULT_SAMPLE, sampleByKey } from '@/lib/keepsake/samples';
import { ZOOM_T_DEFAULT } from '@/lib/keepsake/camera';

// ROUND 2 (Nov 17, 2026): videos up to 2 minutes are keepsakes too.
// 500 MB covers a 2-minute phone clip at 1080p (and most 4K HEVC
// clips); the PUT goes straight to Supabase, never through Vercel.
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 120;
const IMAGE_MAX_BYTES = 12 * 1024 * 1024;

const ORB = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  border: '2px solid rgba(201, 162, 77, 0.9)',
  background: 'rgba(20, 16, 8, 0.72)',
  color: '#f0d493',
  fontSize: 22,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  padding: 0,
};

const SMALL_ORB = {
  ...ORB,
  width: 44,
  height: 44,
  fontSize: 19,
};

function downscaleToBlob(img, maxW = 1280) {
  return new Promise((resolve, reject) => {
    try {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = Math.min(1, maxW / iw);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(iw * scale));
      c.height = Math.max(1, Math.round(ih * scale));
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.85);
    } catch (e) {
      reject(e);
    }
  });
}

export default function KeepsakeGlobe({
  mode = 'create',
  initialImageSrc,
  initialMediaType,
  initialPalette,
  initialTitle = 'Keepsake',
  initialPlaque = 'Keepsake',
}) {
  const isView = mode === 'view';
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const fileRef = useRef(null);
  const noticeTimer = useRef(null);
  const joyBaseRef = useRef(null);
  const joyKnobRef = useRef(null);
  const joyPointer = useRef(null);
  const swipePointer = useRef(null);
  const swipeLast = useRef({ x: 0, y: 0 });
  const lastShakeAt = useRef(0);
  const pickedFileRef = useRef(null);
  const pickedUrlRef = useRef(null);

  // The viewer reads media_type first, then the palette fallback —
  // the save route stashes it in the palette when the video columns
  // have not migrated yet, so an old database never breaks the view.
  const resolvedMediaType =
    initialMediaType || (initialPalette && initialPalette.mediaType) || 'image';
  const [imageSrc, setImageSrc] = useState(initialImageSrc || sampleByKey(DEFAULT_SAMPLE).src);
  const [mediaType, setMediaType] = useState(resolvedMediaType === 'video' ? 'video' : 'image');
  const [imgEl, setImgEl] = useState(null);
  const [videoEl, setVideoEl] = useState(null);
  const [durationSec, setDurationSec] = useState(
    initialPalette && Number.isFinite(initialPalette.durationSec) ? initialPalette.durationSec : null,
  );
  const [sampleKey, setSampleKey] = useState(isView ? null : DEFAULT_SAMPLE);
  const [title, setTitle] = useState(initialTitle);
  const [plaque, setPlaque] = useState(initialPlaque);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [snowfall, setSnowfall] = useState(1);
  const [motionOn, setMotionOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('exterior');
  const [zoom, setZoom] = useState(Math.round(ZOOM_T_DEFAULT * 100));

  const showNotice = useCallback((text) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  }, []);

  // --- scene lifecycle -----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const scene = createKeepsakeScene(containerRef.current, { plaque });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- media loading (photo or video) --------------------------------------
  useEffect(() => {
    let alive = true;
    let vid = null;
    setLoading(true);
    if (mediaType === 'video') {
      loadVideo(imageSrc)
        .then((v) => {
          if (!alive) {
            v.pause();
            return;
          }
          vid = v;
          setVideoEl(v);
          setImgEl(null);
          sceneRef.current?.setVideo(v, imageSrc);
          setLoading(false);
        })
        .catch(() => {
          if (!alive) return;
          setLoading(false);
          showNotice('That video could not be opened — showing the Cabin scene instead.');
          pickedFileRef.current = null;
          setDurationSec(null);
          setMediaType('image');
          setSampleKey(DEFAULT_SAMPLE);
          setImageSrc(sampleByKey(DEFAULT_SAMPLE).src);
        });
      return () => {
        alive = false;
        if (vid) vid.pause();
      };
    }
    loadImage(imageSrc)
      .then((img) => {
        if (!alive) return;
        setImgEl(img);
        setVideoEl(null);
        sceneRef.current?.setImage(img, imageSrc);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        if (imageSrc !== sampleByKey(DEFAULT_SAMPLE).src) {
          showNotice('That photo could not be opened — showing the Cabin scene instead.');
          setSampleKey(DEFAULT_SAMPLE);
          setImageSrc(sampleByKey(DEFAULT_SAMPLE).src);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, mediaType]);

  // --- plaque ---------------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => sceneRef.current?.setPlaque(plaque || 'Keepsake'), 250);
    return () => clearTimeout(t);
  }, [plaque]);

  // --- snowfall --------------------------------------------------------------
  useEffect(() => {
    sceneRef.current?.setSnowfall(snowfall);
  }, [snowfall]);

  // --- interior / exterior view ---------------------------------------------
  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  // --- zoom slider: exterior drives orbit radius, interior drives FOV -------
  useEffect(() => {
    sceneRef.current?.setZoom(zoom / 100);
  }, [zoom]);

  // --- device-motion shake ----------------------------------------------------
  useEffect(() => {
    if (!motionOn) return undefined;
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      const now = Date.now();
      if (mag > 24 && now - lastShakeAt.current > 600) {
        lastShakeAt.current = now;
        sceneRef.current?.shake(1);
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [motionOn]);

  const enableMotion = useCallback(async () => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') {
          showNotice('Motion access was not granted — the Shake orb still works.');
          return;
        }
      }
      setMotionOn(true);
      showNotice('Shake your phone to stir the snow.');
    } catch {
      showNotice('Motion is not available here — the Shake orb still works.');
    }
  }, [showNotice]);

  // --- swipe camera (no recoil: release changes nothing) ----------------------
  const onSwipeDown = (e) => {
    if (swipePointer.current !== null) return;
    swipePointer.current = e.pointerId;
    swipeLast.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSwipeMove = (e) => {
    if (swipePointer.current !== e.pointerId) return;
    const dx = e.clientX - swipeLast.current.x;
    const dy = e.clientY - swipeLast.current.y;
    swipeLast.current = { x: e.clientX, y: e.clientY };
    sceneRef.current?.swipe(dx, dy);
  };
  const onSwipeUp = (e) => {
    if (swipePointer.current === e.pointerId) swipePointer.current = null;
  };

  // --- joystick (bottom-left; walks the camera, never snaps back) --------------
  const joyMove = (e) => {
    if (joyPointer.current !== e.pointerId || !joyBaseRef.current) return;
    const rect = joyBaseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    const max = 34;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    if (joyKnobRef.current) joyKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    sceneRef.current?.setJoystick(dx / max, -dy / max);
  };
  const joyEnd = (e) => {
    if (joyPointer.current !== e.pointerId) return;
    joyPointer.current = null;
    if (joyKnobRef.current) joyKnobRef.current.style.transform = 'translate(0px, 0px)';
    sceneRef.current?.setJoystick(0, 0);
  };

  // --- upload ------------------------------------------------------------------
  const revokePickedUrl = useCallback(() => {
    if (pickedUrlRef.current) {
      URL.revokeObjectURL(pickedUrlRef.current);
      pickedUrlRef.current = null;
    }
  }, []);

  // Videos are checked BEFORE upload: the duration comes from the
  // picked file itself (a video element reads its metadata), and
  // anything over 2 minutes is refused with a plain notice.
  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && VIDEO_TYPES.has(file.type)) {
      if (file.size > VIDEO_MAX_BYTES) {
        showNotice('That video is over 500 MB — please pick a smaller one.');
        return;
      }
      const url = URL.createObjectURL(file);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const secs = probe.duration;
        if (Number.isFinite(secs) && secs > VIDEO_MAX_SECONDS) {
          URL.revokeObjectURL(url);
          showNotice('That video is over 2 minutes — please pick a shorter one.');
          return;
        }
        revokePickedUrl();
        pickedUrlRef.current = url;
        pickedFileRef.current = file;
        setDurationSec(Number.isFinite(secs) ? Math.round(secs * 10) / 10 : null);
        setSampleKey(null);
        setVideoEl(null);
        setMediaType('video');
        setImageSrc(url);
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        showNotice('That video could not be read.');
      };
      probe.src = url;
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      showNotice('That is not a photo or video — please pick an image, or a video (MP4, WebM or MOV).');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      showNotice('That photo is over 12 MB — please pick a smaller one.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      revokePickedUrl();
      pickedFileRef.current = null;
      setDurationSec(null);
      setVideoEl(null);
      setMediaType('image');
      setSampleKey(null);
      setImageSrc(String(reader.result));
    };
    reader.onerror = () => showNotice('That photo could not be read.');
    reader.readAsDataURL(file);
  };

  const pickSample = (key) => {
    revokePickedUrl();
    pickedFileRef.current = null;
    setDurationSec(null);
    setVideoEl(null);
    setMediaType('image');
    setSampleKey(key);
    setImageSrc(sampleByKey(key).src);
  };

  // --- snapshot -----------------------------------------------------------------
  const savePng = useCallback(async () => {
    try {
      const blob = await sceneRef.current?.snapshot();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keepsake-${(title || 'globe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'globe'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showNotice('Snapshot saved to your photos.');
    } catch {
      showNotice('The snapshot did not save.');
    }
  }, [title, showNotice]);

  // --- save & share (Supabase; create mode only) --------------------------------
  const saveAndShare = useCallback(async () => {
    if (saving) return;
    if (mediaType === 'video' ? !videoEl : !imgEl) {
      showNotice(mediaType === 'video' ? 'Choose or upload a video first.' : 'Choose or upload a photo first.');
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        showNotice('Sign in to save your keepsake.');
        return;
      }
      // Video keepsakes PUT the original file — never downscaled, never
      // re-encoded. Photos still go through the downscale as before.
      let uploadBody;
      let uploadType;
      let uploadLabel;
      if (mediaType === 'video') {
        const file = pickedFileRef.current;
        if (!file) throw new Error('That video is no longer available — please pick it again.');
        uploadBody = file;
        uploadType = file.type;
        uploadLabel = 'The video did not upload.';
      } else {
        uploadBody = await downscaleToBlob(imgEl);
        uploadType = 'image/jpeg';
        uploadLabel = 'The photo did not upload.';
      }
      const upRes = await fetch('/api/keepsake/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contentType: uploadType, sizeBytes: uploadBody.size }),
      });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upJson.error || 'The upload could not start.');
      const put = await fetch(upJson.uploadUrl, {
        method: 'PUT',
        body: uploadBody,
        headers: { 'Content-Type': uploadType },
      });
      if (!put.ok) throw new Error(uploadLabel);
      const saveRes = await fetch('/api/keepsake', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          path: upJson.path,
          imageUrl: upJson.publicUrl,
          title: title || 'Keepsake',
          plaque: plaque || 'Keepsake',
          palette: sceneRef.current?.getPalette?.() || null,
          mediaType,
          durationSec: mediaType === 'video' ? durationSec : null,
        }),
      });
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saveJson.error || 'The keepsake could not be saved.');
      const url = `${window.location.origin}${saveJson.url}`;
      setShareUrl(url);
      showNotice('Your keepsake is saved — share link ready below.');
    } catch (err) {
      showNotice(err && err.message ? err.message : 'Saving did not work.');
    } finally {
      setSaving(false);
    }
  }, [saving, imgEl, videoEl, mediaType, durationSec, title, plaque, showNotice]);

  const copyShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotice('Share link copied.');
    } catch {
      showNotice(shareUrl);
    }
  }, [shareUrl, showNotice]);

  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is a nicety; the globe works without it.
    }
  }, []);

  const snowfallLabel = ['Light', 'Normal', 'Heavy'][snowfall];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #0b1026 0%, #1b1440 55%, #2a1a3e 100%)',
        color: '#f5efe0',
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      {/* 3D stage */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {/* swipe layer — anywhere else on the stage moves the camera */}
      <div
        style={{ position: 'absolute', inset: 0, touchAction: 'none', zIndex: 2 }}
        onPointerDown={onSwipeDown}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeUp}
        onPointerCancel={onSwipeUp}
      />

      {/* top bar */}
      <a
        href="/"
        style={{
          position: 'absolute', top: 14, left: 16, zIndex: 5, color: '#f0d493',
          textDecoration: 'none', fontSize: 15, letterSpacing: '0.04em',
        }}
      >
        ← Hub
      </a>
      <div
        style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
          maxWidth: '50vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: '#f0d493', fontSize: 17, letterSpacing: '0.08em',
        }}
      >
        {title || 'Keepsake'}
      </div>
      <button
        type="button"
        aria-label="Fullscreen"
        onClick={toggleFullscreen}
        style={{ ...ORB, width: 48, height: 48, position: 'absolute', top: 10, right: 14, zIndex: 5, fontSize: 20 }}
      >
        ⛶
      </button>

      {/* notice pill */}
      {notice && (
        <div
          style={{
            position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
            maxWidth: '92vw', padding: '8px 16px', borderRadius: 999, background: 'rgba(10, 8, 4, 0.82)',
            border: '1px solid rgba(201, 162, 77, 0.7)', color: '#f5efe0', fontSize: 14, textAlign: 'center',
          }}
        >
          {notice}
        </div>
      )}

      {/* loading veil */}
      {loading && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 4, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#f0d493', fontSize: 16, letterSpacing: '0.06em',
            background: 'rgba(11, 16, 38, 0.55)', pointerEvents: 'none',
          }}
        >
          Preparing your globe…
        </div>
      )}

      {/* joystick — bottom-left */}
      <div
        ref={joyBaseRef}
        style={{
          position: 'absolute', left: 16, bottom: 76, zIndex: 5, width: 120, height: 120,
          borderRadius: '50%', border: '2px solid rgba(240, 212, 147, 0.55)',
          background: 'rgba(10, 8, 4, 0.45)', touchAction: 'none',
        }}
        onPointerDown={(e) => {
          joyPointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          joyMove(e);
        }}
        onPointerMove={joyMove}
        onPointerUp={joyEnd}
        onPointerCancel={joyEnd}
      >
        <div
          ref={joyKnobRef}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: 52, height: 52,
            marginLeft: -26, marginTop: -26, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #f7e3a1, #c9a24d 70%)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* gold orb menu — bottom-right */}
      <button
        type="button"
        aria-label="Keepsake controls"
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          ...ORB, width: 76, height: 76, position: 'absolute', right: 16, bottom: 76, zIndex: 6,
          fontSize: 30,
          background: 'radial-gradient(circle at 35% 30%, #f7e3a1, #b98c2e 65%, #8a6a1f)',
          color: '#241a05', border: '2px solid #f0d493',
          boxShadow: menuOpen ? '0 0 0 4px rgba(240, 212, 147, 0.35)' : '0 4px 18px rgba(0,0,0,0.55)',
        }}
      >
        ✦
      </button>

      {/* controls panel */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute', right: 16, bottom: 164, zIndex: 6, width: 'min(320px, calc(100vw - 32px))',
            boxSizing: 'border-box',
            borderRadius: 24, background: 'rgba(12, 10, 5, 0.92)', border: '1px solid rgba(201, 162, 77, 0.65)',
            padding: '14px 14px 16px', boxShadow: '0 10px 32px rgba(0,0,0,0.6)',
            maxHeight: '62vh', overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: '#f0d493', fontSize: 15, letterSpacing: '0.08em' }}>KEEPSAKE</span>
            <button type="button" aria-label="Close controls" onClick={() => setMenuOpen(false)} style={{ ...ORB, width: 36, height: 36, fontSize: 16 }}>
              ✕
            </button>
          </div>

          {!isView && (
            <>
              <div style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.75)', marginBottom: 6 }}>Photo or video</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <button type="button" aria-label="Upload a photo or video" title="Upload a photo or video" onClick={() => fileRef.current?.click()} style={ORB}>
                  📷
                </button>
                {SAMPLES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-label={`${s.label} scene`}
                    title={s.label}
                    onClick={() => pickSample(s.key)}
                    style={{
                      ...ORB,
                      backgroundImage: `url(${s.src})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: sampleKey === s.key ? '2px solid #f0d493' : '2px solid rgba(201, 162, 77, 0.5)',
                      fontSize: 0,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
                <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onPickFile} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                  placeholder="Title"
                  aria-label="Keepsake title"
                  style={{
                    flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 999,
                    border: '1px solid rgba(201, 162, 77, 0.55)', background: 'rgba(255,255,255,0.06)',
                    color: '#f5efe0', fontSize: 14, outline: 'none',
                  }}
                />
                <input
                  value={plaque}
                  onChange={(e) => setPlaque(e.target.value.slice(0, 40))}
                  placeholder="Plaque"
                  aria-label="Plaque text"
                  style={{
                    flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 999,
                    border: '1px solid rgba(201, 162, 77, 0.55)', background: 'rgba(255,255,255,0.06)',
                    color: '#f5efe0', fontSize: 14, outline: 'none',
                  }}
                />
              </div>
            </>
          )}

          {/* View — outside the globe (default) or inside it, walking
              around the photo wrapped the whole circle. Circle orbs,
              like every other control here. */}
          <div style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.75)', marginBottom: 6 }}>View</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              aria-label="Exterior view — outside the globe"
              title="Outside the globe"
              onClick={() => setView('exterior')}
              style={{
                ...ORB,
                border: view === 'exterior' ? '2px solid #f0d493' : ORB.border,
                background: view === 'exterior' ? 'rgba(201, 162, 77, 0.35)' : ORB.background,
              }}
            >
              🌐
            </button>
            <button
              type="button"
              aria-label="Interior view — inside the globe"
              title="Inside the globe"
              onClick={() => setView('interior')}
              style={{
                ...ORB,
                border: view === 'interior' ? '2px solid #f0d493' : ORB.border,
                background: view === 'interior' ? 'rgba(201, 162, 77, 0.35)' : ORB.background,
              }}
            >
              🌀
            </button>
            <span style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.8)' }}>
              {view === 'interior' ? 'Inside the globe' : 'Outside the globe'}
            </span>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.75)', marginBottom: 6 }}>Snow &amp; motion</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" aria-label="Shake the snow" title="Shake" onClick={() => sceneRef.current?.shake(1)} style={SMALL_ORB}>
              ❄
            </button>
            <button
              type="button"
              aria-label="Enable phone shake"
              title={motionOn ? 'Phone shake on' : 'Enable phone shake'}
              onClick={enableMotion}
              style={{ ...SMALL_ORB, border: motionOn ? '2px solid #f0d493' : SMALL_ORB.border, opacity: motionOn ? 1 : 0.75 }}
            >
              📳
            </button>
            <button type="button" aria-label="Less snow" title="Less snow" onClick={() => setSnowfall((v) => Math.max(0, v - 1))} style={SMALL_ORB}>
              −
            </button>
            <button type="button" aria-label="More snow" title="More snow" onClick={() => setSnowfall((v) => Math.min(2, v + 1))} style={SMALL_ORB}>
              +
            </button>
            <span style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.8)' }}>{snowfallLabel}</span>
          </div>

          {/* Zoom — a slider, not a button: outside it pulls the orbit
              camera in and out, inside it opens and closes the view. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.8)', flex: '0 0 auto' }}>Zoom out</span>
            <input
              type="range"
              min={0}
              max={100}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom out or in"
              style={{ flex: 1, minWidth: 0, accentColor: '#c9a24d' }}
            />
            <span style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.8)', flex: '0 0 auto' }}>Zoom in</span>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(245, 239, 224, 0.75)', marginBottom: 6 }}>Keep &amp; share</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: shareUrl ? 10 : 0 }}>
            <button type="button" aria-label="Save a PNG snapshot" title="Save PNG" onClick={savePng} style={ORB}>
              💾
            </button>
            {!isView && (
              <button
                type="button"
                aria-label="Save and share this keepsake"
                title={saving ? 'Saving…' : 'Save & share'}
                onClick={saveAndShare}
                disabled={saving}
                style={{ ...ORB, opacity: saving ? 0.6 : 1 }}
              >
                🔗
              </button>
            )}
            {isView && (
              <a
                href="/keepsake"
                style={{
                  display: 'inline-flex', alignItems: 'center', padding: '10px 16px', borderRadius: 999,
                  background: '#c9a24d', color: '#241a05', textDecoration: 'none', fontSize: 14, fontWeight: 600,
                }}
              >
                Make your own keepsake
              </a>
            )}
          </div>
          {shareUrl && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={shareUrl}
                readOnly
                aria-label="Share link"
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 999,
                  border: '1px solid rgba(201, 162, 77, 0.55)', background: 'rgba(255,255,255,0.06)',
                  color: '#f5efe0', fontSize: 13, outline: 'none',
                }}
              />
              <button type="button" aria-label="Copy share link" title="Copy link" onClick={copyShare} style={{ ...ORB, width: 44, height: 44, fontSize: 18 }}>
                📋
              </button>
            </div>
          )}
        </div>
      )}

      {/* honest footer — the world beyond the photo is a reconstruction.
          It lives in the clear strip between the joystick (bottom-left,
          120px wide at left:16) and the gold orb (bottom-right, 76px at
          right:16), so it never runs under either control at any phone
          width. Wording kept exactly. */}
      <div
        style={{
          position: 'absolute', bottom: 8, left: 140, right: 96, zIndex: 3,
          textAlign: 'center', fontSize: 10.5, lineHeight: 1.35,
          color: 'rgba(245, 239, 224, 0.55)', pointerEvents: 'none', fontFamily: 'system-ui, sans-serif',
        }}
      >
        The world beyond your photo&apos;s edges is rebuilt from its colours and light — a reconstruction, not the original scene.
      </div>
    </div>
  );
}
