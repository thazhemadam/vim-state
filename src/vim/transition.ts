import {
  initialTransition,
  transition as xstateTransition,
  type SnapshotFrom,
} from "xstate";

import { toVimAction, type VimAction } from "./actions.js";
import type { VimEvent } from "./events.js";
import { vimMachine } from "./machine.js";

export type VimSnapshot = SnapshotFrom<typeof vimMachine>;

export interface VimTransitionResult {
  snapshot: VimSnapshot;
  actions: VimAction[];
}

interface XStateActionLike {
  type: string;
  params?: unknown;
}

export function getInitialVimSnapshot(): VimTransitionResult {
  const [snapshot, actions] = initialTransition(vimMachine);

  return {
    snapshot,
    actions: collectVimActions(actions),
  };
}

export function transitionVim(
  snapshot: VimSnapshot,
  event: VimEvent,
): VimTransitionResult {
  const [nextSnapshot, actions] = xstateTransition(vimMachine, snapshot, event);

  return {
    snapshot: nextSnapshot,
    actions: collectVimActions(actions),
  };
}

function collectVimActions(actions: readonly XStateActionLike[]): VimAction[] {
  return actions.flatMap((action) => {
    const vimAction = toVimAction(action.type, action.params);
    return vimAction ? [vimAction] : [];
  });
}
