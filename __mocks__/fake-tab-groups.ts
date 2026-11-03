import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type TabGroup = Browser.tabGroups.TabGroup;
type Tab = Browser.tabs.Tab;
type QueryInfo = Browser.tabGroups.QueryInfo;
type UpdateProperties = Browser.tabGroups.UpdateProperties;
type MoveProperties = Browser.tabGroups.MoveProperties;
type GroupOptions = Browser.tabs.GroupOptions;

const TAB_GROUP_ID_NONE = -1;
/** Nested `tabGroups.update` calls above this depth mean an update loop. */
const MAX_UPDATE_DEPTH = 10;

/** A browser event whose listeners tests can call with `trigger()`. */
export class FakeEvent<Args extends unknown[]> {
  private listeners: ((...args: Args) => unknown)[] = [];

  addListener = (listener: (...args: Args) => unknown): void => {
    this.listeners.push(listener);
  };

  removeListener = (listener: (...args: Args) => unknown): void => {
    this.listeners = this.listeners.filter((l) => l !== listener);
  };

  hasListener = (listener: (...args: Args) => unknown): boolean =>
    this.listeners.includes(listener);

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

/**
 * In-memory `tabGroups.*`, `tabs.query/get/update/group/ungroup`,
 * `tabs.onMoved/onAttached/onDetached`, `windows.update` and
 * `commands.onCommand`, installed on top of WXT's `fakeBrowser`, which throws
 * on all of them.
 *
 * Unlike the real browser, the fake awaits event listeners inside the call
 * that fires them, so `await setStatus(...)` also waits for the background.
 */
export class FakeTabGroups {
  groups: TabGroup[] = [];
  tabs: Tab[] = [];
  focusedWindowId: number | undefined;
  /** Every `tabGroups.update` call, in order. */
  readonly updates: { groupId: number; properties: UpdateProperties }[] = [];

  readonly onCreated = new FakeEvent<[TabGroup]>();
  readonly onUpdated = new FakeEvent<[TabGroup]>();
  readonly onRemoved = new FakeEvent<[TabGroup]>();
  readonly onMoved = new FakeEvent<[TabGroup]>();
  readonly onCommand = new FakeEvent<[string, Tab | undefined]>();
  readonly onTabMoved = new FakeEvent<[number, Browser.tabs.OnMovedInfo]>();
  readonly onTabAttached = new FakeEvent<[number, Browser.tabs.OnAttachedInfo]>();
  readonly onTabDetached = new FakeEvent<[number, Browser.tabs.OnDetachedInfo]>();

  private nextGroupId = 1;
  private updateDepth = 0;
  private patches: Patch[] = [];

  /** Creates a fake and installs it on `fakeBrowser`. */
  static install(): FakeTabGroups {
    return new FakeTabGroups().install();
  }

  /** Seeds groups and tabs. Stored as copies. */
  with({ groups = [], tabs = [] }: { groups?: TabGroup[]; tabs?: Tab[] }): this {
    this.groups = groups.map((group) => ({ ...group }));
    this.tabs = tabs.map((tab) => ({ ...tab }));
    this.nextGroupId = Math.max(0, ...this.groups.map((g) => g.id)) + 1;
    return this;
  }

  group(groupId: number): TabGroup | undefined {
    return this.groups.find((group) => group.id === groupId);
  }

  install(): this {
    const api = fakeBrowser as unknown as Record<string, Record<string, unknown>>;
    this.patch(api, 'tabGroups', {
      TAB_GROUP_ID_NONE,
      get: this.getGroup,
      query: this.queryGroups,
      update: this.updateGroup,
      move: this.moveGroup,
      onCreated: this.onCreated,
      onUpdated: this.onUpdated,
      onRemoved: this.onRemoved,
      onMoved: this.onMoved,
    });
    const tabs = api.tabs as Record<string, unknown>;
    this.patch(tabs, 'query', this.queryTabs);
    this.patch(tabs, 'get', this.getTab);
    this.patch(tabs, 'update', this.updateTab);
    this.patch(tabs, 'group', this.groupTabs);
    this.patch(tabs, 'ungroup', this.ungroupTabs);
    this.patch(tabs, 'onMoved', this.onTabMoved);
    this.patch(tabs, 'onAttached', this.onTabAttached);
    this.patch(tabs, 'onDetached', this.onTabDetached);
    this.patch(api.windows as Record<string, unknown>, 'update', this.updateWindow);
    this.patch(api.commands as Record<string, unknown>, 'onCommand', this.onCommand);
    return this;
  }

