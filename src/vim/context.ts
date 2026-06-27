import type { VimEditor } from "./editor.js";

/** Runtime dependencies and bounded parser data owned by the Vim machine. */
export interface VimContext {
  editor: VimEditor;
}

export type VimInput = VimContext;
