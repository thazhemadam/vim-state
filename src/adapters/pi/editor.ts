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

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
  }

  getVimSnapshot(): VimSnapshot {
    return this.snapshot;
  }

  /** Move one column left using Pi's caret model. Normal-mode left already clamps at 0. */
  moveCaretLeft(): void {
    super.handleInput("\x1b[D");
  }

  handleInput(data: string): void {
    const wasInsert = getVimMode(this.snapshot) === "insert";
    const result = transitionVim(this.snapshot, piInputToVimEvent(data));
    this.snapshot = result.snapshot;

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

    const label = getVimModeLabel(this.snapshot);
    const last = lines.length - 1;
    if (visibleWidth(lines[last]!) >= label.length) {
      lines[last] =
        truncateToWidth(lines[last]!, Math.max(0, width - label.length), "") +
        label;
    }
    return lines;
  }
}
