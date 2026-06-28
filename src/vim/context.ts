import type { VimEditorApi } from "./editor.js";

export type VimOperator = "delete";

/** Runtime dependencies and bounded parser data owned by the Vim machine. */
export interface VimContext {
  editor: VimEditorApi;
  count?: number;
  pendingOperator?: VimOperator;
}

export type VimInput = VimContext;
