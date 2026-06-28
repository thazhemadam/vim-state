import { assign, setup, type SnapshotFrom } from "xstate";

import { type VimContext, type VimInput } from "./context.js";
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
    placeCaretAfterCursor: ({ context }) =>
      context.editor.placeCaretAfterCursor(),
    placeCaretAtLineEnd: ({ context }) => context.editor.placeCaretAtLineEnd(),
    moveCursorLeft: ({ context }) =>
      repeat(context, () => context.editor.moveCursorLeft()),
    moveCursorDown: ({ context }) =>
      repeat(context, () => context.editor.moveCursorDown()),
    moveCursorUp: ({ context }) =>
      repeat(context, () => context.editor.moveCursorUp()),
    moveCursorRight: ({ context }) =>
      repeat(context, () => context.editor.moveCursorRight()),
    moveCursorToLineStart: ({ context }) =>
      context.editor.moveCursorToLineStart(),
    moveCursorToLineEnd: ({ context }) =>
      repeat(context, () => context.editor.moveCursorToLineEnd()),
    moveCursorToFirstNonBlank: ({ context }) =>
      repeat(context, () => context.editor.moveCursorToFirstNonBlank()),
    moveCursorToNextWord: ({ context }) =>
      repeat(context, () => context.editor.moveCursorToNextWord()),
    moveCursorToPreviousWord: ({ context }) =>
      repeat(context, () => context.editor.moveCursorToPreviousWord()),
    moveCursorToEndOfWord: ({ context }) =>
      repeat(context, () => context.editor.moveCursorToEndOfWord()),
    insertLineBelow: ({ context }) => context.editor.insertLineBelow(),
    insertLineAbove: ({ context }) => context.editor.insertLineAbove(),
    placeCaretAtLineStart: ({ context }) =>
      context.editor.placeCaretAtLineStart(),
    deleteCharUnderCursor: ({ context }) =>
      repeat(context, () => context.editor.deleteCharUnderCursor()),
    deleteCharBeforeCursor: ({ context }) =>
      repeat(context, () => context.editor.deleteCharBeforeCursor()),
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
  },
}).createMachine({
  id: "vim-pi",
  context: ({ input }) => ({ editor: input.editor, count: undefined }),
  initial: initialVimMode,
  states: {
    insert: {
      on: {
        KEY: {
          guard: { type: "keyIs", params: { key: "escape" } },
          target: "normal",
          actions: { type: "moveCursorLeft" },
        },
      },
    },
    replace: {
      on: {
        KEY: [
          {
            guard: { type: "keyIs", params: { key: "escape" } },
            target: "normal",
            actions: { type: "moveCursorLeft" },
          },
          {
            guard: { type: "keyIsPrintable" },
            actions: { type: "deleteCharUnderCursor" },
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
              { type: "moveCursorToFirstNonBlank" },
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
            actions: [{ type: "moveCursorLeft" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "j" } },
            actions: [{ type: "moveCursorDown" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "k" } },
            actions: [{ type: "moveCursorUp" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "l" } },
            actions: [{ type: "moveCursorRight" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "0" } },
            actions: [
              { type: "moveCursorToLineStart" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "$" } },
            actions: [{ type: "moveCursorToLineEnd" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "^" } },
            actions: [
              { type: "moveCursorToFirstNonBlank" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "_" } },
            actions: [
              { type: "moveCursorToFirstNonBlank" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "w" } },
            actions: [{ type: "moveCursorToNextWord" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "b" } },
            actions: [
              { type: "moveCursorToPreviousWord" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "e" } },
            actions: [
              { type: "moveCursorToEndOfWord" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "x" } },
            actions: [
              { type: "deleteCharUnderCursor" },
              { type: "clampCursorColumn" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "X" } },
            actions: [
              { type: "deleteCharBeforeCursor" },
              { type: "moveCursorLeft" },
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
