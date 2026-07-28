import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  DELETE_BACKWARD,
  DELETE_FORWARD,
  LINE_END,
  LINE_START,
  NEWLINE,
} from "./constants.js";
import {
  countedWordPosition,
  deleteDistance,
  normalizedCharRange,
  registerForRange,
  samePosition,
} from "./operators.js";
import type {
  Constructor,
  VimCaseTransform,
  VimEditorApi,
  VimEditorConfiguration,
  VimEditorHost,
  VimEditorOptions,
  VimFindDirection,
  VimFindOperation,
  VimLineTarget,
  VimMotion,
  VimMotionResult,
  VimOperatorTarget,
  VimPosition,
  VimTextObject,
  VimRange,
  VimRegister,
  VimVisualSelection,
} from "./types.js";
import { firstNonBlankColumn, normalMaxColumn, toggleCase } from "./utils.js";

export type {
  VimCaseTransform,
  VimEditorApi,
  VimEditorConfiguration,
  VimEditorHost,
  VimEditorOptions,
  VimFindDirection,
  VimFindOperation,
  VimLineTarget,
  VimMotion,
  VimNoun,
  VimOperator,
  VimOperatorTarget,
  VimPosition,
  VimRegister,
  VimTextObject,
  VimVisualMode,
  VimVisualSelection,
} from "./types.js";

export { nounForKey } from "./utils.js";

/** Editing and configuration operations exposed by a composed Vim editor. */
export interface VimEditor extends VimEditorApi, VimEditorConfiguration {}

/** Reusable Vim operations composed around a host editor. */
class VimEditorCore implements VimEditor {
  private options: VimEditorOptions = {};

  constructor(private readonly host: VimEditorHost) {}

  setOptions(options: VimEditorOptions): void {
    this.options = options;
  }

  getCursor(): VimPosition {
    return this.cursor;
  }

  /** Apply a Vim motion, or move directly to an absolute cursor position. */
  move(target: VimMotion | VimPosition): void {
    if (isVimPosition(target)) {
      this.moveCursorToPosition(target);
      return;
    }

    const result = this.resolveMotion(target);
    if (!result) {
      return;
    }

    this.moveCursorToPosition(result.destination);
  }

  /** Insert an empty line below the current line and leave the caret on it. */
  insertLineBelow(): void {
    this.host.sendInputToEditor(LINE_END);
    this.host.sendInputToEditor(NEWLINE);
  }

  /** Insert an empty line above the current line and leave the caret on it. */
  insertLineAbove(): void {
    this.host.sendInputToEditor(LINE_START);
    this.host.sendInputToEditor(NEWLINE);
    this.host.sendInputToEditor(ARROW_UP);
  }

  /** Join the current line with following lines, inserting one separator space where needed. */
  joinLines(count = 2): void {
    for (let i = 1; i < Math.max(count, 2); ++i) {
      this.joinNextLine();
    }
  }

  /** Join the lines covered by a target range, like Visual `J`. */
  join(target: VimOperatorTarget): void {
    const range = this.resolveOperatorRange(target);
    if (!range) {
      return;
    }

    const startLine =
      range.type === "linewise" ? range.startLine : range.start.line;
    const endLine = range.type === "linewise" ? range.endLine : range.end.line;
    this.moveCursorToPosition({ line: startLine, col: 0 });
    this.joinLines(endLine - startLine + 1);
  }

  /** Move to a target line, using 1-based line numbers for counted Vim commands. */
  goToLine(line: VimLineTarget): void {
    const targetLine =
      line === "first" ? 0 : line === "last" ? this.lines.length - 1 : line - 1;
    const clampedLine = Math.min(
      Math.max(targetLine, 0),
      Math.max(this.lines.length - 1, 0),
    );
    this.moveCursorToPosition({
      line: clampedLine,
      col: firstNonBlankColumn(this.lines[clampedLine] ?? ""),
    });
  }

