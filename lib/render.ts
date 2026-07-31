import type {
  BackgroundPattern,
  Ctx2D,
  DeviceSpec,
  Orientation,
  Slide,
  SlideBackground,
  SlideLayout,
  StoreSize,
  Theme,
} from './types';
import { getSpec } from './deviceSpecs';
import { orientSize, slideOrientation } from './sizes';
import {
  fillLinearGradient,
  fillRadialGradient,
  fillConicGradient,
  fillMeshGradient,
} from './gradient';
import { drawGrain } from './grain';
import { wrapRichText, lineWidth, type RichLine } from './text';
import { resolveFontFamily } from './fonts';
import { getBitmap } from './images';
import { clockBox, drawScreenChrome, statusBarOf, type ScreenFit } from './statusBar';
import {
  ASCENT_EM,
  BUTTON_THICKNESS_PCT,
  DEVICE_MAX_HEIGHT_PCT,
  DEVICE_MAX_WIDTH_PCT,
  SIDE_TEXT_BAND_PCT,
  DEVICE_SHADOW_BLUR_PCT,
  DEVICE_SHADOW_COLOUR,
  DEVICE_SHADOW_OFFSET_PCT,
  SAFE_AREA_PCT,
  SCREEN_PLACEHOLDER_FILL,
  SUBHEAD_ALPHA,
  SUBHEAD_GAP_EM,
  SUBHEAD_SIZE_RATIO,
  SUBHEAD_WEIGHT,
  TEXT_DEVICE_GAP_PCT,
} from './constants';

type TextLayout = {
  headlineFont: string;
  subFont: string;
  headlineLines: RichLine[];
  subLines: RichLine[];
  headSize: number;
  headLineH: number;
  subLineH: number;
  subGap: number;
  maxW: number;
  blockH: number;
};

type DeviceGeometry = {
  spec: DeviceSpec;
  cx: number;
  cy: number;
  outerW: number;
  outerH: number;
  screenW: number;
  screenH: number;
  bboxW: number; // width of the rotated bounding box, for hero-span positioning
  bboxH: number; // height of the rotated bounding box, for drag hit-testing
  // Total device rotation to draw at, in degrees: the base 90° that turns a
  // landscape phone on its side, plus the user's tilt. Portrait = just the tilt.
  rotationDeg: number;
  // Degrees to counter-rotate the on-screen screenshot so app UI stays upright
  // once the frame is turned. -90 for a framed landscape slide, else 0.
  imageCounterDeg: number;
  // Whether the text zone forced this device below its requested size, and how
  // much of that size survived (1 = untouched). Reported from the same branch
  // that APPLIES the clamp, so a warning can never drift from real behaviour.
  // slot sizing has no cliff — it scales with the slot continuously — so it
  // reports slack Infinity and ratio 1.
  //
  // shrinkRatio is the number worth acting on. Whether the clamp ENGAGED turns
  // out to say nothing about whether the result looks wrong: a device at 80% of
  // its requested size is still a convincing hero, and the shipped Play phone
  // canvas has been clamped all along without anyone noticing.
  clamped: boolean;
  slackPx: number;
  shrinkRatio: number;
};

export function isSideText(layout: SlideLayout): boolean {
  return layout.textPosition === 'left' || layout.textPosition === 'right';
}

// THE load-bearing function of the side-text contract.
//
// The text column's width is a fixed fraction of the canvas, narrowed by the
// set-wide maxWidthPct dial. It is NEVER the measured width of the longest
// line. Both inputs are headline-independent, so the column — and therefore the
// device slot beside it, and therefore the device — is identical on every slide
// no matter what the headlines say.
//
// Shrinking the column to the longest actual line would look tidier and would
// reintroduce the exact bug the set-wide text zone exists to prevent, only on
// the horizontal axis: the device would then move whenever a headline changed
// length. That is why this takes no text metrics at all — it cannot drift into
// depending on them.
export function sideTextBandWidth(layout: SlideLayout, theme: Theme, canvasW: number): number {
  return canvasW * (layout.textBandPct ?? SIDE_TEXT_BAND_PCT) * (theme.text.maxWidthPct / 100);
}

// The width a slide's text wraps against. Side text wraps to its fixed column;
// top/bottom text wraps to the canvas, capped by the safe area.
function textMaxWidth(slide: Slide, theme: Theme, w: number, typeW: number): number {
  if (isSideText(slide.layout)) return sideTextBandWidth(slide.layout, theme, w);
  return Math.min(w * (theme.text.maxWidthPct / 100), w - 2 * typeW * SAFE_AREA_PCT);
}

let scratch: Ctx2D | null = null;
function scratchCtx(): Ctx2D {
  if (!scratch) {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) throw new Error('Could not get scratch 2d context');
    scratch = ctx;
  }
  return scratch;
}

// Max text block height across the whole set — but split by orientation. Type
// is a fraction of canvas width, and a landscape slide is far wider than its
// portrait siblings, so the two orientations land on different zones. Each
// slide uses the zone for its own orientation, so devices land identically
// across every slide of that orientation regardless of headline length. A
// portrait-only set simply leaves `landscape` at 0. Fonts must be loaded first.
export type SetTextZones = { portrait: number; landscape: number };

export function measureSetTextZone(slides: Slide[], theme: Theme, size: StoreSize): SetTextZones {
  const ctx = scratchCtx();
  const zones: SetTextZones = { portrait: 0, landscape: 0 };
  // Type scales off the short side (portrait width) in both orientations, so a
  // landscape headline is the same optical size as a portrait one.
  const typeW = Math.min(size.width, size.height);
  for (const s of slides) {
    // Side-text slides are excluded on purpose. Their zone is a fixed vertical
    // band whose width owes nothing to text height, so folding their block
    // height into this max would push the DEVICE down on their top-text
    // siblings for no reason — a coupling with no geometric justification.
    if (isSideText(s.layout)) continue;
    const o = slideOrientation(s);
    // Landscape wraps against the swapped (wider) canvas width.
    const w = o === 'landscape' ? size.height : size.width;
    zones[o] = Math.max(zones[o], layoutText(ctx, s, theme, w, typeW).blockH);
  }
  return zones;
}

