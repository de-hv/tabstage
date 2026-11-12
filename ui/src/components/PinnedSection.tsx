import { ChevronDown, ChevronRight, PinOff } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';

import type { Command, Target, Workspace } from '../api/types';
import type { DragItem } from '../lib/dnd';
import { pressable } from '../lib/pressable';
import { profileColor } from '../lib/profileColors';
import { type PinnedItem, effectiveColor, pinnedItems } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { useDrag, useDrop, useIsDragging } from './DragDrop';
import { ItemIcon } from './ItemIcon';
import { TicketChip } from './Meta';
import { ProfileDot } from './ProfileDot';

interface Props {
  workspace: Workspace;
  selection: Selection | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (selection: Selection) => void;
  actions: ItemActions;
  apply: (command: Command) => void;
}

/**
 * The "Pinned" section at the top of the sidebar: the items opened every
 * day. A pinned tab opens with a click; a group or folder is shown. Drop an
 * item here to pin it; drag pinned ones to reorder them.
 */
export function PinnedSection({ workspace, selection, expanded, onToggle, onSelect, actions, apply }: Props) {
  const items = pinnedItems(workspace);
  const showDropZone = useShownWhileDragging();
  const dropOnSection = useDrop({ kind: 'pinned' });
  if (items.length === 0 && !showDropZone) return null;

  return (
    <section className="pinned" aria-label="Pinned">
      <div className="pinned__head" {...dropOnSection}>
        <button type="button" className="pinned__toggle" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? <ChevronDown className="icon" aria-hidden="true" /> : <ChevronRight className="icon" aria-hidden="true" />}
          Pinned
        </button>
      </div>
      {items.length === 0 ? (
        <p className="pinned__drop" {...dropOnSection}>
          Drop here to pin
        </p>
      ) : (
        expanded && (
          <ul className="tree-list pinned__list">
            {items.map((pinned) => (
              <PinnedRow
                key={`${pinned.kind}-${pinned.item.id}`}
                pinned={pinned}
                color={effectiveColor(workspace, pinned.item.id)}
                current={selection?.kind === pinned.kind && selection.id === pinned.item.id}
                onActivate={() =>
                  pinned.kind === 'tab'
                    ? actions.open({ tab: pinned.item.id })
                    : onSelect({ kind: pinned.kind, id: pinned.item.id })
                }
                onUnpin={() => apply({ type: 'unpin', target: pinned.target })}
              />
            ))}
          </ul>
        )
      )}
    </section>
  );
}

/**
 * Whether a drag is under way, turned on a moment after it starts. The empty
 * "Drop here to pin" zone sits above the tree, so showing it during
 * `dragstart` would move the row being dragged, and WebKit cancels a drag
 * whose source moves then.
 */
function useShownWhileDragging(): boolean {
  const isDragging = useIsDragging();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!isDragging) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), 150);
    return () => clearTimeout(timer);
  }, [isDragging]);
  return shown;
}

interface RowProps {
  pinned: PinnedItem;
  color: number | undefined;
  current: boolean;
  onActivate: () => void;
  onUnpin: () => void;
}

function PinnedRow({ pinned, color, current, onActivate, onUnpin }: RowProps) {
  const name = pinned.kind === 'tab' ? pinned.item.title : pinned.item.name;
  const dragItem: DragItem =
    pinned.kind === 'tab'
      ? { kind: 'tab', tab: pinned.item.id }
      : pinned.kind === 'folder'
        ? { kind: 'folder', folder: pinned.item.id }
        : { kind: 'group', group: pinned.item.id };
  const drag = useDrag(dragItem);
  const drop = useDrop({ kind: 'pinned', before: pinned.target satisfies Target });
  const style = color === undefined ? undefined : ({ '--own': profileColor(color) } as CSSProperties);

  return (
    <li>
      <div className="tree-row pinned__row" data-current={current || undefined} data-own={color !== undefined || undefined} style={style} {...drag} {...drop}>
        <span className="tree-row__icon pinned__icon" aria-hidden="true">
          <ItemIcon icon={pinned.item.icon} kind={pinned.kind} />
        </span>
        <div
          {...pressable(onActivate)}
          className="tree-row__name"
          title={pinned.kind === 'tab' ? `Open ${name}\n${pinned.item.url}` : `Show ${name}`}
          aria-current={current ? 'page' : undefined}
          onClick={onActivate}
        >
          <span className="tree-row__title">
            <TicketChip ticketId={pinned.item.ticketId} />
            {name}
          </span>
        </div>
        <span className="pinned__profile" title={pinned.profile.name}>
          <ProfileDot color={pinned.profile.color} />
        </span>
        <button type="button" className="icon-button pinned__unpin" aria-label={`Unpin ${name}`} title="Unpin" onClick={onUnpin}>
          <PinOff className="icon" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
