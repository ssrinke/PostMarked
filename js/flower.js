// Pressed-flower charm artwork (v1.7 §5). Flat, slightly irregular, no gradients — reads as a
// dried flower pressed onto the card. `fl` is 1-4; 0/undefined means no charm.

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEM = '#6B7042';

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
}

export function normalizeFlower(fl) {
  const n = Number(fl);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 0;
}

function rose() {
  return [
    el('path', { d: 'M20,58 L20,28', stroke: STEM, 'stroke-width': 2, fill: 'none' }),
    el('path', { d: 'M20,44 Q12,41 10,47 Q16,49 20,44 Z', fill: STEM }),
    el('g', { transform: 'translate(20,16)' }, [
      el('path', { d: 'M0,-13 Q10,-10 9,0 Q10,10 0,13 Q-10,10 -9,0 Q-10,-10 0,-13 Z', fill: '#B85C4A', opacity: '0.85' }),
      el('path', { d: 'M0,-9 Q6.5,-7 5.5,0 Q6.5,7 0,9 Q-6.5,7 -5.5,0 Q-6.5,-7 0,-9 Z', fill: '#B85C4A' }),
      el('circle', { cx: 0, cy: 0, r: 2.6, fill: '#8C4433' }),
    ]),
  ];
}

function daisy() {
  const petals = [];
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    const cx = Math.cos(rad) * 9;
    const cy = Math.sin(rad) * 9;
    petals.push(el('ellipse', { cx, cy, rx: 3, ry: 6.5, transform: `rotate(${a} ${cx} ${cy})`, fill: '#F3ECDA' }));
  }
  return [
    el('path', { d: 'M20,58 L20,29', stroke: STEM, 'stroke-width': 2, fill: 'none' }),
    el('path', { d: 'M20,43 Q28,40 30,46 Q24,48 20,43 Z', fill: STEM }),
    el('g', { transform: 'translate(20,16)' }, [
      ...petals,
      el('circle', { cx: 0, cy: 0, r: 4, fill: '#D9A441' }),
    ]),
  ];
}

function lavender() {
  const buds = [
    [20, 10, 2.2, 3.4], [16, 15, 2, 3.1], [24, 15, 2, 3.1],
    [17, 21, 2, 3.1], [23, 21, 2, 3.1], [20, 26, 2, 3.1],
    [16.5, 31, 1.8, 2.9], [23.5, 31, 1.8, 2.9],
  ];
  return [
    el('path', { d: 'M20,58 L20,10', stroke: STEM, 'stroke-width': 1.8, fill: 'none' }),
    el('g', { fill: '#8E7FA8' }, buds.map(([cx, cy, rx, ry]) => el('ellipse', { cx, cy, rx, ry, opacity: '0.9' }))),
  ];
}

function forgetMeNotBloom(cx, cy, scale) {
  const petals = [];
  const angles = [270, 342, 54, 126, 198];
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    const px = Math.cos(rad) * 5.5 * scale;
    const py = Math.sin(rad) * 5.5 * scale;
    petals.push(el('ellipse', { cx: px, cy: py, rx: 2.4 * scale, ry: 3.4 * scale, transform: `rotate(${a} ${px} ${py})`, fill: '#8FAFD1' }));
  }
  return el('g', { transform: `translate(${cx},${cy})` }, [...petals, el('circle', { cx: 0, cy: 0, r: 1.5 * scale, fill: '#D9A441' })]);
}

function forgetMeNot() {
  return [
    el('path', { d: 'M20,58 L20,28', stroke: STEM, 'stroke-width': 1.8, fill: 'none' }),
    el('path', { d: 'M20,41 Q13,39 12,45 Q18,46 20,41 Z', fill: STEM }),
    forgetMeNotBloom(20, 16, 1),
    forgetMeNotBloom(13, 34, 0.65),
  ];
}

export function renderFlowerSVG(fl) {
  const n = normalizeFlower(fl);
  if (!n) return null;
  const svg = el('svg', { viewBox: '0 0 40 60', class: 'flower-svg' });
  const parts = { 1: rose, 2: daisy, 3: lavender, 4: forgetMeNot }[n]();
  for (const p of parts) svg.appendChild(p);
  return svg;
}

export function renderFlowerNoneIcon() {
  return el('svg', { viewBox: '0 0 32 32', class: 'flower-svg flower-svg--none' }, [
    el('circle', { cx: 16, cy: 16, r: 12, fill: 'none', stroke: '#A8946E', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }),
  ]);
}
