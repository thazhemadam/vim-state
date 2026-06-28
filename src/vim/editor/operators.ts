import type { VimPosition, VimRange, VimRegister } from "./types.js";
import {
  endOfWordPosition,
  nextWordPosition,
  previousWordPosition,
} from "./utils.js";

/** Build the register metadata for a range without mutating editor state. */
export function registerForRange(
  lines: string[],
  range: VimRange,
): VimRegister {
  return {
    text: textForRange(lines, range),
    type: range.type === "linewise" ? "linewise" : "charwise",
  };
}

/** Resolve repeated word-ish motions without mutating the host editor. */
export function countedWordPosition(
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

export function samePosition(left: VimPosition, right: VimPosition): boolean {
  return left.line === right.line && left.col === right.col;
}

/** Return a forward charwise range even when the motion destination is before the cursor. */
export function normalizedCharRange(
  start: VimPosition,
  end: VimPosition,
): VimRange {
  if (
    start.line < end.line ||
    (start.line === end.line && start.col <= end.col)
  ) {
    return { type: "charwise", start, end };
  }

  return { type: "charwise", start: end, end: start };
}

/**
 * Return how many forward deletes move text from `start` up to `end`.
 *
 * Crossing a line counts the newline separator as one deleted character, matching
 * the host editor's repeated forward-delete behavior.
 */
export function deleteDistance(
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
