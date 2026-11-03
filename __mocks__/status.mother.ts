import type { Status } from '../lib/types';

/** Fixed statuses. Each call returns fresh objects. */
export class StatusMother {
  /** The v2 defaults: To do, In progress, In review, In dev, Done. */
  static defaults(): Status[] {
    return [
      StatusMother.todo(),
      StatusMother.inProgress(),
      StatusMother.inReview(),
      StatusMother.inDev(),
      StatusMother.done(),
    ];
  }

  static todo(): Status {
    return { id: 'todo', label: 'To do', color: 'lavender', order: 0 };
  }

  static inProgress(): Status {
    return { id: 'in-progress', label: 'In progress', color: 'blue', order: 1 };
  }

  static inReview(): Status {
    return { id: 'in-review', label: 'In review', color: 'mauve', order: 2 };
  }

  static inDev(): Status {
    return { id: 'in-dev', label: 'In dev', color: 'peach', order: 3 };
  }

  static done(): Status {
    return { id: 'done', label: 'Done', color: 'green', order: 4 };
  }

  /** The 8 v1 defaults as v1 stored them, with native group colors. */
  static v1Defaults(): unknown[] {
    return [
      { id: 'todo', label: 'To do', color: 'grey', order: 0 },
      { id: 'in-progress', label: 'In progress', color: 'blue', order: 1 },
      { id: 'review', label: 'Review', color: 'purple', order: 2 },
      { id: 'dev', label: 'Dev', color: 'cyan', order: 3 },
      { id: 'test', label: 'Test', color: 'yellow', order: 4 },
      { id: 'stg', label: 'STG', color: 'orange', order: 5 },
      { id: 'prod', label: 'PROD', color: 'pink', order: 6 },
      { id: 'done', label: 'Done', color: 'green', order: 7 },
    ];
  }
}
