// lib/billboards-blank.js
// STOPGAP (Merlin, Nov 26, 2026 — "set all the billboards to blank
// screen"): every billboard face renders as a plain blank screen —
// no canvas art, no video — until the hub crash is fixed for real
// and the boards come back.
//
// ONE flag, one place: set BILLBOARDS_BLANK to false to bring the
// boards back. Nothing else needs to change — the round-1 deferral
// latch (releasePanelVideoLoad in components/GodTower.jsx) stays in
// the tree, superseded by this flag while it is true.
//
// What it suppresses:
// - GodTower.jsx: the per-panel 1264x700 canvas faces
//   (usePanelFaceTexture), the per-panel video records
//   (usePanelVideoState), the hub preload
//   (preloadHubPanelVideos), and the number badges on the faces.
// - components/argo/BillboardMonument.jsx: the 3200x1800 canvas
//   and the video creative on the street monuments.
// What stays: the panel geometry (backing boxes, border rims, god
// names), the face click (still opens the slot's link / inquiry
// mail), the shared border textures (10 tiny 128x160 canvases),
// and the single shared adTex JPEG load in TextureProvider (one
// image, never applied to a face while blank).
// Accepted cost while blank: the faces lose their OLYMPUS labels
// and board numbers.
export const BILLBOARDS_BLANK = true;
