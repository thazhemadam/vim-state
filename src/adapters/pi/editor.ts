import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { createActor, type ActorRefFrom } from "xstate";
import {
  CURSOR_MARKER,
  truncateToWidth,
  visibleWidth,
  type EditorOptions,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";

import {
  VimEditor,
  type VimEditorHost,
  type VimEditorOptions,
  type VimPosition,
  type VimVisualSelection,
} from "../../vim/editor.js";
import { vimMachine, type VimSnapshot } from "../../vim/machine.js";
import {
  getVimMode,
  getVimModeLabel,
  isVimOperatorMode,
  isVimVisualMode,
} from "../../vim/selectors.js";
import { isPrintablePiInput, piInputToVimEvent } from "./keymap.js";

class PiEditorHost extends CustomEditor implements VimEditorHost {
  sendInputToEditor(data: string): void {
    super.handleInput(data);
  }
}

type EditorSnapshot = {
  text: string;
  cursor: VimPosition;
};

const MAX_REDO_SNAPSHOTS = 100;

export class VimPiEditor extends VimEditor(PiEditorHost) {
  private readonly vim: ActorRefFrom<typeof vimMachine>;
  private cursorStyle: VimCursorStyle | undefined;
  private readonly appKeybindings: KeybindingsManager;
  private readonly redoStack: EditorSnapshot[] = [];
  /**
   * Set while redo restores a snapshot through public setters. Public setters
   * clear redo for ordinary edits; suppress that clearing for the nested
   * restore so consecutive redo operations remain available.
   */
  private isApplyingRedoRestore = false;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    vimOptions: VimEditorOptions = {},
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
    this.vimEditor.setOptions(vimOptions);
    this.vim = createActor(vimMachine, {
      input: { editor: this.vimEditor },
    }).start();
    this.appKeybindings = keybindings;
    this.tui.setShowHardwareCursor(true);
    this.syncCursorStyle();
  }

  get vimSnapshot(): VimSnapshot {
    return this.vim.getSnapshot();
  }

  setText(text: string): void {
    const previousText = this.getText();
    super.setText(text);
    if (!this.isApplyingRedoRestore && this.getText() !== previousText) {
      this.clearRedoStack();
    }
  }

  insertTextAtCursor(text: string): void {
    const previousText = this.getText();
    super.insertTextAtCursor(text);
    if (!this.isApplyingRedoRestore && this.getText() !== previousText) {
      this.clearRedoStack();
    }
  }

  undoEditor(): void {
    const before = this.createSnapshot();
    super.handleInput("\x1f"); // Ctrl--, Pi's default undo binding.
    if (this.getText() !== before.text) {
      this.pushRedoSnapshot(before);
    }
  }

  redoEditor(): void {
    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      return;
    }

    this.isApplyingRedoRestore = true;
    try {
      this.setText(snapshot.text);
      this.vimEditor.move(snapshot.cursor);
      this.vimEditor.clampCursorColumn();
    } finally {
      this.isApplyingRedoRestore = false;
    }
  }

  handleInput(data: string): void {
    const previousText = this.getText();
    const previousSnapshot = this.vimSnapshot;
    const previousMode = getVimMode(previousSnapshot);
    const event = piInputToVimEvent(data);
    this.vim.send(event);
    this.syncCursorStyle();

    const mode = getVimMode(this.vimSnapshot);
    // If you were in Insert mode and are still in Insert mode,
    // then pass the data to the underlying Pi editor.
    if (previousMode === "insert" && mode === "insert") {
      super.handleInput(data);
    } else if (
      previousMode === "replace" &&
      mode === "replace" &&
      isPrintablePiInput(data)
    ) {
      super.handleInput(data);
    } else if (shouldPassOnlyEnterThrough(previousSnapshot, event.key)) {
      // If a user presses only "Enter", we should pass it through
      // so the can be prompt can be submitted.
      super.handleInput(data);
      if (isVimVisualMode(previousSnapshot)) {
        this.vim.send({ type: "KEY", key: "escape" });
        this.syncCursorStyle();
      }
    } else if (shouldHandleNormalUpDown(previousSnapshot, event.key)) {
      const atHistoryBoundary =
        event.key === "up"
          ? this.getCursor().line === 0
          : this.getCursor().line === this.getLines().length - 1;

      if (atHistoryBoundary) {
        // If a user presses only "Up"/"Down" at a prompt-history boundary,
        // pass it through so Pi's prompt history can be cycled.
        super.handleInput(data);
        this.vimEditor.clampCursorColumn();
      } else {
        this.vimEditor.move(event.key);
      }
    } else if (mode === "normal" && this.isAppShortcutInput(data)) {
      super.handleInput(data);
    }

    if (
      !this.isApplyingRedoRestore &&
      !this.shouldPreserveRedoStack(previousSnapshot, event.key) &&
      this.getText() !== previousText
    ) {
      this.clearRedoStack();
    }

    this.tui.requestRender();
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0) {
      return lines;
    }

    const snapshot = this.vimSnapshot;
    if (vimCursorStyle(snapshot) !== "block" || isVimVisualMode(snapshot)) {
      removeReverseVideoCursor(lines);
    }

    if (isVimVisualMode(snapshot) && snapshot.context.visual) {
      highlightVisualSelection(
        lines,
        this.getLines(),
        snapshot.context.visual,
        this.getCursor(),
        this.getPaddingX(),
      );
    }

    const label = getVimModeLabel(snapshot);
    const last = lines.length - 1;
    if (visibleWidth(lines[last]!) >= label.length) {
      lines[last] =
        truncateToWidth(lines[last]!, Math.max(0, width - label.length), "") +
        label;
    }
    return lines;
  }

  restoreCursorStyle(): void {
    this.cursorStyle = "block";
    this.tui.terminal.write("\x1b[2 q");
  }

  /** Return true when input matches a Pi app-level shortcut that should not edit text. */
  private isAppShortcutInput(data: string): boolean {
    return (
      this.appKeybindings.matches(data, "app.interrupt") ||
      this.appKeybindings.matches(data, "app.clear") ||
      this.appKeybindings.matches(data, "app.suspend") ||
      (this.getText().length === 0 &&
        this.appKeybindings.matches(data, "app.exit"))
    );
  }

  /** Capture the public editor state needed for adapter-local redo. */
  private createSnapshot(): EditorSnapshot {
    return {
      text: this.getText(),
      cursor: this.getCursor(),
    };
  }

  /** Save a state that Pi just undid so Normal <C-r> can restore it. */
  private pushRedoSnapshot(snapshot: EditorSnapshot): void {
    this.redoStack.push(snapshot);
    if (this.redoStack.length > MAX_REDO_SNAPSHOTS) {
      this.redoStack.shift();
    }
  }

  /**
   * Native Pi redo clears redo from its private pushUndoSnapshot() hook.
   * vim-pi cannot access that hook, so the adapter clears its shadow redo stack
   * after any observed text-changing input except the two Normal-mode history
   * commands that consume or produce redo entries. This deliberately does not
   * preserve redo for Visual `u`, which is a lowercase text transform.
   */
  private shouldPreserveRedoStack(
    previousSnapshot: VimSnapshot,
    key: string,
  ): boolean {
    return (
      previousSnapshot.value === "normal" && (key === "u" || key === "ctrl+r")
    );
  }

  private clearRedoStack(): void {
    this.redoStack.length = 0;
  }

  /** Sync terminal cursor shape with Vim mode, avoiding duplicate escape writes. */
  private syncCursorStyle(): void {
    const style = vimCursorStyle(this.vimSnapshot);
    if (this.cursorStyle === style) {
      return;
    }
    this.cursorStyle = style;
    this.tui.terminal.write(CURSOR_SHAPE[style]);
  }
}

