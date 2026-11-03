import { useId, useState } from 'react';
import type { Group } from '@/lib/groups';
import type { Status } from '@/lib/types';
import { StatusChip } from './StatusChip';
import { TabRow } from './TabRow';

interface GroupCardProps {
  group: Group;
  statuses: readonly Status[];
}

/** The name without the ticket key and the separators around it. */
function nameWithoutKey({ name, ticketKey }: Group): string {
  if (name === ticketKey) return '';
  return name.replace(ticketKey, '').replace(/^[\s:·\-–—|]+/, '').trim();
}

/**
 * A group row: chevron, ticket key, name and status chip. Expanding it shows
 * its tabs. Expansion is local to the panel, so it never collapses the group
 * in the tab strip.
 */
export function GroupCard({ group, statuses }: GroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tabsId = useId();
  const key = group.ticketKey || 'Unnamed group';
  const rest = nameWithoutKey(group);

  return (
    <li className="group-card" data-color={group.color}>
      <div className="group-card__row">
        <button
          type="button"
          className="group-card__toggle"
          aria-expanded={expanded}
          aria-controls={tabsId}
          title={group.title}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="chevron" aria-hidden="true" />
          <span className="group-card__key">{key}</span>
          {rest && <span className="group-card__name">{rest}</span>}
          <span className="group-card__tab-count" aria-label={`${group.tabs.length} tabs`}>
            {group.tabs.length}
          </span>
        </button>
        <StatusChip group={group} statuses={statuses} />
      </div>
      {expanded && (
        <ul id={tabsId} className="group-card__tabs" aria-label={`Tabs in ${key}`}>
          {group.tabs.length === 0 ? (
            <li className="group-card__empty">No tabs</li>
          ) : (
            group.tabs.map((tab) => <TabRow key={tab.id} tab={tab} />)
          )}
        </ul>
      )}
    </li>
  );
}
