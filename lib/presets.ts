// Curated gradient swatches, so nobody types hex. Same two-stop linear engine
// as before — a preset just sets `from`/`to`, and optionally `angle` so a pack
// lands at a sensible orientation (sunsets read top→bottom, pop reads
// diagonal). Colours are interpolated in Oklab at render (see gradient.ts), so
// even distant hue pairs stay vivid through the midpoint.
export type GradientPreset = { from: string; to: string; angle?: number };
export type GradientPack = { label: string; presets: GradientPreset[] };

// Angle convention (see fillLinearGradient): 0° = `from` at bottom, 180° =
// `from` at top. Warm packs sit near-vertical so the first colour is the sky.
const WARM_ANGLE = 175;
const COOL_ANGLE = 160;
const DARK_ANGLE = 160;
const POP_ANGLE = 135;

export const GRADIENT_PACKS: GradientPack[] = [
  {
    label: 'Warm · sunset',
    presets: [
      { from: '#3b0764', to: '#f97316', angle: WARM_ANGLE }, // dusk ember (the reference look)
      { from: '#1e1b4b', to: '#f59e0b', angle: WARM_ANGLE }, // night amber (Streaklord-ish)
      { from: '#4f46e5', to: '#ec4899', angle: WARM_ANGLE }, // indigo rose
      { from: '#701a75', to: '#fb7185', angle: WARM_ANGLE }, // plum coral
      { from: '#be185d', to: '#fbbf24', angle: WARM_ANGLE }, // magenta gold
      { from: '#6d28d9', to: '#fdba74', angle: WARM_ANGLE }, // grape peach
      { from: '#7f1d1d', to: '#fb923c', angle: WARM_ANGLE }, // sunset red
      { from: '#831843', to: '#f97316', angle: WARM_ANGLE }, // berry flame
    ],
  },
  {
    label: 'Cool · ocean',
    presets: [
      { from: '#2563eb', to: '#06b6d4', angle: COOL_ANGLE }, // blue cyan
      { from: '#0d9488', to: '#4f46e5', angle: COOL_ANGLE }, // teal indigo
      { from: '#0c4a6e', to: '#22d3ee', angle: COOL_ANGLE }, // deep sea
      { from: '#065f46', to: '#6ee7b7', angle: COOL_ANGLE }, // mint
      { from: '#1e3a8a', to: '#7dd3fc', angle: COOL_ANGLE }, // sky
      { from: '#0e7490', to: '#99f6e4', angle: COOL_ANGLE }, // lagoon
      { from: '#1e293b', to: '#38bdf8', angle: COOL_ANGLE }, // frost
      { from: '#115e59', to: '#5eead4', angle: COOL_ANGLE }, // seafoam
    ],
  },
  {
    label: 'Dark · mono',
    presets: [
      { from: '#111827', to: '#374151', angle: DARK_ANGLE }, // charcoal
      { from: '#0a0a0a', to: '#27272a', angle: DARK_ANGLE }, // ink
      { from: '#18181b', to: '#3f3f46', angle: DARK_ANGLE }, // coal
      { from: '#020617', to: '#1e293b', angle: DARK_ANGLE }, // deep navy
      { from: '#171717', to: '#404040', angle: DARK_ANGLE }, // graphite
      { from: '#0f0f23', to: '#2e1065', angle: DARK_ANGLE }, // midnight
      { from: '#030712', to: '#1e3a8a', angle: DARK_ANGLE }, // onyx blue
      { from: '#0f172a', to: '#38bdf8', angle: DARK_ANGLE }, // slate sky
    ],
  },
  {
    label: 'Vibrant · pop',
    presets: [
      { from: '#581c87', to: '#d946ef', angle: POP_ANGLE }, // violet fuchsia
      { from: '#e11d48', to: '#f59e0b', angle: POP_ANGLE }, // rose amber
      { from: '#dc2626', to: '#7c3aed', angle: POP_ANGLE }, // red violet
      { from: '#059669', to: '#84cc16', angle: POP_ANGLE }, // emerald lime
      { from: '#ec4899', to: '#fb923c', angle: POP_ANGLE }, // pink orange
      { from: '#06b6d4', to: '#a855f7', angle: POP_ANGLE }, // cyan purple
      { from: '#a3e635', to: '#14b8a6', angle: POP_ANGLE }, // lime teal
      { from: '#d946ef', to: '#22d3ee', angle: POP_ANGLE }, // fuchsia cyan
    ],
  },
];

// Flat list kept for any consumer that just wants every pair.
export const GRADIENT_PRESETS: GradientPreset[] = GRADIENT_PACKS.flatMap((p) => p.presets);
