import { SUBHEAD_WEIGHT } from './constants';

// Every weight renderSlide can draw: theme headline weights + the fixed
// subhead weight. Keep in sync with Theme['text']['weight'].
export const RENDER_WEIGHTS: number[] = [400, 600, 700, 800, SUBHEAD_WEIGHT].sort();

// Inter is bundled via next/font/local in app/layout.tsx, which exposes the
// hashed family stack through the --font-inter CSS variable on <html>.
export function interFontFamily(): string {
  if (typeof document === 'undefined') return 'Inter, sans-serif';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-inter')
    .trim();
  return v || 'Inter, sans-serif';
}

import type { FontFamilyId } from './types';

// The selectable families. Inter is the bundled default; the rest are local
// stacks — document.fonts.check() only fails for registered-but-unloaded
// faces, so the export guard stays meaningful for Inter and harmless for the
// others.
export const FONT_FAMILIES: Array<{ id: FontFamilyId; label: string }> = [
  { id: 'inter', label: 'Inter' },
  { id: 'system', label: 'System' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
];

export function resolveFontFamily(id: FontFamilyId): string {
  switch (id) {
    case 'system':
      return 'system-ui, "Segoe UI", Arial, sans-serif';
    case 'serif':
      return 'Georgia, "Times New Roman", serif';
    case 'mono':
      return 'Consolas, "Courier New", monospace';
    default:
      return interFontFamily();
  }
}

// First family in the stack — the real face. load()/check() must target
// this, not the whole stack: the metric-adjusted local fallback next/font
// appends would satisfy a stack-wide check and mask a missing Inter.
function primaryFamily(id: FontFamilyId): string {
  return resolveFontFamily(id).split(',')[0].trim();
}

// Canvas fillText does not trigger font loading. If nothing in the DOM paints
// Inter, document.fonts.ready resolves against an empty queue and renderSlide
// silently falls back to a system font — identically in preview and export,
// so it would never be caught by eye. Explicitly load every combination
// renderSlide can draw before the first draw and before every export.
export async function loadRenderFonts(familyId: FontFamilyId = 'inter'): Promise<void> {
  if (typeof document === 'undefined') return;
  const family = primaryFamily(familyId);
  await Promise.all(
    RENDER_WEIGHTS.map((w) => document.fonts.load(`${w} 16px ${family}`)),
  );
  await document.fonts.ready;
}

// Same class of guard as the dimension-drift throw in export: check() is the
// assertion that the faces actually made it into the font set — load()
// resolves (with an empty list) even when nothing matched.
export function assertRenderFonts(familyId: FontFamilyId = 'inter'): void {
  const family = primaryFamily(familyId);
  const missing = RENDER_WEIGHTS.filter(
    (w) => !document.fonts.check(`${w} 16px ${family}`),
  );
  if (missing.length > 0) {
    throw new Error(
      `Font ${family} is not loaded for weight(s) ${missing.join(', ')}. ` +
        'Export aborted: the render would silently fall back to a system font.',
    );
  }
}
