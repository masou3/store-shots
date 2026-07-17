'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Slide, StoreSize, Theme } from '@/lib/types';
import { getSize } from '@/lib/sizes';
import {
  STORE_KINDS,
  STORE_ORDER,
  capFor,
  otherStore,
  type StoreKind,
} from '@/lib/storeKinds';
import { exportAllZip, type ExportProgress, type ExportSet } from '@/lib/bulkExport';
import { DEVICE_SPECS } from '@/lib/deviceSpecs';
import { LAYOUTS } from '@/lib/layouts';
import { GRADIENT_PRESETS } from '@/lib/presets';
import { FONT_FAMILIES, loadRenderFonts } from '@/lib/fonts';
import { copyWarning } from '@/lib/copyWarning';
import { renderSlide, drawSafeAreaOverlay, measureSetTextZone } from '@/lib/render';
import JSZip from 'jszip';
import { exportSlidePng, downloadBlob } from '@/lib/export';
import { removeImage, saveImage } from '@/lib/imageStore';
import {
  buildProjectFile,
  parseProjectFile,
  restoreProjectImages,
  saveProjectLocal,
  type ProjectFile,
  type ProjectSnapshot,
} from '@/lib/persistence';
import { useStore } from '@/lib/store';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-neutral-800 px-3 py-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-200';
const selectCls = inputCls + ' w-36';

const shortLabel = (id: string) => getSize(id).label.replace(/\s*\(.*\)/, '');

function Thumb({
  slide,
  index,
  slideCount,
  theme,
  size,
  setBlockH,
  selected,
  fontsReady,
  imageVersion,
  onSelect,
  onDelete,
  onReorder,
}: {
  slide: Slide;
  index: number;
  slideCount: number;
  theme: Theme;
  size: StoreSize;
  setBlockH: number;
  selected: boolean;
  fontsReady: boolean;
  imageVersion: number;
  onSelect: () => void;
  onDelete: () => void;
  onReorder: (from: number, to: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const CSS_H = 88;

  useEffect(() => {
    if (!fontsReady) return;
    const canvas = ref.current;
    if (!canvas) return;
    const aspect = size.width / size.height;
    const cssW = CSS_H * aspect;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${CSS_H}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(CSS_H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSlide(ctx, slide, theme, size, canvas.width / size.width, {
      setBlockH,
      slideIndex: index,
      slideCount,
    });
  }, [slide, index, slideCount, theme, size, setBlockH, fontsReady, imageVersion]);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-slide-index', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-slide-index')) e.preventDefault();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-slide-index');
        if (raw === '') return;
        e.preventDefault();
        e.stopPropagation();
        onReorder(Number(raw), index);
      }}
      onClick={onSelect}
      className={
        'group relative shrink-0 cursor-pointer rounded border p-0.5 ' +
        (selected ? 'border-indigo-500' : 'border-neutral-800 hover:border-neutral-600')
      }
    >
      <canvas ref={ref} className="rounded-sm" />
      <span className="absolute bottom-0.5 left-1 font-mono text-[10px] text-white/70">
        {index + 1}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete slide"
        className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded bg-black/70 text-[10px] text-white group-hover:flex"
      >
        ×
      </button>
    </div>
  );
}

// One slide in the row view. The dependency array IS the invalidation rule:
// setBlockH is a primitive recomputed on every change, so if the set-wide zone
// moved, every row slide re-renders in the same commit; if it didn't, only the
// edited slide (new object identity) re-renders. Project-level changes replace
// `theme`, count changes hit `slideCount`/`cssH` — all re-render. A per-slide
// cache keyed on the slide alone would show the edited slide correct and the
// rest stale.
function RowSlide({
  slide,
  index,
  slideCount,
  theme,
  size,
  setBlockH,
  cssH,
  selected,
  fontsReady,
  imageVersion,
  onSelect,
}: {
  slide: Slide;
  index: number;
  slideCount: number;
  theme: Theme;
  size: StoreSize;
  setBlockH: number;
  cssH: number;
  selected: boolean;
  fontsReady: boolean;
  imageVersion: number;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fontsReady || cssH <= 0) return;
    const canvas = ref.current;
    if (!canvas) return;
    const aspect = size.width / size.height;
    const cssW = cssH * aspect;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSlide(ctx, slide, theme, size, canvas.width / size.width, {
      setBlockH,
      slideIndex: index,
      slideCount,
    });
  }, [slide, index, slideCount, theme, size, setBlockH, cssH, fontsReady, imageVersion]);

  return (
    <div
      onClick={onSelect}
      className={
        'shrink-0 cursor-pointer rounded-sm border ' +
        (selected ? 'border-indigo-500' : 'border-transparent hover:border-neutral-600')
      }
    >
      <canvas ref={ref} className="block rounded-sm" data-row-index={index} />
    </div>
  );
}

