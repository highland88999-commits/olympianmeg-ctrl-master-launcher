// lib/gta/streaming.js — three.js side of endless GTA cities (Wave 4,
// Nov 18, 2026). The pure law lives in lib/infinite/streaming.js;
// this module builds the meshes: one flat ground quad per chunk and
// the tileable ground textures that keep the home road grid going.
//
// TILE ALIGNMENT (read from the home painters, not assumed): every
// home ground texture paints its road grid from the same origin the
// chunk UVs use, so the grid continues seamlessly across the home
// edge:
//   Mega City: roads occupy [grid, grid+12] m, grid = -300 + 40k.
//     Tile (40 m): road on the west/north edges, 0..12 m.
//   Truman: roads occupy [grid, grid+10] m, grid = -250 + 60k.
//     Tile (60 m): road on the west/north edges, 0..10 m, sidewalks
//     flanking it (10..13 m and 57..60 m), centre dashes at 5 m.
//   Babel district: roads are strokes CENTRED on grid = -300 + 44k,
//     width 14 m. Tile (44 m): road split across the edges,
//     0..7 m and 37..44 m, gold dashes on the tile edge itself.

import * as THREE from 'three';
import { CHUNK_M, chunkBounds } from '../infinite/streaming.js';

import { chunkGroundGeometry } from '../infinite/streaming.js';

// A ground chunk mesh: quad at chunk offset, y just under the home
// plane so the two never z-fight where they overlap.
export function chunkGroundMesh(cx, cz, material, tileM, originX = 0, originZ = 0, y = -0.02) {
  const { x0, z0 } = chunkBounds(cx, cz);
  const mesh = new THREE.Mesh(chunkGroundGeometry(cx, cz, tileM, originX, originZ), material);
  mesh.position.set(x0, y, z0);
  mesh.rotation.x = 0;
  mesh.receiveShadow = true;
  mesh.name = 'endless-ground';
  return mesh;
}

function tileTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Mega City ground tile: 40 m. Asphalt base, road strips on the
// west + north edges (0..12 m), gold centre dashes at 6 m, pale
// sidewalk lines just inside the block (12..14 m).
export function createCityGroundTileTexture() {
  return tileTexture(256, (ctx, S) => {
    const px = (m) => (m / 40) * S;
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1e2126';
    ctx.fillRect(0, 0, px(12), S);
    ctx.fillRect(0, 0, S, px(12));
    // Gold centre dashes on the road middles (6 m in).
    ctx.fillStyle = '#c8a84b';
    const dash = px(7), gap = px(7), w = 2;
    for (let y = 0; y < S; y += dash + gap) ctx.fillRect(px(6) - w / 2, y, w, dash);
    for (let x = 0; x < S; x += dash + gap) ctx.fillRect(x, px(6) - w / 2, dash, w);
    // Sidewalk lines just inside the block edge.
    ctx.fillStyle = '#3a3e45';
    ctx.fillRect(px(12), 0, px(2), S);
    ctx.fillRect(0, px(12), S, px(2));
  });
}

// Truman ground tile: 60 m. Perfect-green grass base, road strips
// on the west + north edges (0..10 m), pale sidewalk strips
// flanking each road (10..13 m and 57..60 m), pale-yellow centre
// dashes at 5 m, white edge lines at the road rims.
export function createTownGroundTileTexture() {
  return tileTexture(256, (ctx, S) => {
    const px = (m) => (m / 60) * S;
    ctx.fillStyle = '#4a7c3a';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#33363b';
    ctx.fillRect(0, 0, px(10), S);
    ctx.fillRect(0, 0, S, px(10));
    ctx.fillStyle = '#a89e88';
    ctx.fillRect(px(10), 0, px(3), S);
    ctx.fillRect(px(57), 0, px(3), S);
    ctx.fillRect(0, px(10), S, px(3));
    ctx.fillRect(0, px(57), S, px(3));
    ctx.fillStyle = 'rgba(216,194,122,0.85)';
    const dash = px(6.8), gap = px(5.9);
    for (let y = 0; y < S; y += dash + gap) ctx.fillRect(px(5) - 1.5, y, 3, dash);
    for (let x = 0; x < S; x += dash + gap) ctx.fillRect(x, px(5) - 1.5, dash, 3);
    ctx.fillStyle = 'rgba(230,230,230,0.35)';
    ctx.fillRect(px(1), 0, 2, S);
    ctx.fillRect(px(9) - 2, 0, 2, S);
    ctx.fillRect(0, px(1), S, 2);
    ctx.fillRect(0, px(9) - 2, S, 2);
  });
}

// Babel district ground tile: 44 m. Dark asphalt base, road strips
// centred on the tile edges (0..7 m and 37..44 m — one 14 m road
// straddling each edge), gold dashes on the edge itself.
export function createBabelGroundTileTexture() {
  return tileTexture(256, (ctx, S) => {
    const px = (m) => (m / 44) * S;
    ctx.fillStyle = '#23252c';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2e3138';
    ctx.fillRect(0, 0, px(7), S);
    ctx.fillRect(px(37), 0, px(7), S);
    ctx.fillRect(0, 0, S, px(7));
    ctx.fillRect(0, px(37), S, px(7));
    // Gold dashes ride the road centre — the tile edge, so each
    // dash is drawn as two halves that join across the repeat.
    ctx.fillStyle = 'rgba(240,200,100,0.5)';
    const dash = px(7), gap = px(7), w = 2;
    for (let y = 0; y < S; y += dash + gap) {
      ctx.fillRect(0, y, w / 2, dash);
      ctx.fillRect(S - w / 2, y, w / 2, dash);
    }
    for (let x = 0; x < S; x += dash + gap) {
      ctx.fillRect(x, 0, dash, w / 2);
      ctx.fillRect(x, S - w / 2, dash, w / 2);
    }
  });
}

// The world offset of a chunk's near corner (for mesh.position).
export function chunkOrigin(cx, cz) {
  const { x0, z0 } = chunkBounds(cx, cz);
  return { x0, z0 };
}

export { CHUNK_M };
