import zlib from 'node:zlib';
import * as ed from '@noble/ed25519';

// Best-effort in-memory rate limit: resets on cold start — accepted for MVP.
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const CONTROL_CHARS_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(9) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');

function stripControlChars(str) {
  return str.replace(CONTROL_CHARS_RE, '');
}

function validate(body) {
  if (typeof body !== 'object' || body === null) return { error: 'body' };

  const message = typeof body.message === 'string' ? stripControlChars(body.message).trim() : '';
  if (message.length < 1 || message.length > 300) return { error: 'message' };

  const senderName = typeof body.senderName === 'string' ? body.senderName.trim() : '';
  if (senderName.length < 1 || senderName.length > 40) return { error: 'senderName' };

  const titleRaw = typeof body.title === 'string' ? body.title.trim() : '';
  if (titleRaw.length > 40) return { error: 'title' };

  const recipientNameRaw = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
  if (recipientNameRaw.length > 30) return { error: 'recipientName' };

  const ink = body.ink === undefined ? 0 : Number(body.ink);
  if (!Number.isInteger(ink) || ink < 0 || ink > 3) return { error: 'ink' };

  const stampVariant = body.stampVariant === undefined ? 0 : Number(body.stampVariant);
  if (!Number.isInteger(stampVariant) || stampVariant < 0 || stampVariant > 2) return { error: 'stampVariant' };

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat' };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: 'lng' };

  const website = typeof body.website === 'string' ? body.website : '';

  return { message, senderName, title: titleRaw, recipientName: recipientNameRaw, ink, stampVariant, lat, lng, website };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(lat, lng) {
  try {
    const contact = process.env.NOMINATIM_CONTACT || '';
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=en`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': `Postmarked/1.0 (${contact})` },
    }, 4000);
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    const address = data.address || {};
    const pl = address.city || address.town || address.village || address.municipality || address.county || address.state || null;
    const co = address.country || '';
    if (!pl) throw new Error('no place');
    return { pl: pl.slice(0, 60), co };
  } catch {
    const latAbs = Math.abs(lat).toFixed(2);
    const lngAbs = Math.abs(lng).toFixed(2);
    const pl = `${latAbs}°${lat >= 0 ? 'N' : 'S'}, ${lngAbs}°${lng >= 0 ? 'E' : 'W'}`;
    return { pl, co: '' };
  }
}

async function weatherAndTime(lat, lng, nowMs) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetchWithTimeout(url, {}, 4000);
    if (!res.ok) throw new Error('weather failed');
    const data = await res.json();
    const timezone = data.timezone;
    const wt = Math.round(data.current.temperature_2m);
    const wc = data.current.weather_code;
    const { d, t } = formatInTimezone(nowMs, timezone);
    return { wt, wc, d, t, timezone };
  } catch {
    const { d, t } = formatInTimezone(nowMs, 'UTC');
    return { wt: undefined, wc: undefined, d, t: `${t} UTC`, timezone: 'UTC' };
  }
}

function formatInTimezone(ms, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return { d: `${map.year}-${map.month}-${map.day}`, t: `${hour}:${map.minute}` };
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch {
    res.status(400).json({ error: 'body' });
    return;
  }

  const validated = validate(body);
  if (validated.error) {
    res.status(400).json({ field: validated.error });
    return;
  }

  // Honeypot: pretend success, do nothing.
  if (validated.website !== '') {
    res.status(200).json({ ok: true });
    return;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const { message, senderName, title, recipientName, ink, stampVariant, lat, lng } = validated;
  const nowMs = Date.now();

  const [{ pl, co }, weather] = await Promise.all([
    geocode(lat, lng),
    weatherAndTime(lat, lng, nowMs),
  ]);

  const payload = {
    v: 1,
    m: message,
    s: senderName,
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
    pl,
    co,
    d: weather.d,
    t: weather.t,
  };
  if (title) payload.ti = title;
  if (recipientName) payload.to = recipientName;
  if (ink) payload.ink = ink;
  if (stampVariant) payload.sv = stampVariant;
  if (weather.wt !== undefined) {
    payload.wt = weather.wt;
    payload.wc = weather.wc;
  }

  const bytes = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const privateKey = Buffer.from(process.env.ED25519_PRIVATE_KEY, 'base64');
  const sig = await ed.signAsync(bytes, privateKey);
  const fragment = `${base64url(bytes)}.${base64url(sig)}`;

  let origin = process.env.APP_BASE_URL;
  if (!origin) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    origin = `${proto}://${host}`;
  }
  origin = origin.replace(/\/+$/, '');
  const cardUrl = `${origin}/card.html#${fragment}`;

  if (cardUrl.length > 6000) {
    res.status(400).json({ field: 'payload_too_large' });
    return;
  }

  res.status(200).json({
    ok: true,
    cardUrl,
    place: pl,
    country: co,
  });
}
