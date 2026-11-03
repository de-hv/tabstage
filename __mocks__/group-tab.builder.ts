import type { GroupTab } from '../lib/groups';

/** A `GroupTab` with per-test overrides. */
export class GroupTabBuilder {
  private data: GroupTab = {
    id: 10,
    windowId: 1,
    index: 0,
    title: 'CAR-6124 · Jira',
    url: 'https://jira.example.com/browse/CAR-6124',
    favIconUrl: 'https://jira.example.com/favicon.ico',
    active: false,
  };

  with(attributes: Partial<GroupTab>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  build(): GroupTab {
    return { ...this.data };
  }
}