  /** Puts back what `install()` replaced. */
  uninstall(): void {
    for (const { target, key, original } of this.patches.reverse()) {
      target[key] = original;
    }
    this.patches = [];
  }

  private patch(target: Record<string, unknown>, key: string, value: unknown) {
    this.patches.push({ target, key, original: target[key] });
    target[key] = value;
  }

  private findGroup(groupId: number): TabGroup {
    const group = this.group(groupId);
    if (!group) throw new Error(`No group with id: ${groupId}.`);
    return group;
  }

  private findTab(tabId: number): Tab {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`No tab with id: ${tabId}.`);
    return tab;
  }

  private getGroup = async (groupId: number): Promise<TabGroup> => ({
    ...this.findGroup(groupId),
  });

  private queryGroups = async (info: QueryInfo = {}): Promise<TabGroup[]> =>
    this.groups
      .filter((group) =>
        Object.entries(info).every(
          ([key, value]) =>
            value === undefined || group[key as keyof TabGroup] === value,
        ),
      )
      .map((group) => ({ ...group }));

  private updateGroup = async (
    groupId: number,
    properties: UpdateProperties,
  ): Promise<TabGroup> => {
    const group = this.findGroup(groupId);
    if (this.updateDepth >= MAX_UPDATE_DEPTH) {
      throw new Error('tabGroups.update loop detected');
    }
    this.updates.push({ groupId, properties: { ...properties } });
    Object.assign(group, properties);
    this.updateDepth++;
    try {
      await this.onUpdated.trigger({ ...group });
    } finally {
      this.updateDepth--;
    }
    return { ...group };
  };

  private moveGroup = async (
    groupId: number,
    { index, windowId }: MoveProperties,
  ): Promise<TabGroup> => {
    const group = this.findGroup(groupId);
    if (windowId !== undefined) {
      group.windowId = windowId;
      for (const tab of this.tabs) {
        if (tab.groupId === groupId) tab.windowId = windowId;
      }
    }
    const rest = this.groups.filter((g) => g !== group);
    rest.splice(index < 0 ? rest.length : index, 0, group);
    this.groups = rest;
    await this.onMoved.trigger({ ...group });
    return { ...group };
  };

  private queryTabs = async (
    info: Browser.tabs.QueryInfo = {},
  ): Promise<Tab[]> =>
    this.tabs
      .filter(
        (tab) =>
          (info.groupId === undefined || tab.groupId === info.groupId) &&
          (info.windowId === undefined || tab.windowId === info.windowId) &&
          (info.active === undefined || tab.active === info.active),
      )
      .map((tab) => ({ ...tab }));

  private getTab = async (tabId: number): Promise<Tab> => ({
    ...this.findTab(tabId),
  });

  private updateTab = async (
    tabId: number,
    properties: Browser.tabs.UpdateProperties,
  ): Promise<Tab> => {
    const tab = this.findTab(tabId);
    if (properties.active) {
      for (const other of this.tabs) {
        if (other.windowId === tab.windowId) other.active = false;
      }
    }
    Object.assign(tab, properties);
    return { ...tab };
  };

  private groupTabs = async ({
    tabIds,
    groupId,
    createProperties,
  }: GroupOptions): Promise<number> => {
    const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
    const tabs = ids.map((id) => this.findTab(id));
    let group = groupId === undefined ? undefined : this.findGroup(groupId);
    if (!group) {
      group = {
        id: this.nextGroupId++,
        title: '',
        color: 'grey',
        collapsed: false,
        shared: false,
        windowId: createProperties?.windowId ?? tabs[0]?.windowId ?? 1,
      };
      this.groups.push(group);
      await this.onCreated.trigger({ ...group });
    }
    for (const tab of tabs) tab.groupId = group.id;
    return group.id;
  };

  private ungroupTabs = async (tabIds: number | number[]): Promise<void> => {
    const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
    const touched = new Set<number>();
    for (const tab of ids.map((id) => this.findTab(id))) {
      touched.add(tab.groupId);
      tab.groupId = TAB_GROUP_ID_NONE;
    }
    for (const groupId of touched) {
      const group = this.group(groupId);
      if (group && !this.tabs.some((tab) => tab.groupId === groupId)) {
        this.groups = this.groups.filter((g) => g !== group);
        await this.onRemoved.trigger({ ...group });
      }
    }
  };

  private updateWindow = async (
    windowId: number,
    { focused }: Browser.windows.UpdateInfo,
  ): Promise<{ id: number; focused: boolean }> => {
    if (focused) this.focusedWindowId = windowId;
    return { id: windowId, focused: this.focusedWindowId === windowId };
  };
}
