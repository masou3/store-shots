'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { ensureBitmap, removeImage, saveImage } from './imageStore';

const LS_IMAGE_KEY = 'storeshots:imageKey';

// Single screenshot in, three ways: drag-and-drop, click-to-browse, clipboard
// paste. The current key is shared via localStorage so every page (including
// /debug/frames) renders the same uploaded screenshot.
export function useScreenshot() {
  const [imageKey, setImageKey] = useState<string | null>(null);
  // Increments on user-initiated uploads only, never on the initial restore
  // from localStorage — lets pages react to "the user just dropped something".
  const [uploadCount, setUploadCount] = useState(0);

  useEffect(() => {
    const key = localStorage.getItem(LS_IMAGE_KEY);
    if (!key) return;
    ensureBitmap(key).then((ok) => {
      if (ok) setImageKey(key);
      else localStorage.removeItem(LS_IMAGE_KEY);
    });
  }, []);

  const acceptFile = useCallback(async (file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return;
    const oldKey = localStorage.getItem(LS_IMAGE_KEY);
    const key = await saveImage(file);
    localStorage.setItem(LS_IMAGE_KEY, key);
    setImageKey(key);
    setUploadCount((n) => n + 1);
    if (oldKey) await removeImage(oldKey);
  }, []);

  // Clipboard paste, anywhere on the page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = e.clipboardData?.files?.[0];
      if (file) acceptFile(file);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptFile]);

  const openPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) acceptFile(file);
    };
    input.click();
  }, [acceptFile]);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) acceptFile(file);
    },
    [acceptFile],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  return { imageKey, acceptFile, openPicker, uploadCount, dropProps: { onDrop, onDragOver } };
}
