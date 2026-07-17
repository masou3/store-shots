'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeviceSpec, Slide, StoreSize, Theme } from '@/lib/types';
import { getSize } from '@/lib/sizes';
import { getSpec } from '@/lib/deviceSpecs';
import { LAYOUTS, applyLayout, type LayoutPreset } from '@/lib/layouts';
import { renderSlide } from '@/lib/render';
import { loadRenderFonts } from '@/lib/fonts';
import { setBitmap } from '@/lib/images';
import { useScreenshot } from '@/lib/useScreenshot';

// Frame review page: a 4x2 grid — four layouts down, iPhone and Pixel across.
//
// The test pattern is generated per frame at that frame's own screen aspect.
// That CANNOT validate the aspect constant itself (a pattern generated from
// the spec always round-trips cleanly — only a native capture off a real
// device tests the aspect; the constant is pinned to Google's published
// 1280x2856 panel). What it does test is centring and geometry.

const BASE_THEME: Theme = {
  sizeId: '',
  frameId: '',
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
};

function makeTheme(
  frameId: string,
  sizeId: string,
  imageFit: 'cover' | 'contain',
  preset: LayoutPreset,
): Theme {
  const base: Theme = {
    ...BASE_THEME,
    sizeId,
    frameId,
    layout: { ...BASE_THEME.layout, imageFit },
  };
  return applyLayout(base, preset);
}

function testPatternKey(specId: string): string {
  return `debug-test-${specId}`;
}

// Hue stripes, white border, dark centre cross — at the frame's native
// capture aspect, sized like a real screenshot off that panel.
async function generateTestPattern(spec: DeviceSpec): Promise<void> {
  const w = 1280;
  const h = Math.round(w / spec.screenAspect);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  if (!ctx) return;

  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = `hsl(${i * 30} 80% 55%)`;
    ctx.fillRect(Math.floor((i * w) / stripes), 0, Math.ceil(w / stripes), h);
  }
  const border = Math.round(w * 0.02);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, border);
  ctx.fillRect(0, h - border, w, border);
  ctx.fillRect(0, 0, border, h);
  ctx.fillRect(w - border, 0, border, h);
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, h / 2 - 5, w, 10);
  ctx.fillRect(w / 2 - 5, 0, 10, h);

  setBitmap(testPatternKey(spec.id), c.transferToImageBitmap());
}

function FramePreview({
  frameId,
  size,
  preset,
  imageKey,
  imageFit,
  fontsReady,
}: {
  frameId: string;
  size: StoreSize;
  preset: LayoutPreset;
  imageKey: string | null;
  imageFit: 'cover' | 'contain';
  fontsReady: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const CSS_H = 440;

  useEffect(() => {
    if (!fontsReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aspect = size.width / size.height;
    const cssW = CSS_H * aspect;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${CSS_H}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(CSS_H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme = makeTheme(frameId, size.id, imageFit, preset);
    const slide: Slide = {
      id: `debug-${frameId}-${preset.id}`,
      headline: 'Track every rep.',
      subhead: 'Sets, reps and PRs logged in one tap.',
      imageKey: imageKey ?? undefined,
    };
    renderSlide(ctx, slide, theme, size, canvas.width / size.width);
  }, [frameId, size, preset, imageKey, imageFit, fontsReady]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="rounded shadow-2xl shadow-black/60" />
      <p className="font-mono text-xs text-neutral-500">
        {getSpec(frameId).label} — {size.width} × {size.height}
      </p>
    </div>
  );
}

const COLUMNS = [
  { frameId: 'iphone-17-pro', sizeId: 'ios-6.9' },
  { frameId: 'pixel-10-pro', sizeId: 'play-phone' },
] as const;

export default function FramesDebugPage() {
  const [fontsReady, setFontsReady] = useState(false);
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('cover');
  const [patternsReady, setPatternsReady] = useState(false);
  const [mode, setMode] = useState<'pattern' | 'upload'>('pattern');
  const { imageKey, acceptFile, openPicker, dropProps, uploadCount } = useScreenshot();

  // A user-initiated upload (drop, paste, browse) supersedes the pattern.
  const [seenUploads, setSeenUploads] = useState(uploadCount);
  if (uploadCount !== seenUploads) {
    setSeenUploads(uploadCount);
    setMode('upload');
  }

  useEffect(() => {
    loadRenderFonts().then(() => setFontsReady(true));
    Promise.all(COLUMNS.map((c) => generateTestPattern(getSpec(c.frameId)))).then(() =>
      setPatternsReady(true),
    );
  }, []);

  const keyFor = (frameId: string) =>
    mode === 'pattern' ? (patternsReady ? testPatternKey(frameId) : null) : imageKey;

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8" {...dropProps}>
      <div>
        <h1 className="text-sm font-semibold text-neutral-100">Frame debug</h1>
        <p className="mt-1 max-w-2xl text-xs text-neutral-400">
          Four layouts down, iPhone and Pixel across, all eight fed the test pattern
          (generated per frame at that frame&apos;s native aspect — iPhone 1320:2868, Pixel
          1280:2856). Drop or paste a real screenshot anywhere to feed all eight instead.
          The pattern checks centring and geometry, not the aspect constants: cross dead
          centre, border even where the screen is uncropped, corners clipping cleanly.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) acceptFile(f);
          }}
          className="text-xs text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-700 file:px-3 file:py-1.5 file:text-xs file:text-neutral-100"
        />
        <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
          {(['cover', 'contain'] as const).map((fit) => (
            <button
              key={fit}
              onClick={() => setImageFit(fit)}
              className={
                imageFit === fit
                  ? 'bg-neutral-700 px-2 py-1 text-neutral-100'
                  : 'px-2 py-1 text-neutral-400 hover:text-neutral-200'
              }
            >
              {fit}
            </button>
          ))}
        </div>
        <button onClick={openPicker} className="text-xs text-neutral-500 underline">
          browse…
        </button>
        <button
          onClick={() => setMode('pattern')}
          className="text-xs text-neutral-500 underline"
        >
          load test pattern
        </button>
        {mode === 'pattern' && (
          <span className="text-xs text-amber-400">
            test pattern active — checks centring and geometry: cross dead centre, border
            even, corners clipping cleanly
          </span>
        )}
      </div>

      <div className="flex flex-col gap-10">
        {LAYOUTS.map((preset) => (
          <section key={preset.id}>
            <h2 className="mb-3 font-mono text-xs text-neutral-300">
              {preset.id} —{' '}
              {preset.sizing === 'bleed'
                ? `bleed ${preset.bleed}, width ${Math.round(preset.widthPct * 100)}%`
                : `fill ${preset.fill}, anchor ${preset.anchor}`}
              , shadow {preset.shadow ? 'on' : 'off'}
              {preset.rotate !== 0 ? `, rotate ${preset.rotate}°` : ''}
            </h2>
            <div className="flex flex-wrap items-start gap-10">
              {COLUMNS.map((col) => (
                <FramePreview
                  key={col.frameId}
                  frameId={col.frameId}
                  size={getSize(col.sizeId)}
                  preset={preset}
                  imageKey={keyFor(col.frameId)}
                  imageFit={imageFit}
                  fontsReady={fontsReady}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
