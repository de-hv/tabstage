import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { PALETTE_REQUEST_TTL_MS, paletteRequestItem } from '@/lib/panel';
import { usePaletteRequest } from './usePaletteRequest';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  cleanup();
});

describe('usePaletteRequest', () => {
  it('opens the palette for a recent request made before the panel opened, and clears it', async () => {
    await paletteRequestItem.setValue(Date.now());
    const onRequest = vi.fn();

    renderHook(() => usePaletteRequest(onRequest));

    await waitFor(() => expect(onRequest).toHaveBeenCalledOnce());
    await waitFor(async () => expect(await paletteRequestItem.getValue()).toBeNull());
  });

  it('ignores an old request', async () => {
    await paletteRequestItem.setValue(Date.now() - PALETTE_REQUEST_TTL_MS - 1);
    const onRequest = vi.fn();

    renderHook(() => usePaletteRequest(onRequest));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onRequest).not.toHaveBeenCalled();
  });

  it('opens the palette for a request made while the panel is open', async () => {
    const onRequest = vi.fn();
    renderHook(() => usePaletteRequest(onRequest));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await paletteRequestItem.setValue(Date.now());

    await waitFor(() => expect(onRequest).toHaveBeenCalledOnce());
  });
});
