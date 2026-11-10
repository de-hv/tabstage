/**
 * A URL split for display: `host`, then `head` (cut in the middle when the
 * space runs out) and `tail`, the end that tells URLs apart (a ticket id, the
 * last query parameter), which stays visible.
 */
export interface ReadableUrl {
  host: string;
  head: string;
  tail: string;
}

export function readableUrl(raw: string): ReadableUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { host: '', head: raw, tail: '' };
  }
  const host = url.host.replace(/^www\./, '');
  const query = url.search;
  const hash = url.hash;
  // A bare "/" only adds noise, unless a query or hash route follows it.
  const path = url.pathname === '/' && !query && !hash ? '' : url.pathname;

  // The end that tells URLs apart: the last query parameter, else the last
  // segment of the hash route or the path.
  if (query) {
    // The value of the last parameter, e.g. `PROJ-1182` in `?selectedIssue=PROJ-1182`.
    const last = Math.max(query.lastIndexOf('&'), 0);
    const equals = query.indexOf('=', last);
    const split = equals === -1 || equals === query.length - 1 ? last : equals + 1;
    return { host, head: path + query.slice(0, split), tail: query.slice(split) + hash };
  }
  const rest = path + hash;
  const slash = rest.lastIndexOf('/');
  if (slash === -1 || slash === rest.length - 1) {
    return { host, head: rest.replace(/\/$/, ''), tail: '' };
  }
  return { host, head: rest.slice(0, slash + 1), tail: rest.slice(slash + 1) };
}
