// Renders og.png (1200x630) from an inline envelope SVG. Run once: `node scripts/make-og.mjs`
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="desk" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#1f2a33" />
      <stop offset="70%" stop-color="#141c23" />
    </radialGradient>
    <pattern id="chevron" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="28" fill="#c2452d" />
      <rect x="14" width="14" height="28" fill="#2e5e8c" />
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#desk)" />

  <g transform="translate(300,140)">
    <rect x="-6" y="-6" width="612" height="362" rx="8" fill="url(#chevron)" />
    <rect x="0" y="0" width="600" height="350" rx="6" fill="#f6f1e5" />
    <path d="M0,0 L300,200 L600,0" fill="none" stroke="#e9e2d2" stroke-width="3" />
    <path d="M0,350 L300,200" fill="none" stroke="#e9e2d2" stroke-width="3" />
    <path d="M600,350 L300,200" fill="none" stroke="#e9e2d2" stroke-width="3" />
    <circle cx="470" cy="90" r="46" fill="none" stroke="rgba(62,58,52,0.5)" stroke-width="2" />
    <circle cx="470" cy="90" r="36" fill="none" stroke="rgba(62,58,52,0.5)" stroke-width="1.5" />
  </g>

  <text x="600" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#f6f1e5" letter-spacing="2">You've got a postcard</text>
</svg>
`;

const outPath = path.join(__dirname, '..', 'og.png');
await sharp(Buffer.from(svg)).resize(1200, 630).png().toFile(outPath);
console.log(`Wrote ${outPath}`);
