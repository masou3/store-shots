import type { Ctx2D } from './types';

const GRAIN_TILE = 256;
const GRAIN_SEED = 0x5eed;

let grainTile: OffscreenCanvas | HTMLCanvasElement | null = null;

// Deterministic PRNG so the grain texture is identical in every session —
// exports must be byte-identical across reloads (the project round-trip
// assertion depends on it). Math.random() here would silently break that.
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Generated once, cached for the session. Never regenerate per render.
function getGrainTile(): OffscreenCanvas | HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(GRAIN_TILE, GRAIN_TILE)
      : (document.createElement('canvas') as HTMLCanvasElement);
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const ctx = c.getContext('2d') as Ctx2D;
  const img = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const rand = mulberry32(GRAIN_SEED);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rand() * 255) | 0;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

export function drawGrain(ctx: Ctx2D, w: number, h: number, opacity: number): void {
  if (opacity <= 0) return;
  const pattern = ctx.createPattern(getGrainTile() as CanvasImageSource, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
