import type { Ctx2D, DeviceSpec, Theme } from './types';
import { interFontFamily } from './fonts';

// The OS chrome drawn ON TOP of the dropped screenshot, inside the screen clip:
// the status bar at the top and the home indicator at the bottom. Both are
// screen furniture, not frame geometry — they belong to the operating system,
// not the silhouette — which is why the numbers live here and not in
// deviceSpecs.ts. render.ts still hard-codes nothing.
//
// They live in one module because they are one mechanism seen twice: cover
// whatever the capture's own OS drew there, then draw the target platform's
// version. The plate does the covering at both ends.

export type StatusBarPlatform = 'ios' | 'android';

export type StatusBarConfig = {
  show: boolean;
  // Undefined = the platform's standard marketing time (see STANDARD_TIME).
  // Set-wide, like every other Theme field: a set with a different clock on
  // each screen reads as a bug, not as variety.
  time?: string;
  // Glyph colour. 'auto' samples the capture behind the bar and picks the
  // readable one, which is right far more often than either fixed choice.
  style: 'auto' | 'light' | 'dark';
  // Cover the capture's OWN status bar first. A native capture always carries
  // one — 7:23, 61% battery — and without this the two overlap into mush. The
  // plate is the row of pixels immediately BELOW the bar stretched over it, so
  // it matches whatever the app paints up there (flat colour, gradient, or a
  // photo's blur) instead of guessing a fill. Applies at both ends.
  plate: boolean;
  // The home indicator at the bottom — iOS's is wider and closer to the edge
  // than Android's gesture pill (0.32 vs 0.26 of screen width). After the
  // clock it is the loudest platform tell a capture carries, and the only
  // other one that is OS chrome rather than the app's own design.
  homeIndicator: boolean;
};

// Undefined theme.statusBar (every project saved before this existed) reads as
// this — which is what retro-fits the bar onto existing work. No migration
// step, no version bump: the default IS the migration.
export const DEFAULT_STATUS_BAR: StatusBarConfig = {
  show: true,
  style: 'auto',
  plate: true,
  homeIndicator: true,
};

// Merged, not returned raw: a theme saved before a field existed carries the
// older shape, and `undefined` on a boolean would read as off. Spreading the
// defaults under it is what makes each new piece of chrome retrofit the same
// way the bar itself did.
export function statusBarOf(theme: Theme): StatusBarConfig {
  return theme.statusBar ? { ...DEFAULT_STATUS_BAR, ...theme.statusBar } : DEFAULT_STATUS_BAR;
}

// 9:41 is Apple's, used on every iPhone/iPad in every keynote and every App
// Store shot since 2007 (the original announcement time). 12:30 is the time
// Google's Material status-bar templates ship with and what Pixel marketing
// shots overwhelmingly carry. Neither store REQUIRES a particular time; these
// are the conventions a reviewer's eye is trained on, so anything else reads
// as a real capture that nobody tidied up.
export const STANDARD_TIME: Record<StatusBarPlatform, string> = {
  ios: '9:41',
  android: '12:30',
};

// Every metric is a fraction of the screen's SHORT side, never of its height.
// A landscape slide swaps which axis is which, and a bar sized off the height
// would double in one orientation and halve in the other; the short side is
// stable across the turn, so one set of numbers serves both.
type StatusMetrics = {
  platform: StatusBarPlatform;
  // How deep the GLYPHS run in a native capture off this platform — the clock
  // and battery, not the bar's full height. Deliberately the ink and not the
  // bar: the empty rows below a capture's glyphs are just app background, so
  // plating them buys nothing and costs real content. Measured on the Ludwig
  // captures, an iOS-depth band (the full 0.125 bar) reached 135 source px into
  // a 1080-wide Android capture whose first label starts at 114, and sliced it
  // in half. This is also where the plate samples its colour from.
  captureGlyphPct: number;
  centrePct: number; // vertical centre of the glyph row
  fontPct: number;
  weight: number;
  sideInsetPct: number; // left/right margin
  gapPct: number; // between the right-hand icons
  // Home indicator, all measured from the BOTTOM edge. `captureChromePct` is
  // the mirror of captureGlyphPct: how far up a native capture off this
  // platform its own indicator reaches, and so the floor on what the bottom
  // plate must hide.
  captureChromePct: number;
  indicatorWidthPct: number;
  indicatorHeightPct: number;
  indicatorGapPct: number; // bottom edge of the pill to the screen edge
};

