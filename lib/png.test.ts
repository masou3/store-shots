import { describe, expect, it } from 'vitest';
import { encodeRgbPng, rgbaToRgb } from './png';

// PNG layout: 8-byte signature, 4-byte length, 4-byte "IHDR", 4-byte width,
// 4-byte height, 1-byte bit depth (offset 24), 1-byte colour type (offset 25).
// Colour type 2 is truecolour RGB; 6 is truecolour + alpha, which both
// App Store Connect and Play Console reject.
describe('encodeRgbPng', () => {
  it('writes IHDR colour type 2 (RGB, no alpha)', () => {
    const w = 8;
    const h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 200;
      rgba[i + 1] = 50;
      rgba[i + 2] = 120;
      rgba[i + 3] = 255;
    }
    const png = encodeRgbPng(rgba, w, h);

    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(2); // colour type: truecolour RGB
  });

  it('strips the alpha byte and keeps pixel order', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]);
    expect(Array.from(rgbaToRgb(rgba, 2, 1))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
