import { useMemo, useState } from 'react';
import { FilterInput } from '@/components/FilterInput';
import { Lane } from '@/components/Lane';
import { useGroups } from '@/hooks/useGroups';
import { useStatuses } from '@/hooks/useStatuses';
import { buildLanes } from '@/lib/lanes';

/** The side panel (Chrome) or sidebar (Firefox): groups in lanes by status. */
function App() {
  const statuses = useStatuses();
  const groups = useGroups(statuses);
  const [filter, setFilter] = useState('');
  const lanes = useMemo(
    () => (statuses && groups ? buildLanes(groups, statuses, filter) : []),
    [groups, statuses, filter],
  );

  const renderBody = () => {
    if (!statuses || !groups) return <p className="panel__message">Loading groups…</p>;
    if (groups.length === 0) {
      return (
        <p className="panel__message">
          No tab groups yet. Group some tabs in the tab strip to see them here.
        </p>
      );
    }
    if (lanes.length === 0) {
      return <p className="panel__message">No groups match “{filter.trim()}”.</p>;
    }
    return lanes.map((lane) => <Lane key={lane.id} lane={lane} statuses={statuses} />);
  };

  return (
    <main className="panel">
      <header className="panel__header">
        <FilterInput value={filter} onChange={setFilter} />
      </header>
      <div className="panel__lanes">{renderBody()}</div>
    </main>
  );
}

export default App;
