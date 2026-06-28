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

type Constructor<T = {}> = new (...args: any[]) => T;

export interface VimEditorHost {
  getCursor(): { line: number; col: number };
  getLines(): string[];
  sendInputToEditor(data: string): void;
}

/** Terminal/control key bytes forwarded to the host editor. */
const ARROW_LEFT = "\x1b[D";
const ARROW_DOWN = "\x1b[B";
const ARROW_UP = "\x1b[A";
const ARROW_RIGHT = "\x1b[C";
const LINE_START = "\x01"; // Ctrl-A
const LINE_END = "\x05"; // Ctrl-E
const NEWLINE = "\n";
const DELETE_FORWARD = "\x1b[3~"; // Delete
const DELETE_BACKWARD = "\x7f"; // Backspace

export function VimEditor<TBase extends Constructor<VimEditorHost>>(
  Base: TBase,
) {
  return class VimEditor extends Base implements VimEditorApi {
    /** Move one column left without crossing to the previous line. */
    moveCursorLeft(): void {
      if (cursor(this).col === 0) return;
      this.sendInputToEditor(ARROW_LEFT);
    }

    /** Move down, then clamp because Vim Normal mode cannot rest past the last character. */
    moveCursorDown(): void {
      if (cursor(this).line >= this.getLines().length - 1) return;
      this.sendInputToEditor(ARROW_DOWN);
      this.clampCursorColumn();
    }

    /** Move up, then clamp because target lines may be shorter than the source line. */
    moveCursorUp(): void {
      if (cursor(this).line === 0) return;
      this.sendInputToEditor(ARROW_UP);
      this.clampCursorColumn();
    }

    /** Move right only while another character exists under the Normal-mode cursor. */
    moveCursorRight(): void {
      if (cursor(this).col < normalMaxColumn(currentLine(this))) {
        this.sendInputToEditor(ARROW_RIGHT);
      }
    }

    /** Move to the first column on the current line. */
    moveCursorToLineStart(): void {
      this.sendInputToEditor(LINE_START);
    }

    /** Move to the last Normal-mode character on the current line. */
    moveCursorToLineEnd(): void {
      this.sendInputToEditor(LINE_END);
      this.clampCursorColumn();
    }

    /** Move to the first non-blank character on the current line. */
    moveCursorToFirstNonBlank(): void {
      moveCaretToColumn(this, firstNonBlankColumn(currentLine(this)));
    }

    /**
     * Move to the start of the next word-like run.
     *
     * This implements the initial `w` subset: skip the current word/punctuation
     * run, skip whitespace, then land on the next word or punctuation run. A run
     * is a contiguous sequence of characters with the same `charType()`.
     */
    moveCursorToNextWord(): void {
      const target = nextWordPosition(this.getLines(), cursor(this));
      moveCursorToPosition(this, target);
    }

    /**
     * Move to the start of the previous word-like run.
     *
     * This implements the initial `b` subset using the same run definition as
     * `w`. From inside a run it lands on that run's first character; from the
     * first character of a run it skips to the previous run.
     */
    moveCursorToPreviousWord(): void {
      const target = previousWordPosition(this.getLines(), cursor(this));
      moveCursorToPosition(this, target);
    }

    /**
     * Move to the end of the current or next word-like run.
     *
     * This implements the initial `e` subset using the same run definition as
     * `w`. From inside a run it lands on that run's last character; from the last
     * character of a run it skips to the next run's last character.
     */
    moveCursorToEndOfWord(): void {
      const target = endOfWordPosition(this.getLines(), cursor(this));
      moveCursorToPosition(this, target);
    }

    /** Insert an empty line below the current line and leave the caret on it. */
    insertLineBelow(): void {
      this.sendInputToEditor(LINE_END);
      this.sendInputToEditor(NEWLINE);
    }

    /** Insert an empty line above the current line and leave the caret on it. */
    insertLineAbove(): void {
      this.sendInputToEditor(LINE_START);
      this.sendInputToEditor(NEWLINE);
      this.sendInputToEditor(ARROW_UP);
    }

    /** Place the Insert caret at the start of the current line. */
    placeCaretAtLineStart(): void {
      this.sendInputToEditor(LINE_START);
    }

    /** Place the Insert caret after the current Normal-mode character. */
    placeCaretAfterCursor(): void {
      if (cursor(this).col < currentLine(this).length) {
        this.sendInputToEditor(ARROW_RIGHT);
      }
    }

    /** Place the Insert caret at the end of the current line. */
    placeCaretAtLineEnd(): void {
      this.sendInputToEditor(LINE_END);
    }

    /** Delete the Normal-mode character under the cursor without crossing lines. */
    deleteCharUnderCursor(): void {
      if (cursor(this).col < currentLine(this).length) {
        this.sendInputToEditor(DELETE_FORWARD);
      }
    }

    /** Delete the character before the Normal-mode cursor without crossing lines. */
    deleteCharBeforeCursor(): void {
      const { col } = cursor(this);
      if (col === 0) return;

      this.sendInputToEditor(DELETE_BACKWARD);

      const targetCol = Math.min(col, currentLine(this).length);
      while (cursor(this).col < targetCol) this.sendInputToEditor(ARROW_RIGHT);
    }

    /** Replace the Normal-mode character under the cursor and keep the cursor on the replacement. */
    replaceCharUnderCursor(char: string): void {
      if (cursor(this).col >= currentLine(this).length) return;

      this.deleteCharUnderCursor();
      this.sendInputToEditor(char);
      this.moveCursorLeft();
    }

    /** Move left until the Normal-mode cursor sits on a character, or column 0 for an empty line. */
    clampCursorColumn(): void {
      while (cursor(this).col > normalMaxColumn(currentLine(this))) {
        this.sendInputToEditor(ARROW_LEFT);
      }
    }
  };
}

