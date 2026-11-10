import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appliedCommands } from './test/ipc';
import {
  IN_TEST,
  ONBOARDING,
  SPRINT,
  STATUS_TAB,
  TRABAJO,
  WORK,
  clickMenuItem,
  renderApp,
  rightClick,
  sidebar,
  treeRow,
} from './test/render';

const menuLabels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.trim());

describe('sidebar tree', () => {
  it('shows profiles with their groups, folders and tabs at the top level', async () => {
    await renderApp();

    for (const name of ['Trabajo', 'Personal', 'QA', 'Trabajo · Jira', 'In TEST', 'Onboarding', 'Status page']) {
      expect(treeRow(name)).toBeTruthy();
    }
    expect(within(sidebar()).queryByText('Sprint 42')).toBeNull();
  });

  it('expands groups to show folders, and folders to show tabs', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Trabajo · Jira' }));
    expect(treeRow('Sprint 42')).toBeTruthy();
    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Sprint 42' }));
    expect(treeRow('PROJ-1182 · Refactor del login')).toBeTruthy();

    await user.click(within(sidebar()).getByRole('button', { name: 'Collapse Trabajo' }));
    expect(within(sidebar()).queryByText('Trabajo · Jira')).toBeNull();
  });

  it('remembers what is expanded on this computer', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Trabajo · Jira' }));

    expect(JSON.parse(localStorage.getItem('tabstage.tree') ?? '{}')).toEqual({ [WORK]: true });
  });

  it('selecting a group or folder shows it as a list; a tab shows its detail', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'In TEST' }));
    expect(await screen.findByRole('heading', { name: 'In TEST' })).toBeTruthy();

    await user.click(within(sidebar()).getByRole('button', { name: 'Onboarding' }));
    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeTruthy();

    await user.click(within(sidebar()).getByRole('button', { name: 'Status page' }));
    expect(await screen.findByRole('heading', { name: 'Status page' })).toBeTruthy();
    expect(calls.some((call) => call.cmd === 'open_tab')).toBe(false);
  });

  it('a double-click on a tab row opens it in the browser', async () => {
    const { calls, user } = await renderApp();

    await user.dblClick(within(sidebar()).getByRole('button', { name: 'Status page' }));

    expect(calls).toContainEqual({ cmd: 'open_tab', args: { tab: STATUS_TAB } });
  });

  it('long names are cut with an ellipsis but stay readable in a tooltip', async () => {
    await renderApp();

    const name = within(sidebar()).getByRole('button', { name: 'Trabajo · Jira' });
    expect(name.getAttribute('title')).toBe('Trabajo · Jira');
  });
});

describe('URLs', () => {
  it('list rows show the whole path after the title', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Trabajo · Jira' }));
    const list = await screen.findByRole('main', { name: 'Trabajo · Jira' });

    expect(within(list).getByRole('button', { name: /^Grafana/ }).textContent).toContain('grafana.example.com/d/api');
  });

  it('the sidebar shows titles only until URLs are turned on from a profile menu', async () => {
    await renderApp();
    expect(treeRow('Status page').textContent).not.toContain('status.example.com');

    await rightClick('Trabajo');
    clickMenuItem('Show URLs');

    expect(treeRow('Status page').textContent).toContain('status…');
    expect(localStorage.getItem('tabstage.sidebarUrls')).toBe('true');

    await rightClick('Trabajo');
    clickMenuItem('Hide URLs');
    expect(treeRow('Status page').textContent).not.toContain('status…');
  });
});

describe('right-click menus follow the hierarchy', () => {
  it('a profile can create groups, folders and tabs', async () => {
    await renderApp();

    const labels = menuLabels(await rightClick('Trabajo'));

    expect(labels).toEqual(expect.arrayContaining(['New group', 'New folder', 'New tab…', 'Open all', 'Rename']));
  });

  it('a group can create folders and tabs, not groups', async () => {
    await renderApp();

    const labels = menuLabels(await rightClick('In TEST'));

    expect(labels).toEqual(expect.arrayContaining(['New folder', 'New tab…', 'Change icon…']));
    expect(labels).not.toContain('New group');
  });

  it('a folder can create tabs only', async () => {
    await renderApp();

    const labels = menuLabels(await rightClick('Onboarding'));

    expect(labels).toContain('New tab…');
    expect(labels).not.toContain('New folder');
    expect(labels).not.toContain('New group');
  });

  it('a tab creates nothing', async () => {
    await renderApp();

    const labels = menuLabels(await rightClick('Status page'));

    expect(labels).toEqual(expect.arrayContaining(['Open', 'Change icon…', 'Rename']));
    expect(labels.some((label) => label?.startsWith('New'))).toBe(false);
  });
});

