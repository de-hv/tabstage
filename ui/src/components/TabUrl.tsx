import { readableUrl } from '../lib/urls';

/** First label of a host plus "…", e.g. "jira…", for tight spaces. */
function shortHost(host: string): string {
  const dot = host.indexOf('.');
  return dot > 0 && !/^\d+\./.test(host) ? `${host.slice(0, dot)}…` : host;
}

/**
 * A tab's URL without the scheme. When it does not fit, the middle is cut
 * and the end (a ticket id, the last parameter) stays visible.
 */
export function TabUrl({ url, compact = false }: { url: string; compact?: boolean }) {
  const { host, head, tail } = readableUrl(url);
  return (
    <span className="tab-url" title={url}>
      <span className="tab-url__head">
        <span className="tab-url__host">{compact ? shortHost(host) : host}</span>
        {head}
      </span>
      {tail && <span className="tab-url__tail">{tail}</span>}
    </span>
  );
}
