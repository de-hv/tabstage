import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openPanel } from './panel';

interface Apis {
  sidePanel?: { open: (options: { windowId: number }) => Promise<void> };
  sidebarAction?: { open: () => Promise<void> };
}

const api = fakeBrowser as unknown as Apis;
const original = { sidePanel: api.sidePanel, sidebarAction: api.sidebarAction };

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  api.sidePanel = original.sidePanel;
  api.sidebarAction = original.sidebarAction;
});

describe('openPanel', () => {
  describe('on Chrome', () => {
    beforeEach(() => {
      vi.stubEnv('BROWSER', 'chrome');
    });

    it('opens the side panel in the given window', async () => {
      const open = vi.fn().mockResolvedValue(undefined);
      const sidebar = vi.fn();
      api.sidePanel = { open };
      api.sidebarAction = { open: sidebar };

      await expect(openPanel(7)).resolves.toBe(true);

      expect(open).toHaveBeenCalledWith({ windowId: 7 });
      expect(sidebar).not.toHaveBeenCalled();
    });

    it('calls sidePanel.open before it awaits anything', () => {
      const open = vi.fn().mockResolvedValue(undefined);
      api.sidePanel = { open };

      void openPanel(7);

      expect(open).toHaveBeenCalledOnce();
    });

    it('falls back to the current window without a windowId', async () => {
      const open = vi.fn().mockResolvedValue(undefined);
      api.sidePanel = { open };
      const current = await fakeBrowser.windows.create({ focused: true });

      await expect(openPanel()).resolves.toBe(true);

      expect(open).toHaveBeenCalledWith({ windowId: current?.id });
    });

    it('resolves to false when there is no current window', async () => {
      const open = vi.fn();
      api.sidePanel = { open };

      await expect(openPanel()).resolves.toBe(false);

      expect(open).not.toHaveBeenCalled();
    });

    it('resolves to false when browser.sidePanel is undefined', async () => {
      api.sidePanel = undefined;
      api.sidebarAction = { open: vi.fn() };

      await expect(openPanel(7)).resolves.toBe(false);

      expect(api.sidebarAction.open).not.toHaveBeenCalled();
    });
  });

  describe('on Firefox', () => {
    beforeEach(() => {
      vi.stubEnv('BROWSER', 'firefox');
    });

    it('opens the sidebar, synchronously', () => {
      const open = vi.fn().mockResolvedValue(undefined);
      const sidePanel = vi.fn();
      api.sidebarAction = { open };
      api.sidePanel = { open: sidePanel };

      const result = openPanel(7);

      expect(open).toHaveBeenCalledOnce();
      expect(sidePanel).not.toHaveBeenCalled();
      return expect(result).resolves.toBe(true);
    });

    it('resolves to false when browser.sidebarAction is undefined', async () => {
      api.sidebarAction = undefined;

      await expect(openPanel(7)).resolves.toBe(false);
    });
  });

  it('rejects when the browser refuses to open the panel', async () => {
    vi.stubEnv('BROWSER', 'chrome');
    api.sidePanel = { open: vi.fn().mockRejectedValue(new Error('No user gesture')) };

    await expect(openPanel(7)).rejects.toThrow('No user gesture');
  });
});