// Plate depth: enough to hide the capture's own bar AND to seat our glyphs,
// and not one pixel more — every extra pixel is app content flattened to a
// single colour.
function bandDepth(m: StatusMetrics): number {
  return Math.max(m.captureGlyphPct, m.centrePct + m.fontPct * 0.5);
}

// Phones sit their bar in line with the cutout (island centre / punch-hole
// centre) because that is where the OS puts it. Tablets have no cutout in the
// bar and a far wider screen, so their glyphs are proportionally much smaller
// — an iPad's 24pt bar on a 1024pt-wide screen really is that slight.
const STATUS_METRICS: Record<string, StatusMetrics> = {
  'iphone-17-pro': {
    platform: 'ios',
    captureGlyphPct: 0.09, // glyph ink of a 54pt bar on a 440pt-wide screen
    centrePct: 0.073, // the Dynamic Island's own vertical centre
    fontPct: 0.042,
    weight: 600,
    sideInsetPct: 0.048,
    gapPct: 0.017,
    // 139pt wide, 5pt tall, ~8pt up, on a 440pt screen. Wider and tighter to
    // the edge than Android's — the two are not interchangeable.
    captureChromePct: 0.032,
    indicatorWidthPct: 0.32,
    indicatorHeightPct: 0.0114,
    indicatorGapPct: 0.018,
  },
  'pixel-10-pro': {
    platform: 'android',
    captureGlyphPct: 0.06, // glyph ink of a ~28dp bar on a ~366dp-wide screen
    centrePct: 0.092, // the punch-hole's vertical centre
    fontPct: 0.038,
    weight: 600,
    sideInsetPct: 0.045,
    gapPct: 0.016,
    // Measured off the Ludwig captures: 283px wide, 10px tall, 27px up on a
    // 1080-wide panel. Matches Android's 108dp handle to within a percent.
    captureChromePct: 0.036,
    indicatorWidthPct: 0.262,
    indicatorHeightPct: 0.0095,
    indicatorGapPct: 0.025,
  },
  'ipad-pro-13': {
    platform: 'ios',
    captureGlyphPct: 0.02, // glyph ink of a 24pt bar on a 1024pt-wide screen
    centrePct: 0.018,
    fontPct: 0.016,
    weight: 600,
    sideInsetPct: 0.03,
    gapPct: 0.008,
    captureChromePct: 0.016,
    indicatorWidthPct: 0.30,
    indicatorHeightPct: 0.0055,
    indicatorGapPct: 0.009,
  },
  'android-tablet-11': {
    platform: 'android',
    captureGlyphPct: 0.024,
    centrePct: 0.019,
    fontPct: 0.016,
    weight: 600,
    sideInsetPct: 0.03,
    gapPct: 0.008,
    captureChromePct: 0.018,
    indicatorWidthPct: 0.25,
    indicatorHeightPct: 0.005,
    indicatorGapPct: 0.012,
  },
};

// 'none' has no OS of its own. Borrow the last real frame's, the same way it
// borrows that frame's screen aspect (noneFallbackAspect in render.ts).
export function statusMetricsFor(spec: DeviceSpec, theme: Theme): StatusMetrics {
  if (spec.id !== 'none') return STATUS_METRICS[spec.id] ?? STATUS_METRICS['iphone-17-pro'];
  const borrowed = theme.lastFrameId && theme.lastFrameId !== 'none' ? theme.lastFrameId : null;
  return (borrowed ? STATUS_METRICS[borrowed] : null) ?? STATUS_METRICS['iphone-17-pro'];
}

export function platformFor(spec: DeviceSpec, theme: Theme): StatusBarPlatform {
  return statusMetricsFor(spec, theme).platform;
}

// Mean luma of the capture's top or bottom strip, cached per bitmap. Drawing
// an 8x2 thumbnail of just that strip is enough to choose a glyph colour, and
// doing it once per ImageBitmap keeps 'auto' off the per-frame path entirely —
// the sliders stay live at 60fps.
const lumaCache = new WeakMap<ImageBitmap, { top?: number; bottom?: number }>();
let lumaCtx: Ctx2D | null = null;

