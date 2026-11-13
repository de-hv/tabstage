import { createContext, type DragEvent, type ReactNode, useContext, useState } from 'react';

import type { Command, Workspace } from '../api/types';
import { type DragItem, type DropTarget, dropCommand } from '../lib/dnd';

interface DragState {
  item: DragItem | null;
  setItem: (item: DragItem | null) => void;
  workspace: Workspace;
  apply: (command: Command) => void;
}

const DragContext = createContext<DragState | null>(null);

interface ProviderProps {
  workspace: Workspace;
  apply: (command: Command) => void;
  children: ReactNode;
}

/** Holds the item being dragged. HTML5 drag events only carry strings. */
export function DragProvider({ workspace, apply, children }: ProviderProps) {
  const [item, setItem] = useState<DragItem | null>(null);
  return <DragContext.Provider value={{ item, setItem, workspace, apply }}>{children}</DragContext.Provider>;
}

function useDragState(): DragState {
  const state = useContext(DragContext);
  if (!state) throw new Error('drag and drop needs a DragProvider');
  return state;
}

/** Whether something is being dragged, to show drop zones. */
export function useIsDragging(): boolean {
  return useDragState().item !== null;
}

/** Props that make an element draggable as `item`. */
export function useDrag(item: DragItem) {
  const { setItem } = useDragState();
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.stopPropagation();
      event.dataTransfer?.setData('text/plain', 'tabstage');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      setItem(item);
    },
    onDragEnd: () => setItem(null),
  };
}

/** Where the pointer is over a drop target, from its top edge. */
export interface DropPoint {
  offset: number;
  height: number;
}

/** A drop target with the edge where a line shows where the item lands. */
export interface DropHit {
  target: DropTarget;
  edge?: 'top' | 'bottom';
}

/**
 * A drop target, or a function that picks one for what is being dragged
 * and where the pointer is.
 */
export type DropSpec = DropTarget | ((item: DragItem, at: DropPoint) => DropTarget | DropHit | null) | null;

/** Where an item lands next to a row: no line, since the row itself lights up. */
function asHit(found: DropTarget | DropHit | null): DropHit | null {
  if (!found) return null;
  return 'target' in found ? found : { target: found };
}

/**
 * Props that make an element a drop target. It only accepts drops that
 * would change something, so the cursor shows when a drop does nothing.
 * While something is over it, `data-drop` is set, and `data-drop-edge` when
 * the item lands before or after it rather than in it.
 */
export function useDrop(spec: DropSpec) {
  const { item, setItem, workspace, apply } = useDragState();
  const [over, setOver] = useState<DropHit | null>(null);

  if (!spec) return {};
  const resolve = (event: DragEvent): { hit: DropHit; command: Command } | null => {
    if (!item) return null;
    let hit: DropHit | null;
    if (typeof spec === 'function') {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      hit = asHit(spec(item, { offset: event.clientY - rect.top, height: rect.height }));
    } else {
      hit = { target: spec };
    }
    const command = hit ? dropCommand(item, hit.target, workspace) : null;
    return hit && command ? { hit, command } : null;
  };
  return {
    'data-drop': over ? true : undefined,
    'data-drop-edge': over?.edge,
    onDragOver: (event: DragEvent) => {
      const found = resolve(event);
      if (!found) {
        if (over) setOver(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      if (over?.edge !== found.hit.edge || over?.target.kind !== found.hit.target.kind) setOver(found.hit);
    },
    onDragLeave: () => setOver(null),
    onDrop: (event: DragEvent) => {
      setOver(null);
      const found = resolve(event);
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      setItem(null);
      apply(found.command);
    },
  };
}

/** Thin zone after a list while dragging, for "move to the end". */
export function DropEnd({ target }: { target: DropTarget }) {
  const isDragging = useIsDragging();
  const drop = useDrop(target);
  if (!isDragging) return null;
  return (
    <div className="drop-end" {...drop}>
      Drop at the end
    </div>
  );
}
