import type { VimEditorApi } from "./editor.js";

/** Runtime dependencies and bounded parser data owned by the Vim machine. */
export interface VimContext {
  editor: VimEditorApi;
}

export type VimInput = VimContext;
