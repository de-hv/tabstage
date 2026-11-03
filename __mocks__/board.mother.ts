import type { Board } from '../lib/types';
import { BoardGroupBuilder } from './board-group.builder';
import { ItemBuilder } from './item.builder';

/** Fixed boards. Each call returns fresh objects. */
export class BoardMother {
  static empty(): Board {
    return { groups: [], items: [] };
  }

  /**
   * - To do: loose "Login fix" (tab 1) and a closed "Docs" link
   * - In progress: group "CAR-6115" with "PR #42" (tab 2) and "Spec" (tab 3)
   * - In review, In dev, Done: empty
   */
  static sample(): Board {
    return {
      groups: [new BoardGroupBuilder().build()],
      items: [
        new ItemBuilder().build(),
        new ItemBuilder()
          .with({
            id: 'item-2',
            url: 'https://docs.example.com/guide',
            title: 'Docs guide',
            favIconUrl: undefined,
            order: 1,
          })
          .closed()
          .build(),
        new ItemBuilder()
          .with({
            id: 'item-3',
            url: 'https://github.com/de-hv/tabstage/pull/42',
            title: 'PR #42',
            statusId: 'in-progress',
            groupId: 'group-1',
            tabId: 2,
            order: 0,
          })
          .build(),
        new ItemBuilder()
          .with({
            id: 'item-4',
            url: 'https://jira.example.com/browse/CAR-6115',
            title: 'CAR-6115 spec',
            statusId: 'in-progress',
            groupId: 'group-1',
            tabId: 3,
            order: 1,
          })
          .build(),
      ],
    };
  }
}
