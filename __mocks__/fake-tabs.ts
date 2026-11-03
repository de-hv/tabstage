import { vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { MenuEntry } from '../lib/menus';

type Tab = Browser.tabs.Tab;

/** A browser event whose listeners tests can call with `trigger()`. */
export class FakeEvent<Args extends unknown[]> {
  private listeners: ((...args: Args) => unknown)[] = [];

  addListener = (listener: (...args: Args) => unknown): void => {
    this.listeners.push(listener);
  };

  removeListener = (listener: (...args: Args) => unknown): void => {
    this.listeners = this.listeners.filter((l) => l !== listener);
  };

  hasListener = (listener: (...args: Args) => unknown): boolean => this.listeners.includes(listener);

  hasListeners = (): boolean => this.listeners.length > 0;

  /** Calls every listener and waits for the promises they return. */
  async trigger(...args: Args): Promise<void> {
    await Promise.all(this.listeners.map((listener) => listener(...args)));
  }
}

interface Patch {
  target: Record<string, unknown>;
  key: string;
  original: unknown;
}

/** A native tab group as the opt-in cleanup sees it. */
export interface FakeNativeGroup {
  id: number;
  title: string;
  color: string;
}

/**
 * In-memory tabs, windows.update, commands, context menus, side panel,
 * sidebar, action click and permissions, installed on WXT's `fakeBrowser`.
 *
 * `tabGroups.*`, `tabs.group` and `tabs.ungroup` throw and are recorded in
 * `forbidden`, so a test can assert that the extension never touches native
 * groups. Only `allowNativeGroups()` (for the opt-in cleanup) replaces them
 * with a working fake.
 *
 * Unlike the real browser, the fake awaits event listeners inside the call
 * that fires them.
 */
export class FakeTabs {
  tabs: Tab[] = [];
  currentWindowId = 1;
  focusedWindowId: number | undefined;
  /** Every forbidden native-group call, as `"tabGroups.update"` etc. */
  readonly forbidden: string[] = [];
  /** The context menu entries, in creation order. */
  menus: MenuEntry[] = [];
  nativeGroups: FakeNativeGroup[] = [];
  /** Every `tabGroups.update` call made after `allowNativeGroups()`. */
  readonly groupUpdates: { groupId: number; properties: Record<string, unknown> }[] = [];

  readonly onCreated = new FakeEvent<[Tab]>();
  readonly onUpdated = new FakeEvent<[number, Browser.tabs.OnUpdatedInfo, Tab]>();
  readonly onRemoved = new FakeEvent<[number, Browser.tabs.OnRemovedInfo]>();
  readonly onCommand = new FakeEvent<[string, Tab | undefined]>();
  readonly onMenuClicked = new FakeEvent<[{ menuItemId: string | number }, Tab | undefined]>();
  readonly onActionClicked = new FakeEvent<[Tab]>();

  readonly sidePanel = {
    open: vi.fn<(options: { windowId: number }) => Promise<void>>().mockResolvedValue(undefined),
    setPanelBehavior: vi
      .fn<(behavior: { openPanelOnActionClick: boolean }) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  readonly sidebarAction = {
    open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    toggle: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  readonly permissionsRequest = vi
    .fn<(permissions: { permissions?: string[] }) => Promise<boolean>>()
    .mockResolvedValue(true);

  private nextTabId = 100;
  private patches: Patch[] = [];

  /** Creates a fake and installs it on `fakeBrowser`. */
  static install(): FakeTabs {
    return new FakeTabs().install();
  }

  /** Seeds the open tabs. Stored as copies. */
  with({ tabs = [] }: { tabs?: Tab[] }): this {
    this.tabs = tabs.map((tab) => ({ ...tab }));
    this.nextTabId = Math.max(99, ...this.tabs.map((tab) => tab.id ?? 0)) + 1;
    return this;
  }

  tab(tabId: number): Tab | undefined {
    return this.tabs.find((tab) => tab.id === tabId);
  }

  install(): this {
    const api = fakeBrowser as unknown as Record<string, Record<string, unknown>>;
    const tabs = api.tabs!;
    this.patch(tabs, 'create', this.createTab);
    this.patch(tabs, 'query', this.queryTabs);
    this.patch(tabs, 'get', this.getTab);
    this.patch(tabs, 'update', this.updateTab);
    this.patch(tabs, 'remove', this.removeTab);
    this.patch(tabs, 'onCreated', this.onCreated);
    this.patch(tabs, 'onUpdated', this.onUpdated);
    this.patch(tabs, 'onRemoved', this.onRemoved);
    this.patch(tabs, 'group', this.forbid('tabs.group'));
    this.patch(tabs, 'ungroup', this.forbid('tabs.ungroup'));
    this.patch(api, 'tabGroups', this.forbiddenTabGroups());
    this.patch(api.windows!, 'update', this.updateWindow);
    this.patch(api.commands!, 'onCommand', this.onCommand);
    const menus = {
      create: this.createMenu,
      removeAll: this.removeAllMenus,
      onClicked: this.onMenuClicked,
    };
    this.patch(api, 'contextMenus', menus);
    this.patch(api, 'menus', undefined);
    this.patch(api, 'sidePanel', this.sidePanel);
    this.patch(api, 'sidebarAction', this.sidebarAction);
    this.patch(api.action!, 'onClicked', this.onActionClicked);
    this.patch(api, 'permissions', { request: this.permissionsRequest });
    return this;
  }

  /** Puts back what `install()` replaced. */
  uninstall(): void {
    for (const { target, key, original } of this.patches.reverse()) {
      target[key] = original;
    }
    this.patches = [];
  }

  /** Replaces the throwing `tabGroups` with a working one, for the cleanup only. */
  allowNativeGroups(groups: FakeNativeGroup[]): this {
    this.nativeGroups = groups.map((group) => ({ ...group }));
    const api = fakeBrowser as unknown as Record<string, unknown>;
    api.tabGroups = {
      query: async () => this.nativeGroups.map((group) => ({ ...group })),
      update: async (groupId: number, properties: Record<string, unknown>) => {
        this.groupUpdates.push({ groupId, properties: { ...properties } });
        const group = this.nativeGroups.find((entry) => entry.id === groupId);
        if (group) Object.assign(group, properties);
        return { ...group };
      },
    };
    return this;
  }

  /** Simulates the user closing a tab. */
  async closeTab(tabId: number): Promise<void> {
    await this.removeTab(tabId);
  }

  /** Simulates a navigation or title change, firing `onUpdated`. */
  async changeTab(tabId: number, changes: Partial<Tab>): Promise<void> {
    await this.updateTab(tabId, changes);
  }

  private patch(target: Record<string, unknown>, key: string, value: unknown) {
    this.patches.push({ target, key, original: target[key] });
    target[key] = value;
  }

  private forbid(name: string) {
    return () => {
      this.forbidden.push(name);
      throw new Error(`${name} must not be called`);
    };
  }

  private forbiddenTabGroups(): unknown {
    return new Proxy(
      {},
      {
        get: (_target, key) => {
          if (typeof key !== 'string' || key === 'then') return undefined;
          return this.forbid(`tabGroups.${key}`);
        },
      },
    );
  }

  private findTab(tabId: number): Tab {
    const tab = this.tab(tabId);
    if (!tab) throw new Error(`No tab with id: ${tabId}.`);
    return tab;
  }

  private createTab = async (properties: Browser.tabs.CreateProperties): Promise<Tab> => {
    const tab: Tab = {
      id: this.nextTabId++,
      index: this.tabs.length,
      windowId: properties.windowId ?? this.currentWindowId,
      groupId: -1,
      url: properties.url,
      title: '',
      active: properties.active ?? true,
      pinned: false,
      highlighted: false,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      frozen: false,
      lastAccessed: 0,
    };
    this.tabs.push(tab);
    await this.onCreated.trigger({ ...tab });
    return { ...tab };
  };

  private queryTabs = async (info: Browser.tabs.QueryInfo = {}): Promise<Tab[]> =>
    this.tabs
      .filter(
        (tab) =>
          (info.windowId === undefined || tab.windowId === info.windowId) &&
          (info.currentWindow === undefined || (tab.windowId === this.currentWindowId) === info.currentWindow) &&
          (info.active === undefined || tab.active === info.active) &&
          (info.url === undefined || tab.url === info.url),
      )
      .map((tab) => ({ ...tab }));

  private getTab = async (tabId: number): Promise<Tab> => ({ ...this.findTab(tabId) });

  private updateTab = async (tabId: number, properties: Partial<Tab>): Promise<Tab> => {
    const tab = this.findTab(tabId);
    if (properties.active) {
      for (const other of this.tabs) {
        if (other.windowId === tab.windowId) other.active = false;
      }
    }
    Object.assign(tab, properties);
    const info: Browser.tabs.OnUpdatedInfo = {};
    for (const key of ['url', 'title', 'favIconUrl', 'status'] as const) {
      if (key in properties) (info as Record<string, unknown>)[key] = properties[key];
    }
    if (Object.keys(info).length > 0) await this.onUpdated.trigger(tabId, info, { ...tab });
    return { ...tab };
  };

  private removeTab = async (tabIds: number | number[]): Promise<void> => {
    for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
      const tab = this.findTab(tabId);
      this.tabs = this.tabs.filter((other) => other !== tab);
      await this.onRemoved.trigger(tabId, { windowId: tab.windowId, isWindowClosing: false });
    }
  };

  private updateWindow = async (
    windowId: number,
    { focused }: Browser.windows.UpdateInfo,
  ): Promise<{ id: number; focused: boolean }> => {
    if (focused) this.focusedWindowId = windowId;
    return { id: windowId, focused: this.focusedWindowId === windowId };
  };

  private createMenu = (entry: MenuEntry): string => {
    if (this.menus.some((menu) => menu.id === entry.id)) {
      throw new Error(`Duplicate menu id: ${entry.id}`);
    }
    this.menus.push({ ...entry });
    return entry.id;
  };

  private removeAllMenus = async (): Promise<void> => {
    this.menus = [];
  };
}
