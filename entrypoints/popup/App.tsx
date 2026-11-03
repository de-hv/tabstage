import { useEffect, useId, useMemo, useState } from 'react';
import { browser } from '#imports';
import { PaletteInput } from '@/components/PaletteInput';
import { optionId, PaletteResults } from '@/components/PaletteResults';
import { useGroups } from '@/hooks/useGroups';
import { useListNavigation } from '@/hooks/useListNavigation';
import { useStatuses } from '@/hooks/useStatuses';
import { focusTab, setStatus } from '@/lib/groups';
import { openPanel } from '@/lib/panel';
import { parseCommand, type PaletteAction } from '@/lib/palette';

/**
 * Runs an action. `openPanel` is called before any await, so it keeps the
 * click or Enter user gesture.
 */
async function runAction(action: PaletteAction, windowId: number | undefined): Promise<void> {
  switch (action.kind) {
    case 'focus-group':
      return focusTab(action.tabId);
    case 'focus-tab':
      return focusTab(action.tab.id);
    case 'set-status':
      return setStatus(action.group.id, action.status?.id ?? null);
    case 'open-panel':
      if (!(await openPanel(windowId))) throw new Error('No side panel API');
  }
}

/** The command palette: search groups and tabs, set statuses, open the panel. */
function App() {
  const statuses = useStatuses();
  const groups = useGroups(statuses);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [windowId, setWindowId] = useState<number>();
  const listId = useId();

  // Chrome's sidePanel.open needs a window id, read now so Enter doesn't await.
  useEffect(() => {
    let active = true;
    browser.windows
      .getCurrent()
      .then((window) => {
        if (active) setWindowId(window?.id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const actions = useMemo(
    () => (statuses && groups ? parseCommand(query, groups, statuses) : []),
    [query, groups, statuses],
  );

  const run = (index: number) => {
    const action = actions[index];
    if (!action) return;
    setError(undefined);
    runAction(action, windowId)
      .then(() => window.close())
      .catch((reason: unknown) => {
        console.warn('Tabstage: could not run the command', reason);
        setError(
          action.kind === 'open-panel'
            ? 'Could not open the side panel.'
            : 'Could not run the command. Try again.',
        );
      });
  };

  const { index, setIndex, onKeyDown } = useListNavigation({
    count: actions.length,
    resetKey: query,
    onEnter: run,
  });
  const selected = actions[index];

  const renderMessage = () => {
    if (!statuses || !groups) return 'Loading groups…';
    if (actions.length === 0) return `No results for “${query.trim()}”.`;
    return null;
  };
  const message = renderMessage();

  return (
    <main className="palette">
      <PaletteInput
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        listId={listId}
        activeId={selected && optionId(listId, selected)}
      />
      {error && (
        <p className="palette__error" role="alert">
          {error}
        </p>
      )}
      <PaletteResults
        id={listId}
        actions={actions}
        statuses={statuses ?? []}
        selected={index}
        onSelect={setIndex}
        onRun={run}
      />
      {message && <p className="palette__message">{message}</p>}
      <footer className="palette__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> run</span>
        <span><kbd>Esc</kbd> close</span>
        <span className="palette__tip">Try “6115 dev”, “stg” or “panel”</span>
      </footer>
    </main>
  );
}

export default App;
