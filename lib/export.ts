import type { Slide, StoreSize, Theme } from './types';
import { renderSlide, type RenderOpts } from './render';
import { encodeRgbPng } from './png';
import { assertRenderFonts, loadRenderFonts } from './fonts';

export async function exportSlidePng(
  slide: Slide,
  theme: Theme,
  size: StoreSize,
  opts: RenderOpts = {},
): Promise<Blob> {
  await loadRenderFonts(theme.text.family);
  assertRenderFonts(theme.text.family);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context for export');

  renderSlide(ctx, slide, theme, size, 1, opts);

  if (canvas.width !== size.width || canvas.height !== size.height) {
    throw new Error(
      `Export canvas is ${canvas.width}x${canvas.height}, expected ${size.width}x${size.height}`,
    );
  }

  const img = ctx.getImageData(0, 0, size.width, size.height);
  const png = encodeRgbPng(img.data, size.width, size.height);
  return new Blob([png as unknown as BlobPart], { type: 'image/png' });
}

export async function exportSlideJpeg(
  slide: Slide,
  theme: Theme,
  size: StoreSize,
  opts: RenderOpts = {},
): Promise<Blob> {
  await loadRenderFonts(theme.text.family);
  assertRenderFonts(theme.text.family);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context for export');
  renderSlide(ctx, slide, theme, size, 1, opts);
  // JPEG fallback only — PNG-24 via encodeRgbPng is the standard export.
  // JPEG has no alpha channel, so convertToBlob is safe here.
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some Chrome versions.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
