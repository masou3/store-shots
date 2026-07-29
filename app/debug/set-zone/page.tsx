"use client";

import { useEffect, useState } from "react";
import type { Orientation, Slide, SlideLayout, Theme } from "@/lib/types";
import { getSize, slideSize } from "@/lib/sizes";
import { slideLayoutFor } from "@/lib/layouts";
import { loadRenderFonts } from "@/lib/fonts";
import { measureSetTextZone, renderSlide, zoneForSlide } from "@/lib/render";

// Automated set-wide text zone assertion: a 3-slide set at one, two and
// three-line headlines must put the device at IDENTICAL size and position on
// every slide, on both canvases. Renders at scale = 1 offscreen and measures
// the device body from actual pixels — no reasoning, no preview involved.
//
// Now split by orientation: the zone is measured per orientation, so slides of
// the SAME orientation must still land identically. A portrait row and a
// landscape row of the same set are measured independently — the point is that
// mixing does not disturb either group's own set-wide zone.

const HEADLINES = [
  "Track every rep.",
  "Every set, every rep, logged before you rack the bar.",
  "Progress you can actually see, week after week, without ever touching a spreadsheet.",
];

const THEME: Theme = {
  sizeId: "",
  frameId: "iphone-17-pro",
  lastFrameId: "iphone-17-pro",
  frameColour: null,
  gradient: {
    mode: "gradient",
    from: "#4f46e5",
    to: "#ec4899",
    angle: 160,
    continuous: false,
  },
  grain: 0.06,
  text: {
    family: "inter",
    sizePct: 9,
    weight: 800,
    colour: "#ffffff",
    align: "center",
    lineHeight: 1.1,
    maxWidthPct: 80,
  },
};

// One shared layout across the set — the whole point of this assertion is that
// devices land identically given a single layout and varying headline length.
const LAYOUT: SlideLayout = slideLayoutFor("top-text-crop");
// Side text is the landscape contract's own layout, and the assertion that
// matters for it is the same one: identical device across varying headlines.
// Here it must hold because the text BAND is a fixed fraction of the canvas
// rather than the measured width of the longest line. If someone ever "tidies"
// sideTextBandWidth into shrink-to-fit, the landscape side-text rows below go
// red immediately — which is the only reason this page is worth having.
const SIDE_LAYOUT: SlideLayout = slideLayoutFor("side-text-crop");

type Measurement = {
  sizeId: string;
  orientation: Orientation;
  band: "top-text" | "side-text";
  slide: number;
  top: number;
  left: number;
  right: number;
  width: number;
};

// Bounding box of the device body, from pixels. A full-canvas scan rather than
// a probe row/column, because a side-text device bleeds off the RIGHT edge
// while a top-text one bleeds off the BOTTOM, and a fixed probe line that suits
// one misses the other. The body and its screen fill are dark neutrals; the
// gradient is saturated indigo/pink, which the predicate rejects on the
// blue-vs-green spread, so the box is the device and nothing else.
function measureDevice(
  ctx: OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
) {
  const img = ctx.getImageData(0, 0, W, H).data;
  const dark = (i: number) => {
    const r = img[i];
    const g = img[i + 1];
    const b = img[i + 2];
    return r >= 8 && r < 90 && Math.abs(r - g) < 12 && Math.abs(b - g) < 16;
  };
  let top = -1;
  let left = W;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!dark((y * W + x) * 4)) continue;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return { top, left: left === W ? -1 : left, right, width: right - left };
}

