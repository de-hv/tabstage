import type { Group } from '../lib/groups';

/** A parsed `Group` (as `listGroups` returns it) with per-test overrides. */
export class GroupBuilder {
  private data: Group = {
    id: 1,
    windowId: 1,
    title: 'CAR-6124 login fix · STG',
    color: 'orange',
    collapsed: false,
    name: 'CAR-6124 login fix',
    ticketKey: 'CAR-6124',
    statusId: 'stg',
    tabs: [],
  };

  with(attributes: Partial<Group>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  build(): Group {
    return { ...this.data, tabs: this.data.tabs.map((tab) => ({ ...tab })) };
  }
}
