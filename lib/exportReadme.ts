import { getSize, obligationOf, orientSize } from './sizes';
import type { StoreSize } from './types';

// A zip with six folders and no guidance invites uploading the wrong pair, or
// both. This writes a README naming what each folder is and, where two folders
// satisfy ONE store obligation, saying so explicitly.
//
// It states only what the size table declares. `satisfies` groups are encoded
// (the 13-inch iPad slot accepts either canvas), so those can be called out as
// "either, not both". Anything the app has no sourced rule for is listed
// without a recommendation rather than guessed at — the project's rule is that
// unsourced store policy does not get asserted, and a README is exactly the
// place a confident-sounding guess would be believed.

export type ReadmeSet = { label: string; sizeIds: string[]; slideCount: number };

function line(dir: string, size: StoreSize, slides: number, orientationNote: string): string {
  const n = `${slides} screenshot${slides === 1 ? '' : 's'}`;
  return `  ${dir}/`.padEnd(20) + `${size.width}x${size.height}`.padEnd(12) + `${n}${orientationNote}`;
}

export function buildReadme(sets: ReadmeSet[], landscapeDirs: Set<string>): string {
  const out: string[] = [];
  out.push('Store Shots export');
  out.push('==================');
  out.push('');
  const dirCount = sets.reduce((a, s) => a + s.sizeIds.length, 0);
  out.push(`${sets.length} set${sets.length === 1 ? '' : 's'}, ${dirCount} folder${dirCount === 1 ? '' : 's'}.`);
  out.push('Every image is PNG-24 with no alpha channel, which is what both stores require.');
  out.push('');

  for (const set of sets) {
    out.push(set.label.toUpperCase());
    // Group this set's folders by the obligation each discharges.
    const byObligation = new Map<string, string[]>();
    for (const id of set.sizeIds) {
      const key = obligationOf(getSize(id));
      byObligation.set(key, [...(byObligation.get(key) ?? []), id]);
    }
    for (const id of set.sizeIds) {
      const landscape = landscapeDirs.has(id);
      // Print the dimensions the FILES actually have. The size table stores
      // portrait, and a landscape folder's PNGs are those swapped — printing
      // the table value would have the README contradict the images it is
      // describing, which is worse than printing nothing.
      const size = orientSize(getSize(id), landscape ? 'landscape' : 'portrait');
      out.push(line(id, size, set.slideCount, landscape ? ' (landscape)' : ''));
    }
    for (const [, ids] of byObligation) {
      if (ids.length < 2) continue;
      out.push('');
      out.push(
        `  ${ids.join(' and ')} are ONE requirement — that slot accepts either size.`,
      );
      out.push(`  Upload one of them, not both.`);
    }
    // Where several folders are NOT a declared group, say nothing about which
    // to submit. Listing them is the honest limit of what this app knows.
    const ungrouped = [...byObligation.values()].filter((ids) => ids.length === 1).length;
    if (ungrouped > 1) {
      out.push('');
      out.push(
        `  The ${ungrouped} folders above are separate presets. Store Shots does not`,
      );
      out.push(`  know which your listing requires — check the store's own console.`);
    }
    out.push('');
  }

  if (landscapeDirs.size > 0) {
    out.push('LANDSCAPE');
    out.push('  Folders marked (landscape) contain images wider than they are tall,');
    out.push('  at the same size bucket as their portrait siblings with width and');
    out.push('  height swapped. Both stores accept that within one screenshot set.');
    out.push('');
  }
  return out.join('\n');
}
