import { CURSOR_MARKER } from "@earendil-works/pi-tui";

import type {
  VimPosition,
  VimVisualSelection,
} from "vim-state";

const REVERSE_VIDEO_CURSOR = /\x1b\[7m([^\x1b]*)\x1b\[0m/;
const START_REVERSE_VIDEO = "\x1b[7m";
const END_REVERSE_VIDEO = "\x1b[0m";

/** Remove Pi's fake block cursor when vim-pi uses a hardware cursor. */
export function removeReverseVideoCursor(lines: string[]): void {
  for (let i = 0; i < lines.length; i += 1) {
    if (!REVERSE_VIDEO_CURSOR.test(lines[i])) {
      continue;
    }
    lines[i] = lines[i]!.replace(REVERSE_VIDEO_CURSOR, "$1");
    return;
  }
}

/** Overlay the active Visual selection on Pi's rendered editor rows. */
export function highlightVisualSelection(
  renderedLines: string[],
  bufferLines: string[],
  selection: VimVisualSelection,
  active: VimPosition,
  paddingX: number,
): void {
  const ranges = visualSelectionRanges(bufferLines, selection, active);
  for (const [line, range] of ranges) {
    // Pi Editor render layout is private; this handles unwrapped visible lines.
    const renderedLine = renderedLines[line + 1];
    if (renderedLine === undefined) {
      continue;
    }

    renderedLines[line + 1] = highlightColumns(
      renderedLine,
      paddingX + range.start,
      paddingX + range.end,
    );
  }
}

/** Convert an anchor and cursor into inclusive logical-line ranges. */
function visualSelectionRanges(
  lines: string[],
  selection: VimVisualSelection,
  active: VimPosition,
): Map<number, { start: number; end: number }> {
  const ranges = new Map<number, { start: number; end: number }>();
  const startLine = Math.min(selection.anchor.line, active.line);
  const endLine = Math.max(selection.anchor.line, active.line);

  if (selection.mode === "linewise") {
    for (let line = startLine; line <= endLine; line += 1) {
      ranges.set(line, {
        start: 0,
        end: Math.max(lines[line]?.length ?? 0, 1),
      });
    }
    return ranges;
  }

  const forward =
    selection.anchor.line < active.line ||
    (selection.anchor.line === active.line &&
      selection.anchor.col <= active.col);
  const start = forward ? selection.anchor : active;
  const end = forward ? active : selection.anchor;

  for (let line = start.line; line <= end.line; line += 1) {
    const lineLength = lines[line]?.length ?? 0;
    ranges.set(line, {
      start: line === start.line ? start.col : 0,
      end: line === end.line ? Math.min(end.col + 1, lineLength) : lineLength,
    });
  }
  return ranges;
}

/** Wrap a visible-column span with reverse-video ANSI. */
function highlightColumns(
  line: string,
  startColumn: number,
  endColumn: number,
): string {
  if (endColumn <= startColumn) {
    return line;
  }
  const start = rawIndexForColumn(line, startColumn);
  const end = rawIndexForColumn(line, endColumn);
  return `${line.slice(0, start)}${START_REVERSE_VIDEO}${line.slice(
    start,
    end,
  )}${END_REVERSE_VIDEO}${line.slice(end)}`;
}

/** Return the raw string index for a visible column, ignoring control escapes. */
function rawIndexForColumn(line: string, column: number): number {
  let raw = 0;
  let col = 0;
  while (raw < line.length && col < column) {
    if (line.startsWith(CURSOR_MARKER, raw)) {
      raw += CURSOR_MARKER.length;
      continue;
    }
    raw += 1;
    col += 1;
  }
  return raw;
}
