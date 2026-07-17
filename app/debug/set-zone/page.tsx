'use client';

import { useEffect, useState } from 'react';
import type { Slide, Theme } from '@/lib/types';
import { getSize } from '@/lib/sizes';
import { getLayout, applyLayout } from '@/lib/layouts';
import { loadRenderFonts } from '@/lib/fonts';
import { measureSetTextZone, renderSlide } from '@/lib/render';

// Automated set-wide text zone assertion: a 3-slide set at one, two and
// three-line headlines must put the device at IDENTICAL size and position on
// every slide, on both canvases. Renders at scale = 1 offscreen and measures
// the device body from actual pixels — no reasoning, no preview involved.

const HEADLINES = [
  'Track every rep.',
  'Every set, every rep, logged before you rack the bar.',
  'Progress you can actually see, week after week, without ever touching a spreadsheet.',
];

const THEME: Theme = applyLayout(
  {
    sizeId: '',
    frameId: 'iphone-17-pro',
    lastFrameId: 'iphone-17-pro',
    frameColour: null,
    gradient: { mode: 'gradient', from: '#4f46e5', to: '#ec4899', angle: 160, continuous: false },
    grain: 0.06,
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
  },
  getLayout('top-text-crop'),
);

type Measurement = {
  sizeId: string;
  slide: number;
  top: number;
  left: number;
  right: number;
  width: number;
};

function measureDevice(ctx: OffscreenCanvasRenderingContext2D, W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H).data;
  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * W + x) * 4;
    return [img[i], img[i + 1], img[i + 2]];
  };
  const dark = ([r, g, b]: [number, number, number]) =>
    r >= 8 && r < 85 && Math.abs(r - g) < 12 && Math.abs(b - g) < 16;
  const colX = Math.round(W * 0.35);
  let top = -1;
  for (let y = 0; y < H; y++) {
    if (dark(px(colX, y))) {
      top = y;
      break;
    }
  }
  const rowY = Math.min(H - 1, top + Math.round(H * 0.2));
  let left = -1;
  let right = -1;
  for (let x = 0; x < W; x++) {
    if (dark(px(x, rowY))) {
      left = x;
      break;
    }
  }
  for (let x = W - 1; x >= 0; x--) {
    if (dark(px(x, rowY))) {
      right = x;
      break;
    }
  }
  return { top, left, right, width: right - left };
}

export default function SetZoneDebugPage() {
  const [rows, setRows] = useState<Measurement[] | null>(null);

  useEffect(() => {
    (async () => {
      await loadRenderFonts();
      const slides: Slide[] = HEADLINES.map((h, i) => ({
        id: `set-zone-${i}`,
        headline: h,
        subhead: i === 0 ? 'Sets, reps and PRs logged in one tap.' : undefined,
      }));
      const out: Measurement[] = [];
      for (const sizeId of ['ios-6.9', 'play-phone']) {
        const size = getSize(sizeId);
        const setBlockH = measureSetTextZone(slides, THEME, size);
        for (const [i, slide] of slides.entries()) {
          const c = new OffscreenCanvas(size.width, size.height);
          const ctx = c.getContext('2d');
          if (!ctx) continue;
          renderSlide(ctx, slide, THEME, size, 1, { setBlockH });
          out.push({ sizeId, slide: i + 1, ...measureDevice(ctx, size.width, size.height) });
        }
      }
      setRows(out);
    })();
  }, []);

  const verdict = (sizeId: string): string => {
    if (!rows) return '…';
    const r = rows.filter((r) => r.sizeId === sizeId);
    const same = r.every(
      (m) => m.top === r[0].top && m.left === r[0].left && m.right === r[0].right,
    );
    return same ? 'PASS — identical' : 'FAIL — devices move between slides';
  };

  return (
    <div className="p-8">
      <h1 className="mb-1 text-sm font-semibold text-neutral-100">Set-zone assertion</h1>
      <p className="mb-4 max-w-2xl text-xs text-neutral-400">
        top-text-crop, iPhone frame, slides at 1 / 2 / 3-line headlines, one set-wide text
        zone. Device body edges measured from pixels at export resolution. All three rows
        per canvas must be identical.
      </p>
      {!rows ? (
        <p className="text-xs text-neutral-500">measuring…</p>
      ) : (
        <div id="results" data-results={JSON.stringify(rows)}>
          {(['ios-6.9', 'play-phone'] as const).map((sizeId) => (
            <div key={sizeId} className="mb-6">
              <h2 className="mb-1 font-mono text-xs text-neutral-300">
                {sizeId}: <span data-verdict={sizeId}>{verdict(sizeId)}</span>
              </h2>
              <table className="font-mono text-xs text-neutral-400">
                <thead>
                  <tr className="text-neutral-600">
                    <td className="pr-4">slide</td>
                    <td className="pr-4">top</td>
                    <td className="pr-4">left</td>
                    <td className="pr-4">right</td>
                    <td className="pr-4">width</td>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.sizeId === sizeId)
                    .map((r) => (
                      <tr key={r.slide}>
                        <td className="pr-4">{r.slide}</td>
                        <td className="pr-4">{r.top}</td>
                        <td className="pr-4">{r.left}</td>
                        <td className="pr-4">{r.right}</td>
                        <td className="pr-4">{r.width}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
