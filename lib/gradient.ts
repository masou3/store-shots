import { interpolate, formatRgb, converter } from 'culori';
import type { Ctx2D } from './types';

const STOP_COUNT = 64;
const toRgb = converter('rgb');

// A colour string as rgba() with a forced alpha — for fading mesh blobs out.
function withAlpha(colour: string, alpha: number): string {
  const c = toRgb(colour) ?? { mode: 'rgb' as const, r: 0, g: 0, b: 0 };
  return formatRgb({ ...c, alpha });
}

// Real CSS linear-gradient endpoint maths: 0deg points up, clockwise.
// Stops are sampled in Oklab so saturated pairs don't grey out mid-ramp.
//
// sliceIndex/sliceCount implement the continuous-background mode: the
// endpoints are computed for a virtual canvas of width w * sliceCount, then
// shifted into this slide's local coordinates. createLinearGradient accepts
// endpoints outside the canvas bounds, so the slice falls out for free and
// the Oklab stop array needs no resampling per slide.
export function fillLinearGradient(
  ctx: Ctx2D,
  w: number,
  h: number,
  from: string,
  to: string,
  angleDeg: number,
  sliceIndex = 0,
  sliceCount = 1,
): void {
  const W = w * sliceCount;
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(W * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const cx = W / 2 - sliceIndex * w;
  const g = ctx.createLinearGradient(
    cx - (dx * len) / 2,
    h / 2 - (dy * len) / 2,
    cx + (dx * len) / 2,
    h / 2 + (dy * len) / 2,
  );
  const interp = interpolate([from, to], 'oklab');
  for (let i = 0; i <= STOP_COUNT; i++) {
    const t = i / STOP_COUNT;
    g.addColorStop(t, formatRgb(interp(t)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Radial glow: `from` at the focal point out to `to` at the farthest corner.
// Same Oklab stop ramp as the linear fill so saturated pairs don't grey out.
export function fillRadialGradient(
  ctx: Ctx2D,
  w: number,
  h: number,
  from: string,
  to: string,
  cy: number = h / 2,
): void {
  const cx = w / 2;
  // Radius must reach the farthest corner from the (possibly offset) focus.
  const r = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(w - cx, cy),
    Math.hypot(cx, h - cy),
    Math.hypot(w - cx, h - cy),
  );
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const interp = interpolate([from, to], 'oklab');
  for (let i = 0; i <= STOP_COUNT; i++) {
    const t = i / STOP_COUNT;
    g.addColorStop(t, formatRgb(interp(t)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Conic sweep around the focus: mirrored (from→to→from) so the seam is seamless.
export function fillConicGradient(
  ctx: Ctx2D,
  w: number,
  h: number,
  from: string,
  to: string,
  angleDeg: number,
  cy: number = h / 2,
): void {
  const cx = w / 2;
  const g = ctx.createConicGradient((angleDeg * Math.PI) / 180, cx, cy);
  const interp = interpolate([from, to], 'oklab');
  for (let i = 0; i <= STOP_COUNT; i++) {
    const t = i / STOP_COUNT;
    const tri = t <= 0.5 ? t * 2 : (1 - t) * 2; // 0→1→0 across the sweep
    g.addColorStop(t, formatRgb(interp(tri)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Mesh: four corner colours, each a soft radial blob fading to transparent over
// a base of the first colour. Deterministic — no noise, byte-identical exports.
export function fillMeshGradient(
  ctx: Ctx2D,
  w: number,
  h: number,
  colours: [string, string, string, string],
): void {
  ctx.fillStyle = colours[0];
  ctx.fillRect(0, 0, w, h);
  const corners: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const r = Math.hypot(w, h) * 0.85;
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colours[i]);
    g.addColorStop(1, withAlpha(colours[i], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
