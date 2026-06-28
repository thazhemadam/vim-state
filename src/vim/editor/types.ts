export interface VimEditorApi {
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
  placeCaretAfterCursor(): void;
  placeCaretAtLineEnd(): void;
  deleteCharUnderCursor(): void;
  deleteCharBeforeCursor(): void;
  replaceCharUnderCursor(char: string): void;
  clampCursorColumn(): void;
}

export type Constructor<T = {}> = new (...args: any[]) => T;

export interface VimEditorHost {
  getCursor(): { line: number; col: number };
  getLines(): string[];
  sendInputToEditor(data: string): void;
}
