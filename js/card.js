import { verifyAndDecode } from './verify.js';
import { buildCardElement, INK_COLORS } from './render-card.js';
import { renderPostmarkSVG } from './postmark.js';
import { renderStampSVG } from './stamp.js';
import { fnv1a, mulberry32 } from './stamp.js';
import { weatherWord } from './postmark.js';

const stage = document.getElementById('stage');
const states = {
  damaged: document.getElementById('state-damaged'),
  transit: document.getElementById('state-transit'),
  arrival: document.getElementById('state-arrival'),
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showState(name) {
  for (const s of Object.values(states)) s.classList.remove('is-active');
  states[name].classList.add('is-active');
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function longDateFromISO(d) {
  const [y, m, day] = d.split('-').map(Number);
  return `${LONG_MONTHS[m - 1]} ${day}, ${y}`;
}

function weekdayLongDate(ms) {
  const dt = new Date(ms);
  return `${WEEKDAYS[dt.getDay()]}, ${LONG_MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

function renderDamaged() {
  showState('damaged');
}

function renderTransit(payload) {
  const el = states.transit;
  el.querySelector('.transit-postmark-ghost').innerHTML = '';
  el.querySelector('.transit-postmark-ghost').appendChild(renderPostmarkSVG(payload));
  const place = payload.co ? `${payload.pl}, ${payload.co}` : payload.pl;
  el.querySelector('.transit-line').textContent =
    `Mailed from ${place} on ${longDateFromISO(payload.d)} · arriving ${weekdayLongDate(payload.nb)}`;
  showState('transit');
}

// Deterministic jagged tear edge, seeded from the fragment — same card tears the same way every time (§4).
function buildTearClip(fragment) {
  const seed = mulberry32(fnv1a(fragment.slice(0, 32)));
  const segments = 10;
  const baseY = 30;
  const top = [];
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * 100;
    const y = baseY + (seed() - 0.5) * 14;
    top.push(`${x}% ${y}%`);
  }
  return `polygon(${top.join(', ')}, 100% 100%, 0% 100%)`;
}

function setupZoomOverlay(payload) {
  const overlay = document.getElementById('zoomOverlay');
  const stampWrap = document.getElementById('zoomStampWrap');
  const postmarkWrap = document.getElementById('zoomPostmarkWrap');
  const captionLines = document.getElementById('zoomCaptionLines');
  const closeBtn = document.getElementById('zoomClose');

  let lastFocused = null;

  function buildCaptionLines() {
    captionLines.innerHTML = '';
    const place = payload.co ? `${payload.pl}, ${payload.co}` : payload.pl;
    const lines = [`MAILED FROM ${place}`.toUpperCase()];
    if (payload.d) lines.push(longDateFromISO(payload.d));
    if (payload.t) lines.push(`${payload.t} LOCAL TIME`);
    if (payload.wt !== undefined) {
      const word = weatherWord(payload.wc);
      lines.push(word ? `${payload.wt}°C · ${word}` : `${payload.wt}°C`);
    }
    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      captionLines.appendChild(div);
    }
  }

  function open(triggerEl) {
    lastFocused = triggerEl;
    stampWrap.innerHTML = '';
    stampWrap.appendChild(renderStampSVG(payload));
    postmarkWrap.innerHTML = '';
    if (payload.d && payload.t) postmarkWrap.appendChild(renderPostmarkSVG(payload));
    buildCaptionLines();
    overlay.classList.add('is-open');
    closeBtn.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function close() {
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown);
    if (lastFocused) lastFocused.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = overlay.querySelectorAll('button');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return { open };
}

function setupStampHint(hitEl) {
  const HINT_KEY = 'postmarked.stamphint';
  const caption = document.getElementById('stampHintCaption');
  let shown = false;

  return function trigger() {
    if (shown || localStorage.getItem(HINT_KEY)) return;
    shown = true;
    localStorage.setItem(HINT_KEY, '1');
    hitEl.classList.add('stamp-pulse');
    caption.classList.add('is-visible');
    setTimeout(() => {
      caption.classList.remove('is-visible');
    }, 5000);
  };
}

function setupCornerPeel(cardEl) {
  if (prefersReducedMotion) return { stop() {} };
  const timer = setTimeout(() => {
    cardEl.classList.add('peel-nudge');
  }, 2500);
  return {
    stop() {
      clearTimeout(timer);
      cardEl.classList.remove('peel-nudge');
    },
  };
}

function renderArrival(payload, fragment) {
  showState('arrival');
  const sceneEl = states.arrival.querySelector('.envelope-scene');
  const envelope = sceneEl.querySelector('.envelope');
  const sealEl = envelope.querySelector('.envelope-seal');
  const breakSealButton = states.arrival.querySelector('.break-seal-button');
  const cardWrap = sceneEl.querySelector('.card-wrap');
  cardWrap.innerHTML = '';

  const toNameEl = envelope.querySelector('.envelope-to-name');
  if (payload.to) {
    toNameEl.textContent = `To ${payload.to}`;
    toNameEl.style.color = INK_COLORS[payload.ink || 0];
  } else {
    toNameEl.textContent = '';
  }

  const zoom = setupZoomOverlay(payload);

  const { root, card } = buildCardElement(payload, {
    editable: false,
    onFlip: (flipped) => {
      if (flipped) {
        peelControl.stop();
        triggerStampHint();
      }
    },
  });
  cardWrap.appendChild(root);

  const peelControl = setupCornerPeel(card);
  const hit = card.querySelector('.stamp-cluster-hit');
  const triggerStampHint = setupStampHint(hit);

  if (hit) {
    const activateZoom = (e) => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      zoom.open(hit);
    };
    hit.addEventListener('click', activateZoom);
    hit.addEventListener('keydown', activateZoom);
  }

  const openedKey = `postmarked.opened.${fragment.slice(0, 16)}`;
  const alreadyOpened = !!localStorage.getItem(openedKey);

  if (alreadyOpened) {
    envelope.classList.add('is-cracking', 'is-tearing', 'is-torn');
    envelope.style.clipPath = buildTearClip(fragment);
    breakSealButton.classList.add('is-hidden');
    cardWrap.classList.add('is-visible', 'is-settled');
    return;
  }

  let torn = false;

  function runSequence() {
    if (torn) return;
    torn = true;
    localStorage.setItem(openedKey, String(Date.now()));
    breakSealButton.classList.add('is-hidden');

    if (prefersReducedMotion) {
      envelope.classList.add('is-torn');
      cardWrap.classList.add('is-visible');
      return;
    }

    envelope.classList.add('is-cracking');
    setTimeout(() => {
      envelope.classList.add('is-tearing');
      envelope.style.clipPath = buildTearClip(fragment);
      setTimeout(() => {
        envelope.classList.add('is-torn');
        cardWrap.classList.add('is-visible');
        setTimeout(() => {
          cardWrap.classList.add('is-settling');
        }, 0);
      }, 400);
    }, 250);
  }

  breakSealButton.addEventListener('click', runSequence);

  let startX = null;
  envelope.addEventListener('pointerdown', (e) => {
    if (torn) return;
    startX = e.clientX;
  });
  envelope.addEventListener('pointerup', (e) => {
    if (torn || startX === null) return;
    const delta = Math.abs(e.clientX - startX);
    startX = null;
    if (delta >= 60) runSequence();
  });
}

async function main() {
  const fragment = location.hash.slice(1);
  const payload = await verifyAndDecode(fragment);
  if (!payload) {
    renderDamaged();
    return;
  }

  function evaluate() {
    if (Date.now() < payload.nb) {
      renderTransit(payload);
      return false;
    }
    renderArrival(payload, fragment);
    return true;
  }

  const arrived = evaluate();
  if (!arrived) {
    const interval = setInterval(() => {
      if (Date.now() >= payload.nb) {
        clearInterval(interval);
        renderArrival(payload, fragment);
      }
    }, 30000);
  }
}

main();
