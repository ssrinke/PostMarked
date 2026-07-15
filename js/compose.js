import { buildCardElement } from './render-card.js';

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
let draft = { m: '', s: '', ti: '' };
let cardPreview = null; // { card, front, back }

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
  const [lat, lng] = mock.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, timestamp: Date.now() };
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
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: pos.timestamp }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 },
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
}

// --- Write screen ---

function enterWriteScreen() {
  showScreen('write');
  draft = { m: '', s: '', ti: '' };
  document.getElementById('titleInput').value = '';
  renderCardPreview();
  updateCounter();
}

function renderCardPreview() {
  const container = document.getElementById('writeCardPreview');
  container.innerHTML = '';
  const payload = { v: 1, m: draft.m, s: draft.s, lat: position.lat, lng: position.lng };
  cardPreview = buildCardElement(payload, {
    editable: true,
    onMessageInput: (value) => {
      draft.m = value;
      updateCounter();
    },
    onSignatureInput: (value) => {
      draft.s = value;
    },
  });
  cardPreview.card.classList.add('is-flipped');
  container.appendChild(cardPreview.card);
}

function updateCounter() {
  const remaining = 300 - draft.m.length;
  document.getElementById('charCounter').textContent = `${remaining} characters left`;
}

document.getElementById('titleInput').addEventListener('input', (e) => {
  draft.ti = e.target.value;
});

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
        title: draft.ti,
        message: draft.m,
        senderName: draft.s,
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
      arrival: data.arrival,
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

// --- Confirm screen ---

let lastMailed = null;

function enterConfirmScreen(data) {
  lastMailed = data;
  document.getElementById('confirmLine1').textContent = `Postcard mailed from ${data.place}.`;
  document.getElementById('confirmLine2').textContent = `Arriving ${data.arrivalWeekday}, ${data.arrivalDate}. Good things take a few days.`;

  const deliverBtn = document.getElementById('deliverBtn');
  setupDeliverButton(deliverBtn, data.place, data.arrivalWeekday, data.cardUrl);

  showScreen('confirm');
}

function setupDeliverButton(button, place, weekday, cardUrl) {
  const shareText = `I mailed you a postcard from ${place} 📮 It arrives ${weekday} — go look then. ${cardUrl}`;
  button.onclick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {
        // user cancelled share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      showToast('Copied — paste it to them');
    }
  };
  if (!navigator.share) {
    button.textContent = 'Copy link to deliver';
  } else {
    button.textContent = 'Deliver it';
  }
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
    again.textContent = 'Deliver again';
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(entry.arrival));
    again.addEventListener('click', async () => {
      const shareText = `I mailed you a postcard from ${entry.place} 📮 It arrives ${weekday} — go look then. ${entry.cardUrl}`;
      if (navigator.share) {
        try {
          await navigator.share({ text: shareText });
        } catch {
          // cancelled
        }
      } else {
        await navigator.clipboard.writeText(shareText);
        showToast('Copied — paste it to them');
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
