import type { DeviceSpec } from './types';

// Single source of truth for device frame geometry. render.ts reads
// everything from here; no frame numbers live anywhere else.
//
// What makes the Pixel read as a Pixel rather than a rounded iPhone is the
// corner radius: 8.5% of device width against the iPhone's 12.8%.
export const DEVICE_SPECS: DeviceSpec[] = [
  {
    id: 'iphone-17-pro',
    label: 'iPhone 17 Pro',
    // Real 6.9" screenshots are 1320x2868
    screenAspect: 1320 / 2868,
    bezelPct: 0.025,
    outerRadiusPct: 0.128,
    screenRadiusPct: 0.115,
    body: { fill: '#1c1c1e', edge: '#48484a', edgeWidth: 6 },
    cutout: { kind: 'dynamic-island', wPct: 0.29, hPct: 0.033, topPct: 0.017 },
    buttons: [
      { side: 'left', topPct: 0.18, lenPct: 0.045 }, // action
      { side: 'left', topPct: 0.26, lenPct: 0.065 }, // vol up
      { side: 'left', topPct: 0.345, lenPct: 0.065 }, // vol down
      { side: 'right', topPct: 0.27, lenPct: 0.11 }, // power
    ],
  },
  {
    id: 'pixel-10-pro',
    label: 'Pixel 10 Pro',
    // Real Pixel 10 Pro panel: 1280x2856. Every recent Pixel is nominally
    // 20:9 (0.4455..0.4492 across 9/10, Pro and XL), so any native capture
    // crops under half a percent — no per-model variants. Play's 1080x1920
    // OUTPUT canvas is unrelated to this number.
    screenAspect: 1280 / 2856,
    bezelPct: 0.032,
    outerRadiusPct: 0.085,
    screenRadiusPct: 0.07,
    body: { fill: '#202124', edge: '#3c4043', edgeWidth: 6 },
    // Centred punch-hole: 5% of screen width, 3% top margin.
    cutout: { kind: 'hole-punch', dPct: 0.05, topPct: 0.03, xPct: 0.5 },
    buttons: [
      { side: 'right', topPct: 0.2, lenPct: 0.07 }, // power, above the rocker
      { side: 'right', topPct: 0.29, lenPct: 0.11 }, // volume rocker
    ],
  },
  {
    id: 'none',
    label: 'No frame',
    screenAspect: 0, // derived from the store size at draw time
    bezelPct: 0,
    outerRadiusPct: 0,
    screenRadiusPct: 0.04,
    body: { fill: 'transparent', edge: 'transparent', edgeWidth: 0 },
    cutout: { kind: 'none' },
    buttons: [],
  },
];

export function getSpec(id: string): DeviceSpec {
  const s = DEVICE_SPECS.find((s) => s.id === id);
  if (!s) throw new Error(`Unknown device spec: ${id}`);
  return s;
}
