import type { VimAction } from "../../vim/actions.js";

export interface PiCursorActionTarget {
  getCursor(): { line: number; col: number };
  moveCaretLeft(): void;
  moveCaretDown(): void;
  moveCaretUp(): void;
  moveCaretRight(): void;
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
    case "moveCursorLeft":
      editor.moveCaretLeft();
      return;
    case "moveCursorDown":
      editor.moveCaretDown();
      return;
    case "moveCursorUp":
      editor.moveCaretUp();
      return;
    case "moveCursorRight":
      editor.moveCaretRight();
      return;
  }
}
