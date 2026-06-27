import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { VimPiEditor } from "./editor.js";

export default function vimPiExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new VimPiEditor(tui, theme, keybindings));
  });

  pi.registerCommand("vim-pi-status", {
    description: "Show vim-pi extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("vim-pi modal editor loaded.", "info");
    },
  });
}
