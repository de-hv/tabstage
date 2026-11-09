import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from './App';
import { appError, appliedCommands, installIpc, snapshotFixture } from './test/ipc';
import { SPRINT, WORK, renderApp, sidebar } from './test/render';

const DOCS = '00000000-0000-0000-0000-0000000000a3';
const WORK_PROFILE = '00000000-0000-0000-0000-0000000000c1';
const QA_PROFILE = '00000000-0000-0000-0000-0000000000c3';

function profileGroups(name: string) {
  return within(sidebar()).getByRole('list', { name: `Groups in ${name}` });
}

async function openCreateMenu(user: ReturnType<typeof userEvent.setup>, profile: string) {
  await user.click(within(sidebar()).getByRole('button', { name: `Create in ${profile}` }));
}

describe('sidebar by profile', () => {
  it('lists each group under its profile', async () => {
    await renderApp();

    expect(within(profileGroups('Trabajo')).getByRole('button', { name: 'Trabajo · Jira' })).toBeTruthy();
    expect(within(profileGroups('Personal')).getByRole('button', { name: 'Investigación' })).toBeTruthy();
    expect(within(profileGroups('QA')).getByRole('button', { name: 'Docs Rust' })).toBeTruthy();
  });

  it('collapses a profile and remembers it', async () => {
    const { user } = await renderApp();

    const toggle = within(sidebar()).getByRole('button', { name: 'Collapse profile Personal' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);

    expect(within(sidebar()).queryByRole('list', { name: 'Groups in Personal' })).toBeNull();
    expect(
      within(sidebar()).getByRole('button', { name: 'Expand profile Personal' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(localStorage.getItem('tabstage.collapsedProfiles')).toContain('0000000000c2');
  });

  it('marks a profile that is not configured on this machine', async () => {
    await renderApp();

    expect(within(sidebar()).getByRole('img', { name: 'QA: not set up on this computer' })).toBeTruthy();
    expect(within(sidebar()).queryByRole('img', { name: /Trabajo: sin configurar/ })).toBeNull();
  });

  it('creates a group inside a profile', async () => {
    const { calls, user } = await renderApp();

    await openCreateMenu(user, 'QA');
    await user.click(screen.getByRole('menuitem', { name: 'New group' }));
    await user.type(screen.getByRole('textbox', { name: 'Group name' }), 'Staging{Enter}');

    expect(appliedCommands(calls)).toEqual([
      expect.objectContaining({ type: 'addGroup', profile: QA_PROFILE, name: 'Staging' }),
    ]);
  });

  it('creates a folder in a chosen group of the profile', async () => {
    const { calls, user } = await renderApp();

    await openCreateMenu(user, 'Trabajo');
    await user.click(screen.getByRole('menuitem', { name: 'New folder…' }));
    const dialog = screen.getByRole('dialog', { name: 'New folder in Trabajo' });
    const groups = within(dialog).getByRole('combobox', { name: 'Group' });
    expect(within(groups).getAllByRole('option').map((option) => option.textContent)).toEqual(['Trabajo · Jira']);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Sprint 43');
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'addFolder', group: WORK, name: 'Sprint 43' }]);
  });

  it('creates a tab in a chosen group and folder', async () => {
    const { calls, user } = await renderApp();

    await openCreateMenu(user, 'Trabajo');
    await user.click(screen.getByRole('menuitem', { name: 'New tab…' }));
    const dialog = screen.getByRole('dialog', { name: 'New tab in Trabajo' });
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'https://jira.example.com/browse/PROJ-1201');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Folder' }), 'Sprint 42');
    await user.click(within(dialog).getByRole('button', { name: 'Add tab' }));

    expect(appliedCommands(calls)).toEqual([
      {
        type: 'addTab',
        place: { folder: SPRINT },
        url: 'https://jira.example.com/browse/PROJ-1201',
        title: '',
      },
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the new tab dialog open on an invalid URL', async () => {
    const { user } = await renderApp({
      apply: () => {
        throw appError('invalidUrl');
      },
    });

    await openCreateMenu(user, 'Trabajo');
    await user.click(screen.getByRole('menuitem', { name: 'New tab…' }));
    const dialog = screen.getByRole('dialog', { name: 'New tab in Trabajo' });
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'jira');
    await user.click(within(dialog).getByRole('button', { name: 'Add tab' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Enter a web address that starts with http:// or https://',
    );
  });

  it('creates a profile from the sidebar', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'New profile' }));
    await user.type(screen.getByRole('textbox', { name: 'Profile name' }), 'Cliente X{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'addProfile', name: 'Cliente X' }]);
  });

  it('offers only "New group" in a profile without groups', async () => {
    const empty = '00000000-0000-0000-0000-0000000000c9';
    const withEmptyProfile = () => {
      const next = snapshotFixture();
      next.workspace.profiles.push({ id: empty, name: 'Vacío', color: 3 });
      next.profiles.push({
        profile: empty,
        binding: null,
        browser: 'org.mozilla.firefox',
        isBound: false,
        isFallback: false,
        canFocusTabs: false,
      });
      return next;
    };
    installIpc({ snapshot: withEmptyProfile });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Trabajo · Jira' });

    await openCreateMenu(user, 'Vacío');

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toContain('New group');
    expect(items).not.toContain('New folder…');
    expect(items).not.toContain('New tab…');
  });

  it('moves a group to a profile dropped on its header', async () => {
    const { calls } = await renderApp();
    const transfer = { setData: () => undefined, getData: () => '', effectAllowed: 'all', dropEffect: 'none', types: [] };
    const group = within(sidebar()).getByRole('button', { name: 'Trabajo · Jira' });
    const header = within(sidebar()).getByRole('button', { name: 'Collapse profile QA' });

    fireEvent.dragStart(group, { dataTransfer: transfer });
    fireEvent.dragOver(header, { dataTransfer: transfer });
    fireEvent.drop(header, { dataTransfer: transfer });

    expect(appliedCommands(calls)).toEqual([{ type: 'setGroupProfile', group: WORK, profile: QA_PROFILE }]);
  });
});

