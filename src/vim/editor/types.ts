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

export type VimEditorOptions = {
  /**
   * Called whenever an operation writes Vim's unnamed register.
   * Hosts can use this to mirror the register to a system clipboard, remote
   * clipboard, or any other external paste target. Leave unset to keep register
   * writes inside Vim only.
   */
  onUnnamedRegisterWrite?: (register: VimRegister) => void;
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

export type VimCaseTransform = "toggle" | "lower" | "upper";

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
  move(target: VimMotion | VimPosition): void;
  insertLineBelow(): void;
  insertLineAbove(): void;
  joinLines(count?: number): void;
  join(target: VimOperatorTarget): void;
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
    emitRegisterWrite?: boolean,
  ): VimRegister | undefined;
  transformCase(target: VimOperatorTarget, transform: VimCaseTransform): void;
  put(register: VimRegister, placement: "before" | "after"): void;
  replaceCharUnderCursor(char: string): void;
  toggleCase(count?: number): void;
  undo(): void;
  clampCursorColumn(): void;
}

/** Constructor accepted by the TypeScript mixin class-expression pattern. */
export type Constructor<T = {}> = new (...args: any[]) => T;

/** Primitive host-editor surface required by the reusable Vim composition mixin. */
export interface VimEditorHost {
  getCursor(): VimPosition;
  getLines(): string[];
  /** Restore the most recent host undo point, when supported. */
  undoEditor?(): void;
  /** Forward raw input/control bytes to the underlying host editor. */
  sendInputToEditor(data: string): void;
}
