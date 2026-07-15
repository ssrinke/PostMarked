// Base64url + fragment helpers shared by verify.js and card.js.

export function bytesToBase64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8Encode(str) {
  return new TextEncoder().encode(str);
}

export function utf8Decode(bytes) {
  return new TextDecoder().decode(bytes);
}

// Splits a "bytes.sig" fragment into { bytes, sig } Uint8Arrays, or null if malformed.
export function splitFragment(fragment) {
  const parts = fragment.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    return { bytes: base64urlToBytes(parts[0]), sig: base64urlToBytes(parts[1]) };
  } catch {
    return null;
  }
}

export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
