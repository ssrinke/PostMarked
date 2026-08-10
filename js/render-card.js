// Single renderer for the card DOM (front + back). Used by compose preview, dev.html, and card.html.
// All user/derived strings are inserted via textContent only — never innerHTML.
import { buildStampElement } from './stamp.js';
import { renderPostmarkSVG } from './postmark.js';
import { renderFlowerSVG } from './flower.js';
import { FRONT_ID_RE } from './fronts.js';
import { STADIA_API_KEY } from './config.js';

// Index 0/1 (sepia, blue-black) are back-compat only — no longer offered in the compose ink tray.
// Index 2/3 (green, red) are the current tray (v1.7 §1 paper — both verified ≥4.5:1).
export const INK_COLORS = ['#3A3128', '#2A3550', '#2F4A38', '#8C3B2E'];

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
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

const MAP_ATTRIBUTION = '© Stadia Maps © Stamen Design © OpenStreetMap';

function stadiaMapUrl(lat, lng) {
  return `https://tiles.stadiamaps.com/static/stamen_watercolor.jpg?center=${lat},${lng}&zoom=14&size=1200x800@2x&api_key=${STADIA_API_KEY}`;
}

function buildMapRing() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'front-map-ring');
  svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('cx', '50');
  ring.setAttribute('cy', '50');
  ring.setAttribute('r', '14');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#B85C4A');
  ring.setAttribute('stroke-width', '2.4');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '50');
  dot.setAttribute('cy', '50');
  dot.setAttribute('r', '2.4');
  dot.setAttribute('fill', '#B85C4A');
  svg.appendChild(ring);
  svg.appendChild(dot);
  return svg;
}

// Card front (v1.9 §4): a vintage watercolor map centered on the postmark's coordinates,
// replacing the interim curated-artwork tray. A curated `fr` (v1.8 §1, no longer offered in
// compose but still honored so old cards keep rendering their chosen front) takes priority when
// present. Missing API key or a failed image load falls back to the paper texture + lockup alone.
function buildFront(payload) {
  const front = h('div', { className: 'postcard-face postcard-front' });
  const hasCuratedFront = payload.fr && FRONT_ID_RE.test(payload.fr);

  // Bottom of the stack: curated artwork (dormant path, v1.8 §1) or the watercolor map.
  if (hasCuratedFront) {
    const img = h('img', { className: 'front-art', alt: '' });
    img.addEventListener('error', () => img.remove());
    img.src = `/assets/fronts/${payload.fr}.jpg`;
    front.appendChild(img);
  } else if (STADIA_API_KEY) {
    const img = h('img', { className: 'front-art front-map', alt: '' });
    img.src = stadiaMapUrl(payload.lat, payload.lng);
    front.appendChild(img);
  }

  // Paper multiply overlay, unchanged.
  front.appendChild(h('div', { className: 'front-texture-overlay' }));

  // "You are here" ring, above the overlay — only for the map path.
  let mapImg = null;
  let mapRing = null;
  let mapAttribution = null;
  if (!hasCuratedFront && STADIA_API_KEY) {
    mapImg = front.querySelector('.front-map');
    mapRing = buildMapRing();
    front.appendChild(mapRing);
  }

  const lockup = h('div', { className: 'front-lockup' });
  const headline = payload.ti || payload.pl || '';
  lockup.appendChild(text('div', 'front-headline', headline));
  const co = payload.co ? `${payload.co} · ` : '';
  lockup.appendChild(text('div', 'front-coords', `${co}${formatCoords(payload.lat, payload.lng)}`));
  front.appendChild(lockup);

  // Attribution line, topmost — required by the map tile license.
  if (mapImg) {
    mapAttribution = text('div', 'front-attribution', MAP_ATTRIBUTION);
    front.appendChild(mapAttribution);
    const ring = mapRing;
    const attribution = mapAttribution;
    mapImg.addEventListener('error', () => {
      mapImg.remove();
      ring.remove();
      attribution.remove();
    });
    mapImg.addEventListener('load', () => mapImg.classList.add('is-loaded'));
  }

  return front;
}

// Ruled writing grid (v1.8a §1/§2) — one shared pitch, drawn as a single background on the
// container. Row heights beyond the two fixed rows (To, From) are computed here in px, since
// --rule-pitch is a fixed px value rather than a % of the responsive card.
const RULE_PITCH = 34;
// v1.10 §4 — the writing container always renders at least six pitch rows (To + 4 empty
// message rows + From); the message area itself never renders below 4 rows.
const MIN_MESSAGE_ROWS = 4;