describe('profile color and menu', () => {
  it('changes the color from the dot', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Color of Trabajo' }));
    expect(screen.getByRole('menuitemradio', { name: 'Rose' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Teal' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setProfileColor', profile: WORK_PROFILE, color: 10 }]);
  });

  it('offers all twenty colors', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Color of QA' }));

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(20);
  });

  it('renames a profile from its menu', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Options for profile QA' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = within(sidebar()).getByRole('textbox', { name: 'Profile name' });
    expect((input as HTMLInputElement).value).toBe('QA');
    await user.clear(input);
    await user.type(input, 'Testing{Enter}');

    expect(appliedCommands(calls)).toEqual([{ type: 'renameProfile', profile: QA_PROFILE, name: 'Testing' }]);
  });

  it('opens the color picker from the menu', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Options for profile QA' }));
    await user.click(screen.getByRole('menuitem', { name: 'Change color…' }));

    expect(await screen.findByRole('menuitemradio', { name: 'Teal' })).toBeTruthy();
  });

  it('deletes a profile from its menu after choosing where its groups go', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Options for profile QA' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the “QA” profile?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Personal' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(appliedCommands(calls)).toEqual([
      { type: 'removeProfile', profile: QA_PROFILE, moveGroupsTo: '00000000-0000-0000-0000-0000000000c2' },
    ]);
  });
});

describe('group profile', () => {
  it('shows the profile and where it opens', async () => {
    await renderApp();

    const picker = screen.getByRole('button', { name: 'Group profile: Trabajo' });
    expect(picker.textContent).toContain('Google Chrome · Trabajo');
  });

  it('moves the group to another profile', async () => {
    const { calls, user } = await renderApp();

    await user.click(screen.getByRole('button', { name: 'Group profile: Trabajo' }));
    expect(screen.getByRole('menuitemradio', { name: 'Trabajo' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'QA' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setGroupProfile', group: WORK, profile: QA_PROFILE }]);
  });

  it('explains when the profile is not configured here and links to settings', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Docs Rust' }));
    const note = screen.getByRole('note');
    expect(note.textContent).toContain(
      'The “QA” profile is not set up on this computer. For now its tabs open in Firefox.',
    );
    await user.click(within(note).getByRole('button', { name: 'Configure profile' }));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('opens settings from the profile menu', async () => {
    const { user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Options for profile Trabajo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Configure profile' }));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('keeps the group id when a group is moved from its menu', async () => {
    const { calls, user } = await renderApp();

    await user.click(within(sidebar()).getByRole('button', { name: 'Docs Rust' }));
    await user.click(screen.getByRole('button', { name: 'Group options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Trabajo' }));

    expect(appliedCommands(calls)).toEqual([{ type: 'setGroupProfile', group: DOCS, profile: WORK_PROFILE }]);
  });
});
