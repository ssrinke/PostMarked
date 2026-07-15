// Verifies and decodes a card fragment into a payload object.
// Paste the hex public key printed by scripts/generate-keys.mjs below.
import * as ed from './vendor/noble-ed25519.js';
import { splitFragment, inflate, utf8Decode } from './codec.js';

const PUBLIC_KEY_HEX = '45182c46ff8327a1ca19d326e965d03c4e03364ddf651d34eb4d53013361bf00';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// Returns the decoded payload object on success, or null on any failure (damaged state).
export async function verifyAndDecode(fragment) {
  if (!fragment) return null;
  const split = splitFragment(fragment);
  if (!split) return null;

  try {
    const publicKey = hexToBytes(PUBLIC_KEY_HEX);
    const valid = await ed.verifyAsync(split.sig, split.bytes, publicKey);
    if (!valid) return null;

    const inflated = await inflate(split.bytes);
    const payload = JSON.parse(utf8Decode(inflated));
    if (payload.v !== 1) return null;
    return payload;
  } catch {
    return null;
  }
}
