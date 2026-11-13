import { afterEach, describe, expect, it } from 'vitest';

import { suppressNativeContextMenu } from './nativeMenu';

describe('native context menu', () => {
  let restore = () => undefined as void;
  afterEach(() => {
    restore();
    document.body.innerHTML = '';
  });

  const rightClick = (element: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('is turned off on the app’s elements but kept in text fields', () => {
    restore = suppressNativeContextMenu();
    document.body.innerHTML = '<div id="row"><span>Ticket</span></div><input id="text" /><textarea id="note"></textarea><input id="pick" type="color" />';

    expect(rightClick(document.querySelector('#row span')!)).toBe(true);
    expect(rightClick(document.querySelector('#pick')!)).toBe(true);
    expect(rightClick(document.querySelector('#text')!)).toBe(false);
    expect(rightClick(document.querySelector('#note')!)).toBe(false);
  });
});
