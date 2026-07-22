import { SUBHEAD_WEIGHT } from './constants';

// Every weight renderSlide can draw: theme headline weights + the fixed
// subhead weight. Keep in sync with Theme['text']['weight'].
export const RENDER_WEIGHTS: number[] = [400, 600, 700, 800, SUBHEAD_WEIGHT].sort();

// Fonts bundled via next/font in app/layout.tsx expose their hashed family
// stack through a CSS variable on <html>. Read it (falling back to the plain
// family name when the DOM isn't available, e.g. SSR).
function cssFontStack(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

export function interFontFamily(): string {
  return cssFontStack('--font-inter', 'Inter, sans-serif');
}

import type { FontFamilyId } from './types';

// The selectable families. Inter + the five next/font/google faces are bundled
// (document.fonts.check() is a real assertion for these); System/Serif/Mono are
// OS stacks where the check is harmless.
export const FONT_FAMILIES: Array<{ id: FontFamilyId; label: string }> = [
  { id: 'inter', label: 'Inter' },
  { id: 'poppins', label: 'Poppins' },
  { id: 'montserrat', label: 'Montserrat' },
  { id: 'sora', label: 'Sora' },
  { id: 'playfair', label: 'Playfair Display' },
  { id: 'nunito', label: 'Nunito' },
  { id: 'system', label: 'System' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
];

export function resolveFontFamily(id: FontFamilyId): string {
  switch (id) {
    case 'poppins':
      return cssFontStack('--font-poppins', 'Poppins, sans-serif');
    case 'montserrat':
      return cssFontStack('--font-montserrat', 'Montserrat, sans-serif');
    case 'sora':
      return cssFontStack('--font-sora', 'Sora, sans-serif');
    case 'playfair':
      return cssFontStack('--font-playfair', 'Playfair Display, serif');
    case 'nunito':
      return cssFontStack('--font-nunito', 'Nunito, sans-serif');
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