function stripLuma(bmp: ImageBitmap, edge: 'top' | 'bottom', stripFrac: number): number {
  let entry = lumaCache.get(bmp);
  if (!entry) lumaCache.set(bmp, (entry = {}));
  const hit = entry[edge];
  if (hit !== undefined) return hit;
  if (!lumaCtx) {
    const c = new OffscreenCanvas(8, 2).getContext('2d', { willReadFrequently: true });
    if (!c) return 0;
    lumaCtx = c;
  }
  const srcH = Math.max(1, Math.round(bmp.height * stripFrac));
  const srcY = edge === 'top' ? 0 : bmp.height - srcH;
  lumaCtx.clearRect(0, 0, 8, 2);
  lumaCtx.drawImage(bmp, 0, srcY, bmp.width, srcH, 0, 0, 8, 2);
  const { data } = lumaCtx.getImageData(0, 0, 8, 2);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const luma = sum / (data.length / 4) / 255;
  entry[edge] = luma;
  return luma;
}

// The screenshot's placement inside the screen rect, as render.ts computed it.
// Needed to map the destination band back to source pixels for the plate.
export type ScreenFit = { dw: number; dh: number; scale: number };

export type StatusBarDraw = {
  // Screen rect in the space the bar is drawn in — already counter-rotated for
  // landscape, so `rw` is always the on-screen width of the upright capture.
  rw: number;
  rh: number;
  bmp: ImageBitmap | null;
  fit: ScreenFit | null;
  spec: DeviceSpec;
  theme: Theme;
  // Portrait phones split the bar around the cutout; a turned phone puts the
  // cutout on a side edge, well clear of the bar, so it lays out plainly.
  portrait: boolean;
};

// Both ends, in one call. The bar and the indicator are independently
// switchable but share the plate, the colour decision and the metrics table.
export function drawScreenChrome(ctx: Ctx2D, d: StatusBarDraw): void {
  drawStatusBar(ctx, d);
  drawHomeIndicator(ctx, d);
}

// Light or dark glyphs for one end of the screen. Sampled per end: an app with
// a dark header and a light content area needs opposite answers top and bottom.
function chromeIsLight(cfg: StatusBarConfig, bmp: ImageBitmap | null, edge: 'top' | 'bottom'): boolean {
  if (cfg.style !== 'auto') return cfg.style === 'light';
  return !bmp || stripLuma(bmp, edge, 0.12) < 0.55;
}

function drawStatusBar(ctx: Ctx2D, d: StatusBarDraw): void {
  const cfg = statusBarOf(d.theme);
  if (!cfg.show) return;

  const m = statusMetricsFor(d.spec, d.theme);
  const unit = Math.min(d.rw, d.rh);
  const top = -d.rh / 2;
  const cy = top + m.centrePct * unit;
  const font = m.fontPct * unit;
  const inset = m.sideInsetPct * unit;

  if (cfg.plate && d.bmp && d.fit) {
    drawPlate(ctx, d, bandDepth(m) * unit, m.captureGlyphPct * unit);
  }

  const colour = chromeIsLight(cfg, d.bmp, 'top') ? '#ffffff' : '#000000';

  const time = (cfg.time ?? STANDARD_TIME[m.platform]).trim();

  ctx.save();
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.font = `${m.weight} ${font}px ${interFontFamily()}`;

  // iOS centres the clock in the gap left of the Dynamic Island; Android (and
  // every tablet) left-aligns it at the margin.
  const island = d.spec.cutout;
  if (m.platform === 'ios' && d.portrait && island.kind === 'dynamic-island') {
    ctx.textAlign = 'center';
    const islandLeft = -(island.wPct * d.rw) / 2;
    ctx.fillText(time, (-d.rw / 2 + inset + islandLeft) / 2, cy);
  } else {
    ctx.textAlign = 'left';
    ctx.fillText(time, -d.rw / 2 + inset, cy);
  }

  drawIcons(ctx, m.platform, d.rw / 2 - inset, cy, font, m.gapPct * unit, colour);
  ctx.restore();
}