// The zone a single slide should use, picked from the set-wide pair by the
// slide's orientation. Callers hold the pair and pass the scalar per slide.
export function zoneForSlide(zones: SetTextZones, slide: Slide): number {
  return zones[slideOrientation(slide)];
}

// How much the set-wide text zone has cost the devices in this set.
export type SetClampState = {
  orientation: Orientation;
  clamped: boolean; // the clamp engaged at all — diagnostic, NOT a warning trigger
  slackPx: number; // room left before the clamp fires, in store px
  slackLines: number; // the same slack expressed in headline lines
  // Smallest surviving fraction of requested device size across the set, 0..1.
  // This is the one to act on: it measures what a person can actually see.
  shrinkRatio: number;
  headline: string; // the longest headline — the one actually driving the zone
};

// Bleed (crop) layouts size by width and position by bleed, so the text zone
// normally plays NO part in how big the device is — right up until the zone
// grows enough that the visible part of the device would collide with it. Then
// the device shrinks. That transition is a cliff, not a ramp.
//
// It has to be reported set-wide because the zone is the max across the set:
// one long headline shrinks the device on EVERY slide of that orientation,
// including slides whose own headline is short. That connection is invisible
// from any single slide, which is the whole reason this is surfaced.
//
// Slot layouts (float, angled) scale with the slot continuously and have no
// cliff, so they are skipped rather than reported as a near miss.
// Reported PER ORIENTATION, not as one worst-of-set: a set can mix, and the
// two orientations have independent zones. Collapsing them would let a tight
// portrait slide mask a landscape one that had already gone over the cliff.
export function measureSetClamp(
  slides: Slide[],
  theme: Theme,
  size: StoreSize,
  zones: SetTextZones,
): Partial<Record<Orientation, SetClampState>> {
  const ctx = scratchCtx();
  const worst: Partial<Record<Orientation, SetClampState>> = {};
  for (const slide of slides) {
    if (slide.layout.deviceSizing !== 'bleed') continue;
    const o = slideOrientation(slide);
    const oriented = orientSize(size, o);
    const { geo, text } = computeSlideGeom(ctx, slide, theme, oriented, zoneForSlide(zones, slide));
    if (!Number.isFinite(geo.slackPx) || text.headLineH <= 0) continue;
    const slackLines = geo.slackPx / text.headLineH;
    const cur = worst[o];
    // Ranked by surviving device size, since that is what the warning keys off.
    if (!cur || geo.shrinkRatio < cur.shrinkRatio) {
      // The headline blamed is the set's LONGEST for this orientation, not this
      // slide's — that is the one the user has to shorten to get the size back.
      const longest = slides
        .filter((s) => slideOrientation(s) === o)
        .reduce((a, b) => (b.headline.length > a.headline.length ? b : a), slide);
      worst[o] = {
        orientation: o,
        clamped: geo.clamped,
        slackPx: geo.slackPx,
        slackLines,
        shrinkRatio: geo.shrinkRatio,
        headline: longest.headline,
      };
    }
  }
  return worst;
}

export type RenderOpts = {
  // Set-wide max text block height from measureSetTextZone; when omitted the
  // slide's own block is used (single-slide contexts only).
  setBlockH?: number;
  // Position of this slide in the set — drives the continuous-background
  // slice. Omitted = slice 0 of 1.
  slideIndex?: number;
  slideCount?: number;
  // The previous slide, when IT has overlapNext set: its device is redrawn on
  // this frame's left edge so a hero phone reads as continuous across the two
  // frames when shown side-by-side.
  spillPrev?: Slide;
};

type SlideGeom = {
  layout: SlideLayout;
  text: TextLayout;
  blockTop: number;
  blockLeft: number;
  geo: DeviceGeometry;
  bmp: ImageBitmap | null;
};

// The geometry half of renderSlide, factored out so the hero-span spill can
// recompute the neighbouring slide's device identically. cx already carries the
// overlap offset that pushes a hero device past the right edge.
function computeSlideGeom(
  ctx: Ctx2D,
  slide: Slide,
  theme: Theme,
  size: StoreSize,
  setBlockH?: number,
): SlideGeom {
  const w = size.width;
  const h = size.height;
  const layout = slide.layout;
  // size here is already oriented; the short side is the type reference so text
  // stays optically consistent with the set's portrait slides.
  const text = layoutText(ctx, slide, theme, w, Math.min(w, h));
  const side = isSideText(layout);
  const bmp = slide.imageKey ? getBitmap(slide.imageKey) : null;
  const landscape = slideOrientation(slide) === 'landscape';

  // Side text: a VERTICAL band. The zone eats horizontal space and the device
  // keeps the full canvas height. Note the zone width uses the fixed band, not
  // setBlockH — nothing about it depends on how long the headlines are, which
  // is the whole point (see sideTextBandWidth). The text block centres
  // vertically in the canvas, so IT moves with headline length while the
  // device does not.
  const insetX = w * (layout.textInsetPct / 100);
  const insetY = h * (layout.textInsetPct / 100);
  const zoneW = side ? insetX + text.maxW + w * TEXT_DEVICE_GAP_PCT : 0;
  const slotLeft = side && layout.textPosition === 'left' ? zoneW : 0;
  const slotRight = side && layout.textPosition === 'right' ? w - zoneW : w;

  const gap = h * TEXT_DEVICE_GAP_PCT;
  const zoneH = side ? 0 : insetY + (setBlockH ?? text.blockH) + gap;
  const slotTop = !side && layout.textPosition === 'top' ? zoneH : 0;
  const slotBottom = !side && layout.textPosition === 'top' ? h : h - zoneH;

  const blockTopBase = side
    ? (h - text.blockH) / 2
    : layout.textPosition === 'top'
      ? insetY
      : h - insetY - text.blockH;
  const blockTop = blockTopBase + (layout.textOffsetY ?? 0);
  // Top/bottom text is centred across the canvas; side text is pinned into its
  // own column, so the box left edge is the band's, not a centred offset.
  const blockLeftBase = side
    ? layout.textPosition === 'left'
      ? insetX
      : w - insetX - text.maxW
    : (w - text.maxW) / 2;
  const blockLeft = blockLeftBase + (layout.textOffsetX ?? 0);

  const geo = deviceGeometry(
    theme,
    layout,
    size,
    slotTop,
    slotBottom,
    slotLeft,
    slotRight,
    bmp ? bmp.width / bmp.height : null,
    landscape,
  );
  const overlap = layout.overlapNext ?? 0;
  if (overlap > 0) {
    // Right edge lands at w + overlap*bboxW, so that fraction hangs into the
    // next frame; the next frame draws the same device at cx - w.
    geo.cx = w + overlap * geo.bboxW - geo.bboxW / 2;
  }
  // Free-drag horizontal nudge, on top of the centred (or overlap) position.
  geo.cx += layout.deviceOffsetX ?? 0;
  return { layout, text, blockTop, blockLeft, geo, bmp };
}

