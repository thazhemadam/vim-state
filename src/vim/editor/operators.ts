import { DELETE_FORWARD } from "./constants.js";
import type { VimDeleteTarget, VimEditorHost, VimRange } from "./types.js";
import {
  currentLine,
  cursor,
  moveCursorToPosition,
  nextWordPosition,
} from "./utils.js";

/** Convert a supported delete target into the concrete buffer range it affects. */
export function deleteRange(
  editor: VimEditorHost,
  target: VimDeleteTarget,
): VimRange | undefined {
  const start = cursor(editor);

  switch (target) {
    case "charUnderCursor":
      if (start.col >= currentLine(editor).length) {
        return undefined;
      }
      return {
        type: "charwise",
        start,
        end: { line: start.line, col: start.col + 1 },
      };
    case "charBeforeCursor":
      if (start.col === 0) return undefined;
      return {
        type: "charwise",
        start: { line: start.line, col: start.col - 1 },
        end: start,
      };
    case "nextWord":
      return {
        type: "charwise",
        start,
        end: nextWordPosition(editor.getLines(), start),
      };
    case "lineEnd":
      return {
        type: "charwise",
        start,
        end: { line: start.line, col: currentLine(editor).length },
      };
    case "line":
      return { type: "linewise", startLine: start.line, endLine: start.line };
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
  start: { line: number; col: number },
  end: { line: number; col: number },
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