// The status bar's opposite number. Same two steps — plate over whatever the
// capture's own OS drew, then draw this platform's — but the pill's dimensions
// are the entire point: iOS's is 0.32 of screen width sitting 0.018 up,
// Android's 0.26 sitting 0.025 up. Swapping one for the other is most of what
// makes an Android capture stop reading as one.
function drawHomeIndicator(ctx: Ctx2D, d: StatusBarDraw): void {
  const cfg = statusBarOf(d.theme);
  if (!cfg.homeIndicator) return;

  const m = statusMetricsFor(d.spec, d.theme);
  const unit = Math.min(d.rw, d.rh);
  const h = m.indicatorHeightPct * unit;
  const gap = m.indicatorGapPct * unit;
  // Cover the capture's own indicator, and seat ours. Shallow by design: the
  // bottom of an app screen is usually its tab bar, and every plated pixel
  // above the pill is a tab label flattened away.
  const band = Math.max(m.captureChromePct, m.indicatorGapPct + m.indicatorHeightPct) * unit;

  if (cfg.plate && d.bmp && d.fit) {
    drawPlate(ctx, d, band, m.captureChromePct * unit, 'bottom');
  }

  const w = m.indicatorWidthPct * d.rw;
  ctx.save();
  ctx.fillStyle = chromeIsLight(cfg, d.bmp, 'bottom') ? '#ffffff' : '#000000';
  ctx.beginPath();
  ctx.roundRect(-w / 2, d.rh / 2 - gap - h, w, h, h / 2);
  ctx.fill();
  ctx.restore();
}

// Stretch one source row across the band. Which row is the whole problem: the
// obvious choice — the bottom of the band — lands inside the app's first
// header as often as not, and a stretched row turns every icon it crosses into
// a full-height stripe. So search a window of rows starting just below the
// CAPTURE's own bar and take the flattest one. A flat row stretches invisibly
// whether the app's top is a solid fill or a gradient; picking by flatness is
// what makes the plate safe on captures nobody vetted.
// `edge` is which end of the screen the band hugs. The bottom is the same
// problem mirrored: search AWAY from the edge, since the capture's own chrome
// is between the sample point and the edge.
function drawPlate(
  ctx: Ctx2D,
  d: StatusBarDraw,
  band: number,
  sampleDepth: number,
  edge: 'top' | 'bottom' = 'top',
): void {
  const { bmp, fit, rw, rh } = d;
  if (!bmp || !fit) return;
  const { dw, dh, scale } = fit;
  if (scale <= 0) return;
  const dir = edge === 'top' ? 1 : -1;

  // Destination -> source. The image is drawn centred on the screen rect.
  const destSample = edge === 'top' ? -rh / 2 + sampleDepth : rh / 2 - sampleDepth;
  const destBandTop = edge === 'top' ? -rh / 2 : rh / 2 - band;
  const srcY = (destSample + dh / 2) / scale;
  const srcX = (-rw / 2 + dw / 2) / scale;
  const srcW = rw / scale;
  // 'contain' letterboxes: the band can fall outside the image entirely, and
  // there is nothing there to plate with.
  if (srcY < 0 || srcY >= bmp.height) return;

  const x0 = Math.max(0, Math.min(bmp.width - 1, srcX));
  const w0 = Math.max(1, Math.min(bmp.width - x0, srcW));
  // Overdraw past the screen edge. The screen clip crops the excess, and
  // without it a sub-pixel row of the capture survives at the boundary — which
  // on these captures was a 243px-wide sliver of the Android pill, sitting
  // right on the screen's bottom edge where the eye goes.
  const bleed = Math.max(1, rh * 0.002);
  const plate = quietRow(bmp, x0, w0, srcY, dir);
  const bandY = edge === 'top' ? destBandTop - bleed : destBandTop;
  const bandH = band + bleed;
  if (plate.flat) {
    ctx.drawImage(bmp, x0, plate.y, w0, 1, -rw / 2, bandY, rw, bandH);
  } else {
    // No quiet row anywhere in the window — a portrait capture blown up inside
    // a landscape frame will have body text running through every candidate.
    // Stretching any of them draws stripes, so fall back to the flattest row's
    // mean colour. Loses a gradient, never draws an artefact.
    ctx.fillStyle = plate.colour;
    ctx.fillRect(-rw / 2, bandY, rw, bandH);
  }
}