// The one render function. Preview, row, thumbnails and export all call this
// and nothing else. Every draw call below is in full store coordinate space;
// the single ctx.scale() at the top is the only place `scale` exists.
export function renderSlide(
  ctx: Ctx2D,
  slide: Slide,
  theme: Theme,
  size: StoreSize,
  scale: number,
  opts: RenderOpts = {},
): void {
  const w = size.width;
  const h = size.height;
  ctx.save();
  ctx.scale(scale, scale);

  // Per-slide text look folds onto theme.text. Only non-metric fields (colour,
  // accent, glow) can differ, so wrapping — and the set-wide zone — is
  // unaffected; this just changes how the glyphs are painted.
  const effTheme: Theme = slide.textStyle
    ? { ...theme, text: { ...theme.text, ...slide.textStyle } }
    : theme;

  // Layout first: the text zone is measured, and the device slot is whatever
  // rect is left. Device height comes from the slot, never from canvas width.
  const cur = computeSlideGeom(ctx, slide, effTheme, size, opts.setBlockH);

  drawBackground(ctx, slide, theme, w, h, scale, opts);
  // Texture then vignette, both over the background and under everything else.
  if (theme.pattern) drawPattern(ctx, theme.pattern, w, h);
  if (theme.vignette) drawVignette(ctx, w, h, theme.vignette);

  // Hero span: a previous slide whose device overflows into this frame gets
  // redrawn here first, so this frame's own text and device sit on top of it.
  if (opts.spillPrev) {
    const prev = computeSlideGeom(ctx, opts.spillPrev, theme, size, opts.setBlockH);
    drawDevice(ctx, prev.bmp, theme, prev.layout, { ...prev.geo, cx: prev.geo.cx - w }, scale);
  }

  drawTextBlock(ctx, cur.text, effTheme, cur.blockLeft, cur.blockTop, scale);
  drawDevice(ctx, cur.bmp, theme, cur.layout, cur.geo, scale);
  drawGrain(ctx, w, h, theme.grain);
  // A glowing border framing the whole slide — over everything, drawn last.
  if (theme.edgeGlow) drawEdgeGlow(ctx, theme.edgeGlow, w, h, scale);

  ctx.restore();
}

// The screen rect as the OS chrome sees it. A framed landscape slide turns the
// silhouette 90° and counter-turns the capture back, so inside that frame the
// screen's width and height are swapped relative to the canvas. Derived once
// here and shared by the draw (drawDevice) and the hit-test (hitRegions), the
// same way both share computeSlideGeom.
function chromeRect(geo: DeviceGeometry): { rw: number; rh: number; portrait: boolean } {
  return {
    rw: geo.imageCounterDeg ? geo.screenH : geo.screenW,
    rh: geo.imageCounterDeg ? geo.screenW : geo.screenH,
    portrait: geo.imageCounterDeg === 0,
  };
}

export type HitRegions = {
  device: { cx: number; cy: number; w: number; h: number };
  text: { x: number; y: number; w: number; h: number };
  // The status bar clock, when there is a bar to grab one from. Null when the
  // bar is switched off.
  //
  // Mixed frames on purpose: cx/cy are canvas coordinates (where the box is),
  // while w/h are in the CHROME frame (how big it is along the screen's own
  // axes). rotationDeg is what relates them — the caller rotates a pointer, or
  // a pointer delta, by -rotationDeg to work in the screen's left/right rather
  // than the canvas's. An axis-aligned bbox would lose the axis the drag needs.
  clock: {
    cx: number;
    cy: number;
    w: number;
    h: number;
    rotationDeg: number;
    // The chrome frame's short side, the unit every statusBar.ts metric is a
    // fraction of. Handed out so the caller can turn a drag in canvas pixels
    // into a nudge without re-deriving the screen rect.
    unit: number;
  } | null;
};

// Axis-aligned bounding boxes (store coords) of the device and the text block,
// for drag hit-testing in the preview. Computed through the SAME geometry as
// renderSlide (computeSlideGeom), so a region always matches what's drawn —
// including the drag offsets already folded in. Device box is the rotated
// bbox; text box is the wrap width by the measured block height.
export function hitRegions(
  slide: Slide,
  theme: Theme,
  size: StoreSize,
  opts: RenderOpts = {},
): HitRegions {
  const ctx = scratchCtx();
  const { text, blockTop, blockLeft, geo } = computeSlideGeom(ctx, slide, theme, size, opts.setBlockH);
  return {
    device: { cx: geo.cx, cy: geo.cy, w: geo.bboxW, h: geo.bboxH },
    text: { x: blockLeft, y: blockTop, w: text.maxW, h: text.blockH },
    clock: clockRegion(geo, theme),
  };
}

// The clock's grab box, mapped out of the chrome frame and onto the canvas.
// drawDevice reaches that frame by translating to the device centre, rotating
// by rotationDeg, then rotating again by imageCounterDeg — so a point in it
// lands on canvas at centre + R(rotationDeg + imageCounterDeg) · p. Rotations
// about the same origin add, which is the only reason this is two lines.
function clockRegion(geo: DeviceGeometry, theme: Theme): HitRegions['clock'] {
  if (!statusBarOf(theme).show) return null;
  const { rw, rh, portrait } = chromeRect(geo);
  const box = clockBox({ rw, rh, bmp: null, fit: null, spec: geo.spec, theme, portrait });
  const rotationDeg = geo.rotationDeg + geo.imageCounterDeg;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    cx: geo.cx + box.cx * cos - box.cy * sin,
    cy: geo.cy + box.cx * sin + box.cy * cos,
    w: box.w,
    h: box.h,
    rotationDeg,
    unit: Math.min(rw, rh),
  };
}

