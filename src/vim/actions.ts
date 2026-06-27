/**
 * Domain actions emitted by terminal Vim state transitions.
 *
 * Adapters translate these intent-level actions into concrete editor mutations.
 * The reusable Vim core must not import Pi or any other host editor API.
 */
export const VIM_ACTION_TYPES = [
  "placeCaretAfterCursor",
  "placeCaretAtLineEnd",
  "moveCursorLeft",
  "moveCursorDown",
  "moveCursorUp",
  "moveCursorRight",
  "moveCursorToLineStart",
  "moveCursorToLineEnd",
  "moveCursorToFirstNonBlank",
  "insertLineBelow",
  "insertLineAbove",
  "placeCaretAtLineStart",
  "deleteCharUnderCursor",
  "deleteCharBeforeCursor",
  "clampCursorColumn",
] as const;

export const [
  PLACE_CARET_AFTER_CURSOR,
  PLACE_CARET_AT_LINE_END,
  MOVE_CURSOR_LEFT,
  MOVE_CURSOR_DOWN,
  MOVE_CURSOR_UP,
  MOVE_CURSOR_RIGHT,
  MOVE_CURSOR_TO_LINE_START,
  MOVE_CURSOR_TO_LINE_END,
  MOVE_CURSOR_TO_FIRST_NON_BLANK,
  INSERT_LINE_BELOW,
  INSERT_LINE_ABOVE,
  PLACE_CARET_AT_LINE_START,
  DELETE_CHAR_UNDER_CURSOR,
  DELETE_CHAR_BEFORE_CURSOR,
  CLAMP_CURSOR_COLUMN,
] = VIM_ACTION_TYPES;

export type VimActionType = (typeof VIM_ACTION_TYPES)[number];
export type VimAction = { type: VimActionType };

export interface VimActionHandler extends Record<VimActionType, () => void> {}

const vimActionTypeSet = new Set<string>(VIM_ACTION_TYPES);

export function applyVimAction(
  action: VimAction,
  handler: VimActionHandler,
): void {
  handler[action.type]();
}

export function toVimAction(type: string): VimAction | undefined {
  return isVimActionType(type) ? { type } : undefined;
}

function isVimActionType(type: string): type is VimActionType {
  return vimActionTypeSet.has(type);
}
