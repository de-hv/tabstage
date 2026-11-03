/**
 * The native tab group colors. Chrome and Firefox expose the same nine.
 */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export function isGroupColor(value: unknown): value is GroupColor {
  return (
    typeof value === 'string' &&
    (GROUP_COLORS as readonly string[]).includes(value)
  );
}
