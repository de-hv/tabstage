import { StatusEditor } from '@/components/StatusEditor';
import { useStatuses } from '@/hooks/useStatuses';
import { TITLE_SEPARATOR } from '@/lib/types';

/** The options page: edits the list of statuses. */
function App() {
  const statuses = useStatuses();

  return (
    <main className="options">
      <header className="options__header">
        <h1>Statuses</h1>
        <p className="options__intro">
          Each tab group shows its status at the end of its title, as in{' '}
          <code>CAR-6124{TITLE_SEPARATOR}STG</code>, and takes the status color. Renaming,
          recoloring or deleting a status updates every group that uses it.
        </p>
      </header>
      {statuses ? (
        <StatusEditor statuses={statuses} />
      ) : (
        <p className="options__message">Loading statuses…</p>
      )}
    </main>
  );
}

export default App;