  /** Move to or before a target character on the current line. */
  moveToChar(
    operation: VimFindOperation,
    direction: VimFindDirection,
    char: string,
    count = 1,
  ): void {
    const result = this.resolveFindMotion(operation, direction, char, count);
    if (!result) {
      return;
    }
    this.moveCursorToPosition(result.destination);
  }

  /** Place the Insert caret at the start of the current line. */
  placeCaretAtLineStart(): void {
    this.host.sendInputToEditor(LINE_START);
  }

  /** Place the Insert caret after the current Normal-mode character. */
  placeCaretAfterCursor(): void {
    if (this.cursor.col < this.currentLine.length) {
      this.host.sendInputToEditor(ARROW_RIGHT);
    }
  }

  /** Place the Insert caret at the end of the current line. */
  placeCaretAtLineEnd(): void {
    this.host.sendInputToEditor(LINE_END);
  }

  /**
   * Apply a supported operator noun as a delete and return the deleted text.
   *
   * Operator nouns include real motions (`dw`) plus linewise nouns from doubled
   * operators (`dd`), so range resolution is separate from cursor movement.
   */
  delete(target: VimOperatorTarget, count = 1): VimRegister | undefined {
    return this.applyOperator(target, count, (range) =>
      this.applyDeleteRange(range),
    );
  }

  /** Apply a supported operator noun as a change and return the changed text. */
  change(target: VimOperatorTarget, count = 1): VimRegister | undefined {
    return this.applyOperator(target, count, (range) =>
      this.applyChangeRange(range),
    );
  }

  /** Store a supported operator noun in the unnamed register. */
  yank(target: VimOperatorTarget, count = 1): VimRegister | undefined {
    return this.applyOperator(target, count, (range) =>
      this.registerForRange(range),
    );
  }

  /** Replace a resolved target with register text and return the replaced text. */
  replace(
    target: VimOperatorTarget,
    replacement: VimRegister,
    emitRegisterWrite = true,
  ): VimRegister | undefined {
    return this.applyOperator(
      target,
      1,
      (range) => {
        const replaced = this.applyDeleteRange(range);
        this.insertText(replacement.text);
        if (replacement.type === "charwise") {
          this.move("left");
        } else {
          this.clampCursorColumn();
        }
        return replaced;
      },
      emitRegisterWrite,
    );
  }

  /** Normal `~`: toggle characters under the cursor, then advance like Vim. */
  toggleCase(count = 1): void {
    for (let i = 0; i < Math.max(count, 1); ++i) {
      const char = this.currentLine[this.cursor.col];
      if (!char) {
        return;
      }

      this.deleteForward(1);
      this.host.sendInputToEditor(toggleCase(char));
    }
    this.clampCursorColumn();
  }

  /** Visual `~`/`u`/`U`: transform a range, then return to the selection start. */
  transformCase(target: VimOperatorTarget, transform: VimCaseTransform): void {
    const range = this.resolveOperatorRange(target);
    if (!range) {
      return;
    }

    const charRange =
      range.type === "charwise"
        ? range
        : {
            type: "charwise" as const,
            start: { line: range.startLine, col: 0 },
            end: {
              line: range.endLine,
              col: this.lines[range.endLine]?.length ?? 0,
            },
          };
    const text = this.registerForRange(charRange).text;
    this.applyDeleteRange(charRange);
    this.insertText(transformCaseText(text, transform));
    this.moveCursorToPosition(charRange.start);
  }

  /** Put unnamed-register text before/after the cursor, or above/below the current line. */
  put(register: VimRegister, placement: "before" | "after"): void {
    if (register.type === "linewise") {
      if (placement === "before") {
        this.placeCaretAtLineStart();
        this.insertText(register.text);
      } else {
        this.placeCaretAtLineEnd();
        this.insertText(NEWLINE + register.text.replace(/\n$/, ""));
      }
      this.clampCursorColumn();
      return;
    }

    if (placement === "after") {
      this.placeCaretAfterCursor();
    }
    this.insertText(register.text);
    this.move("left");
  }

