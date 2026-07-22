export type StoreSize = {
  id: string;
  label: string;
  store: 'ios' | 'play';
  width: number;
  height: number;
};

export type FontFamilyId = 'inter' | 'system' | 'serif' | 'mono';

export type LayoutId = 'top-text-crop' | 'top-text-float' | 'bottom-text-crop' | 'angled';

// Per-slide layout: text position and every device dial. Lives on the Slide,
// not the Theme, so each screen can carry its own layout while gradient, type,
// grain and frame stay set-wide. The set-wide text zone (measureSetTextZone)
// is unaffected — it measures text metrics only, never these fields.
export type SlideLayout = {
  textPosition: 'top' | 'bottom';
  textInsetPct: number;
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
};

export type Theme = {
  sizeId: string;
  frameId: string;
  lastFrameId?: string; // last non-'none' frame; 'none' borrows its screen aspect when no image is loaded
  frameColour: string | null; // null = the device spec's own body colour
  gradient: {
    mode: 'gradient' | 'solid';
    from: string;
    to: string;
    angle: number; // degrees, CSS convention; solid uses `from`
    continuous: boolean; // one gradient across a virtual canvas of width x slideCount, each slide takes its slice
  };
  grain: number; // 0..1, overlay opacity
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

export type Slide = {
  id: string;
  headline: string;
  subhead?: string;
  imageKey?: string; // the screenshot shown ON the device screen
  bg?: SlideBackground; // optional full-frame photo BEHIND the device
  textStyle?: TextStyleOverride; // per-slide text colour/accent/glow, over theme.text
  layout: SlideLayout;
  layoutId: LayoutId; // the preset this slide's layout was last applied from
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
    | { kind: 'none' };
  buttons: Array<{ side: 'left' | 'right'; topPct: number; lenPct: number }>;
};

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
