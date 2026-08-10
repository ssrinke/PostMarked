// Single renderer for the card DOM (front + back). Used by compose preview, dev.html, and card.html.
// All user/derived strings are inserted via textContent only — never innerHTML.
import { buildStampElement } from './stamp.js';
import { renderPostmarkSVG } from './postmark.js';
import { renderFlowerSVG } from './flower.js';
import { FRONT_ID_RE } from './fronts.js';

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

// Curated front artwork (v1.8 §1) — /assets/fronts/{fr}.jpg under the paper multiply overlay and
// the lockup. Missing/invalid `fr` (including every pre-v1.8 card) or a failed image load falls
// back to the paper texture + lockup alone.
function buildFront(payload) {
  const front = h('div', { className: 'postcard-face postcard-front' });
  if (payload.fr && FRONT_ID_RE.test(payload.fr)) {
    const img = h('img', { className: 'front-art', alt: '' });
    img.addEventListener('error', () => img.remove());
    img.src = `/assets/fronts/${payload.fr}.jpg`;
    front.appendChild(img);
  }
  front.appendChild(h('div', { className: 'front-texture-overlay' }));

  const lockup = h('div', { className: 'front-lockup' });
  const headline = payload.ti || payload.pl || '';
  lockup.appendChild(text('div', 'front-headline', headline));
  const co = payload.co ? `${payload.co} · ` : '';
  lockup.appendChild(text('div', 'front-coords', `${co}${formatCoords(payload.lat, payload.lng)}`));
  front.appendChild(lockup);

  return front;
}

// Ruled writing grid (v1.8a §1/§2) — one shared pitch, drawn as a single background on the
// container. Row heights beyond the two fixed rows (To, From) are computed here in px, since
// --rule-pitch is a fixed px value rather than a % of the responsive card.
const RULE_PITCH = 34;

export function relayoutWriting(back) {
  const writing = back.querySelector('.back-writing');
  const messageEl = back.querySelector('.back-message, .back-message-input');
  if (!writing || !messageEl) return;

  const cardRect = back.getBoundingClientRect();
  if (!cardRect.height) return;

  const writingTop = writing.getBoundingClientRect().top - cardRect.top;
  const bottomMargin = cardRect.height * 0.04; // matches the container's 4% side margins
  const maxTotalHeight = cardRect.height - writingTop - bottomMargin;
  const maxRows = Math.max(3, Math.floor(maxTotalHeight / RULE_PITCH));
  // A pressed-flower charm visually overflows its 34px From row upward (v1.8 §6); give it one
  // extra clear row so its top doesn't reach into the message's last line.
  const hasFlower = !!back.querySelector('.back-flower .flower-svg');
  const maxMessageRows = Math.max(1, maxRows - 2 - (hasFlower ? 1 : 0));

  messageEl.style.height = `${RULE_PITCH}px`;
  const contentRows = Math.max(1, Math.ceil(messageEl.scrollHeight / RULE_PITCH));
  const messageRows = Math.min(maxMessageRows, contentRows);
  messageEl.style.height = `${messageRows * RULE_PITCH}px`;
  messageEl.style.overflowY = contentRows > messageRows ? 'auto' : 'hidden';
}

// Card back v2 (v1.7 §4, ruled grid rebuilt in v1.8a §1/§2) — single full-width writing field,
// no divided columns.
function buildBack(payload, options = {}) {
  const { editable = false, onMessageInput, onSignatureInput, onToInput } = options;
  const back = h('div', { className: 'postcard-face postcard-back' });
  const ink = INK_COLORS[payload.ink || 0];

  back.appendChild(text('div', 'back-heading', 'Postcard'));
  back.appendChild(h('div', { className: 'back-heading-flourish', 'aria-hidden': 'true' }));

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