// Blank project opens on this choice; nothing else on screen until made.
function Gate({ onChoose }: { onChoose: (k: StoreKind) => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 bg-neutral-950">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-neutral-100">Store Shots</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Which store are you making screenshots for?
        </p>
      </div>
      <div className="flex gap-4">
        {STORE_ORDER.map((k) => {
          const cfg = STORE_KINDS[k];
          const def = getSize(cfg.defaultSizeId);
          return (
            <button
              key={k}
              onClick={() => onChoose(k)}
              className="flex w-52 flex-col items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-8 text-neutral-200 hover:border-indigo-500 hover:bg-neutral-800"
            >
              <span className="text-base font-semibold">{cfg.label}</span>
              <span className="font-mono text-[11px] text-neutral-500">
                {DEVICE_SPECS.find((d) => d.id === cfg.defaultFrameId)?.label} · {def.width}×
                {def.height}
              </span>
            </button>
          );
        })}
      </div>
      <p className="max-w-md text-center text-[11px] text-neutral-600">
        You can set up the other store afterwards by cloning this one — the two sets stay
        independent.
      </p>
    </div>
  );
}

export default function Home() {
  const hydrated = useStore((s) => s.hydrated);
  const activeStore = useStore((s) => s.activeStore);
  const sets = useStore((s) => s.sets);
  const exportFormat = useStore((s) => s.exportFormat);
  const hydrate = useStore((s) => s.hydrate);
  const chooseStore = useStore((s) => s.chooseStore);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Autosave: debounced to localStorage on any project change; images stay in
  // IndexedDB.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      // Checked at fire time: a Reset mid-debounce must not resurrect state.
      if (useStore.getState().persistSuspended) return;
      const s = useStore.getState();
      saveProjectLocal({ activeStore: s.activeStore, sets: s.sets, exportFormat: s.exportFormat });
    }, 500);
    return () => clearTimeout(t);
  }, [hydrated, activeStore, sets, exportFormat]);

  // Flush on pagehide so an edit made just before closing survives hidden-tab
  // timer throttling.
  useEffect(() => {
    const flush = () => {
      const s = useStore.getState();
      if (!s.hydrated || s.persistSuspended) return;
      saveProjectLocal({ activeStore: s.activeStore, sets: s.sets, exportFormat: s.exportFormat });
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Dev-only hook so debug tooling can drive the real pipeline without
  // synthetic UI events.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as Record<string, unknown>).__storeshots = {
      useStore,
      exportAllZip,
      buildProjectFile,
      parseProjectFile,
      restoreProjectImages,
      saveProjectLocal,
      saveImage,
      renderSlide,
      JSZip,
    };
  }, []);

  if (!hydrated) return null;
  if (!activeStore || !sets[activeStore]) return <Gate onChoose={chooseStore} />;
  return <Workbench activeStore={activeStore} />;
}

