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
import {
  getInitialVimSnapshot,
  transitionVim,
  type VimSnapshot,
} from "../../vim/transition.js";
import { applyVimActionToPiEditor } from "./apply-action.js";
import { isSingleControlPiInput, piInputToVimEvent } from "./keymap.js";

export class VimPiEditor extends CustomEditor {
  private snapshot: VimSnapshot = getInitialVimSnapshot().snapshot;
  private cursorStyle: "bar" | "block" | undefined;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
    this.tui.setShowHardwareCursor(true);
    this.syncCursorStyle();
  }

  getVimSnapshot(): VimSnapshot {
    return this.snapshot;
  }

  /** Move one column left using Pi's caret model. Normal-mode left already clamps at 0. */
  moveCaretLeft(): void {
    super.handleInput("\x1b[D");
  }

  /** Move down, then clamp because Vim Normal mode cannot rest past the last character. */
  moveCaretDown(): void {
    super.handleInput("\x1b[B");
    this.clampNormalCursorColumn();
  }

  /** Move up, then clamp because target lines may be shorter than the source line. */
  moveCaretUp(): void {
    super.handleInput("\x1b[A");
    this.clampNormalCursorColumn();
  }

  /** Move right only while another character exists under the Normal-mode cursor. */
  moveCaretRight(): void {
    const { line, col } = this.getCursor();
    if (col < normalMaxColumn(this.getLines()[line] ?? ""))
      super.handleInput("\x1b[C");
  }

  handleInput(data: string): void {
    const wasInsert = getVimMode(this.snapshot) === "insert";
    const result = transitionVim(this.snapshot, piInputToVimEvent(data));
    this.snapshot = result.snapshot;
    this.syncCursorStyle();

    for (const action of result.actions) applyVimActionToPiEditor(action, this);

    // If you were in Insert mode and are still in Insert mode,
    // then pass the data to the underlying Pi editor.
    if (wasInsert && getVimMode(this.snapshot) === "insert") {
      super.handleInput(data);
    } else if (
      getVimMode(this.snapshot) === "normal" &&
      isSingleControlPiInput(data)
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

  /** Sync terminal cursor shape with Vim mode, avoiding duplicate escape writes. */
  private syncCursorStyle(): void {
    const style = getVimMode(this.snapshot) === "insert" ? "bar" : "block";
    if (this.cursorStyle === style) {
      return;
    }
    this.cursorStyle = style;
    this.tui.terminal.write(style === "bar" ? "\x1b[6 q" : "\x1b[2 q");
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
