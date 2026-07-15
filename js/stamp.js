// Deterministic generative artwork. Pure functions only — no Math.random anywhere.
// Seed = FNV-1a hash of "lat.toFixed(2),lng.toFixed(2)" fed into a mulberry32 PRNG.
// The draw order in deriveSeed() is normative (§8.2) and must not be reordered.

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

// The seven fixed draws (§8.2), plus the rng itself so motif 4 can keep drawing.
export function deriveSeed(lat, lng) {
  const seedString = seedStringFor(lat, lng);
  const rng = mulberry32(fnv1a(seedString));
  const hueA = Math.floor(rng() * 360);
  const hueB = (hueA + 140 + Math.floor(rng() * 80)) % 360;
  const motif = Math.floor(rng() * 5);
  const sunX = 0.2 + rng() * 0.6;
  const sunY = 0.2 + rng() * 0.35;
  const bandCount = 3 + Math.floor(rng() * 4);
  const postmarkRot = -8 + rng() * 6;
  return { seedString, rng, hueA, hueB, motif, sunX, sunY, bandCount, postmarkRot };
}

export function paletteFor(hueA, hueB) {
  return {
    deep: `hsl(${hueA} 45% 24%)`,
    mid: `hsl(${hueA} 50% 48%)`,
    light: `hsl(${hueA} 40% 78%)`,
    accent: `hsl(${hueB} 55% 55%)`,
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
  const sat = lerp(40, 45, t);
  const light = lerp(78, 24, t);
  return `hsl(${hueA} ${sat}% ${light}%)`;
}

// All motif functions draw into the unit square [0,1]x[0,1]; callers scale/position via a transform.

function motifHorizon(rng, hueA, palette, bandCount, sunX, sunY) {
  const g = el('g');
  g.appendChild(el('circle', { cx: sunX, cy: sunY, r: 0.1, fill: palette.accent }));
  const top = 0.4;
  const bandHeight = (1 - top) / bandCount;
  for (let i = 0; i < bandCount; i++) {
    const yBase = top + i * bandHeight;
    const amp = 0.012 + 0.006 * i;
    const freq = 1.5 + i * 0.4;
    const phase = (hueA / 360) * Math.PI * 2 + i * 1.3;
    const points = [];
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      const y = yBase + amp * Math.sin(x * Math.PI * 2 * freq + phase);
      points.push(`${x},${y}`);
    }
    const d = `M0,1 L${points.join(' L')} L1,1 Z`;
    g.appendChild(el('path', { d, fill: bandColor(hueA, i / Math.max(1, bandCount - 1)) }));
  }
  return g;
}

function motifSunburst(rng, hueA, palette, sunX, sunY) {
  const g = el('g');
  const rayCount = 16;
  for (let i = 0; i < rayCount; i++) {
    const a0 = (i / rayCount) * Math.PI * 2;
    const a1 = ((i + 0.5) / rayCount) * Math.PI * 2;
    const len = 1.4;
    const x1 = sunX + Math.cos(a0) * len;
    const y1 = sunY + Math.sin(a0) * len;
    const x2 = sunX + Math.cos(a1) * len;
    const y2 = sunY + Math.sin(a1) * len;
    if (i % 2 === 0) {
      g.appendChild(el('path', { d: `M${sunX},${sunY} L${x1},${y1} L${x2},${y2} Z`, fill: palette.deep }));
    }
  }
  g.appendChild(el('circle', { cx: sunX, cy: sunY, r: 0.13, fill: palette.accent }));
  return g;
}

