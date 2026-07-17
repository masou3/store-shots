import { create } from 'zustand';
import type { Slide, Theme } from './types';
import { applyLayout, getLayout, type LayoutId } from './layouts';
import { clearAllImages, ensureBitmap, getImageBlob, removeImage, saveImage } from './imageStore';
import { STORE_KINDS, capFor, otherStore, type StoreKind } from './storeKinds';
import {
  loadProjectLocal,
  saveProjectLocal,
  type ProjectSnapshot,
  type SetState,
} from './persistence';

const BASE_THEME: Omit<Theme, 'sizeId' | 'frameId' | 'lastFrameId'> = {
  frameColour: null,
  gradient: { mode: 'gradient', from: '#4f46e5', to: '#ec4899', angle: 160, continuous: false },
  grain: 0.02,
  text: {
    family: 'inter',
    sizePct: 9,
    weight: 800,
    colour: '#ffffff',
    align: 'center',
    lineHeight: 1.1,
    maxWidthPct: 80,
  },
  layout: {
    textPosition: 'top',
    textInsetPct: 8,
    deviceSizing: 'slot',
    deviceFill: 0.9,
    deviceAnchor: 'center',
    deviceBleed: 0.2,
    deviceWidthPct: 0.84,
    deviceShadow: true,
    deviceScale: 1,
    deviceOffsetY: 0,
    deviceRotation: 0,
    imageFit: 'cover',
  },
};

const DEFAULT_LAYOUT: LayoutId = 'top-text-crop';

function newSlide(partial?: Partial<Slide>): Slide {
  return { id: crypto.randomUUID(), headline: '', ...partial };
}

export function defaultSet(kind: StoreKind, seedText = false): SetState {
  const cfg = STORE_KINDS[kind];
  const theme: Theme = applyLayout(
    { ...BASE_THEME, sizeId: cfg.defaultSizeId, frameId: cfg.defaultFrameId, lastFrameId: cfg.defaultFrameId },
    getLayout(DEFAULT_LAYOUT),
  );
  const first = seedText
    ? newSlide({ headline: 'Track every rep.', subhead: 'Sets, reps and PRs logged in one tap.' })
    : newSlide();
  return {
    theme,
    layoutId: DEFAULT_LAYOUT,
    slides: [first],
    currentSlideId: first.id,
    sizeId: cfg.defaultSizeId,
    exportSizeIds: [cfg.defaultSizeId],
  };
}

function decodeSlideImages(slides: Slide[], done: () => void): void {
  const keys = slides.map((s) => s.imageKey).filter((k): k is string => Boolean(k));
  if (keys.length === 0) return;
  // A key with no blob keeps its slide's text and renders an empty screen —
  // ensureBitmap resolves false, nothing throws.
  Promise.all(keys.map((k) => ensureBitmap(k))).then(done);
}

function decodeAllSets(sets: Partial<Record<StoreKind, SetState>>, done: () => void): void {
  const all = Object.values(sets).flatMap((s) => (s ? s.slides : []));
  decodeSlideImages(all, done);
}

type StoreState = {
  activeStore: StoreKind | null; // null = the gate (no set chosen yet)
  sets: Partial<Record<StoreKind, SetState>>;
  exportFormat: 'png' | 'jpeg';
  imagesVersion: number;
  hydrated: boolean;
  persistSuspended: boolean;

  chooseStore: (kind: StoreKind) => void;
  switchStore: (kind: StoreKind) => void;
  cloneToOther: () => Promise<void>;

  setSizeId: (id: string) => void;
  setLayoutId: (id: LayoutId) => void;
  patchTheme: (p: Partial<Theme>) => void;
  patchGradient: (p: Partial<Theme['gradient']>) => void;
  patchText: (p: Partial<Theme['text']>) => void;
  patchLayout: (p: Partial<Theme['layout']>) => void;
  patchSlide: (id: string, p: Partial<Slide>) => void;
  selectSlide: (id: string) => void;
  addSlide: () => void;
  deleteSlide: (id: string) => void;
  reorderSlide: (from: number, to: number) => void;
  toggleExportSize: (id: string) => void;
  assignImageKeys: (keys: string[]) => void;

  setExportFormat: (f: 'png' | 'jpeg') => void;
  bumpImages: () => void;
  hydrate: () => void;
  replaceProject: (snap: ProjectSnapshot) => void;
  resetProject: () => Promise<void>;
};

