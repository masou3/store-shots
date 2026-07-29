import type { Orientation, Slide, SlideLayout, Theme } from './types';
import type { LayoutId } from './layouts';
import { BASE_SLIDE_LAYOUT } from './layouts';
import { STORE_KINDS, STORE_ORDER, capFor, storeKindForSizeId, type StoreKind } from './storeKinds';
import { getImageBlob, saveImageAs } from './imageStore';

// Project config lives in localStorage; image blobs stay in IndexedDB. No
// image data goes near localStorage, ever.
const LS_PROJECT = 'storeshots:project';

// Everything that was "project-level" before the two-store split — one per set.
// Layout is per-slide (on Slide), not here.
export type SetState = {
  theme: Theme;
  slides: Slide[];
  currentSlideId: string;
  sizeId: string; // preview preset, in this set's store
  exportSizeIds: string[];
  // Orientation given to NEW slides in this set, so a wholly-landscape set
  // (a tablet app whose feature only exists in landscape) doesn't need the
  // per-slide toggle flipped every time. Per-slide orientation still wins;
  // this is only the seed. Undefined = portrait.
  defaultOrientation?: Orientation;
};

// A set as it may sit on disk: pre-per-slide-layout snapshots (and v1 files)
// carried layout on the theme and a single layoutId on the set, with slides
// that had no layout of their own. migrateSetLayout lifts those onto slides.
type LegacyTheme = Theme & { layout?: SlideLayout };
type LegacySlide = Omit<Slide, 'layout' | 'layoutId'> & Partial<Pick<Slide, 'layout' | 'layoutId'>>;
type LegacySet = {
  theme: LegacyTheme;
  layoutId?: LayoutId;
  slides: LegacySlide[];
  currentSlideId: string;
  sizeId: string;
  exportSizeIds: string[];
};

// Idempotent: slides that already carry a layout are left alone; the rest
// inherit the legacy set-wide layout (theme.layout + set.layoutId), and the
// dead theme.layout is stripped.
function migrateSetLayout(raw: LegacySet): SetState {
  const fallbackLayout = raw.theme.layout ?? BASE_SLIDE_LAYOUT;
  const fallbackLayoutId = raw.layoutId ?? 'top-text-crop';
  const slides: Slide[] = raw.slides.map((sl) =>
    sl.layout && sl.layoutId
      ? (sl as Slide)
      : { ...sl, layout: sl.layout ?? fallbackLayout, layoutId: sl.layoutId ?? fallbackLayoutId },
  );
  const theme = { ...raw.theme };
  delete theme.layout;
  return {
    theme,
    slides,
    currentSlideId: raw.currentSlideId,
    sizeId: raw.sizeId,
    exportSizeIds: raw.exportSizeIds,
  };
}

export type ProjectSnapshot = {
  activeStore: StoreKind | null;
  sets: Partial<Record<StoreKind, SetState>>;
  exportFormat: 'png' | 'jpeg';
};

// The .json backup: the snapshot plus every referenced image inlined as a data
// URL. Personal backup, not a wire format.
//
// v3 split each store's set by device class, so `sets` gained the two tablet
// keys. v2 files predate that: their appStore/playStore keys are phone sets
// UNLESS the set's own sizeId says otherwise (a v2 user could point a phone
// set's preview at iPad, since ipad-13 was in the App Store preset list).
export type ProjectFile = ProjectSnapshot & {
  version: 3;
  images: Record<string, string>;
};

// A v1 file/snapshot was a single project-level object (pre-store-split).
type V1Shape = {
  version?: 1;
  theme: LegacyTheme;
  slides: LegacySlide[];
  currentSlideId?: string;
  sizeId?: string;
  layoutId?: LayoutId;
  exportSizeIds?: string[];
  exportFormat?: 'png' | 'jpeg';
  images?: Record<string, string>;
};

function isV1(o: unknown): o is V1Shape {
  const x = o as Record<string, unknown>;
  return !!x && !('sets' in x) && 'theme' in x && Array.isArray(x.slides);
}

// Over-cap sets can only arrive via import or v1 migration (Add caps, clone
// truncates, the gate scopes presets). Clamp them to the store cap here, so
// nothing over-cap ever reaches the store and the export guard stays a
// backstop that the UI can't trip.
function clampSetToCap(s: SetState, kind: StoreKind): SetState {
  const max = capFor(kind).max;
  if (s.slides.length <= max) return s;
  const slides = s.slides.slice(0, max);
  const currentSlideId = slides.some((sl) => sl.id === s.currentSlideId)
    ? s.currentSlideId
    : slides[0].id;
  return { ...s, slides, currentSlideId };
}

