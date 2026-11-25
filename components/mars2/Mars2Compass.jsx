// components/mars2/Mars2Compass.jsx
// MARS 2 COMPASS (Merlin, Nov 25, 2026).
//
// A horizontal carousel compass pinned to the TOP of the Mars 2
// screen — a header strip, not an under-screen control, so it is
// not bound by the orb law (it is a navigation instrument, and its
// markers are map pins, not buttons). It carries:
//   · the heading (N/NE/E… + degrees) and a centre caret;
//   · a HOME marker, GREEN, for the user's own outpost;
//   · a marker per friend with a placed outpost, BLUE — tapping
//     one opens a minimizable overlay naming whose outpost it is,
//     with its distance and bearing, and a GUIDE switch that pins
//     it as the active guidance target.
// The strip shows 120° of bearing either side of the heading and
// wraps like a carousel. Everything below it — roverbar, Thule
// pill, HP pill, build panel, fullscreen orb — sits
// MARS2_COMPASS_TOP_OFFSET_PX lower, so nothing overlaps.
// The page owns the pose, the markers and the overlay state; this
// component only renders them. The math lives in lib/mars2/compass.js.

'use client';
import { useMemo } from 'react';
import { compassMarkers, compassTicks, compassPoint } from '@/lib/mars2/compass';

/** The compass strip's height. */
export const MARS2_COMPASS_H_PX = 46;
/** How far the top controls shift down to clear the strip. */
export const MARS2_COMPASS_TOP_OFFSET_PX = 54;

const ACCENT = '#e07840';
const HOME_GREEN = '#9dffb0';
const FRIEND_BLUE = '#7fd4ff';

