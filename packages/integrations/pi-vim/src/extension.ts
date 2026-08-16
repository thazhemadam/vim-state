import {
  copyToClipboard,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import type { VimEditorOptions } from "vim-state";
import { VimPiEditor } from "./editor.js";

export default function vimPiExtension(pi: ExtensionAPI): void {
  const piVimSystemClipboardFlag = "pi-vim-system-clipboard";

  /** Build opt-in Vim hooks from Pi flags; by default, registers stay Vim-local. */
  function vimOptions(): VimEditorOptions {
    const useSystemClipboard = pi.getFlag(piVimSystemClipboardFlag);
    const onUnnamedRegisterWrite = ({ text }: { text: string }) =>
      void copyToClipboard(text).catch(() => undefined);
    return useSystemClipboard ? { onUnnamedRegisterWrite } : {};
  }

  pi.registerFlag(piVimSystemClipboardFlag, {
    description: "Mirror Vim's unnamed register to the system clipboard",
    type: "boolean",
    default: true,
  });

  let editor: VimPiEditor | undefined;

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      editor = new VimPiEditor(tui, theme, keybindings, vimOptions());
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

  pi.registerCommand("pi-vim-status", {
    description: "Show pi-vim extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pi-vim extension loaded.", "info");
    },
  });
}
