import { encode } from 'fast-png';

// canvas.toBlob('image/png') always writes RGBA (colour type 6) and both
// stores reject PNGs with an alpha channel. Strip it and encode truecolour
// RGB (colour type 2) ourselves.
export function rgbaToRgb(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}

export function encodeRgbPng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  return encode({
    width,
    height,
    data: rgbaToRgb(rgba, width, height),
    depth: 8,
    channels: 3,
  });
}
