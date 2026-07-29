import type { SetClampState } from './render';

// Crop layouts hold the device at a fixed size and position no matter how long
// the headline is — until the set-wide text zone grows enough to collide with
// it, at which point every device in the set shrinks at once. Warning only,
// never blocking: a shrunk device is a design regression, not an invalid
// export, and the right fix is a shorter headline rather than a blocked button.
//
// Same shape as copyWarning: pure, returns a sentence or null.

// Warn while there is still under one line of headroom. Earlier than that and
// it fires on healthy sets and gets ignored; later and the damage is done.
const WARN_WITHIN_LINES = 1;

// LANDSCAPE ONLY, deliberately. The clamp is orientation-agnostic and
// measureSetClamp reports it for portrait too, but portrait must not warn:
// the shipped Play phone canvas (1080x1920, Pixel frame) is ALREADY clamped
// at ordinary two-line marketing headlines — measured at -1.48 lines of slack
// with the set this app was built on. That configuration has shipped, the
// devices still land identically across the set, and it looks right; a warning
// on it would fire on every existing project and train people to ignore the
// banner before it ever reaches the case it was built for. Landscape is where
// the cliff is both new and steep enough to be worth interrupting someone over.
const WARN_ORIENTATIONS = new Set(['landscape']);

// Long headlines get elided so the sentence stays readable in the sidebar.
function quote(headline: string): string {
  const t = headline.trim();
  if (!t) return 'the longest headline';
  return `"${t.length > 42 ? `${t.slice(0, 41)}…` : t}"`;
}

export function clampWarning(state: SetClampState | null): string | null {
  if (!state) return null;
  if (!WARN_ORIENTATIONS.has(state.orientation)) return null;
  const where = state.orientation;

  if (state.clamped) {
    return (
      `${quote(state.headline)} has outgrown the ${where} text zone, so the device on ` +
      `EVERY ${where} screen has shrunk to make room — not just that one. The zone is ` +
      `measured across the whole set. Shorten it to put them back to full size.`
    );
  }
  if (state.slackLines < WARN_WITHIN_LINES) {
    return (
      `About one more line on ${quote(state.headline)} and the device on every ` +
      `${where} screen shrinks together, not just that one — the text zone is measured ` +
      `across the whole set.`
    );
  }
  return null;
}