function cursor(editor: VimEditorHost): { line: number; col: number } {
  return editor.getCursor();
}

function currentLine(editor: VimEditorHost): string {
  return editor.getLines()[cursor(editor).line] ?? "";
}

/** Move to a zero-based position using host editor cursor primitives. */
function moveCursorToPosition(
  editor: VimEditorHost,
  position: { line: number; col: number },
): void {
  while (cursor(editor).line < position.line)
    editor.sendInputToEditor(ARROW_DOWN);
  while (cursor(editor).line > position.line)
    editor.sendInputToEditor(ARROW_UP);
  moveCaretToColumn(editor, position.col);
}

/** Move to a zero-based column using host editor cursor primitives. */
function moveCaretToColumn(editor: VimEditorHost, column: number): void {
  editor.sendInputToEditor(LINE_START);
  for (let i = 0; i < column; i += 1) editor.sendInputToEditor(ARROW_RIGHT);
}

/** Last valid Normal-mode cursor column for a line; empty lines stay at column 0. */
function normalMaxColumn(line: string): number {
  return Math.max(line.length - 1, 0);
}

/** Column of the first non-blank character, or 0 for blank/empty lines. */
function firstNonBlankColumn(line: string): number {
  const match = /\S/.exec(line);
  return match?.index ?? 0;
}

/**
 * Return the next Normal-mode `w` target.
 *
 * Deliberately small Vim subset:
 * - a run is a contiguous sequence of characters with the same `charType()`
 * - word chars are ASCII letters, digits, and `_`
 * - punctuation is any other non-whitespace run
 * - whitespace is skipped after leaving the current run
 * - scanning continues onto following lines
 * - if no next run exists, clamp to the final Normal-mode cursor position
 */
function nextWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : 0;

    if (
      lineIndex === cursor.line &&
      col < line.length &&
      !isWhitespace(line[col]!)
    ) {
      const type = charType(line[col]!);
      while (col < line.length && charType(line[col]!) === type) col += 1;
    }
    while (col < line.length && isWhitespace(line[col]!)) col += 1;

    if (col < line.length) return { line: lineIndex, col };
  }

  const lastLine = Math.max(lines.length - 1, 0);
  return { line: lastLine, col: normalMaxColumn(lines[lastLine] ?? "") };
}

/**
 * Return the previous Normal-mode `b` target.
 *
 * Uses the same small run model as `nextWordPosition()`. The only special case
 * is starting at the first character of a run: `b` skips that run and lands on
 * the previous one instead of staying in place.
 */
function previousWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : line.length - 1;

    while (col >= 0) {
      while (col >= 0 && isWhitespace(line[col]!)) col -= 1;
      if (col < 0) break;

      const type = charType(line[col]!);
      let start = col;
      while (start > 0 && charType(line[start - 1]!) === type) start -= 1;

      if (lineIndex !== cursor.line || start !== cursor.col) {
        return { line: lineIndex, col: start };
      }
      col = start - 1;
    }
  }

  return { line: 0, col: 0 };
}

/**
 * Return the next Normal-mode `e` target.
 *
 * Uses the same small run model as `nextWordPosition()`. From whitespace it
 * skips forward to the next run; from a run it lands on that run's end unless
 * already there, in which case it advances to the next run's end.
 */
function endOfWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : 0;

    while (col < line.length) {
      while (col < line.length && isWhitespace(line[col]!)) col += 1;
      if (col >= line.length) break;

      const type = charType(line[col]!);
      let end = col;
      while (end + 1 < line.length && charType(line[end + 1]!) === type) {
        end += 1;
      }

      if (lineIndex !== cursor.line || end !== cursor.col) {
        return { line: lineIndex, col: end };
      }
      col = end + 1;
    }
  }

  const lastLine = Math.max(lines.length - 1, 0);
  return { line: lastLine, col: normalMaxColumn(lines[lastLine] ?? "") };
}

/** Classify characters for the initial word-motion subset. */
function charType(char: string): "word" | "punct" | "space" {
  if (isWhitespace(char)) return "space";
  return /[A-Za-z0-9_]/.test(char) ? "word" : "punct";
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}