  /** Replace the Normal-mode character under the cursor and keep the cursor on the replacement. */
  replaceCharUnderCursor(char: string): void {
    if (this.cursor.col >= this.currentLine.length) {
      return;
    }

    this.replace("right", { text: char, type: "charwise" }, false);
  }

  /** Restore the latest host-provided undo point. */
  undo(): void {
    this.host.undoEditor?.();
    this.clampCursorColumn();
  }

  /** Restore the latest host-provided redo point. */
  redo(): void {
    this.host.redoEditor?.();
    this.clampCursorColumn();
  }

  /** Move left until the Normal-mode cursor sits on a character, or column 0 for an empty line. */
  clampCursorColumn(): void {
    while (this.cursor.col > normalMaxColumn(this.currentLine)) {
      this.host.sendInputToEditor(ARROW_LEFT);
    }
  }

  private get cursor() {
    return this.host.getCursor();
  }

  private get lines() {
    return this.host.getLines();
  }

  private get currentLine() {
    return this.lines[this.cursor.line] ?? "";
  }

  /**
   * Resolve a real cursor motion into both meanings Vim assigns to motions:
   * where plain movement lands, and what range an operator using that motion covers.
   */
  private resolveMotion(
    noun: VimMotion,
    count = 1,
  ): VimMotionResult | undefined {
    const start = this.cursor;
    const steps = Math.max(count, 1);

    switch (noun) {
      case "left": {
        if (start.col === 0) {
          return undefined;
        }
        const destination = {
          line: start.line,
          col: Math.max(start.col - steps, 0),
        };
        return {
          range: { type: "charwise", start: destination, end: start },
          destination,
        };
      }

      case "right": {
        const line = this.lines[start.line] ?? "";
        if (line.length === 0) {
          return undefined;
        }
        const end = {
          line: start.line,
          col: Math.min(start.col + steps, line.length),
        };
        return {
          range: { type: "charwise", start, end },
          destination: {
            line: start.line,
            col: Math.min(end.col, normalMaxColumn(line)),
          },
        };
      }

      case "down": {
        const line = Math.min(start.line + steps, this.lines.length - 1);
        if (line === start.line) {
          return undefined;
        }
        return {
          range: { type: "linewise", startLine: start.line, endLine: line },
          destination: this.clampedPosition({ line, col: start.col }),
        };
      }

      case "up": {
        const line = Math.max(start.line - steps, 0);
        if (line === start.line) {
          return undefined;
        }
        return {
          range: { type: "linewise", startLine: line, endLine: start.line },
          destination: this.clampedPosition({ line, col: start.col }),
        };
      }

      case "lineStart": {
        const destination = { line: start.line, col: 0 };
        return {
          range: normalizedCharRange(start, destination),
          destination,
        };
      }

      case "lineEnd": {
        const line = Math.min(start.line + steps - 1, this.lines.length - 1);
        const text = this.lines[line] ?? "";
        return {
          range: {
            type: "charwise",
            start,
            end: { line, col: text.length },
          },
          destination: { line, col: normalMaxColumn(text) },
        };
      }

      case "firstNonBlank": {
        const line = this.lines[start.line] ?? "";
        const destination = {
          line: start.line,
          col: firstNonBlankColumn(line),
        };
        return {
          range: normalizedCharRange(start, destination),
          destination,
        };
      }

      case "nextWord":
      case "nextBigWord": {
        const destination = countedWordPosition(this.lines, start, noun, steps);
        return {
          range: { type: "charwise", start, end: destination },
          destination,
        };
      }

      case "previousWord":
      case "previousBigWord": {
        const destination = countedWordPosition(this.lines, start, noun, steps);
        return {
          range: normalizedCharRange(start, destination),
          destination,
        };
      }

      case "endOfWord":
      case "endOfBigWord": {
        const destination = countedWordPosition(this.lines, start, noun, steps);
        // At the end of the final word, `e`/`E` has no motion. Operators like
        // `de` should therefore leave the buffer untouched.
        if (samePosition(start, destination)) {
          return undefined;
        }

        return {
          range: {
            type: "charwise",
            start,
            end: { line: destination.line, col: destination.col + 1 },
          },
          destination,
        };
      }
    }
  }

