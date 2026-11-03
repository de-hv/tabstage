import type { Browser } from 'wxt/browser';

type Tab = Browser.tabs.Tab;

/** A browser tab with per-test overrides. Ungrouped by default. */
export class TabBuilder {
  private data: Tab = {
    id: 1,
    index: 0,
    windowId: 1,
    groupId: -1,
    title: 'CAR-6124 · Jira',
    url: 'https://jira.example.com/browse/CAR-6124',
    active: false,
    pinned: false,
    highlighted: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    lastAccessed: 0,
  };

  with(attributes: Partial<Tab>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  build(): Tab {
    return { ...this.data };
  }
}
