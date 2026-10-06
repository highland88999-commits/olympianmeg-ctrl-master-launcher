// lib/omega-brand.js — shared gold Omega brand mark.
//
// Canvas-drawn metallic gold Ω medallion decal: the manufacturer's mark used
// across Olympus weapon surfaces (World Engine forge, ENYO keeps its own
// local copy). THREE is passed in so this lib stays bundler-agnostic.
// The texture is cached per module instance; client-side only (uses document).

let _tex = null;

/** Metallic gold Ω medallion texture (128px canvas, cached). */
export function getOmegaTexture(THREE) {
  if (_tex) return _tex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  const grad = x.createLinearGradient(0, 18, 0, 112);
  grad.addColorStop(0, '#fff3c4');
  grad.addColorStop(0.45, '#ffd700');
  grad.addColorStop(0.75, '#c9962e');
  grad.addColorStop(1, '#8a5a14');
  x.fillStyle = grad;
  x.font = '900 88px Georgia, "Times New Roman", serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(255, 200, 60, 0.8)';
  x.shadowBlur = 8;
  x.fillText('Ω', 64, 68);
  x.shadowBlur = 0;
  x.strokeStyle = '#e8b93c';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(64, 64, 57, 0, Math.PI * 2);
  x.stroke();
  _tex = new THREE.CanvasTexture(c);
  _tex.anisotropy = 4;
  return _tex;
}

/**
 * A gold Ω decal plane sized `size` (world units), pre-rotated to face -X
 * (the left side of a weapon built muzzle-toward--Z). Position it against
 * the receiver/stock surface; polygonOffset keeps it off the surface.
 */
export function makeOmegaDecal(THREE, size) {
  const s = Number.isFinite(size) && size > 0 ? Math.min(size, 1) : 0.08;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(s, s),
    new THREE.MeshStandardMaterial({
      map: getOmegaTexture(THREE),
      transparent: true,
      opacity: 0.95,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x664400,
      emissiveIntensity: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  m.rotation.y = -Math.PI / 2;
  return m;
}

/** Test hook: drop the cached texture. */
export function resetOmegaBrandCache() {
  _tex = null;
}
