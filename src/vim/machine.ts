import { setup, type SnapshotFrom } from "xstate";

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
    placeCaretAfterCursor: ({ context }) =>
      context.editor.placeCaretAfterCursor(),
    placeCaretAtLineEnd: ({ context }) => context.editor.placeCaretAtLineEnd(),
    moveCursorLeft: ({ context }) => context.editor.moveCursorLeft(),
    moveCursorDown: ({ context }) => context.editor.moveCursorDown(),
    moveCursorUp: ({ context }) => context.editor.moveCursorUp(),
    moveCursorRight: ({ context }) => context.editor.moveCursorRight(),
    moveCursorToLineStart: ({ context }) =>
      context.editor.moveCursorToLineStart(),
    moveCursorToLineEnd: ({ context }) => context.editor.moveCursorToLineEnd(),
    moveCursorToFirstNonBlank: ({ context }) =>
      context.editor.moveCursorToFirstNonBlank(),
    insertLineBelow: ({ context }) => context.editor.insertLineBelow(),
    insertLineAbove: ({ context }) => context.editor.insertLineAbove(),
    placeCaretAtLineStart: ({ context }) =>
      context.editor.placeCaretAtLineStart(),
    deleteCharUnderCursor: ({ context }) =>
      context.editor.deleteCharUnderCursor(),
    deleteCharBeforeCursor: ({ context }) =>
      context.editor.deleteCharBeforeCursor(),
    clampCursorColumn: ({ context }) => context.editor.clampCursorColumn(),
  },
  guards: {
    keyIs: ({ event }, params: { key: string }) => event.key === params.key,
  },
}).createMachine({
  id: "vim-pi",
  context: ({ input }) => ({ editor: input.editor }),
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
    normal: {
      on: {
        KEY: [
          {
            guard: { type: "keyIs", params: { key: "i" } },
            target: "insert",
          },
          {
            guard: { type: "keyIs", params: { key: "a" } },
            target: "insert",
            actions: { type: "placeCaretAfterCursor" },
          },
          {
            guard: { type: "keyIs", params: { key: "A" } },
            target: "insert",
            actions: { type: "placeCaretAtLineEnd" },
          },
          {
            guard: { type: "keyIs", params: { key: "I" } },
            target: "insert",
            actions: { type: "moveCursorToFirstNonBlank" },
          },
          {
            guard: { type: "keyIs", params: { key: "o" } },
            target: "insert",
            actions: [
              { type: "insertLineBelow" },
              { type: "placeCaretAtLineStart" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "O" } },
            target: "insert",
            actions: [
              { type: "insertLineAbove" },
              { type: "placeCaretAtLineStart" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "h" } },
            actions: { type: "moveCursorLeft" },
          },
          {
            guard: { type: "keyIs", params: { key: "j" } },
            actions: { type: "moveCursorDown" },
          },
          {
            guard: { type: "keyIs", params: { key: "k" } },
            actions: { type: "moveCursorUp" },
          },
          {
            guard: { type: "keyIs", params: { key: "l" } },
            actions: { type: "moveCursorRight" },
          },
          {
            guard: { type: "keyIs", params: { key: "0" } },
            actions: { type: "moveCursorToLineStart" },
          },
          {
            guard: { type: "keyIs", params: { key: "$" } },
            actions: { type: "moveCursorToLineEnd" },
          },
          {
            guard: { type: "keyIs", params: { key: "^" } },
            actions: { type: "moveCursorToFirstNonBlank" },
          },
          {
            guard: { type: "keyIs", params: { key: "_" } },
            actions: { type: "moveCursorToFirstNonBlank" },
          },
          {
            guard: { type: "keyIs", params: { key: "x" } },
            actions: [
              { type: "deleteCharUnderCursor" },
              { type: "clampCursorColumn" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "X" } },
            actions: [
              { type: "deleteCharBeforeCursor" },
              { type: "moveCursorLeft" },
            ],
          },
        ],
      },
    },
  },
});

export type VimSnapshot = SnapshotFrom<typeof vimMachine>;
