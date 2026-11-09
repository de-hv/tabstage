import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import { GRAFANA_TAB, SPRINT, WORK, renderApp, sidebar } from './test/render';

const RESEARCH = '00000000-0000-0000-0000-0000000000a2';
const DOCS = '00000000-0000-0000-0000-0000000000a3';
const INCIDENTS = '00000000-0000-0000-0000-0000000000f2';
const RUNBOOK_TAB = '00000000-0000-0000-0000-000000000b05';

function dataTransfer() {
  return { setData: () => undefined, getData: () => '', effectAllowed: 'all', dropEffect: 'none', types: [] };
}

/** The draggable element that holds a control. */
function draggableOf(element: HTMLElement): HTMLElement {
  const draggable = element.closest<HTMLElement>('[draggable="true"]');
  if (!draggable) throw new Error('element is not inside a draggable');
  return draggable;
}

function drag(source: HTMLElement, target: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragEnter(target, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragEnd(source, { dataTransfer: transfer });
}

/**
 * happy-dom gives every element an empty box, so Radix's submenu "pointer
 * grace" closes the submenu as soon as the simulated pointer leaves its
 * trigger. Clicking the item directly skips that pointer path.
 */
function clickSubmenuItem(name: string) {
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

const row = (name: RegExp | string) => draggableOf(screen.getByRole('button', { name }));
const groupItem = (name: RegExp) => draggableOf(within(sidebar()).getByRole('button', { name }));

describe('drag and drop', () => {
  it('moves a tab to the place of another row', async () => {
    const { calls } = await renderApp();

    drag(row(/^Runbook/), row(/^Grafana/));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTab', tab: RUNBOOK_TAB, place: { group: WORK }, index: 2 },
    ]);
  });

  it('drops a tab into a folder through its header', async () => {
    const { calls } = await renderApp();

    drag(row(/^Runbook/), row('Contraer Sprint 42'));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTab', tab: RUNBOOK_TAB, place: { folder: SPRINT }, index: 2 },
    ]);
  });

  it('reorders folders', async () => {
    const { calls } = await renderApp();

    drag(row('Expandir Incidentes'), row('Contraer Sprint 42'));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveFolder', folder: INCIDENTS, group: WORK, index: 0 },
    ]);
  });

  it('moves a tab to another group through the sidebar', async () => {
    const { calls } = await renderApp();

    drag(row(/^Grafana/), groupItem(/Investigación/));

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTab', tab: GRAFANA_TAB, place: { group: RESEARCH }, index: 1 },
    ]);
  });

  it('reorders groups in the sidebar', async () => {
    const { calls } = await renderApp();

    drag(groupItem(/Docs Rust/), groupItem(/Trabajo/));

    expect(appliedCommands(calls)).toEqual([{ type: 'moveGroup', group: DOCS, index: 0 }]);
  });

  it('sets the status by dropping on a board tile', async () => {
    const { calls, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Por estado' }));

    drag(row(/^Grafana/), screen.getByRole('region', { name: 'Done' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'setStatus', target: { tab: GRAFANA_TAB }, status: 'done' },
    ]);
  });

  it('sends nothing when the drop changes nothing', async () => {
    const { calls } = await renderApp();

    drag(row(/^Grafana/), row(/^Grafana/));
    drag(row(/^Grafana/), row(/^Runbook/));

    expect(appliedCommands(calls)).toEqual([]);
  });

  it('highlights the row under the dragged item', async () => {
    await renderApp();
    const transfer = dataTransfer();

    fireEvent.dragStart(row(/^Runbook/), { dataTransfer: transfer });
    fireEvent.dragOver(row(/^Grafana/), { dataTransfer: transfer });
    expect(row(/^Grafana/).dataset.drop).toBe('true');

    fireEvent.dragLeave(row(/^Grafana/), { dataTransfer: transfer });
    expect(row(/^Grafana/).dataset.drop).toBeUndefined();
  });
});

describe('Move to menu', () => {
  it('moves a tab to another group', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de Grafana · latencia API' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover a…' }));
    clickSubmenuItem('Investigación');

    expect(appliedCommands(calls)).toEqual([
      { type: 'moveTab', tab: GRAFANA_TAB, place: { group: RESEARCH }, index: 1 },
    ]);
  });

  it('lists folders as destinations for tabs and leaves out the current place', async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de Grafana · latencia API' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover a…' }));

    const names = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(names).toEqual(expect.arrayContaining(['Trabajo · Jira / Sprint 42', 'Investigación']));
    expect(names).not.toContain('Trabajo · Jira');
  });

  it('moves a folder to another group', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Opciones de la carpeta Sprint 42' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover a…' }));
    clickSubmenuItem('Docs Rust');

    expect(appliedCommands(calls)).toEqual([{ type: 'moveFolder', folder: SPRINT, group: DOCS, index: 0 }]);
  });
});
