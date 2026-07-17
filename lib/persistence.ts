import type { Slide, Theme } from './types';
import type { LayoutId } from './layouts';
import { STORE_KINDS, capFor, storeKindForSizeId, type StoreKind } from './storeKinds';
import { getImageBlob, saveImageAs } from './imageStore';

// Project config lives in localStorage; image blobs stay in IndexedDB. No
// image data goes near localStorage, ever.
const LS_PROJECT = 'storeshots:project';

// Everything that was "project-level" before the two-store split — one per set.
export type SetState = {
  theme: Theme;
  layoutId: LayoutId;
  slides: Slide[];
  currentSlideId: string;
  sizeId: string; // preview preset, in this set's store
  exportSizeIds: string[];
};

export type ProjectSnapshot = {
  activeStore: StoreKind | null;
  sets: Partial<Record<StoreKind, SetState>>;
  exportFormat: 'png' | 'jpeg';
};

// The .json backup: the snapshot plus every referenced image inlined as a data
// URL. Personal backup, not a wire format.
export type ProjectFile = ProjectSnapshot & {
  version: 2;
  images: Record<string, string>;
};

// A v1 file/snapshot was a single project-level object (pre-store-split).
type V1Shape = {
  version?: 1;
  theme: Theme;
  slides: Slide[];
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
  const setState: SetState = clampSetToCap(
    {
      theme: v1.theme,
      layoutId: v1.layoutId ?? 'top-text-crop',
      slides: v1.slides,
      currentSlideId:
        v1.currentSlideId && v1.slides.some((s) => s.id === v1.currentSlideId)
          ? v1.currentSlideId
          : v1.slides[0].id,
      sizeId,
      exportSizeIds: v1.exportSizeIds ?? [STORE_KINDS[kind].defaultSizeId],
    },
    kind,
  );
  return { activeStore: kind, sets: { [kind]: setState }, exportFormat: v1.exportFormat ?? 'png' };
}

function normalizeSnapshot(o: unknown): ProjectSnapshot | null {
  if (isV1(o)) return migrateV1(o);
  const x = o as ProjectSnapshot;
  if (!x || typeof x !== 'object' || !('sets' in x)) return null;
  const sets: Partial<Record<StoreKind, SetState>> = {};
  for (const kind of Object.keys(x.sets ?? {}) as StoreKind[]) {
    const s = x.sets[kind];
    if (s) sets[kind] = clampSetToCap(s, kind);
  }
  return {
    activeStore: x.activeStore ?? null,
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
  for (const s of allSlides(snap)) {
    if (!s.imageKey || images[s.imageKey]) continue;
    const blob = await getImageBlob(s.imageKey);
    if (blob) images[s.imageKey] = await blobToDataUrl(blob);
  }
  return { version: 2, ...snap, images };
}

export function parseProjectFile(text: string): ProjectFile {
  const parsed = JSON.parse(text) as { version?: number; images?: Record<string, string> };
  const snap = normalizeSnapshot(parsed);
  if (!snap) throw new Error('Not a Store Shots project file');
  return { version: 2, ...snap, images: parsed.images ?? {} };
}

// Write every inlined image back to IndexedDB under its original key and
// decode it into the bitmap cache.
export async function restoreProjectImages(file: ProjectFile): Promise<void> {
  for (const [key, dataUrl] of Object.entries(file.images ?? {})) {
    const blob = await (await fetch(dataUrl)).blob();
    await saveImageAs(key, blob);
  }
}
