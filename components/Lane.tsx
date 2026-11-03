import { useId } from 'react';
import type { Lane as LaneData } from '@/lib/lanes';
import type { Status } from '@/lib/types';
import { GroupCard } from './GroupCard';

interface LaneProps {
  lane: LaneData;
  statuses: readonly Status[];
}

/** A status section: colored dot, label, count and its groups. */
export function Lane({ lane, statuses }: LaneProps) {
  const headingId = useId();

  return (
    <section className="lane" aria-labelledby={headingId} data-empty={lane.count === 0 || undefined}>
      <h2 id={headingId} className="lane__header">
        <span className="dot" data-color={lane.color ?? 'none'} aria-hidden="true" />
        <span className="lane__label">{lane.label}</span>
        <span className="lane__count" aria-label={`${lane.count} groups`}>
          {lane.count}
        </span>
      </h2>
      {lane.count > 0 && (
        <ul className="lane__groups">
          {lane.groups.map((group) => (
            <GroupCard key={group.id} group={group} statuses={statuses} />
          ))}
        </ul>
      )}
    </section>
  );
}
