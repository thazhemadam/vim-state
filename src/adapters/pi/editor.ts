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
import { LinearHistory } from "../../vim/history.js";
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

const MAX_HISTORY_SNAPSHOTS = 100;

export class VimPiEditor extends VimEditor(PiEditorHost) {
  private readonly vim: ActorRefFrom<typeof vimMachine>;
  private cursorStyle: VimCursorStyle | undefined;
  private readonly appKeybindings: KeybindingsManager;
  private readonly vimHistory = new LinearHistory<EditorSnapshot>(
    MAX_HISTORY_SNAPSHOTS,
  );
  private activeInsertSnapshot: EditorSnapshot | undefined;
  /**
   * Set while undo/redo restores a snapshot through public setters. Public
   * setters normally reset history; suppress that reset for history restores.
   */
  private isRestoringHistorySnapshot = false;

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
    this.activeInsertSnapshot = this.createSnapshot();
    this.tui.setShowHardwareCursor(true);
    this.syncCursorStyle();
  }

  get vimSnapshot(): VimSnapshot {
    return this.vim.getSnapshot();
  }

  /** Replace the whole prompt and treat the result as the new history baseline. */
  setText(text: string): void {
    super.setText(text);
    if (!this.isRestoringHistorySnapshot) {
      this.resetHistoryBaseline();
    }
  }

  /** Insert programmatic text as one undoable linear history edit. */
  insertTextAtCursor(text: string): void {
    const before = this.createSnapshot();
    super.insertTextAtCursor(text);
    if (!this.isRestoringHistorySnapshot && this.getText() !== before.text) {
      this.commitNewEdit(before);
      if (isInsertHistorySession(this.vimSnapshot)) {
        this.activeInsertSnapshot = this.createSnapshot();
      }
    }
  }

  /** Restore the previous vim-pi-owned linear history snapshot. */
  undoEditor(): void {
    this.undoHistory();
  }

  /** Restore the next vim-pi-owned linear history snapshot. */
  redoEditor(): void {
    this.redoHistory();
  }

  handleInput(data: string): void {
    const before = this.createSnapshot();
    const previousSnapshot = this.vimSnapshot;
    const previousMode = getVimMode(previousSnapshot);
    const event = piInputToVimEvent(data);

    if (this.handleNormalHistoryKey(previousSnapshot, event.key)) {
      this.tui.requestRender();
      return;
    }

    if (this.handleHostHistoryShortcut(data)) {
      this.tui.requestRender();
      return;
    }

    let historyWasReset = false;
    this.vim.send(event);
    this.syncCursorStyle();

    const mode = getVimMode(this.vimSnapshot);
    // If you were in Insert mode and are still in Insert mode,
    // then pass the data to the underlying Pi editor.
    if (previousMode === "insert" && mode === "insert") {
      super.handleInput(data);
      if (this.isHostBaselineResetInput(data, event.key)) {
        this.resetHistoryBaseline();
        historyWasReset = true;
      }
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
      this.resetHistoryBaseline();
      historyWasReset = true;
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
        this.resetHistoryBaseline();
        historyWasReset = true;
        this.vimEditor.clampCursorColumn();
      } else {
        this.vimEditor.move(event.key);
      }
    } else if (
      previousMode === "normal" &&
      mode === "normal" &&
      this.isAppShortcutInput(data)
    ) {
      super.handleInput(data);

      // Host shortcuts can submit, clear, or otherwise replace the prompt.
      // Start history from the resulting buffer so old prompt text cannot be
      // restored into the next prompt with Vim undo.
      this.resetHistoryBaseline();
      historyWasReset = true;
    }

    this.updateLinearHistory(
      before,
      previousSnapshot,
      this.vimSnapshot,
      event.key,
      historyWasReset,
    );

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
    const labelWidth = label.length + 2;
    const highlightedLabel = highlightVimModeLabel(label);
    const last = lines.length - 1;
    if (visibleWidth(lines[last]!) >= labelWidth) {
      lines[last] =
        truncateToWidth(lines[last]!, Math.max(0, width - labelWidth), "") +
        highlightedLabel;
    }
    return lines;
  }

  restoreCursorStyle(): void {
    this.cursorStyle = "block";
    this.tui.terminal.write("\x1b[2 q");
  }

  /** Return true for host-handled inputs that replace or clear the prompt. */
  private isHostBaselineResetInput(data: string, key: string): boolean {
    return key === "enter" || this.isAppShortcutInput(data);
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

  /** Capture the public editor state needed for vim-pi-owned history. */
  private createSnapshot(): EditorSnapshot {
    return {
      text: this.getText(),
      cursor: this.getCursor(),
    };
  }

  /**
   * Clear all linear undo/redo entries and treat the current buffer as the new
   * starting state. If the editor is currently in Insert/Replace, start a fresh
   * session snapshot from that state so subsequent typed text remains undoable.
   */
  private resetHistoryBaseline(): void {
    this.vimHistory.reset();
    this.activeInsertSnapshot = isInsertHistorySession(this.vimSnapshot)
      ? this.createSnapshot()
      : undefined;
  }

  /** Commit a new linear undo point and discard any abandoned redo path. */
  private commitNewEdit(before: EditorSnapshot): void {
    if (this.getText() === before.text) {
      return;
    }
    this.vimHistory.commit(before);
  }

  /** Update linear history after one input has been applied to the editor. */
  private updateLinearHistory(
    before: EditorSnapshot,
    previousSnapshot: VimSnapshot,
    nextSnapshot: VimSnapshot,
    key: string,
    historyWasReset: boolean,
  ): void {
    if (this.isRestoringHistorySnapshot) {
      return;
    }

    if (historyWasReset) {
      return;
    }

    if (isNormalHistoryCommand(previousSnapshot, key)) {
      return;
    }

    const textChanged = this.getText() !== before.text;
    const wasInsertSession = isInsertHistorySession(previousSnapshot);
    const isInsertSession = isInsertHistorySession(nextSnapshot);

    if (!wasInsertSession && isInsertSession) {
      this.activeInsertSnapshot = before;
      return;
    }

    if (wasInsertSession && !isInsertSession) {
      const sessionBefore = this.activeInsertSnapshot ?? before;
      this.activeInsertSnapshot = undefined;
      this.commitNewEdit(sessionBefore);
      return;
    }

    if (isInsertSession) {
      return;
    }

    if (textChanged) {
      this.commitNewEdit(before);
    }
  }

  /** Commit the active Insert/Replace session if it changed buffer text. */
  private commitActiveInsertSession(): void {
    if (!this.activeInsertSnapshot) {
      return;
    }
    const before = this.activeInsertSnapshot;
    this.activeInsertSnapshot = undefined;
    this.commitNewEdit(before);
  }

  /** Apply simple Normal-mode history keys without routing through host undo. */
  private handleNormalHistoryKey(snapshot: VimSnapshot, key: string): boolean {
    if (snapshot.value !== "normal" || snapshot.context.count !== undefined) {
      return false;
    }
    if (key === "u") {
      this.undoHistory();
      return true;
    }
    if (key === "ctrl+r") {
      this.redoHistory();
      return true;
    }
    return false;
  }

  /** Map raw host undo shortcuts onto vim-pi history to avoid host drift. */
  private handleHostHistoryShortcut(data: string): boolean {
    if (
      this.appKeybindings.matches(data, "tui.editor.undo") ||
      data === "\x1f"
    ) {
      this.undoHistory();
      return true;
    }
    return false;
  }

  /** Pop undo history, push the current state to redo, and restore the prior state. */
  private undoHistory(): void {
    this.commitActiveInsertSession();
    const snapshot = this.vimHistory.undo(this.createSnapshot());
    if (snapshot) {
      this.restoreHistorySnapshot(snapshot);
    }
  }

  /** Pop redo history, push the current state to undo, and restore the next state. */
  private redoHistory(): void {
    this.commitActiveInsertSession();
    const snapshot = this.vimHistory.redo(this.createSnapshot());
    if (snapshot) {
      this.restoreHistorySnapshot(snapshot);
    }
  }

  /** Restore a history snapshot without treating public setter calls as new edits. */
  private restoreHistorySnapshot(snapshot: EditorSnapshot): void {
    this.isRestoringHistorySnapshot = true;
    try {
      this.setText(snapshot.text);
      this.vimEditor.move(snapshot.cursor);
      if (!isInsertHistorySession(this.vimSnapshot)) {
        this.vimEditor.clampCursorColumn();
      }
    } finally {
      this.isRestoringHistorySnapshot = false;
    }

    this.activeInsertSnapshot = isInsertHistorySession(this.vimSnapshot)
      ? this.createSnapshot()
      : undefined;
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

/** Return true while one Insert/Replace session should be one undo block. */
function isInsertHistorySession(snapshot: VimSnapshot): boolean {
  const mode = getVimMode(snapshot);
  return mode === "insert" || mode === "replace";
}

/** Return true for Normal-mode keys that consume linear history. */
function isNormalHistoryCommand(snapshot: VimSnapshot, key: string): boolean {
  return snapshot.value === "normal" && (key === "u" || key === "ctrl+r");
}

/** Return the hardware cursor shape for the current Vim machine snapshot. */
// Match nightfox.nvim's lualine mode palette: bg0 text on base mode colors.
const MODE_LABEL_STYLES = {
  INSERT: "\x1b[1;38;2;19;26;36;48;2;129;178;154m",
  NORMAL: "\x1b[1;38;2;19;26;36;48;2;113;156;214m",
  OPERATOR: "\x1b[1;38;2;19;26;36;48;2;219;192;116m",
  VISUAL: "\x1b[1;38;2;19;26;36;48;2;157;121;214m",
  "VISUAL LINE": "\x1b[1;38;2;19;26;36;48;2;157;121;214m",
  REPLACE: "\x1b[1;38;2;19;26;36;48;2;201;79;109m",
} as const;

const ANSI_RESET = "\x1b[0m";

function highlightVimModeLabel(
  label: ReturnType<typeof getVimModeLabel>,
): string {
  return `${MODE_LABEL_STYLES[label]} ${label} ${ANSI_RESET}`;
}

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
