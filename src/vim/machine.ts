import { assign, setup, type SnapshotFrom } from "xstate";

import { type VimContext, type VimInput } from "./context.js";
import type { VimMotion, VimNoun, VimOperator, VimRegister } from "./editor.js";
import { nounForKey } from "./editor.js";
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
    setOperator: assign({
      operator: ({ context }, params: { name: VimOperator["name"] }) => ({
        name: params.name,
        count: context.count,
      }),
      count: undefined,
    }),
    clearOperator: assign({ operator: undefined }),
    placeCaretAfterCursor: ({ context }) =>
      context.editor.placeCaretAfterCursor(),
    placeCaretAtLineEnd: ({ context }) => context.editor.placeCaretAtLineEnd(),
    move: ({ context }, params: { motion: VimMotion }) =>
      repeat(context, () => context.editor.move(params.motion)),
    moveByEventNoun: ({ context, event }) => {
      const noun = nounForKey(event.key);
      if (!noun || noun === "line") {
        return;
      }
      repeat(context, () => context.editor.move(noun));
    },
    insertLineBelow: ({ context }) => context.editor.insertLineBelow(),
    insertLineAbove: ({ context }) => context.editor.insertLineAbove(),
    placeCaretAtLineStart: ({ context }) =>
      context.editor.placeCaretAtLineStart(),
    applyPendingOperatorToEventNoun: assign({
      register: ({ context, event }) => {
        const noun = nounForKey(event.key, context.operator);
        if (!noun || !context.operator) {
          return context.register;
        }

        const register = deleteForRegister(
          context,
          noun,
          (context.operator.count ?? 1) * (context.count ?? 1),
        );

        // Change enters Insert mode; after c$/C, place the caret after the
        // remaining last character instead of before it.
        if (context.operator.name === "change" && noun === "lineEnd") {
          context.editor.placeCaretAfterCursor();
        }

        return register ?? context.register;
      },
    }),
    delete: assign({
      register: ({ context }, params: { noun: VimNoun }) =>
        deleteForRegister(context, params.noun, context.count ?? 1) ??
        context.register,
    }),
    put: ({ context }, params: { placement: "before" | "after" }) => {
      const register = context.register;
      if (!register) {
        return;
      }
      repeat(context, () => context.editor.put(register, params.placement));
    },
    replaceCharUnderCursor: ({ context }, params: { char: string }) =>
      context.editor.replaceCharUnderCursor(params.char),
  },
  guards: {
    keyIs: ({ event }, params: { key: string }) => event.key === params.key,
    keyIsPrintable: ({ event }) =>
      Array.from(event.key).length === 1 && event.key >= " ",
    keyExtendsCount: ({ context, event }) =>
      /^[1-9]$/.test(event.key) ||
      (event.key === "0" && context.count !== undefined),
    keyIsMotionNoun: ({ event }) => nounForKey(event.key) !== undefined,
    keyIsOperatorNoun: (
      { context, event },
      params: { name: VimOperator["name"] },
    ) =>
      context.operator?.name === params.name &&
      nounForKey(event.key, context.operator) !== undefined,
  },
}).createMachine({
  id: "vim-pi",
  context: ({ input }) => ({
    editor: input.editor,
    count: undefined,
    operator: undefined,
    register: undefined,
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
            actions: ({ context }) => context.editor.delete("right"),
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
            guard: { type: "keyExtendsCount" },
            actions: { type: "appendCount" },
          },
          {
            guard: { type: "keyIsOperatorNoun", params: { name: "change" } },
            target: "insert",
            actions: [
              { type: "applyPendingOperatorToEventNoun" },
              { type: "clearOperator" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIsOperatorNoun", params: { name: "delete" } },
            target: "normal",
            actions: [
              { type: "applyPendingOperatorToEventNoun" },
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
            guard: { type: "keyExtendsCount" },
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
            actions: { type: "setOperator", params: { name: "delete" } },
          },
          {
            guard: { type: "keyIs", params: { key: "c" } },
            target: "operator-pending",
            actions: { type: "setOperator", params: { name: "change" } },
          },
          {
            guard: { type: "keyIs", params: { key: "C" } },
            target: "insert",
            actions: [
              { type: "delete", params: { noun: "lineEnd" } },
              { type: "placeCaretAfterCursor" },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "D" } },
            actions: [
              { type: "delete", params: { noun: "lineEnd" } },
              { type: "clearCount" },
            ],
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
            guard: { type: "keyIsMotionNoun" },
            actions: [{ type: "moveByEventNoun" }, { type: "clearCount" }],
          },
          {
            guard: { type: "keyIs", params: { key: "x" } },
            actions: [
              { type: "delete", params: { noun: "right" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "X" } },
            actions: [
              { type: "delete", params: { noun: "left" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "p" } },
            actions: [
              { type: "put", params: { placement: "after" } },
              { type: "clearCount" },
            ],
          },
          {
            guard: { type: "keyIs", params: { key: "P" } },
            actions: [
              { type: "put", params: { placement: "before" } },
              { type: "clearCount" },
            ],
          },
          { actions: { type: "clearCount" } },
        ],
      },
    },
  },
});

/** Run an action according to the current Normal-mode count. */
function repeat(context: VimContext, action: () => void): void {
  for (let i = 0; i < (context.count ?? 1); ++i) {
    action();
  }
}

/** Apply a repeated delete and combine the removed text into one register payload. */
function deleteForRegister(
  context: VimContext,
  noun: VimNoun,
  count: number,
): VimRegister | undefined {
  let register: VimRegister | undefined;
  for (let i = 0; i < count; ++i) {
    const deleted = context.editor.delete(noun);
    if (!deleted) {
      continue;
    }
    register = appendRegister(register, deleted, noun);
  }
  return register;
}

/** Append repeated delete payloads in buffer order, including backward motions. */
function appendRegister(
  register: VimRegister | undefined,
  deleted: VimRegister,
  noun: VimNoun,
): VimRegister {
  if (!register) {
    return deleted;
  }
  return {
    type: deleted.type,
    text: deletesBackward(noun)
      ? deleted.text + register.text
      : register.text + deleted.text,
  };
}

/** Return true when repeated deletes walk backward through the buffer. */
function deletesBackward(noun: VimNoun): boolean {
  return noun === "left" || noun === "previousWord" || noun === "up";
}

export type VimSnapshot = SnapshotFrom<typeof vimMachine>;
