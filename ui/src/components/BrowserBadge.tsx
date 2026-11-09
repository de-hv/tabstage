import type { BrowserKind } from '../api/types';

interface Props {
  name: string;
  kind: BrowserKind;
  /** Dimmed when the group only follows the default browser. */
  dim?: boolean;
}

/** Small round mark with the browser's initial, colored by family. */
export function BrowserBadge({ name, kind, dim = false }: Props) {
  return (
    <span className="badge" data-kind={kind} data-dim={dim || undefined} title={name} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