function motifWaves(rng, hueA, palette) {
  const g = el('g');
  g.appendChild(el('rect', { x: 0, y: 0, width: 1, height: 1, fill: palette.light }));
  const ribbons = 5;
  for (let i = 0; i < ribbons; i++) {
    const yBase = (i + 0.5) / ribbons;
    const amp = 0.06;
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
  return g;
}

function motifPeaks(rng, hueA, palette, sunX, sunY) {
  const g = el('g');
  g.appendChild(el('circle', { cx: sunX, cy: sunY, r: 0.11, fill: palette.accent }));
  const peaks = [
    { x: 0.15, w: 0.7, h: 0.55, color: palette.mid },
    { x: 0.5, w: 0.75, h: 0.7, color: palette.deep },
    { x: 0.8, w: 0.6, h: 0.5, color: palette.mid },
  ];
  for (const p of peaks) {
    const d = `M${p.x - p.w / 2},1 L${p.x},${1 - p.h} L${p.x + p.w / 2},1 Z`;
    g.appendChild(el('path', { d, fill: p.color, opacity: 0.92 }));
  }
  return g;
}

function motifScatter(rng, hueA, palette) {
  const g = el('g');
  g.appendChild(el('rect', { x: 0, y: 0, width: 1, height: 1, fill: palette.light }));
  for (let i = 0; i < 40; i++) {
    const x = rng();
    const y = rng();
    const r = 0.01 + rng() * 0.03;
    g.appendChild(el('circle', { cx: x, cy: y, r, fill: i % 2 === 0 ? palette.mid : palette.accent }));
  }
  return g;
}

export function buildMotif(seed, palette) {
  switch (seed.motif) {
    case 0:
      return motifHorizon(seed.rng, seed.hueA, palette, seed.bandCount, seed.sunX, seed.sunY);
    case 1:
      return motifSunburst(seed.rng, seed.hueA, palette, seed.sunX, seed.sunY);
    case 2:
      return motifWaves(seed.rng, seed.hueA, palette);
    case 3:
      return motifPeaks(seed.rng, seed.hueA, palette, seed.sunX, seed.sunY);
    default:
      return motifScatter(seed.rng, seed.hueA, palette);
  }
}

function grainFilter(id) {
  const filter = el('filter', { id, x: '-5%', y: '-5%', width: '110%', height: '110%' });
  filter.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9', numOctaves: '2', seed: '3', result: 'noise' }));
  filter.appendChild(el('feColorMatrix', { in: 'noise', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0' }));
  filter.appendChild(el('feComposite', { operator: 'over', in2: 'SourceGraphic' }));
  return filter;
}

// 4:5 stamp, 120x150 viewBox units.
export function renderStampSVG(payload) {
  const seed = deriveSeed(payload.lat, payload.lng);
  const palette = paletteFor(seed.hueA, seed.hueB);
  const maskId = `perf-${seed.seedString.replace(/[^a-z0-9]/gi, '_')}`;

  const svg = el('svg', { viewBox: '0 0 120 150', xmlns: SVG_NS, class: 'stamp-svg' });

  const defs = el('defs');
  const mask = el('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 120, height: 150 });
  mask.appendChild(el('rect', { x: 0, y: 0, width: 120, height: 150, fill: 'white' }));
  const spacing = 9;
  const r = 4;
  for (let x = spacing / 2; x < 120; x += spacing) {
    mask.appendChild(el('circle', { cx: x, cy: 0, r, fill: 'black' }));
    mask.appendChild(el('circle', { cx: x, cy: 150, r, fill: 'black' }));
  }
  for (let y = spacing / 2; y < 150; y += spacing) {
    mask.appendChild(el('circle', { cx: 0, cy: y, r, fill: 'black' }));
    mask.appendChild(el('circle', { cx: 120, cy: y, r, fill: 'black' }));
  }
  defs.appendChild(mask);
  svg.appendChild(defs);

  const margin = el('g', { mask: `url(#${maskId})` });
  margin.appendChild(el('rect', { x: 0, y: 0, width: 120, height: 150, fill: '#fefdfa' }));
  svg.appendChild(margin);

  const inset = 8;
  svg.appendChild(el('rect', {
    x: inset, y: inset, width: 120 - inset * 2, height: 150 - inset * 2,
    fill: 'none', stroke: palette.deep, 'stroke-width': 1.5,
  }));

  const motifInset = inset + 1.5;
  const motifSize = 120 - motifInset * 2;
  const motifClipId = `${maskId}-clip`;
  defs.appendChild(el('clipPath', { id: motifClipId }, [
    el('rect', { x: motifInset, y: motifInset, width: motifSize, height: motifSize * 0.72 }),
  ]));
  const clipGroup = el('g', { 'clip-path': `url(#${motifClipId})` });
  const motifGroup = el('g', {
    transform: `translate(${motifInset},${motifInset}) scale(${motifSize},${motifSize * 0.72})`,
  });
  motifGroup.appendChild(buildMotif(seed, palette));
  clipGroup.appendChild(motifGroup);
  svg.appendChild(clipGroup);

  const stripY = motifInset + motifSize * 0.72 + 4;
  const place = el('text', {
    x: 60, y: stripY, 'text-anchor': 'middle', class: 'stamp-place',
  });
  place.textContent = (payload.pl || '').toUpperCase();
  svg.appendChild(place);

  const corner = el('text', { x: 120 - inset - 2, y: 150 - inset - 3, 'text-anchor': 'end', class: 'stamp-corner' });
  corner.textContent = `${Math.abs(payload.lat).toFixed(1)}°${payload.lat >= 0 ? 'N' : 'S'}`;
  svg.appendChild(corner);

  return svg;
}

// Full-bleed 3:2 front artwork (no lockup text — render-card.js overlays that separately).
export function renderFrontSVG(payload) {
  const seed = deriveSeed(payload.lat, payload.lng);
  const palette = paletteFor(seed.hueA, seed.hueB);

  const svg = el('svg', { viewBox: '0 0 300 200', xmlns: SVG_NS, class: 'front-svg', preserveAspectRatio: 'none' });
  const defs = el('defs');
  const filterId = `grain-${seed.seedString.replace(/[^a-z0-9]/gi, '_')}`;
  defs.appendChild(grainFilter(filterId));
  svg.appendChild(defs);

  svg.appendChild(el('rect', { x: 0, y: 0, width: 300, height: 200, fill: palette.paper }));

  const motifGroup = el('g', { transform: 'scale(300,200)' });
  motifGroup.appendChild(buildMotif(seed, palette));
  svg.appendChild(motifGroup);

  svg.appendChild(el('rect', { x: 0, y: 0, width: 300, height: 200, fill: 'none', filter: `url(#${filterId})` }));

  const frameInset = 10;
  svg.appendChild(el('rect', {
    x: frameInset, y: frameInset, width: 300 - frameInset * 2, height: 200 - frameInset * 2,
    fill: 'none', stroke: palette.deep, 'stroke-width': 1, opacity: 0.5,
  }));
  svg.appendChild(el('rect', {
    x: frameInset + 3, y: frameInset + 3, width: 300 - (frameInset + 3) * 2, height: 200 - (frameInset + 3) * 2,
    fill: 'none', stroke: palette.deep, 'stroke-width': 0.6, opacity: 0.4,
  }));

  return svg;
}
