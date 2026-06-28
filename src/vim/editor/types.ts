/** Supported cursor motions understood by the current Vim editor core. */
export type VimMotion =
  | "left"
  | "down"
  | "up"
  | "right"
  | "lineStart"
  | "lineEnd"
  | "firstNonBlank"
  | "nextWord"
  | "previousWord"
  | "endOfWord";

/** Pending operator plus the count captured before the operator key. */
export type VimOperator = {
  name: "delete" | "change" | "yank";
  count?: number;
};

/** Unnamed-register payload captured by delete/change operations. */
export type VimRegister = {
  text: string;
  type: "charwise" | "linewise";
};

/** Motion or operator-range noun an operator can act on (`line` backs doubled operators like `dd`). */
export type VimNoun = VimMotion | "line";

/** Zero-based editor position. `col` is a UTF-16/string column for now. */
export type VimPosition = { line: number; col: number };

/**
 * Minimal internal operator range model.
 *
 * Charwise ranges are cursor-position spans. Linewise ranges are whole row spans
 * because Vim linewise operations ignore cursor column and carry different
 * register/cursor semantics.
 */
export type VimRange =
  | { type: "charwise"; start: VimPosition; end: VimPosition }
  | { type: "linewise"; startLine: number; endLine: number };

/** Resolved real motion data: where motion lands and what range that motion covers for operators. */
export type VimMotionResult = {
  range: VimRange;
  destination: VimPosition;
};

/** Semantic editor operations the Vim state machine can request. */
export interface VimEditorApi {
  move(motion: VimMotion): void;
  insertLineBelow(): void;
  insertLineAbove(): void;
  placeCaretAtLineStart(): void;
  placeCaretAfterCursor(): void;
  placeCaretAtLineEnd(): void;
  delete(noun: VimNoun, count?: number): VimRegister | undefined;
  change(noun: VimNoun, count?: number): VimRegister | undefined;
  yank(noun: VimNoun, count?: number): VimRegister | undefined;
  put(register: VimRegister, placement: "before" | "after"): void;
  replaceCharUnderCursor(char: string): void;
  clampCursorColumn(): void;
}

/** Constructor accepted by the TypeScript mixin class-expression pattern. */
export type Constructor<T = {}> = new (...args: any[]) => T;

/** Primitive host-editor surface required by the reusable Vim composition mixin. */
export interface VimEditorHost {
  getCursor(): VimPosition;
  getLines(): string[];
  /** Forward raw input/control bytes to the underlying host editor. */
  sendInputToEditor(data: string): void;
}
