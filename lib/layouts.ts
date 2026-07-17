import type { Theme } from './types';

export type LayoutId = 'top-text-crop' | 'top-text-float' | 'bottom-text-crop' | 'angled';

export type LayoutPreset = {
  id: LayoutId;
  label: string;
  textPosition: 'top' | 'bottom';
  sizing: 'slot' | 'bleed';
  fill: number; // slot mode only
  anchor: 'top' | 'center' | 'bottom'; // slot mode only
  bleed: number; // bleed mode only: fraction of device height past the edge
  widthPct: number; // bleed mode only: fraction of canvas width, capped
  shadow: boolean;
  rotate: number; // degrees
};

// Two sizing contracts. Crop layouts size by width and position by bleed —
// the device lands in the same place on every slide regardless of headline
// length, and the crop fraction is the stated bleed parameter on both
// canvases (unless text collision shrinks the device). Float and angled stay
// height-driven off the slot.
export const LAYOUTS: LayoutPreset[] = [
  {
    id: 'top-text-crop',
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
  },
];

export function getLayout(id: LayoutId): LayoutPreset {
  const l = LAYOUTS.find((l) => l.id === id);
  if (!l) throw new Error(`Unknown layout: ${id}`);
  return l;
}

// deviceScale and deviceOffsetY are user dials on top of the preset; they are
// deliberately left untouched here.
export function applyLayout(theme: Theme, preset: LayoutPreset): Theme {
  return {
    ...theme,
    layout: {
      ...theme.layout,
      textPosition: preset.textPosition,
      deviceSizing: preset.sizing,
      deviceFill: preset.fill,
      deviceAnchor: preset.anchor,
      deviceBleed: preset.bleed,
      deviceWidthPct: preset.widthPct,
      deviceShadow: preset.shadow,
      deviceRotation: preset.rotate,
    },
  };
}
