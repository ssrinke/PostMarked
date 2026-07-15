// Generates an Ed25519 keypair for signing/verifying postcard payloads.
// Run once during setup: `node scripts/generate-keys.mjs`
import * as ed from '@noble/ed25519';

const privateKey = ed.utils.randomPrivateKey();
const publicKey = await ed.getPublicKeyAsync(privateKey);

const privateBase64 = Buffer.from(privateKey).toString('base64');
const publicHex = Buffer.from(publicKey).toString('hex');

console.log('\nGenerated a new Ed25519 keypair.\n');
console.log('Set this as your ED25519_PRIVATE_KEY env var (Vercel: Production + Preview + Development):\n');
console.log(privateBase64);
console.log('\nPaste this as PUBLIC_KEY_HEX in js/verify.js:\n');
console.log(publicHex);
console.log('\nWarning: rotating this key invalidates every previously mailed card — old links will show the damaged state.\n');
