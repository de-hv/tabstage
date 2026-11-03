import type { GroupView } from '@/lib/tiles';
import type { BoardGroup as Group, BoardItem } from '@/lib/types';
import { InlineEdit } from './InlineEdit';
import { ItemRow } from './ItemRow';
import { menuTrigger } from './menu-trigger';

interface BoardGroupProps {
  view: GroupView;
  /** True while the group's name is being edited. */
  renaming: boolean;
  onToggle: (group: Group) => void;
  onRename: (group: Group, name: string) => void;
  onCancelRename: () => void;
  onMenu: (group: Group, x: number, y: number) => void;
  onOpenItem: (item: BoardItem) => void;
  onRemoveItem: (item: BoardItem) => void;
  onItemMenu: (item: BoardItem, x: number, y: number) => void;
}

/** DOM id of a group's header button; the palette focuses it. */
export const groupDomId = (groupId: string) => `group-${groupId}`;

/**
 * A collapsible folder of tabs with a guide line on the left. Right-click or
 * the Menu key on its header opens the group actions.
 */
export function BoardGroup({
  view: { group, items },
  renaming,
  onToggle,
  onRename,
  onCancelRename,
  onMenu,
  onOpenItem,
  onRemoveItem,
  onItemMenu,
}: BoardGroupProps) {
  const listId = `${groupDomId(group.id)}-items`;
  return (
    <li className="group" data-collapsed={group.collapsed || undefined}>
      {renaming ? (
        <div className="group__header">
          <InlineEdit
            value={group.name}
            label={`Rename group ${group.name}`}
            onCommit={(name) => onRename(group, name)}
            onCancel={onCancelRename}
          />
        </div>
      ) : (
        <button
          type="button"
          id={groupDomId(group.id)}
          className="group__header"
          aria-expanded={!group.collapsed}
          aria-controls={listId}
          onClick={() => onToggle(group)}
          {...menuTrigger((x, y) => onMenu(group, x, y))}
        >
          <span className="group__chevron" aria-hidden="true">
            {group.collapsed ? '▸' : '▾'}
          </span>
          <span className="group__name">{group.name}</span>
          <span className="group__count" aria-label={`${items.length} tabs`}>
            {items.length}
          </span>
        </button>
      )}
      {!group.collapsed && (
        <ul id={listId} className="group__items" aria-label={group.name}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onOpen={onOpenItem}
              onRemove={onRemoveItem}
              onMenu={onItemMenu}
            />
          ))}
          {items.length === 0 && <li className="group__empty">No tabs</li>}
        </ul>
      )}
    </li>
  );
}
