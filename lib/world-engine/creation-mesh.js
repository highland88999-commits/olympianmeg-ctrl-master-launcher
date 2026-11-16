// World Engine — creation mesh: the ONE builder of a forged asset's 3D
// mesh, shared by the live preview (MiniViewport) and the profile
// download (creation-download.js).
//
// Moved here verbatim from MiniViewport's build switch (Nov 15, 2026):
// the preview and the downloaded file are built by the same code from
// the same generation_params, so they can never drift apart. THREE is
// passed in so this lib stays bundler-agnostic; the builders themselves
// are client-side (canvas textures for the Omega badge and the particle
// sprites), exactly as the preview already was.
import { buildWeapon } from './weapon-builder.js';
import { buildWeatherSystem } from './weather-builder.js';
import { buildWorld } from './world-builder.js';
import { makeOmegaBadge } from '../omega-brand.js';

const THEME_COLORS = {
  weapon: 0xffd700,
  character: 0xff00ff,
  object: 0x00ffcc,
  vehicle: 0xff5500,
  weather: 0x0055ff,
  world: 0x00f0ff,
  asset_link: 0x00ff00,
};

export function creationThemeColor(category) {
  return THEME_COLORS[category] || 0xffffff;
}

// buildCreationMesh(THREE, category, params) -> THREE.Object3D.
// The mesh the preview shows and the mesh the download exports.
// Weather systems carry their sky color on mesh.userData.skyColor and
// their per-frame behaviour on mesh.userData.update, exactly as the
// preview consumes them.
export function buildCreationMesh(THREE, category, params) {
  const p = params || {};
  const themeHex = creationThemeColor(category);
  let geometry;
  let material;
  let mesh;

  if (category !== 'weapon') {
    material = new THREE.MeshStandardMaterial({
      color: themeHex,
      emissive: themeHex,
      emissiveIntensity: 0.4,
      wireframe: category === 'world',
      transparent: true,
      opacity: 0.9,
    });
  }

  switch (category) {
    case 'weapon':
      // CoD-level procedural build with gold Omega branding.
      mesh = buildWeapon(THREE, p);
      mesh.rotation.y = Math.PI / 2; // side profile to the camera
      mesh.position.y = 0.85;
      break;
    case 'character':
      geometry = new THREE.CapsuleGeometry(0.5, p.height || 1.8, 4, 16);
      break;
    case 'object':
    case 'asset_link':
      geometry = new THREE.BoxGeometry(p.scale?.x || 1, p.scale?.y || 1, p.scale?.z || 1);
      break;
    case 'vehicle':
      geometry = new THREE.BoxGeometry(2, 0.8, 4);
      if (p.speed) geometry.scale(1, 1, 1 + p.speed * 0.005);
      break;
    case 'world':
      // Textured procedural planet: displaced terrain, biome colors,
      // atmosphere shell, slow spin, gold Ω stamp (inside buildWorld).
      mesh = buildWorld(THREE, p);
      mesh.position.y = 0.4;
      break;
    case 'weather': {
      // Full weather system: rain, snow, fog, storm, ash, clear — each with
      // its own particles, palette, and per-frame behavior.
      mesh = buildWeatherSystem(THREE, p);
      mesh.position.y = 0.5;
      break;
    }
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  if (!mesh) mesh = new THREE.Mesh(geometry, material);

  // Golden Ω brand stamp on every forge preview (weapons brand inside buildWeapon).
  // Each badge is placed for the category: chest emblem, front decal, hood mark, floating stamp.
  if (category === 'character') {
    const badge = makeOmegaBadge(THREE, 0.35);
    badge.position.set(0, 0.55, 0.52); // chest, just off the capsule surface
    mesh.add(badge);
  } else if (category === 'object' || category === 'asset_link') {
    const badge = makeOmegaBadge(THREE, 0.3);
    const depth = p.scale?.z || 1;
    badge.position.set(0, 0, depth / 2 + 0.012); // front face
    mesh.add(badge);
  } else if (category === 'vehicle') {
    const badge = makeOmegaBadge(THREE, 0.4);
    badge.position.set(0, 0.1, 2.012); // hood/front mark
    mesh.add(badge);
  }
  // world carries its Ω stamp inside buildWorld; weather is raw particles.

  if (category === 'character') mesh.position.y = (p.height || 1.8) / 2 + 0.25;
  if (category === 'object' || category === 'asset_link') mesh.position.y = (p.scale?.y || 1) / 2;
  if (category === 'vehicle') mesh.position.y = 0.4;

  return mesh;
}
