export interface VimEditor {
  placeCaretAfterCursor(): void;
  placeCaretAtLineEnd(): void;
  moveCursorLeft(): void;
  moveCursorDown(): void;
  moveCursorUp(): void;
  moveCursorRight(): void;
  moveCursorToLineStart(): void;
  moveCursorToLineEnd(): void;
  moveCursorToFirstNonBlank(): void;
  moveCursorToNextWord(): void;
  moveCursorToPreviousWord(): void;
  moveCursorToEndOfWord(): void;
  insertLineBelow(): void;
  insertLineAbove(): void;
  placeCaretAtLineStart(): void;
  deleteCharUnderCursor(): void;
  deleteCharBeforeCursor(): void;
  replaceCharUnderCursor(char: string): void;
  clampCursorColumn(): void;
}
