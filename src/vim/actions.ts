/**
 * Editor actions emitted by terminal Vim FSM states.
 *
 * Pi adapter code will translate these pure actions into CustomEditor buffer
 * mutations. Keeping actions separate from transitions lets us test semantics
 * without running Pi's TUI.
 */
export type VimAction =
  | { type: "noop" }
  | { type: "enter-insert" }
  | { type: "enter-normal" };
