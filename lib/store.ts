import { create } from 'zustand';
import type { Slide, SlideBackground, SlideLayout, Theme } from './types';
import { applyLayout, getLayout, slideLayoutFor, type LayoutId } from './layouts';
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
};

const DEFAULT_LAYOUT: LayoutId = 'top-text-crop';

// New slides carry their own layout. `partial` may override it (e.g. inherit
// the current slide's layout on insert); otherwise it seeds from DEFAULT.
function newSlide(partial?: Partial<Slide>): Slide {
  return {
    id: crypto.randomUUID(),
    headline: '',
    layout: slideLayoutFor(DEFAULT_LAYOUT),
    layoutId: DEFAULT_LAYOUT,
    ...partial,
  };
}

// The layout a slide inserted next to `anchorId` should inherit — the anchor's
// own, so adding a screen keeps the layout you were just looking at.
function inheritLayout(slides: Slide[], anchorId: string): Pick<Slide, 'layout' | 'layoutId'> {
  const anchor = slides.find((s) => s.id === anchorId);
  return anchor
    ? { layout: anchor.layout, layoutId: anchor.layoutId }
    : { layout: slideLayoutFor(DEFAULT_LAYOUT), layoutId: DEFAULT_LAYOUT };
}

export function defaultSet(kind: StoreKind, seedText = false): SetState {
  const cfg = STORE_KINDS[kind];
  const theme: Theme = {
    ...BASE_THEME,
    sizeId: cfg.defaultSizeId,
    frameId: cfg.defaultFrameId,
    lastFrameId: cfg.defaultFrameId,
  };
  const first = seedText
    ? newSlide({ headline: 'Track every rep.', subhead: 'Sets, reps and PRs logged in one tap.' })
    : newSlide();
  return {
    theme,
    slides: [first],
    currentSlideId: first.id,
    sizeId: cfg.defaultSizeId,
    exportSizeIds: [cfg.defaultSizeId],
  };
}

function decodeSlideImages(slides: Slide[], done: () => void): void {
  const keys = slides
    .flatMap((s) => [s.imageKey, s.bg?.imageKey])
    .filter((k): k is string => Boolean(k));
  if (keys.length === 0) return;
  // A key with no blob keeps its slide's text and renders an empty screen —
  // ensureBitmap resolves false, nothing throws.
  Promise.all(keys.map((k) => ensureBitmap(k))).then(done);
}

// Delete image blobs that no longer appear as any slide's screenshot or
// background. Background photos can be shared across slides (one upload applied
// to several), so a replaced/deleted key must be reference-checked, unlike the
// 1:1 screenshot keys.
function removeOrphanImages(candidates: Array<string | undefined>, slides: Slide[]): void {
  const used = new Set<string>();
  for (const sl of slides) {
    if (sl.imageKey) used.add(sl.imageKey);
    if (sl.bg?.imageKey) used.add(sl.bg.imageKey);
  }
  for (const k of candidates) {
    if (k && !used.has(k)) void removeImage(k);
  }
}

function decodeAllSets(sets: Partial<Record<StoreKind, SetState>>, done: () => void): void {
  const all = Object.values(sets).flatMap((s) => (s ? s.slides : []));
  decodeSlideImages(all, done);
}

