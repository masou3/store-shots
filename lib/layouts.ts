import type { LayoutId, Orientation, SlideLayout } from './types';

export type { LayoutId } from './types';

// Device-dial defaults that presets do NOT touch (textInsetPct, deviceScale,
// deviceOffsetY, imageFit). A new slide's layout is this seeded with a preset.
export const BASE_SLIDE_LAYOUT: SlideLayout = {
  textPosition: 'top',
  textInsetPct: 8,
  deviceSizing: 'slot',
  deviceFill: 0.9,
  deviceAnchor: 'center',
  deviceBleed: 0.2,
  deviceWidthPct: 0.84,
  deviceShadow: true,
  deviceScale: 1,
  deviceOffsetX: 0,
  deviceOffsetY: 0,
  deviceRotation: 0,
  imageFit: 'cover',
  textOffsetX: 0,
  textOffsetY: 0,
  overlapNext: 0,
  glowStrength: 0,
  glowColour: '#7c3aed',
};

export type LayoutPreset = {
  id: LayoutId;
  label: string;
  textPosition: 'top' | 'bottom' | 'left' | 'right';
  sizing: 'slot' | 'bleed';
  fill: number; // slot mode only
  anchor: 'top' | 'center' | 'bottom'; // slot mode only; reads left/centre/right for side text
  bleed: number; // bleed mode only: fraction of device height past the edge
  widthPct: number; // bleed mode only: fraction of canvas width, capped
  heightPct?: number; // side-text bleed only: fraction of canvas height
  bandPct?: number; // side text only: fraction of canvas width for the text column
  shadow: boolean;
  rotate: number; // degrees
  // Which orientations offer this preset. Omitted = both. A landscape canvas
  // has almost no vertical slack, so the side-text presets are landscape-only;
  // `angled` is portrait-only for the opposite reason (see LAYOUTS).
  orientations?: Orientation[];
  // Orientations where this preset works but is the lesser choice. Offered
  // last and visibly marked, never hidden — see LAYOUT_GROUPS.
  demotedIn?: Orientation[];
};

// Two sizing contracts. Crop layouts size by width and position by bleed —
// the device lands in the same place on every slide regardless of headline
// length, and the crop fraction is the stated bleed parameter on both
// canvases (unless text collision shrinks the device). Float and angled stay
// height-driven off the slot.
export const LAYOUTS: LayoutPreset[] = [
  {
    id: 'top-text-crop',
    demotedIn: ['landscape'],
    label: 'Top text, crop',
    textPosition: 'top',
    sizing: 'bleed',
    fill: 1,
    anchor: 'top',
    bleed: 0.2,
    widthPct: 0.84,
    shadow: false,
    rotate: 0,
  },
  {
    id: 'top-text-float',
    demotedIn: ['landscape'],
    label: 'Top text, float',
    textPosition: 'top',
    sizing: 'slot',
    fill: 0.9,
    anchor: 'center',
    bleed: 0,
    widthPct: 0.84,
    shadow: true,
    rotate: 0,
  },
  {
    id: 'bottom-text-crop',
    demotedIn: ['landscape'],
    label: 'Bottom text, crop',
    textPosition: 'bottom',
    sizing: 'bleed',
    fill: 1,
    anchor: 'bottom',
    bleed: 0.2,
    widthPct: 0.84,
    shadow: false,
    rotate: 0,
  },
  {
    id: 'angled',
    label: 'Angled',
    textPosition: 'top',
    sizing: 'slot',
    // 0.82 lands the iOS rotated bbox exactly at the 0.84 width cap, so the
    // cap stays idle and BOTH canvases are height-driven at the same fill.
    fill: 0.82,
    anchor: 'center',
    bleed: 0,
    widthPct: 0.84,
    shadow: true,
    rotate: 8,
    // PORTRAIT ONLY. In landscape the device already carries a 90° base turn,
    // and the tilt on top grows the bounding box along the axis that has least
    // room; the device shrinks hard for a tilt that reads as a mistake rather
    // than a flourish on a wide body. Withheld rather than left to be found.
    orientations: ['portrait'],
  },
  // --- Landscape only, text BESIDE the device ------------------------------
  // A landscape canvas is short and wide. Text above the device competes for
  // the scarce axis; text beside it spends the plentiful one, which is why
  // these are the layouts to reach for on a tablet in landscape.
  {
    id: 'side-text-crop',
    label: 'Side text, crop',
    textPosition: 'left',
    sizing: 'bleed',
    fill: 1,
    anchor: 'center',
    bleed: 0.2,
    widthPct: 0.84,
    heightPct: 0.86,
    bandPct: 0.46,
    shadow: false,
    rotate: 0,
    orientations: ['landscape'],
  },
  {
    id: 'side-text-crop-right',
    label: 'Side text, crop (right)',
    textPosition: 'right',
    sizing: 'bleed',
    fill: 1,
    anchor: 'center',
    bleed: 0.2,
    widthPct: 0.84,
    heightPct: 0.86,
    bandPct: 0.46,
    shadow: false,
    rotate: 0,
    orientations: ['landscape'],
  },
  {
    id: 'side-text-float',
    label: 'Side text, float',
    textPosition: 'left',
    sizing: 'slot',
    fill: 0.92,
    anchor: 'center',
    bleed: 0,
    widthPct: 0.84,
    heightPct: 0.86,
    bandPct: 0.46,
    shadow: true,
    rotate: 0,
    orientations: ['landscape'],
  },
];

