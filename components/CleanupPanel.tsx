import { useState } from 'react';
import { cleanupNativeTitles, type CleanupResult } from '@/lib/cleanup';
import type { Status } from '@/lib/types';

interface CleanupPanelProps {
  statuses: readonly Status[];
}

function describe(result: CleanupResult): string {
  switch (result.kind) {
    case 'denied':
      return 'Nothing changed: the permission was not granted.';
    case 'unsupported':
      return 'This browser has no tab groups to clean.';
    case 'done':
      if (result.cleaned === 0) return 'No group title had a Tabstage suffix.';
      return result.cleaned === 1 ? 'Cleaned 1 group title.' : `Cleaned ${result.cleaned} group titles.`;
  }
}

/**
 * The opt-in cleanup of the v1 ` · <status>` suffix in native tab group
 * titles. It asks for the tab groups permission only when pressed and changes
 * titles only.
 */
export function CleanupPanel({ statuses }: CleanupPanelProps) {
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    // Called straight from the click: the permission prompt needs it.
    cleanupNativeTitles(statuses)
      .then((result) => setMessage(describe(result)))
      .catch((error: unknown) => {
        console.warn('Tabstage: could not clean the titles', error);
        setMessage('Could not clean the titles.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="options__section" aria-labelledby="cleanup-title">
      <h2 id="cleanup-title">Clean up v1 titles</h2>
      <p className="options__intro">
        Tabstage 0.1 wrote the status at the end of native tab group titles, like{' '}
        <code>CAR-6124 · STG</code>. Tabstage no longer touches native groups. This removes that
        suffix once, when you press the button. Colors and grouping stay as they are.
      </p>
      <div className="options__actions">
        <button type="button" className="button" disabled={busy} onClick={run}>
          Remove Tabstage suffix from native group titles
        </button>
      </div>
      {message && (
        <p className="options__note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
