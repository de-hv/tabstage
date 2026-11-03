import type { BoardGroup } from '../lib/types';

/** An expanded group in "In progress" with per-test overrides. */
export class BoardGroupBuilder {
  private data: BoardGroup = {
    id: 'group-1',
    name: 'CAR-6115',
    statusId: 'in-progress',
    collapsed: false,
    order: 0,
  };

  with(attributes: Partial<BoardGroup>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  build(): BoardGroup {
    return { ...this.data };
  }
}
