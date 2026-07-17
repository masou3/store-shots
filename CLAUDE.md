# Store Shots

Personal, client-side App Store / Play Store screenshot generator. Next.js App Router,
`'use client'` throughout, no backend. **One** render function — `lib/render.ts`
`renderSlide` — drives preview, thumbnails, row view and export. Change rendering there
and nowhere else; WYSIWYG is guaranteed by using the same function at every scale.

**This repo is the spec.** There is no external brief. If an instruction conflicts with
what's here, ask rather than reconcile against a remembered document — this project spent
eleven review cycles with two people working from two different specs neither could see,
and neither noticed until step 11.

## Constraints that look wrong and aren't

Each is load-bearing and easy to "fix" back into a bug.

- **Pixel frame screen aspect is 1280:2856** — the panel, not Play's 1080:1920
  (`lib/deviceSpecs.ts`). 1080:1920 is a marketing-canvas size, not a device resolution;
  the device is artwork drawn inside that canvas and its screen must match the ~20:9
  captures you feed it. Apple's 1320:2868 being both the required size *and* the 17 Pro
  Max panel is a coincidence with no Google equivalent.
- **Export is PNG-24 with the alpha channel stripped** (`lib/png.ts`).
  `canvas.toBlob('image/png')` always emits RGBA and both stores reject alpha; the path
  reads `getImageData` → drops the 4th byte → encodes truecolour RGB with `fast-png`.
  `lib/png.test.ts` asserts IHDR byte 25 === 2. Never route export back through
  `toBlob`. JPEG is a fallback only.
- **Crop layouts size by width and position by bleed** (`lib/render.ts` `deviceGeometry`,
  `lib/layouts.ts`). Do NOT chain device size to slot position (`deviceFill =
  slotHeight * fill`): on the tall iOS canvas that forces the body past canvas width just
  to reach the bottom edge, slicing the silhouette. Escaping that is the entire reason
  the bleed contract exists. Float and angled stay slot/height-driven — deliberate, not
  an inconsistency.
- **The text zone is measured across the whole SET, not per slide** (`lib/render.ts`
  `measureSetTextZone`). It is why devices land identically regardless of headline
  length. If devices go ragged across a set, this is the cause. Do NOT fix collision by
  lowering `deviceWidthPct` — no width stays collision-idle for every headline length; it
  only moves the cliff.
- **The export loop yields with `setTimeout(0)`, never rAF** (`lib/bulkExport.ts`). rAF
  drops to zero in hidden tabs and the export exists to be tabbed away from. The yield is
  skipped entirely while `document.hidden`.
- **The two store sets are independent after the clone. There is no sync and must never
  be one** (`lib/store.ts`, `lib/storeKinds.ts`). Nothing can be held constant across two
  canvases of different aspect — that is the whole reason the gate and two-set model
  exist. The clone copies once (images under new IndexedDB keys, duplicated not aliased)
  and truncates to the target's cap from the tail, warning first.
- **Grain defaults to 0.02 and roughly triples PNG size** (`lib/grain.ts`; fixed-seed
  PRNG so exports are byte-identical across sessions — the project round-trip depends on
  it). It is a slider because the right amount is taste; 0 skips the pass.

## Debug routes (kept in production, they smoke-test the deployed bundle)

- `/debug` — canvas gradient beside a CSS `linear-gradient(… in oklab)` at several
  angles. **Visual only; cannot fail automatically** — you judge by eye that the
  endpoint maths matches CSS.
- `/debug/frames` — frames × the four layouts, each fed a per-frame test pattern; checks
  centring and geometry (cross centred, even border, clean corner clipping). **Cannot
  test the aspect constants** — a pattern generated from a constant round-trips through
  it regardless; only a native device capture could. Visual.
- `/debug/set-zone` — the one that actually fails. Renders a 3-slide varying-headline set
  at export resolution, reads device edges from pixels, prints PASS/FAIL per canvas.
  **Goes red if the set-wide text zone stops holding** — devices landing at different
  size or position across slides.

## Working rules

- **Test the spec against reality, not behaviour against the spec.** A pattern generated
  from a constant cannot test that constant; that mistake once shipped a wrong Pixel
  aspect that passed its own test.
- **Report everything built, including beyond what was asked.** Grain shipped at step 1
  and went unnamed for ten steps.
- **Deploy is CLI: `vercel deploy --prod`.** Push-to-deploy is not wired (the Vercel team
  and the GitHub account don't share the app integration). `npm test` runs the PNG
  assertion; `npm run build` must pass before deploying.
- In dev, `window.__storeshots` exposes the store and pipeline for driving real flows; it
  is dead-code-stripped from production behind a `NODE_ENV` guard (verify with a grep of
  the built bundle, not the config).
