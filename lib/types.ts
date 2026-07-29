// Phones and tablets are separate submission obligations in both stores, and
// a set belongs to exactly one of them. Not an orientation — see Orientation,
// which is per-slide and swaps the canvas rather than changing the obligation.
export type DeviceClass = 'phone' | 'tablet';

export type StoreSize = {
  id: string;
  label: string;
  store: 'ios' | 'play';
  deviceClass: DeviceClass;
  // PORTRAIT dimensions, always. A landscape slide renders at these swapped
  // (orientSize); there is deliberately no landscape row per size, so each
  // canvas has exactly one source of truth.
  width: number;
  height: number;
  // Obligation group. Both stores accept more than one canvas for a single
  // required slot — Apple's 13-inch iPad slot takes either 2064x2752 or
  // 2048x2732 — so sizes sharing a group discharge ONE obligation between
  // them, and the UI must not present them as two things to deliver.
  // Undefined = this size is its own obligation.
  satisfies?: string;
};

export type FontFamilyId =
  | 'inter'
  | 'poppins'
  | 'montserrat'
  | 'sora'
  | 'playfair'
  | 'nunito'
  | 'system'
  | 'serif'
  | 'mono';

export type LayoutId =
  | 'top-text-crop'
  | 'top-text-float'
  | 'bottom-text-crop'
  | 'angled'
  // Landscape-only. A landscape canvas has horizontal slack and almost no
  // vertical slack, so text goes BESIDE the device rather than above it.
  | 'side-text-crop'
  | 'side-text-crop-right'
  | 'side-text-float';

// Per-slide layout: text position and every device dial. Lives on the Slide,
// not the Theme, so each screen can carry its own layout while gradient, type,
// grain and frame stay set-wide. The set-wide text zone (measureSetTextZone)
// is unaffected — it measures text metrics only, never these fields.
export type SlideLayout = {
  // 'top'/'bottom' put the text in a horizontal band and leave the device the
  // rect below/above it — the portrait contract. 'left'/'right' put it in a
  // VERTICAL band and leave the device the rect beside it, which is the mirror
  // of that contract on the other axis and the only one that works on a
  // landscape canvas, where vertical slack is what runs out first.
  textPosition: 'top' | 'bottom' | 'left' | 'right';
  textInsetPct: number;
  // Side-text only: fraction of canvas width reserved for the text column,
  // before maxWidthPct narrows it. Undefined = SIDE_TEXT_BAND_PCT.
  textBandPct?: number;
  // Side-text bleed only: device height as a fraction of canvas height, the
  // mirror of deviceWidthPct. Undefined = the preset default.
  deviceHeightPct?: number;
  // 'slot': height-driven — deviceFill of the rect left after the text zone
  //         (float and angled layouts).
  // 'bleed': width-driven — deviceWidthPct of the canvas, positioned by
  //          deviceBleed hanging past the edge opposite the text (crop
  //          layouts). The slot plays no part; the only fit constraint is
  //          collision with the text zone.
  deviceSizing: 'slot' | 'bleed';
  deviceFill: number; // slot mode: device height as a fraction of the slot
  deviceAnchor: 'top' | 'center' | 'bottom'; // slot mode: which slot edge the device pins to
  deviceBleed: number; // bleed mode: fraction of device height hanging past the anchored edge
  deviceWidthPct: number; // bleed mode: device width as a fraction of canvas width (capped)
  deviceShadow: boolean;
  deviceScale: number; // 0.4 .. 1.2
  deviceOffsetX?: number; // px in store space, free-drag horizontal nudge (mirrors deviceOffsetY)
  deviceOffsetY: number; // px in store space, allows bleed off the edge
  deviceRotation: number; // -15 .. 15 degrees
  imageFit: 'cover' | 'contain'; // cover centre-crops (the normal case), contain letterboxes
  // Free-drag nudge of the text block, px in store space, on top of the
  // computed position. Set by dragging the text in the preview.
  textOffsetX?: number;
  textOffsetY?: number;
  // Hero span: fraction of the device's bounding box that hangs past the right
  // edge into the NEXT frame. 0 = off. The next frame redraws this device on
  // its left edge (see RenderOpts.spillPrev), so the two exported PNGs line up
  // side-by-side in the store listing.
  overlapNext?: number;
  // Coloured halo behind the device. glowStrength 0 = off; glowColour is the
  // halo colour. Rendered as a blurred, zero-offset shadow of the device body.
  glowStrength?: number; // 0 .. 1
  glowColour?: string;
};

// A full-frame photo behind the device, replacing the gradient for that slide.
export type SlideBackground = {
  imageKey: string; // key into the same IndexedDB image store as screenshots
  blur: number; // 0..~0.025, fraction of canvas width used as blur radius
  darken: number; // 0..~0.8, opacity of a black overlay for text legibility
  // Optional duotone: map the photo's shadows toward `shadow` and highlights
  // toward `highlight` (multiply + screen passes). Undefined = full colour.
  duotone?: { shadow: string; highlight: string };
};

export type PatternKind = 'dots' | 'grid' | 'lines' | 'crosshatch';

