import {
  Bold,
  Check,
  Code,
  Heading,
  Italic,
  Link,
  AArrowDown,
  AArrowUp,
  List,
  ListChecks,
  LoaderCircle,
  NotebookText,
  Pencil,
  Ticket,
  TriangleAlert,
} from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import Markdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { type Format, TICKET_LINK_PREFIX, applyFormat, linkTicketKeys, toggleTask } from '../lib/markdown';
import {
  NOTE_TEXT_DEFAULT,
  NOTE_TEXT_MAX,
  NOTE_TEXT_MIN,
  NOTE_TEXT_STEP,
  useNoteTextSize,
} from '../state/useNoteTextSize';
import { Tip } from './Tooltip';

const SAVE_DELAY_MS = 600;
export const MAX_NOTE_LENGTH = 20_000;

interface Props {
  note: string | undefined;
  /** Saves the note; resolves to whether it was saved. */
  onSave: (note: string) => Promise<boolean>;
  /** Opens a link of the note. */
  onOpenLink: (url: string) => void;
  /** Starts editing whenever this changes to a new non-zero value. */
  editRequest?: number;
  /** Keys of known tickets (upper case) to their ids; they show as links. */
  ticketKeys?: Map<string, string>;
  /** Shows a ticket, from a key link. */
  onOpenTicket?: (ticket: string) => void;
  /** Creates a ticket from the selected text; adds a toolbar button. */
  onCreateTicket?: (text: string) => void;
  /** Label of the panel, "Note" by default. */
  label?: string;
}

type Status = 'idle' | 'saving' | 'saved' | 'failed';

const TOOLS: { format: Format; label: string; icon: typeof Bold; keys?: string }[] = [
  { format: 'bold', label: 'Bold', icon: Bold, keys: '⌘B' },
  { format: 'italic', label: 'Italic', icon: Italic, keys: '⌘I' },
  { format: 'heading', label: 'Heading', icon: Heading },
  { format: 'task', label: 'Checklist', icon: ListChecks },
  { format: 'list', label: 'Bulleted list', icon: List },
  { format: 'code', label: 'Code', icon: Code },
  { format: 'link', label: 'Link', icon: Link, keys: '⌘K' },
];

const SHORTCUTS: Record<string, Format> = { b: 'bold', i: 'italic', k: 'link' };

