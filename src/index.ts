import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Pi extension entrypoint.
 *
 * The Vim modal editor itself will live under src/vim/ and will be wired into
 * Pi's CustomEditor API from this module once the transition engine exists.
 */
export default function vimPiExtension(pi: ExtensionAPI): void {
  pi.registerCommand("vim-pi-status", {
    description: "Show vim-pi extension status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("vim-pi scaffold loaded; modal editor not implemented yet.", "info");
    },
  });
}
