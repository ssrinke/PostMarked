// Single renderer for the card DOM (front + back). Used by compose preview, dev.html, and card.html.
// All user/derived strings are inserted via textContent only — never innerHTML.
import { renderStampSVG, renderFrontSVG } from './stamp.js';
import { renderPostmarkSVG } from './postmark.js';

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

  const lockup = h('div', { className: 'front-lockup' });
  const headline = payload.ti || payload.pl || '';
  lockup.appendChild(text('div', 'front-headline', headline));
  const co = payload.co ? `${payload.co} · ` : '';
  lockup.appendChild(text('div', 'front-coords', `${co}${formatCoords(payload.lat, payload.lng)}`));
  front.appendChild(lockup);

  return front;
}

function buildBack(payload, { editable = false, onMessageInput, onSignatureInput } = {}) {
  const back = h('div', { className: 'postcard-face postcard-back' });

  const left = h('div', { className: 'back-left' });
  if (editable) {
    const textarea = h('textarea', { className: 'back-message-input', maxlength: '300', placeholder: 'Write your message…' });
    textarea.value = payload.m || '';
    if (onMessageInput) textarea.addEventListener('input', () => onMessageInput(textarea.value));
    left.appendChild(textarea);
    const sigInput = h('input', { className: 'back-signature-input', type: 'text', maxlength: '40', placeholder: 'Your name' });
    sigInput.value = payload.s || '';
    if (onSignatureInput) sigInput.addEventListener('input', () => onSignatureInput(sigInput.value));
    left.appendChild(sigInput);
  } else {
    const messageEl = text('div', 'back-message', payload.m || '');
    left.appendChild(messageEl);
    const sigEl = text('div', 'back-signature', payload.s ? `— ${payload.s}` : '');
    left.appendChild(sigEl);
  }
  back.appendChild(left);

  back.appendChild(h('div', { className: 'back-rule' }));

  const right = h('div', { className: 'back-right' });
  right.appendChild(text('div', 'back-heading', 'POST CARD / CARTE POSTALE'));

  const stampWrap = h('div', { className: 'back-stamp' });
  stampWrap.appendChild(renderStampSVG(payload));
  right.appendChild(stampWrap);

  if (payload.d && payload.t) {
    const postmarkWrap = h('div', { className: 'back-postmark' });
    postmarkWrap.appendChild(renderPostmarkSVG(payload));
    right.appendChild(postmarkWrap);
  }

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
