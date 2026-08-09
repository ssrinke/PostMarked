// Deterministic generative artwork. Pure functions only — no Math.random anywhere.
// Seed = FNV-1a hash of "lat.toFixed(2),lng.toFixed(2)" fed into a mulberry32 PRNG.
// The draw order in deriveSeed() is normative (§5) and must not be reordered.

const SVG_NS = 'http://www.w3.org/2000/svg';

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

const SUN_COLOR = 'hsl(40 65% 70%)';

export function paletteFor(hueA, hueB) {
  return {
    deep: `hsl(${hueA} 38% 26%)`,
    mid: `hsl(${hueA} 42% 50%)`,
    light: `hsl(${hueA} 32% 80%)`,
    accent: `hsl(${hueB} 45% 58%)`,
    sun: SUN_COLOR,
    paper: `hsl(45 45% 94%)`,
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function bandColor(hueA, t) {
  const sat = lerp(32, 38, t);
  const light = lerp(80, 26, t);
  return `hsl(${hueA} ${sat}% ${light}%)`;
}

// Two-stroke chevron bird, deterministically placed from index + detail seeds.
function bird(cx, cy, scale, detailSeed, color) {
  const wing = 0.02 * scale;
  const flap = 0.006 + detailSeed * 0.006;
  const d = `M${cx - wing},${cy + flap} Q${cx},${cy - flap} ${cx + wing},${cy + flap}`;
  return el('path', { d, fill: 'none', stroke: color, 'stroke-width': 0.006 * scale, 'stroke-linecap': 'round' });
}

function birdFlock(g, seed, palette, scale) {
  for (let i = 0; i < seed.birdCount; i++) {
    const t = seed.birdCount <= 1 ? 0 : i / (seed.birdCount - 1);
    const jitterX = (seed.detailSeedA - 0.5) * 0.08 * (i + 1);
    const jitterY = (seed.detailSeedB - 0.5) * 0.04 * (i + 1);
    const cx = seed.birdX + t * 0.18 + jitterX;
    const cy = seed.birdY + jitterY;
    g.appendChild(bird(cx, cy, scale, (seed.detailSeedA + i * 0.37) % 1, palette.deep));
  }
}

function sunWithGlow(g, sunX, sunY, palette, r = 0.1) {
  g.appendChild(el('circle', { cx: sunX, cy: sunY, r: r * 1.8, fill: palette.sun, opacity: 0.18 }));
  g.appendChild(el('circle', { cx: sunX, cy: sunY, r, fill: palette.sun }));
}

function halftoneArc(g, seed, palette) {
  const count = 12 + Math.floor(seed.detailSeedA * 6);
  const y = 0.82;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = 0.1 + t * 0.8;
    const r = lerp(0.014, 0.003, t);
    g.appendChild(el('circle', { cx: x, cy: y + (1 - t) * 0.02, r, fill: palette.deep, opacity: 0.5 }));
  }
}

function sailboat(g, x, y, palette) {
  g.appendChild(el('path', { d: `M${x},${y} L${x},${y - 0.09} L${x + 0.06},${y} Z`, fill: palette.deep }));
  g.appendChild(el('path', { d: `M${x - 0.05},${y} L${x + 0.05},${y}`, stroke: palette.deep, 'stroke-width': 0.006, fill: 'none' }));
}

// All motif functions draw into the unit square [0,1]x[0,1]; callers scale/position via a transform.

function motifHorizon(seed, palette) {
  const g = el('g');
  sunWithGlow(g, seed.sunX, seed.sunY, palette);
  const top = 0.4;
  const bandHeight = (1 - top) / seed.bandCount;
  for (let i = 0; i < seed.bandCount; i++) {
    const yBase = top + i * bandHeight;
    const amp = 0.012 + 0.006 * i;
    const freq = 1.5 + i * 0.4;
    const phase = (seed.hueA / 360) * Math.PI * 2 + i * 1.3;
    const points = [];
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      const y = yBase + amp * Math.sin(x * Math.PI * 2 * freq + phase);
      points.push(`${x},${y}`);
    }
    const d = `M0,1 L${points.join(' L')} L1,1 Z`;
    g.appendChild(el('path', { d, fill: bandColor(seed.hueA, i / Math.max(1, seed.bandCount - 1)) }));
  }
  birdFlock(g, seed, palette, 1);

  const bumpCount = 2 + Math.round(seed.detailSeedB);
  const silY = 0.96;
  let d = `M0,1 L0,${silY}`;
  for (let i = 0; i < bumpCount; i++) {
    const x0 = (i / bumpCount) * 1;
    const x1 = ((i + 1) / bumpCount) * 1;
    const xm = (x0 + x1) / 2;
    const bumpH = 0.02 + seed.detailSeedA * 0.02;
    d += ` Q${xm},${silY - bumpH} ${x1},${silY}`;
  }
  d += ' L1,1 Z';
  g.appendChild(el('path', { d, fill: palette.deep, opacity: 0.9 }));
  return g;
}