  /** Resolve an f/F/t/T motion on the current line. */
  private resolveFindMotion(
    operation: VimFindOperation,
    direction: VimFindDirection,
    char: string,
    count = 1,
  ): VimMotionResult | undefined {
    const start = this.cursor;
    const destination = findCharPosition(
      this.currentLine,
      start.col,
      operation,
      direction,
      char,
      count,
    );
    if (!destination) {
      return undefined;
    }

    const end =
      direction === "forward"
        ? Math.min(destination + 1, this.currentLine.length)
        : destination;
    return {
      range: normalizedCharRange(start, { line: start.line, col: end }),
      destination: { line: start.line, col: destination },
    };
  }

  /**
   * Resolve an operator noun into the buffer range it covers.
   *
   * Motions reuse their motion range. `line` is not a cursor motion; it names the
   * current-line range for doubled operators such as `dd` and `cc`.
   */
  private resolveOperatorRange(
    target: VimOperatorTarget,
    count = 1,
  ): VimRange | undefined {
    if (isVisualSelection(target)) {
      return this.resolveVisualRange(target);
    }

    const noun = target;
    if (noun === "line") {
      const start = this.cursor;
      return {
        type: "linewise",
        startLine: start.line,
        endLine: Math.min(
          start.line + Math.max(count, 1) - 1,
          this.lines.length - 1,
        ),
      };
    }

    if (typeof noun === "object") {
      return noun.type === "textObject"
        ? this.resolveTextObjectRange(noun)
        : this.resolveFindMotion(
            noun.operation,
            noun.direction,
            noun.char,
            count,
          )?.range;
    }

    return this.resolveMotion(noun, count)?.range;
  }

  private resolveTextObjectRange(object: VimTextObject): VimRange | undefined {
    if (object.object !== "word") {
      return undefined;
    }

    const line = this.currentLine;
    let start = this.cursor.col;
    while (start < line.length && /\s/.test(line[start]!)) {
      start += 1;
    }
    if (start >= line.length) {
      return undefined;
    }

    const word = /[A-Za-z0-9_]/.test(line[start]!)
      ? /[A-Za-z0-9_]/
      : /[^\sA-Za-z0-9_]/;
    while (start > 0 && word.test(line[start - 1]!)) {
      start -= 1;
    }

    let end = start;
    while (end < line.length && word.test(line[end]!)) {
      end += 1;
    }

    if (object.kind === "around") {
      const after = end;
      while (end < line.length && /\s/.test(line[end]!)) {
        end += 1;
      }
      if (end === after) {
        while (start > 0 && /\s/.test(line[start - 1]!)) {
          start -= 1;
        }
      }
    }

    return {
      type: "charwise",
      start: { line: this.cursor.line, col: start },
      end: { line: this.cursor.line, col: end },
    };
  }

  private resolveVisualRange(selection: VimVisualSelection): VimRange {
    const active = this.cursor;
    if (selection.mode === "linewise") {
      return {
        type: "linewise",
        startLine: Math.min(selection.anchor.line, active.line),
        endLine: Math.max(selection.anchor.line, active.line),
      };
    }

    const anchorEnd = {
      line: selection.anchor.line,
      col: Math.min(
        selection.anchor.col + 1,
        this.lines[selection.anchor.line]?.length ?? 0,
      ),
    };
    const activeEnd = {
      line: active.line,
      col: Math.min(active.col + 1, this.lines[active.line]?.length ?? 0),
    };

    if (
      selection.anchor.line < active.line ||
      (selection.anchor.line === active.line &&
        selection.anchor.col <= active.col)
    ) {
      return { type: "charwise", start: selection.anchor, end: activeEnd };
    }
    return { type: "charwise", start: active, end: anchorEnd };
  }

