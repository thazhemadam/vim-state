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

import { VimEditor, type VimEditorHost } from "../../vim/editor.js";
import { vimMachine, type VimSnapshot } from "../../vim/machine.js";
import {
  getVimMode,
  getVimModeLabel,
  isVimOperatorMode,
} from "../../vim/selectors.js";
import { isPrintablePiInput, piInputToVimEvent } from "./keymap.js";

class PiEditorHost extends CustomEditor implements VimEditorHost {
  sendInputToEditor(data: string): void {
    super.handleInput(data);
  }
}

export class VimPiEditor extends VimEditor(PiEditorHost) {
  private readonly vim: ActorRefFrom<typeof vimMachine>;
  private cursorStyle: VimCursorStyle | undefined;
  private readonly appKeybindings: KeybindingsManager;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
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

    if (vimCursorStyle(this.vimSnapshot) !== "block") {
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
  if (isVimOperatorMode(snapshot)) {
    return "underline";
  }
  return getVimMode(snapshot) === "insert" ? "bar" : "block";
}

const REVERSE_VIDEO_CURSOR = /\x1b\[7m([^\x1b]*)\x1b\[0m/;

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
