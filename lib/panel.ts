import { browser } from '#imports';

interface SidePanelApi {
  open(options: { windowId: number }): Promise<void>;
}

interface SidebarActionApi {
  open(): Promise<void>;
}

/** The browser APIs `openPanel` needs. Either can be missing. */
interface PanelApis {
  sidePanel?: SidePanelApi;
  sidebarAction?: SidebarActionApi;
}

/**
 * Opens the side panel (Chrome) or the sidebar (Firefox). Call it straight
 * from a click or Enter handler: both APIs need a user gesture, so the open
 * call runs before any await. On Chrome, pass the popup's `windowId`; without
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