export const useStore = create<StoreState>((set, get) => {
  // Mutate the active set; a no-op when the gate is showing.
  const updateActive = (fn: (s: SetState) => Partial<SetState>) =>
    set((state) => {
      const kind = state.activeStore;
      const cur = kind ? state.sets[kind] : undefined;
      if (!kind || !cur) return {};
      return { sets: { ...state.sets, [kind]: { ...cur, ...fn(cur) } } };
    });

  return {
    activeStore: null,
    sets: {},
    exportFormat: 'png',
    imagesVersion: 0,
    hydrated: false,
    persistSuspended: false,

    chooseStore: (kind) =>
      set((state) => {
        if (state.sets[kind]) return { activeStore: kind };
        return { activeStore: kind, sets: { ...state.sets, [kind]: defaultSet(kind, true) } };
      }),
    switchStore: (kind) => set((state) => (state.sets[kind] ? { activeStore: kind } : {})),

    cloneToOther: async () => {
      const state = get();
      const from = state.activeStore;
      if (!from) return;
      const to = otherStore(from);
      const src = state.sets[from];
      if (!src) return;
      const cfg = STORE_KINDS[to];

      // Truncate to the target's cap, cutting from the END — slide 1 matters
      // most in both stores, so the tail is what goes. App Store (10) → Play
      // (8) drops 9 and 10; Play → App Store never truncates (8 fits in 10).
      // Dropped slides' images are never duplicated.
      const kept = src.slides.slice(0, capFor(to).max);

      // Duplicate images under NEW keys — two independent sets, no shared blob.
      const keyMap = new Map<string, string>();
      for (const sl of kept) {
        if (sl.imageKey && !keyMap.has(sl.imageKey)) {
          const blob = await getImageBlob(sl.imageKey);
          if (blob) keyMap.set(sl.imageKey, await saveImage(blob));
        }
      }
      const slides: Slide[] = kept.map((sl) => ({
        id: crypto.randomUUID(),
        headline: sl.headline,
        subhead: sl.subhead,
        imageKey: sl.imageKey ? keyMap.get(sl.imageKey) : undefined,
      }));
      // Swap device to the target's (keep 'none' — valid in both stores).
      const frameId = src.theme.frameId === 'none' ? 'none' : cfg.defaultFrameId;
      const theme: Theme = {
        ...src.theme,
        frameId,
        lastFrameId: cfg.defaultFrameId,
        sizeId: cfg.defaultSizeId,
      };
      const newSet: SetState = {
        theme,
        layoutId: src.layoutId,
        slides,
        currentSlideId: slides[0].id,
        sizeId: cfg.defaultSizeId,
        exportSizeIds: [cfg.defaultSizeId],
      };
      // Re-clone overwrites: drop the old target's orphaned blobs.
      const oldKeys = state.sets[to]?.slides.map((s) => s.imageKey).filter(Boolean) as string[] | undefined;
      set((s) => ({ sets: { ...s.sets, [to]: newSet }, activeStore: to }));
      oldKeys?.forEach((k) => void removeImage(k));
      get().bumpImages();
    },

    setSizeId: (id) => updateActive((s) => ({ sizeId: id, theme: { ...s.theme, sizeId: id } })),
    setLayoutId: (id) =>
      updateActive((s) => ({ layoutId: id, theme: applyLayout(s.theme, getLayout(id)) })),
    patchTheme: (p) =>
      updateActive((s) => ({
        theme: {
          ...s.theme,
          ...p,
          lastFrameId:
            p.frameId && p.frameId !== 'none' ? p.frameId : s.theme.lastFrameId,
        },
      })),
    patchGradient: (p) =>
      updateActive((s) => ({ theme: { ...s.theme, gradient: { ...s.theme.gradient, ...p } } })),
    patchText: (p) =>
      updateActive((s) => ({ theme: { ...s.theme, text: { ...s.theme.text, ...p } } })),
    patchLayout: (p) =>
      updateActive((s) => ({ theme: { ...s.theme, layout: { ...s.theme.layout, ...p } } })),
    patchSlide: (id, p) =>
      updateActive((s) => ({ slides: s.slides.map((sl) => (sl.id === id ? { ...sl, ...p } : sl)) })),
    selectSlide: (id) => updateActive(() => ({ currentSlideId: id })),
    addSlide: () =>
      updateActive((s) => {
        const kind = get().activeStore;
        if (!kind || s.slides.length >= capFor(kind).max) return {};
        const slide = newSlide();
        const idx = s.slides.findIndex((sl) => sl.id === s.currentSlideId);
        const slides = [...s.slides];
        slides.splice(idx + 1, 0, slide);
        return { slides, currentSlideId: slide.id };
      }),
    deleteSlide: (id) =>
      updateActive((s) => {
        const victim = s.slides.find((sl) => sl.id === id);
        if (victim?.imageKey) void removeImage(victim.imageKey);
        let slides = s.slides.filter((sl) => sl.id !== id);
        if (slides.length === 0) slides = [newSlide()];
        const currentSlideId =
          s.currentSlideId === id
            ? slides[Math.min(s.slides.findIndex((sl) => sl.id === id), slides.length - 1)].id
            : s.currentSlideId;
        return { slides, currentSlideId };
      }),
    reorderSlide: (from, to) =>
      updateActive((s) => {
        if (from === to || from < 0 || from >= s.slides.length) return {};
        const slides = [...s.slides];
        const [moved] = slides.splice(from, 1);
        slides.splice(Math.max(0, Math.min(to, slides.length)), 0, moved);
        return { slides };
      }),
    toggleExportSize: (id) =>
      updateActive((s) => {
        const kind = get().activeStore;
        if (!kind) return {};
        const order = STORE_KINDS[kind].presetIds;
        const next = s.exportSizeIds.includes(id)
          ? s.exportSizeIds.filter((x) => x !== id)
          : [...s.exportSizeIds, id];
        next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        return { exportSizeIds: next };
      }),
    assignImageKeys: (keys) => {
      const replaced: string[] = [];
      updateActive((s) => {
        const slides = [...s.slides];
        const start = Math.max(0, slides.findIndex((sl) => sl.id === s.currentSlideId));
        keys.forEach((key, i) => {
          const idx = start + i;
          if (idx < slides.length) {
            if (slides[idx].imageKey) replaced.push(slides[idx].imageKey!);
            slides[idx] = { ...slides[idx], imageKey: key };
          } else {
            slides.push(newSlide({ imageKey: key }));
          }
        });
        return { slides };
      });
      replaced.forEach((k) => void removeImage(k));
    },

    setExportFormat: (f) => set({ exportFormat: f }),
    bumpImages: () => set((s) => ({ imagesVersion: s.imagesVersion + 1 })),
    hydrate: () => {
      if (get().hydrated) return;
      const snap = loadProjectLocal();
      if (snap) {
        set({ ...snap, hydrated: true });
        decodeAllSets(snap.sets, () => get().bumpImages());
      } else {
        set({ hydrated: true });
      }
    },
    replaceProject: (snap) => {
      set({ ...snap });
      decodeAllSets(snap.sets, () => get().bumpImages());
      get().bumpImages();
    },
    resetProject: async () => {
      set({ persistSuspended: true });
      try {
        localStorage.clear();
        await clearAllImages();
      } finally {
        // Blank project = the gate: no active store, no sets.
        set((s) => ({
          activeStore: null,
          sets: {},
          exportFormat: 'png',
          persistSuspended: false,
          imagesVersion: s.imagesVersion + 1,
        }));
        // Persist blank immediately so a pagehide flush right after writes the
        // same default rather than racing the debounce.
        saveProjectLocal({ activeStore: null, sets: {}, exportFormat: 'png' });
      }
    },
  };
});
