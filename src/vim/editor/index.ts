import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  DELETE_BACKWARD,
  DELETE_FORWARD,
  LINE_END,
  LINE_START,
  NEWLINE,
} from "./constants.js";
import type {
  Constructor,
  VimDeleteTarget,
  VimEditorApi,
  VimEditorHost,
} from "./types.js";
import {
  currentLine,
  cursor,
  deleteDistance,
  deleteForward,
  endOfWordPosition,
  firstNonBlankColumn,
  moveCaretToColumn,
  moveCursorToPosition,
  nextWordPosition,
  normalMaxColumn,
  previousWordPosition,
} from "./utils.js";

export type { VimDeleteTarget, VimEditorApi, VimEditorHost } from "./types.js";

export function VimEditor<TBase extends Constructor<VimEditorHost>>(
  Base: TBase,
) {
  return class VimEditor extends Base implements VimEditorApi {
    /** Move one column left without crossing to the previous line. */
    moveCursorLeft(): void {
      if (cursor(this).col === 0) return;
      this.sendInputToEditor(ARROW_LEFT);
    }

    /** Move down, then clamp because Vim Normal mode cannot rest past the last character. */
    moveCursorDown(): void {
      if (cursor(this).line >= this.getLines().length - 1) return;
      this.sendInputToEditor(ARROW_DOWN);
      this.clampCursorColumn();
    }

    /** Move up, then clamp because target lines may be shorter than the source line. */
    moveCursorUp(): void {
      if (cursor(this).line === 0) return;
      this.sendInputToEditor(ARROW_UP);
      this.clampCursorColumn();
    }

    /** Move right only while another character exists under the Normal-mode cursor. */
    moveCursorRight(): void {
      if (cursor(this).col < normalMaxColumn(currentLine(this))) {
        this.sendInputToEditor(ARROW_RIGHT);
      }
    }

    /** Move to the first column on the current line. */
    moveCursorToLineStart(): void {
      this.sendInputToEditor(LINE_START);
    }

    /** Move to the last Normal-mode character on the current line. */
    moveCursorToLineEnd(): void {
      this.sendInputToEditor(LINE_END);
      this.clampCursorColumn();
    }

    /** Move to the first non-blank character on the current line. */
    moveCursorToFirstNonBlank(): void {
      moveCaretToColumn(this, firstNonBlankColumn(currentLine(this)));
    }

    /**
     * Move to the start of the next word-like run.
     *
     * This implements the initial `w` subset: skip the current word/punctuation
     * run, skip whitespace, then land on the next word or punctuation run. A run
     * is a contiguous sequence of characters with the same `charType()`.
     */
    moveCursorToNextWord(): void {
      const target = nextWordPosition(this.getLines(), cursor(this));
      moveCursorToPosition(this, target);
    }

    /**
     * Move to the start of the previous word-like run.
     *
     * This implements the initial `b` subset using the same run definition as
     * `w`. From inside a run it lands on that run's first character; from the
     * first character of a run it skips to the previous run.
     */
    moveCursorToPreviousWord(): void {
      const target = previousWordPosition(this.getLines(), cursor(this));
      moveCursorToPosition(this, target);
    }

    /**
     * Move to the end of the current or next word-like run.
     *
     * This implements the initial `e` subset using the same run definition as
     * `w`. From inside a run it lands on that run's last character; from the last
     * character of a run it skips to the next run's last character.
     */
    moveCursorToEndOfWord(): void {
      const target = endOfWordPosition(this.getLines(), cursor(this));
      moveCursorToPosition(this, target);
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
      switch (target) {
        case "charUnderCursor":
          if (cursor(this).col < currentLine(this).length) {
            this.sendInputToEditor(DELETE_FORWARD);
          }
          return;
        case "charBeforeCursor": {
          const { col } = cursor(this);
          if (col === 0) return;

          this.sendInputToEditor(DELETE_BACKWARD);

          const targetCol = Math.min(col, currentLine(this).length);
          while (cursor(this).col < targetCol)
            this.sendInputToEditor(ARROW_RIGHT);
          return;
        }
        case "nextWord": {
          const target = nextWordPosition(this.getLines(), cursor(this));
          deleteForward(
            this,
            deleteDistance(this.getLines(), cursor(this), target),
          );
          this.clampCursorColumn();
          return;
        }
        case "lineEnd":
          deleteForward(this, currentLine(this).length - cursor(this).col);
          this.clampCursorColumn();
          return;
        case "line": {
          const line = cursor(this).line;
          const lineLength = currentLine(this).length;
          this.moveCursorToLineStart();
          deleteForward(this, lineLength);
          if (line < this.getLines().length - 1)
            this.sendInputToEditor(DELETE_FORWARD);
          this.clampCursorColumn();
          return;
        }
      }
    }

    /** Replace the Normal-mode character under the cursor and keep the cursor on the replacement. */
    replaceCharUnderCursor(char: string): void {
      if (cursor(this).col >= currentLine(this).length) {
        return;
      }

      this.delete("charUnderCursor");
      this.sendInputToEditor(char);
      this.moveCursorLeft();
    }

    /** Move left until the Normal-mode cursor sits on a character, or column 0 for an empty line. */
    clampCursorColumn(): void {
      while (cursor(this).col > normalMaxColumn(currentLine(this))) {
        this.sendInputToEditor(ARROW_LEFT);
      }
    }
  };
}
