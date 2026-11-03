import { useState } from 'react';
import { focusTab, type GroupTab } from '@/lib/groups';

interface TabRowProps {
  tab: GroupTab;
}

/** A tab of an expanded group. Clicking it focuses the tab. */
export function TabRow({ tab }: TabRowProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const title = tab.title || tab.url || 'Untitled tab';

  const onClick = () => {
    focusTab(tab.id).catch((error: unknown) => {
      console.warn('Tabstage: could not focus the tab', error);
    });
  };

  return (
    <li>
      <button
        type="button"
        className="tab-row"
        data-active={tab.active || undefined}
        title={tab.url}
        onClick={onClick}
      >
        {tab.favIconUrl && !iconFailed ? (
          <img
            className="tab-row__icon"
            src={tab.favIconUrl}
            alt=""
            width={16}
            height={16}
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span className="tab-row__icon tab-row__icon--empty" aria-hidden="true" />
        )}
        <span className="tab-row__title">{title}</span>
      </button>
    </li>
  );
}
