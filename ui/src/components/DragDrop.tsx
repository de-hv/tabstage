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

/** A drop target, or a function that picks one for what is being dragged. */
export type DropSpec = DropTarget | ((item: DragItem) => DropTarget | null) | null;

/**
 * Props that make an element a drop target. It only accepts drops that
 * would change something, so the cursor shows when a drop does nothing.
 */
export function useDrop(spec: DropSpec) {
  const { item, setItem, workspace, apply } = useDragState();
  const [over, setOver] = useState(false);
  const target = item && typeof spec === 'function' ? spec(item) : typeof spec === 'function' ? null : spec;
  const command = item && target ? dropCommand(item, target, workspace) : null;

  if (!spec) return {};
  return {
    'data-drop': (over && command !== null) || undefined,
    onDragOver: (event: DragEvent) => {
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => {
      setOver(false);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      setItem(null);
      apply(command);
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
