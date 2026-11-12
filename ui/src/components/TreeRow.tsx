import { ChevronDown, ChevronRight } from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';

import type { DragItem } from '../lib/dnd';
import type { RowControls } from '../lib/menus';
import { pressable } from '../lib/pressable';
import { profileColor } from '../lib/profileColors';
import { ActionMenu, type MenuEntry } from './ActionMenu';
import { type DropSpec, useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';
import { NoteIcon, TicketChip, withTicket } from './Meta';

export interface TreeRowProps {
  depth: number;
  kind: 'profile' | 'ticket' | 'note' | 'link';
  name: string;
  /** Color of the row's status: a left edge and a light tint. */
  lane?: number;
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

/** A sidebar row: chevron, icon, name (a drag starts from it), extras and a menu. */
export function TreeRow(props: TreeRowProps) {
  const { depth, kind, name, expanded, onToggle, current = false, onActivate, onRename, menu } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [leadingOpen, setLeadingOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const drag = useDrag(props.drag);
  const drop = useDrop(props.drop);
  const controls: RowControls = { rename: () => setRenaming(true), openLeading: () => setLeadingOpen(true) };
  const style: Record<string, string | number> = { '--depth': depth };
  if (props.lane !== undefined) style['--lane'] = profileColor(props.lane);
  const labelled = props.subtitle || props.ticketKey;

  return (
    <div
      className={props.subtitle ? 'tree-row tree-row--two-line' : 'tree-row'}
      data-kind={kind}
      data-current={current || undefined}
      data-lane={props.lane !== undefined || undefined}
      style={style as CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
      {...(renaming ? {} : drag)}
      {...drop}
    >
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
                {name}
              </span>
              {props.subtitle}
            </>
          ) : (
            name
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