/** A group's, folder's or tab's note: rendered Markdown, edited in place and saved as you type. */
export function NoteEditor({
  note = '',
  onSave,
  onOpenLink,
  editRequest = 0,
  ticketKeys,
  onOpenTicket,
  onCreateTicket,
  label = 'Note',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [status, setStatus] = useState<Status>('idle');
  const [textSize, setTextSize] = useNoteTextSize();
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = async () => {
    clearTimeout(timer.current);
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    setStatus('saving');
    setStatus((await saveRef.current(text)) ? 'saved' : 'failed');
  };

  // Save what is left when the view goes away (another item is selected).
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) void saveRef.current(pending.current);
    },
    [],
  );

  // While not editing, follow the saved note (it can change on another device).
  useEffect(() => {
    if (!editing) setDraft(note);
  }, [note, editing]);

  const start = () => {
    setDraft(note);
    setStatus('idle');
    setEditing(true);
  };

  useEffect(() => {
    if (editRequest) start();
    // `start` only reads the latest note; re-run on a new request only.
  }, [editRequest]);

  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);

  const change = (text: string) => {
    setDraft(text);
    pending.current = text;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  /** Ticks a task box of the rendered note and saves right away. */
  const toggle = (index: number) => {
    const text = toggleTask(draft, index);
    setDraft(text);
    pending.current = text;
    void flush();
  };

  const finish = () => {
    void flush();
    setEditing(false);
  };

  const format = (kind: Format) => {
    const field = area.current;
    if (!field) return;
    const edit = applyFormat(draft, field.selectionStart, field.selectionEnd, kind);
    change(edit.text);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(edit.start, edit.end);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      finish();
      return;
    }
    const shortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey ? SHORTCUTS[event.key.toLowerCase()] : undefined;
    if (shortcut) {
      event.preventDefault();
      format(shortcut);
    }
  };

  /** ⌘= / ⌘− / ⌘0 anywhere in the note change its text size. */
  const onSizeKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const delta = event.key === '=' || event.key === '+' ? 1 : event.key === '-' ? -1 : event.key === '0' ? 0 : null;
    if (delta === null) return;
    event.preventDefault();
    setTextSize(delta === 0 ? NOTE_TEXT_DEFAULT : textSize + delta * NOTE_TEXT_STEP);
  };

  return (
    <section
      className="note"
      aria-label="Note"
      style={{ '--note-scale': textSize / 100 } as CSSProperties}
      onKeyDown={onSizeKeys}
    >
      <header className="note__bar">
        <NotebookText className="icon" aria-hidden="true" />
        <span className="note__label">{label}</span>
        {editing && (
          <div className="note__tools" role="toolbar" aria-label="Formatting">
            {TOOLS.map(({ format: kind, label, icon: Icon, keys }) => (
              <Tip key={kind} label={label} keys={keys}>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format(kind)}
                >
                  <Icon className="icon" aria-hidden="true" />
                </button>
              </Tip>
            ))}
            {onCreateTicket && (
              <Tip label="Create a ticket from the selected line">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Ticket from selection"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const field = area.current;
                    if (!field) return;
                    const selected = draft.slice(field.selectionStart, field.selectionEnd);
                    const lineStart = draft.lastIndexOf('\n', field.selectionStart - 1) + 1;
                    const lineEnd = draft.indexOf('\n', field.selectionStart);
                    const text = selected.trim() || draft.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
                    if (text.trim()) onCreateTicket(text);
                  }}
                >
                  <Ticket className="icon" aria-hidden="true" />
                </button>
              </Tip>
            )}
          </div>
        )}
        <SaveStatus status={status} />
        <TextSize size={textSize} onChange={setTextSize} />
        {editing ? (
          <button type="button" className="button note__toggle" onClick={finish}>
            Done
          </button>
        ) : (
          <button type="button" className="button note__toggle" onClick={start}>
            <Pencil className="icon" aria-hidden="true" />
            {note ? 'Edit' : 'Add'}
          </button>
        )}
      </header>
      {editing ? (
        <textarea
          ref={area}
          className="note__editor"
          aria-label="Note in Markdown"
          value={draft}
          maxLength={MAX_NOTE_LENGTH}
          rows={Math.min(24, Math.max(8, draft.split('\n').length + 1))}
          placeholder={'### What is this for\n- [ ] A first step\nLinks, `code`, **bold**…'}
          spellCheck
          onChange={(event) => change(event.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : draft ? (
        <RenderedNote
          note={draft}
          onStart={start}
          onToggle={toggle}
          onOpenLink={(url) => {
            if (url.startsWith(TICKET_LINK_PREFIX)) onOpenTicket?.(url.slice(TICKET_LINK_PREFIX.length));
            else onOpenLink(url);
          }}
          ticketKeys={ticketKeys}
        />
      ) : (
        <button type="button" className="note__empty" onClick={start}>
          Add a note: steps, links, decisions. Markdown works.
        </button>
      )}
      {editing && (
        <p className="note__hint">
          Saves as you type · <kbd>⌘Enter</kbd> or <kbd>Esc</kbd> to finish
        </p>
      )}
    </section>
  );
}

/** A− / A+ with the size in between; a click on the size goes back to normal. */
function TextSize({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  return (
    <div className="note__size" role="group" aria-label="Text size">
      <Tip label="Smaller text" keys="⌘−">
        <button
          type="button"
          className="icon-button"
          aria-label="Smaller text"
          disabled={size <= NOTE_TEXT_MIN}
          onClick={() => onChange(size - NOTE_TEXT_STEP)}
        >
          <AArrowDown className="icon" aria-hidden="true" />
        </button>
      </Tip>
      <Tip label="Normal size" keys="⌘0">
        <button
          type="button"
          className="note__size-value"
          aria-label={`Text size ${size}%, reset`}
          onClick={() => onChange(NOTE_TEXT_DEFAULT)}
        >
          {size}%
        </button>
      </Tip>
      <Tip label="Larger text" keys="⌘=">
        <button
          type="button"
          className="icon-button"
          aria-label="Larger text"
          disabled={size >= NOTE_TEXT_MAX}
          onClick={() => onChange(size + NOTE_TEXT_STEP)}
        >
          <AArrowUp className="icon" aria-hidden="true" />
        </button>
      </Tip>
    </div>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status === 'idle') return <span className="note__status" />;
  const [Icon, text] =
    status === 'saving'
      ? [LoaderCircle, 'Saving…']
      : status === 'saved'
        ? [Check, 'Saved']
        : [TriangleAlert, 'Not saved'];
  return (
    <span className="note__status" data-status={status} role="status">
      <Icon className="icon" aria-hidden="true" />
      {text}
    </span>
  );
}

interface RenderedProps {
  note: string;
  ticketKeys?: Map<string, string>;
  onStart: () => void;
  onToggle: (index: number) => void;
  onOpenLink: (url: string) => void;
}

/** The note as HTML. A click edits it, except on a link or a task box. */
function RenderedNote({ note, onStart, onToggle, onOpenLink, ticketKeys }: RenderedProps) {
  // Task boxes render in reading order, so a counter gives each one its index.
  let task = 0;
  const components: Components = {
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          if (href) onOpenLink(href);
        }}
      >
        {children}
      </a>
    ),
    input: ({ type, checked }) => {
      if (type !== 'checkbox') return null;
      const index = task;
      task += 1;
      return (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          aria-label={checked ? 'Mark as not done' : 'Mark as done'}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggle(index)}
        />
      );
    },
  };
  return (
    // A click anywhere on the note starts editing; the Edit button is the keyboard path.
    <div className="note__view markdown" onClick={onStart}>
      <Markdown
        // A line break in a note is a line break, as in the plain notes before Markdown.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
        urlTransform={(url) => (url.startsWith(TICKET_LINK_PREFIX) ? url : defaultUrlTransform(url))}
      >
        {ticketKeys ? linkTicketKeys(note, ticketKeys) : note}
      </Markdown>
    </div>
  );
}
