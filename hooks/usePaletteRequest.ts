import { useEffect } from 'react';
import { PALETTE_REQUEST_TTL_MS, paletteRequestItem } from '@/lib/panel';

/**
 * Calls `onRequest` when the background asks for the palette
 * (`Alt+Shift+K`): right away if the panel opened because of a recent
 * request, and on every later one. Each request is cleared once handled.
 */
export function usePaletteRequest(onRequest: () => void): void {
  useEffect(() => {
    let active = true;
    const handle = (at: number | null) => {
      if (!active || at === null) return;
      if (Date.now() - at > PALETTE_REQUEST_TTL_MS) return;
      onRequest();
      void paletteRequestItem.setValue(null).catch(() => undefined);
    };
    paletteRequestItem
      .getValue()
      .then(handle)
      .catch(() => undefined);
    const unwatch = paletteRequestItem.watch(handle);
    return () => {
      active = false;
      unwatch();
    };
  }, [onRequest]);
}