// A tiled, deterministic background texture drawn over the background fill.
export type BackgroundPattern = {
  kind: PatternKind;
  colour: string;
  opacity: number; // 0..1
  scale: number; // cell size as a fraction of canvas width (e.g. 0.05 ≈ 20 cells)
};

export type Theme = {
  sizeId: string;
  frameId: string;
  lastFrameId?: string; // last non-'none' frame; 'none' borrows its screen aspect when no image is loaded
  frameColour: string | null; // null = the device spec's own body colour
  gradient: {
    // 'gradient' = linear (angle + continuous apply); 'radial'/'conic' = glow /
    // sweep from `from`↔`to` around `origin` (angle rotates conic); 'mesh' = the
    // four `mesh` corner colours blended; 'solid' = flat `from`.
    mode: 'gradient' | 'solid' | 'radial' | 'conic' | 'mesh';
    from: string;
    to: string;
    angle: number; // degrees, CSS convention; solid uses `from`
    continuous: boolean; // one gradient across a virtual canvas of width x slideCount, each slide takes its slice
    origin?: 'center' | 'top' | 'bottom'; // radial/conic focal point
    mesh?: [string, string, string, string]; // mesh mode: TL, TR, BR, BL corner colours
  };
  grain: number; // 0..1, overlay opacity
  // Darkened edges over the background (under the device), 0..~0.8. Focuses the
  // eye on the phone. Applies over any background type.
  vignette?: number;
  // Tiled geometric texture over the background, under the device. Deterministic
  // so exports stay byte-identical.
  pattern?: BackgroundPattern;
  // A glowing border framing the whole screenshot edge (over everything,
  // including text and phone). strength 0 = off; colour is the glow colour.
  edgeGlow?: { strength: number; colour: string };
  // Set-wide panoramic background: one photo spread across the whole set, each
  // slide showing its horizontal slice (like gradient.continuous, but a photo).
  // A slide's own `bg` overrides it for that slide. Same blur/darken as bg.
  panorama?: SlideBackground;
  text: {
    family: FontFamilyId;
    sizePct: number; // headline size as % of canvas width, so 1320 and 1080 exports match optically
    weight: 400 | 600 | 700 | 800;
    colour: string;
    align: 'left' | 'center' | 'right';
    lineHeight: number;
    maxWidthPct: number;
    // Colour for *accented* spans, marked with asterisks in the headline /
    // subhead text (e.g. "Track *every* run"). Undefined = fall back to colour.
    accentColour?: string;
    // Soft halo behind the text: glow 0 = off, glowColour is the halo colour.
    // Drawn as a blurred shadow of the glyphs, same device-px caveat as the
    // device shadow (scaled by hand so preview and export match).
    glow?: number; // 0 .. 1
    glowColour?: string;
  };
};

// Per-slide overrides for the text *look* only — never metrics. Colour, accent
// and glow don't affect wrapping, so each slide can carry its own without
// disturbing the set-wide text zone (which measures family/size/weight only).
// Any field left undefined falls back to theme.text. Broadcast the current
// slide's look to every slide with applyTextStyleToAll.
export type TextStyleOverride = Partial<
  Pick<Theme['text'], 'colour' | 'accentColour' | 'glow' | 'glowColour'>
>;

export type Orientation = 'portrait' | 'landscape';

export type Slide = {
  id: string;
  headline: string;
  subhead?: string;
  imageKey?: string; // the screenshot shown ON the device screen
  bg?: SlideBackground; // optional full-frame photo BEHIND the device
  textStyle?: TextStyleOverride; // per-slide text colour/accent/glow, over theme.text
  layout: SlideLayout;
  layoutId: LayoutId; // the preset this slide's layout was last applied from
  // Per-slide orientation. Undefined = 'portrait' (every pre-landscape project).
  // 'landscape' swaps the canvas W/H of the set's size and turns the phone frame
  // 90°; both stores accept a mix of orientations within one screenshot set.
  orientation?: Orientation;
};

export type Project = {
  id: string;
  name: string;
  theme: Theme;
  slides: Slide[];
};

export type DeviceSpec = {
  id: string;
  label: string;
  screenAspect: number; // w/h of the real device's screenshots
  bezelPct: number; // bezel thickness as a fraction of screen width
  outerRadiusPct: number; // fraction of outer width
  screenRadiusPct: number; // fraction of screen width
  body: { fill: string; edge: string; edgeWidth: number };
  cutout:
    | { kind: 'dynamic-island'; wPct: number; hPct: number; topPct: number }
    | { kind: 'hole-punch'; dPct: number; topPct: number; xPct: number }
    // A camera centred on one of the screen's LONG edges — how every current
    // iPad and Android tablet places it, so it sits at the top when the device
    // is held in landscape. Declared in portrait terms like every other spec
    // field: `edge` is which portrait side it hugs, and the landscape base 90°
    // turn carries it to the top ('left' rotates to the top edge).
    | { kind: 'edge-camera'; dPct: number; edge: 'left' | 'right'; insetPct: number }
    | { kind: 'none' };
  // `topPct` is the offset along the edge the button sits on, as a fraction of
  // that edge's length; 'top'/'bottom' buttons run horizontally.
  buttons: Array<{ side: 'left' | 'right' | 'top' | 'bottom'; topPct: number; lenPct: number }>;
};

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
