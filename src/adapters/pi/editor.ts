import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { createActor, type ActorRefFrom } from "xstate";
import {
  truncateToWidth,
  visibleWidth,
  type EditorOptions,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";

import type { VimEditor } from "../../vim/editor.js";
import { vimMachine, type VimSnapshot } from "../../vim/machine.js";
import { getVimMode, getVimModeLabel } from "../../vim/selectors.js";
import { isPrintablePiInput, piInputToVimEvent } from "./keymap.js";

/** Terminal/control key bytes forwarded to the base CustomEditor. */
const ARROW_LEFT = "\x1b[D";
const ARROW_DOWN = "\x1b[B";
const ARROW_UP = "\x1b[A";
const ARROW_RIGHT = "\x1b[C";
const LINE_START = "\x01"; // Ctrl-A
const LINE_END = "\x05"; // Ctrl-E
const NEWLINE = "\n";
const DELETE_FORWARD = "\x1b[3~"; // Delete
const DELETE_BACKWARD = "\x7f"; // Backspace

export class VimPiEditor extends CustomEditor implements VimEditor {
  private readonly vim: ActorRefFrom<typeof vimMachine>;
  private cursorStyle: "bar" | "block" | undefined;
  private readonly appKeybindings: KeybindingsManager;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
    this.vim = createActor(vimMachine, { input: { editor: this } }).start();
    this.appKeybindings = keybindings;
    this.tui.setShowHardwareCursor(true);
    this.syncCursorStyle();
  }

  get vimSnapshot(): VimSnapshot {
    return this.vim.getSnapshot();
  }

  /** Move one column left without crossing to the previous line. */
  moveCursorLeft(): void {
    if (this.cursor.col === 0) return;
    super.handleInput(ARROW_LEFT);
  }

  /** Move down, then clamp because Vim Normal mode cannot rest past the last character. */
  moveCursorDown(): void {
    if (this.cursor.line >= this.getLines().length - 1) return;
    super.handleInput(ARROW_DOWN);
    this.clampCursorColumn();
  }

  /** Move up, then clamp because target lines may be shorter than the source line. */
  moveCursorUp(): void {
    if (this.cursor.line === 0) return;
    super.handleInput(ARROW_UP);
    this.clampCursorColumn();
  }

  /** Move right only while another character exists under the Normal-mode cursor. */
  moveCursorRight(): void {
    if (this.cursor.col < normalMaxColumn(this.currentLine))
      super.handleInput(ARROW_RIGHT);
  }

  /** Move to the first column on the current line. */
  moveCursorToLineStart(): void {
    super.handleInput(LINE_START);
  }

  /** Move to the last Normal-mode character on the current line. */
  moveCursorToLineEnd(): void {
    super.handleInput(LINE_END);
    this.clampCursorColumn();
  }

  /** Move to the first non-blank character on the current line. */
  moveCursorToFirstNonBlank(): void {
    this.moveCaretToColumn(firstNonBlankColumn(this.currentLine));
  }

  /**
   * Move to the start of the next word-like run.
   *
   * This implements the initial `w` subset: skip the current word/punctuation
   * run, skip whitespace, then land on the next word or punctuation run. A run
   * is a contiguous sequence of characters with the same `charType()`.
   */
  moveCursorToNextWord(): void {
    const target = nextWordPosition(this.getLines(), this.cursor);
    this.moveCursorToPosition(target);
  }

  /**
   * Move to the start of the previous word-like run.
   *
   * This implements the initial `b` subset using the same run definition as
   * `w`. From inside a run it lands on that run's first character; from the
   * first character of a run it skips to the previous run.
   */
  moveCursorToPreviousWord(): void {
    const target = previousWordPosition(this.getLines(), this.cursor);
    this.moveCursorToPosition(target);
  }

  /**
   * Move to the end of the current or next word-like run.
   *
   * This implements the initial `e` subset using the same run definition as
   * `w`. From inside a run it lands on that run's last character; from the last
   * character of a run it skips to the next run's last character.
   */
  moveCursorToEndOfWord(): void {
    const target = endOfWordPosition(this.getLines(), this.cursor);
    this.moveCursorToPosition(target);
  }

  /** Insert an empty line below the current line and leave the caret on it. */
  insertLineBelow(): void {
    super.handleInput(LINE_END);
    super.handleInput(NEWLINE);
  }

  /** Insert an empty line above the current line and leave the caret on it. */
  insertLineAbove(): void {
    super.handleInput(LINE_START);
    super.handleInput(NEWLINE);
    super.handleInput(ARROW_UP);
  }

  /** Place the Insert caret at the start of the current line. */
  placeCaretAtLineStart(): void {
    super.handleInput(LINE_START);
  }

  /** Place the Insert caret after the current Normal-mode character. */
  placeCaretAfterCursor(): void {
    if (this.cursor.col < this.currentLine.length)
      super.handleInput(ARROW_RIGHT);
  }

  /** Place the Insert caret at the end of the current line. */
  placeCaretAtLineEnd(): void {
    super.handleInput(LINE_END);
  }

  /** Delete the Normal-mode character under the cursor without crossing lines. */
  deleteCharUnderCursor(): void {
    if (this.cursor.col < this.currentLine.length)
      super.handleInput(DELETE_FORWARD);
  }

  /** Delete the character before the Normal-mode cursor without crossing lines. */
  deleteCharBeforeCursor(): void {
    const { col } = this.cursor;
    if (col === 0) return;

    super.handleInput(DELETE_BACKWARD);

    const targetCol = Math.min(col, this.currentLine.length);
    while (this.cursor.col < targetCol) super.handleInput(ARROW_RIGHT);
  }

  /** Replace the Normal-mode character under the cursor and keep the cursor on the replacement. */
  replaceCharUnderCursor(char: string): void {
    if (this.cursor.col >= this.currentLine.length) return;

    this.deleteCharUnderCursor();
    super.handleInput(char);
    this.moveCursorLeft();
  }

  /** Move left until the Normal-mode cursor sits on a character, or column 0 for an empty line. */
  clampCursorColumn(): void {
    while (this.cursor.col > normalMaxColumn(this.currentLine)) {
      super.handleInput(ARROW_LEFT);
    }
  }

  handleInput(data: string): void {
    const previousMode = getVimMode(this.vimSnapshot);
    this.vim.send(piInputToVimEvent(data));
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
    } else if (mode === "normal" && this.isAppShortcutInput(data)) {
      super.handleInput(data);
    }

    this.tui.requestRender();
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0) {
      return lines;
    }

    if (getVimMode(this.vimSnapshot) === "insert") {
      removeReverseVideoCursor(lines);
    }

    const label = getVimModeLabel(this.vimSnapshot);
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

  /** Current base-editor cursor position. */
  private get cursor(): { line: number; col: number } {
    return this.getCursor();
  }

  /** Current logical line, or empty text if the base editor ever reports an invalid cursor line. */
  private get currentLine(): string {
    return this.getLines()[this.cursor.line] ?? "";
  }

  /** Sync terminal cursor shape with Vim mode, avoiding duplicate escape writes. */
  private syncCursorStyle(): void {
    const style = getVimMode(this.vimSnapshot) === "insert" ? "bar" : "block";
    if (this.cursorStyle === style) {
      return;
    }
    this.cursorStyle = style;
    this.tui.terminal.write(style === "bar" ? "\x1b[6 q" : "\x1b[2 q");
  }

  /** Move to a zero-based position using Pi editor cursor primitives. */
  private moveCursorToPosition(position: { line: number; col: number }): void {
    while (this.cursor.line < position.line) super.handleInput(ARROW_DOWN);
    while (this.cursor.line > position.line) super.handleInput(ARROW_UP);
    this.moveCaretToColumn(position.col);
  }

  /** Move to a zero-based column using Pi editor cursor primitives. */
  private moveCaretToColumn(column: number): void {
    super.handleInput(LINE_START);
    for (let i = 0; i < column; i += 1) super.handleInput(ARROW_RIGHT);
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

/**
 * Return the next Normal-mode `w` target.
 *
 * Deliberately small Vim subset:
 * - a run is a contiguous sequence of characters with the same `charType()`
 * - word chars are ASCII letters, digits, and `_`
 * - punctuation is any other non-whitespace run
 * - whitespace is skipped after leaving the current run
 * - scanning continues onto following lines
 * - if no next run exists, clamp to the final Normal-mode cursor position
 */
function nextWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : 0;

    if (col < line.length && !isWhitespace(line[col]!)) {
      const type = charType(line[col]!);
      while (col < line.length && charType(line[col]!) === type) col += 1;
    }
    while (col < line.length && isWhitespace(line[col]!)) col += 1;

    if (col < line.length) return { line: lineIndex, col };
  }

  const lastLine = Math.max(lines.length - 1, 0);
  return { line: lastLine, col: normalMaxColumn(lines[lastLine] ?? "") };
}

