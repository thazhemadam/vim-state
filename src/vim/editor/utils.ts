import { ARROW_DOWN, ARROW_RIGHT, ARROW_UP, LINE_START } from "./constants.js";
import type { VimEditorHost } from "./types.js";

export function cursor(editor: VimEditorHost): { line: number; col: number } {
  return editor.getCursor();
}

export function currentLine(editor: VimEditorHost): string {
  return editor.getLines()[cursor(editor).line] ?? "";
}

/** Move to a zero-based position using host editor cursor primitives. */
export function moveCursorToPosition(
  editor: VimEditorHost,
  position: { line: number; col: number },
): void {
  while (cursor(editor).line < position.line) {
    editor.sendInputToEditor(ARROW_DOWN);
  }
  while (cursor(editor).line > position.line) {
    editor.sendInputToEditor(ARROW_UP);
  }
  moveCaretToColumn(editor, position.col);
}

/** Move to a zero-based column using host editor cursor primitives. */
export function moveCaretToColumn(editor: VimEditorHost, column: number): void {
  editor.sendInputToEditor(LINE_START);
  for (let i = 0; i < column; i += 1) {
    editor.sendInputToEditor(ARROW_RIGHT);
  }
}

/** Last valid Normal-mode cursor column for a line; empty lines stay at column 0. */
export function normalMaxColumn(line: string): number {
  return Math.max(line.length - 1, 0);
}

/** Column of the first non-blank character, or 0 for blank/empty lines. */
export function firstNonBlankColumn(line: string): number {
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
export function nextWordPosition(
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
      while (col < line.length && charType(line[col]!) === type) {
        col += 1;
      }
    }
    while (col < line.length && isWhitespace(line[col]!)) {
      col += 1;
    }

    if (col < line.length) {
      return { line: lineIndex, col };
    }
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
export function previousWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : line.length - 1;

    while (col >= 0) {
      while (col >= 0 && isWhitespace(line[col]!)) {
        col -= 1;
      }
      if (col < 0) {
        break;
      }

      const type = charType(line[col]!);
      let start = col;
      while (start > 0 && charType(line[start - 1]!) === type) {
        start -= 1;
      }

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
export function endOfWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : 0;

    while (col < line.length) {
      while (col < line.length && isWhitespace(line[col]!)) {
        col += 1;
      }
      if (col >= line.length) {
        break;
      }

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
  if (isWhitespace(char)) {
    return "space";
  }
  return /[A-Za-z0-9_]/.test(char) ? "word" : "punct";
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}
