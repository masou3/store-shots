import type { SetClampState } from './render';

// Crop layouts hold the device at a fixed size no matter how long the headline
// gets — until the set-wide text zone grows enough to collide with it, and then
// the device shrinks on EVERY slide of that orientation at once. Warning only,
// never blocking: a small device is a design regression, not an invalid export.
//
// Same shape as copyWarning: pure, returns a sentence or null.

// Keyed off SURVIVING DEVICE SIZE, not off whether the clamp engaged.
//
// Whether the clamp fired says nothing about whether the slide looks wrong.
// Rendered and inspected on a portrait iPad at six headline lengths:
//
//   100%  1-2 lines   device fills the frame           fine
//    80%  3 lines     visibly smaller, still a hero    fine
//    57%  4 lines     dwarfed by dead background       WRONG
//    23%  5 lines     a stub at the canvas edge        broken
//     0%  7 lines     no device, text off-canvas       broken
//
// 80% reads as a deliberate composition; 57% reads as a mistake. The threshold
// sits between them. It is a judgement about how it LOOKS, made by looking —
// there is no measurement that yields it.
//
// This also settles the shipped Play phone canvas, which has been clamped all
// along at ordinary two-line headlines and looks right: measured, it keeps 90%
// of its requested size, so it sits well above the line and no longer needs an
// orientation-specific exemption to stay quiet. Warning on `clamped` would have
// fired on it; warning on size does not.
//
// RE-CHECKED ACROSS CANVASES, AND IT IS NOT GLOBAL. 70% was first derived by
// eye on one canvas/frame pair, so it was re-rendered at 100/85/70/55/40% on
// three combinations and judged again. Where each stops looking deliberate:
//
//   Play phone portrait, top text        breaks below ~70%
//   iPad landscape, SIDE text            breaks below ~70%
//   iPad landscape, TOP text             breaks below ~85%
//
// The same 30% shrink genuinely does not read the same everywhere: how much
// dead background it exposes depends on the canvas, and a bleed-positioned
// device also pulls away from the edge it was cropped against as it shrinks,
// so it stops reading as "cropped" and starts reading as "adrift". That effect
// is worst on a wide canvas with a wide device, which is exactly landscape
// top text.
//
// 0.7 is kept as a single global anyway, because the one combination that
// wants a stricter number is landscape top text — and the picker demotes it
// (layoutGroups in layouts.ts): in landscape it sorts below the side-text
// presets, renders dimmed, and carries a note saying the device shrinks
// quickly. That is what makes the single number honest rather than merely
// convenient — the place it under-fires is the place a user has been steered
// away from, visibly, not just in a comment. For every combination in normal
// use, 70% IS the measured breaking point.
//
// If landscape top text is ever promoted back to equal footing, this must
// become per-canvas and the figures above are the starting point. The two
// decisions are linked; do not change one without the other.
const MIN_DEVICE_FRACTION = 0.7;

// Long headlines get elided so the sentence stays readable in the sidebar.
function quote(headline: string): string {
  const t = headline.trim();
  if (!t) return 'the longest headline';
  return `"${t.length > 42 ? `${t.slice(0, 41)}…` : t}"`;
}

export function clampWarning(state: SetClampState | null): string | null {
  if (!state || state.shrinkRatio >= MIN_DEVICE_FRACTION) return null;
  const pct = Math.round(state.shrinkRatio * 100);
  const where = state.orientation;
  const scale = pct <= 25 ? 'barely visible' : 'much smaller than intended';
  return (
    `${quote(state.headline)} is long enough that the device on EVERY ${where} ` +
    `screen has shrunk to ${pct}% of full size to make room — ${scale}, and not just ` +
    `on that slide. The text zone is measured across the whole set. Shorten it, or ` +
    `move that screen to a layout with the text beside the device.`
  );
}
