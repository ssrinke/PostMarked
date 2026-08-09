// Deterministic seed derivation (still used by the postmark rotation and the tear-clip path) and
// the HTML stamp component. The generative front-artwork code path was retired in v1.8 §1 — card
// fronts are curated JPEGs now (see fronts.js) — but the draw order below stays exactly as it was
// so postmarkRot keeps producing the same angle for the same coordinates.
// Seed = FNV-1a hash of "lat.toFixed(2),lng.toFixed(2)" fed into a mulberry32 PRNG.

export function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedStringFor(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// The twelve fixed draws (§5), plus the rng itself so per-motif code can keep drawing.
function deriveSeedFromString(seedString) {
  const rng = mulberry32(fnv1a(seedString));
  const hueA = Math.floor(rng() * 360);
  const hueB = (hueA + 140 + Math.floor(rng() * 80)) % 360;
  const motif = Math.floor(rng() * 5);
  const sunX = 0.2 + rng() * 0.6;
  const sunY = 0.18 + rng() * 0.32;
  const bandCount = 3 + Math.floor(rng() * 4);
  const postmarkRot = -8 + rng() * 6;
  const birdCount = 2 + Math.floor(rng() * 3);
  const birdX = 0.15 + rng() * 0.5;
  const birdY = 0.12 + rng() * 0.2;
  const detailSeedA = rng();
  const detailSeedB = rng();
  return {
    seedString, rng, hueA, hueB, motif, sunX, sunY, bandCount, postmarkRot,
    birdCount, birdX, birdY, detailSeedA, detailSeedB,
  };
}

export function deriveSeed(lat, lng) {
  return deriveSeedFromString(seedStringFor(lat, lng));
}

// Supplied stamp artworks (v1.5b §1/§2). sv 0 = floral bouquet, sv 1 = goose medallion.
// Any other sv (including old payload's sv 2) falls back to sv 0 for back-compat.
export const STAMP_IMAGES = ['/assets/stamp-1.jpg', '/assets/stamp-2.jpg'];

export function normalizeStampVariant(sv) {
  return sv === 1 ? 1 : 0;
}

// HTML (not SVG <image>) stamp component (v1.6 §4) — eliminates the intrinsic-size/loading
// failure class the old SVG <image> mask approach was prone to. `svOverride` lets the stamp
// rack preview a specific variant regardless of the payload's chosen `sv`.
export function buildStampElement(payload, svOverride) {
  const sv = normalizeStampVariant(svOverride !== undefined ? svOverride : payload.sv);

  const stamp = document.createElement('div');
  stamp.className = 'stamp';

  const img = document.createElement('img');
  img.className = 'stamp__art';
  img.src = STAMP_IMAGES[sv];
  img.alt = '';
  img.loading = 'eager';
  img.decoding = 'async';
  stamp.appendChild(img);

  const perf = document.createElement('div');
  perf.className = 'stamp__perf';
  perf.setAttribute('aria-hidden', 'true');
  stamp.appendChild(perf);

  return stamp;
}