// Presets offered for a given orientation, RECOMMENDED FIRST. Angled
// disappears in landscape and the side-text set disappears in portrait;
// top/bottom text survives landscape but sorts to the bottom.
export function layoutsFor(orientation: Orientation): LayoutPreset[] {
  return LAYOUTS.filter((l) => !l.orientations || l.orientations.includes(orientation)).sort(
    (a, b) => Number(isDemoted(a, orientation)) - Number(isDemoted(b, orientation)),
  );
}

export function isDemoted(preset: LayoutPreset, orientation: Orientation): boolean {
  return !!preset.demotedIn?.includes(orientation);
}

// The picker's two sections. Grouping exists so the ONE place the device-shrink
// warning is known to under-fire — landscape top text, which stops looking
// deliberate at ~85% rather than the global 70% — is also the place a user has
// been steered away from. A single global threshold is honest only if the
// combination it is too lenient for is visibly the lesser option; otherwise the
// number is merely convenient. Demoted presets are ordered last and labelled,
// never hidden: they work, and someone who wants one should be able to pick it.
export type LayoutGroup = { label: string | null; note: string | null; presets: LayoutPreset[] };

export function layoutGroups(orientation: Orientation): LayoutGroup[] {
  const all = layoutsFor(orientation);
  const preferred = all.filter((l) => !isDemoted(l, orientation));
  const lesser = all.filter((l) => isDemoted(l, orientation));
  if (lesser.length === 0) return [{ label: null, note: null, presets: preferred }];
  return [
    { label: 'Recommended for landscape', note: null, presets: preferred },
    {
      label: 'Text above or below',
      note: 'Works, but a landscape canvas has little height to spare — the device shrinks quickly as headlines get longer.',
      presets: lesser,
    },
  ];
}

// The preset a slide should fall back to when its current one isn't offered in
// the orientation it just moved to — switching a slide to landscape must not
// leave it on `angled`, and back to portrait must not leave it on side text.
export function defaultLayoutFor(orientation: Orientation): LayoutId {
  return orientation === 'landscape' ? 'side-text-crop' : 'top-text-crop';
}

export function layoutAllowedIn(id: LayoutId, orientation: Orientation): boolean {
  return layoutsFor(orientation).some((l) => l.id === id);
}

export function getLayout(id: LayoutId): LayoutPreset {
  const l = LAYOUTS.find((l) => l.id === id);
  if (!l) throw new Error(`Unknown layout: ${id}`);
  return l;
}

// deviceScale, deviceOffsetY, textInsetPct and imageFit are user dials on top
// of the preset; they are deliberately left untouched here.
export function applyLayout(layout: SlideLayout, preset: LayoutPreset): SlideLayout {
  return {
    ...layout,
    textPosition: preset.textPosition,
    deviceSizing: preset.sizing,
    deviceFill: preset.fill,
    deviceAnchor: preset.anchor,
    deviceBleed: preset.bleed,
    deviceWidthPct: preset.widthPct,
    deviceHeightPct: preset.heightPct ?? layout.deviceHeightPct,
    textBandPct: preset.bandPct ?? layout.textBandPct,
    deviceShadow: preset.shadow,
    deviceRotation: preset.rotate,
    // Switching between a side-text and a top-text preset moves the text onto
    // the other axis; a drag nudge measured against the old one is meaningless
    // and reads as the block landing crooked, so it's dropped.
    textOffsetX: 0,
    textOffsetY: 0,
  };
}

// A fresh slide layout: the base dials seeded with a preset.
export function slideLayoutFor(id: LayoutId): SlideLayout {
  return applyLayout(BASE_SLIDE_LAYOUT, getLayout(id));
}
