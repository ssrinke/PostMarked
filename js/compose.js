import { buildCardElement, INK_COLORS } from './render-card.js';
import { buildStampElement } from './stamp.js';
import { renderFlowerSVG, renderFlowerNoneIcon } from './flower.js';

const screens = {
  arrival: document.getElementById('screen-arrival'),
  locating: document.getElementById('screen-locating'),
  denied: document.getElementById('screen-denied'),
  write: document.getElementById('screen-write'),
  confirm: document.getElementById('screen-confirm'),
  drawer: document.getElementById('screen-drawer'),
};

const SENT_KEY = 'postmarked.sent.v1';
const POSITION_MAX_AGE_MS = 5 * 60 * 1000;

let position = null; // { lat, lng, timestamp }
let draft = { m: '', s: '', to: '', ink: 2, sv: 0, fl: 0 };
let cardPreview = null; // { card, front, back }

// Compose ink tray offers only green (index 2) and red (index 3) into INK_COLORS;
// indices 0/1 (sepia, blue-black) stay renderer-only, for previously mailed cards (v1.5b §6).
const INK_TRAY_OPTIONS = [2, 3];

function showScreen(name) {
  for (const s of Object.values(screens)) s.classList.remove('is-active');
  screens[name].classList.add('is-active');
}

function getSentCards() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY)) || [];
  } catch {
    return [];
  }
}

function addSentCard(entry) {
  const list = getSentCards();
  list.unshift(entry);
  localStorage.setItem(SENT_KEY, JSON.stringify(list));
}

function refreshDrawerLinks() {
  const hasCards = getSentCards().length > 0;
  document.getElementById('drawerLinkArrival').hidden = !hasCards;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

// --- Geolocation ---

function getMockPosition() {
  if (location.hostname !== 'localhost') return null;
  const params = new URLSearchParams(location.search);
  const mock = params.get('mock');
  if (!mock) return null;
  const [lat, lng, accuracy] = mock.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, timestamp: Date.now(), accuracy: Number.isFinite(accuracy) ? accuracy : 0 };
}

function acquirePosition() {
  return new Promise((resolve, reject) => {
    const mock = getMockPosition();
    if (mock) {
      resolve(mock);
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: pos.timestamp, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 },
    );
  });
}

async function locate() {
  showScreen('locating');
  try {
    position = await acquirePosition();
    enterWriteScreen();
  } catch {
    showScreen('denied');
  }
}

async function ensureFreshPosition() {
  if (position && Date.now() - position.timestamp < POSITION_MAX_AGE_MS) return;
  position = await acquirePosition();
  updateApproxCaption();
}

function updateApproxCaption() {
  const caption = document.getElementById('approxCaption');
  caption.hidden = !(position && position.accuracy > 5000);
}

// --- Ink tray (§3.4) ---

function buildInkTray() {
  const container = document.getElementById('inkDots');
  container.innerHTML = '';
  INK_TRAY_OPTIONS.forEach((colorIndex, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'ink-dot';
    dot.style.setProperty('--dot-color', INK_COLORS[colorIndex]);
    dot.setAttribute('role', 'radio');
    dot.setAttribute('aria-checked', String(colorIndex === draft.ink));
    dot.setAttribute('aria-label', colorIndex === 2 ? 'Green ink' : 'Red ink');
    dot.tabIndex = colorIndex === draft.ink ? 0 : -1;
    dot.addEventListener('click', () => selectInk(colorIndex));
    dot.addEventListener('keydown', (e) => handleTrayArrowKey(e, container, '.ink-dot', i, (nextPos) => selectInk(INK_TRAY_OPTIONS[nextPos])));
    container.appendChild(dot);
  });
}

function selectInk(colorIndex) {
  draft.ink = colorIndex;
  buildInkTray();
  const pos = INK_TRAY_OPTIONS.indexOf(colorIndex);
  document.getElementById('inkDots').querySelectorAll('.ink-dot')[pos]?.focus();
  applyInkToPreview();
}

