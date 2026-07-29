import type { Orientation, Slide, StoreSize } from './types';

// Every width/height here is the PORTRAIT canvas. Landscape is per-slide and
// derived by swapping (orientSize) — there are deliberately no landscape rows,
// because a second declaration of the same canvas is a second thing to get
// wrong, and neither store treats landscape as a separate obligation.
export const SIZES: StoreSize[] = [
  { id: 'ios-6.9', label: 'iPhone 6.9" (17 Pro Max)', store: 'ios', deviceClass: 'phone', width: 1320, height: 2868 },
  { id: 'ios-6.7', label: 'iPhone 6.7"', store: 'ios', deviceClass: 'phone', width: 1290, height: 2796 },
  { id: 'ios-6.5', label: 'iPhone 6.5"', store: 'ios', deviceClass: 'phone', width: 1284, height: 2778 },
  // Apple's 13-inch iPad slot accepts either canvas, so these two share an
  // obligation group: delivering EITHER discharges the 13-inch requirement.
  { id: 'ipad-13', label: 'iPad 13"', store: 'ios', deviceClass: 'tablet', width: 2064, height: 2752, satisfies: 'ipad-13-class' },
  { id: 'ipad-12.9', label: 'iPad 12.9"', store: 'ios', deviceClass: 'tablet', width: 2048, height: 2732, satisfies: 'ipad-13-class' },
  { id: 'play-phone', label: 'Play phone', store: 'play', deviceClass: 'phone', width: 1080, height: 1920 },
  { id: 'play-tablet-10', label: 'Play tablet 10"', store: 'play', deviceClass: 'tablet', width: 1600, height: 2560 },
];

export function getSize(id: string): StoreSize {
  const s = SIZES.find((s) => s.id === id);
  if (!s) throw new Error(`Unknown store size: ${id}`);
  return s;
}

// The obligation a size discharges. Sizes in one `satisfies` group collapse to
// a single entry, so the UI counts obligations rather than canvases.
export function obligationOf(size: StoreSize): string {
  return size.satisfies ?? size.id;
}

// Distinct obligations covered by a set of preset ids — what the user actually
// owes the store, deduped across equivalent canvases.
export function obligationsFor(sizeIds: string[]): string[] {
  return [...new Set(sizeIds.map((id) => obligationOf(getSize(id))))];
}

// A slide's orientation, defaulting to portrait for any project saved before
// landscape existed (the field is optional and absent on those slides).
export function slideOrientation(slide: Slide): Orientation {
  return slide.orientation ?? 'portrait';
}

// The actual canvas dimensions a slide renders at: the set's size for portrait,
// its W/H swapped for landscape. The output PNG for a landscape 6.9" slide is
// 2868x1320. Both stores accept this under the same size bucket as its portrait
// siblings, so validateSize (which is W/H-order-invariant) still passes.
export function orientSize(size: StoreSize, orientation: Orientation): StoreSize {
  return orientation === 'landscape'
    ? { ...size, width: size.height, height: size.width }
    : size;
}

// The canvas size for a specific slide within a set of the given size.
export function slideSize(size: StoreSize, slide: Slide): StoreSize {
  return orientSize(size, slideOrientation(slide));
}

// Store upload rules, encoded as validation. Only rules with a published
// source belong here — earlier drafts carried file-size caps (30 MB iOS,
// 8 MB Play) that neither store actually documents; deleted rather than
// asserted unchecked.
export const STORE_RULES = {
  ios: { minShots: 1, maxShots: 10 },
  play: {
    minShots: 2,
    maxShots: 8,
    // 4+ screenshots per type to be eligible for Play's featured surfaces
    featuredMin: 4,
    minSidePx: 320,
    maxSidePx: 3840,
    // longest side must be no more than 2x the shortest side
    maxAspect: 2,
  },
} as const;

export function validateSize(size: StoreSize): string[] {
  const errors: string[] = [];
  if (size.store === 'play') {
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > short * STORE_RULES.play.maxAspect) {
      errors.push(`${size.id}: ${size.width}x${size.height} exceeds Play's 2:1 aspect limit`);
    }
    if (short < STORE_RULES.play.minSidePx || long > STORE_RULES.play.maxSidePx) {
      errors.push(`${size.id}: sides must be within 320..3840 px`);
    }
  }
  return errors;
}
