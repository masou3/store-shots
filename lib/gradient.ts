import { interpolate, formatRgb } from 'culori';
import type { Ctx2D } from './types';

const STOP_COUNT = 64;

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

// Centred radial glow: `from` at the middle out to `to` at the corners. Same
// Oklab stop ramp as the linear fill so saturated pairs don't grey out.
export function fillRadialGradient(
  ctx: Ctx2D,
  w: number,
  h: number,
  from: string,
  to: string,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.hypot(w / 2, h / 2); // reach the corners
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const interp = interpolate([from, to], 'oklab');
  for (let i = 0; i <= STOP_COUNT; i++) {
    const t = i / STOP_COUNT;
    g.addColorStop(t, formatRgb(interp(t)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
