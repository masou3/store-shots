# Store Shots

A personal, client-side generator for App Store and Play Store listing screenshots:
an app screenshot inside a procedurally-drawn device frame, a headline above it, a
gradient behind it. Think AppScreens or AppLaunchpad, stripped to the parts one indie
developer actually uses.

**This is a personal tool.** No accounts, no backend, no server, no shared state — it
runs entirely in the browser. Project config lives in `localStorage`; screenshot blobs
live in IndexedDB. The deployed URL is public, but anyone who opens it just gets a blank
tool of their own; there is nothing to share and nothing to leak.

## Two stores, two independent sets

A project holds up to two sets — one for the App Store, one for the Play Store — chosen
at a gate on first load. Each set has its own device, sizes, layout, background, type and
slides. "Set up for the other store" clones the current set (images duplicated under new
keys, not aliased) and then the two are fully independent — no sync. The App Store set
holds 1–10 screenshots; the Play set 2–8 (4+ to be eligible for Play's featured
surfaces). Cloning App Store → Play truncates to 8, cutting from the tail, and warns
first.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Zustand · Canvas 2D · `fast-png` ·
`jszip` · `culori` (Oklab gradient interpolation) · `idb-keyval`. Inter is bundled as a
variable font via `next/font/local`. Fully static — nothing runs server-side.

## Two facts that cost the most to learn

**1. Exports are PNG-24 with the alpha channel stripped.** Both App Store Connect and
Play Console reject PNGs that carry an alpha channel, and `canvas.toBlob('image/png')`
*always* emits RGBA (PNG colour type 6) — the file looks perfect and the upload fails
silently. The export path reads `getImageData` (RGBA), drops every 4th byte, and encodes
truecolour RGB (colour type 2) with `fast-png`. A test asserts IHDR byte 25 === 2, the
one byte standing between a clean upload and a rejected build. JPEG 0.92 is offered as a
fallback only.

**2. The Pixel frame's screen aspect is the panel, 1280:2856 (≈0.4482) — not Play's
1080:1920 output canvas.** Play specifies a *marketing image* size, not a device
resolution. The device drawn inside that canvas is artwork, and its screen aspect must
match the captures you actually feed it, which come off a ~20:9 Pixel. Using the output
canvas aspect would crop every native capture by ~20% before anything else touched it.
(The iPhone gets away with 1320:2868 for both only because that happens to be *both*
Apple's required screenshot size and the 17 Pro Max panel — an Apple coincidence with no
Google equivalent.)

## Debug routes (kept in production as a deployed-bundle smoke test)

- **`/debug`** — the canvas gradient next to a CSS `linear-gradient(… in oklab)` with
  identical values at several angles. If the pairs are indistinguishable, the linear-
  gradient endpoint maths is correct.
- **`/debug/frames`** — iPhone and Pixel frames across the four layouts, each fed a test
  pattern generated at that frame's native aspect. Asserts centring and geometry: cross
  dead-centre, even border where the screen is uncropped, corners clipping cleanly. (It
  cannot validate the aspect *constants* — only a native capture can — those are pinned
  to the published panel sizes.)
- **`/debug/set-zone`** — an automated pixel assertion: a 3-slide set at one-, two- and
  three-line headlines must place the device at identical size and position on both
  canvases, because the text zone is measured once across the whole set. Renders at export
  resolution and reads the device edges from actual pixels; each canvas prints PASS/FAIL.

If those three render correctly on the deployed URL, the Vercel build matches dev.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm test         # vitest — includes the IHDR colour-type-2 assertion
```

## License

The application code is a personal project. Inter is licensed under the SIL Open Font
License 1.1; the license text travels with the font at
[`public/fonts/OFL.txt`](public/fonts/OFL.txt).
