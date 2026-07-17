// In-memory decoded bitmaps, keyed by screenshotKey. Blobs live in IndexedDB
// (step 6); decoding on every render would make the sliders lag.
const bitmaps = new Map<string, ImageBitmap>();

export function getBitmap(key: string): ImageBitmap | null {
  return bitmaps.get(key) ?? null;
}

export function setBitmap(key: string, bmp: ImageBitmap): void {
  bitmaps.get(key)?.close();
  bitmaps.set(key, bmp);
}

export function deleteBitmap(key: string): void {
  bitmaps.get(key)?.close();
  bitmaps.delete(key);
}

export function clearBitmaps(): void {
  for (const b of bitmaps.values()) b.close();
  bitmaps.clear();
}
