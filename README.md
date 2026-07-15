# Postmarked

Location-locked digital postcards. Compose only from a real place (GPS-gated); the card is stamped with un-fakeable place/date/weather, time-locked to arrive 3–5 days later, and delivered by the sender themselves through their own messaging apps (share sheet).

No database. No accounts. No email sending. No photos. Nothing is stored server-side — every postcard is a signed, self-contained URL fragment.

## Stack

- Vanilla HTML/CSS/JS ES modules — no framework, no bundler, no build step.
- One Vercel serverless function (Node 20) at `/api/stamp.js`.
- `@noble/ed25519` for signing (server) and verification (vendored single-file copy in the browser).
- Nominatim (reverse geocoding) and Open-Meteo (weather + timezone) — both keyless and free.

## Setup

Prerequisites: Node 20+, a Vercel account (free hobby tier), the Vercel CLI.

```bash
npm install
node scripts/generate-keys.mjs        # prints ED25519_PRIVATE_KEY (base64) and PUBLIC_KEY_HEX
# paste PUBLIC_KEY_HEX into js/verify.js
node scripts/make-og.mjs              # renders og.png (1200×630) from an inline envelope SVG via sharp
npm i -g vercel && vercel login && vercel link
vercel env add ED25519_PRIVATE_KEY    # paste from keygen (add to Production + Preview + Development)
vercel env add NOMINATIM_CONTACT      # a contact email, per Nominatim's usage policy
echo "DEV_FAST_DELIVERY=1" >> .env.local   # local only: cards arrive in 2 minutes
vercel dev                            # http://localhost:3000  (localhost = secure context, geolocation works)
vercel --prod                         # deploy; custom domain optional via Vercel dashboard
```

## Notes

- **`?mock=lat,lng`** — on `localhost` only, `index.html` will use this query param instead of calling the real Geolocation API, so you can test the compose flow without GPS. It has no effect off localhost.
- **Key rotation** — rotating `ED25519_PRIVATE_KEY` (and the matching `PUBLIC_KEY_HEX` in `js/verify.js`) invalidates every previously mailed card; old links will show the damaged state, since the signature no longer verifies against the new public key.
- **Device-clock limitation** — the time lock (`nb`, "not before") is compared against the *recipient's device clock* in the browser, not a server clock. A recipient with a badly wrong system clock could see a card early or late. This is an accepted MVP limitation.
- **No server-side storage** — the server never writes anything to disk or a database. The signed payload in the card URL fragment *is* the postcard; rate limiting is an in-memory, best-effort counter that resets on every cold start.
- **`dev.html`** — an unlinked development harness for visually verifying the generative artwork (stamp, postmark, front, back) and every card state (in-transit, tear, damaged) without GPS or a deployment. Not linked from any page.
