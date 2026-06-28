export type VimDeleteTarget =
  | "charUnderCursor"
  | "charBeforeCursor"
  | "nextWord"
  | "lineEnd"
  | "line";

/** Zero-based editor position. `col` is a UTF-16/string column for now. */
export type VimPosition = { line: number; col: number };

/** Minimal internal range model used to apply delete operations. */
export type VimRange =
  | { type: "charwise"; start: VimPosition; end: VimPosition }
  | { type: "linewise"; startLine: number; endLine: number };

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
  delete(target: VimDeleteTarget): void;
  replaceCharUnderCursor(char: string): void;
  clampCursorColumn(): void;
}

export type Constructor<T = {}> = new (...args: any[]) => T;

export interface VimEditorHost {
  getCursor(): VimPosition;
  getLines(): string[];
  sendInputToEditor(data: string): void;
}
