// lib/billboards-blank.js
// STOPGAP (Merlin, Nov 26, 2026 — "set all the billboards to blank
// screen"): every billboard face rendered as a plain blank screen —
// no canvas art, no video — until the hub crash was fixed for real.
//
// RETURN PATH (Nov 26, 2026): the crash is fixed by the shared
// canvas-face cache (lib/billboard-face-cache.js + usePanelFaceTexture
// in components/GodTower.jsx): 249 per-panel canvases collapsed to 6
// shared textures (~2,056 MB worst case -> 49.55 MB). The flag is OFF
// and the boards are back — labels, board numbers, videos.
//
// The flag stays as the emergency kill-switch: set BILLBOARDS_BLANK
// to true to blank the boards again. Nothing else needs to change.
// The round-1 deferral latch (releasePanelVideoLoad in
// components/GodTower.jsx) stays in the tree and still gates video
// content on textures + first frame + intro rotation ended.
//
// What the flag suppresses while true:
// - GodTower.jsx: the per-panel 1264x700 canvas faces
//   (usePanelFaceTexture), the per-panel video records
//   (usePanelVideoState), the hub preload
//   (preloadHubPanelVideos), and the number badges on the faces.
// - components/argo/BillboardMonument.jsx: the 3200x1800 canvas
//   and the video creative on the street monuments.
// What stays either way: the panel geometry (backing boxes, border
// rims, god names), the face click (still opens the slot's link /
// inquiry mail), the shared border textures (10 tiny 128x160
// canvases), and the single shared adTex JPEG load in
// TextureProvider.
export const BILLBOARDS_BLANK = false;
