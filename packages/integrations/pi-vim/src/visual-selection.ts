import type { CustomEditor } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";

import type { VimPosition, VimVisualSelection } from "vim-state";

const ESCAPE = "\x1b";
const REVERSE_VIDEO_CURSOR = new RegExp(
  `${ESCAPE}\\[7m([^${ESCAPE}]*)${ESCAPE}\\[0m`,
);
const ANSI_CSI_SEQUENCE = new RegExp(`^${ESCAPE}\\[[0-?]*[ -/]*[@-~]`);
const START_REVERSE_VIDEO = `${ESCAPE}[7m`;
const END_REVERSE_VIDEO = `${ESCAPE}[0m`;
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

type PiLayoutLine = { text: string };

type PiVisualLayout = {
  lines: PiLayoutLine[];
  scrollOffset: number;
  visibleLineCount: number;
  paddingX: number;
};

type PiEditorLayoutInternals = {
  layoutText?: (width: number) => PiLayoutLine[];
  scrollOffset?: number;
};

type VisualLineSegment = {
  logicalLine: number;
  visualLine: number;
  start: number;
  end: number;
};

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
  editor: CustomEditor,
  renderedLines: string[],
  selection: VimVisualSelection,
  width: number,
  terminalRows: number,
): void {
  const layout = requirePiVisualLayout(editor, width, terminalRows);
  const bufferLines = editor.getLines();
  const segments = mapVisualLineSegments(bufferLines, layout.lines);
  const ranges = visualSelectionRanges(
    bufferLines,
    selection,
    editor.getCursor(),
  );
  for (const segment of segments) {
    const range = ranges.get(segment.logicalLine);
    if (!range) {
      continue;
    }

    const visibleIndex = segment.visualLine - layout.scrollOffset;
    if (visibleIndex < 0 || visibleIndex >= layout.visibleLineCount) {
      continue;
    }

    const renderedIndex = visibleIndex + 1;
    const renderedLine = renderedLines[renderedIndex];
    if (renderedLine === undefined) {
      continue;
    }

    const line = bufferLines[segment.logicalLine] ?? "";
    const start = Math.max(range.start, segment.start);
    const end = Math.min(range.end, segment.end);
    let startColumn =
      layout.paddingX + visibleWidth(line.slice(segment.start, start));
    let endColumn =
      startColumn + visibleWidth(line.slice(start, Math.max(start, end)));

    // Linewise Visual mode includes an empty line's cursor cell.
    if (
      selection.mode === "linewise" &&
      segment.start === 0 &&
      segment.end === 0
    ) {
      startColumn = layout.paddingX;
      endColumn = startColumn + 1;
    }

    if (endColumn <= startColumn) {
      continue;
    }

    renderedLines[renderedIndex] = highlightColumns(
      renderedLine,
      startColumn,
      endColumn,
    );
  }
}

/**
 * Read the layout that Pi used for the preceding render.
 *
 * Pi does not expose its wrapped-line map publicly. Calling the private layout
 * method keeps Visual highlighting aligned with Pi's exact wrapping algorithm.
 * If a future Pi release changes those internals, omit the overlay rather than
 * show a partial selection that disagrees with the operation's actual range.
 */
function requirePiVisualLayout(
  editor: CustomEditor,
  width: number,
  terminalRows: number,
): PiVisualLayout {
  const maxVisibleLines = Math.max(5, Math.floor(terminalRows * 0.3));
  const maxPadding = Math.max(0, Math.floor((width - 1) / 2));
  const paddingX = Math.min(editor.getPaddingX(), maxPadding);
  const contentWidth = Math.max(1, width - paddingX * 2);
  const layoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1));
  const internals = editor as unknown as PiEditorLayoutInternals;

  if (typeof internals.layoutText !== "function") {
    throw incompatiblePiLayout();
  }

  let lines: PiLayoutLine[];
  try {
    lines = internals.layoutText.call(editor, layoutWidth);
  } catch (cause) {
    throw incompatiblePiLayout(cause);
  }

  const scrollOffset = internals.scrollOffset;
  if (
    !Array.isArray(lines) ||
    !lines.every(
      (line): line is PiLayoutLine =>
        typeof line === "object" &&
        line !== null &&
        typeof line.text === "string",
    ) ||
    !Number.isInteger(scrollOffset) ||
    scrollOffset === undefined ||
    scrollOffset < 0 ||
    scrollOffset > lines.length
  ) {
    throw incompatiblePiLayout();
  }

  return {
    lines,
    scrollOffset,
    visibleLineCount: Math.min(
      maxVisibleLines,
      Math.max(0, lines.length - scrollOffset),
    ),
    paddingX,
  };
}

/** Map Pi's visual layout rows back to ranges in the logical buffer. */
function mapVisualLineSegments(
  bufferLines: string[],
  layoutLines: PiLayoutLine[],
): VisualLineSegment[] {
  const segments: VisualLineSegment[] = [];
  let visualLine = 0;

  for (
    let logicalLine = 0;
    logicalLine < bufferLines.length;
    logicalLine += 1
  ) {
    const line = bufferLines[logicalLine] ?? "";
    let start = 0;

    do {
      const layoutLine = layoutLines[visualLine];
      if (!layoutLine) {
        throw incompatiblePiLayout();
      }

      const end = start + layoutLine.text.length;
      if (line.slice(start, end) !== layoutLine.text) {
        throw incompatiblePiLayout();
      }

      segments.push({ logicalLine, visualLine, start, end });
      visualLine += 1;
      start = end;

      if (layoutLine.text.length === 0 && line.length > 0) {
        throw incompatiblePiLayout();
      }
    } while (start < line.length);
  }

  if (visualLine !== layoutLines.length) {
    throw incompatiblePiLayout();
  }
  return segments;
}

function incompatiblePiLayout(cause?: unknown): Error {
  return new Error(
    "vim-pi cannot map this Pi editor's wrapped layout; install the supported Pi 0.79.8 release",
    cause === undefined ? undefined : { cause },
  );
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

  while (raw < line.length) {
    if (line.startsWith(CURSOR_MARKER, raw)) {
      raw += CURSOR_MARKER.length;
      continue;
    }

    const control = ANSI_CSI_SEQUENCE.exec(line.slice(raw));
    if (control) {
      raw += control[0].length;
      continue;
    }

    if (col >= column) {
      break;
    }

    const nextControl = line.indexOf("\x1b", raw);
    const plainText = line.slice(
      raw,
      nextControl === -1 ? line.length : nextControl,
    );
    const grapheme = graphemeSegmenter
      .segment(plainText)
      [Symbol.iterator]()
      .next().value?.segment;
    if (!grapheme) {
      raw += 1;
      continue;
    }

    const graphemeWidth = visibleWidth(grapheme);
    if (col + graphemeWidth > column) {
      break;
    }
    raw += grapheme.length;
    col += graphemeWidth;
  }

  return raw;
}
