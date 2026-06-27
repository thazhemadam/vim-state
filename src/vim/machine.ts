import { setup } from "xstate";

import {
  MOVE_CURSOR_DOWN,
  MOVE_CURSOR_LEFT,
  MOVE_CURSOR_RIGHT,
  MOVE_CURSOR_UP,
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
    [MOVE_CURSOR_LEFT]: () => {},
    [MOVE_CURSOR_DOWN]: () => {},
    [MOVE_CURSOR_UP]: () => {},
    [MOVE_CURSOR_RIGHT]: () => {},
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
        KEY: [
          {
            guard: { type: "keyIs", params: { key: "i" } },
            target: "insert",
            actions: { type: PLACE_CARET_BEFORE_CURSOR },
          },
          {
            guard: { type: "keyIs", params: { key: "h" } },
            actions: { type: MOVE_CURSOR_LEFT },
          },
          {
            guard: { type: "keyIs", params: { key: "j" } },
            actions: { type: MOVE_CURSOR_DOWN },
          },
          {
            guard: { type: "keyIs", params: { key: "k" } },
            actions: { type: MOVE_CURSOR_UP },
          },
          {
            guard: { type: "keyIs", params: { key: "l" } },
            actions: { type: MOVE_CURSOR_RIGHT },
          },
        ],
      },
    },
  },
});