type StoreState = {
  activeStore: StoreKind | null; // null = the gate (no set chosen yet)
  sets: Partial<Record<StoreKind, SetState>>;
  // Ephemeral multi-selection of slides in the active set. Never persisted;
  // empty means "just the current slide" (see targetIds). Layout/device edits
  // apply to every slide in this set.
  selectedIds: string[];
  exportFormat: 'png' | 'jpeg';
  imagesVersion: number;
  hydrated: boolean;
  persistSuspended: boolean;

  chooseStore: (kind: StoreKind) => void;
  switchStore: (kind: StoreKind) => void;
  cloneToOther: () => Promise<void>;

  setSizeId: (id: string) => void;
  setLayoutId: (id: LayoutId) => void; // applies the preset to the selected slides
  patchTheme: (p: Partial<Theme>) => void;
  patchGradient: (p: Partial<Theme['gradient']>) => void;
  patchText: (p: Partial<Theme['text']>) => void;
  patchLayout: (p: Partial<SlideLayout>) => void; // patches the selected slides' layout
  patchSlide: (id: string, p: Partial<Slide>) => void;
  setBackgroundImage: (key: string) => void; // sets a bg photo on the selected slides
  clearBackgroundImage: () => void; // removes the bg photo from the selected slides
  patchBackground: (p: Partial<Omit<SlideBackground, 'imageKey'>>) => void; // blur / darken
  selectSlide: (id: string) => void; // single-select + make current
  toggleSlideSelection: (id: string) => void; // cmd/ctrl-click
  selectRange: (id: string) => void; // shift-click from the current anchor
  selectAllSlides: () => void;
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

  // The slides a layout/device edit targets: the multi-selection, or the
  // current slide alone when nothing is explicitly selected.
  const targetIds = (s: SetState): string[] => {
    const sel = get().selectedIds;
    return sel.length ? sel : [s.currentSlideId];
  };

  return {
    activeStore: null,
    sets: {},
    selectedIds: [],
    exportFormat: 'png',
    imagesVersion: 0,
    hydrated: false,
    persistSuspended: false,

    chooseStore: (kind) =>
      set((state) => {
        if (state.sets[kind]) return { activeStore: kind, selectedIds: [] };
        return {
          activeStore: kind,
          selectedIds: [],
          sets: { ...state.sets, [kind]: defaultSet(kind, true) },
        };
      }),
    switchStore: (kind) =>
      set((state) => (state.sets[kind] ? { activeStore: kind, selectedIds: [] } : {})),

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
      // Both the screenshot and the background photo count.
      const keyMap = new Map<string, string>();
      for (const sl of kept) {
        for (const src of [sl.imageKey, sl.bg?.imageKey]) {
          if (src && !keyMap.has(src)) {
            const blob = await getImageBlob(src);
            if (blob) keyMap.set(src, await saveImage(blob));
          }
        }
      }
      const slides: Slide[] = kept.map((sl) => ({
        id: crypto.randomUUID(),
        headline: sl.headline,
        subhead: sl.subhead,
        imageKey: sl.imageKey ? keyMap.get(sl.imageKey) : undefined,
        bg:
          sl.bg && keyMap.has(sl.bg.imageKey)
            ? { ...sl.bg, imageKey: keyMap.get(sl.bg.imageKey)! }
            : undefined,
        layout: sl.layout,
        layoutId: sl.layoutId,
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
        slides,
        currentSlideId: slides[0].id,
        sizeId: cfg.defaultSizeId,
        exportSizeIds: [cfg.defaultSizeId],
      };
      // Re-clone overwrites: drop the old target's orphaned blobs (screenshots
      // and background photos).
      const oldKeys = state.sets[to]?.slides
        .flatMap((s) => [s.imageKey, s.bg?.imageKey])
        .filter(Boolean) as string[] | undefined;
      set((s) => ({ sets: { ...s.sets, [to]: newSet }, activeStore: to, selectedIds: [] }));
      oldKeys?.forEach((k) => void removeImage(k));
      get().bumpImages();
    },

    setSizeId: (id) => updateActive((s) => ({ sizeId: id, theme: { ...s.theme, sizeId: id } })),
    setLayoutId: (id) =>
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        const preset = getLayout(id);
        return {
          slides: s.slides.map((sl) =>
            ids.has(sl.id) ? { ...sl, layoutId: id, layout: applyLayout(sl.layout, preset) } : sl,
          ),
        };
      }),
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
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) =>
            ids.has(sl.id) ? { ...sl, layout: { ...sl.layout, ...p } } : sl,
          ),
        };
      }),
    patchSlide: (id, p) =>
      updateActive((s) => ({ slides: s.slides.map((sl) => (sl.id === id ? { ...sl, ...p } : sl)) })),
    setBackgroundImage: (key) => {
      const replaced: string[] = [];
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) => {
            if (!ids.has(sl.id)) return sl;
            if (sl.bg?.imageKey && sl.bg.imageKey !== key) replaced.push(sl.bg.imageKey);
            return { ...sl, bg: { imageKey: key, blur: sl.bg?.blur ?? 0, darken: sl.bg?.darken ?? 0 } };
          }),
        };
      });
      const kind = get().activeStore;
      removeOrphanImages(replaced, (kind && get().sets[kind]?.slides) || []);
    },
    clearBackgroundImage: () => {
      const removed: string[] = [];
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) => {
            if (!ids.has(sl.id) || !sl.bg) return sl;
            removed.push(sl.bg.imageKey);
            const next = { ...sl };
            delete next.bg;
            return next;
          }),
        };
      });
      const kind = get().activeStore;
      removeOrphanImages(removed, (kind && get().sets[kind]?.slides) || []);
    },
    patchBackground: (p) =>
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) =>
            ids.has(sl.id) && sl.bg ? { ...sl, bg: { ...sl.bg, ...p } } : sl,
          ),
        };
      }),
    selectSlide: (id) => {
      updateActive(() => ({ currentSlideId: id }));
      set({ selectedIds: [id] });
    },
    toggleSlideSelection: (id) => {
      const cur = get();
      const kind = cur.activeStore;
      const setState = kind ? cur.sets[kind] : undefined;
      if (!setState) return;
      const base = cur.selectedIds.length ? cur.selectedIds : [setState.currentSlideId];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      // Never leave an empty selection; make the toggled slide the new anchor.
      if (next.length === 0) return;
      updateActive(() => ({ currentSlideId: id }));
      set({ selectedIds: next });
    },
    selectRange: (id) => {
      const cur = get();
      const kind = cur.activeStore;
      const setState = kind ? cur.sets[kind] : undefined;
      if (!setState) return;
      const a = setState.slides.findIndex((sl) => sl.id === setState.currentSlideId);
      const b = setState.slides.findIndex((sl) => sl.id === id);
      if (a < 0 || b < 0) return;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      set({ selectedIds: setState.slides.slice(lo, hi + 1).map((sl) => sl.id) });
    },
    selectAllSlides: () => {
      const cur = get();
      const kind = cur.activeStore;
      const setState = kind ? cur.sets[kind] : undefined;
      if (!setState) return;
      set({ selectedIds: setState.slides.map((sl) => sl.id) });
    },
    addSlide: () =>
      updateActive((s) => {
        const kind = get().activeStore;
        if (!kind || s.slides.length >= capFor(kind).max) return {};
        const slide = newSlide(inheritLayout(s.slides, s.currentSlideId));
        const idx = s.slides.findIndex((sl) => sl.id === s.currentSlideId);
        const slides = [...s.slides];
        slides.splice(idx + 1, 0, slide);
        return { slides, currentSlideId: slide.id };
      }),
    deleteSlide: (id) => {
      let victimBg: string | undefined;
      updateActive((s) => {
        const victim = s.slides.find((sl) => sl.id === id);
        if (victim?.imageKey) void removeImage(victim.imageKey);
        victimBg = victim?.bg?.imageKey;
        let slides = s.slides.filter((sl) => sl.id !== id);
        if (slides.length === 0) slides = [newSlide()];
        const currentSlideId =
          s.currentSlideId === id
            ? slides[Math.min(s.slides.findIndex((sl) => sl.id === id), slides.length - 1)].id
            : s.currentSlideId;
        return { slides, currentSlideId };
      });
      // Drop the deleted slide from any live selection.
      set((st) => ({ selectedIds: st.selectedIds.filter((x) => x !== id) }));
      // The bg photo may be shared with another slide — only drop it if orphaned.
      const kind = get().activeStore;
      removeOrphanImages([victimBg], (kind && get().sets[kind]?.slides) || []);
    },
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
        const inherited = inheritLayout(s.slides, s.currentSlideId);
        const start = Math.max(0, slides.findIndex((sl) => sl.id === s.currentSlideId));
        keys.forEach((key, i) => {
          const idx = start + i;
          if (idx < slides.length) {
            if (slides[idx].imageKey) replaced.push(slides[idx].imageKey!);
            slides[idx] = { ...slides[idx], imageKey: key };
          } else {
            slides.push(newSlide({ imageKey: key, ...inherited }));
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
      set({ ...snap, selectedIds: [] });
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
          selectedIds: [],
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