// v1.9 §1 — the message box must never show its own scrollbar. It grows unconditionally by
// whole --rule-pitch rows to fit its content (bounded only by the 300-char maxlength); the
// postcard itself grows past its default 3:2 aspect ratio when the writing area needs more
// room than that gives it, rather than capping/scrolling the text.
export function relayoutWriting(back) {
  const writing = back.querySelector('.back-writing');
  const messageEl = back.querySelector('.back-message, .back-message-input');
  if (!writing || !messageEl) return;

  messageEl.style.height = `${RULE_PITCH}px`;
  const contentRows = Math.max(MIN_MESSAGE_ROWS, Math.ceil(messageEl.scrollHeight / RULE_PITCH));
  messageEl.style.height = `${contentRows * RULE_PITCH}px`;
  messageEl.style.overflowY = 'hidden';

  const postcard = back.closest('.postcard');
  if (!postcard) return;

  postcard.style.height = '';
  const naturalHeight = postcard.getBoundingClientRect().height;
  if (!naturalHeight) return;
  const cardRect = back.getBoundingClientRect();
  const writingTop = writing.getBoundingClientRect().top - cardRect.top;
  const bottomMargin = naturalHeight * 0.04; // matches the container's 4% side margins
  const requiredHeight = writingTop + writing.scrollHeight + bottomMargin;
  if (requiredHeight > naturalHeight) {
    postcard.style.height = `${requiredHeight}px`;
  }
}

// Card back v2 (v1.7 §4, ruled grid rebuilt in v1.8a §1/§2) — single full-width writing field,
// no divided columns.
function buildBack(payload, options = {}) {
  const { editable = false, onMessageInput, onSignatureInput, onToInput } = options;
  const back = h('div', { className: 'postcard-face postcard-back' });
  const ink = INK_COLORS[payload.ink || 0];

  back.appendChild(text('div', 'back-heading', 'Postcard'));

  const stampGuide = h('div', { className: 'stamp-guide' });
  stampGuide.appendChild(text('div', 'stamp-guide-label', 'AFFIX STAMP'));
  back.appendChild(stampGuide);

  const stampWrap = h('div', { className: 'back-stamp' });
  stampWrap.appendChild(buildStampElement(payload));
  back.appendChild(stampWrap);

  if (payload.d && payload.t) {
    const postmarkWrap = h('div', { className: 'back-postmark' });
    postmarkWrap.appendChild(renderPostmarkSVG(payload));
    back.appendChild(postmarkWrap);
  }

  // Writing grid: row 1 = To, row 2..N-1 = message, row N = From — always all three rows so the
  // grid math never depends on whether a recipient name is present.
  const writing = h('div', { className: 'back-writing' });

  const toLine = h('div', { className: 'back-to-line' });
  if (editable || payload.to) {
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
  }
  writing.appendChild(toLine);

  let messageEl;
  if (editable) {
    messageEl = h('textarea', { className: 'back-message-input', maxlength: '300', placeholder: 'Write your message…' });
    messageEl.value = payload.m || '';
    messageEl.style.color = ink;
    messageEl.addEventListener('input', () => {
      if (onMessageInput) onMessageInput(messageEl.value);
      relayoutWriting(back);
    });
  } else {
    messageEl = text('div', 'back-message', payload.m || '');
    messageEl.style.color = ink;
  }
  writing.appendChild(messageEl);

  // Collapses to 0 height (CSS) unless a flower is selected, in which case it opens up a full
  // pitch row so the charm's upward overflow (v1.8 §6) has real clearance instead of running
  // into the message's last line.
  writing.appendChild(h('div', { className: 'back-flower-spacer', 'aria-hidden': 'true' }));

  const fromLine = h('div', { className: 'back-signature-line' });
  const flowerWrap = h('div', { className: 'back-flower' });
  const flowerSvg = renderFlowerSVG(payload.fl);
  if (flowerSvg) flowerWrap.appendChild(flowerSvg);
  fromLine.appendChild(flowerWrap);
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
  writing.appendChild(fromLine);

  back.appendChild(writing);

  if (!editable) {
    const hit = h('div', {
      className: 'stamp-cluster-hit',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Inspect the stamp and postmark',
    });
    back.appendChild(hit);
  }

  const ro = new ResizeObserver(() => relayoutWriting(back));
  ro.observe(back);

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