describe('creating from the tree', () => {
  it('adds a folder straight into a profile', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Trabajo');
    clickMenuItem('New folder');
    await user.type(await screen.findByRole('textbox', { name: 'Folder name' }), 'Docs{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'addFolder', place: { profile: TRABAJO }, name: 'Docs' }]);
  });

  it('adds a group to a profile', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Trabajo');
    clickMenuItem('New group');
    await user.type(await screen.findByRole('textbox', { name: 'Group name' }), 'Done{Enter}');

    expect(appliedCommands(calls)).toEqual([
      expect.objectContaining({ type: 'addGroup', profile: TRABAJO, name: 'Done' }),
    ]);
  });

  it('adds a folder inside a group', async () => {
    const { calls, user } = await renderApp();

    await rightClick('In TEST');
    clickMenuItem('New folder');
    await user.type(await screen.findByRole('textbox', { name: 'Folder name' }), 'PROJ-150{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'addFolder', place: { group: IN_TEST }, name: 'PROJ-150' }]);
  });

  it('adds a tab straight into a profile through the dialog', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Trabajo');
    clickMenuItem('New tab…');
    const dialog = await screen.findByRole('dialog', { name: 'New tab in Trabajo' });
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'https://wiki.dev');
    await user.click(within(dialog).getByRole('button', { name: 'Add tab' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'addTab', place: { profile: TRABAJO }, url: 'https://wiki.dev', title: '' },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('adds a tab inside a folder', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Onboarding');
    clickMenuItem('New tab…');
    const dialog = await screen.findByRole('dialog', { name: 'New tab in Trabajo / Onboarding' });
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'https://hr.dev');
    await user.click(within(dialog).getByRole('button', { name: 'Add tab' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'addTab', place: { folder: ONBOARDING }, url: 'https://hr.dev', title: '' },
    ]);
  });
});

describe('editing from the tree', () => {
  it('renames a profile from its menu', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Personal');
    clickMenuItem('Rename');
    const input = await screen.findByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'Casa{Enter}');

    expect(appliedCommands(calls)).toContainEqual({
      type: 'renameProfile',
      profile: '00000000-0000-0000-0000-0000000000c2',
      name: 'Casa',
    });
  });

  it('moves a folder from its menu', async () => {
    const { calls } = await renderApp();

    await rightClick('Onboarding');
    clickMenuItem('Move to…');
    clickMenuItem('Trabajo / In TEST');

    expect(appliedCommands(calls)).toEqual([{ type: 'moveFolder', folder: ONBOARDING, place: { group: IN_TEST }, index: 1 }]);
  });

  it('asks before deleting a group that has tabs', async () => {
    const { calls, user } = await renderApp();

    await rightClick('Trabajo · Jira');
    clickMenuItem('Delete…');
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “Trabajo · Jira”?' });
    expect(confirm.textContent).toContain('5 tabs');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'removeGroup', group: WORK }]);
  });

  it('deleting a profile moves its contents to the profile chosen', async () => {
    const { calls, user } = await renderApp();

    await rightClick('QA');
    clickMenuItem('Delete…');
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('radio', { name: 'Personal' }));
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(appliedCommands(calls)).toEqual([
      {
        type: 'removeProfile',
        profile: '00000000-0000-0000-0000-0000000000c3',
        moveItemsTo: '00000000-0000-0000-0000-0000000000c2',
      },
    ]);
  });

  it('the folder list shows its path back to the profile', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Expand Trabajo · Jira' }));
    await user.click(within(sidebar()).getByRole('button', { name: 'Sprint 42' }));

    const path = await screen.findByRole('navigation', { name: 'Path' });
    expect(path.textContent).toContain('Trabajo');
    expect(path.textContent).toContain('Trabajo · Jira');
    expect(screen.getByRole('heading', { name: 'Sprint 42' })).toBeTruthy();
    expect(SPRINT).toBeTruthy();
  });
});
