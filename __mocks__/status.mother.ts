import type { Status } from '../lib/types';

/** Fixed statuses. Each call returns fresh objects. */
export class StatusMother {
  static defaults(): Status[] {
    return [
      StatusMother.todo(),
      StatusMother.inProgress(),
      StatusMother.review(),
      StatusMother.dev(),
      StatusMother.test(),
      StatusMother.stg(),
      StatusMother.prod(),
      StatusMother.done(),
    ];
  }

  static todo(): Status {
    return { id: 'todo', label: 'To do', color: 'grey', order: 0 };
  }

  static inProgress(): Status {
    return { id: 'in-progress', label: 'In progress', color: 'blue', order: 1 };
  }

  static review(): Status {
    return { id: 'review', label: 'Review', color: 'purple', order: 2 };
  }

  static dev(): Status {
    return { id: 'dev', label: 'Dev', color: 'cyan', order: 3 };
  }

  static test(): Status {
    return { id: 'test', label: 'Test', color: 'yellow', order: 4 };
  }

  static stg(): Status {
    return { id: 'stg', label: 'STG', color: 'orange', order: 5 };
  }

  static prod(): Status {
    return { id: 'prod', label: 'PROD', color: 'pink', order: 6 };
  }

  static done(): Status {
    return { id: 'done', label: 'Done', color: 'green', order: 7 };
  }
}
