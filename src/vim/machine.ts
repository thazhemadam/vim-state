import { setup } from "xstate";

import {
  MOVE_CURSOR_DOWN,
  MOVE_CURSOR_LEFT,
  MOVE_CURSOR_RIGHT,
  INSERT_LINE_ABOVE,
  INSERT_LINE_BELOW,
  MOVE_CURSOR_TO_FIRST_NON_BLANK,
  MOVE_CURSOR_TO_LINE_END,
  MOVE_CURSOR_TO_LINE_START,
  MOVE_CURSOR_UP,
  PLACE_CARET_AFTER_CURSOR,
  PLACE_CARET_AT_FIRST_NON_BLANK,
  PLACE_CARET_AT_LINE_END,
  PLACE_CARET_AT_LINE_START,
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
    [PLACE_CARET_AFTER_CURSOR]: () => {},
    [PLACE_CARET_AT_LINE_END]: () => {},
    [PLACE_CARET_AT_FIRST_NON_BLANK]: () => {},
    [MOVE_CURSOR_LEFT]: () => {},
    [MOVE_CURSOR_DOWN]: () => {},
    [MOVE_CURSOR_UP]: () => {},
    [MOVE_CURSOR_RIGHT]: () => {},
    [MOVE_CURSOR_TO_LINE_START]: () => {},
    [MOVE_CURSOR_TO_LINE_END]: () => {},
    [MOVE_CURSOR_TO_FIRST_NON_BLANK]: () => {},
    [INSERT_LINE_BELOW]: () => {},
    [INSERT_LINE_ABOVE]: () => {},
    [PLACE_CARET_AT_LINE_START]: () => {},
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
            guard: { type: "keyIs", params: { key: "a" } },
            target: "insert",
            actions: { type: PLACE_CARET_AFTER_CURSOR },
          },
          {
            guard: { type: "keyIs", params: { key: "A" } },
            target: "insert",
            actions: { type: PLACE_CARET_AT_LINE_END },
          },
          {
            guard: { type: "keyIs", params: { key: "I" } },
            target: "insert",
            actions: { type: PLACE_CARET_AT_FIRST_NON_BLANK },
          },
          {
            guard: { type: "keyIs", params: { key: "o" } },
            target: "insert",
            actions: [
              { type: INSERT_LINE_BELOW },
              { type: PLACE_CARET_AT_LINE_START },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "O" } },
            target: "insert",
            actions: [
              { type: INSERT_LINE_ABOVE },
              { type: PLACE_CARET_AT_LINE_START },
            ],
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
          {
            guard: { type: "keyIs", params: { key: "0" } },
            actions: { type: MOVE_CURSOR_TO_LINE_START },
          },
          {
            guard: { type: "keyIs", params: { key: "$" } },
            actions: { type: MOVE_CURSOR_TO_LINE_END },
          },
          {
            guard: { type: "keyIs", params: { key: "^" } },
            actions: { type: MOVE_CURSOR_TO_FIRST_NON_BLANK },
          },
        ],
      },
    },
  },
});
