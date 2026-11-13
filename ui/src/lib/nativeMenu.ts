/**
 * Turns off the webview's own right-click menu ("Reload", "Inspect
 * Element"), which is not part of the app. Text fields keep theirs, for
 * cut, copy and paste. Returns a function that turns it back on.
 */
export function suppressNativeContextMenu(target: Window = window): () => void {
  const onContextMenu = (event: MouseEvent) => {
    if (!isEditable(event.target)) event.preventDefault();
  };
  target.addEventListener('contextmenu', onContextMenu);
  return () => target.removeEventListener('contextmenu', onContextMenu);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest('input, textarea, [contenteditable]');
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'color', 'radio', 'range', 'submit', 'reset', 'file', 'image'].includes(field.type);
  }
  return !(field instanceof HTMLElement && field.getAttribute('contenteditable') === 'false');
}
