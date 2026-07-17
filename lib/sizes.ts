import type { StoreSize } from './types';

export const SIZES: StoreSize[] = [
  { id: 'ios-6.9', label: 'iPhone 6.9" (17 Pro Max)', store: 'ios', width: 1320, height: 2868 },
  { id: 'ios-6.7', label: 'iPhone 6.7"', store: 'ios', width: 1290, height: 2796 },
  { id: 'ios-6.5', label: 'iPhone 6.5"', store: 'ios', width: 1284, height: 2778 },
  { id: 'ipad-13', label: 'iPad 13"', store: 'ios', width: 2064, height: 2752 },
  { id: 'play-phone', label: 'Play phone', store: 'play', width: 1080, height: 1920 },
  { id: 'play-tablet-10', label: 'Play tablet 10"', store: 'play', width: 1600, height: 2560 },
];

// Output presets offered in the export multi-select, in display order.
// ios-6.9 and play-phone are ticked by default.
export const EXPORT_PRESET_IDS = ['ios-6.9', 'play-phone', 'ios-6.7', 'ios-6.5', 'ipad-13'];

export function getSize(id: string): StoreSize {
  const s = SIZES.find((s) => s.id === id);
  if (!s) throw new Error(`Unknown store size: ${id}`);
  return s;
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
