/**
 * Vim modal state model.
 *
 * This file is intentionally small during scaffolding. The implementation will
 * expand this into a discriminated union covering Vim's observable mode() codes
 * plus transient parser states such as count/register/operator prefixes.
 */

export type VimMode =
  | "normal"
  | "insert"
  | "replace"
  | "visual-char"
  | "visual-line"
  | "visual-block"
  | "operator-pending"
  | "command-line";

export interface VimState {
  mode: VimMode;
}

export const initialVimState: VimState = {
  mode: "insert",
};
