import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FakeTabGroups } from '../__mocks__/fake-tab-groups';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { TabBuilder } from '../__mocks__/tab.builder';
import { TabGroupBuilder } from '../__mocks__/tab-group.builder';
import { useStatuses } from '../hooks/useStatuses';
import { statusBackupItem } from '../lib/backup';
import { statusesItem } from '../lib/statuses';
import type { Status } from '../lib/types';
import { StatusEditor } from './StatusEditor';

let fake: FakeTabGroups;

/** Reads the statuses from storage, as the options page does. */
function Harness() {
  const statuses = useStatuses();
  return statuses ? <StatusEditor statuses={statuses} /> : null;
}

beforeEach(() => {
  fakeBrowser.reset();
  fake = FakeTabGroups.install().with({
    groups: [
      new TabGroupBuilder().with({ id: 1, title: 'CAR-1 · STG', color: 'orange' }).build(),
      new TabGroupBuilder().with({ id: 2, title: 'CAR-2 · stg', color: 'orange' }).build(),
      new TabGroupBuilder().with({ id: 3, title: 'CAR-3 · Done', color: 'green' }).build(),
    ],
    tabs: [
      new TabBuilder().with({ id: 10, groupId: 1, index: 0 }).build(),
      new TabBuilder().with({ id: 20, groupId: 2, index: 1 }).build(),
      new TabBuilder().with({ id: 30, groupId: 3, index: 2 }).build(),
    ],
  });
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

async function renderEditor(statuses?: Status[]) {
  if (statuses) await statusesItem.setValue(statuses);
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByRole('region', { name: 'Statuses' });
  return user;
}

const saved = () => statusesItem.getValue();
const labels = (statuses: Status[]) => statuses.map((status) => status.label);
const labelInput = (label: string) => screen.getByRole('textbox', { name: `Label of ${label}` });
const button = (name: string) => screen.getByRole('button', { name });
const swatch = (group: string, color: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: color });

describe('StatusEditor', () => {
  it('shows one row per status, in order', async () => {
    await renderEditor();

    expect(
      screen.getAllByRole('textbox', { name: /^Label of / }).map((input) => (input as HTMLInputElement).value),
    ).toEqual(labels(StatusMother.defaults()));
  });

  describe('add', () => {
    it('saves a new status at the end with its color and clears the input', async () => {
      const user = await renderEditor();

      await user.type(screen.getByRole('textbox', { name: 'New status label' }), 'QA');
      await user.click(swatch('Color of the new status', 'red'));
      await user.click(button('Add status'));

      await waitFor(async () =>
        expect(await saved()).toEqual([
          ...StatusMother.defaults(),
          { id: 'qa', label: 'QA', color: 'red', order: 8 },
        ]),
      );
      expect((screen.getByRole('textbox', { name: 'New status label' }) as HTMLInputElement).value).toBe('');
    });

    it('trims the label and saves on Enter', async () => {
      const user = await renderEditor();

      await user.type(screen.getByRole('textbox', { name: 'New status label' }), '  QA  {Enter}');

      await waitFor(async () => expect((await saved()).at(-1)?.label).toBe('QA'));
    });
  });

  describe('rename', () => {
    it('saves the new label on Enter', async () => {
      const user = await renderEditor();

      await user.clear(labelInput('Dev'));
      await user.type(labelInput('Dev'), 'Develop{Enter}');

      await waitFor(async () =>
        expect((await saved()).find((status) => status.id === 'dev')).toEqual({
          ...StatusMother.dev(),
          label: 'Develop',
        }),
      );
      expect(labelInput('Develop')).toBeTruthy();
    });

    it('saves the new label on blur', async () => {
      const user = await renderEditor();

      await user.clear(labelInput('Dev'));
      await user.type(labelInput('Dev'), 'Develop');
      await user.tab();

      await waitFor(async () => expect(labels(await saved())).toContain('Develop'));
    });

    it('reverts the input on Escape without saving', async () => {
      const user = await renderEditor();

      await user.clear(labelInput('Dev'));
      await user.type(labelInput('Dev'), 'Develop{Escape}');
      await user.tab();

      expect((labelInput('Dev') as HTMLInputElement).value).toBe('Dev');
      expect(await saved()).toEqual(StatusMother.defaults());
    });
  });

  it('recolors a status', async () => {
    const user = await renderEditor();

    await user.click(swatch('Color of Dev', 'red'));

    await waitFor(async () =>
      expect((await saved()).find((status) => status.id === 'dev')?.color).toBe('red'),
    );
    expect(swatch('Color of Dev', 'red').getAttribute('aria-checked')).toBe('true');
  });

  describe('reorder', () => {
    it('moves a status up', async () => {
      const user = await renderEditor();

      await user.click(button('Move Dev up'));

      await waitFor(async () =>
        expect((await saved()).map((status) => status.id)).toEqual([
          'todo', 'in-progress', 'dev', 'review', 'test', 'stg', 'prod', 'done',
        ]),
      );
    });

    it('moves a status down', async () => {
      const user = await renderEditor();

      await user.click(button('Move To do down'));

      await waitFor(async () =>
        expect(labels(await saved()).slice(0, 2)).toEqual(['In progress', 'To do']),
      );
    });

    it('disables up on the first status and down on the last', async () => {
      await renderEditor();

      expect((button('Move To do up') as HTMLButtonElement).disabled).toBe(true);
      expect((button('Move Done down') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await statusBackupItem.setValue({ 'CAR-1': 'stg', 'CAR-9': 'review', 'CAR-3': 'done' });
    });

    it('deletes a status no group uses right away and forgets its backups', async () => {
      const user = await renderEditor();

      await user.click(button('Delete Review'));

      await waitFor(async () => expect(labels(await saved())).not.toContain('Review'));
      expect(await statusBackupItem.getValue()).toEqual({ 'CAR-1': 'stg', 'CAR-3': 'done' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('warns with the number of groups that use the status', async () => {
      const user = await renderEditor();

      await user.click(button('Delete STG'));

      const dialog = await screen.findByRole('alertdialog', { name: 'Delete STG?' });
      expect(dialog.textContent).toContain('2 groups use “STG”. They will move to “No status”.');
      expect(await saved()).toEqual(StatusMother.defaults());
    });

    it('uses the singular for one group', async () => {
      const user = await renderEditor();

      await user.click(button('Delete Done'));

      expect((await screen.findByRole('alertdialog')).textContent).toContain('1 group uses “Done”');
    });

    it('deletes after the warning is confirmed', async () => {
      const user = await renderEditor();

      await user.click(button('Delete STG'));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(async () => expect(labels(await saved())).not.toContain('STG'));
      expect(await statusBackupItem.getValue()).toEqual({ 'CAR-9': 'review', 'CAR-3': 'done' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('keeps the status when the warning is cancelled', async () => {
      const user = await renderEditor();

      await user.click(button('Delete STG'));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(await saved()).toEqual(StatusMother.defaults());
    });

    it('still warns when the groups cannot be counted', async () => {
      fake.uninstall();
      const user = await renderEditor();

      await user.click(button('Delete Review'));

      expect((await screen.findByRole('alertdialog')).textContent).toContain('Groups that use “Review”');
    });

    it('disables delete on the only status', async () => {
      await renderEditor([new StatusBuilder().build()]);

      expect((button('Delete QA') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('restore defaults', () => {
    const custom = () => [
      new StatusBuilder().with({ id: 'qa', label: 'QA', order: 0 }).build(),
      { ...StatusMother.dev(), label: 'Develop', order: 1 },
    ];

    it('saves the 8 defaults after the confirm and forgets removed statuses', async () => {
      await statusBackupItem.setValue({ 'CAR-1': 'qa', 'CAR-2': 'dev' });
      const user = await renderEditor(custom());

      await user.click(button('Restore defaults'));
      await user.click(within(screen.getByRole('alertdialog', { name: 'Restore defaults?' })).getByRole('button', { name: 'Restore' }));

      await waitFor(async () => expect(await saved()).toEqual(StatusMother.defaults()));
      expect(await statusBackupItem.getValue()).toEqual({ 'CAR-2': 'dev' });
    });

    it('keeps the list when the confirm is cancelled', async () => {
      const user = await renderEditor(custom());

      await user.click(button('Restore defaults'));
      await user.click(button('Cancel'));

      expect(await saved()).toEqual(custom());
      expect(button('Restore defaults')).toBeTruthy();
    });
  });

  describe('validation', () => {
    it('blocks a rename to a label used by another status, ignoring case', async () => {
      const user = await renderEditor();

      await user.clear(labelInput('Dev'));
      await user.type(labelInput('Dev'), 'stg{Enter}');

      expect((await screen.findByRole('alert')).textContent).toContain('"stg" is used by more than one status');
      expect(labelInput('Dev').getAttribute('aria-invalid')).toBe('true');
      expect(await saved()).toEqual(StatusMother.defaults());
    });

    it('blocks a label with the title separator', async () => {
      const user = await renderEditor();

      await user.type(screen.getByRole('textbox', { name: 'New status label' }), 'QA · Web{Enter}');

      expect((await screen.findByRole('alert')).textContent).toContain("can't contain");
      expect(
        screen.getByRole('textbox', { name: 'New status label' }).getAttribute('aria-invalid'),
      ).toBe('true');
      expect(await saved()).toEqual(StatusMother.defaults());
    });

    it('blocks an empty label', async () => {
      const user = await renderEditor();

      await user.clear(labelInput('Dev'));
      await user.keyboard('{Enter}');

      expect((await screen.findByRole('alert')).textContent).toContain('A status needs a label.');
      expect(await saved()).toEqual(StatusMother.defaults());
    });

    it('clears the error after a valid save', async () => {
      const user = await renderEditor();

      await user.type(screen.getByRole('textbox', { name: 'New status label' }), 'Done{Enter}');
      await screen.findByRole('alert');
      await user.click(swatch('Color of Dev', 'red'));

      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });
});
