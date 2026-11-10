import type { AccentColor, Workspace } from '../api/types';
import { allGroups } from './workspace';

/** New groups take the next accent, so neighbours rarely share a color. */
const GROUP_COLORS: AccentColor[] = ['blue', 'mauve', 'green', 'peach', 'teal', 'pink', 'yellow', 'sky', 'lavender', 'red'];

export function nextGroupColor(workspace: Workspace): AccentColor {
  return GROUP_COLORS[allGroups(workspace).length % GROUP_COLORS.length] ?? 'blue';
}
