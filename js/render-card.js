// Single renderer for the card DOM (front + back). Used by compose preview, dev.html, and card.html.
// All user/derived strings are inserted via textContent only — never innerHTML.
import { buildStampElement, renderFrontSVG } from './stamp.js';
import { renderPostmarkSVG } from './postmark.js';

// Index 0/1 (sepia, blue-black) are back-compat only — no longer offered in the compose ink tray.
// Index 2/3 (green, red) are the current tray; red is darkened from #8C3B2E to pass 4.5:1 on the
// v1.5a card texture (#D9C193 midtone).
export const INK_COLORS = ['#3A3128', '#2A3550', '#2F4A38', '#7E3529'];

const SVG_NS = 'http://www.w3.org/2000/svg';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
}

// Fixed scrapbook cluster for the card back's lower-right, unrelated to payload — same on every
// card (v1.5b §5). Greeked text only: wavy placeholder lines, no legible words or letters.
function tulipBloom(cx, cy, color) {
  return svgEl('g', {}, [
    svgEl('path', { d: `M${cx - 4},${cy + 6} Q${cx - 6},${cy - 4} ${cx},${cy - 8} Q${cx - 2},${cy - 2} ${cx - 4},${cy + 6} Z`, fill: color }),
    svgEl('path', { d: `M${cx},${cy + 6} Q${cx - 2},${cy - 6} ${cx},${cy - 10} Q${cx + 2},${cy - 6} ${cx},${cy + 6} Z`, fill: color }),
    svgEl('path', { d: `M${cx + 4},${cy + 6} Q${cx + 6},${cy - 4} ${cx},${cy - 8} Q${cx + 2},${cy - 2} ${cx + 4},${cy + 6} Z`, fill: color }),
  ]);
}

function buildEphemeraCluster() {
  const svg = svgEl('svg', { viewBox: '0 0 150 110', class: 'back-ephemera-svg', 'aria-hidden': 'true' });

  const scrapGroup = svgEl('g', { transform: 'rotate(-4 78 62)' });
  const tornPath = 'M18,26 L46,22 L74,25 L102,20 L124,24 L136,32 L134,60 L138,78 L128,96 L100,100 L70,97 L42,101 L20,94 L14,68 L20,48 Z';
  scrapGroup.appendChild(svgEl('path', { d: tornPath, fill: '#F3ECDA', opacity: 0.9 }));

  const lineYs = [38, 46, 54, 62, 70, 78, 86];
  const lineWidths = [70, 64, 72, 58, 66, 50, 60];
  lineYs.forEach((y, i) => {
    const w = lineWidths[i];
    scrapGroup.appendChild(svgEl('path', {
      d: `M26,${y} q${w * 0.25},-3 ${w * 0.5},0 t${w * 0.5},0`,
      fill: 'none', stroke: '#B9A990', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.55,
    }));
  });
  scrapGroup.appendChild(svgEl('path', { d: 'M40,34 L116,34', stroke: '#8A7B66', 'stroke-width': 1, opacity: 0.5 }));
  scrapGroup.appendChild(svgEl('circle', { cx: 78, cy: 34, r: 2, fill: '#8A7B66', opacity: 0.5 }));
  svg.appendChild(scrapGroup);

  const sprig = svgEl('g', { transform: 'translate(110,8) rotate(6)' });
  sprig.appendChild(svgEl('path', { d: 'M4,40 Q2,20 10,4', stroke: '#6B7042', 'stroke-width': 1.6, fill: 'none' }));
  sprig.appendChild(svgEl('path', { d: 'M18,34 Q20,18 14,6', stroke: '#6B7042', 'stroke-width': 1.4, fill: 'none' }));
  sprig.appendChild(svgEl('path', { d: 'M6,26 Q-2,22 -6,28 Q0,30 6,26 Z', fill: '#6B7042' }));
  sprig.appendChild(svgEl('path', { d: 'M16,22 Q24,18 26,24 Q18,26 16,22 Z', fill: '#6B7042' }));
  sprig.appendChild(tulipBloom(10, 4, '#B85C4A'));
  sprig.appendChild(tulipBloom(20, 10, '#E8A7B0'));
  svg.appendChild(sprig);

  const gingham = svgEl('g', { transform: 'translate(24,90) rotate(8)' });
  gingham.appendChild(svgEl('rect', { x: 0, y: 0, width: 22, height: 22, fill: '#F3ECDA' }));
  for (let i = 0; i < 22; i += 5) {
    gingham.appendChild(svgEl('rect', { x: i, y: 0, width: 2.5, height: 22, fill: '#8FAFD1', opacity: 0.5 }));
    gingham.appendChild(svgEl('rect', { x: 0, y: i, width: 22, height: 2.5, fill: '#8FAFD1', opacity: 0.5 }));
  }
  gingham.appendChild(svgEl('rect', { x: 0, y: 0, width: 22, height: 22, fill: 'none', stroke: '#8FAFD1', 'stroke-width': 0.6, opacity: 0.6 }));
  svg.appendChild(gingham);

  return svg;
}

function text(tag, className, str) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = str;
  return node;
}

function formatCoords(lat, lng) {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
}