function applyInkToPreview() {
  if (!cardPreview) return;
  const color = INK_COLORS[draft.ink];
  const selectors = ['.back-to-name', '.back-to-input', '.back-message', '.back-message-input', '.back-signature', '.back-signature-input'];
  for (const sel of selectors) {
    const el = cardPreview.back.querySelector(sel);
    if (el) el.style.color = color;
  }
}

function handleTrayArrowKey(e, container, itemSelector, currentIndex, onSelect) {
  const items = container.querySelectorAll(itemSelector);
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
  const next = (currentIndex + delta + items.length) % items.length;
  onSelect(next);
}

// --- Stamp rack (§3.5) ---

function buildStampRack() {
  const container = document.getElementById('stampRackItems');
  container.innerHTML = '';
  if (!position) return;
  const payload = { lat: position.lat, lng: position.lng };
  for (let sv = 0; sv < 2; sv++) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'stamp-rack-item';
    item.setAttribute('role', 'radio');
    item.setAttribute('aria-checked', String(sv === draft.sv));
    item.setAttribute('aria-label', `Stamp variant ${sv + 1}`);
    item.tabIndex = sv === draft.sv ? 0 : -1;
    item.appendChild(buildStampElement(payload, sv));
    item.addEventListener('click', () => selectStamp(sv));
    item.addEventListener('keydown', (e) => handleTrayArrowKey(e, container, '.stamp-rack-item', sv, selectStamp));
    container.appendChild(item);
  }
}

function selectStamp(sv) {
  draft.sv = sv;
  buildStampRack();
  document.getElementById('stampRackItems').querySelectorAll('.stamp-rack-item')[sv]?.focus();
  applyStampToPreview();
}

function applyStampToPreview() {
  if (!cardPreview || !position) return;
  const wrap = cardPreview.back.querySelector('.back-stamp');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.appendChild(buildStampElement({ lat: position.lat, lng: position.lng }, draft.sv));
}

// --- Pressed-flower tray (v1.7 §5) ---

function buildFlowerTray() {
  const container = document.getElementById('flowerTrayItems');
  container.innerHTML = '';
  for (let fl = 0; fl <= 4; fl++) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'flower-tray-item';
    item.setAttribute('role', 'radio');
    item.setAttribute('aria-checked', String(fl === draft.fl));
    item.setAttribute('aria-label', fl === 0 ? 'No pressed flower' : `Pressed flower ${fl}`);
    item.tabIndex = fl === draft.fl ? 0 : -1;
    item.appendChild(fl === 0 ? renderFlowerNoneIcon() : renderFlowerSVG(fl));
    item.addEventListener('click', () => selectFlower(fl));
    item.addEventListener('keydown', (e) => handleTrayArrowKey(e, container, '.flower-tray-item', fl, selectFlower));
    container.appendChild(item);
  }
}

function selectFlower(fl) {
  draft.fl = fl;
  buildFlowerTray();
  document.getElementById('flowerTrayItems').querySelectorAll('.flower-tray-item')[fl]?.focus();
  applyFlowerToPreview();
}

function applyFlowerToPreview() {
  if (!cardPreview) return;
  const wrap = cardPreview.back.querySelector('.back-flower');
  if (!wrap) return;
  wrap.innerHTML = '';
  const svg = renderFlowerSVG(draft.fl);
  if (svg) wrap.appendChild(svg);
}

// --- Write screen ---

function enterWriteScreen() {
  showScreen('write');
  draft = { m: '', s: '', to: '', ink: 2, sv: 0, fl: 0 };
  buildInkTray();
  buildStampRack();
  buildFlowerTray();
  renderCardPreview();
  updateCounter();
  updateApproxCaption();
}

function renderCardPreview() {
  const container = document.getElementById('writeCardPreview');
  container.innerHTML = '';
  const payload = { v: 1, m: draft.m, s: draft.s, to: draft.to, ink: draft.ink, sv: draft.sv, fl: draft.fl, lat: position.lat, lng: position.lng };
  cardPreview = buildCardElement(payload, {
    editable: true,
    onMessageInput: (value) => {
      draft.m = value;
      updateCounter();
    },
    onSignatureInput: (value) => {
      draft.s = value;
    },
    onToInput: (value) => {
      draft.to = value;
    },
  });
  cardPreview.card.classList.add('is-flipped');
  container.appendChild(cardPreview.card);
}

