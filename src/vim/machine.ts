import { assign, setup, type SnapshotFrom } from "xstate";

import { type VimContext, type VimInput, type VimOperator } from "./context.js";
import type { VimDeleteTarget, VimMotion } from "./editor.js";
import type { VimEvent } from "./events.js";
import { initialVimMode } from "./state.js";

export const vimMachine = setup({
  types: {
    context: {} as VimContext,
    events: {} as VimEvent,
    input: {} as VimInput,
  },
  actions: {
    appendCount: assign({
      count: ({ context, event }) =>
        (context.count ?? 0) * 10 + Number(event.key),
    }),
    clearCount: assign({ count: undefined }),
    setDeleteOperator: assign({ pendingOperator: "delete" }),
    clearOperator: assign({ pendingOperator: undefined }),
    placeCaretAfterCursor: ({ context }) =>
      context.editor.placeCaretAfterCursor(),
    placeCaretAtLineEnd: ({ context }) => context.editor.placeCaretAtLineEnd(),
    move: ({ context }, params: { motion: VimMotion }) =>
      repeat(context, () => context.editor.move(params.motion)),
    insertLineBelow: ({ context }) => context.editor.insertLineBelow(),
    insertLineAbove: ({ context }) => context.editor.insertLineAbove(),
    placeCaretAtLineStart: ({ context }) =>
      context.editor.placeCaretAtLineStart(),
    delete: ({ context }, params: { target: VimDeleteTarget }) =>
      repeat(context, () => context.editor.delete(params.target)),
    replaceCharUnderCursor: ({ context }, params: { char: string }) =>
      context.editor.replaceCharUnderCursor(params.char),
    clampCursorColumn: ({ context }) => context.editor.clampCursorColumn(),
  },
  guards: {
    keyIs: ({ event }, params: { key: string }) => event.key === params.key,
    keyIsPrintable: ({ event }) =>
      Array.from(event.key).length === 1 && event.key >= " ",
    keyIsCountDigit: ({ event }) => /^[1-9]$/.test(event.key),
    keyIsZeroWithCount: ({ context, event }) =>
      event.key === "0" && context.count !== undefined,
    pendingOperatorKeyIs: (
      { context, event },
      params: { operator: VimOperator; key: string },
    ) =>
      context.pendingOperator === params.operator && event.key === params.key,
  },
}).createMachine({
  id: "vim-pi",
  context: ({ input }) => ({
    editor: input.editor,
    count: undefined,
    pendingOperator: undefined,
  }),
  initial: initialVimMode,
  states: {
    insert: {
      on: {
        KEY: {
          guard: { type: "keyIs", params: { key: "escape" } },
          target: "normal",
          actions: { type: "move", params: { motion: "left" } },
        },
      },
    },
    replace: {
      on: {
        KEY: [
          {
            guard: { type: "keyIs", params: { key: "escape" } },
            target: "normal",
            actions: { type: "move", params: { motion: "left" } },
          },
          {
            guard: { type: "keyIsPrintable" },
            actions: { type: "delete", params: { target: "charUnderCursor" } },
          },
        ],
      },
    },
    "replace-once": {
      on: {
        KEY: [
          {
            guard: { type: "keyIs", params: { key: "escape" } },
            target: "normal",
          },
          {
            guard: { type: "keyIsPrintable" },
            target: "normal",
            actions: {
              type: "replaceCharUnderCursor",
              params: ({ event }) => ({ char: event.key }),
            },
          },
          { target: "normal" },
        ],
      },
    },
    "operator-pending": {
      on: {
        KEY: [
          {
            guard: { type: "keyIs", params: { key: "escape" } },
            target: "normal",
            actions: [{ type: "clearOperator" }, { type: "clearCount" }],
          },
          {
            guard: {
              type: "pendingOperatorKeyIs",
              params: { operator: "delete", key: "w" },
            },
            target: "normal",
            actions: [
              { type: "delete", params: { target: "nextWord" } },
              { type: "clearOperator" },
              { type: "clearCount" },
            ],
          },
          {
            guard: {
              type: "pendingOperatorKeyIs",
              params: { operator: "delete", key: "$" },
            },
            target: "normal",
            actions: [
              { type: "delete", params: { target: "lineEnd" } },
              { type: "clearOperator" },
              { type: "clearCount" },
            ],
          },
          {
            guard: {
              type: "pendingOperatorKeyIs",
              params: { operator: "delete", key: "d" },
            },
            target: "normal",
            actions: [
              { type: "delete", params: { target: "line" } },
              { type: "clearOperator" },
              { type: "clearCount" },
            ],
          },
          {
            target: "normal",
            actions: [{ type: "clearOperator" }, { type: "clearCount" }],
          },
        ],
      },
    },
    normal: {
      on: {
        KEY: [
          {
            guard: { type: "keyIsCountDigit" },
            actions: { type: "appendCount" },
          },
          {
            guard: { type: "keyIsZeroWithCount" },
            actions: { type: "appendCount" },
          },
          {
            guard: { type: "keyIs", params: { key: "i" } },
            target: "insert",
            actions: { type: "clearCount" },
          },
          {
            guard: { type: "keyIs", params: { key: "a" } },
            target: "insert",
            actions: [
              { type: "placeCaretAfterCursor" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "A" } },
            target: "insert",
            actions: [{ type: "placeCaretAtLineEnd" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "I" } },
            target: "insert",
            actions: [
              { type: "move", params: { motion: "firstNonBlank" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "R" } },
            target: "replace",
            actions: { type: "clearCount" },
          },
          {
            guard: { type: "keyIs", params: { key: "r" } },
            target: "replace-once",
            actions: { type: "clearCount" },
          },
          {
            guard: { type: "keyIs", params: { key: "d" } },
            target: "operator-pending",
            actions: { type: "setDeleteOperator" },
          },
          {
            guard: { type: "keyIs", params: { key: "o" } },
            target: "insert",
            actions: [
              { type: "insertLineBelow" },
              { type: "placeCaretAtLineStart" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "O" } },
            target: "insert",
            actions: [
              { type: "insertLineAbove" },
              { type: "placeCaretAtLineStart" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "h" } },
            actions: [
              { type: "move", params: { motion: "left" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "j" } },
            actions: [
              { type: "move", params: { motion: "down" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "k" } },
            actions: [
              { type: "move", params: { motion: "up" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "l" } },
            actions: [
              { type: "move", params: { motion: "right" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "0" } },
            actions: [
              { type: "move", params: { motion: "lineStart" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "$" } },
            actions: [
              { type: "move", params: { motion: "lineEnd" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "^" } },
            actions: [
              { type: "move", params: { motion: "firstNonBlank" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "_" } },
            actions: [
              { type: "move", params: { motion: "firstNonBlank" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "w" } },
            actions: [
              { type: "move", params: { motion: "nextWord" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "b" } },
            actions: [
              { type: "move", params: { motion: "previousWord" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "e" } },
            actions: [
              { type: "move", params: { motion: "endOfWord" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "x" } },
            actions: [
              { type: "delete", params: { target: "charUnderCursor" } },
              { type: "clampCursorColumn" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "X" } },
            actions: [
              { type: "delete", params: { target: "charBeforeCursor" } },
              { type: "clearCount" },
            ],
          },
          { actions: { type: "clearCount" } },
        ],
      },
    },
  },
});

function repeat(context: VimContext, action: () => void): void {
  for (let i = 0; i < (context.count ?? 1); ++i) {
    action();
  }
}

export type VimSnapshot = SnapshotFrom<typeof vimMachine>;
