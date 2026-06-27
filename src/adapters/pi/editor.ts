import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  type EditorOptions,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";

import { getVimMode, getVimModeLabel } from "../../vim/selectors.js";
import { applyVimAction, type VimActionHandler } from "../../vim/actions.js";
import {
  getInitialVimSnapshot,
  transitionVim,
  type VimSnapshot,
} from "../../vim/transition.js";
import { piInputToVimEvent } from "./keymap.js";

export class VimPiEditor extends CustomEditor implements VimActionHandler {
  private snapshot: VimSnapshot = getInitialVimSnapshot().snapshot;
  private cursorStyle: "bar" | "block" | undefined;
  private readonly appKeybindings: KeybindingsManager;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
    this.appKeybindings = keybindings;
    this.tui.setShowHardwareCursor(true);
    this.syncCursorStyle();
  }

  getVimSnapshot(): VimSnapshot {
    return this.snapshot;
  }

  /** Move one column left using Pi's caret model. Normal-mode left already clamps at 0. */
  moveCursorLeft(): void {
    super.handleInput("\x1b[D");
  }

  /** Move down, then clamp because Vim Normal mode cannot rest past the last character. */
  moveCursorDown(): void {
    super.handleInput("\x1b[B");
    this.clampNormalCursorColumn();
  }

  /** Move up, then clamp because target lines may be shorter than the source line. */
  moveCursorUp(): void {
    super.handleInput("\x1b[A");
    this.clampNormalCursorColumn();
  }

  /** Move right only while another character exists under the Normal-mode cursor. */
  moveCursorRight(): void {
    const { line, col } = this.getCursor();
    if (col < normalMaxColumn(this.getLines()[line] ?? ""))
      super.handleInput("\x1b[C");
  }

  /** Move to the first column on the current line. */
  moveCursorToLineStart(): void {
    super.handleInput("\x01");
  }

  /** Move to the last Normal-mode character on the current line. */
  moveCursorToLineEnd(): void {
    super.handleInput("\x05");
    this.clampNormalCursorColumn();
  }

  /** Move to the first non-blank character on the current line. */
  moveCursorToFirstNonBlank(): void {
    this.moveCaretToColumn(
      firstNonBlankColumn(this.getLines()[this.getCursor().line] ?? ""),
    );
  }

  /** Insert an empty line below the current line and leave the caret on it. */
  insertLineBelow(): void {
    super.handleInput("\x05");
    super.handleInput("\n");
  }

  /** Insert an empty line above the current line and leave the caret on it. */
  insertLineAbove(): void {
    super.handleInput("\x01");
    super.handleInput("\n");
    super.handleInput("\x1b[A");
  }

  /** Place the Insert caret at the start of the current line. */
  placeCaretAtLineStart(): void {
    super.handleInput("\x01");
  }

  /** Place the Insert caret after the current Normal-mode character. */
  placeCaretAfterCursor(): void {
    const { line, col } = this.getCursor();
    if (col < (this.getLines()[line] ?? "").length) super.handleInput("\x1b[C");
  }

  /** Place the Insert caret at the end of the current line. */
  placeCaretAtLineEnd(): void {
    super.handleInput("\x05");
  }

  handleInput(data: string): void {
    const wasInsert = getVimMode(this.snapshot) === "insert";
    const result = transitionVim(this.snapshot, piInputToVimEvent(data));
    this.snapshot = result.snapshot;
    this.syncCursorStyle();

    for (const action of result.actions) applyVimAction(action, this);

    // If you were in Insert mode and are still in Insert mode,
    // then pass the data to the underlying Pi editor.
    if (wasInsert && getVimMode(this.snapshot) === "insert") {
      super.handleInput(data);
    } else if (
      getVimMode(this.snapshot) === "normal" &&
      this.isAppShortcutInput(data)
    ) {
      super.handleInput(data);
    }

    this.tui.requestRender();
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0) return lines;

    if (getVimMode(this.snapshot) === "insert") removeReverseVideoCursor(lines);

    const label = getVimModeLabel(this.snapshot);
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

  /** Sync terminal cursor shape with Vim mode, avoiding duplicate escape writes. */
  private syncCursorStyle(): void {
    const style = getVimMode(this.snapshot) === "insert" ? "bar" : "block";
    if (this.cursorStyle === style) {
      return;
    }
    this.cursorStyle = style;
    this.tui.terminal.write(style === "bar" ? "\x1b[6 q" : "\x1b[2 q");
  }

  /** Move to a zero-based column using Pi editor cursor primitives. */
  private moveCaretToColumn(column: number): void {
    super.handleInput("\x01");
    for (let i = 0; i < column; i += 1) super.handleInput("\x1b[C");
  }

  /** Reuse Pi left-arrow handling until the caret is back on a valid Normal-mode character. */
  private clampNormalCursorColumn(): void {
    while (
      this.getCursor().col >
      normalMaxColumn(this.getLines()[this.getCursor().line] ?? "")
    ) {
      super.handleInput("\x1b[D");
    }
  }
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

const REVERSE_VIDEO_CURSOR = /\x1b\[7m([^\x1b]*)\x1b\[0m/;

/** Remove Pi's reverse-video cursor highlight when Insert mode uses the hardware bar cursor. */
function removeReverseVideoCursor(lines: string[]): void {
  for (let i = 0; i < lines.length; i += 1) {
    if (!REVERSE_VIDEO_CURSOR.test(lines[i])) {
      continue;
    }
    lines[i] = lines[i]!.replace(REVERSE_VIDEO_CURSOR, "$1");
    return;
  }
}
