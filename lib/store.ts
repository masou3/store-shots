import { create } from 'zustand';
import type { Orientation, Slide, SlideBackground, SlideLayout, TextStyleOverride, Theme } from './types';
import {
  applyLayout,
  defaultLayoutFor,
  getLayout,
  layoutAllowedIn,
  slideLayoutFor,
  type LayoutId,
} from './layouts';
import { clearAllImages, ensureBitmap, getImageBlob, removeImage, saveImage } from './imageStore';
import {
  STORE_KINDS,
  capFor,
  cloneOrientationFor,
  otherStore,
  type StoreKind,
} from './storeKinds';
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
    accentColour: '#fbbf24',
    glow: 0,
    glowColour: '#000000',
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

// What a slide inserted next to `anchorId` should inherit — the anchor's own
// layout AND orientation, so adding a screen keeps the one you were just
// looking at. With no anchor it falls back to the set's default orientation,
// which is how a wholly-landscape set stays landscape without touching the
// per-slide toggle each time.
function inheritFromAnchor(
  slides: Slide[],
  anchorId: string,
  defaultOrientation?: Orientation,
): Pick<Slide, 'layout' | 'layoutId' | 'orientation'> {
  const anchor = slides.find((s) => s.id === anchorId);
  return anchor
    ? {
        layout: anchor.layout,
        layoutId: anchor.layoutId,
        orientation: anchor.orientation ?? defaultOrientation,
      }
    : {
        layout: slideLayoutFor(DEFAULT_LAYOUT),
        layoutId: DEFAULT_LAYOUT,
        orientation: defaultOrientation,
      };
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
  const keys = new Set<string>();
  for (const s of Object.values(sets)) {
    if (!s) continue;
    for (const sl of s.slides) {
      if (sl.imageKey) keys.add(sl.imageKey);
      if (sl.bg?.imageKey) keys.add(sl.bg.imageKey);
    }
    if (s.theme.panorama?.imageKey) keys.add(s.theme.panorama.imageKey);
  }
  if (keys.size === 0) return;
  Promise.all([...keys].map((k) => ensureBitmap(k))).then(done);
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
  cloneTo: (to: StoreKind) => Promise<void>; // copy the active set into another kind

  setSizeId: (id: string) => void;
  setLayoutId: (id: LayoutId) => void; // applies the preset to the selected slides
  patchTheme: (p: Partial<Theme>) => void;
  patchGradient: (p: Partial<Theme['gradient']>) => void;
  patchText: (p: Partial<Theme['text']>) => void; // set-wide type metrics (family/size/…)
  patchTextStyle: (p: Partial<TextStyleOverride>) => void; // per-slide text look on the selected slides
  applyTextStyleToAll: () => void; // broadcast the current slide's text look to every slide
  applyPhoneGlowToAll: () => void; // broadcast the current slide's device glow to every slide
  patchLayout: (p: Partial<SlideLayout>) => void; // patches the selected slides' layout
  setSlideOrientation: (o: Orientation) => void; // portrait/landscape on the selected slides
  setDefaultOrientation: (o: Orientation) => void; // orientation seeded onto NEW slides in this set
  patchSlide: (id: string, p: Partial<Slide>) => void;
  setBackgroundImage: (key: string) => void; // sets a bg photo on the selected slides
  clearBackgroundImage: () => void; // removes the bg photo from the selected slides
  patchBackground: (p: Partial<Omit<SlideBackground, 'imageKey'>>) => void; // blur / darken
  setPanoramaImage: (key: string) => void; // set-wide photo spanning all screens
  clearPanorama: () => void;
  patchPanorama: (p: Partial<Omit<SlideBackground, 'imageKey'>>) => void; // blur / darken
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

    cloneTo: async (to) => {
      const state = get();
      const from = state.activeStore;
      if (!from || from === to) return;
      const src = state.sets[from];
      if (!src) return;
      const cfg = STORE_KINDS[to];
      // A cross-CLASS clone (phone <-> tablet) cannot carry the composition.
      // The clone logic was built for two portrait canvases of similar
      // proportion; 1320x2868 to 2064x2752 is a different shape of problem, and
      // a layout tuned against one lands wrong on the other. Screenshots go too:
      // a 20:9 phone capture cover-cropped into a 4:3 tablet screen is not a
      // tablet screenshot, it is a mangled phone one. So the cross-class clone
      // carries the LOOK — gradient, colours, type, grain, texture — plus the
      // words, and rebuilds everything positional from the target's defaults.
      const crossClass = STORE_KINDS[from].deviceClass !== cfg.deviceClass;
      // The target's OWN default orientation, read before it is replaced. On a
      // cross-class clone this is what the incoming slides adopt, so it has to
      // survive the replacement too — overwriting it with the source's default
      // would wipe the setting the clone is supposed to be honouring, and the
      // second clone into the same target would then behave differently from
      // the first.
      const targetDefault = state.sets[to]?.defaultOrientation;

      // Truncate to the target's cap, cutting from the END — slide 1 matters
      // most in both stores, so the tail is what goes. App Store (10) → Play
      // (8) drops 9 and 10; Play → App Store never truncates (8 fits in 10).
      // Dropped slides' images are never duplicated.
      const kept = src.slides.slice(0, capFor(to).max);

      // Duplicate images under NEW keys — two independent sets, no shared blob.
      // Both the screenshot and the background photo count. Skipped entirely
      // for a cross-class clone, which carries no imagery at all.
      const keyMap = new Map<string, string>();
      if (!crossClass) {
        for (const sl of kept) {
          for (const key of [sl.imageKey, sl.bg?.imageKey]) {
            if (key && !keyMap.has(key)) {
              const blob = await getImageBlob(key);
              if (blob) keyMap.set(key, await saveImage(blob));
            }
          }
        }
      }
      const slides: Slide[] = kept.map((sl) => {
        // Same-class keeps the source's orientation; cross-class adopts the
        // target set's default, since the composition is discarded anyway and
        // the orientation a tablet set wants belongs to that set rather than
        // to the phone set it was seeded from. See cloneOrientationFor.
        const orientation = cloneOrientationFor(crossClass, sl.orientation, targetDefault);
        const layoutId = crossClass
          ? defaultLayoutFor(orientation ?? 'portrait')
          : sl.layoutId;
        return {
          id: crypto.randomUUID(),
          headline: sl.headline,
          subhead: sl.subhead,
          imageKey: sl.imageKey ? keyMap.get(sl.imageKey) : undefined,
          bg:
            sl.bg && keyMap.has(sl.bg.imageKey)
              ? { ...sl.bg, imageKey: keyMap.get(sl.bg.imageKey)! }
              : undefined,
          // Per-slide text colour/accent/glow is part of the look, not the
          // composition, so it crosses classes with the theme.
          textStyle: sl.textStyle,
          // Cross-class rebuilds the layout from the preset, which also drops
          // the drag nudges (textOffsetX/Y, deviceOffsetX/Y) baked into the
          // source — those are pixel offsets measured against a canvas that no
          // longer exists, and carrying them lands things visibly crooked.
          layout: crossClass ? slideLayoutFor(layoutId) : sl.layout,
          layoutId,
          orientation,
        };
      });
      // Duplicate the set-wide panorama too, under its own new key. Cross-class
      // drops it with the rest of the imagery — a panorama is fitted to a
      // specific canvas width across a specific slide count.
      let panorama = crossClass ? undefined : src.theme.panorama;
      if (panorama) {
        const blob = await getImageBlob(panorama.imageKey);
        panorama = blob ? { ...panorama, imageKey: await saveImage(blob) } : undefined;
      }
      // Swap device to the target's (keep 'none' — valid in both stores).
      const frameId = src.theme.frameId === 'none' ? 'none' : cfg.defaultFrameId;
      const theme: Theme = {
        ...src.theme,
        panorama,
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
        defaultOrientation: crossClass
          ? (targetDefault ?? src.defaultOrientation)
          : src.defaultOrientation,
      };
      // Re-clone overwrites: drop the old target's orphaned blobs (screenshots,
      // background photos and its panorama).
      const oldKeys = [
        ...(state.sets[to]?.slides.flatMap((s) => [s.imageKey, s.bg?.imageKey]) ?? []),
        state.sets[to]?.theme.panorama?.imageKey,
      ].filter(Boolean) as string[] | undefined;
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
    patchTextStyle: (p) =>
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) =>
            ids.has(sl.id) ? { ...sl, textStyle: { ...sl.textStyle, ...p } } : sl,
          ),
        };
      }),
    applyTextStyleToAll: () =>
      updateActive((s) => {
        const cur = s.slides.find((sl) => sl.id === s.currentSlideId) ?? s.slides[0];
        const t = s.theme.text;
        // The current slide's *effective* look (its override, or the set-wide
        // default), stamped onto every slide so they all match.
        const look: TextStyleOverride = {
          colour: cur.textStyle?.colour ?? t.colour,
          accentColour: cur.textStyle?.accentColour ?? t.accentColour,
          glow: cur.textStyle?.glow ?? t.glow,
          glowColour: cur.textStyle?.glowColour ?? t.glowColour,
        };
        return { slides: s.slides.map((sl) => ({ ...sl, textStyle: { ...look } })) };
      }),
    applyPhoneGlowToAll: () =>
      updateActive((s) => {
        const cur = s.slides.find((sl) => sl.id === s.currentSlideId) ?? s.slides[0];
        const glowStrength = cur.layout.glowStrength ?? 0;
        const glowColour = cur.layout.glowColour ?? '#7c3aed';
        return {
          slides: s.slides.map((sl) => ({
            ...sl,
            layout: { ...sl.layout, glowStrength, glowColour },
          })),
        };
      }),
    patchLayout: (p) =>
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) =>
            ids.has(sl.id) ? { ...sl, layout: { ...sl.layout, ...p } } : sl,
          ),
        };
      }),
    // Turning a slide also re-homes its layout when the current one isn't
    // offered in the new orientation — `angled` going landscape, or side text
    // coming back to portrait. Without this a slide keeps a layout the preset
    // list no longer shows, which looks like a bug in the picker rather than a
    // consequence of the turn. Layouts valid in both orientations are kept.
    setSlideOrientation: (o) =>
      updateActive((s) => {
        const ids = new Set(targetIds(s));
        return {
          slides: s.slides.map((sl) => {
            if (!ids.has(sl.id)) return sl;
            if (layoutAllowedIn(sl.layoutId, o)) return { ...sl, orientation: o };
            const id = defaultLayoutFor(o);
            return { ...sl, orientation: o, layoutId: id, layout: applyLayout(sl.layout, getLayout(id)) };
          }),
        };
      }),
    // Seed only: existing slides keep whatever they already carry, so flipping
    // the set default never silently re-orients work already laid out.
    setDefaultOrientation: (o) => updateActive(() => ({ defaultOrientation: o })),
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
    setPanoramaImage: (key) => {
      const kind = get().activeStore;
      const prev = kind ? get().sets[kind]?.theme.panorama?.imageKey : undefined;
      updateActive((s) => ({
        theme: {
          ...s.theme,
          panorama: {
            imageKey: key,
            blur: s.theme.panorama?.blur ?? 0,
            darken: s.theme.panorama?.darken ?? 0,
          },
        },
      }));
      // The panorama blob is never shared with a slide, so a replaced key is
      // always safe to drop.
      if (prev && prev !== key) void removeImage(prev);
    },
    clearPanorama: () => {
      const kind = get().activeStore;
      const prev = kind ? get().sets[kind]?.theme.panorama?.imageKey : undefined;
      updateActive((s) => {
        const theme = { ...s.theme };
        delete theme.panorama;
        return { theme };
      });
      if (prev) void removeImage(prev);
    },
    patchPanorama: (p) =>
      updateActive((s) =>
        s.theme.panorama
          ? { theme: { ...s.theme, panorama: { ...s.theme.panorama, ...p } } }
          : {},
      ),
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
        const slide = newSlide(inheritFromAnchor(s.slides, s.currentSlideId, s.defaultOrientation));
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
        const inherited = inheritFromAnchor(s.slides, s.currentSlideId, s.defaultOrientation);
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