export default function SetZoneDebugPage() {
  const [rows, setRows] = useState<Measurement[] | null>(null);

  useEffect(() => {
    (async () => {
      await loadRenderFonts();
      // A mixed set: each headline in BOTH orientations, one shared set. The
      // zone is measured across the whole mixed set, so this proves a portrait
      // and a landscape slide coexisting never disturbs either group's zone.
      const orientations: Orientation[] = ["portrait", "landscape"];
      const slides: Slide[] = [
        ...orientations.flatMap((orientation) =>
          HEADLINES.map((h, i) => ({
            id: `set-zone-${orientation}-${i}`,
            headline: h,
            subhead:
              i === 0 ? "Sets, reps and PRs logged in one tap." : undefined,
            layout: LAYOUT,
            layoutId: "top-text-crop" as const,
            orientation,
          })),
        ),
        // Landscape side text, in the SAME set as everything above, so this
        // also proves the two contracts don't disturb each other: side-text
        // slides are excluded from the set-wide block-height zone, and a
        // top-text slide's long headline must not move a side-text device.
        ...HEADLINES.map((h, i) => ({
          id: `set-zone-side-${i}`,
          headline: h,
          subhead:
            i === 0 ? "Sets, reps and PRs logged in one tap." : undefined,
          layout: SIDE_LAYOUT,
          layoutId: "side-text-crop" as const,
          orientation: "landscape" as const,
        })),
      ];
      const out: Measurement[] = [];
      for (const sizeId of [
        "ios-6.9",
        "play-phone",
        "ipad-13",
        "play-tablet-10",
      ]) {
        const size = getSize(sizeId);
        const zones = measureSetTextZone(slides, THEME, size);
        for (const slide of slides) {
          const oriented = slideSize(size, slide);
          const c = new OffscreenCanvas(oriented.width, oriented.height);
          const ctx = c.getContext("2d");
          if (!ctx) continue;
          renderSlide(ctx, slide, THEME, oriented, 1, {
            setBlockH: zoneForSlide(zones, slide),
          });
          const i = HEADLINES.indexOf(slide.headline);
          out.push({
            sizeId,
            orientation: slide.orientation ?? "portrait",
            band:
              slide.layoutId === "side-text-crop" ? "side-text" : "top-text",
            slide: i + 1,
            ...measureDevice(ctx, oriented.width, oriented.height),
          });
        }
      }
      setRows(out);
    })();
  }, []);

  // Each (canvas, orientation, band) group must land identically across
  // headlines. For side text that is the fixed-band assertion: the device can
  // only be identical if the text column ignored the headlines entirely.
  type Group = {
    sizeId: string;
    orientation: Orientation;
    band: Measurement["band"];
  };
  const rowsFor = (g: Group) =>
    (rows ?? []).filter(
      (m) =>
        m.sizeId === g.sizeId &&
        m.orientation === g.orientation &&
        m.band === g.band,
    );
  const verdict = (g: Group): string => {
    if (!rows) return "…";
    const r = rowsFor(g);
    if (r.length === 0) return "no rows";
    const same = r.every(
      (m) =>
        m.top === r[0].top && m.left === r[0].left && m.right === r[0].right,
    );
    return same ? "PASS — identical" : "FAIL — devices move between slides";
  };

  const groups: Group[] = [
    "ios-6.9",
    "play-phone",
    "ipad-13",
    "play-tablet-10",
  ].flatMap((sizeId) => [
    { sizeId, orientation: "portrait" as const, band: "top-text" as const },
    { sizeId, orientation: "landscape" as const, band: "top-text" as const },
    { sizeId, orientation: "landscape" as const, band: "side-text" as const },
  ]);

  return (
    <div className="p-8">
      <h1 className="mb-1 text-sm font-semibold text-neutral-100">
        Set-zone assertion
      </h1>
      <p className="mb-4 max-w-2xl text-xs text-neutral-400">
        top-text-crop, iPhone frame, slides at 1 / 2 / 3-line headlines, one
        set-wide text zone. Device body edges measured from pixels at export
        resolution. All three rows per canvas must be identical.
      </p>
      {!rows ? (
        <p className="text-xs text-neutral-500">measuring…</p>
      ) : (
        <div id="results" data-results={JSON.stringify(rows)}>
          {groups.map((g) => (
            <div
              key={`${g.sizeId}-${g.orientation}-${g.band}`}
              className="mb-6"
            >
              <h2 className="mb-1 font-mono text-xs text-neutral-300">
                {g.sizeId} · {g.orientation} · {g.band}:{" "}
                <span data-verdict={`${g.sizeId}-${g.orientation}-${g.band}`}>
                  {verdict(g)}
                </span>
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
                  {rowsFor(g).map((r) => (
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
