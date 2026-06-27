/**
 * Domain actions emitted by terminal Vim state transitions.
 *
 * Adapters translate these intent-level actions into concrete editor mutations.
 * The reusable Vim core must not import Pi or any other host editor API.
 */
export const PLACE_CURSOR_ON_PREVIOUS_CHARACTER =
  "placeCursorOnPreviousCharacter" as const;
export const PLACE_CARET_BEFORE_CURSOR = "placeCaretBeforeCursor" as const;
export const MOVE_CURSOR_LEFT = "moveCursorLeft" as const;
export const MOVE_CURSOR_DOWN = "moveCursorDown" as const;
export const MOVE_CURSOR_UP = "moveCursorUp" as const;
export const MOVE_CURSOR_RIGHT = "moveCursorRight" as const;

export type VimAction =
  | { type: typeof PLACE_CURSOR_ON_PREVIOUS_CHARACTER }
  | { type: typeof PLACE_CARET_BEFORE_CURSOR }
  | { type: typeof MOVE_CURSOR_LEFT }
  | { type: typeof MOVE_CURSOR_DOWN }
  | { type: typeof MOVE_CURSOR_UP }
  | { type: typeof MOVE_CURSOR_RIGHT };

export function toVimAction(type: string): VimAction | undefined {
  switch (type) {
    case PLACE_CURSOR_ON_PREVIOUS_CHARACTER:
      return { type: PLACE_CURSOR_ON_PREVIOUS_CHARACTER };
    case PLACE_CARET_BEFORE_CURSOR:
      return { type: PLACE_CARET_BEFORE_CURSOR };
    case MOVE_CURSOR_LEFT:
      return { type: MOVE_CURSOR_LEFT };
    case MOVE_CURSOR_DOWN:
      return { type: MOVE_CURSOR_DOWN };
    case MOVE_CURSOR_UP:
      return { type: MOVE_CURSOR_UP };
    case MOVE_CURSOR_RIGHT:
      return { type: MOVE_CURSOR_RIGHT };
    default:
      return undefined;
  }
}