/**
 * Return the previous Normal-mode `b` target.
 *
 * Uses the same small run model as `nextWordPosition()`. The only special case
 * is starting at the first character of a run: `b` skips that run and lands on
 * the previous one instead of staying in place.
 */
function previousWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : line.length - 1;

    while (col >= 0) {
      while (col >= 0 && isWhitespace(line[col]!)) col -= 1;
      if (col < 0) break;

      const type = charType(line[col]!);
      let start = col;
      while (start > 0 && charType(line[start - 1]!) === type) start -= 1;

      if (lineIndex !== cursor.line || start !== cursor.col) {
        return { line: lineIndex, col: start };
      }
      col = start - 1;
    }
  }

  return { line: 0, col: 0 };
}

/**
 * Return the next Normal-mode `e` target.
 *
 * Uses the same small run model as `nextWordPosition()`. From whitespace it
 * skips forward to the next run; from a run it lands on that run's end unless
 * already there, in which case it advances to the next run's end.
 */
function endOfWordPosition(
  lines: string[],
  cursor: { line: number; col: number },
): { line: number; col: number } {
  for (let lineIndex = cursor.line; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    let col = lineIndex === cursor.line ? cursor.col : 0;

    while (col < line.length) {
      while (col < line.length && isWhitespace(line[col]!)) col += 1;
      if (col >= line.length) break;

      const type = charType(line[col]!);
      let end = col;
      while (end + 1 < line.length && charType(line[end + 1]!) === type) {
        end += 1;
      }

      if (lineIndex !== cursor.line || end !== cursor.col) {
        return { line: lineIndex, col: end };
      }
      col = end + 1;
    }
  }

  const lastLine = Math.max(lines.length - 1, 0);
  return { line: lastLine, col: normalMaxColumn(lines[lastLine] ?? "") };
}

/** Classify characters for the initial word-motion subset. */
function charType(char: string): "word" | "punct" | "space" {
  if (isWhitespace(char)) return "space";
  return /[A-Za-z0-9_]/.test(char) ? "word" : "punct";
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
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