function buildFront(payload) {
  const front = h('div', { className: 'postcard-face postcard-front' });
  front.appendChild(renderFrontSVG(payload));
  front.appendChild(h('div', { className: 'front-texture-overlay' }));

  const lockup = h('div', { className: 'front-lockup' });
  const headline = payload.ti || payload.pl || '';
  lockup.appendChild(text('div', 'front-headline', headline));
  const co = payload.co ? `${payload.co} · ` : '';
  lockup.appendChild(text('div', 'front-coords', `${co}${formatCoords(payload.lat, payload.lng)}`));
  front.appendChild(lockup);

  return front;
}

function buildBack(payload, options = {}) {
  const { editable = false, onMessageInput, onSignatureInput, onToInput } = options;
  const back = h('div', { className: 'postcard-face postcard-back' });
  const ink = INK_COLORS[payload.ink || 0];

  const left = h('div', { className: 'back-left' });

  if (editable || payload.to) {
    const toLine = h('div', { className: 'back-to-line' });
    toLine.appendChild(text('span', 'back-line-label', 'To'));
    if (editable) {
      const toInput = h('input', { className: 'back-to-input', type: 'text', maxlength: '30', placeholder: 'Their name' });
      toInput.value = payload.to || '';
      toInput.style.color = ink;
      if (onToInput) toInput.addEventListener('input', () => onToInput(toInput.value));
      toLine.appendChild(toInput);
    } else {
      const toName = text('span', 'back-to-name', payload.to);
      toName.style.color = ink;
      toLine.appendChild(toName);
    }
    left.appendChild(toLine);
  }

  if (editable) {
    const textarea = h('textarea', { className: 'back-message-input', maxlength: '300', placeholder: 'Write your message…' });
    textarea.value = payload.m || '';
    textarea.style.color = ink;
    if (onMessageInput) textarea.addEventListener('input', () => onMessageInput(textarea.value));
    left.appendChild(textarea);
  } else {
    const messageEl = text('div', 'back-message', payload.m || '');
    messageEl.style.color = ink;
    left.appendChild(messageEl);
  }

  const fromLine = h('div', { className: 'back-signature-line' });
  fromLine.appendChild(text('span', 'back-line-label', 'From'));
  if (editable) {
    const sigInput = h('input', { className: 'back-signature-input', type: 'text', maxlength: '40', placeholder: 'Your name' });
    sigInput.value = payload.s || '';
    sigInput.style.color = ink;
    if (onSignatureInput) sigInput.addEventListener('input', () => onSignatureInput(sigInput.value));
    fromLine.appendChild(sigInput);
  } else {
    const sigEl = text('span', 'back-signature', payload.s || '');
    sigEl.style.color = ink;
    fromLine.appendChild(sigEl);
  }
  left.appendChild(fromLine);

  back.appendChild(left);

  back.appendChild(h('div', { className: 'back-rule' }));

  const right = h('div', { className: 'back-right' });
  right.appendChild(text('div', 'back-heading', 'POST CARD / CARTE POSTALE'));

  const stampGuide = h('div', { className: 'stamp-guide' });
  stampGuide.appendChild(text('div', 'stamp-guide-label', 'AFFIX STAMP'));
  right.appendChild(stampGuide);

  const stampWrap = h('div', { className: 'back-stamp' });
  stampWrap.appendChild(buildStampElement(payload));
  right.appendChild(stampWrap);

  if (payload.d && payload.t) {
    const postmarkWrap = h('div', { className: 'back-postmark' });
    postmarkWrap.appendChild(renderPostmarkSVG(payload));
    right.appendChild(postmarkWrap);
  }

  const ephemeraWrap = h('div', { className: 'back-ephemera' });
  ephemeraWrap.appendChild(buildEphemeraCluster());
  right.appendChild(ephemeraWrap);

  if (!editable) {
    const hit = h('div', {
      className: 'stamp-cluster-hit',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Inspect the stamp and postmark',
    });
    right.appendChild(hit);
  }

  back.appendChild(right);
  return back;
}

// Builds the full card element: .postcard > .postcard-inner > (.postcard-front, .postcard-back)
export function buildCardElement(payload, options = {}) {
  const card = h('div', { className: 'postcard' });
  const inner = h('div', { className: 'postcard-inner' });
  const front = buildFront(payload);
  const back = buildBack(payload, options);
  inner.appendChild(front);
  inner.appendChild(back);
  card.appendChild(inner);

  let pill = null;

  function flip() {
    card.classList.toggle('is-flipped');
    const flipped = card.classList.contains('is-flipped');
    if (pill) pill.textContent = flipped ? '↻ Turn it back' : '↻ Turn it over';
    if (typeof options.onFlip === 'function') options.onFlip(flipped);
  }

  let root = card;

  if (!options.editable) {
    const activate = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      flip();
    };
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Flip postcard');
    card.addEventListener('click', activate);
    card.addEventListener('keydown', activate);

    pill = h('button', { type: 'button', className: 'flip-pill' });
    pill.textContent = '↻ Turn it over';
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      flip();
    });

    const wrapper = h('div', { className: 'postcard-wrapper' });
    wrapper.appendChild(card);
    wrapper.appendChild(pill);
    root = wrapper;
  }

  return { card, front, back, flip, pill, root };
}
