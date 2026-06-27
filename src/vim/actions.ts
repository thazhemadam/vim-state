/**
 * Domain actions emitted by terminal Vim state transitions.
 *
 * Adapters translate these intent-level actions into concrete editor mutations.
 * The reusable Vim core must not import Pi or any other host editor API.
 */
export const PLACE_CURSOR_ON_PREVIOUS_CHARACTER =
  "placeCursorOnPreviousCharacter" as const;
export const PLACE_CARET_BEFORE_CURSOR = "placeCaretBeforeCursor" as const;
export const PLACE_CARET_AFTER_CURSOR = "placeCaretAfterCursor" as const;
export const PLACE_CARET_AT_LINE_END = "placeCaretAtLineEnd" as const;
export const MOVE_CURSOR_LEFT = "moveCursorLeft" as const;
export const MOVE_CURSOR_DOWN = "moveCursorDown" as const;
export const MOVE_CURSOR_UP = "moveCursorUp" as const;
export const MOVE_CURSOR_RIGHT = "moveCursorRight" as const;
export const MOVE_CURSOR_TO_LINE_START = "moveCursorToLineStart" as const;
export const MOVE_CURSOR_TO_LINE_END = "moveCursorToLineEnd" as const;
export const MOVE_CURSOR_TO_FIRST_NON_BLANK =
  "moveCursorToFirstNonBlank" as const;
export const INSERT_LINE_BELOW = "insertLineBelow" as const;
export const INSERT_LINE_ABOVE = "insertLineAbove" as const;
export const PLACE_CARET_AT_LINE_START = "placeCaretAtLineStart" as const;

export type VimAction =
  | { type: typeof PLACE_CURSOR_ON_PREVIOUS_CHARACTER }
  | { type: typeof PLACE_CARET_BEFORE_CURSOR }
  | { type: typeof PLACE_CARET_AFTER_CURSOR }
  | { type: typeof PLACE_CARET_AT_LINE_END }
  | { type: typeof MOVE_CURSOR_LEFT }
  | { type: typeof MOVE_CURSOR_DOWN }
  | { type: typeof MOVE_CURSOR_UP }
  | { type: typeof MOVE_CURSOR_RIGHT }
  | { type: typeof MOVE_CURSOR_TO_LINE_START }
  | { type: typeof MOVE_CURSOR_TO_LINE_END }
  | { type: typeof MOVE_CURSOR_TO_FIRST_NON_BLANK }
  | { type: typeof INSERT_LINE_BELOW }
  | { type: typeof INSERT_LINE_ABOVE }
  | { type: typeof PLACE_CARET_AT_LINE_START };

export function toVimAction(type: string): VimAction | undefined {
  switch (type) {
    case PLACE_CURSOR_ON_PREVIOUS_CHARACTER:
      return { type: PLACE_CURSOR_ON_PREVIOUS_CHARACTER };
    case PLACE_CARET_BEFORE_CURSOR:
      return { type: PLACE_CARET_BEFORE_CURSOR };
    case PLACE_CARET_AFTER_CURSOR:
      return { type: PLACE_CARET_AFTER_CURSOR };
    case PLACE_CARET_AT_LINE_END:
      return { type: PLACE_CARET_AT_LINE_END };
    case MOVE_CURSOR_LEFT:
      return { type: MOVE_CURSOR_LEFT };
    case MOVE_CURSOR_DOWN:
      return { type: MOVE_CURSOR_DOWN };
    case MOVE_CURSOR_UP:
      return { type: MOVE_CURSOR_UP };
    case MOVE_CURSOR_RIGHT:
      return { type: MOVE_CURSOR_RIGHT };
    case MOVE_CURSOR_TO_LINE_START:
      return { type: MOVE_CURSOR_TO_LINE_START };
    case MOVE_CURSOR_TO_LINE_END:
      return { type: MOVE_CURSOR_TO_LINE_END };
    case MOVE_CURSOR_TO_FIRST_NON_BLANK:
      return { type: MOVE_CURSOR_TO_FIRST_NON_BLANK };
    case INSERT_LINE_BELOW:
      return { type: INSERT_LINE_BELOW };
    case INSERT_LINE_ABOVE:
      return { type: INSERT_LINE_ABOVE };
    case PLACE_CARET_AT_LINE_START:
      return { type: PLACE_CARET_AT_LINE_START };
    default:
      return undefined;
  }
}
