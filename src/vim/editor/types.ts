/** Target accepted by line-jump commands. Numbers are 1-based like Vim counts. */
export type VimLineTarget = number | "first" | "last";

/** Single-character search operation that waits for a target character. */
export type VimFindOperation = "find" | "till";

/** Direction for single-character search operations. */
export type VimFindDirection = "forward" | "backward";

/** Target-character motion resolved after f/F/t/T receives its character. */
export type VimFindTarget = {
  type: "find";
  operation: VimFindOperation;
  direction: VimFindDirection;
  char: string;
};

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
  | "endOfWord"
  | "nextBigWord"
  | "previousBigWord"
  | "endOfBigWord";

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

/** Zero-based editor position. `col` is a UTF-16/string column for now. */
export type VimPosition = { line: number; col: number };

export type VimVisualMode = "charwise" | "linewise";

/** Visual selection anchor; the active end is the editor cursor. */
export type VimVisualSelection = {
  mode: VimVisualMode;
  anchor: VimPosition;
};

/** Motion or operator-range noun an operator can act on (`line` backs doubled operators like `dd`). */
export type VimNoun = VimMotion | VimFindTarget | "line";

export type VimOperatorTarget = VimNoun | VimVisualSelection;

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
export interface VimEditorApi extends Pick<VimEditorHost, "getCursor"> {
  move(motion: VimMotion): void;
  insertLineBelow(): void;
  insertLineAbove(): void;
  joinLines(count?: number): void;
  goToLine(line: VimLineTarget): void;
  moveToChar(
    operation: VimFindOperation,
    direction: VimFindDirection,
    char: string,
    count?: number,
  ): void;
  placeCaretAtLineStart(): void;
  placeCaretAfterCursor(): void;
  placeCaretAtLineEnd(): void;
  delete(target: VimOperatorTarget, count?: number): VimRegister | undefined;
  change(target: VimOperatorTarget, count?: number): VimRegister | undefined;
  yank(target: VimOperatorTarget, count?: number): VimRegister | undefined;
  replace(
    target: VimOperatorTarget,
    replacement: VimRegister,
  ): VimRegister | undefined;
  put(register: VimRegister, placement: "before" | "after"): void;
  replaceCharUnderCursor(char: string): void;
  toggleCase(count?: number): void;
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
