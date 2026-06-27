/**
 * Domain actions emitted by terminal Vim state transitions.
 *
 * Adapters translate these intent-level actions into concrete editor mutations.
 * The reusable Vim core must not import Pi or any other host editor API.
 */
export const PLACE_CURSOR_ON_PREVIOUS_CHARACTER =
  "placeCursorOnPreviousCharacter" as const;
export const PLACE_CARET_BEFORE_CURSOR = "placeCaretBeforeCursor" as const;

export type VimAction =
  | { type: typeof PLACE_CURSOR_ON_PREVIOUS_CHARACTER }
  | { type: typeof PLACE_CARET_BEFORE_CURSOR };

export function toVimAction(type: string): VimAction | undefined {
  switch (type) {
    case PLACE_CURSOR_ON_PREVIOUS_CHARACTER:
      return { type: PLACE_CURSOR_ON_PREVIOUS_CHARACTER };
    case PLACE_CARET_BEFORE_CURSOR:
      return { type: PLACE_CARET_BEFORE_CURSOR };
    default:
      return undefined;
  }
}