function updateCounter() {
  const remaining = 300 - draft.m.length;
  document.getElementById('charCounter').textContent = `${remaining} characters left`;
}

async function mailIt() {
  const button = document.getElementById('mailItBtn');
  if (draft.m.trim().length < 1) return;

  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Stamping…';

  try {
    await ensureFreshPosition();

    const res = await fetch('/api/stamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: draft.m,
        senderName: draft.s,
        recipientName: draft.to,
        ink: draft.ink,
        stampVariant: draft.sv,
        flower: draft.fl,
        lat: position.lat,
        lng: position.lng,
        website: '',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      button.disabled = false;
      button.textContent = originalLabel;
      return;
    }

    addSentCard({
      cardUrl: data.cardUrl,
      place: data.place,
      country: data.country,
      mailedDate: new Date().toISOString(),
    });
    refreshDrawerLinks();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardPreview.card.classList.add('is-sending');
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 300 : 700));

    enterConfirmScreen(data);
  } catch {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

document.getElementById('mailItBtn').addEventListener('click', mailIt);
document.getElementById('findMeBtn').addEventListener('click', locate);
document.getElementById('tryAgainBtn').addEventListener('click', locate);

// --- Confirm screen (§3.7) ---

let lastMailed = null;

function enterConfirmScreen(data) {
  lastMailed = data;
  document.getElementById('confirmHeadline').textContent = `Stamped and sealed in ${data.place}.`;
  const recipient = draft.to || 'them';
  document.getElementById('stepExplainer').textContent =
    `You're the postman now. Send ${recipient} the sealed envelope — it's a link they can open right away.`;

  const handItBtn = document.getElementById('handItBtn');
  setupHandItButton(handItBtn, data.place, data.cardUrl);

  showScreen('confirm');
}

function shareTextFor(place, cardUrl) {
  return `I mailed you a postcard from ${place} 📮 ${cardUrl}`;
}

function setupHandItButton(button, place, cardUrl) {
  const shareText = shareTextFor(place, cardUrl);
  button.onclick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {
        // user cancelled share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      showToast('Copied — now send it to them yourself');
    }
  };
  button.textContent = navigator.share ? 'Hand it to them' : 'Copy the envelope link';
}

// --- Sent drawer ---

function renderDrawer() {
  const list = getSentCards();
  const listEl = document.getElementById('drawerList');
  listEl.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'drawer-empty';
    empty.textContent = 'No postcards mailed yet.';
    listEl.appendChild(empty);
    return;
  }

  for (const entry of list) {
    const item = document.createElement('div');
    item.className = 'drawer-item';

    const info = document.createElement('div');
    info.className = 'drawer-item-info';
    const place = document.createElement('div');
    place.className = 'place';
    place.textContent = entry.country ? `${entry.place}, ${entry.country}` : entry.place;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Mailed ${new Date(entry.mailedDate).toLocaleDateString()}`;
    info.appendChild(place);
    info.appendChild(meta);

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'primary-button';
    again.textContent = 'Hand it over again';
    again.addEventListener('click', async () => {
      const shareText = shareTextFor(entry.place, entry.cardUrl);
      if (navigator.share) {
        try {
          await navigator.share({ text: shareText });
        } catch {
          // cancelled
        }
      } else {
        await navigator.clipboard.writeText(shareText);
        showToast('Copied — now send it to them yourself');
      }
    });

    item.appendChild(info);
    item.appendChild(again);
    listEl.appendChild(item);
  }
}

function openDrawer() {
  renderDrawer();
  showScreen('drawer');
}

document.getElementById('drawerLinkArrival').addEventListener('click', openDrawer);
document.getElementById('drawerLinkConfirm').addEventListener('click', openDrawer);
document.getElementById('drawerBackBtn').addEventListener('click', () => {
  showScreen(lastMailed ? 'confirm' : 'arrival');
});

refreshDrawerLinks();
