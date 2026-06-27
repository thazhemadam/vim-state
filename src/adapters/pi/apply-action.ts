import type { VimAction } from "../../vim/actions.js";

export interface PiCursorActionTarget {
  getCursor(): { line: number; col: number };
  moveCaretLeft(): void;
  moveCaretDown(): void;
  moveCaretUp(): void;
  moveCaretRight(): void;
  moveCaretToLineStart(): void;
  moveCaretToLineEnd(): void;
  moveCaretToFirstNonBlank(): void;
  insertLineBelow(): void;
  insertLineAbove(): void;
  placeCaretAtLineStart(): void;
  placeCaretAfterCursor(): void;
  placeCaretAtLineEnd(): void;
  placeCaretAtFirstNonBlank(): void;
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
    case "placeCaretAfterCursor":
      editor.placeCaretAfterCursor();
      return;
    case "placeCaretAtLineEnd":
      editor.placeCaretAtLineEnd();
      return;
    case "placeCaretAtFirstNonBlank":
      editor.placeCaretAtFirstNonBlank();
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
    case "moveCursorToLineStart":
      editor.moveCaretToLineStart();
      return;
    case "moveCursorToLineEnd":
      editor.moveCaretToLineEnd();
      return;
    case "moveCursorToFirstNonBlank":
      editor.moveCaretToFirstNonBlank();
      return;
    case "insertLineBelow":
      editor.insertLineBelow();
      return;
    case "insertLineAbove":
      editor.insertLineAbove();
      return;
    case "placeCaretAtLineStart":
      editor.placeCaretAtLineStart();
      return;
  }
}
