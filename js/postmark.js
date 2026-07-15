// Renders the postmark cancellation mark. Pure, deterministic — reuses stamp.js's seed derivation.
import { deriveSeed } from './stamp.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
}

function weatherWord(wc) {
  if (wc === 0) return 'CLEAR';
  if (wc === 1 || wc === 2) return 'FAIR';
  if (wc === 3) return 'OVERCAST';
  if (wc === 45 || wc === 48) return 'FOG';
  if (wc >= 51 && wc <= 57) return 'DRIZZLE';
  if (wc >= 61 && wc <= 67) return 'RAIN';
  if (wc >= 71 && wc <= 77) return 'SNOW';
  if (wc >= 80 && wc <= 82) return 'SHOWERS';
  if (wc === 85 || wc === 86) return 'SNOW';
  if (wc >= 95 && wc <= 99) return 'THUNDER';
  return null;
}

function formatDateForPostmark(d) {
  // d is "YYYY-MM-DD" -> "JUL 14 2026"
  const [y, m, day] = d.split('-').map(Number);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[m - 1]} ${day} ${y}`;
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = (Math.PI / 180) * startDeg;
  const e = (Math.PI / 180) * endDeg;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  return `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`;
}

export function renderPostmarkSVG(payload) {
  const seed = deriveSeed(payload.lat, payload.lng);
  const stroke = 'rgba(43,38,34,0.95)';
  const width = 150;
  const height = 130;
  const cx = 55;
  const cy = height / 2;

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`, xmlns: SVG_NS, class: 'postmark-svg',
  });

  const defs = el('defs');
  const filterId = `postmark-erode-${seed.seedString.replace(/[^a-z0-9]/gi, '_')}`;
  const filter = el('filter', { id: filterId });
  filter.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.4', numOctaves: '2', seed: '7', result: 'n' }));
  filter.appendChild(el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '1.1' }));
  defs.appendChild(filter);

  const arcId = `postmark-arc-${seed.seedString.replace(/[^a-z0-9]/gi, '_')}`;
  defs.appendChild(el('path', { id: arcId, d: arcPath(cx, cy, 40, 200, 340), fill: 'none' }));
  svg.appendChild(defs);

  const g = el('g', {
    transform: `rotate(${seed.postmarkRot} ${cx} ${cy})`,
    filter: `url(#${filterId})`,
  });

  g.appendChild(el('circle', { cx, cy, r: 52, fill: 'none', stroke, 'stroke-width': 2.1 }));
  g.appendChild(el('circle', { cx, cy, r: 43, fill: 'none', stroke, 'stroke-width': 1.8 }));

  const arcText = el('text', { class: 'postmark-arc-text', 'text-anchor': 'middle' });
  const textPath = el('textPath', { href: `#${arcId}`, 'xlink:href': `#${arcId}`, startOffset: '50%' });
  const placeLabel = payload.co && (payload.pl.length + payload.co.length + 2) <= 26
    ? `${payload.pl}, ${payload.co}` : payload.pl;
  textPath.textContent = (placeLabel || '').toUpperCase();
  arcText.appendChild(textPath);
  g.appendChild(arcText);

  const dateText = el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'postmark-date' });
  dateText.textContent = formatDateForPostmark(payload.d);
  g.appendChild(dateText);

  const timeText = el('text', { x: cx, y: cy + 9, 'text-anchor': 'middle', class: 'postmark-time' });
  timeText.textContent = payload.t;
  g.appendChild(timeText);

  const word = payload.wt !== undefined ? weatherWord(payload.wc) : null;
  if (payload.wt !== undefined) {
    const weatherText = el('text', { x: cx, y: cy + 19, 'text-anchor': 'middle', class: 'postmark-weather' });
    weatherText.textContent = word ? `${payload.wt}°C · ${word}` : `${payload.wt}°C`;
    g.appendChild(weatherText);
  }

  for (let i = 0; i < 5; i++) {
    const y = cy - 20 + i * 10;
    const x1 = cx + 48;
    const x2 = cx + 70;
    const d = `M${x1},${y} Q${(x1 + x2) / 2},${y - 6} ${x2},${y}`;
    g.appendChild(el('path', { d, fill: 'none', stroke, 'stroke-width': 2.1 }));
  }

  svg.appendChild(g);
  return svg;
}

export { weatherWord };