  /** Resolve a counted operator noun once, then apply the resulting range once. */
  private applyOperator(
    target: VimOperatorTarget,
    count: number,
    applyRange: (range: VimRange) => VimRegister,
    emitRegisterWrite = true,
  ): VimRegister | undefined {
    const range = this.resolveOperatorRange(target, count);
    if (!range) {
      return undefined;
    }

    const register = applyRange(range);
    if (target !== "left") {
      this.clampCursorColumn();
    }

    if (emitRegisterWrite) {
      this.emitUnnamedRegisterWrite(register);
    }

    return register;
  }

  /** Apply a resolved operator range as a delete and return the removed register text. */
  private applyDeleteRange(range: VimRange): VimRegister {
    const register = this.registerForRange(range);
    switch (range.type) {
      case "charwise":
        this.moveCursorToPosition(range.start);
        this.deleteForward(deleteDistance(this.lines, range.start, range.end));
        return register;
      case "linewise":
        return this.applyLineDelete(range, register);
    }
  }

  /** Apply a resolved operator range as a change and return the removed register text. */
  private applyChangeRange(range: VimRange): VimRegister {
    const register = this.registerForRange(range);
    switch (range.type) {
      case "charwise":
        this.moveCursorToPosition(range.start);
        this.deleteForward(deleteDistance(this.lines, range.start, range.end));
        return register;
      case "linewise":
        return this.applyLineChange(range, register);
    }
  }

  /**
   * Delete whole rows for a linewise range.
   *
   * The host editor only exposes character deletion, so deleting the original EOF
   * row needs one backward delete to remove the leftover empty line. After rows are
   * removed, Vim keeps the old column where possible and clamps on shorter lines.
   */
  private applyLineDelete(
    range: Extract<VimRange, { type: "linewise" }>,
    register: VimRegister,
  ): VimRegister {
    const currentCol = this.cursor.col;

    const lastLine = this.lines.length - 1;
    const deletesLastLine = range.endLine >= lastLine;
    const lineCount = range.endLine - range.startLine + 1;

    // Start at column 0 because linewise delete removes rows, not a span from the
    // current cursor column.
    this.moveCursorToPosition({ line: range.startLine, col: 0 });
    for (let i = 0; i < lineCount; ++i) {
      this.deleteForward(this.currentLine.length);
      if (this.cursor.line < this.lines.length - 1) {
        this.host.sendInputToEditor(DELETE_FORWARD);
      }
    }

    if (deletesLastLine && range.startLine > 0) {
      // Deleting the final row leaves an empty last line; backspace removes that
      // row by joining it into the previous surviving line.
      this.host.sendInputToEditor(DELETE_BACKWARD);
    }

    // Land on the next surviving row, unless the deleted range reached EOF; then
    // land on the previous row. Keep the original column where possible.
    const targetLine = deletesLastLine ? range.startLine - 1 : range.startLine;
    const line = Math.max(targetLine, 0);
    this.moveCursorToPosition(this.clampedPosition({ line, col: currentCol }));
    return register;
  }

  /** Clear a linewise range to one empty row, which becomes the Insert target. */
  private applyLineChange(
    range: Extract<VimRange, { type: "linewise" }>,
    register: VimRegister,
  ): VimRegister {
    this.moveCursorToPosition({ line: range.startLine, col: 0 });
    this.deleteForward(this.currentLine.length);

    for (let line = range.startLine; line < range.endLine; ++line) {
      if (this.cursor.line < this.lines.length - 1) {
        this.host.sendInputToEditor(DELETE_FORWARD);
      }
      this.deleteForward(this.currentLine.length);
    }

    return register;
  }

  /** Join the next line into the current line. */
  private joinNextLine(): void {
    if (this.cursor.line >= this.lines.length - 1) {
      return;
    }

    const line = this.currentLine;
    const nextLine = this.lines[this.cursor.line + 1] ?? "";
    const indent = /^\s*/.exec(nextLine)?.[0].length ?? 0;
    const needsSpace =
      line.length > 0 && nextLine.trimStart().length > 0 && !/\s$/.test(line);

    this.moveCursorToPosition({ line: this.cursor.line, col: line.length });
    this.host.sendInputToEditor(DELETE_FORWARD);
    this.deleteForward(indent);
    if (needsSpace) {
      this.host.sendInputToEditor(" ");
      this.host.sendInputToEditor(ARROW_LEFT);
    }
  }

