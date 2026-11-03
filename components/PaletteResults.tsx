import { useEffect, useRef } from 'react';
import type { PaletteAction } from '@/lib/palette';
import type { Status } from '@/lib/types';

interface PaletteResultsProps {
  id: string;
  actions: readonly PaletteAction[];
  selected: number;
  onSelect: (index: number) => void;
  onRun: (index: number) => void;
}

export const optionId = (listId: string, action: PaletteAction) => `${listId}-${action.id}`;

function Badge({ status }: { status: Status | undefined }) {
  if (!status) return null;
  return (
    <span className="badge" data-color={status.color}>
      <span className="square" aria-hidden="true" />
      {status.label}
    </span>
  );
}

function Content({ action }: { action: PaletteAction }) {
  switch (action.kind) {
    case 'open-item':
      return (
        <>
          <span className="palette-option__main">{action.item.title}</span>
          {action.item.tabId === null && <span className="palette-option__hint">closed</span>}
          <Badge status={action.status} />
        </>
      );
    case 'show-group':
      return (
        <>
          <span className="palette-option__main">{action.group.name}</span>
          <Badge status={action.status} />
        </>
      );
    case 'move-item':
    case 'move-group':
      return (
        <>
          <span className="palette-option__verb">Move</span>
          <span className="palette-option__main">
            {action.kind === 'move-item' ? action.item.title : action.group.name}
          </span>
          <span className="palette-option__verb">to</span>
          <Badge status={action.status} />
        </>
      );
    case 'add-tab':
      return (
        <>
          <span className="palette-option__main">Add this tab to</span>
          <Badge status={action.status} />
        </>
      );
  }
}

const KIND_LABEL: Record<PaletteAction['kind'], string> = {
  'open-item': 'Tab',
  'show-group': 'Group',
  'move-item': 'Move',
  'move-group': 'Move',
  'add-tab': 'Add',
};

/** The ranked results. A click or Enter runs one; hovering selects it. */
export function PaletteResults({ id, actions, selected, onSelect, onRun }: PaletteResultsProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, actions]);

  return (
    <ul ref={listRef} id={id} role="listbox" aria-label="Results" className="palette-results">
      {actions.map((action, index) => (
        <li
          key={action.id}
          id={optionId(id, action)}
          role="option"
          className="palette-option"
          data-kind={action.kind}
          aria-selected={index === selected}
          onMouseMove={() => {
            if (index !== selected) onSelect(index);
          }}
          onClick={() => onRun(index)}
        >
          <span className="palette-option__kind">{KIND_LABEL[action.kind]}</span>
          <Content action={action} />
        </li>
      ))}
    </ul>
  );
}
