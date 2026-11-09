import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useRef } from 'react';

import type { Command, Status } from '../api/types';
import type { MoveDestination } from '../lib/dnd';

const NO_STATUS = '';

interface Props {
  /** Accessible name of the trigger, e.g. "Opciones de Grafana". */
  label: string;
  /** Status section; omitted for groups. */
  status?: {
    statuses: Status[];
    current: string | undefined;
    onChange: (status: string | null) => void;
  };
  deleteLabel?: string;
  /** "Move to…" entries; the submenu is hidden when empty. */
  moves?: MoveDestination[];
  onMove?: (command: Command) => void;
  onRename: () => void;
  onDelete: () => void;
}

/** "⋯" menu of a row: status, rename and delete. */
export function RowMenu({ label, status, deleteLabel = 'Eliminar', moves = [], onMove, onRename, onDelete }: Props) {
  // Renaming swaps the row for an input; returning focus to the trigger
  // would pull focus out of that input.
  const keepFocus = useRef(false);

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="icon-button row-menu__trigger" aria-label={label}>
          <MoreHorizontal className="icon" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="menu"
          align="end"
          sideOffset={4}
          onCloseAutoFocus={(event) => {
            if (keepFocus.current) event.preventDefault();
            keepFocus.current = false;
          }}
        >
          {status && (
            <>
              <Menu.Label className="menu__label">Estado</Menu.Label>
              <Menu.RadioGroup
                value={status.current ?? NO_STATUS}
                onValueChange={(value) => status.onChange(value === NO_STATUS ? null : value)}
              >
                <Menu.RadioItem className="menu__item" value={NO_STATUS}>
                  <span className="square" aria-hidden="true" />
                  Sin estado
                </Menu.RadioItem>
                {status.statuses.map((option) => (
                  <Menu.RadioItem key={option.id} className="menu__item" value={option.id}>
                    <span className="square" data-color={option.color} aria-hidden="true" />
                    {option.label}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
              <Menu.Separator className="separator" />
            </>
          )}
          {moves.length > 0 && onMove && (
            <Menu.Sub>
              <Menu.SubTrigger className="menu__item">
                <FolderInput className="icon" aria-hidden="true" />
                Mover a…
                <ChevronRight className="icon menu__chevron" aria-hidden="true" />
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent className="menu" sideOffset={4}>
                  {moves.map((move) => (
                    <Menu.Item key={move.label} className="menu__item" onSelect={() => onMove(move.command)}>
                      {move.label}
                    </Menu.Item>
                  ))}
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
          )}
          <Menu.Item
            className="menu__item"
            onSelect={() => {
              keepFocus.current = true;
              onRename();
            }}
          >
            <Pencil className="icon" aria-hidden="true" />
            Renombrar
          </Menu.Item>
          <Menu.Item className="menu__item menu__item--danger" onSelect={onDelete}>
            <Trash2 className="icon" aria-hidden="true" />
            {deleteLabel}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
