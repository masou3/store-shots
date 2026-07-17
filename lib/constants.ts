// Layout and typography constants shared by the render pipeline. Device frame
// geometry lives in deviceSpecs.ts — nothing geometric is hard-coded in
// render.ts.

// Device sizing is slot-driven: height comes from the rect left after the
// text zone, width derives from the body aspect. This cap is a real
// composition constraint, not a backstop — the silhouette must never bleed
// off the sides. If the derived (rotated-bbox) width exceeds it, width wins
// and height re-derives. Consequence: at fill above 1 the cap always wins,
// so crop layouts are effectively width-driven and their crop fraction is
// whatever the canvas shape allows (the 0.5625 Play canvas has vertical room
// to crop; the 0.460 iOS canvas barely does). Float layouts stay
// height-driven and must never hit this cap.
export const DEVICE_MAX_WIDTH_PCT = 0.84;

// Text must stay at least this far in from every edge.
export const SAFE_AREA_PCT = 0.08;

// Gap kept between the text rect and the device body, fraction of canvas height.
export const TEXT_DEVICE_GAP_PCT = 0.02;

// First-baseline offset from the top of the text block, in ems.
export const ASCENT_EM = 0.8;

export const SUBHEAD_SIZE_RATIO = 0.45;
export const SUBHEAD_WEIGHT = 500;
export const SUBHEAD_ALPHA = 0.75;
export const SUBHEAD_GAP_EM = 0.35;

// Device drop shadow (layouts with `shadow: true`).
export const DEVICE_SHADOW_COLOUR = 'rgba(0, 0, 0, 0.35)';
export const DEVICE_SHADOW_BLUR_PCT = 0.1; // of device outer width
export const DEVICE_SHADOW_OFFSET_PCT = 0.02; // of device outer height

// Side button thickness as a fraction of device outer width.
export const BUTTON_THICKNESS_PCT = 0.014;

// Screen fill behind the screenshot (and the whole screen when there is none).
export const SCREEN_PLACEHOLDER_FILL = '#0b0b0f';
