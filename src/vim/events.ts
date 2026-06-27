/**
 * Core Vim event vocabulary.
 *
 * Everything starts as a key. Printable characters are still keys: the current
 * Vim mode decides whether `a` inserts text or runs the Normal-mode append
 * command. Host-specific paste/IME handling belongs in adapters until we have
 * a Vim-semantics reason to model it here.
 */
export interface VimKeyEvent {
  type: "KEY";
  key: string;
}

export type VimEvent = VimKeyEvent;