// Background is a per-slide photo when set, otherwise the theme gradient/solid.
// The photo is cover-fit, optionally blurred and darkened for text legibility.
function drawBackground(
  ctx: Ctx2D,
  slide: Slide,
  theme: Theme,
  w: number,
  h: number,
  scale: number,
  opts: RenderOpts,
): void {
  const bg = slide.bg;
  const bmp = bg?.imageKey ? getBitmap(bg.imageKey) : null;
  if (bg && bmp) {
    // A solid base first so a partially-loaded / letterboxed photo never leaves
    // the canvas transparent (both stores reject alpha).
    ctx.fillStyle = theme.gradient.mode === 'solid' ? theme.gradient.from : '#000000';
    ctx.fillRect(0, 0, w, h);

    const blurStore = (bg.blur ?? 0) * w; // blur radius in store px
    ctx.save();
    // Canvas filter blur is in device px (not scaled by the CTM), same quirk as
    // the device shadow — apply scale by hand so preview and export match.
    if (blurStore > 0) ctx.filter = `blur(${blurStore * scale}px)`;
    const s = Math.max(w / bmp.width, h / bmp.height);
    const dw = bmp.width * s;
    const dh = bmp.height * s;
    // Overscan by the blur radius so the softened edge never reveals the canvas.
    const over = blurStore * 2;
    ctx.drawImage(bmp, (w - dw) / 2 - over, (h - dh) / 2 - over, dw + over * 2, dh + over * 2);
    ctx.restore();

    if (bg.duotone) applyDuotone(ctx, bg.duotone, w, h);

    const d = bg.darken ?? 0;
    if (d > 0) {
      ctx.fillStyle = `rgba(0,0,0,${d})`;
      ctx.fillRect(0, 0, w, h);
    }
    return;
  }

  // Set-wide panorama: one photo across the whole set, this slide's slice. The
  // per-slide bg above wins, so a single slide can still break the panorama.
  const pano = theme.panorama;
  const panoBmp = pano?.imageKey ? getBitmap(pano.imageKey) : null;
  if (pano && panoBmp) {
    drawPanoramaSlice(ctx, panoBmp, pano, theme, w, h, scale, opts.slideIndex ?? 0, opts.slideCount ?? 1);
    return;
  }

  const g = theme.gradient;
  if (g.mode === 'solid') {
    ctx.fillStyle = g.from;
    ctx.fillRect(0, 0, w, h);
  } else if (g.mode === 'radial') {
    ctx.fillStyle = g.from;
    ctx.fillRect(0, 0, w, h);
    fillRadialGradient(ctx, w, h, g.from, g.to, focalY(g.origin, h));
  } else if (g.mode === 'conic') {
    fillConicGradient(ctx, w, h, g.from, g.to, g.angle, focalY(g.origin, h));
  } else if (g.mode === 'mesh') {
    fillMeshGradient(ctx, w, h, g.mesh ?? [g.from, g.to, g.from, g.to]);
  } else {
    const continuous = theme.gradient.continuous && (opts.slideCount ?? 1) > 1;
    fillLinearGradient(
      ctx,
      w,
      h,
      theme.gradient.from,
      theme.gradient.to,
      theme.gradient.angle,
      continuous ? (opts.slideIndex ?? 0) : 0,
      continuous ? (opts.slideCount ?? 1) : 1,
    );
  }
}

