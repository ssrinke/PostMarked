// Single renderer for the card DOM (front + back). Used by compose preview, dev.html, and card.html.
// All user/derived strings are inserted via textContent only — never innerHTML.
import { buildStampElement, renderFrontSVG } from './stamp.js';
import { renderPostmarkSVG } from './postmark.js';
import { renderFlowerSVG } from './flower.js';

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

// Card back v2 (v1.7 §4) — single full-width writing field, no divided columns.
function buildBack(payload, options = {}) {
  const { editable = false, onMessageInput, onSignatureInput, onToInput } = options;
  const back = h('div', { className: 'postcard-face postcard-back' });
  const ink = INK_COLORS[payload.ink || 0];

  back.appendChild(text('div', 'back-heading', 'Postcard'));

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
    back.appendChild(toLine);
  }

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

  if (editable) {
    const textarea = h('textarea', { className: 'back-message-input', maxlength: '300', placeholder: 'Write your message…' });
    textarea.value = payload.m || '';
    textarea.style.color = ink;
    if (onMessageInput) textarea.addEventListener('input', () => onMessageInput(textarea.value));
    back.appendChild(textarea);
  } else {
    const messageEl = text('div', 'back-message', payload.m || '');
    messageEl.style.color = ink;
    back.appendChild(messageEl);
  }

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
  back.appendChild(fromLine);

  if (!editable) {
    const hit = h('div', {
      className: 'stamp-cluster-hit',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Inspect the stamp and postmark',
    });
    back.appendChild(hit);
  }

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
