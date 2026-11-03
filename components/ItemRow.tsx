import { useState } from 'react';
import type { BoardItem } from '@/lib/types';
import { menuTrigger, type OpenMenu } from './menu-trigger';

interface ItemRowProps {
  item: BoardItem;
  /** Focuses the tab, or reopens a closed link. */
  onOpen: (item: BoardItem) => void;
  onRemove: (item: BoardItem) => void;
  onMenu: (item: BoardItem, x: number, y: number) => void;
}

function Favicon({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className="item__favicon item__favicon--none" aria-hidden="true" />;
  return (
    <img
      className="item__favicon"
      src={url}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * One added tab: favicon and title. A closed link is dimmed, says "closed",
 * reopens on click and has a ✕ to remove it. Right-click or the Menu key
 * opens its actions.
 */
export function ItemRow({ item, onOpen, onRemove, onMenu }: ItemRowProps) {
  const closed = item.tabId === null;
  const open: OpenMenu = (x, y) => onMenu(item, x, y);

  return (
    <li className="item" data-closed={closed || undefined}>
      <button
        type="button"
        className="item__main"
        title={item.url}
        aria-label={closed ? `${item.title} (closed, click to reopen)` : item.title}
        onClick={() => onOpen(item)}
        {...menuTrigger(open)}
      >
        <Favicon url={item.favIconUrl} />
        <span className="item__title">{item.title}</span>
        {closed && <span className="item__closed">closed</span>}
      </button>
      {closed && (
        <button
          type="button"
          className="icon-button item__remove"
          aria-label={`Remove ${item.title}`}
          title="Remove from Tabstage"
          onClick={() => onRemove(item)}
        >
          ✕
        </button>
      )}
    </li>
  );
}
