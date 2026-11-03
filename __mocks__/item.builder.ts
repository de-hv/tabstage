import type { BoardItem } from '../lib/types';

/** A loose, open item in "To do" with per-test overrides. */
export class ItemBuilder {
  private data: BoardItem = {
    id: 'item-1',
    url: 'https://jira.example.com/browse/CAR-6124',
    title: 'CAR-6124 · Login fix',
    favIconUrl: 'https://jira.example.com/favicon.ico',
    statusId: 'todo',
    groupId: null,
    tabId: 1,
    order: 0,
  };

  with(attributes: Partial<BoardItem>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  /** A closed link: no tab. */
  closed(): this {
    return this.with({ tabId: null });
  }

  build(): BoardItem {
    return { ...this.data };
  }
}
