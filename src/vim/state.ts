/**
 * Public modal state values exposed by the Vim core.
 *
 * Keep this aligned with `vimMachine` state node names and Vim's observable
 * `mode()` values where practical.
 */
export type VimMode = "insert" | "normal";

export const initialVimMode: VimMode = "insert";
