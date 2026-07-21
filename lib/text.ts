import type { Ctx2D } from './types';

// Canvas has no text wrapping. Measures word by word, honours explicit \n.
export function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = current + ' ' + word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

// A run of text sharing one colour. `accent` picks the accent colour at draw
// time; the font (hence width) is identical either way, so wrapping is
// colour-independent and the set-wide text zone still measures the same.
export type TextSegment = { text: string; accent: boolean };
export type RichLine = TextSegment[];

// Split a paragraph on `*` markers: text between a pair of asterisks is
// accented. An unmatched trailing `*` just leaves the tail accented, which is
// the natural half-typed state and never eats characters.
function parseAccents(para: string): TextSegment[] {
  const segs: TextSegment[] = [];
  let accent = false;
  let buf = '';
  for (const ch of para) {
    if (ch === '*') {
      if (buf) segs.push({ text: buf, accent });
      buf = '';
      accent = !accent;
    } else {
      buf += ch;
    }
  }
  if (buf) segs.push({ text: buf, accent });
  return segs;
}

// Collapse neighbouring runs of the same accent so drawing makes the fewest
// fillText calls (and inserted spaces rejoin their word).
function mergeSegs(segs: TextSegment[]): RichLine {
  const out: RichLine = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.accent === s.accent) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

// Same wrapping as wrapText, but accent-aware: returns each line as coloured
// segments. Accent boundaries are honoured mid-word (e.g. "Sup*er*") because
// splitting happens after parsing markers, not before.
export function wrapRichText(ctx: Ctx2D, text: string, maxWidth: number): RichLine[] {
  const lines: RichLine[] = [];
  const spaceW = ctx.measureText(' ').width;
  for (const para of text.split('\n')) {
    // Words as arrays of segments, split at whitespace but keeping accent flags.
    const words: TextSegment[][] = [];
    let word: TextSegment[] = [];
    for (const seg of parseAccents(para)) {
      for (const part of seg.text.split(/(\s+)/)) {
        if (part === '') continue;
        if (/^\s+$/.test(part)) {
          if (word.length) {
            words.push(word);
            word = [];
          }
        } else {
          word.push({ text: part, accent: seg.accent });
        }
      }
    }
    if (word.length) words.push(word);

    if (words.length === 0) {
      lines.push([]);
      continue;
    }

    const wordWidth = (wd: TextSegment[]) =>
      wd.reduce((a, s) => a + ctx.measureText(s.text).width, 0);

    let line: TextSegment[] = [];
    let lineW = 0;
    for (const wd of words) {
      const ww = wordWidth(wd);
      if (line.length === 0) {
        line = [...wd];
        lineW = ww;
      } else if (lineW + spaceW + ww <= maxWidth) {
        line.push({ text: ' ', accent: false }, ...wd);
        lineW += spaceW + ww;
      } else {
        lines.push(mergeSegs(line));
        line = [...wd];
        lineW = ww;
      }
    }
    if (line.length) lines.push(mergeSegs(line));
  }
  return lines;
}

// Visible width of a wrapped line (markers already consumed).
export function lineWidth(ctx: Ctx2D, line: RichLine): number {
  return line.reduce((a, s) => a + ctx.measureText(s.text).width, 0);
}