// Wrap a v1 project as whichever set its primary preset (sizeId) matches.
function migrateV1(v1: V1Shape): ProjectSnapshot {
  const sizeId = v1.sizeId ?? 'ios-6.9';
  const kind = storeKindForSizeId(sizeId);
  const raw: LegacySet = {
    theme: v1.theme,
    layoutId: v1.layoutId,
    slides: v1.slides,
    currentSlideId:
      v1.currentSlideId && v1.slides.some((s) => s.id === v1.currentSlideId)
        ? v1.currentSlideId
        : v1.slides[0].id,
    sizeId,
    exportSizeIds: v1.exportSizeIds ?? [STORE_KINDS[kind].defaultSizeId],
  };
  // Route through the same kind resolution as v2 so a v1 project whose sizeId
  // was a tablet preset lands in the tablet set, not the phone one.
  const { kind: resolved, set } = migrateSetKind(migrateSetLayout(raw));
  return {
    activeStore: resolved,
    sets: { [resolved]: clampSetToCap(set, resolved) },
    exportFormat: v1.exportFormat ?? 'png',
  };
}

// v2 -> v3. A v2 set is keyed by store only, so its device class has to be
// recovered from its own sizeId: a set previewing ipad-13 was really a tablet
// set living under the appStore key, and belongs at appStoreTablet.
//
// Export presets are then filtered to the resolved kind. A v2 phone set could
// tick ipad-13 for export; there is no phone-set home for that preset once the
// classes split, and inventing a tablet set from phone slides would be a
// cross-class clone — which deliberately does not preserve layout. So the tick
// is dropped rather than guessed at, and the user re-adds it as a real iPad set.
function migrateSetKind(s: SetState): { kind: StoreKind; set: SetState } {
  let kind: StoreKind;
  try {
    kind = storeKindForSizeId(s.sizeId);
  } catch {
    kind = 'appStore'; // unknown/removed preset: fall back rather than throw
  }
  const allowed = STORE_KINDS[kind].presetIds;
  const exportSizeIds = (s.exportSizeIds ?? []).filter((id) => allowed.includes(id));
  return {
    kind,
    set: {
      ...s,
      sizeId: allowed.includes(s.sizeId) ? s.sizeId : STORE_KINDS[kind].defaultSizeId,
      exportSizeIds: exportSizeIds.length > 0 ? exportSizeIds : [STORE_KINDS[kind].defaultSizeId],
    },
  };
}

function normalizeSnapshot(o: unknown): ProjectSnapshot | null {
  if (isV1(o)) return migrateV1(o);
  const x = o as ProjectSnapshot;
  if (!x || typeof x !== 'object' || !('sets' in x)) return null;
  const sets: Partial<Record<StoreKind, SetState>> = {};
  for (const key of Object.keys(x.sets ?? {}) as StoreKind[]) {
    const raw = x.sets[key];
    if (!raw) continue;
    const { kind, set } = migrateSetKind(migrateSetLayout(raw as unknown as LegacySet));
    // Two v2 keys can't collide here (each resolves from its own sizeId, and
    // the two stores' presets are disjoint), but if a hand-edited file makes
    // them, first write wins rather than silently losing slides.
    if (!sets[kind]) sets[kind] = clampSetToCap(set, kind);
  }
  const activeStore =
    x.activeStore && sets[x.activeStore]
      ? x.activeStore
      : (STORE_ORDER.find((k) => sets[k]) ?? null);
  return {
    activeStore,
    sets,
    exportFormat: x.exportFormat ?? 'png',
  };
}

export function saveProjectLocal(snap: ProjectSnapshot): void {
  localStorage.setItem(LS_PROJECT, JSON.stringify(snap));
}

export function loadProjectLocal(): ProjectSnapshot | null {
  const raw = localStorage.getItem(LS_PROJECT);
  if (!raw) return null;
  try {
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function allSlides(snap: ProjectSnapshot): Slide[] {
  return Object.values(snap.sets).flatMap((s) => (s ? s.slides : []));
}

export async function buildProjectFile(snap: ProjectSnapshot): Promise<ProjectFile> {
  const images: Record<string, string> = {};
  const inline = async (key: string | undefined) => {
    if (!key || images[key]) return;
    const blob = await getImageBlob(key);
    if (blob) images[key] = await blobToDataUrl(blob);
  };
  // Screenshots and per-slide background photos, deduped by key.
  for (const s of allSlides(snap)) {
    await inline(s.imageKey);
    await inline(s.bg?.imageKey);
  }
  // Each set's set-wide panorama photo.
  for (const set of Object.values(snap.sets)) {
    await inline(set?.theme.panorama?.imageKey);
  }
  return { version: 3, ...snap, images };
}

export function parseProjectFile(text: string): ProjectFile {
  const parsed = JSON.parse(text) as { version?: number; images?: Record<string, string> };
  const snap = normalizeSnapshot(parsed);
  if (!snap) throw new Error('Not a Store Shots project file');
  return { version: 3, ...snap, images: parsed.images ?? {} };
}

// Write every inlined image back to IndexedDB under its original key and
// decode it into the bitmap cache.
export async function restoreProjectImages(file: ProjectFile): Promise<void> {
  for (const [key, dataUrl] of Object.entries(file.images ?? {})) {
    const blob = await (await fetch(dataUrl)).blob();
    await saveImageAs(key, blob);
  }
}
