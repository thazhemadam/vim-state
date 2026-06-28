import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  LINE_END,
  LINE_START,
  NEWLINE,
} from "./constants.js";
import { applyDeleteRange, deleteRange } from "./operators.js";
import type {
  Constructor,
  VimDeleteTarget,
  VimEditorApi,
  VimEditorHost,
  VimMotion,
} from "./types.js";
import {
  currentLine,
  cursor,
  endOfWordPosition,
  firstNonBlankColumn,
  moveCaretToColumn,
  moveCursorToPosition,
  nextWordPosition,
  normalMaxColumn,
  previousWordPosition,
} from "./utils.js";

export type {
  VimDeleteTarget,
  VimEditorApi,
  VimEditorHost,
  VimMotion,
} from "./types.js";

export function VimEditor<TBase extends Constructor<VimEditorHost>>(
  Base: TBase,
) {
  return class VimEditor extends Base implements VimEditorApi {
    /** Apply a supported Normal-mode cursor motion. */
    move(motion: VimMotion): void {
      switch (motion) {
        case "left":
          // Move one column left without crossing to the previous line.
          if (cursor(this).col === 0) return;
          this.sendInputToEditor(ARROW_LEFT);
          return;
        case "down":
          // Move down, then clamp because Vim Normal mode cannot rest past the last character.
          if (cursor(this).line >= this.getLines().length - 1) return;
          this.sendInputToEditor(ARROW_DOWN);
          this.clampCursorColumn();
          return;
        case "up":
          // Move up, then clamp because target lines may be shorter than the source line.
          if (cursor(this).line === 0) return;
          this.sendInputToEditor(ARROW_UP);
          this.clampCursorColumn();
          return;
        case "right":
          // Move right only while another character exists under the Normal-mode cursor.
          if (cursor(this).col < normalMaxColumn(currentLine(this))) {
            this.sendInputToEditor(ARROW_RIGHT);
          }
          return;
        case "lineStart":
          // Move to the first column on the current line.
          this.sendInputToEditor(LINE_START);
          return;
        case "lineEnd":
          // Move to the last Normal-mode character on the current line.
          this.sendInputToEditor(LINE_END);
          this.clampCursorColumn();
          return;
        case "firstNonBlank":
          // Move to the first non-blank character on the current line.
          moveCaretToColumn(this, firstNonBlankColumn(currentLine(this)));
          return;
        case "nextWord":
          // Move to the start of the next word-like run.
          moveCursorToPosition(
            this,
            nextWordPosition(this.getLines(), cursor(this)),
          );
          return;
        case "previousWord":
          // Move to the start of the previous word-like run.
          moveCursorToPosition(
            this,
            previousWordPosition(this.getLines(), cursor(this)),
          );
          return;
        case "endOfWord":
          // Move to the end of the current or next word-like run.
          moveCursorToPosition(
            this,
            endOfWordPosition(this.getLines(), cursor(this)),
          );
          return;
      }
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

    /** Apply a supported Normal-mode delete target. */
    delete(target: VimDeleteTarget): void {
      const range = deleteRange(this, target);
      if (!range) return;

      applyDeleteRange(this, range);

      // `charBeforeCursor` (X) deletes by moving to the previous character and
      // deleting forward, so it already lands on the right Normal-mode column.
      if (target === "charBeforeCursor") return;

      this.clampCursorColumn();
    }

    /** Replace the Normal-mode character under the cursor and keep the cursor on the replacement. */
    replaceCharUnderCursor(char: string): void {
      if (cursor(this).col >= currentLine(this).length) {
        return;
      }

      this.delete("charUnderCursor");
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
