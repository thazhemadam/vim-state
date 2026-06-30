import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { VimPiEditor } from "./editor.js";

export default function vimPiExtension(pi: ExtensionAPI): void {
  let editor: VimPiEditor | undefined;

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      editor = new VimPiEditor(tui, theme, keybindings);
      return editor;
    });

    const prefill = process.env.VIM_PI_PREFILL;
    if (prefill && !ctx.ui.getEditorText()) {
      ctx.ui.setEditorText(prefill.replace(/\\n/g, "\n"));
    }
  });

  pi.on("session_shutdown", () => {
    editor?.restoreCursorStyle();
  });

  pi.registerCommand("vim-pi-status", {
    description: "Show vim-pi extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("vim-pi modal editor loaded.", "info");
    },
  });
}
