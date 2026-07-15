import { verifyAndDecode } from './verify.js';
import { buildCardElement } from './render-card.js';
import { renderPostmarkSVG } from './postmark.js';
import { fnv1a, mulberry32 } from './stamp.js';

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

function buildZigzagClip(fragment, progress) {
  const seed = mulberry32(fnv1a(fragment.slice(0, 32)));
  const segments = 10;
  const jitter = [];
  for (let i = 0; i <= segments; i++) jitter.push((seed() - 0.5) * 6);

  const edgeX = progress * 100;
  const points = [];
  points.push(`${edgeX + jitter[0]}% 0%`);
  points.push('100% 0%');
  points.push('100% 100%');
  points.push(`${edgeX + jitter[segments]}% 100%`);
  for (let i = segments - 1; i >= 1; i--) {
    const y = (i / segments) * 100;
    points.push(`${edgeX + jitter[i]}% ${y}%`);
  }
  return `polygon(${points.join(', ')})`;
}

function renderArrival(payload, fragment) {
  showState('arrival');
  const sceneEl = states.arrival.querySelector('.envelope-scene');
  const envelope = sceneEl.querySelector('.envelope');
  const tearHint = sceneEl.querySelector('.tear-hint');
  const tearButton = states.arrival.querySelector('.tear-open-button');
  const cardWrap = sceneEl.querySelector('.card-wrap');
  cardWrap.innerHTML = '';
  const { card } = buildCardElement(payload, { editable: false });
  cardWrap.appendChild(card);

  const openedKey = `postmarked.opened.${fragment.slice(0, 16)}`;
  const alreadyOpened = !!localStorage.getItem(openedKey);

  if (alreadyOpened) {
    envelope.style.transition = 'none';
    envelope.classList.add('is-torn');
    tearHint.style.display = 'none';
    tearButton.classList.remove('is-visible');
    cardWrap.classList.add('is-settled');
    return;
  }

  let progress = 0;
  let torn = false;

  function setProgress(p) {
    progress = Math.max(progress, Math.min(1, p));
    envelope.style.clipPath = buildZigzagClip(fragment, progress);
    if (progress >= 0.8 && !torn) complete();
  }

  function complete(instant = false) {
    if (torn) return;
    torn = true;
    localStorage.setItem(openedKey, String(Date.now()));
    envelope.style.transition = instant || prefersReducedMotion ? 'none' : '';
    envelope.classList.add('is-torn');
    tearHint.style.opacity = '0';
    tearButton.classList.remove('is-visible');
    const delay = instant || prefersReducedMotion ? 0 : 500;
    setTimeout(() => {
      cardWrap.classList.add('is-settling');
    }, delay);
  }

  let dragging = false;
  let startX = 0;
  let startProgress = 0;

  function onPointerDown(e) {
    if (torn) return;
    dragging = true;
    startX = e.clientX;
    startProgress = progress;
    envelope.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging || torn) return;
    const rect = envelope.getBoundingClientRect();
    const delta = (e.clientX - startX) / rect.width;
    setProgress(startProgress + delta);
  }
  function onPointerUp() {
    dragging = false;
  }

  envelope.addEventListener('pointerdown', onPointerDown);
  envelope.addEventListener('pointermove', onPointerMove);
  envelope.addEventListener('pointerup', onPointerUp);
  envelope.addEventListener('pointercancel', onPointerUp);

  tearButton.addEventListener('click', () => complete(true));

  if (prefersReducedMotion) {
    tearButton.classList.add('is-visible');
  } else {
    setTimeout(() => {
      if (!torn) tearButton.classList.add('is-visible');
    }, 2000);
  }
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
