import type {
  BackgroundPattern,
  Ctx2D,
  DeviceSpec,
  Slide,
  SlideBackground,
  SlideLayout,
  StoreSize,
  Theme,
} from './types';
import { getSpec } from './deviceSpecs';
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
import {
  ASCENT_EM,
  BUTTON_THICKNESS_PCT,
  DEVICE_MAX_WIDTH_PCT,
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
};

let scratch: Ctx2D | null = null;
function scratchCtx(): Ctx2D {
  if (!scratch) {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) throw new Error('Could not get scratch 2d context');
    scratch = ctx;
  }
  return scratch;
}

// Max text block height across the whole set, computed per output size (type
// is a fraction of canvas width, so the max differs per canvas). renderSlide
// takes the result instead of measuring the slide in front of it, so every
// slide in a set uses one text zone and devices land identically regardless
// of individual headline length. Fonts must be loaded before calling.
export function measureSetTextZone(slides: Slide[], theme: Theme, size: StoreSize): number {
  const ctx = scratchCtx();
  let max = 0;
  for (const s of slides) {
    max = Math.max(max, layoutText(ctx, s, theme, size.width).blockH);
  }
  return max;
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
  const text = layoutText(ctx, slide, theme, w);
  const insetY = h * (layout.textInsetPct / 100);
  const gap = h * TEXT_DEVICE_GAP_PCT;
  const zoneH = insetY + (setBlockH ?? text.blockH) + gap;
  const slotTop = layout.textPosition === 'top' ? zoneH : 0;
  const slotBottom = layout.textPosition === 'top' ? h : h - zoneH;
  const blockTopBase = layout.textPosition === 'top' ? insetY : h - insetY - text.blockH;
  const blockTop = blockTopBase + (layout.textOffsetY ?? 0);
  const bmp = slide.imageKey ? getBitmap(slide.imageKey) : null;
  const geo = deviceGeometry(theme, layout, size, slotTop, slotBottom, bmp ? bmp.width / bmp.height : null);
  const overlap = layout.overlapNext ?? 0;
  if (overlap > 0) {
    // Right edge lands at w + overlap*bboxW, so that fraction hangs into the
    // next frame; the next frame draws the same device at cx - w.
    geo.cx = w + overlap * geo.bboxW - geo.bboxW / 2;
  }
  // Free-drag horizontal nudge, on top of the centred (or overlap) position.
  geo.cx += layout.deviceOffsetX ?? 0;
  return { layout, text, blockTop, geo, bmp };
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

  drawTextBlock(ctx, cur.text, effTheme, w, cur.blockTop, cur.layout.textOffsetX ?? 0, scale);
  drawDevice(ctx, cur.bmp, theme, cur.layout, cur.geo, scale);
  drawGrain(ctx, w, h, theme.grain);

  ctx.restore();
}

