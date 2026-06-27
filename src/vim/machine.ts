import { setup } from "xstate";

import {
  PLACE_CARET_BEFORE_CURSOR,
  PLACE_CURSOR_ON_PREVIOUS_CHARACTER,
} from "./actions.js";
import { initialVimContext, type VimContext } from "./context.js";
import type { VimEvent } from "./events.js";
import { initialVimMode } from "./state.js";

export const vimMachine = setup({
  types: {
    context: {} as VimContext,
    events: {} as VimEvent,
  },
  actions: {
    [PLACE_CURSOR_ON_PREVIOUS_CHARACTER]: () => {},
    [PLACE_CARET_BEFORE_CURSOR]: () => {},
  },
  guards: {
    keyIs: ({ event }, params: { key: string }) => event.key === params.key,
  },
}).createMachine({
  id: "vim-pi",
  context: initialVimContext,
  initial: initialVimMode,
  states: {
    insert: {
      on: {
        KEY: {
          guard: { type: "keyIs", params: { key: "escape" } },
          target: "normal",
          actions: { type: PLACE_CURSOR_ON_PREVIOUS_CHARACTER },
        },
      },
    },
    normal: {
      on: {
        KEY: {
          guard: { type: "keyIs", params: { key: "i" } },
          target: "insert",
          actions: { type: PLACE_CARET_BEFORE_CURSOR },
        },
      },
    },
  },
});
