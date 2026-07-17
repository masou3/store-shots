import JSZip from 'jszip';
import type { Slide, Theme } from './types';
import { getSize, STORE_RULES, validateSize } from './sizes';
import { measureSetTextZone, renderSlide } from './render';
import { encodeRgbPng } from './png';
import { assertRenderFonts, loadRenderFonts } from './fonts';

export type ExportProgress =
  | { stage: 'render'; slide: number; slides: number; preset: number; presets: number }
  | { stage: 'zip' };

// One store's set to export: its theme, its slides, and its ticked presets.
export type ExportSet = { theme: Theme; slides: Slide[]; sizeIds: string[] };

// Yield with setTimeout(0), NEVER requestAnimationFrame: rAF goes to zero in
// hidden tabs, and tabbing away mid-export is the normal case for a loop that
// takes seconds. Background setTimeout is throttled to ~1/sec, survivable and
// honest.
const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

// Exports a folder per ticked preset across every set. Preset ids are unique
// across stores, so folder names never collide; each set carries its own
// theme, so Play's cap and text zone stay independent of App Store's.
export async function exportAllZip(
  sets: ExportSet[],
  format: 'png' | 'jpeg',
  onProgress: (p: ExportProgress) => void,
): Promise<Blob> {
  // Load every family any set uses before rendering.
  const families = [...new Set(sets.map((s) => s.theme.text.family))];
  for (const fam of families) {
    await loadRenderFonts(fam);
    assertRenderFonts(fam);
  }

  const jobs = sets.flatMap((s) => s.sizeIds.map((sizeId) => ({ set: s, sizeId })));
  const zip = new JSZip();

  for (const [pi, { set, sizeId }] of jobs.entries()) {
    const size = getSize(sizeId);
    // Published pixel rules (Play: sides 320..3840, aspect within 2:1) —
    // same class of guard as the dimension-drift throw. iOS presets aren't
    // checked because Apple publishes no aspect rule, only exact dimensions,
    // which the drift throw already covers.
    const sizeErrors = validateSize(size);
    if (sizeErrors.length > 0) {
      throw new Error(`Preset ${sizeId} violates store rules: ${sizeErrors.join('; ')}`);
    }
    // Over-cap is a throw, not a silent truncation — a backstop the UI can't
    // trip. Add caps per store, clone truncates to the target cap, and
    // import/migration clamps, so reaching here means unvalidated data.
    const cap = STORE_RULES[size.store].maxShots;
    if (set.slides.length > cap) {
      throw new Error(
        `${sizeId}: ${set.slides.length} slides exceeds the ${cap}-slide cap for this store`,
      );
    }
    const setBlockH = measureSetTextZone(set.slides, set.theme, size);
    const folder = zip.folder(sizeId);
    if (!folder) throw new Error(`Could not create zip folder ${sizeId}`);

    for (const [si, slide] of set.slides.entries()) {
      onProgress({
        stage: 'render',
        slide: si + 1,
        slides: set.slides.length,
        preset: pi + 1,
        presets: jobs.length,
      });
      // The yield exists to repaint the progress UI. Hidden tabs have nobody
      // to repaint for and throttle timers hard — so don't yield there.
      if (!document.hidden) await yieldToEventLoop();

      const canvas = new OffscreenCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context for export');
      renderSlide(ctx, slide, set.theme, size, 1, {
        setBlockH,
        slideIndex: si,
        slideCount: set.slides.length,
      });

      // Per image, not once: silent dimension drift is the failure mode that
      // matters most.
      if (canvas.width !== size.width || canvas.height !== size.height) {
        throw new Error(
          `Export canvas for ${sizeId} slide ${si + 1} is ${canvas.width}x${canvas.height}, ` +
            `expected ${size.width}x${size.height}`,
        );
      }

      const name = String(si + 1).padStart(2, '0');
      if (format === 'png') {
        const img = ctx.getImageData(0, 0, size.width, size.height);
        folder.file(`${name}.png`, encodeRgbPng(img.data, size.width, size.height));
      } else {
        folder.file(`${name}.jpg`, await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 }));
      }
    }
  }

  onProgress({ stage: 'zip' });
  if (!document.hidden) await yieldToEventLoop();
  return zip.generateAsync({ type: 'blob' });
}
