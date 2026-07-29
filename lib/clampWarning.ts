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