export default function Mars2Compass({
  headingDeg = 0,
  position = null,
  home = null,
  friends = [],
  guidanceId = null,
  selectedMarker = null,
  overlayMinimized = false,
  onSelectMarker,
  onCloseOverlay,
  onMinimizeOverlay,
  onExpandOverlay,
  onGuide,
  onClearGuide,
}) {
  const targets = useMemo(() => {
    const list = [];
    if (home) list.push({ id: 'home', kind: 'home', label: 'HOME — ARES OUTPOST', name: 'Home', x: home.x, z: home.z });
    for (const f of friends || []) {
      list.push({
        id: `friend-${f.user_id}`, kind: 'friend', label: `${f.display_name || f.username || 'Friend'}'s outpost`,
        name: f.display_name || f.username || 'Friend', userId: f.user_id, x: f.x, z: f.z,
      });
    }
    return list;
  }, [home, friends]);

  const markers = useMemo(() => {
    if (!position) return [];
    return compassMarkers({ headingDeg, position, targets, halfWidthDeg: 60 });
  }, [headingDeg, position, targets]);

  const ticks = useMemo(() => compassTicks(headingDeg, 60, 15, 45), [headingDeg]);

  const guided = guidanceId ? markers.find((m) => m.id === guidanceId) || null : null;
  const point = compassPoint(headingDeg);
  const headingText = `${point} · ${Math.round((((headingDeg % 360) + 360) % 360))}°`;

  return (
    <>
    <div
      role="group"
      aria-label="Mars 2 compass"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: MARS2_COMPASS_H_PX, zIndex: 7,
        background: 'linear-gradient(rgba(16,7,3,0.94), rgba(16,7,3,0.88))',
        borderBottom: `1px solid ${ACCENT}`, overflow: 'hidden',
        color: '#f0dcc8', fontSize: 11, letterSpacing: 2,
      }}
    >
      {/* Heading readout, left. */}
      <div style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        color: ACCENT, fontWeight: 700, whiteSpace: 'nowrap', zIndex: 2,
        textShadow: '0 1px 4px #000',
      }}>
        {headingText}
      </div>
      {/* Centre caret — dead ahead. */}
      <div aria-hidden="true" style={{
        position: 'absolute', left: '50%', top: 2, transform: 'translateX(-50%)',
        color: ACCENT, fontSize: 10, lineHeight: 1, zIndex: 2,
      }}>▼</div>
      {/* Bearing ticks. */}
      {ticks.map((t) => (
        <div key={t.bearing} aria-hidden="true" style={{
          position: 'absolute', left: `${t.xFrac * 100}%`, top: t.major ? 14 : 20,
          transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            width: 1, height: t.major ? 12 : 7, margin: '0 auto',
            background: t.major ? '#f0dcc8' : 'rgba(240,220,200,0.45)',
          }} />
          {t.label && (
            <div style={{ fontSize: 10, color: '#f0dcc8', marginTop: 2, textShadow: '0 1px 4px #000' }}>{t.label}</div>
          )}
        </div>
      ))}
      {/* Outpost markers — map pins, green home / blue friends. */}
      {markers.filter((m) => !m.offscreen).map((m) => {
        const isHome = m.kind === 'home';
        const color = isHome ? HOME_GREEN : FRIEND_BLUE;
        const isGuided = guided && guided.id === m.id;
        const isSelected = selectedMarker && selectedMarker.id === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelectMarker && onSelectMarker(m)}
            aria-label={`${m.label}, ${m.distance} ${m.point}`}
            aria-pressed={isSelected}
            title={`${m.label} — ${m.distance} ${m.point}`}
            style={{
              position: 'absolute', left: `${m.xFrac * 100}%`, top: 22,
              transform: 'translateX(-50%)', zIndex: 3,
              width: 22, height: 22, padding: 0, cursor: 'pointer',
              background: 'transparent', border: 'none',
            }}
          >
            <span aria-hidden="true" style={{
              display: 'block', width: 12, height: 12, margin: '2px auto 0',
              background: color, transform: 'rotate(45deg)',
              border: isSelected ? '2px solid #fff' : `1px solid ${color}`,
              boxShadow: isGuided ? `0 0 10px 2px ${color}` : `0 0 6px ${color}`,
            }} />
            <span aria-hidden="true" style={{
              display: 'block', fontSize: 9, color, marginTop: 1,
              textShadow: '0 1px 4px #000', whiteSpace: 'nowrap',
            }}>
              {isHome ? 'HOME' : m.name}
            </span>
          </button>
        );
      })}
      {/* Guidance line — the active target, with its distance. */}
      {guided && (
        <div style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          color: guided.kind === 'home' ? HOME_GREEN : FRIEND_BLUE,
          fontWeight: 700, whiteSpace: 'nowrap', zIndex: 2, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span>→ {guided.label.length > 14 ? `${guided.label.slice(0, 12)}…` : guided.label} · {guided.distance} {guided.point}</span>
          <button
            type="button" onClick={() => onClearGuide && onClearGuide()}
            aria-label="Stop guiding to this outpost"
            style={{
              background: 'transparent', border: `1px solid ${ACCENT}`, color: '#f0dcc8',
              borderRadius: 999, width: 20, height: 20, fontSize: 11, lineHeight: 1,
              cursor: 'pointer', padding: 0,
            }}
          >✕</button>
        </div>
      )}
    </div>

      {/* Friend / home overlay — a SIBLING of the strip, not a child:
          the strip clips its overflow, so an overlay inside it would
          be cut off at 46 px. It is positioned against the stage
          instead. Minimizable, pinned header outside the body (the
          overlay-minimize law: the minimize button never scrolls
          away, and nothing force-reopens it). */}
      {selectedMarker && !overlayMinimized && (
        <div
          role="dialog"
          aria-label={`${selectedMarker.label} — outpost details`}
          style={{
            position: 'absolute', top: MARS2_COMPASS_TOP_OFFSET_PX + 8, left: '50%',
            transform: 'translateX(-50%)', zIndex: 8, width: 'min(320px, 92%)',
            background: 'linear-gradient(rgba(16,7,3,0.97), rgba(16,7,3,0.97))',
            border: `1px solid ${selectedMarker.kind === 'home' ? HOME_GREEN : FRIEND_BLUE}`,
            borderRadius: 12, padding: '10px 12px', color: '#f0dcc8',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b style={{ color: selectedMarker.kind === 'home' ? HOME_GREEN : FRIEND_BLUE, letterSpacing: 2, fontSize: 12 }}>
              {selectedMarker.kind === 'home' ? '⬢ HOME' : '⬢ FRIEND'}
            </b>
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                type="button" onClick={() => onMinimizeOverlay && onMinimizeOverlay()}
                aria-label="Minimize outpost details"
                style={{ background: 'transparent', border: `1px solid ${ACCENT}`, color: '#f0dcc8', borderRadius: 999, width: 24, height: 24, fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0 }}
              >—</button>
              <button
                type="button" onClick={() => onCloseOverlay && onCloseOverlay()}
                aria-label="Close outpost details"
                style={{ background: 'transparent', border: `1px solid ${ACCENT}`, color: '#f0dcc8', borderRadius: 999, width: 24, height: 24, fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0 }}
              >✕</button>
            </span>
          </div>
          <div style={{ marginTop: 6, lineHeight: 1.6, fontSize: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedMarker.label}</div>
            <div style={{ color: '#c99a78' }}>
              {selectedMarker.distance} away · bearing {Math.round(selectedMarker.bearing)}° {selectedMarker.point}
            </div>
            <div style={{ color: '#c99a78' }}>Follow the compass marker to travel there.</div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => (guided ? onClearGuide && onClearGuide() : onGuide && onGuide(selectedMarker))}
              aria-pressed={!!guided}
              style={{
                background: guided ? ACCENT : 'transparent', color: guided ? '#160a04' : '#f0dcc8',
                border: `1px solid ${ACCENT}`, borderRadius: 999, padding: '8px 14px',
                fontSize: 11, letterSpacing: 2, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {guided ? '✓ GUIDING — TAP TO STOP' : 'GUIDE ME THERE'}
            </button>
          </div>
        </div>
      )}
      {/* Minimized overlay chip — the name stays visible, one tap reopens. */}
      {selectedMarker && overlayMinimized && (
        <button
          type="button"
          onClick={() => onExpandOverlay && onExpandOverlay()}
          aria-label={`Expand outpost details for ${selectedMarker.label}`}
          style={{
            position: 'absolute', top: MARS2_COMPASS_TOP_OFFSET_PX + 8, left: '50%',
            transform: 'translateX(-50%)', zIndex: 8,
            background: 'linear-gradient(rgba(16,7,3,0.97), rgba(16,7,3,0.97))',
            border: `1px solid ${selectedMarker.kind === 'home' ? HOME_GREEN : FRIEND_BLUE}`,
            color: '#f0dcc8', borderRadius: 999, padding: '6px 12px',
            fontSize: 11, letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ⬢ {selectedMarker.label} ▲
        </button>
      )}
    </>
  );
}
