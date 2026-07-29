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
    id: 'ipad-pro-13',
    label: 'iPad Pro 13"',
    // Real iPad Pro 13" (M4) panel: 2752x2064, i.e. exactly 3:4. The 12.9"
    // panel (2732x2048) is 0.74963 — within 0.05%, so one spec covers the
    // whole 13-inch class and no per-model variant is warranted. Derived from
    // the published PANEL, not from the 2064x2752 output canvas; that they
    // agree here is the same coincidence as Apple's 1320x2868 phone size, and
    // is not a method — inferring an aspect from a canvas is what produced the
    // fat Pixel frame.
    screenAspect: 2064 / 2752,
    // Uniform on all four sides, unlike the phones' asymmetric chin.
    bezelPct: 0.035,
    // ~18mm on a ~215mm-wide body. Physically generous, but PROPORTIONALLY
    // smaller than the iPhone's 0.128 because the body is far wider — that
    // ratio is most of what makes it read as a tablet rather than a big phone.
    outerRadiusPct: 0.075,
    screenRadiusPct: 0.055,
    body: { fill: '#2e2e30', edge: '#5a5a5e', edgeWidth: 6 },
    // Centred on the portrait left edge, so the landscape turn puts it on the
    // top long edge — where every iPad since the M4 puts it. No home button.
    // dPct is stylised upward like the Pixel's punch-hole: the true aperture is
    // nearer 1.2% of screen width, which is under 3 CSS px at preview scale and
    // reads as nothing. 2.2% still looks like a camera rather than a bullet hole.
    cutout: { kind: 'edge-camera', dPct: 0.022, edge: 'left', insetPct: 0.02 },
    buttons: [
      { side: 'top', topPct: 0.76, lenPct: 0.07 }, // power, top edge in portrait
      { side: 'right', topPct: 0.045, lenPct: 0.055 }, // vol up
      { side: 'right', topPct: 0.115, lenPct: 0.055 }, // vol down
    ],
  },
  {
    id: 'android-tablet-11',
    label: 'Android tablet 11"',
    // Pixel Tablet panel: 2560x1600 (16:10). Galaxy Tab S9 is the same, and
    // the S9 Ultra's 2960x1848 is 0.6243 — 16:10 is the Android tablet norm.
    // NOTE the trap: play-tablet-10's OUTPUT canvas is also 1600x2560. That is
    // a genuine coincidence, like Apple's; this number comes from the panel
    // spec and would be identical if Google's canvas were something else.
    screenAspect: 1600 / 2560,
    bezelPct: 0.03,
    // Squarer corners than the iPad, the clearest silhouette difference at a
    // glance, and a lighter aluminium body to match.
    outerRadiusPct: 0.045,
    screenRadiusPct: 0.03,
    body: { fill: '#3b4043', edge: '#6b7176', edgeWidth: 6 },
    // Slightly larger and more inset than the iPad's — Android tablets carry a
    // more prominent housing, and it is a cheap silhouette cue at a glance.
    cutout: { kind: 'edge-camera', dPct: 0.026, edge: 'left', insetPct: 0.024 },
    buttons: [
      { side: 'top', topPct: 0.12, lenPct: 0.08 }, // power
      { side: 'top', topPct: 0.3, lenPct: 0.13 }, // volume rocker
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
