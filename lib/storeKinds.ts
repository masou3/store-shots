import { STORE_RULES } from './sizes';
import type { DeviceClass } from './types';

// A project holds up to four independent sets: each store crossed with each
// device class. The active set's kind scopes device, sizes, caps, validateSize
// and every other rule below.
//
// Four flat keys rather than a deviceClass property on the set, because
// STORE_KINDS is already the per-set config record and a tablet set differs in
// exactly the fields it holds. `sets` stays Partial<Record<StoreKind, …>> with
// no shape change; deviceClass below is descriptive metadata for labels and
// clone decisions, never the key.
export type StoreKind = 'appStore' | 'appStoreTablet' | 'playStore' | 'playStoreTablet';

export const STORE_KINDS: Record<
  StoreKind,
  {
    label: string;
    store: 'ios' | 'play';
    deviceClass: DeviceClass;
    defaultFrameId: string;
    defaultSizeId: string;
    presetIds: string[]; // sizes available in this store, default first
  }
> = {
  appStore: {
    label: 'App Store — iPhone',
    store: 'ios',
    deviceClass: 'phone',
    defaultFrameId: 'iphone-17-pro',
    defaultSizeId: 'ios-6.9',
    presetIds: ['ios-6.9', 'ios-6.7', 'ios-6.5'],
  },
  appStoreTablet: {
    label: 'App Store — iPad',
    store: 'ios',
    deviceClass: 'tablet',
    defaultFrameId: 'ipad-pro-13',
    defaultSizeId: 'ipad-13',
    presetIds: ['ipad-13', 'ipad-12.9'],
  },
  playStore: {
    label: 'Play Store — phone',
    store: 'play',
    deviceClass: 'phone',
    defaultFrameId: 'pixel-10-pro',
    defaultSizeId: 'play-phone',
    presetIds: ['play-phone'],
  },
  playStoreTablet: {
    label: 'Play Store — tablet',
    store: 'play',
    deviceClass: 'tablet',
    defaultFrameId: 'android-tablet-11',
    defaultSizeId: 'play-tablet-10',
    presetIds: ['play-tablet-10'],
  },
};

export const STORE_ORDER: StoreKind[] = [
  'appStore',
  'appStoreTablet',
  'playStore',
  'playStoreTablet',
];

// The same store's other device class (iPhone <-> iPad, Play phone <-> Play
// tablet). Cross-CLASS clone cannot preserve layout — the aspect change is too
// large — so the clone flow treats this target differently from a same-class
// one; see cloneToOther.
export function otherClass(kind: StoreKind): StoreKind {
  const map: Record<StoreKind, StoreKind> = {
    appStore: 'appStoreTablet',
    appStoreTablet: 'appStore',
    playStore: 'playStoreTablet',
    playStoreTablet: 'playStore',
  };
  return map[kind];
}

// The other store at the SAME device class (App Store <-> Play). This is the
// same-class clone the two-set model was built for.
export function otherStore(kind: StoreKind): StoreKind {
  const map: Record<StoreKind, StoreKind> = {
    appStore: 'playStore',
    playStore: 'appStore',
    appStoreTablet: 'playStoreTablet',
    playStoreTablet: 'appStoreTablet',
  };
  return map[kind];
}

export function storeKindForSizeId(id: string): StoreKind {
  const kind = STORE_ORDER.find((k) => STORE_KINDS[k].presetIds.includes(id));
  if (!kind) throw new Error(`No store kind owns size: ${id}`);
  return kind;
}

export function isCrossClass(from: StoreKind, to: StoreKind): boolean {
  return STORE_KINDS[from].deviceClass !== STORE_KINDS[to].deviceClass;
}

// What a clone carries and what it drops, as prose for the confirm banner.
// Lives next to the kinds rather than in the component so the sentence and the
// behaviour in cloneTo change together; a confirm that has drifted from what
// the code does is worse than no confirm.
//
// Stated as CARRIES / DOES NOT, in that order, because the second half is the
// useful half. Someone cloning a finished phone set into tablet is not
// wondering whether their colours survive — they are about to lose a layout
// they spent time on, and a generic "this will overwrite" warning does not
// tell them that.
export function cloneEffect(from: StoreKind, to: StoreKind): { carries: string; drops: string } | null {
  if (!isCrossClass(from, to)) return null;
  const fromClass = STORE_KINDS[from].deviceClass;
  const toClass = STORE_KINDS[to].deviceClass;
  return {
    // Each half is a complete sentence on its own, because the banner leads
    // with `drops` — a fragment like "layout and nudges do not" reads as
    // dangling when it is the first thing on screen.
    drops:
      `Layout, text nudges and screenshots will NOT carry over: a ${fromClass} canvas ` +
      `and a ${toClass} one are too different in shape to share a composition, and a ` +
      `${fromClass} capture would be cropped wrong in a ${toClass} frame. Every screen ` +
      `starts on the default layout for its orientation.`,
    carries: 'Background, colours, type and headline text do carry over.',
  };
}

// Single per-set cap. App Store allows 1-10 per device class and Play up to 8
// per device type, so the cap is per KIND — an iPhone set and an iPad set each
// get their own 10, and neither counts against the other.
export function capFor(kind: StoreKind): { min: number; max: number; featuredMin?: number } {
  const r = STORE_RULES[STORE_KINDS[kind].store];
  return {
    min: r.minShots,
    max: r.maxShots,
    featuredMin: 'featuredMin' in r ? r.featuredMin : undefined,
  };
}
