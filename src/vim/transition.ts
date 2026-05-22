import type { VimState } from "./state.js";

/**
 * Pure transition engine placeholder.
 *
 * Eventually this will be the core function:
 *   (state, key, context) -> { state, action? }
 * with no direct dependency on Pi UI classes.
 */
export interface VimTransitionResult {
  state: VimState;
}

export function transition(state: VimState, _key: string): VimTransitionResult {
  return { state };
}