// One slice of a set-wide panorama. The photo is cover-fit to a virtual canvas
// of width w*count (all slides side-by-side), then this slide draws the whole
// scaled image shifted left by idx*w so its slice lands in [0,w]. Because every
// slide uses the identical fit and the same per-slide blur kernel over shared
// source pixels, the slices line up seamlessly when the exported PNGs are shown
// in a row. No overscan (it would rescale per slide and break the seam); a solid
// base fill covers any soft edge at the very outer canvas boundary.
function drawPanoramaSlice(
  ctx: Ctx2D,
  bmp: ImageBitmap,
  pano: SlideBackground,
  theme: Theme,
  w: number,
  h: number,
  scale: number,
  idx: number,
  count: number,
): void {
  const n = Math.max(1, count);
  ctx.fillStyle = theme.gradient.mode === 'solid' ? theme.gradient.from : '#000000';
  ctx.fillRect(0, 0, w, h);

  const virtualW = w * n;
  const s = Math.max(virtualW / bmp.width, h / bmp.height);
  const dw = bmp.width * s;
  const dh = bmp.height * s;
  const originX = (virtualW - dw) / 2 - idx * w;
  const originY = (h - dh) / 2;

  const blurStore = (pano.blur ?? 0) * w;
  ctx.save();
  if (blurStore > 0) ctx.filter = `blur(${blurStore * scale}px)`;
  ctx.drawImage(bmp, originX, originY, dw, dh);
  ctx.restore();

  if (pano.duotone) applyDuotone(ctx, pano.duotone, w, h);

  const d = pano.darken ?? 0;
  if (d > 0) {
    ctx.fillStyle = `rgba(0,0,0,${d})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// Vertical focal point for radial/conic modes.
function focalY(origin: 'center' | 'top' | 'bottom' | undefined, h: number): number {
  return origin === 'top' ? h * 0.28 : origin === 'bottom' ? h * 0.72 : h / 2;
}

// Stylised duotone over a photo: multiply pushes shadows toward `shadow`, screen
// lifts highlights toward `highlight`. The photo covers the canvas (cover-fit),
// so the whole rect is the photo. Composite ops are reset by save/restore.
function applyDuotone(ctx: Ctx2D, duo: { shadow: string; highlight: string }, w: number, h: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = duo.shadow;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = duo.highlight;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// A soft glow bleeding inward from the slide edges — no visible outline. The
// stroke is pushed fully off-canvas so its crisp line is clipped away and only
// its blurred shadow (the glow) falls onto the canvas. Drawn last, over text +
// phone. shadowBlur is device-px, so scale by hand; passes build the glow.
function drawEdgeGlow(
  ctx: Ctx2D,
  glow: { strength: number; colour: string },
  w: number,
  h: number,
  scale: number,
): void {
  if (glow.strength <= 0) return;
  const m = Math.min(w, h);
  const lw = Math.max(2, m * 0.006);
  const off = lw; // whole stroke sits outside the canvas; only its glow shows
  ctx.save();
  ctx.strokeStyle = glow.colour;
  ctx.shadowColor = glow.colour;
  ctx.lineWidth = lw;
  ctx.shadowBlur = m * 0.09 * glow.strength * scale;
  for (let i = 0; i < 4; i++) ctx.strokeRect(-off, -off, w + 2 * off, h + 2 * off);
  ctx.restore();
}

// Darkened edges: transparent at the centre, ramping to black at the corners.
function drawVignette(ctx: Ctx2D, w: number, h: number, strength: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.hypot(w / 2, h / 2));
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Tiled geometric texture. All draws are in store coordinates (the ctx is
// already scaled), so line widths and cell sizes stay identical in preview and
// export. `scale` (cell size) is a fraction of canvas width.
function drawPattern(ctx: Ctx2D, pattern: BackgroundPattern, w: number, h: number): void {
  const step = Math.max(4, pattern.scale * w);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pattern.opacity));
  ctx.fillStyle = pattern.colour;
  ctx.strokeStyle = pattern.colour;
  ctx.lineWidth = Math.max(1, step * 0.045);

  if (pattern.kind === 'dots') {
    const r = step * 0.09;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern.kind === 'grid') {
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  } else {
    // 45° diagonals; crosshatch adds the opposite direction.
    ctx.beginPath();
    for (let d = -h; d < w; d += step) {
      ctx.moveTo(d, 0);
      ctx.lineTo(d + h, h);
    }
    if (pattern.kind === 'crosshatch') {
      for (let d = 0; d < w + h; d += step) {
        ctx.moveTo(d, 0);
        ctx.lineTo(d - h, h);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

// `w` is the canvas width the text wraps against. `typeW` is the reference the
// font SIZE scales from — the same across orientations (the short side of the
// canvas, i.e. the portrait width), so a headline reads at the same optical
// size on a landscape slide as on its portrait siblings. Without this a
// landscape headline would be ~2x too big (a fraction of the wide side) and
// overflow the short canvas. Defaults to `w` for the portrait case.
function layoutText(
  ctx: Ctx2D,
  slide: Slide,
  theme: Theme,
  w: number,
  typeW: number = w,
): TextLayout {
  const t = theme.text;
  const family = resolveFontFamily(t.family);
  const headSize = typeW * (t.sizePct / 100);
  // Wrap width comes from textMaxWidth: the fixed side-text column, or the
  // canvas capped by the safe area for top/bottom text. That safe-area inset is
  // a fraction of the SHORT side (typeW), matching drawSafeAreaOverlay. Taking
  // it off `w` instead made the two agree only when w was the short side — i.e.
  // in portrait — so on a landscape canvas the dashed overlay stopped
  // describing where text could actually go.
  const maxW = textMaxWidth(slide, theme, w, typeW);

  const headlineFont = `${t.weight} ${headSize}px ${family}`;
  const subSize = headSize * SUBHEAD_SIZE_RATIO;
  const subFont = `${SUBHEAD_WEIGHT} ${subSize}px ${family}`;

  ctx.save();
  ctx.font = headlineFont;
  const headlineLines = wrapRichText(ctx, slide.headline, maxW);
  let subLines: RichLine[] = [];
  if (slide.subhead) {
    ctx.font = subFont;
    subLines = wrapRichText(ctx, slide.subhead, maxW);
  }
  ctx.restore();

  const headLineH = headSize * t.lineHeight;
  const subLineH = subSize * t.lineHeight;
  const subGap = headSize * SUBHEAD_GAP_EM;
  const blockH =
    headlineLines.length * headLineH +
    (subLines.length > 0 ? subGap + subLines.length * subLineH : 0);

  return {
    headlineFont,
    subFont,
    headlineLines,
    subLines,
    headSize,
    headLineH,
    subLineH,
    subGap,
    maxW,
    blockH,
  };
}

// Two sizing contracts, both fitting against the ROTATED bounding box.
//
// 'slot' (float, angled): height-driven. deviceFill of the rect left after
// the text zone; deviceAnchor pins the bbox to a slot edge; the width cap is
// a fit-in-box clamp that must never drive these layouts.
//
// 'bleed' (crop): width-driven. deviceWidthPct of the canvas (capped);
// height derives from the body aspect — nothing to do with the slot — and
// deviceBleed of the bbox height hangs past the edge opposite the text. The
// device lands in the same place regardless of headline length. Sole fit
// constraint: shrink only if the top (or bottom) would collide with the text
// zone.
//
// deviceScale and deviceOffsetY apply on top of both.
function deviceGeometry(
  theme: Theme,
  layout: SlideLayout,
  size: StoreSize,
  slotTop: number,
  slotBottom: number,
  slotLeft: number,
  slotRight: number,
  sourceAspect: number | null,
  landscape: boolean,
): DeviceGeometry {
  const spec = getSpec(theme.frameId);
  const w = size.width;
  const h = size.height;
  // 'none' means no bezel, not no device: the rect takes the SOURCE image's
  // own aspect so the only crop is the layout's bleed — never the canvas
  // aspect, which would stack a second cover-fit crop on top. With no image
  // loaded it borrows the last-selected device's screen aspect. A frameless
  // landscape slide needs no 90° turn — the wide capture IS the landscape
  // rect — so only a real bezel gets the base rotation.
  const framedLandscape = landscape && spec.id !== 'none';
  const screenAspect =
    spec.id === 'none' ? (sourceAspect ?? noneFallbackAspect(theme)) : spec.screenAspect;
  const b = spec.bezelPct; // fraction of screen width
  const kH = 1 / screenAspect + 2 * b; // outerH = screenW * kH
  const kW = 1 + 2 * b; // outerW = screenW * kW
  const bodyAspect = kW / kH; // outerW = outerH * bodyAspect

  // Landscape lays a real phone on its side: a 90° base turn, plus the user's
  // tilt on top. The bounding box is what fits into the slot/width, so its
  // extents must use |sin|/|cos| — past 90° cos goes negative and the raw
  // factors would shrink the box instead of growing it.
  const baseRot = framedLandscape ? 90 : 0;
  const rotationDeg = baseRot + layout.deviceRotation;
  const theta = (rotationDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(theta));
  const cos = Math.abs(Math.cos(theta));
  // Rotated bounding box of the body, per unit of outerH.
  const bboxHFactor = bodyAspect * sin + cos;
  const bboxWFactor = bodyAspect * cos + sin;
  const maxW = w * DEVICE_MAX_WIDTH_PCT;

  let outerH: number;
  let cy: number;
  let cx = w / 2;
  let clamped = false;
  let slackPx = Infinity;
  let shrinkRatio = 1;

  const maxHeight = h * DEVICE_MAX_HEIGHT_PCT;

  if (isSideText(layout)) {
    // SIDE TEXT — the portrait contract reflected onto the other axis.
    //
    // 'bleed' (side crop): HEIGHT-driven. deviceHeightPct of the canvas
    // (capped); width derives from the body aspect and has nothing to do with
    // the slot; deviceBleed of the bbox WIDTH hangs past the edge opposite the
    // text. The device lands in the same place regardless of headline length.
    // Sole fit constraint: shrink only if it would collide with the text band.
    //
    // 'slot' (side float): WIDTH-driven off the slot beside the text, with the
    // height cap as the fit-in-box clamp that must never drive the layout.
    const textLeft = layout.textPosition === 'left';
    if (layout.deviceSizing === 'bleed') {
      const reqH = Math.min(
        (layout.deviceHeightPct ?? 0.86) * layout.deviceScale,
        DEVICE_MAX_HEIGHT_PCT,
      ) * h;
      outerH = reqH / bboxHFactor;
      const bleed = layout.deviceBleed;
      const available = Math.max(0, textLeft ? w - slotLeft : slotRight);
      const requiredVisible = (1 - bleed) * outerH * bboxWFactor;
      slackPx = available - requiredVisible;
      clamped = requiredVisible > available;
      if (clamped) {
        const requested = outerH;
        outerH = available / (1 - bleed) / bboxWFactor;
        shrinkRatio = requested > 0 ? outerH / requested : 1;
      }
      const bboxW = outerH * bboxWFactor;
      cx = textLeft ? w + bleed * bboxW - bboxW / 2 : -bleed * bboxW + bboxW / 2;
    } else {
      const slotW = Math.max(0, slotRight - slotLeft);
      outerH = (slotW * layout.deviceFill * layout.deviceScale) / bboxWFactor;
      if (outerH * bboxHFactor > maxHeight) {
        outerH = maxHeight / bboxHFactor;
      }
      const bboxW = outerH * bboxWFactor;
      // deviceAnchor reads as left/centre/right on this axis: 'top' pins to the
      // slot's near edge, 'bottom' to its far edge, matching how the same dial
      // pins to the top or bottom edge in the portrait contract.
      cx =
        layout.deviceAnchor === 'top'
          ? slotLeft + bboxW / 2
          : layout.deviceAnchor === 'bottom'
            ? slotRight - bboxW / 2
            : (slotLeft + slotRight) / 2;
    }
    // Full canvas height is available either way, so the device centres on it.
    cy = h / 2;
    const screenW = outerH / kH;
    return {
      spec,
      cx,
      cy: cy + layout.deviceOffsetY,
      outerW: outerH * bodyAspect,
      outerH,
      screenW,
      screenH: screenW / screenAspect,
      bboxW: outerH * bboxWFactor,
      bboxH: outerH * bboxHFactor,
      rotationDeg,
      imageCounterDeg: framedLandscape ? -90 : 0,
      clamped,
      slackPx,
      shrinkRatio,
    };
  }

  if (layout.deviceSizing === 'bleed') {
    const reqW = Math.min(layout.deviceWidthPct * layout.deviceScale, DEVICE_MAX_WIDTH_PCT) * w;
    outerH = reqW / bboxWFactor;
    const bleed = layout.deviceBleed;
    // Visible height above (below) the bled edge must clear the text zone. A
    // long headline on a short (landscape) canvas can eat the whole slot; clamp
    // to 0 so the device shrinks to nothing rather than going negative — a
    // negative outerH would flip the body and throw on the button roundRect.
    const available = Math.max(0, layout.textPosition === 'top' ? h - slotTop : slotBottom);
    // Requested visible height BEFORE any clamp — the difference is exactly the
    // cliff the editor warns about, so both read the same two numbers.
    const requiredVisible = (1 - bleed) * outerH * bboxHFactor;
    slackPx = available - requiredVisible;
    clamped = requiredVisible > available;
    if (clamped) {
      const requested = outerH;
      outerH = available / (1 - bleed) / bboxHFactor;
      shrinkRatio = requested > 0 ? outerH / requested : 1;
    }
    const bboxH = outerH * bboxHFactor;
    cy =
      layout.textPosition === 'top'
        ? h + bleed * bboxH - bboxH / 2
        : -bleed * bboxH + bboxH / 2;
  } else {
    const slotH = Math.max(0, slotBottom - slotTop);
    outerH = (slotH * layout.deviceFill * layout.deviceScale) / bboxHFactor;
    if (outerH * bboxWFactor > maxW) {
      outerH = maxW / bboxWFactor;
    }
    const bboxH = outerH * bboxHFactor;
    cy =
      layout.deviceAnchor === 'top'
        ? slotTop + bboxH / 2
        : layout.deviceAnchor === 'bottom'
          ? slotBottom - bboxH / 2
          : (slotTop + slotBottom) / 2;
  }

  const screenW = outerH / kH;
  return {
    spec,
    cx,
    cy: cy + layout.deviceOffsetY,
    outerW: outerH * bodyAspect,
    outerH,
    screenW,
    screenH: screenW / screenAspect,
    bboxW: outerH * bboxWFactor,
    bboxH: outerH * bboxHFactor,
    rotationDeg,
    imageCounterDeg: framedLandscape ? -90 : 0,
    clamped,
    slackPx,
    shrinkRatio,
  };
}

function drawTextBlock(
  ctx: Ctx2D,
  text: TextLayout,
  theme: Theme,
  boxLeft: number,
  blockTop: number,
  scale = 1,
): void {
  const t = theme.text;
  // Segments carry their own colour, so each glyph run is placed by hand with
  // textAlign 'left'; alignment is applied per line against the maxW box.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const baseColour = t.colour;
  const accentColour = t.accentColour ?? t.colour;

  type Op = { line: RichLine; y: number; font: string; alpha: number };
  const ops: Op[] = [];
  let y = blockTop + text.headSize * ASCENT_EM;
  for (const line of text.headlineLines) {
    ops.push({ line, y, font: text.headlineFont, alpha: 1 });
    y += text.headLineH;
  }
  if (text.subLines.length > 0) {
    y += text.subGap - text.headLineH + text.subLineH;
    for (const line of text.subLines) {
      ops.push({ line, y, font: text.subFont, alpha: SUBHEAD_ALPHA });
      y += text.subLineH;
    }
  }

  const paint = () => {
    for (const op of ops) {
      ctx.font = op.font;
      ctx.globalAlpha = op.alpha;
      const lw = lineWidth(ctx, op.line);
      let x =
        t.align === 'left'
          ? boxLeft
          : t.align === 'right'
            ? boxLeft + text.maxW - lw
            : boxLeft + (text.maxW - lw) / 2;
      for (const seg of op.line) {
        ctx.fillStyle = seg.accent ? accentColour : baseColour;
        ctx.fillText(seg.text, x, op.y);
        x += ctx.measureText(seg.text).width;
      }
    }
  };

  // Glow first: a blurred shadow of the glyphs. Two passes so a soft halo still
  // reads at low strength. Blur is device-px (not scaled by the CTM), so scale
  // by hand exactly like the device shadow, or preview and export diverge.
  const glow = t.glow ?? 0;
  if (glow > 0) {
    ctx.save();
    ctx.shadowColor = t.glowColour ?? '#000000';
    ctx.shadowBlur = text.headSize * 0.6 * glow * scale;
    paint();
    paint();
    ctx.restore();
  }
  paint();

  ctx.globalAlpha = 1;
}

function noneFallbackAspect(theme: Theme): number {
  const id =
    theme.lastFrameId && theme.lastFrameId !== 'none' ? theme.lastFrameId : 'iphone-17-pro';
  return getSpec(id).screenAspect;
}

// Shared construction for every frame: body rounded rect, inner stroke for
// the metal edge, screen clipped and inset by the bezel, cutout drawn last.
function drawDevice(
  ctx: Ctx2D,
  bmp: ImageBitmap | null,
  theme: Theme,
  layout: SlideLayout,
  geo: DeviceGeometry,
  scale: number,
): void {
  const { spec, outerW, outerH, screenW, screenH } = geo;

  ctx.save();
  ctx.translate(geo.cx, geo.cy);
  // rotationDeg already carries the landscape base 90° plus the user's tilt, so
  // body, buttons, screen and cutout all turn together — a real phone on its
  // side, island and buttons landing on the correct edges.
  ctx.rotate((geo.rotationDeg * Math.PI) / 180);

  const outerRadius = spec.outerRadiusPct * outerW;

  // Coloured glow: a blurred, zero-offset shadow of the device silhouette,
  // drawn first so the body (or the screenshot, when frameless) covers the
  // solid fill and only the halo shows. Two passes so it reads at strength.
  const glow = layout.glowStrength ?? 0;
  if (glow > 0) {
    const glowW = spec.id === 'none' ? screenW : outerW;
    const glowH = spec.id === 'none' ? screenH : outerH;
    const glowR = spec.id === 'none' ? spec.screenRadiusPct * screenW : outerRadius;
    const colour = layout.glowColour ?? '#7c3aed';
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-glowW / 2, -glowH / 2, glowW, glowH, glowR);
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = glowW * 0.3 * glow * scale; // device-px, scale by hand like the shadow
    ctx.fill();
    ctx.fill();
    ctx.restore();
  }

  if (spec.id !== 'none') {
    drawButtons(ctx, spec, outerW, outerH);
    ctx.beginPath();
    ctx.roundRect(-outerW / 2, -outerH / 2, outerW, outerH, outerRadius);
    ctx.fillStyle = theme.frameColour ?? spec.body.fill;
    if (layout.deviceShadow) {
      ctx.save();
      ctx.shadowColor = DEVICE_SHADOW_COLOUR;
      // Canvas shadow blur/offset are in device space, NOT transformed by the
      // CTM — the one platform quirk where `scale` must be applied by hand,
      // or preview and export would diverge.
      ctx.shadowBlur = outerW * DEVICE_SHADOW_BLUR_PCT * scale;
      ctx.shadowOffsetY = outerH * DEVICE_SHADOW_OFFSET_PCT * scale;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fill();
    }
  }

  // Screen: clip, fit the screenshot, cover centre-crops the overflow.
  const screenRadius = spec.screenRadiusPct * screenW;
  if (spec.id === 'none' && layout.deviceShadow) {
    // Frameless: the screenshot rect itself carries the shadow.
    ctx.save();
    ctx.shadowColor = DEVICE_SHADOW_COLOUR;
    ctx.shadowBlur = screenW * DEVICE_SHADOW_BLUR_PCT * scale;
    ctx.shadowOffsetY = screenH * DEVICE_SHADOW_OFFSET_PCT * scale;
    ctx.beginPath();
    ctx.roundRect(-screenW / 2, -screenH / 2, screenW, screenH, screenRadius);
    ctx.fillStyle = SCREEN_PLACEHOLDER_FILL;
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-screenW / 2, -screenH / 2, screenW, screenH, screenRadius);
  ctx.clip();
  ctx.fillStyle = SCREEN_PLACEHOLDER_FILL;
  ctx.fillRect(-screenW / 2, -screenH / 2, screenW, screenH);
  // Landscape: counter-rotate the capture by -90° (undoing the frame's turn)
  // so app UI reads upright. In that rotated frame the screen rect's fill
  // extents swap — the wide capture then covers the wide-on-canvas screen
  // with matched aspect. Portrait (imageCounterDeg 0) is unchanged. The status
  // bar shares this frame: it belongs to the capture, not to the silhouette,
  // so it must read upright alongside it.
  const { rw, rh, portrait } = chromeRect(geo);
  let fit: ScreenFit | null = null;
  if (bmp) {
    const s =
      layout.imageFit === 'contain'
        ? Math.min(rw / bmp.width, rh / bmp.height)
        : Math.max(rw / bmp.width, rh / bmp.height);
    fit = { dw: bmp.width * s, dh: bmp.height * s, scale: s };
    ctx.save();
    if (geo.imageCounterDeg) ctx.rotate((geo.imageCounterDeg * Math.PI) / 180);
    ctx.drawImage(bmp, -fit.dw / 2, -fit.dh / 2, fit.dw, fit.dh);
    ctx.restore();
  }
  // Over the capture, still inside the screen clip, so it can never spill onto
  // the bezel and the corner radius crops it like real screen content.
  ctx.save();
  if (geo.imageCounterDeg) ctx.rotate((geo.imageCounterDeg * Math.PI) / 180);
  drawScreenChrome(ctx, {
    rw,
    rh,
    bmp,
    fit,
    spec,
    theme,
    portrait,
  });
  ctx.restore();
  ctx.restore();

  drawCutout(ctx, spec, screenW, screenH);

  if (spec.id !== 'none' && outerW > spec.body.edgeWidth && outerH > spec.body.edgeWidth) {
    // Inner stroke: inset by half the line width so the edge hugs the body.
    // The bleed clamp can shrink a device toward nothing (a long headline on a
    // short landscape canvas), and once the body is thinner than the stroke
    // both the inset rect and `outerRadius - inset` go negative — roundRect
    // throws on a negative radius, killing the whole export. Below that size
    // the stroke is sub-pixel anyway, so skip it and floor the radius at 0.
    const inset = spec.body.edgeWidth / 2;
    ctx.beginPath();
    ctx.roundRect(
      -outerW / 2 + inset,
      -outerH / 2 + inset,
      outerW - 2 * inset,
      outerH - 2 * inset,
      Math.max(0, outerRadius - inset),
    );
    ctx.strokeStyle = spec.body.edge;
    ctx.lineWidth = spec.body.edgeWidth;
    ctx.stroke();
  }

  ctx.restore();
}

// Side buttons run vertically down the left/right edges; top/bottom buttons
// run horizontally along those edges (a tablet's power and volume sit on the
// short edge, which no phone spec needed). `topPct`/`lenPct` are fractions of
// whichever edge the button is on.
function drawButtons(ctx: Ctx2D, spec: DeviceSpec, outerW: number, outerH: number): void {
  const thickness = outerW * BUTTON_THICKNESS_PCT;
  ctx.fillStyle = spec.body.edge;
  for (const b of spec.buttons) {
    ctx.beginPath();
    if (b.side === 'left' || b.side === 'right') {
      const x = b.side === 'left' ? -outerW / 2 - thickness / 2 : outerW / 2 - thickness / 2;
      const y = -outerH / 2 + b.topPct * outerH;
      ctx.roundRect(x, y, thickness, b.lenPct * outerH, thickness / 2);
    } else {
      const y = b.side === 'top' ? -outerH / 2 - thickness / 2 : outerH / 2 - thickness / 2;
      const x = -outerW / 2 + b.topPct * outerW;
      ctx.roundRect(x, y, b.lenPct * outerW, thickness, thickness / 2);
    }
    ctx.fill();
  }
}

function drawCutout(ctx: Ctx2D, spec: DeviceSpec, screenW: number, screenH: number): void {
  const c = spec.cutout;
  if (c.kind === 'none') return;
  ctx.fillStyle = '#000000';
  if (c.kind === 'dynamic-island') {
    const cw = c.wPct * screenW;
    const ch = c.hPct * screenH;
    const top = -screenH / 2 + c.topPct * screenH;
    ctx.beginPath();
    ctx.roundRect(-cw / 2, top, cw, ch, ch / 2);
    ctx.fill();
  } else if (c.kind === 'edge-camera') {
    // Centred along a long (portrait: vertical) edge, so the landscape base
    // turn lands it on the top edge. Diameter and inset are fractions of the
    // screen's SHORT side, which is screenW in portrait — using the long side
    // would make it grow with the panel's height instead of staying a dot.
    const d = c.dPct * screenW;
    const x = c.edge === 'left' ? -screenW / 2 + c.insetPct * screenW + d / 2 : screenW / 2 - c.insetPct * screenW - d / 2;
    ctx.beginPath();
    ctx.arc(x, 0, d / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const d = c.dPct * screenW;
    const cx = -screenW / 2 + c.xPct * screenW;
    const cy = -screenH / 2 + c.topPct * screenH + d / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Preview-only dashed overlay showing the text safe area. Never called from
// the export path.
export function drawSafeAreaOverlay(ctx: Ctx2D, size: StoreSize, scale: number): void {
  const w = size.width;
  const h = size.height;
  const inset = Math.min(w, h) * SAFE_AREA_PCT;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 16]);
  ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
  ctx.restore();
}

export type AlignGuide = { axis: 'v' | 'h'; pos: number };

// Preview-only smart guides shown while dragging: a full-length line at each
// coordinate the dragged object has snapped to (canvas centre or the other
// object's centre). Never part of the export.
export function drawAlignmentGuides(
  ctx: Ctx2D,
  size: StoreSize,
  scale: number,
  guides: AlignGuide[],
): void {
  if (guides.length === 0) return;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.95)'; // pink, like PowerPoint's guides
  ctx.lineWidth = Math.max(1, size.width * 0.0025);
  ctx.beginPath();
  for (const g of guides) {
    if (g.axis === 'v') {
      ctx.moveTo(g.pos, 0);
      ctx.lineTo(g.pos, size.height);
    } else {
      ctx.moveTo(0, g.pos);
      ctx.lineTo(size.width, g.pos);
    }
  }
  ctx.stroke();
  ctx.restore();
}
