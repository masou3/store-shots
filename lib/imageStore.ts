import { clear, createStore, del, get, set } from 'idb-keyval';
import { clearBitmaps, deleteBitmap, getBitmap, setBitmap } from './images';

// Image blobs live in IndexedDB, keyed off Slide.imageKey. Config stays in
// localStorage; no image data goes near localStorage, ever.
const store =
  typeof indexedDB !== 'undefined' ? createStore('storeshots', 'images') : undefined;

export async function saveImage(blob: Blob): Promise<string> {
  const key = crypto.randomUUID();
  await set(key, blob, store);
  setBitmap(key, await createImageBitmap(blob));
  return key;
}

export async function removeImage(key: string): Promise<void> {
  await del(key, store);
  deleteBitmap(key);
}

// Store a blob under a KNOWN key — project import must preserve the keys the
// slides reference.
export async function saveImageAs(key: string, blob: Blob): Promise<void> {
  await set(key, blob, store);
  setBitmap(key, await createImageBitmap(blob));
}

export async function getImageBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key, store);
}

// Empty the blob store and the decoded cache. clear() keeps the database but
// removes every record — deleteDatabase would block on the page's own open
// connection.
export async function clearAllImages(): Promise<void> {
  await clear(store);
  clearBitmaps();
}

// Decode a stored blob into the in-memory bitmap cache. Returns false if the
// key has no blob behind it (e.g. IndexedDB was cleared).
export async function ensureBitmap(key: string): Promise<boolean> {
  if (getBitmap(key)) return true;
  const blob = await get<Blob>(key, store);
  if (!blob) return false;
  setBitmap(key, await createImageBitmap(blob));
  return true;
}
