import { DELETE_BACKWARD, DELETE_FORWARD } from "./constants.js";
import type {
  VimEditorHost,
  VimMotion,
  VimMotionResult,
  VimNoun,
  VimPosition,
  VimRange,
  VimRegister,
} from "./types.js";
import {
  currentLine,
  cursor,
  endOfWordPosition,
  firstNonBlankColumn,
  moveCursorToPosition,
  nextWordPosition,
  normalMaxColumn,
  previousWordPosition,
} from "./utils.js";

/**
 * Resolve a real cursor motion into both meanings Vim assigns to motions:
 * where plain movement lands, and what range an operator using that motion covers.
 */
export function resolveMotion(
  editor: VimEditorHost,
  noun: VimMotion,
  count = 1,
): VimMotionResult | undefined {
  const start = cursor(editor);
  const lines = editor.getLines();
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
      const line = lines[start.line] ?? "";
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
      const line = Math.min(start.line + steps, lines.length - 1);
      if (line === start.line) {
        return undefined;
      }
      return {
        range: { type: "linewise", startLine: start.line, endLine: line },
        destination: clampedPosition(editor, { line, col: start.col }),
      };
    }

    case "up": {
      const line = Math.max(start.line - steps, 0);
      if (line === start.line) {
        return undefined;
      }
      return {
        range: { type: "linewise", startLine: line, endLine: start.line },
        destination: clampedPosition(editor, { line, col: start.col }),
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
      const line = Math.min(start.line + steps - 1, lines.length - 1);
      const text = lines[line] ?? "";
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
      const line = lines[start.line] ?? "";
      const destination = { line: start.line, col: firstNonBlankColumn(line) };
      return {
        range: normalizedCharRange(start, destination),
        destination,
      };
    }

    case "nextWord": {
      const destination = countedWordPosition(lines, start, noun, steps);
      return {
        range: { type: "charwise", start, end: destination },
        destination,
      };
    }

    case "previousWord": {
      const destination = countedWordPosition(lines, start, noun, steps);
      return {
        range: normalizedCharRange(start, destination),
        destination,
      };
    }

    case "endOfWord": {
      const destination = countedWordPosition(lines, start, noun, steps);
      // At the end of the final word, `e` has no motion. Operators like `de`
      // should therefore leave the buffer untouched.
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

/**
 * Resolve an operator noun into the buffer range it covers.
 *
 * Motions reuse their motion range. `line` is not a cursor motion; it names the
 * current-line range for doubled operators such as `dd` and `cc`.
 */
export function resolveOperatorRange(
  editor: VimEditorHost,
  noun: VimNoun,
  count = 1,
): VimRange | undefined {
  if (noun === "line") {
    const start = cursor(editor);
    return {
      type: "linewise",
      startLine: start.line,
      endLine: Math.min(
        start.line + Math.max(count, 1) - 1,
        editor.getLines().length - 1,
      ),
    };
  }

  return resolveMotion(editor, noun, count)?.range;
}

/** Apply a resolved operator range as a delete and return the removed register text. */
export function applyDeleteRange(
  editor: VimEditorHost,
  range: VimRange,
): VimRegister {
  const register = registerForRange(editor.getLines(), range);
  switch (range.type) {
    case "charwise":
      moveCursorToPosition(editor, range.start);
      deleteForward(
        editor,
        deleteDistance(editor.getLines(), range.start, range.end),
      );
      return register;
    case "linewise":
      return applyLineDelete(editor, range, register);
  }
}

/** Apply a resolved operator range as a change and return the removed register text. */
export function applyChangeRange(
  editor: VimEditorHost,
  range: VimRange,
): VimRegister {
  const register = registerForRange(editor.getLines(), range);
  switch (range.type) {
    case "charwise":
      moveCursorToPosition(editor, range.start);
      deleteForward(
        editor,
        deleteDistance(editor.getLines(), range.start, range.end),
      );
      return register;
    case "linewise":
      return applyLineChange(editor, range, register);
  }
}

/**
 * Delete whole rows for a linewise range.
 *
 * The host editor only exposes character deletion, so deleting the original EOF
 * row needs one backward delete to remove the leftover empty line. After rows are
 * removed, Vim keeps the old column where possible and clamps on shorter lines.
 */
function applyLineDelete(
  editor: VimEditorHost,
  range: Extract<VimRange, { type: "linewise" }>,
  register: VimRegister,
): VimRegister {
  const currentCol = cursor(editor).col;

  const lastLine = editor.getLines().length - 1;
  const deletesLastLine = range.endLine >= lastLine;
  const lineCount = range.endLine - range.startLine + 1;

  // Start at column 0 because linewise delete removes rows, not a span from the
  // current cursor column.
  moveCursorToPosition(editor, { line: range.startLine, col: 0 });
  for (let i = 0; i < lineCount; ++i) {
    deleteForward(editor, currentLine(editor).length);
    if (cursor(editor).line < editor.getLines().length - 1) {
      editor.sendInputToEditor(DELETE_FORWARD);
    }
  }

  if (deletesLastLine && range.startLine > 0) {
    // Deleting the final row leaves an empty last line; backspace removes that
    // row by joining it into the previous surviving line.
    editor.sendInputToEditor(DELETE_BACKWARD);
  }

  // Land on the next surviving row, unless the deleted range reached EOF; then
  // land on the previous row. Keep the original column where possible.
  const targetLine = deletesLastLine ? range.startLine - 1 : range.startLine;
  const line = Math.max(targetLine, 0);
  moveCursorToPosition(
    editor,
    clampedPosition(editor, { line, col: currentCol }),
  );
  return register;
}

/** Clear a linewise range to one empty row, which becomes the Insert target. */
function applyLineChange(
  editor: VimEditorHost,
  range: Extract<VimRange, { type: "linewise" }>,
  register: VimRegister,
): VimRegister {
  moveCursorToPosition(editor, { line: range.startLine, col: 0 });
  deleteForward(editor, currentLine(editor).length);

  for (let line = range.startLine; line < range.endLine; ++line) {
    if (cursor(editor).line < editor.getLines().length - 1) {
      editor.sendInputToEditor(DELETE_FORWARD);
    }
    deleteForward(editor, currentLine(editor).length);
  }

  return register;
}

/** Build the register metadata for a range without mutating editor state. */
function registerForRange(lines: string[], range: VimRange): VimRegister {
  return {
    text: textForRange(lines, range),
    type: range.type === "linewise" ? "linewise" : "charwise",
  };
}

/** Clamp a requested destination to a valid Normal-mode cursor column. */
function clampedPosition(
  editor: VimEditorHost,
  position: VimPosition,
): VimPosition {
  return {
    line: position.line,
    col: Math.min(
      position.col,
      normalMaxColumn(editor.getLines()[position.line] ?? ""),
    ),
  };
}

/** Resolve repeated word-ish motions without mutating the host editor. */
function countedWordPosition(
  lines: string[],
  start: VimPosition,
  noun: "nextWord" | "previousWord" | "endOfWord",
  count: number,
): VimPosition {
  let position = start;
  for (let i = 0; i < count; ++i) {
    const next = wordPosition(lines, position, noun);
    if (samePosition(next, position)) {
      return next;
    }
    position = next;
  }
  return position;
}

/** Resolve one supported word-ish motion. */
function wordPosition(
  lines: string[],
  position: VimPosition,
  noun: "nextWord" | "previousWord" | "endOfWord",
): VimPosition {
  switch (noun) {
    case "nextWord":
      return nextWordPosition(lines, position);
    case "previousWord":
      return previousWordPosition(lines, position);
    case "endOfWord":
      return endOfWordPosition(lines, position);
  }
}

function samePosition(left: VimPosition, right: VimPosition): boolean {
  return left.line === right.line && left.col === right.col;
}

/** Return a forward charwise range even when the motion destination is before the cursor. */
function normalizedCharRange(start: VimPosition, end: VimPosition): VimRange {
  if (
    start.line < end.line ||
    (start.line === end.line && start.col <= end.col)
  ) {
    return { type: "charwise", start, end };
  }

  return { type: "charwise", start: end, end: start };
}

/** Return the exact buffer text covered by a resolved operator range. */
function textForRange(lines: string[], range: VimRange): string {
  switch (range.type) {
    case "charwise":
      return charwiseText(lines, range.start, range.end);
    case "linewise":
      return `${lines.slice(range.startLine, range.endLine + 1).join("\n")}\n`;
  }
}

/** Return charwise text between two positions, preserving embedded newlines. */
function charwiseText(
  lines: string[],
  start: VimPosition,
  end: VimPosition,
): string {
  if (start.line === end.line) {
    return (lines[start.line] ?? "").slice(start.col, end.col);
  }

  const chunks = [(lines[start.line] ?? "").slice(start.col)];
  for (let line = start.line + 1; line < end.line; ++line) {
    chunks.push(lines[line] ?? "");
  }
  chunks.push((lines[end.line] ?? "").slice(0, end.col));
  return chunks.join("\n");
}

/** Delete `count` characters using the host editor's forward-delete primitive. */
function deleteForward(editor: VimEditorHost, count: number): void {
  for (let i = 0; i < count; ++i) {
    editor.sendInputToEditor(DELETE_FORWARD);
  }
}

/**
 * Return how many forward deletes move text from `start` up to `end`.
 *
 * Crossing a line counts the newline separator as one deleted character, matching
 * the host editor's repeated forward-delete behavior.
 */
function deleteDistance(
  lines: string[],
  start: VimPosition,
  end: VimPosition,
): number {
  if (start.line === end.line) {
    return Math.max(end.col - start.col, 0);
  }

  let distance = (lines[start.line]?.length ?? 0) - start.col + 1;
  for (let line = start.line + 1; line < end.line; ++line) {
    distance += (lines[line]?.length ?? 0) + 1;
  }
  return distance + end.col;
}
