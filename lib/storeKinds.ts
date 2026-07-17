import { STORE_RULES } from './sizes';

// A project holds up to two independent sets, one per store. The active set's
// store scopes device, sizes, caps, validateSize and every other rule below.
export type StoreKind = 'appStore' | 'playStore';

export const STORE_KINDS: Record<
  StoreKind,
  {
    label: string;
    store: 'ios' | 'play';
    defaultFrameId: string;
    defaultSizeId: string;
    presetIds: string[]; // sizes available in this store, default first
  }
> = {
  appStore: {
    label: 'App Store',
    store: 'ios',
    defaultFrameId: 'iphone-17-pro',
    defaultSizeId: 'ios-6.9',
    presetIds: ['ios-6.9', 'ios-6.7', 'ios-6.5', 'ipad-13'],
  },
  playStore: {
    label: 'Play Store',
    store: 'play',
    defaultFrameId: 'pixel-10-pro',
    defaultSizeId: 'play-phone',
    presetIds: ['play-phone', 'play-tablet-10'],
  },
};

export const STORE_ORDER: StoreKind[] = ['appStore', 'playStore'];

export function otherStore(kind: StoreKind): StoreKind {
  return kind === 'appStore' ? 'playStore' : 'appStore';
}

export function storeKindForSizeId(id: string): StoreKind {
  return STORE_KINDS.appStore.presetIds.includes(id) ? 'appStore' : 'playStore';
}

// Single per-set cap now that a set belongs to exactly one store.
export function capFor(kind: StoreKind): { min: number; max: number; featuredMin?: number } {
  const r = STORE_RULES[STORE_KINDS[kind].store];
  return {
    min: r.minShots,
    max: r.maxShots,
    featuredMin: 'featuredMin' in r ? r.featuredMin : undefined,
  };
}
