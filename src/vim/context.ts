import type {
  VimEditorApi,
  VimOperator,
  VimRegister,
  VimVisualSelection,
} from "./editor.js";

/** Runtime dependencies and bounded parser data owned by the Vim machine. */
export interface VimContext {
  editor: VimEditorApi;
  count?: number;
  operator?: VimOperator;
  register?: VimRegister;
  visual?: VimVisualSelection;
}

export type VimInput = VimContext;