export type HitRegions = {
  device: { cx: number; cy: number; w: number; h: number };
  text: { x: number; y: number; w: number; h: number };
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
  const { text, blockTop, geo } = computeSlideGeom(ctx, slide, theme, size, opts.setBlockH);
  const theta = (Math.abs(slide.layout.deviceRotation) * Math.PI) / 180;
  const bboxH = geo.outerW * Math.sin(theta) + geo.outerH * Math.cos(theta);
  return {
    device: { cx: geo.cx, cy: geo.cy, w: geo.bboxW, h: bboxH },
    text: {
      x: (size.width - text.maxW) / 2 + (slide.layout.textOffsetX ?? 0),
      y: blockTop,
      w: text.maxW,
      h: text.blockH,
    },
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

function layoutText(ctx: Ctx2D, slide: Slide, theme: Theme, w: number): TextLayout {
  const t = theme.text;
  const family = resolveFontFamily(t.family);
  const headSize = w * (t.sizePct / 100);
  const maxW = Math.min(w * (t.maxWidthPct / 100), w * (1 - 2 * SAFE_AREA_PCT));

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
  sourceAspect: number | null,
): DeviceGeometry {
  const spec = getSpec(theme.frameId);
  const w = size.width;
  const h = size.height;
  // 'none' means no bezel, not no device: the rect takes the SOURCE image's
  // own aspect so the only crop is the layout's bleed — never the canvas
  // aspect, which would stack a second cover-fit crop on top. With no image
  // loaded it borrows the last-selected device's screen aspect.
  const screenAspect =
    spec.id === 'none' ? (sourceAspect ?? noneFallbackAspect(theme)) : spec.screenAspect;
  const b = spec.bezelPct; // fraction of screen width
  const kH = 1 / screenAspect + 2 * b; // outerH = screenW * kH
  const kW = 1 + 2 * b; // outerW = screenW * kW
  const bodyAspect = kW / kH; // outerW = outerH * bodyAspect

  const theta = (Math.abs(layout.deviceRotation) * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // Rotated bounding box of the body, per unit of outerH.
  const bboxHFactor = bodyAspect * sin + cos;
  const bboxWFactor = bodyAspect * cos + sin;
  const maxW = w * DEVICE_MAX_WIDTH_PCT;

  let outerH: number;
  let cy: number;

  if (layout.deviceSizing === 'bleed') {
    const reqW = Math.min(layout.deviceWidthPct * layout.deviceScale, DEVICE_MAX_WIDTH_PCT) * w;
    outerH = reqW / bboxWFactor;
    const bleed = layout.deviceBleed;
    // Visible height above (below) the bled edge must clear the text zone.
    const available = layout.textPosition === 'top' ? h - slotTop : slotBottom;
    if ((1 - bleed) * outerH * bboxHFactor > available) {
      outerH = available / (1 - bleed) / bboxHFactor;
    }
    const bboxH = outerH * bboxHFactor;
    cy =
      layout.textPosition === 'top'
        ? h + bleed * bboxH - bboxH / 2
        : -bleed * bboxH + bboxH / 2;
  } else {
    const slotH = slotBottom - slotTop;
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
    cx: w / 2,
    cy: cy + layout.deviceOffsetY,
    outerW: outerH * bodyAspect,
    outerH,
    screenW,
    screenH: screenW / screenAspect,
    bboxW: outerH * bboxWFactor,
  };
}

function drawTextBlock(
  ctx: Ctx2D,
  text: TextLayout,
  theme: Theme,
  w: number,
  blockTop: number,
  offsetX = 0,
  scale = 1,
): void {
  const t = theme.text;
  // Segments carry their own colour, so each glyph run is placed by hand with
  // textAlign 'left'; alignment is applied per line against the maxW box.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const baseColour = t.colour;
  const accentColour = t.accentColour ?? t.colour;
  const boxLeft = (w - text.maxW) / 2 + offsetX;

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
  ctx.rotate((layout.deviceRotation * Math.PI) / 180);

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
  if (bmp) {
    const s =
      layout.imageFit === 'contain'
        ? Math.min(screenW / bmp.width, screenH / bmp.height)
        : Math.max(screenW / bmp.width, screenH / bmp.height);
    const dw = bmp.width * s;
    const dh = bmp.height * s;
    ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();

  drawCutout(ctx, spec, screenW, screenH);

  if (spec.id !== 'none') {
    // Inner stroke: inset by half the line width so the edge hugs the body.
    const inset = spec.body.edgeWidth / 2;
    ctx.beginPath();
    ctx.roundRect(
      -outerW / 2 + inset,
      -outerH / 2 + inset,
      outerW - 2 * inset,
      outerH - 2 * inset,
      outerRadius - inset,
    );
    ctx.strokeStyle = spec.body.edge;
    ctx.lineWidth = spec.body.edgeWidth;
    ctx.stroke();
  }

  // Neon rim: a bright glowing stroke hugging the outer edge (screen edge when
  // frameless), drawn last so the glow sits on top of the body. Multiple passes
  // build the neon intensity; shadowBlur is device-px, so scale it by hand.
  const rim = layout.rimStrength ?? 0;
  if (rim > 0) {
    const rimW = spec.id === 'none' ? screenW : outerW;
    const rimH = spec.id === 'none' ? screenH : outerH;
    const rimR = spec.id === 'none' ? spec.screenRadiusPct * screenW : outerRadius;
    const colour = layout.rimColour ?? '#22d3ee';
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    ctx.lineWidth = Math.max(2, outerW * 0.006);
    ctx.shadowBlur = outerW * 0.14 * rim * scale;
    ctx.beginPath();
    ctx.roundRect(-rimW / 2, -rimH / 2, rimW, rimH, rimR);
    ctx.stroke();
    ctx.stroke();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawButtons(ctx: Ctx2D, spec: DeviceSpec, outerW: number, outerH: number): void {
  const thickness = outerW * BUTTON_THICKNESS_PCT;
  ctx.fillStyle = spec.body.edge;
  for (const b of spec.buttons) {
    const x = b.side === 'left' ? -outerW / 2 - thickness / 2 : outerW / 2 - thickness / 2;
    const y = -outerH / 2 + b.topPct * outerH;
    ctx.beginPath();
    ctx.roundRect(x, y, thickness, b.lenPct * outerH, thickness / 2);
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