function motifSunburst(seed, palette) {
  const g = el('g');
  const rayCount = 16;
  for (let i = 0; i < rayCount; i++) {
    const a0 = (i / rayCount) * Math.PI * 2;
    const a1 = ((i + (i % 2 === 0 ? 0.5 : 0.35)) / rayCount) * Math.PI * 2;
    const len = 1.4;
    const x1 = seed.sunX + Math.cos(a0) * len;
    const y1 = seed.sunY + Math.sin(a0) * len;
    const x2 = seed.sunX + Math.cos(a1) * len;
    const y2 = seed.sunY + Math.sin(a1) * len;
    g.appendChild(el('path', {
      d: `M${seed.sunX},${seed.sunY} L${x1},${y1} L${x2},${y2} Z`,
      fill: i % 2 === 0 ? palette.deep : palette.accent,
      opacity: i % 2 === 0 ? 1 : 0.7,
    }));
  }
  sunWithGlow(g, seed.sunX, seed.sunY, palette, 0.13);
  halftoneArc(g, seed, palette);
  return g;
}

function motifWaves(seed, palette) {
  const g = el('g');
  g.appendChild(el('rect', { x: 0, y: 0, width: 1, height: 1, fill: palette.light }));
  const ribbons = 5;
  for (let i = 0; i < ribbons; i++) {
    const yBase = (i + 0.5) / ribbons;
    const amp = 0.05 + (i % 3) * 0.02 + seed.detailSeedA * 0.02;
    const freq = 2 + i;
    const points = [];
    const steps = 32;
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      const y = yBase + amp * Math.sin(x * Math.PI * 2 * freq + i);
      points.push(`${x},${y}`);
    }
    const bandH = 1 / ribbons;
    const d = `M0,${yBase + bandH / 2} L${points.join(' L')} L1,${yBase + bandH / 2} Z`;
    g.appendChild(el('path', { d, fill: i % 2 === 0 ? palette.mid : palette.accent, opacity: 0.85 }));
  }
  sunWithGlow(g, seed.sunX, seed.sunY * 0.6, palette, 0.09);
  sailboat(g, seed.sunX, 0.55, palette);
  return g;
}

function motifPeaks(seed, palette) {
  const g = el('g');
  const peaks = [
    { x: 0.15, w: 0.7, h: 0.55, color: palette.mid },
    { x: 0.5, w: 0.75, h: 0.7, color: palette.deep },
    { x: 0.8, w: 0.6, h: 0.5, color: palette.mid },
  ];
  const tallest = peaks.reduce((a, b) => (b.h > a.h ? b : a));
  sunWithGlow(g, tallest.x, 1 - tallest.h - 0.08, palette, 0.09);
  birdFlock(g, seed, palette, 0.8);
  for (const p of peaks) {
    const d = `M${p.x - p.w / 2},1 L${p.x},${1 - p.h} L${p.x + p.w / 2},1 Z`;
    g.appendChild(el('path', { d, fill: p.color, opacity: 0.92 }));
    const snowH = p.h * (0.16 + seed.detailSeedB * 0.06);
    const t = snowH / p.h;
    const snowD = `M${p.x - p.w / 2 * t},${1 - p.h + snowH} L${p.x},${1 - p.h} L${p.x + p.w / 2 * t},${1 - p.h + snowH} Z`;
    g.appendChild(el('path', { d: snowD, fill: palette.light, opacity: 0.95 }));
  }
  return g;
}

