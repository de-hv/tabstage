import type { Status } from '../lib/types';

/** A custom status with per-test overrides. */
export class StatusBuilder {
  private data: Status = {
    id: 'qa',
    label: 'QA',
    color: 'red',
    order: 0,
  };

  with(attributes: Partial<Status>): this {
    this.data = { ...this.data, ...attributes };
    return this;
  }

  build(): Status {
    return { ...this.data };
  }
}
