import * as Popover from '@radix-ui/react-popover';
import { RotateCcw, Search } from 'lucide-react';
import { iconNames } from 'lucide-react/dynamic';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { Icon } from '../api/types';
import {
  EMOJI_GROUPS,
  type EmojiEntry,
  SUGGESTED_SYMBOLS,
  SYMBOLS,
  loadEmoji,
  readRecentIcons,
  rememberIcon,
  sameIcon,
  searchEmoji,
  textIcon,
} from '../lib/icons';
import { ItemIcon, SymbolIcon } from './ItemIcon';

type Tab = 'emoji' | 'icons' | 'text';

interface Props {
  /** What the icon belongs to, for labels, e.g. "In TEST". */
  name: string;
  icon: Icon | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` goes back to the default icon. */
  onChange: (icon: Icon | null) => void;
  /** The trigger, usually the row's icon. */
  children: ReactNode;
}

/** Popover to pick an emoji, an icon from the set or up to 3 characters. */
export function IconPicker({ name, icon, open, onOpenChange, onChange, children }: Props) {
  const [tab, setTab] = useState<Tab>(tabFor(icon));

  useEffect(() => {
    if (open) setTab(tabFor(icon));
  }, [open, icon]);

  const choose = (next: Icon) => {
    rememberIcon(next);
    onOpenChange(false);
    if (!sameIcon(next, icon)) onChange(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="icon-picker"
          align="start"
          sideOffset={6}
          aria-label={`Icon of ${name}`}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="icon-picker__tabs" role="tablist" aria-label="Icon kind">
            {(['emoji', 'icons', 'text'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={tab === kind}
                className="icon-picker__tab"
                onClick={() => setTab(kind)}
              >
                {kind === 'emoji' ? 'Emoji' : kind === 'icons' ? 'Icons' : 'Text'}
              </button>
            ))}
            <button
              type="button"
              className="icon-picker__reset"
              disabled={!icon}
              onClick={() => {
                onOpenChange(false);
                onChange(null);
              }}
            >
              <RotateCcw className="icon" aria-hidden="true" />
              Reset
            </button>
          </div>
          <div role="tabpanel" className="icon-picker__panel">
            {tab === 'emoji' && <EmojiPanel current={icon} onPick={choose} />}
            {tab === 'icons' && <SymbolPanel current={icon} onPick={choose} />}
            {tab === 'text' && <TextPanel current={icon} onPick={choose} />}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function tabFor(icon: Icon | undefined): Tab {
  if (icon?.kind === 'symbol') return 'icons';
  if (icon?.kind === 'text') return 'text';
  return 'emoji';
}

interface PanelProps {
  current: Icon | undefined;
  onPick: (icon: Icon) => void;
}

function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="icon-picker__search">
      <Search className="icon" aria-hidden="true" />
      <input
        className="input"
        aria-label={label}
        placeholder={label}
        value={value}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EmojiPanel({ current, onPick }: PanelProps) {
  const [all, setAll] = useState<EmojiEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(EMOJI_GROUPS[0]?.id ?? 0);
  const recent = readRecentIcons().filter((icon) => icon.kind === 'emoji');

  useEffect(() => {
    let live = true;
    void loadEmoji().then((loaded) => live && setAll(loaded));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (!all) return [];
    return query.trim() ? searchEmoji(all, query) : all.filter((entry) => entry.group === group);
  }, [all, query, group]);

  return (
    <>
      <SearchField label="Search emoji" value={query} onChange={setQuery} />
      {!query.trim() && (
        <>
          {recent.length > 0 && (
            <>
              <p className="icon-picker__label">Recent</p>
              <div className="icon-picker__grid">
                {recent.map((icon) => (
                  <EmojiButton key={icon.value} emoji={icon.value} label={icon.value} current={current} onPick={onPick} />
                ))}
              </div>
            </>
          )}
          <div className="icon-picker__groups" role="group" aria-label="Emoji category">
            {EMOJI_GROUPS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="icon-picker__group"
                aria-pressed={group === option.id}
                onClick={() => setGroup(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
      {all === null ? (
        <p className="icon-picker__empty">Loading emoji…</p>
      ) : shown.length === 0 ? (
        <p className="icon-picker__empty">No emoji matches.</p>
      ) : (
        <div className="icon-picker__grid icon-picker__grid--scroll">
          {shown.map((entry) => (
            <EmojiButton key={entry.unicode} emoji={entry.unicode} label={entry.label} current={current} onPick={onPick} />
          ))}
        </div>
      )}
    </>
  );
}

function EmojiButton({ emoji, label, current, onPick }: { emoji: string; label: string } & PanelProps) {
  const icon: Icon = { kind: 'emoji', value: emoji };
  return (
    <button
      type="button"
      className="icon-picker__cell icon-picker__cell--emoji"
      aria-label={label}
      title={label}
      aria-pressed={sameIcon(icon, current)}
      onClick={() => onPick(icon)}
    >
      {emoji}
    </button>
  );
}

const SYMBOL_LIMIT = 96;

function SymbolPanel({ current, onPick }: PanelProps) {
  const [query, setQuery] = useState('');
  const names = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return SUGGESTED_SYMBOLS;
    return iconNames.filter((name) => words.every((word) => name.includes(word))).slice(0, SYMBOL_LIMIT);
  }, [query]);

  return (
    <>
      <SearchField label="Search icons" value={query} onChange={setQuery} />
      {names.length === 0 ? (
        <p className="icon-picker__empty">No icon matches.</p>
      ) : (
        <div className="icon-picker__grid icon-picker__grid--scroll">
          {names.map((name) => {
            const icon: Icon = { kind: 'symbol', value: name };
            return (
              <button
                key={name}
                type="button"
                className="icon-picker__cell"
                aria-label={name}
                title={name}
                aria-pressed={sameIcon(icon, current)}
                onClick={() => onPick(icon)}
              >
                <SymbolIcon name={name} />
              </button>
            );
          })}
        </div>
      )}
      <p className="icon-picker__hint">Icons follow the light or dark theme.</p>
    </>
  );
}

function TextPanel({ current, onPick }: PanelProps) {
  const [value, setValue] = useState(current?.kind === 'text' ? current.value : '');
  const [error, setError] = useState('');
  const preview = textIcon(value);

  return (
    <>
      <form
        className="icon-picker__text"
        onSubmit={(event) => {
          event.preventDefault();
          const icon = textIcon(value);
          if (typeof icon === 'string') setError(icon);
          else onPick(icon);
        }}
      >
        <input
          className="input"
          aria-label="Text icon"
          placeholder="142"
          value={value}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
        />
        <span className="icon-picker__preview">
          {typeof preview === 'string' ? null : <ItemIcon icon={preview} kind="web" />}
        </span>
        <button type="submit" className="button">
          Use
        </button>
      </form>
      {error ? (
        <p className="add-form__error" role="alert">
          {error}
        </p>
      ) : (
        <p className="icon-picker__hint">Up to 3 characters: a ticket number, initials, a symbol.</p>
      )}
      <p className="icon-picker__label">Symbols</p>
      <div className="icon-picker__grid">
        {SYMBOLS.map((symbol) => {
          const icon: Icon = { kind: 'text', value: symbol };
          return (
            <button
              key={symbol}
              type="button"
              className="icon-picker__cell"
              aria-label={`Symbol ${symbol}`}
              aria-pressed={sameIcon(icon, current)}
              onClick={() => onPick(icon)}
            >
              {symbol}
            </button>
          );
        })}
      </div>
    </>
  );
}