const ROW_SAMPLES = 12;
// Wide enough that a glyph stroke still moves a column. At 16 columns a line
// of body text averaged out to look as flat as an empty row, and the stripes
// it drew were the thing this search exists to prevent.
const ROW_COLS = 128;
// Rows are searched from `from` down to from * (1 + ROW_SEARCH_SPAN). Deeper
// than that and a quiet row is quiet because it is somewhere else entirely.
const ROW_SEARCH_SPAN = 1.2;
// Cost of the deepest candidate, in roughness units. Half the flat threshold:
// between two quiet rows the shallower wins, but no depth saving is ever worth
// taking a row with text in it.
const ROW_DEPTH_COST = 0.01;

// Roughness — mean absolute luma step between adjacent columns — above which
// the flat fallback takes over. Roughness rather than plain variance, because
// a row crossing a horizontal GRADIENT has high variance and stretches
// perfectly, while a row crossing TEXT has the same variance and stretches
// into stripes. Only the second one steps hard between neighbours.
const ROW_FLAT_MAX = 0.02;

type Plate = { y: number; flat: boolean; colour: string };

const rowCache = new WeakMap<ImageBitmap, Map<number, Plate>>();
let rowCtx: Ctx2D | null = null;

function quietRow(
  bmp: ImageBitmap,
  x0: number,
  w0: number,
  from: number,
  dir: number,
): Plate {
  const key = Math.round(from) * 2 + (dir > 0 ? 0 : 1);
  let perBitmap = rowCache.get(bmp);
  if (!perBitmap) rowCache.set(bmp, (perBitmap = new Map()));
  const hit = perBitmap.get(key);
  if (hit) return hit;

  const found = searchQuietRow(bmp, x0, w0, from, dir);
  perBitmap.set(key, found);
  return found;
}

// `dir` is +1 to search down from `from` (top band) and -1 to search up
// (bottom band). Either way it walks INTO the app's content and away from the
// capture's own chrome, which is the only direction where a usable row lives.
function searchQuietRow(
  bmp: ImageBitmap,
  x0: number,
  w0: number,
  from: number,
  dir: number,
): Plate {
  const fallback: Plate = { y: Math.floor(from), flat: true, colour: '#000000' };
  // How far the sample point sits from ITS edge, and how much image lies the
  // other way. The window scales with the first and is capped by the second.
  const depth = dir > 0 ? from : bmp.height - 1 - from;
  const room = dir > 0 ? bmp.height - 1 - from : from;
  const span = Math.min(depth * ROW_SEARCH_SPAN, room);
  if (span <= 1) return fallback;
  if (!rowCtx) {
    const c = new OffscreenCanvas(ROW_COLS, ROW_SAMPLES).getContext('2d', {
      willReadFrequently: true,
    });
    if (!c) return fallback;
    rowCtx = c;
  }
  // One SOURCE row per sample, not a vertical average: averaging rows together
  // is what let a line of text pass as flat. Each candidate is judged as the
  // row that would actually be stretched.
  rowCtx.clearRect(0, 0, ROW_COLS, ROW_SAMPLES);
  const rowY: number[] = [];
  for (let r = 0; r < ROW_SAMPLES; r++) {
    const y = Math.floor(from + (dir * (r + 0.5) * span) / ROW_SAMPLES);
    rowY.push(y);
    rowCtx.drawImage(bmp, x0, y, w0, 1, 0, r, ROW_COLS, 1);
  }
  const { data } = rowCtx.getImageData(0, 0, ROW_COLS, ROW_SAMPLES);

  let best = 0;
  let bestScore = Infinity;
  let bestRough = 1;
  const rgb = [0, 0, 0];
  for (let r = 0; r < ROW_SAMPLES; r++) {
    const mean = [0, 0, 0];
    let rough = 0;
    let prev = 0;
    for (let c = 0; c < ROW_COLS; c++) {
      const i = (r * ROW_COLS + c) * 4;
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      if (c > 0) rough += Math.abs(l - prev);
      prev = l;
      mean[0] += data[i];
      mean[1] += data[i + 1];
      mean[2] += data[i + 2];
    }
    rough /= ROW_COLS - 1;
    const score = rough + (r / ROW_SAMPLES) * ROW_DEPTH_COST;
    if (score < bestScore) {
      bestScore = score;
      bestRough = rough;
      best = r;
      for (let k = 0; k < 3; k++) rgb[k] = Math.round(mean[k] / ROW_COLS);
    }
  }
  return {
    y: rowY[best],
    flat: bestRough <= ROW_FLAT_MAX,
    colour: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
  };
}

