import { useEffect, useRef } from 'react';
import type { PaletteAction } from '@/lib/palette';
import { NO_STATUS_LABEL } from '@/lib/lanes';
import type { Status } from '@/lib/types';
import { StatusChip } from './StatusChip';

interface PaletteResultsProps {
  id: string;
  actions: readonly PaletteAction[];
  statuses: readonly Status[];
  selected: number;
  onSelect: (index: number) => void;
  onRun: (index: number) => void;
}

export const optionId = (listId: string, action: PaletteAction) => `${listId}-${action.id}`;

function Content({ action, statuses }: { action: PaletteAction; statuses: readonly Status[] }) {
  switch (action.kind) {
    case 'focus-group': {
      const { group } = action;
      return (
        <>
          <span className="dot" data-color={group.statusId === null ? 'none' : group.color} aria-hidden="true" />
          <span className="palette-option__main">{group.name || 'Untitled group'}</span>
          {/* The chip opens its own picker; its clicks don't run the row. */}
          <span className="palette-option__chip" onClick={(event) => event.stopPropagation()}>
            <StatusChip group={group} statuses={statuses} />
          </span>
        </>
      );
    }
    case 'focus-tab':
      return (
        <>
          <span className="dot" data-color={action.group.statusId === null ? 'none' : action.group.color} aria-hidden="true" />
          <span className="palette-option__main">{action.tab.title || action.tab.url || 'Untitled tab'}</span>
          <span className="palette-option__hint">{action.group.ticketKey}</span>
        </>
      );
    case 'set-status':
      return (
        <>
          <span className="palette-option__verb">Move</span>
          <span className="palette-option__main">{action.group.ticketKey}</span>
          <span className="palette-option__verb">to</span>
          <span className="palette-badge" data-color={action.status?.color ?? 'none'}>
            {action.status?.label ?? NO_STATUS_LABEL}
          </span>
        </>
      );
    case 'open-panel':
      return <span className="palette-option__main">Open side panel</span>;
  }
}

const KIND_LABEL: Record<PaletteAction['kind'], string> = {
  'focus-group': 'Group',
  'focus-tab': 'Tab',
  'set-status': 'Status',
  'open-panel': 'Panel',
};

/** The ranked results. A click or Enter runs one; hovering selects it. */
export function PaletteResults({ id, actions, statuses, selected, onSelect, onRun }: PaletteResultsProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, actions]);

  const options = actions.map((action, index) => (
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
      <Content action={action} statuses={statuses} />
    </li>
  ));

  return (
    <ul ref={listRef} id={id} role="listbox" aria-label="Results" className="palette-results">
      {options}
    </ul>
  );
}