function Workbench({ activeStore }: { activeStore: StoreKind }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ProjectFile | null>(null);
  const [pendingReset, setPendingReset] = useState(false);
  const [pendingClone, setPendingClone] = useState<{
    willTruncate: boolean;
    willOverwrite: boolean;
    cap: number;
    dropped: number[];
  } | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'row'>('single');
  const [notice, setNotice] = useState<string | null>(null);
  const [rowBox, setRowBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const store = useStore();
  const activeSet = store.sets[activeStore]!;
  const {
    theme,
    slides,
    currentSlideId,
    sizeId,
    layoutId,
    exportSizeIds,
  } = activeSet;
  const {
    setSizeId,
    setLayoutId,
    patchTheme,
    patchGradient,
    patchText,
    patchLayout,
    patchSlide,
    selectSlide,
    addSlide,
    deleteSlide,
    reorderSlide,
    assignImageKeys,
    toggleExportSize,
    exportFormat,
    setExportFormat,
    imagesVersion,
    bumpImages,
    replaceProject,
    resetProject,
    switchStore,
    cloneToOther,
  } = store;

  const size = getSize(sizeId);
  const slide = slides.find((s) => s.id === currentSlideId) ?? slides[0];
  const currentIndex = slides.indexOf(slide);
  const setBlockH = fontsReady ? measureSetTextZone(slides, theme, size) : 0;
  const cap = capFor(activeStore);
  const presetIds = STORE_KINDS[activeStore].presetIds;
  const other = otherStore(activeStore);
  const otherExists = !!store.sets[other];

  const n = slides.length;
  const capState =
    n > cap.max
      ? { text: `${n}/${cap.max} · over by ${n - cap.max}`, cls: 'text-red-400' }
      : n < cap.min
        ? { text: `${n}/${cap.max} · under min ${cap.min}`, cls: 'text-red-400' }
        : cap.featuredMin && n < cap.featuredMin
          ? { text: `${n}/${cap.max} · under ${cap.featuredMin} for featured`, cls: 'text-amber-400' }
          : { text: `${n}/${cap.max}`, cls: 'text-green-500' };

  useEffect(() => {
    loadRenderFonts(theme.text.family).then(() => setFontsReady(true));
  }, [theme.text.family]);

  const importFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => /^image\/(png|jpeg)$/.test(f.type));
      if (images.length === 0) return;
      const keys: string[] = [];
      for (const f of images) keys.push(await saveImage(f));
      assignImageKeys(keys);
      bumpImages();
    },
    [assignImageKeys, bumpImages],
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) importFiles(files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importFiles]);

  const openPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg';
    input.multiple = true;
    input.onchange = () => importFiles(Array.from(input.files ?? []));
    input.click();
  }, [importFiles]);

  const dropProps = {
    onDrop: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-slide-index')) return;
      e.preventDefault();
      importFiles(Array.from(e.dataTransfer?.files ?? []));
    },
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('application/x-slide-index')) e.preventDefault();
    },
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !fontsReady) return;
    const aspect = size.width / size.height;
    const cssH = Math.min(container.clientHeight, container.clientWidth / aspect);
    const cssW = cssH * aspect;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = canvas.width / size.width;
    renderSlide(ctx, slide, theme, size, scale, {
      setBlockH,
      slideIndex: currentIndex,
      slideCount: slides.length,
    });
    if (showSafeArea) drawSafeAreaOverlay(ctx, size, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, slide, slides, sizeId, showSafeArea, fontsReady, setBlockH, imagesVersion, viewMode]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setRowBox({ w: container.clientWidth, h: container.clientHeight });
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    });
    ro.observe(container);
    setRowBox({ w: container.clientWidth, h: container.clientHeight });
    return () => ro.disconnect();
  }, [draw, viewMode]);

  const ROW_GAP = 8;
  const rowSlideH = Math.max(
    0,
    Math.min(
      rowBox.h - 8,
      (rowBox.w - ROW_GAP * (slides.length - 1) - 16) /
        (slides.length * (size.width / size.height)),
    ),
  );

  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      const blob = await exportSlidePng(slide, theme, size, {
        setBlockH,
        slideIndex: currentIndex,
        slideCount: slides.length,
      });
      downloadBlob(blob, `storeshots-${size.id}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function onExportAll() {
    const all = useStore.getState().sets;
    const exportSets: ExportSet[] = Object.values(all)
      .filter((s): s is NonNullable<typeof s> => !!s && s.exportSizeIds.length > 0)
      .map((s) => ({ theme: s.theme, slides: s.slides, sizeIds: s.exportSizeIds }));
    const presetTotal = exportSets.reduce((a, s) => a + s.sizeIds.length, 0);
    if (presetTotal === 0) {
      setError('No output presets ticked in any set.');
      return;
    }
    setBulkProgress({ stage: 'render', slide: 0, slides: 0, preset: 1, presets: presetTotal });
    setError(null);
    setNotice(null);
    try {
      const blob = await exportAllZip(exportSets, exportFormat, setBulkProgress);
      downloadBlob(blob, 'storeshots.zip');
      setNotice(`Exported ${presetTotal} preset${presetTotal === 1 ? '' : 's'} across both sets.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkProgress(null);
    }
  }

  const bulkLabel =
    bulkProgress === null
      ? 'Export all'
      : bulkProgress.stage === 'zip'
        ? 'Zipping…'
        : `preset ${bulkProgress.preset}/${bulkProgress.presets} · slide ${bulkProgress.slide}/${bulkProgress.slides}`;

  function snapshot(): ProjectSnapshot {
    const s = useStore.getState();
    return { activeStore: s.activeStore, sets: s.sets, exportFormat: s.exportFormat };
  }

  async function onExportProject() {
    setError(null);
    try {
      const file = await buildProjectFile(snapshot());
      downloadBlob(
        new Blob([JSON.stringify(file)], { type: 'application/json' }),
        'storeshots-project.json',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onImportProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setError(null);
      try {
        setPendingImport(parseProjectFile(await f.text()));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  }

  const allCurrentKeys = () =>
    Object.values(useStore.getState().sets)
      .flatMap((s) => (s ? s.slides : []))
      .map((sl) => sl.imageKey)
      .filter((k): k is string => Boolean(k));

  const importSlideCount = (f: ProjectFile) =>
    Object.values(f.sets).reduce((a, s) => a + (s ? s.slides.length : 0), 0);

  async function onConfirmImport() {
    if (!pendingImport) return;
    setError(null);
    try {
      const oldKeys = allCurrentKeys();
      await restoreProjectImages(pendingImport);
      replaceProject(pendingImport);
      const newKeys = new Set(
        Object.values(pendingImport.sets).flatMap((s) => (s ? s.slides.map((sl) => sl.imageKey) : [])),
      );
      for (const k of oldKeys) if (!newKeys.has(k)) void removeImage(k);
      setPendingImport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Warn before the clone, never after — the tail is cut and can't be
  // recovered without reordering first. Clone runs immediately only when
  // nothing is lost or overwritten.
  function requestClone() {
    const targetCap = capFor(other).max;
    const willTruncate = slides.length > targetCap;
    const willOverwrite = otherExists;
    if (!willTruncate && !willOverwrite) {
      void runClone();
      return;
    }
    const dropped: number[] = [];
    for (let i = targetCap; i < slides.length; i++) dropped.push(i + 1);
    setPendingClone({ willTruncate, willOverwrite, cap: targetCap, dropped });
  }

  async function runClone() {
    setPendingClone(null);
    setError(null);
    try {
      await cloneToOther();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function droppedText(d: number[]): string {
    if (d.length === 1) return `Slide ${d[0]} won't be copied.`;
    if (d.length === 2) return `Slides ${d[0]} and ${d[1]} won't be copied.`;
    return `Slides ${d[0]}–${d[d.length - 1]} won't be copied.`;
  }

  const headlineWarning = copyWarning(slide.headline);
  const subheadWarning = slide.subhead ? copyWarning(slide.subhead) : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold text-neutral-100">Store Shots</h1>
        {/* Store switcher: existing sets switch active; the other store is set
            up by cloning. */}
        <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
          {STORE_ORDER.map((k) => {
            const exists = !!store.sets[k];
            return (
              <button
                key={k}
                disabled={!exists}
                onClick={() => switchStore(k)}
                className={
                  activeStore === k
                    ? 'bg-neutral-700 px-3 py-1 text-neutral-100'
                    : exists
                      ? 'px-3 py-1 text-neutral-400 hover:text-neutral-200'
                      : 'px-3 py-1 text-neutral-700'
                }
              >
                {STORE_KINDS[k].label}
              </button>
            );
          })}
        </div>
        <button
          onClick={requestClone}
          className={
            otherExists
              ? 'rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-500 hover:border-neutral-500'
              : 'rounded border border-neutral-600 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-400'
          }
        >
          {otherExists ? 'Re-clone' : 'Set up for'} {STORE_KINDS[other].label}
        </button>

        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={showSafeArea}
              onChange={(e) => setShowSafeArea(e.target.checked)}
            />
            Safe area
          </label>
          <button
            onClick={onExport}
            disabled={exporting || bulkProgress !== null || !fontsReady}
            className="rounded border border-neutral-600 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:border-neutral-400 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export slide'}
          </button>
          <button
            onClick={onExportAll}
            disabled={exporting || bulkProgress !== null || !fontsReady}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {bulkLabel}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900 bg-red-950 px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center border-b border-neutral-700 bg-neutral-900 px-4 py-2 text-xs text-neutral-300">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-neutral-500">
            ×
          </button>
        </div>
      )}
      {pendingClone && (
        <div className="flex items-center gap-3 border-b border-amber-800 bg-amber-950/60 px-4 py-2 text-xs text-amber-300">
          <span>
            {pendingClone.willTruncate && (
              <>
                {STORE_KINDS[other].label} takes {pendingClone.cap} screenshots.{' '}
                {droppedText(pendingClone.dropped)}{' '}
              </>
            )}
            {pendingClone.willOverwrite && (
              <>This overwrites the entire {STORE_KINDS[other].label} set. </>
            )}
            Continue?
          </span>
          <button
            onClick={runClone}
            className="rounded bg-amber-600 px-2 py-1 font-semibold text-black"
          >
            {pendingClone.willOverwrite ? 'Overwrite' : 'Clone'}
          </button>
          <button
            onClick={() => setPendingClone(null)}
            className="rounded border border-neutral-600 px-2 py-1 text-neutral-300"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800">
          <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
            {STORE_KINDS[activeStore].label} set
          </p>
          <Section title="Project file">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onExportProject}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Export JSON
              </button>
              <button
                onClick={onImportProject}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Import JSON…
              </button>
              <button
                onClick={() => setPendingReset(true)}
                className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:border-red-700"
              >
                Reset project
              </button>
            </div>
            {pendingReset && (
              <div className="rounded border border-red-800 bg-red-950/60 p-2 text-xs text-red-300">
                <p>Reset to a blank project? This clears both sets and all stored images.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={async () => {
                      setPendingReset(false);
                      setError(null);
                      try {
                        await resetProject();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                    className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setPendingReset(false)}
                    className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {pendingImport && (
              <div className="rounded border border-amber-700 bg-amber-950/60 p-2 text-xs text-amber-300">
                <p>
                  Replace the current project with the imported one? (
                  {importSlideCount(pendingImport)} slide
                  {importSlideCount(pendingImport) === 1 ? '' : 's'} across{' '}
                  {Object.keys(pendingImport.sets).length} set
                  {Object.keys(pendingImport.sets).length === 1 ? '' : 's'})
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={onConfirmImport}
                    className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-black"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => setPendingImport(null)}
                    className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Section>
          <Section title="Background">
            <Row label="Mode">
              <select
                className={selectCls}
                value={theme.gradient.mode}
                onChange={(e) => patchGradient({ mode: e.target.value as 'gradient' | 'solid' })}
              >
                <option value="gradient">gradient</option>
                <option value="solid">solid</option>
              </select>
            </Row>
            <Row label={theme.gradient.mode === 'solid' ? 'Colour' : 'Colour A'}>
              <input
                type="color"
                value={theme.gradient.from}
                onChange={(e) => patchGradient({ from: e.target.value })}
              />
            </Row>
            {theme.gradient.mode === 'gradient' && (
              <>
                <Row label="Colour B">
                  <input
                    type="color"
                    value={theme.gradient.to}
                    onChange={(e) => patchGradient({ to: e.target.value })}
                  />
                </Row>
                <Row label={`Angle ${theme.gradient.angle}°`}>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={theme.gradient.angle}
                    onChange={(e) => patchGradient({ angle: Number(e.target.value) })}
                    className="w-36"
                  />
                </Row>
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  <input
                    type="checkbox"
                    checked={theme.gradient.continuous}
                    onChange={(e) => patchGradient({ continuous: e.target.checked })}
                  />
                  Continuous across set
                </label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {GRADIENT_PRESETS.map((p) => (
                    <button
                      key={p.from + p.to}
                      title={`${p.from} → ${p.to}`}
                      onClick={() => patchGradient({ mode: 'gradient', from: p.from, to: p.to })}
                      className="h-6 w-9 rounded border border-neutral-700"
                      style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                    />
                  ))}
                </div>
              </>
            )}
            <Row label={`Grain ${theme.grain.toFixed(3)}`}>
              <input
                type="range"
                min={0}
                max={0.12}
                step={0.005}
                value={theme.grain}
                onChange={(e) => patchTheme({ grain: Number(e.target.value) })}
                className="w-36"
              />
            </Row>
          </Section>

          <Section title="Device">
            <Row label="Frame">
              <select
                className={selectCls}
                value={theme.frameId}
                onChange={(e) => patchTheme({ frameId: e.target.value })}
              >
                {DEVICE_SPECS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Frame colour">
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.frameColour ?? '#1c1c1e'}
                  onChange={(e) => patchTheme({ frameColour: e.target.value })}
                />
                {theme.frameColour && (
                  <button
                    onClick={() => patchTheme({ frameColour: null })}
                    className="text-[11px] text-neutral-500 underline"
                  >
                    reset
                  </button>
                )}
              </span>
            </Row>
            <Row label="Screenshot fit">
              <select
                className={selectCls}
                value={theme.layout.imageFit}
                onChange={(e) => patchLayout({ imageFit: e.target.value as 'cover' | 'contain' })}
              >
                <option value="cover">cover</option>
                <option value="contain">contain</option>
              </select>
            </Row>
          </Section>

          <Section title="Layout">
            <div className="flex flex-col gap-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLayoutId(l.id)}
                  className={
                    'rounded border px-2 py-1.5 text-left text-xs ' +
                    (layoutId === l.id
                      ? 'border-indigo-500 bg-indigo-950 text-neutral-100'
                      : 'border-neutral-700 text-neutral-400 hover:text-neutral-200')
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
            <Row label={`Scale ${theme.layout.deviceScale.toFixed(2)}`}>
              <input
                type="range"
                min={0.4}
                max={1.2}
                step={0.01}
                value={theme.layout.deviceScale}
                onChange={(e) => patchLayout({ deviceScale: Number(e.target.value) })}
                className="w-36"
              />
            </Row>
            <Row label={`Offset Y ${theme.layout.deviceOffsetY}`}>
              <input
                type="range"
                min={-600}
                max={600}
                step={4}
                value={theme.layout.deviceOffsetY}
                onChange={(e) => patchLayout({ deviceOffsetY: Number(e.target.value) })}
                className="w-36"
              />
            </Row>
          </Section>

          <Section title="Type">
            <Row label="Family">
              <select
                className={selectCls}
                value={theme.text.family}
                onChange={(e) => patchText({ family: e.target.value as typeof theme.text.family })}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={`Size ${theme.text.sizePct.toFixed(2)}%`}>
              <input
                type="range"
                min={4}
                max={14}
                step={0.25}
                value={theme.text.sizePct}
                onChange={(e) => patchText({ sizePct: Number(e.target.value) })}
                className="w-36"
              />
            </Row>
            <Row label="Weight">
              <select
                className={selectCls}
                value={theme.text.weight}
                onChange={(e) =>
                  patchText({ weight: Number(e.target.value) as 400 | 600 | 700 | 800 })
                }
              >
                {[400, 600, 700, 800].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Colour">
              <input
                type="color"
                value={theme.text.colour}
                onChange={(e) => patchText({ colour: e.target.value })}
              />
            </Row>
            <Row label="Align">
              <select
                className={selectCls}
                value={theme.text.align}
                onChange={(e) => patchText({ align: e.target.value as 'left' | 'center' | 'right' })}
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </Row>
            <Row label={`Line height ${theme.text.lineHeight.toFixed(2)}`}>
              <input
                type="range"
                min={0.9}
                max={1.6}
                step={0.05}
                value={theme.text.lineHeight}
                onChange={(e) => patchText({ lineHeight: Number(e.target.value) })}
                className="w-36"
              />
            </Row>
          </Section>

          <Section title="Export">
            <p className={`font-mono text-[11px] ${capState.cls}`} data-cap={activeStore}>
              {STORE_KINDS[activeStore].label} · {capState.text}
            </p>
            {presetIds.map((id) => {
              const s = getSize(id);
              return (
                <label key={id} className="flex items-center gap-2 text-xs text-neutral-400">
                  <input
                    type="checkbox"
                    checked={exportSizeIds.includes(id)}
                    onChange={() => toggleExportSize(id)}
                  />
                  <span>{shortLabel(id)}</span>
                  <span className="ml-auto font-mono text-[10px] text-neutral-600">
                    {s.width}×{s.height}
                  </span>
                </label>
              );
            })}
            <Row label="Format">
              <select
                className={selectCls}
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'png' | 'jpeg')}
              >
                <option value="png">PNG-24 (store-safe)</option>
                <option value="jpeg">JPEG 0.92</option>
              </select>
            </Row>
            <p className="text-[11px] leading-snug text-neutral-600">
              Export all zips every ticked preset across both sets, one folder each.
            </p>
            {exportFormat === 'jpeg' && (
              <p className="text-[11px] leading-snug text-amber-400">
                JPEG will band across these gradients. PNG-24 is the default because
                canvas-native PNG carries an alpha channel both stores reject; the PNG path
                strips it.
              </p>
            )}
          </Section>

          <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
            Slide {currentIndex + 1} of {slides.length}
          </p>
          <Section title="Text">
            <textarea
              rows={2}
              value={slide.headline}
              onChange={(e) => patchSlide(slide.id, { headline: e.target.value })}
              placeholder="Headline"
              className={inputCls + ' w-full resize-y'}
            />
            {headlineWarning && (
              <p className="text-[11px] leading-snug text-amber-400">{headlineWarning}</p>
            )}
            <textarea
              rows={2}
              value={slide.subhead ?? ''}
              onChange={(e) =>
                patchSlide(slide.id, {
                  subhead: e.target.value === '' ? undefined : e.target.value,
                })
              }
              placeholder="Subheadline (optional)"
              className={inputCls + ' w-full resize-y'}
            />
            {subheadWarning && (
              <p className="text-[11px] leading-snug text-amber-400">{subheadWarning}</p>
            )}
            <p className="text-[11px] text-neutral-600">
              image: drop on the preview, click it, or paste — multi-file drop fans across
              slides from this one
            </p>
          </Section>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col items-center gap-2 p-4">
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
              {presetIds.map((id) => (
                <button
                  key={id}
                  onClick={() => setSizeId(id)}
                  className={
                    sizeId === id
                      ? 'bg-neutral-700 px-3 py-1 text-neutral-100'
                      : 'px-3 py-1 text-neutral-400 hover:text-neutral-200'
                  }
                >
                  {shortLabel(id)}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
              {(['single', 'row'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={
                    viewMode === m
                      ? 'bg-neutral-700 px-3 py-1 capitalize text-neutral-100'
                      : 'px-3 py-1 capitalize text-neutral-400 hover:text-neutral-200'
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={containerRef}
            {...dropProps}
            className="flex min-h-0 w-full flex-1 items-center justify-center"
          >
            {viewMode === 'single' ? (
              <canvas
                ref={canvasRef}
                onClick={openPicker}
                className="cursor-pointer rounded shadow-2xl shadow-black/60"
                title="Click to choose screenshots, or drop / paste"
              />
            ) : (
              <div className="flex items-center justify-center" style={{ gap: ROW_GAP }}>
                {slides.map((s, i) => (
                  <RowSlide
                    key={s.id}
                    slide={s}
                    index={i}
                    slideCount={slides.length}
                    theme={theme}
                    size={size}
                    setBlockH={setBlockH}
                    cssH={rowSlideH}
                    selected={s.id === currentSlideId}
                    fontsReady={fontsReady}
                    imageVersion={imagesVersion}
                    onSelect={() => selectSlide(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
          <p className="font-mono text-xs text-neutral-500">
            {size.width} × {size.height}
            {viewMode === 'row' ? ` · ${slides.length} slides` : ''}
          </p>
        </main>
      </div>

      <footer
        className="flex items-center gap-2 overflow-x-auto border-t border-neutral-800 px-3 py-2"
        {...dropProps}
      >
        {slides.map((s, i) => (
          <Thumb
            key={s.id}
            slide={s}
            index={i}
            slideCount={slides.length}
            theme={theme}
            size={size}
            setBlockH={setBlockH}
            selected={s.id === currentSlideId}
            fontsReady={fontsReady}
            imageVersion={imagesVersion}
            onSelect={() => selectSlide(s.id)}
            onDelete={() => deleteSlide(s.id)}
            onReorder={reorderSlide}
          />
        ))}
        <button
          onClick={addSlide}
          disabled={slides.length >= cap.max}
          title={
            slides.length >= cap.max
              ? `At the ${cap.max}-slide cap for ${STORE_KINDS[activeStore].label}`
              : 'Add slide'
          }
          className="flex h-[92px] w-10 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-lg text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </footer>
    </div>
  );
}
