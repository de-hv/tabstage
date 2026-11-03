import { browser, storage } from '#imports';

interface SidePanelApi {
  open(options: { windowId: number }): Promise<void>;
  setPanelBehavior?(behavior: { openPanelOnActionClick: boolean }): Promise<void>;
}

interface SidebarActionApi {
  open(): Promise<void>;
  toggle?(): Promise<void>;
}

/** The browser APIs the panel helpers need. Any can be missing. */
interface PanelApis {
  sidePanel?: SidePanelApi;
  sidebarAction?: SidebarActionApi;
  action?: { onClicked: { addListener(listener: () => void): void } };
}

/**
 * When the palette was last requested (`Date.now()`), or `null`. The
 * background writes it and the panel opens the palette and clears it.
 */
export const paletteRequestItem = storage.defineItem<number | null>('session:paletteRequest', {
  fallback: null,
});

/** A request older than this is ignored by a panel that opens later. */
export const PALETTE_REQUEST_TTL_MS = 5000;

/**
 * Opens the side panel (Chrome) or the sidebar (Firefox). Call it straight
 * from a click or Enter handler: both APIs need a user gesture, so the open
 * call runs before any await. On Chrome, pass the window id; without
 * it, the current window is looked up first, which can lose the gesture.
 * Resolves to `false` when the browser has no panel API.
 */
export async function openPanel(windowId?: number): Promise<boolean> {
  const apis = browser as unknown as PanelApis;

  if (import.meta.env.BROWSER === 'firefox') {
    if (!apis.sidebarAction?.open) return false;
    await apis.sidebarAction.open();
    return true;
  }

  if (!apis.sidePanel?.open) return false;
  // `getCurrent` can resolve to nothing in a page with no window (tests).
  const id = windowId ?? (await browser.windows.getCurrent())?.id;
  if (id === undefined) return false;
  await apis.sidePanel.open({ windowId: id });
  return true;
}

/**
 * Makes the toolbar icon open and close the panel. Chrome does it itself
 * once `openPanelOnActionClick` is set; Firefox toggles the sidebar from the
 * click. Call it synchronously from `defineBackground`.
 */
export function enableActionToggle(): void {
  const apis = browser as unknown as PanelApis;
  if (import.meta.env.BROWSER === 'firefox') {
    apis.action?.onClicked.addListener(() => {
      // Called straight from the click: toggle needs the user gesture.
      void apis.sidebarAction?.toggle?.().catch((error: unknown) => {
        console.warn('Tabstage: could not toggle the sidebar', error);
      });
    });
    return;
  }
  void apis.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.warn('Tabstage: could not set the panel behavior', error));
}

/**
 * Opens the panel and asks it to show the palette (`Alt+Shift+K`). The open
 * call goes first, while the shortcut's user gesture still holds.
 */
export async function openPalette(windowId?: number): Promise<void> {
  const opening = openPanel(windowId);
  await paletteRequestItem.setValue(Date.now());
  await opening;
}
