/*
 * ARTEMIS batch — shared inline-SVG glyph system.
 * Zero image weight: 24×24, stroke=currentColor, used as decorative
 * leading glyphs next to (or in place of) button text. aria-hidden by default.
 */

function G({ children, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IcPause  = () => <G><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></G>;
export const IcPlay   = () => <G><polygon points="7,4 20,12 7,20" fill="currentColor" stroke="none"/></G>;
export const IcClose  = () => <G><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></G>;
export const IcPlus   = () => <G><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></G>;
export const IcMinus  = () => <G><line x1="5" y1="12" x2="19" y2="12"/></G>;

export const IcEye    = () => <G><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></G>;
export const IcGrid   = () => <G><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="20"/></G>;

export const IcSunrise = () => <G><path d="M12 3v4"/><path d="M5.6 5.6l2 2"/><path d="M18.4 5.6l-2 2"/><path d="M4 17a8 8 0 0 1 16 0"/><line x1="2" y1="17" x2="22" y2="17"/><line x1="12" y1="20" x2="12" y2="21"/></G>;
export const IcSun     = () => <G><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></G>;
export const IcSunset  = () => <G><path d="M12 7V3"/><path d="M5.6 8.4l2-2"/><path d="M18.4 8.4l-2-2"/><path d="M4 17a8 8 0 0 1 16 0"/><line x1="2" y1="17" x2="22" y2="17"/></G>;
export const IcMoon    = () => <G><path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5z"/></G>;
export const IcWings   = () => <G><path d="M2 15c4-1 7-4 8-9 3 3 8 5 12 4-2 4-6 6-9 6-1 2-3 3-5 3-3 0-5-1-6-4z"/><path d="M10 6c1.5 2.5 4 4 7 4.5"/></G>;
export const IcMarker  = () => <G><path d="M12 3l4.5 4.5L12 21l-4.5-13.5z"/><circle cx="12" cy="8" r="1.4" fill="currentColor" stroke="none"/></G>;

export const IcRoute   = () => <G><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h8"/></G>;
export const IcArrow   = () => <G><line x1="4" y1="12" x2="20" y2="12"/><polyline points="13,5 20,12 13,19"/></G>;
export const IcCheck   = () => <G><polyline points="4,12.5 9.5,18 20,6.5"/></G>;
export const IcCompass = () => <G><circle cx="12" cy="12" r="9"/><polygon points="15.5,8.5 13.5,13.5 8.5,15.5 10.5,10.5" fill="currentColor" stroke="none"/></G>;
export const IcMap     = () => <G><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="6" x2="15" y2="22"/></G>;

export const IcReplay  = () => <G><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3,4 3.5,8.5 8,8"/></G>;
export const IcGauge   = () => <G><path d="M4 15a8 8 0 1 1 16 0"/><line x1="12" y1="15" x2="16" y2="9"/><line x1="3" y1="19" x2="21" y2="19"/></G>;
export const IcSpeaker = () => <G><polygon points="4,9 9,9 14,5 14,19 9,15 4,15" fill="currentColor" stroke="none"/><path d="M17 9a4.2 4.2 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></G>;

export const IcBolt    = () => <G><polygon points="13,2 5,13.5 11,13.5 10,22 19,9.5 13,9.5" fill="currentColor" stroke="none"/></G>;
export const IcCloudRain = () => <G><path d="M7 15a4.5 4.5 0 1 1 .8-8.9A5.5 5.5 0 0 1 18.5 8 3.8 3.8 0 0 1 17.5 15z"/><line x1="8" y1="18" x2="7" y2="21"/><line x1="12" y1="18" x2="11" y2="21"/><line x1="16" y1="18" x2="15" y2="21"/></G>;

export const IcSkip    = () => <G><polygon points="6,5 14,12 6,19" fill="currentColor" stroke="none"/><line x1="17" y1="5" x2="17" y2="19"/></G>;
export const IcMeteor  = () => <G><circle cx="17" cy="7" r="2.4"/><path d="M13.5 9.5L4 19M15.5 12.5L8 20M12 6.5L3 15.5"/></G>;

export const IcTower   = () => <G><path d="M10 21l1-8h2l1 8"/><path d="M8.5 13h7"/><path d="M9.5 9.5h5"/><polygon points="12,2 9.8,9.5 14.2,9.5" fill="currentColor" stroke="none"/></G>;
export const IcCharge  = () => <G><rect x="7" y="8" width="10" height="13" rx="2"/><polygon points="12,2 10.5,8 13.5,8 12,11" fill="currentColor" stroke="none"/><path d="M10 14.5h4"/></G>;

export const IcDoc     = () => <G><path d="M6 2h8l4 4v16H6z"/><polyline points="14,2 14,6 18,6"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></G>;
export const IcTerminal = () => <G><rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7,9 10,12 7,15"/><line x1="12" y1="15" x2="17" y2="15"/></G>;

export const IcWave    = () => <G><path d="M2 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 15c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/></G>;
export const IcAnchor  = () => <G><circle cx="12" cy="5" r="2.2"/><line x1="12" y1="7.5" x2="12" y2="21"/><path d="M5 13a7 7 0 0 0 14 0"/><line x1="8" y1="10" x2="16" y2="10"/></G>;
export const IcDive    = () => <G><polyline points="12,3 12,15"/><polyline points="6,11 12,17 18,11"/><line x1="5" y1="21" x2="19" y2="21"/></G>;

export const IcFlame   = () => <G><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.8 2-5 .5 1.5 1.5 2.5 3 3-.5-2.5 0-5.5 0-8z"/></G>;
export const IcFan     = () => <G><circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C12 6 14 3.5 18 3.5c0 4-2 7-6 6.9zM13.4 12.8c3.9 1.5 5.2 4.3 3.4 7.9-3.5-1.7-5.3-4.4-3.4-7.9zM10.6 12.8C6.7 14.3 5.4 17.1 7.2 20.7c3.5-1.7 5.3-4.4 3.4-7.9z"/></G>;
export const IcTarget  = () => <G><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></G>;
export const IcRefresh = () => <G><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21,3 20.5,7.5 16,7"/></G>;
export const IcSprout  = () => <G><path d="M12 21v-9"/><path d="M12 12C12 8 9 5.5 4.5 5.5c0 4.5 2.8 7 7.5 6.5z"/><path d="M12 10c0-3.5 2.2-5.5 6.5-5.5 0 3.8-2.5 6-6.5 5.5z"/></G>;
export const IcSnowflake = () => <G><line x1="12" y1="3" x2="12" y2="21"/><line x1="4.2" y1="7.5" x2="19.8" y2="16.5"/><line x1="19.8" y1="7.5" x2="4.2" y2="16.5"/><path d="M12 3l-2 2.5M12 3l2 2.5M12 21l-2-2.5M12 21l2-2.5"/></G>;

/* ------- header crest art (inline SVG, no images) ------- */

export function ArtemisCrest({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="17.5" stroke="#5eead4" strokeWidth="1.4" opacity="0.7"/>
      <path d="M26.5 9.5A12 12 0 1 0 26.5 30.5 14.5 14.5 0 0 1 26.5 9.5z" fill="#d9a441" opacity="0.9"/>
      <path d="M8 26c3-1 5.5-3.2 6.5-6.5M14 30c2.4-.8 4.4-2.6 5.2-5.2" stroke="#5eead4" strokeWidth="1.2" strokeLinecap="round" opacity="0.85"/>
      <circle cx="28" cy="15" r="1.1" fill="#fff" opacity="0.9"/>
      <circle cx="31" cy="22" r="0.8" fill="#fff" opacity="0.7"/>
    </svg>
  );
}

export function AquariumCrest({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="17.5" stroke="#5eead4" strokeWidth="1.4" opacity="0.7"/>
      <path d="M6 22c3.5 0 3.5 3 7 3s3.5-3 7-3 3.5 3 7 3 3.5-3 7-3" stroke="#5eead4" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M6 28c3.5 0 3.5 3 7 3s3.5-3 7-3 3.5 3 7 3 3.5-3 7-3" stroke="#d9a441" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      <circle cx="14" cy="13" r="1" fill="#fff" opacity="0.8"/>
      <circle cx="25" cy="10" r="1.4" fill="#fff" opacity="0.6"/>
    </svg>
  );
}

export function AetherisCrest({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="17.5" stroke="#5eead4" strokeWidth="1.4" opacity="0.7"/>
      <path d="M18 34l1.2-10h1.6L22 34" stroke="#d9a441" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M16.5 24h7M17.5 19h5" stroke="#d9a441" strokeWidth="1.2" opacity="0.8"/>
      <polygon points="20,6 17.8,18 22.2,18" fill="#5eead4" opacity="0.9"/>
      <path d="M12 28c2-3 14-3 16 0" stroke="#5eead4" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}
