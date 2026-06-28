import type { VimEditorApi, VimOperator, VimRegister } from "./editor.js";

/** Runtime dependencies and bounded parser data owned by the Vim machine. */
export interface VimContext {
  editor: VimEditorApi;
  count?: number;
  operator?: VimOperator;
  register?: VimRegister;
}

export type VimInput = VimContext;