/** Terminal cursor shapes used to mirror the current Vim parser state. */
type VimCursorStyle = "bar" | "block" | "underline";

/** DECSCUSR escape sequences for the cursor shapes supported by Pi's terminal. */
const CURSOR_SHAPE: Record<VimCursorStyle, string> = {
  bar: "\x1b[6 q",
  block: "\x1b[2 q",
  underline: "\x1b[4 q",
};

/** Return the hardware cursor shape for the current Vim machine snapshot. */
function vimCursorStyle(snapshot: VimSnapshot): VimCursorStyle {
  if (
    isVimOperatorMode(snapshot) ||
    snapshot.value === "replace" ||
    snapshot.value === "replace-once"
  ) {
    return "underline";
  }
  return getVimMode(snapshot) === "insert" ? "bar" : "block";
}

function shouldPassOnlyEnterThrough(
  snapshot: VimSnapshot,
  key: string,
): boolean {
  return (
    key === "enter" &&
    snapshot.context.count === undefined &&
    (snapshot.value === "normal" || isVimVisualMode(snapshot))
  );
}

function shouldHandleNormalUpDown(
  snapshot: VimSnapshot,
  key: string,
): key is "up" | "down" {
  return (
    snapshot.value === "normal" &&
    snapshot.context.count === undefined &&
    (key === "up" || key === "down")
  );
}

const REVERSE_VIDEO_CURSOR = /\x1b\[7m([^\x1b]*)\x1b\[0m/;

/** ANSI SGR pair used to draw Visual selection without changing buffer text. */
const START_REVERSE_VIDEO = "\x1b[7m";
const END_REVERSE_VIDEO = "\x1b[0m";

/** Remove Pi's fake block (reverse-video) cursor when a non-block hardware cursor is visible. */
function removeReverseVideoCursor(lines: string[]): void {
  for (let i = 0; i < lines.length; i += 1) {
    if (!REVERSE_VIDEO_CURSOR.test(lines[i])) {
      continue;
    }
    lines[i] = lines[i]!.replace(REVERSE_VIDEO_CURSOR, "$1");
    return;
  }
}

/** Overlay the active Visual selection on Pi's already-rendered editor lines. */
function highlightVisualSelection(
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

/** Convert Vim's anchor+cursor Visual selection into inclusive rendered-line column ranges. */
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

/** Wrap a visible-column span with reverse-video ANSI while preserving existing escapes. */
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

/** Return the raw string index for a visible column, ignoring ANSI/control escapes. */
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