// Right-aligned run: signal, wifi, battery — the order both platforms use.
function drawIcons(
  ctx: Ctx2D,
  platform: StatusBarPlatform,
  right: number,
  cy: number,
  font: number,
  gap: number,
  colour: string,
): void {
  const h = font * 0.66;
  const battW = h * 1.95;
  // Derived from the arc, not chosen: the wifi glyph is as tall as its
  // neighbours and only as wide as that height makes it.
  const wifiW = h * WIFI_ASPECT;
  const sigW = platform === 'ios' ? h * 1.45 : h * 1.15;

  let x = right - battW;
  drawBattery(ctx, x, cy - h / 2, battW, h, platform, colour);
  x -= gap + wifiW;
  drawWifi(ctx, x + wifiW / 2, cy + h / 2, h, colour);
  x -= gap + sigW;
  if (platform === 'ios') drawSignalBars(ctx, x, cy - h / 2, sigW, h);
  else drawSignalWedge(ctx, x, cy - h / 2, sigW, h);
}

function drawSignalBars(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  const barW = w * 0.19;
  const gap = w * 0.08;
  const heights = [0.42, 0.61, 0.8, 1];
  for (let i = 0; i < 4; i++) {
    const bh = h * heights[i];
    ctx.beginPath();
    ctx.roundRect(x + i * (barW + gap), y + h - bh, barW, bh, barW * 0.32);
    ctx.fill();
  }
}

// Android's cellular glyph is a filled wedge, not a bar stack — the cheapest
// single tell that this is not an iPhone.
function drawSignalWedge(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  const r = h * 0.14;
  ctx.beginPath();
  ctx.moveTo(x, y + h - r);
  ctx.quadraticCurveTo(x, y + h, x + r, y + h);
  ctx.lineTo(x + w - r, y + h);
  ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  ctx.lineTo(x + w, y + r);
  ctx.quadraticCurveTo(x + w, y, x + w - r * 1.6, y + r * 1.1);
  ctx.closePath();
  ctx.fill();
}

// Sized by the glyph HEIGHT, with the outer arc's apex at the top of the glyph
// box and the dot on its baseline. Sizing it by a width instead left the apex
// at about three-quarters of the box while the bars and battery filled all of
// it, and the whole icon read as sitting low next to them.
const WIFI_ARC = Math.PI * 0.3; // half-span of each arc, from straight up
export const WIFI_ASPECT = 2 * Math.sin(WIFI_ARC); // width per unit of height

function drawWifi(ctx: Ctx2D, cx: number, baseY: number, h: number, colour: string): void {
  const lw = h * 0.19;
  const outer = h - lw / 2; // apex on the glyph's top edge
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (const r of [outer, outer * 0.6]) {
    ctx.beginPath();
    ctx.arc(cx, baseY, r, Math.PI * 1.5 - WIFI_ARC, Math.PI * 1.5 + WIFI_ARC);
    ctx.stroke();
  }
  // Tangent to the baseline, not centred on it: the dot is the glyph's lowest
  // point and has to share a floor with the signal bars beside it.
  const dot = lw * 0.62;
  ctx.beginPath();
  ctx.arc(cx, baseY - dot, dot, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

// Always full. A marketing shot with a half-empty battery is the same class of
// mistake as a real clock time, and both stores' own examples show it full.
function drawBattery(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  platform: StatusBarPlatform,
  colour: string,
): void {
  const nubW = h * 0.13;
  const bodyW = w - nubW - h * 0.04;
  const lw = h * 0.09;
  const radius = platform === 'ios' ? h * 0.32 : h * 0.28;

  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = lw;

  ctx.globalAlpha = 0.38;
  ctx.beginPath();
  ctx.roundRect(x + lw / 2, y + lw / 2, bodyW - lw, h - lw, radius);
  ctx.stroke();
  // Terminal nub on the right, same on both platforms.
  ctx.beginPath();
  ctx.roundRect(x + w - nubW, y + h * 0.32, nubW, h * 0.36, nubW * 0.5);
  ctx.fill();

  ctx.globalAlpha = 1;
  const pad = lw * 1.7;
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, bodyW - pad * 2, h - pad * 2, Math.max(0, radius - pad * 0.8));
  ctx.fill();
  ctx.restore();
}
