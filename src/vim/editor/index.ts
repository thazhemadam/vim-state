import {
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  LINE_END,
  LINE_START,
  NEWLINE,
} from "./constants.js";
import {
  applyDeleteRange,
  resolveMotion,
  resolveOperatorRange,
} from "./operators.js";
import type {
  Constructor,
  VimEditorApi,
  VimEditorHost,
  VimMotion,
  VimNoun,
  VimRegister,
} from "./types.js";
import {
  currentLine,
  cursor,
  moveCursorToPosition,
  normalMaxColumn,
} from "./utils.js";

export type {
  VimEditorApi,
  VimEditorHost,
  VimMotion,
  VimNoun,
  VimOperator,
  VimRegister,
} from "./types.js";

export { nounForKey } from "./utils.js";

export function VimEditor<TBase extends Constructor<VimEditorHost>>(
  Base: TBase,
) {
  return class VimEditor extends Base implements VimEditorApi {
    /** Apply a supported Normal-mode cursor motion. */
    move(motion: VimMotion): void {
      const result = resolveMotion(this, motion);
      if (!result) {
        return;
      }

      moveCursorToPosition(this, result.destination);
    }

    /** Insert an empty line below the current line and leave the caret on it. */
    insertLineBelow(): void {
      this.sendInputToEditor(LINE_END);
      this.sendInputToEditor(NEWLINE);
    }

    /** Insert an empty line above the current line and leave the caret on it. */
    insertLineAbove(): void {
      this.sendInputToEditor(LINE_START);
      this.sendInputToEditor(NEWLINE);
      this.sendInputToEditor(ARROW_UP);
    }

    /** Place the Insert caret at the start of the current line. */
    placeCaretAtLineStart(): void {
      this.sendInputToEditor(LINE_START);
    }

    /** Place the Insert caret after the current Normal-mode character. */
    placeCaretAfterCursor(): void {
      if (cursor(this).col < currentLine(this).length) {
        this.sendInputToEditor(ARROW_RIGHT);
      }
    }

    /** Place the Insert caret at the end of the current line. */
    placeCaretAtLineEnd(): void {
      this.sendInputToEditor(LINE_END);
    }

    /**
     * Apply a supported operator noun as a delete and return the deleted text.
     *
     * Operator nouns include real motions (`dw`) plus linewise nouns from doubled
     * operators (`dd`), so range resolution is separate from cursor movement.
     */
    delete(noun: VimNoun): VimRegister | undefined {
      const range = resolveOperatorRange(this, noun);
      if (!range) {
        return undefined;
      }

      const register = applyDeleteRange(this, range);

      // `left` (X/dh) deletes by moving to the previous character and deleting
      // forward, so it already lands on the right Normal-mode column,
      // so we don't need to clamp the cursor to the column.
      if (noun !== "left") {
        this.clampCursorColumn();
      }

      return register;
    }

    /** Put unnamed-register text before/after the cursor, or above/below the current line. */
    put(register: VimRegister, placement: "before" | "after"): void {
      if (register.type === "linewise") {
        if (placement === "before") {
          this.placeCaretAtLineStart();
          insertText(this, register.text);
        } else {
          this.placeCaretAtLineEnd();
          insertText(this, NEWLINE + register.text.replace(/\n$/, ""));
        }
        this.clampCursorColumn();
        return;
      }

      if (placement === "after") {
        this.placeCaretAfterCursor();
      }
      insertText(this, register.text);
      this.move("left");
    }

    /** Replace the Normal-mode character under the cursor and keep the cursor on the replacement. */
    replaceCharUnderCursor(char: string): void {
      if (cursor(this).col >= currentLine(this).length) {
        return;
      }

      this.delete("right");
      this.sendInputToEditor(char);
      this.move("left");
    }

    /** Move left until the Normal-mode cursor sits on a character, or column 0 for an empty line. */
    clampCursorColumn(): void {
      while (cursor(this).col > normalMaxColumn(currentLine(this))) {
        this.sendInputToEditor(ARROW_LEFT);
      }
    }
  };
}

/** Send plain inserted text one character at a time; host editors parse keys, not strings. */
function insertText(editor: VimEditorHost, text: string): void {
  for (const char of text) {
    editor.sendInputToEditor(char);
  }
}
