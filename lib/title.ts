import { findStatusByLabel } from './statuses';
import { TITLE_SEPARATOR, type ParsedTitle, type Status } from './types';

const TICKET_KEY = /[A-Z][A-Z0-9]+-\d+/;

/**
 * Splits `"<name> · <label>"` on the last separator. When the suffix is not a
 * known status, the whole title is the name and `statusId` is `null`.
 */
export function parseTitle(
  title: string,
  statuses: readonly Status[],
): ParsedTitle {
  const at = title.lastIndexOf(TITLE_SEPARATOR);
  const status =
    at === -1
      ? undefined
      : findStatusByLabel(statuses, title.slice(at + TITLE_SEPARATOR.length));
  const name = (status ? title.slice(0, at) : title).trim();

  return {
    name,
    ticketKey: extractTicketKey(name),
    statusId: status?.id ?? null,
  };
}

/** Builds a group title; with no status, the title is the name alone. */
export function formatTitle(name: string, status: Status | null): string {
  const trimmed = name.trim();
  return status ? `${trimmed}${TITLE_SEPARATOR}${status.label}` : trimmed;
}

/** Returns the first Jira key in the name, or the trimmed name. */
export function extractTicketKey(name: string): string {
  return name.match(TICKET_KEY)?.[0] ?? name.trim();
}
