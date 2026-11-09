import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Command, Status } from '../api/types';
import { ACCENTS, nextAccent } from '../lib/colors';
import { InlineInput } from './InlineInput';

interface Props {
  statuses: Status[];
  apply: (command: Command) => void;
}

/** Rename, recolor, reorder, add and remove statuses. */
export function StatusEditor({ statuses, apply }: Props) {
  const [removing, setRemoving] = useState<Status | null>(null);

  return (
    <>
      <ul className="status-list">
        {statuses.map((status, index) => (
          <li key={status.id} className="status-list__row">
            <ColorMenu status={status} onChange={(color) => apply({ type: 'setStatusColor', status: status.id, color })} />
            <LabelInput
              status={status}
              onRename={(label) => apply({ type: 'renameStatus', status: status.id, label })}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Subir ${status.label}`}
              disabled={index === 0}
              onClick={() => apply({ type: 'moveStatus', status: status.id, index: index - 1 })}
            >
              <ArrowUp className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Bajar ${status.label}`}
              disabled={index === statuses.length - 1}
              onClick={() => apply({ type: 'moveStatus', status: status.id, index: index + 1 })}
            >
              <ArrowDown className="icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Eliminar ${status.label}`}
              onClick={() => setRemoving(status)}
            >
              <Trash2 className="icon" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="status-list__add">
        <InlineInput
          label="Nuevo estado"
          placeholder="Nuevo estado, por ejemplo Bloqueado"
          onCancel={() => undefined}
          onSubmit={async (label) => {
            apply({ type: 'addStatus', label, color: nextAccent(statuses.map((s) => s.color)) });
            return true;
          }}
        />
      </div>
      <RemoveStatusDialog
        status={removing}
        others={statuses.filter((status) => status.id !== removing?.id)}
        onClose={() => setRemoving(null)}
        onRemove={(replacement) => {
          if (removing) apply({ type: 'removeStatus', status: removing.id, replacement });
          setRemoving(null);
        }}
      />
    </>
  );
}

function ColorMenu({ status, onChange }: { status: Status; onChange: (color: Status['color']) => void }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="icon-button" aria-label={`Color de ${status.label}`}>
          <span className="square square--large" data-color={status.color} aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="start" sideOffset={4}>
          <Menu.RadioGroup value={status.color} onValueChange={(value) => onChange(value as Status['color'])}>
            {ACCENTS.map(({ color, name }) => (
              <Menu.RadioItem key={color} className="menu__item" value={color}>
                <span className="square" data-color={color} aria-hidden="true" />
                {name}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Name field that saves on Enter or when it loses focus. */
function LabelInput({ status, onRename }: { status: Status; onRename: (label: string) => void }) {
  const [value, setValue] = useState(status.label);
  useEffect(() => setValue(status.label), [status.label]);

  const commit = () => {
    const label = value.trim();
    if (!label) setValue(status.label);
    else if (label !== status.label) onRename(label);
  };

  return (
    <input
      className="input status-list__name"
      aria-label={`Nombre de ${status.label}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setValue(status.label);
      }}
    />
  );
}

interface RemoveProps {
  status: Status | null;
  others: Status[];
  onClose: () => void;
  onRemove: (replacement: string | null) => void;
}

function RemoveStatusDialog({ status, others, onClose, onRemove }: RemoveProps) {
  const [replacement, setReplacement] = useState('');

  return (
    <AlertDialog.Root
      open={status !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReplacement('');
          onClose();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog__overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title className="dialog__title">¿Eliminar el estado «{status?.label}»?</AlertDialog.Title>
          <AlertDialog.Description className="dialog__text">
            Elige a qué estado pasan sus tabs y carpetas.
          </AlertDialog.Description>
          <fieldset className="dialog__choices">
            <legend className="visually-hidden">Mover sus tabs a</legend>
            {[{ id: '', label: 'Sin estado' }, ...others].map((option) => (
              <label key={option.id} className="choice">
                <input
                  type="radio"
                  name="replacement"
                  value={option.id}
                  checked={replacement === option.id}
                  onChange={() => setReplacement(option.id)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="dialog__actions">
            <AlertDialog.Cancel className="button">Cancelar</AlertDialog.Cancel>
            <AlertDialog.Action
              className="button button--danger"
              onClick={() => {
                onRemove(replacement || null);
                setReplacement('');
              }}
            >
              Eliminar
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
