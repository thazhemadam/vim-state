import type { VimEditorApi, VimOperator } from "./editor.js";

/** Runtime dependencies and bounded parser data owned by the Vim machine. */
export interface VimContext {
  editor: VimEditorApi;
  count?: number;
  operator?: VimOperator;
}

export type VimInput = VimContext;
