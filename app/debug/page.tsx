'use client';

import { useEffect, useRef } from 'react';
import { fillLinearGradient } from '@/lib/gradient';

const FROM = '#4f46e5';
const TO = '#ec4899';
const ANGLES = [0, 45, 90, 180];
const W = 220;
const H = 330;

function GradientPair({ angle }: { angle: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    fillLinearGradient(ctx, W, H, FROM, TO, angle);
  }, [angle]);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs text-neutral-400">{angle}deg</p>
      <div className="flex gap-2">
        <div className="flex flex-col gap-1">
          <canvas ref={ref} style={{ width: W, height: H }} className="rounded" />
          <span className="text-center text-[10px] text-neutral-500">canvas</span>
        </div>
        <div className="flex flex-col gap-1">
          <div
            style={{
              width: W,
              height: H,
              background: `linear-gradient(${angle}deg in oklab, ${FROM}, ${TO})`,
            }}
            className="rounded"
          />
          <span className="text-center text-[10px] text-neutral-500">css (in oklab)</span>
        </div>
      </div>
    </div>
  );
}

export default function DebugPage() {
  return (
    <div className="p-8">
      <h1 className="mb-1 text-sm font-semibold text-neutral-100">Gradient debug</h1>
      <p className="mb-6 max-w-xl text-xs text-neutral-400">
        Canvas render (Oklab-sampled stops) next to a CSS{' '}
        <code>linear-gradient(… in oklab)</code> with identical values. The pairs should be
        indistinguishable — if direction or extent differs, the endpoint maths is wrong.
      </p>
      <div className="flex flex-wrap gap-8">
        {ANGLES.map((a) => (
          <GradientPair key={a} angle={a} />
        ))}
      </div>
    </div>
  );
}
