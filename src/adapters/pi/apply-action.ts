import type { VimAction } from "../../vim/actions.js";

export interface PiCursorActionTarget {
  getCursor(): { line: number; col: number };
  moveCaretLeft(): void;
}

export function applyVimActionToPiEditor(
  action: VimAction,
  editor: PiCursorActionTarget,
): void {
  switch (action.type) {
    case "placeCursorOnPreviousCharacter":
      if (editor.getCursor().col > 0) editor.moveCaretLeft();
      return;
    case "placeCaretBeforeCursor":
      return;
  }
}