  /** Move to a zero-based position using host editor cursor primitives. */
  private moveCursorToPosition(position: VimPosition): void {
    while (this.cursor.line < position.line) {
      this.host.sendInputToEditor(ARROW_DOWN);
    }
    while (this.cursor.line > position.line) {
      this.host.sendInputToEditor(ARROW_UP);
    }
    this.moveCaretToColumn(position.col);
  }

  /** Move to a zero-based column using host editor cursor primitives. */
  private moveCaretToColumn(column: number): void {
    this.host.sendInputToEditor(LINE_START);
    for (let i = 0; i < column; i += 1) {
      this.host.sendInputToEditor(ARROW_RIGHT);
    }
  }

  /** Clamp a requested destination to a valid Normal-mode cursor column. */
  private clampedPosition(position: VimPosition): VimPosition {
    return {
      line: position.line,
      col: Math.min(
        position.col,
        normalMaxColumn(this.lines[position.line] ?? ""),
      ),
    };
  }

  /** Delete `count` characters using the host editor's forward-delete primitive. */
  private deleteForward(count: number): void {
    for (let i = 0; i < count; ++i) {
      this.host.sendInputToEditor(DELETE_FORWARD);
    }
  }

  /** Send plain inserted text one character at a time; host editors parse keys, not strings. */
  private insertText(text: string): void {
    for (const char of text) {
      this.host.sendInputToEditor(char);
    }
  }

  /** Build the register metadata for a range without mutating editor state. */
  private registerForRange(range: VimRange): VimRegister {
    return registerForRange(this.lines, range);
  }

  /** Emit successful unnamed-register writes to the configured host hook. */
  private emitUnnamedRegisterWrite(register: VimRegister | undefined): void {
    if (register) {
      this.options.onUnnamedRegisterWrite?.(register);
    }
  }
}

function isVisualSelection(
  target: VimOperatorTarget,
): target is VimVisualSelection {
  return typeof target === "object" && "mode" in target && "anchor" in target;
}

function isVimPosition(target: VimMotion | VimPosition): target is VimPosition {
  return typeof target === "object" && "line" in target && "col" in target;
}

/** Apply the requested case transform to plain text. */
function transformCaseText(text: string, transform: VimCaseTransform): string {
  switch (transform) {
    case "toggle":
      return Array.from(text, toggleCase).join("");
    case "lower":
      return text.toLocaleLowerCase();
    case "upper":
      return text.toLocaleUpperCase();
  }
}

/** Constructor for host editor instances that expose a composed Vim editor. */
type VimEditorMixinConstructor = Constructor<{
  /** Vim editor exposed by the composed host instance. */
  readonly vimEditor: VimEditor;
}>;

/** Return a host editor subclass with reusable Vim editing operations. */
export function VimEditor<TBase extends Constructor<VimEditorHost>>(
  Base: TBase,
): TBase & VimEditorMixinConstructor {
  return class VimEditor extends Base {
    readonly vimEditor = new VimEditorCore(this);
  };
}

/** Return the target column for an f/F/t/T search, or undefined when not found. */
function findCharPosition(
  line: string,
  column: number,
  operation: VimFindOperation,
  direction: VimFindDirection,
  char: string,
  count: number,
): number | undefined {
  const step = direction === "backward" ? -1 : 1;
  let matches = Math.max(count, 1);

  for (let col = column + step; col >= 0 && col < line.length; col += step) {
    if (line[col] !== char) {
      continue;
    }
    matches -= 1;
    if (matches === 0) {
      const offset = operation === "till" ? -step : 0;
      return Math.min(Math.max(col + offset, 0), normalMaxColumn(line));
    }
  }

  return undefined;
}
