import {
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  LINE_END,
  LINE_START,
  NEWLINE,
} from "./constants.js";
import { applyDeleteRange, resolveMotion } from "./operators.js";
import type {
  Constructor,
  VimEditorApi,
  VimEditorHost,
  VimMotion,
  VimNoun,
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
} from "./types.js";

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

    /** Apply a supported operator noun as a delete. */
    delete(noun: VimNoun): void {
      const result = resolveMotion(this, noun);
      if (!result) {
        return;
      }

      applyDeleteRange(this, result.range);

      // `left` (X/dh) deletes by moving to the previous character and deleting
      // forward, so it already lands on the right Normal-mode column.
      if (noun === "left") {
        return;
      }

      this.clampCursorColumn();
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
