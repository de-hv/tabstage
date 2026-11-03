import { BackupPanel } from '@/components/BackupPanel';
import { CleanupPanel } from '@/components/CleanupPanel';
import { StatusEditor } from '@/components/StatusEditor';
import { useBoard } from '@/hooks/useBoard';
import { useStatuses } from '@/hooks/useStatuses';

/** The options page: statuses, backup and the opt-in v1 cleanup. */
function App() {
  const statuses = useStatuses();
  const board = useBoard();

  return (
    <main className="options">
      <header className="options__header">
        <h1>Statuses</h1>
        <p className="options__intro">
          Add, rename, recolor, reorder or delete statuses. Any tab or group can go to any status; there
          is no fixed flow. Deleting a status with tabs asks where to move them.
        </p>
      </header>
      {statuses && board ? (
        <>
          <StatusEditor statuses={statuses} board={board} />
          <BackupPanel statuses={statuses} board={board} />
          <CleanupPanel statuses={statuses} />
        </>
      ) : (
        <p className="options__message">Loading statuses…</p>
      )}
    </main>
  );
}

export default App;
