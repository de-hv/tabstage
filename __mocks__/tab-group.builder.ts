import type { Browser } from 'wxt/browser';

type TabGroup = Browser.tabGroups.TabGroup;

/** A native tab group with per-test overrides. */
export class TabGroupBuilder {
  private data: TabGroup = {
    id: 1,
    windowId: 1,
    title: 'CAR-6124 · STG',
    color: 'orange',
    collapsed: false,
    shared: false,
  };

  with(attributes: Partial<TabGroup>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  build(): TabGroup {
    return { ...this.data };
  }
}
