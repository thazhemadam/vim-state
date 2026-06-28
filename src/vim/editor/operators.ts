import { DELETE_FORWARD } from "./constants.js";
import type {
  VimEditorHost,
  VimMotionResult,
  VimNoun,
  VimPosition,
  VimRange,
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
 * Resolve a motion/text noun into both pieces consumers need:
 * - `destination` for plain Normal-mode movement
 * - `range` for operators such as delete
 */
export function resolveMotion(
  editor: VimEditorHost,
  noun: VimNoun,
): VimMotionResult | undefined {
  const start = cursor(editor);
  const line = currentLine(editor);

  switch (noun) {
    case "left": {
      if (start.col === 0) {
        return undefined;
      }
      const destination = { line: start.line, col: start.col - 1 };
      return {
        range: { type: "charwise", start: destination, end: start },
        destination,
      };
    }

    case "right": {
      if (line.length === 0) {
        return undefined;
      }
      const end = { line: start.line, col: start.col + 1 };
      return {
        range: { type: "charwise", start, end },
        destination: {
          line: start.line,
          col: Math.min(end.col, normalMaxColumn(line)),
        },
      };
    }

    case "down": {
      const line = start.line + 1;
      if (line >= editor.getLines().length) {
        return undefined;
      }
      return {
        range: { type: "linewise", startLine: start.line, endLine: line },
        destination: clampedPosition(editor, { line, col: start.col }),
      };
    }

    case "up": {
      const line = start.line - 1;
      if (line < 0) {
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

    case "lineEnd":
      return {
        range: {
          type: "charwise",
          start,
          end: { line: start.line, col: line.length },
        },
        destination: { line: start.line, col: normalMaxColumn(line) },
      };

    case "firstNonBlank": {
      const destination = { line: start.line, col: firstNonBlankColumn(line) };
      return {
        range: normalizedCharRange(start, destination),
        destination,
      };
    }

    case "nextWord": {
      const destination = nextWordPosition(editor.getLines(), start);
      return {
        range: { type: "charwise", start, end: destination },
        destination,
      };
    }

    case "previousWord": {
      const destination = previousWordPosition(editor.getLines(), start);
      return {
        range: normalizedCharRange(start, destination),
        destination,
      };
    }

    case "endOfWord": {
      const destination = endOfWordPosition(editor.getLines(), start);
      return {
        range: {
          type: "charwise",
          start,
          end: { line: destination.line, col: destination.col + 1 },
        },
        destination,
      };
    }

    case "line":
      return {
        range: { type: "linewise", startLine: start.line, endLine: start.line },
        destination: { line: start.line, col: 0 },
      };
  }
}

/** Apply a delete range through host-editor cursor movement and forward-delete primitives. */
export function applyDeleteRange(editor: VimEditorHost, range: VimRange): void {
  switch (range.type) {
    case "charwise":
      moveCursorToPosition(editor, range.start);
      deleteForward(
        editor,
        deleteDistance(editor.getLines(), range.start, range.end),
      );
      return;
    case "linewise":
      moveCursorToPosition(editor, { line: range.startLine, col: 0 });
      for (let line = range.startLine; line <= range.endLine; ++line) {
        deleteForward(editor, currentLine(editor).length);
        if (range.startLine < editor.getLines().length - 1) {
          editor.sendInputToEditor(DELETE_FORWARD);
        }
      }
      return;
  }
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