function star4(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
  }
  return `M${pts.join(' L')} Z`;
}

function motifScatter(seed, palette) {
  const g = el('g');
  g.appendChild(el('rect', { x: 0, y: 0, width: 1, height: 1, fill: palette.light }));
  const shapes = ['circle', 'diamond', 'star'];
  const colors = [palette.mid, palette.accent, palette.sun];
  for (let i = 0; i < 40; i++) {
    const x = seed.rng();
    const y = seed.rng();
    const r = 0.01 + seed.rng() * 0.03;
    const shape = shapes[i % shapes.length];
    const color = colors[i % colors.length];
    if (shape === 'circle') {
      g.appendChild(el('circle', { cx: x, cy: y, r, fill: color }));
    } else if (shape === 'diamond') {
      const d = `M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z`;
      g.appendChild(el('path', { d, fill: color }));
    } else {
      g.appendChild(el('path', { d: star4(x, y, r), fill: color }));
    }
  }
  return g;
}

export function buildMotif(seed, palette) {
  switch (seed.motif) {
    case 0:
      return motifHorizon(seed, palette);
    case 1:
      return motifSunburst(seed, palette);
    case 2:
      return motifWaves(seed, palette);
    case 3:
      return motifPeaks(seed, palette);
    default:
      return motifScatter(seed, palette);
  }
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

// Full-bleed 3:2 front artwork (no lockup text — render-card.js overlays that separately).
// No grain filter here: the paper-card-v2.jpg texture overlay (render-card.js) provides it (v1.5a §3).
export function renderFrontSVG(payload) {
  const seed = deriveSeed(payload.lat, payload.lng);
  const palette = paletteFor(seed.hueA, seed.hueB);

  const svg = el('svg', { viewBox: '0 0 300 200', xmlns: SVG_NS, class: 'front-svg', preserveAspectRatio: 'none' });
  const defs = el('defs');
  svg.appendChild(defs);

  svg.appendChild(el('rect', { x: 0, y: 0, width: 300, height: 200, fill: palette.paper }));

  const motifGroup = el('g', { transform: 'scale(300,200)' });
  motifGroup.appendChild(buildMotif(seed, palette));
  svg.appendChild(motifGroup);

  const frameInset = 14;
  svg.appendChild(el('rect', {
    x: frameInset, y: frameInset, width: 300 - frameInset * 2, height: 200 - frameInset * 2,
    fill: 'none', stroke: palette.deep, 'stroke-width': 1, opacity: 0.5,
  }));
  svg.appendChild(el('rect', {
    x: frameInset + 3, y: frameInset + 3, width: 300 - (frameInset + 3) * 2, height: 200 - (frameInset + 3) * 2,
    fill: 'none', stroke: palette.deep, 'stroke-width': 0.6, opacity: 0.4,
  }));

  const tickSize = 3;
  const corners = [
    [frameInset, frameInset], [300 - frameInset, frameInset],
    [300 - frameInset, 200 - frameInset], [frameInset, 200 - frameInset],
  ];
  for (const [cx, cy] of corners) {
    const d = `M${cx - tickSize},${cy} L${cx},${cy - tickSize} L${cx + tickSize},${cy} L${cx},${cy + tickSize} Z`;
    svg.appendChild(el('path', { d, fill: palette.deep, opacity: 0.6 }));
  }

  return svg;
}
