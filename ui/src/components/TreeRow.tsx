import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';

import type { TicketKind } from '../api/types';
import type { DragItem } from '../lib/dnd';
import type { RowControls } from '../lib/menus';
import { pressable } from '../lib/pressable';
import { ActionMenu, type MenuEntry } from './ActionMenu';
import { type DropSpec, useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';
import { NoteIcon, TicketChip, withTicket } from './Meta';

export interface TreeRowProps {
  depth: number;
  kind: 'profile' | 'ticket' | 'note';
  /** For a ticket: its kind, which colors its default icon. */
  ticketKind?: TicketKind;
  name: string;
  /** A ticket key shown as a chip before the name. */
  ticketKey?: string;
  /** Shown as an icon with the text as its tooltip. */
  note?: string;
  title?: string;
  /** Second line under the name, e.g. a link's address. */
  subtitle?: ReactNode;
  /** Leaf rows have no chevron. */
  expanded?: boolean;
  onToggle?: () => void;
  current?: boolean;
  onActivate: () => void;
  /** Double-click. */
  onOpen?: () => void;
  drag: DragItem;
  drop: DropSpec;
  onRename: (name: string) => Promise<boolean>;
  leading: (open: boolean, setOpen: (open: boolean) => void) => ReactNode;
  trailing?: ReactNode;
  menu: (row: RowControls) => MenuEntry[];
}

/** A sidebar row: chevron, icon, name (a drag starts from it), extras and a menu that only the ⋯ button opens. */
export function TreeRow(props: TreeRowProps) {
  const { depth, kind, name, expanded, onToggle, current = false, onActivate, onRename, menu } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [leadingOpen, setLeadingOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const drag = useDrag(props.drag);
  const drop = useDrop(props.drop);
  const controls: RowControls = { rename: () => setRenaming(true), openLeading: () => setLeadingOpen(true) };
  const style: Record<string, string | number> = { '--depth': depth };
  const labelled = props.subtitle || props.ticketKey;

  return (
    <div
      className={props.subtitle ? 'tree-row tree-row--two-line' : 'tree-row'}
      data-kind={kind}
      data-ticket-kind={props.ticketKind}
      data-current={current || undefined}
      style={style as CSSProperties}
      {...(renaming ? {} : drag)}
      {...drop}
    >
      {kind !== 'profile' && !renaming && (
        <span className="tree-row__grip" aria-hidden="true" title="Drag to move">
          <GripVertical className="icon" />
        </span>
      )}
      {expanded === undefined ? (
        <span className="tree-row__chevron" aria-hidden="true" />
      ) : (
        <button
          type="button"
          className="tree-row__chevron"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="icon" aria-hidden="true" /> : <ChevronRight className="icon" aria-hidden="true" />}
        </button>
      )}
      {props.leading(leadingOpen, setLeadingOpen)}
      {renaming ? (
        <div className="tree-row__rename">
          <InlineInput
            label="New name"
            initial={name}
            onCancel={() => setRenaming(false)}
            onSubmit={async (next) => {
              const saved = await onRename(next);
              if (saved) setRenaming(false);
              return saved;
            }}
          />
        </div>
      ) : (
        <div
          {...pressable(onActivate)}
          className="tree-row__name"
          title={props.title ?? name}
          aria-current={current ? 'page' : undefined}
          aria-label={labelled ? withTicket(name, props.ticketKey) : undefined}
          onClick={onActivate}
          onDoubleClick={props.onOpen}
        >
          {labelled ? (
            <>
              <span className="tree-row__title">
                <TicketChip ticketId={props.ticketKey} />
                <span className="tree-row__text">{name}</span>
              </span>
              {props.subtitle}
            </>
          ) : (
            <span className="tree-row__text">{name}</span>
          )}
        </div>
      )}
      <NoteIcon note={props.note} />
      {props.trailing}
      <ActionMenu
        label={`Options for ${name}`}
        entries={menu(controls)}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        className="tree-row__more"
      />
    </div>
  );
}
