import assert from "node:assert/strict";
import test from "node:test";

import vimPiExtension, { VimPiEditor } from "../src/index.js";
import { matchesKey } from "@earendil-works/pi-tui";

import { createActor } from "xstate";

import { normalizePiKey } from "../src/adapters/pi/keymap.js";
import type { VimEditor } from "../src/vim/editor.js";
import { vimMachine } from "../src/vim/machine.js";
import { getVimMode } from "../src/vim/selectors.js";

function createVimCore(calls: string[] = []) {
  const editor: VimEditor = {
    placeCaretAfterCursor: () => calls.push("placeCaretAfterCursor"),
    placeCaretAtLineEnd: () => calls.push("placeCaretAtLineEnd"),
    moveCursorLeft: () => calls.push("moveCursorLeft"),
    moveCursorDown: () => calls.push("moveCursorDown"),
    moveCursorUp: () => calls.push("moveCursorUp"),
    moveCursorRight: () => calls.push("moveCursorRight"),
    moveCursorToLineStart: () => calls.push("moveCursorToLineStart"),
    moveCursorToLineEnd: () => calls.push("moveCursorToLineEnd"),
    moveCursorToFirstNonBlank: () => calls.push("moveCursorToFirstNonBlank"),
    insertLineBelow: () => calls.push("insertLineBelow"),
    insertLineAbove: () => calls.push("insertLineAbove"),
    placeCaretAtLineStart: () => calls.push("placeCaretAtLineStart"),
    deleteCharUnderCursor: () => calls.push("deleteCharUnderCursor"),
    deleteCharBeforeCursor: () => calls.push("deleteCharBeforeCursor"),
    replaceCharUnderCursor: (char) =>
      calls.push(`replaceCharUnderCursor:${char}`),
    clampCursorColumn: () => calls.push("clampCursorColumn"),
  };

  return createActor(vimMachine, { input: { editor } }).start();
}

test("Vim core switches between insert and normal", () => {
  const calls: string[] = [];
  const actor = createVimCore(calls);
  assert.equal(getVimMode(actor.getSnapshot()), "insert");
  assert.deepEqual(calls, []);

  actor.send({ type: "KEY", key: "escape" });
  assert.equal(getVimMode(actor.getSnapshot()), "normal");
  assert.deepEqual(calls, ["moveCursorLeft"]);

  const valueBeforeNoop = actor.getSnapshot().value;
  actor.send({ type: "KEY", key: "escape" });
  assert.equal(actor.getSnapshot().value, valueBeforeNoop);
  assert.deepEqual(calls, ["moveCursorLeft"]);

  actor.send({ type: "KEY", key: "i" });
  assert.equal(getVimMode(actor.getSnapshot()), "insert");
  assert.deepEqual(calls, ["moveCursorLeft"]);
});

test("Vim core calls Normal-mode insert-entry editor methods", () => {
  for (const [key, expectedCalls] of [
    ["a", ["placeCaretAfterCursor"]],
    ["A", ["placeCaretAtLineEnd"]],
    ["I", ["moveCursorToFirstNonBlank"]],
    ["o", ["insertLineBelow", "placeCaretAtLineStart"]],
    ["O", ["insertLineAbove", "placeCaretAtLineStart"]],
  ] as const) {
    const calls: string[] = [];
    const actor = createVimCore(calls);
    actor.send({ type: "KEY", key: "escape" });
    calls.length = 0;

    actor.send({ type: "KEY", key });
    assert.equal(getVimMode(actor.getSnapshot()), "insert");
    assert.deepEqual(calls, expectedCalls);
  }
});

test("Vim core calls Normal-mode cursor editor methods", () => {
  const calls: string[] = [];
  const actor = createVimCore(calls);
  actor.send({ type: "KEY", key: "escape" });

  for (const [key, expectedCall] of [
    ["h", "moveCursorLeft"],
    ["j", "moveCursorDown"],
    ["k", "moveCursorUp"],
    ["l", "moveCursorRight"],
    ["0", "moveCursorToLineStart"],
    ["$", "moveCursorToLineEnd"],
    ["^", "moveCursorToFirstNonBlank"],
    ["_", "moveCursorToFirstNonBlank"],
  ] as const) {
    calls.length = 0;
    actor.send({ type: "KEY", key });
    assert.equal(getVimMode(actor.getSnapshot()), "normal");
    assert.deepEqual(calls, [expectedCall]);
  }
});

test("Vim core calls Normal-mode character deletion editor methods", () => {
  const calls: string[] = [];
  const actor = createVimCore(calls);
  actor.send({ type: "KEY", key: "escape" });
  calls.length = 0;

  actor.send({ type: "KEY", key: "x" });
  assert.equal(getVimMode(actor.getSnapshot()), "normal");
  assert.deepEqual(calls, ["deleteCharUnderCursor", "clampCursorColumn"]);

  calls.length = 0;
  actor.send({ type: "KEY", key: "X" });
  assert.equal(getVimMode(actor.getSnapshot()), "normal");
  assert.deepEqual(calls, ["deleteCharBeforeCursor", "moveCursorLeft"]);
});

test("Vim core enters Replace mode and deletes under printable keys", () => {
  const calls: string[] = [];
  const actor = createVimCore(calls);
  actor.send({ type: "KEY", key: "escape" });
  actor.send({ type: "KEY", key: "R" });
  assert.equal(getVimMode(actor.getSnapshot()), "replace");
  assert.deepEqual(calls, ["moveCursorLeft"]);

  calls.length = 0;
  actor.send({ type: "KEY", key: "X" });
  assert.equal(getVimMode(actor.getSnapshot()), "replace");
  assert.deepEqual(calls, ["deleteCharUnderCursor"]);

  calls.length = 0;
  actor.send({ type: "KEY", key: "escape" });
  assert.equal(getVimMode(actor.getSnapshot()), "normal");
  assert.deepEqual(calls, ["moveCursorLeft"]);
});

test("Vim core applies Normal-mode r as one-shot replace", () => {
  const calls: string[] = [];
  const actor = createVimCore(calls);
  actor.send({ type: "KEY", key: "escape" });
  calls.length = 0;

  actor.send({ type: "KEY", key: "r" });
  assert.equal(getVimMode(actor.getSnapshot()), "normal");
  assert.deepEqual(calls, []);

  actor.send({ type: "KEY", key: "X" });
  assert.equal(getVimMode(actor.getSnapshot()), "normal");
  assert.deepEqual(calls, ["replaceCharUnderCursor:X"]);
});

test("Pi keymap normalizes raw input into Vim keys", () => {
  assert.equal(normalizePiKey("\x1b"), "escape");
  assert.equal(normalizePiKey("i"), "i");
  assert.equal(normalizePiKey("\x1b[99;5u"), "ctrl+c");
});

test("Pi extension installs a Vim editor", () => {
  let installedFactory: unknown;
  vimPiExtension({
    on: (event: string, handler: unknown) => {
      if (event === "session_start") {
        (handler as (event: unknown, ctx: unknown) => void)(undefined, {
          ui: {
            setEditorComponent: (factory: unknown) =>
              (installedFactory = factory),
          },
        });
      }
    },
    registerCommand: () => {},
  } as never);

  assert.equal(typeof installedFactory, "function");
});

test("VimPiEditor applies Normal-mode hjkl navigation", () => {
  const editor = createEditor();

  for (const key of ["a", "b", "c", "\x1b", "l"]) editor.handleInput(key);
  assert.deepEqual(editor.getCursor(), { line: 0, col: 2 });

  for (const key of ["h", "h", "h", "l"]) editor.handleInput(key);
  assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
  editor.handleInput("$");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 2 });
  editor.handleInput("0");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });

  const firstNonBlankEditor = createEditor();
  firstNonBlankEditor.setText("  abc");
  firstNonBlankEditor.handleInput("\x1b");
  firstNonBlankEditor.handleInput("^");
  assert.deepEqual(firstNonBlankEditor.getCursor(), { line: 0, col: 2 });
  firstNonBlankEditor.handleInput("0");
  firstNonBlankEditor.handleInput("_");
  assert.deepEqual(firstNonBlankEditor.getCursor(), { line: 0, col: 2 });

  const verticalEditor = createEditor();
  verticalEditor.setText("hello\nworld");
  verticalEditor.handleInput("\x1b");
  verticalEditor.handleInput("0");
  for (const key of ["l", "l", "l"]) verticalEditor.handleInput(key);
  assert.deepEqual(verticalEditor.getCursor(), { line: 1, col: 3 });
  verticalEditor.handleInput("k");
  assert.deepEqual(verticalEditor.getCursor(), { line: 0, col: 3 });
  verticalEditor.handleInput("k");
  assert.deepEqual(verticalEditor.getCursor(), { line: 0, col: 3 });
  verticalEditor.handleInput("j");
  assert.deepEqual(verticalEditor.getCursor(), { line: 1, col: 3 });
  verticalEditor.handleInput("j");
  assert.deepEqual(verticalEditor.getCursor(), { line: 1, col: 3 });

  const shortLineEditor = createEditor();
  shortLineEditor.setText("x\nhello");
  shortLineEditor.handleInput("\x1b");
  assert.deepEqual(shortLineEditor.getCursor(), { line: 1, col: 4 });
  shortLineEditor.handleInput("k");
  assert.deepEqual(shortLineEditor.getCursor(), { line: 0, col: 0 });

  const horizontalBoundaryEditor = createEditor();
  horizontalBoundaryEditor.setText("ab\ncd");
  horizontalBoundaryEditor.handleInput("\x1b");
  assert.deepEqual(horizontalBoundaryEditor.getCursor(), { line: 1, col: 1 });
  horizontalBoundaryEditor.handleInput("l");
  assert.deepEqual(horizontalBoundaryEditor.getCursor(), { line: 1, col: 1 });
  horizontalBoundaryEditor.handleInput("0");
  horizontalBoundaryEditor.handleInput("h");
  assert.deepEqual(horizontalBoundaryEditor.getCursor(), { line: 1, col: 0 });
  horizontalBoundaryEditor.handleInput("k");
  horizontalBoundaryEditor.handleInput("l");
  assert.deepEqual(horizontalBoundaryEditor.getCursor(), { line: 0, col: 1 });
  horizontalBoundaryEditor.handleInput("l");
  assert.deepEqual(horizontalBoundaryEditor.getCursor(), { line: 0, col: 1 });
});

test("VimPiEditor passes configured app shortcuts through in Normal mode", () => {
  let interrupted = false;
  let cleared = false;
  const editor = createEditor(
    [],
    (data, action) =>
      (action === "app.interrupt" && matchesKey(data, "escape")) ||
      (action === "app.clear" && matchesKey(data, "ctrl+c")),
  );
  editor.onEscape = () => {
    interrupted = true;
  };
  editor.onAction("app.clear", () => {
    cleared = true;
  });

  editor.handleInput("\x1b");
  editor.handleInput("\x1b");
  editor.handleInput("\x1b[99;5u");
  editor.handleInput("\x17");

  assert.equal(interrupted, true);
  assert.equal(cleared, true);
  assert.equal(editor.getText(), "");
});

test("VimPiEditor applies Normal-mode a A I insert entry", () => {
  const appendEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "a", "X"])
    appendEditor.handleInput(key);
  assert.equal(appendEditor.getText(), "abcX");
  assert.deepEqual(appendEditor.getCursor(), { line: 0, col: 4 });

  const lineEndEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "h", "A", "X"])
    lineEndEditor.handleInput(key);
  assert.equal(lineEndEditor.getText(), "abcX");
  assert.deepEqual(lineEndEditor.getCursor(), { line: 0, col: 4 });

  const firstNonBlankEditor = createEditor();
  firstNonBlankEditor.setText("  abc");
  firstNonBlankEditor.handleInput("\x1b");
  firstNonBlankEditor.handleInput("I");
  firstNonBlankEditor.handleInput("X");
  assert.equal(firstNonBlankEditor.getText(), "  Xabc");
  assert.deepEqual(firstNonBlankEditor.getCursor(), { line: 0, col: 3 });
});

test("VimPiEditor applies Normal-mode o O open-line insert entry", () => {
  const belowEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "o", "X"])
    belowEditor.handleInput(key);
  assert.equal(belowEditor.getText(), "abc\nX");
  assert.deepEqual(belowEditor.getCursor(), { line: 1, col: 1 });
  assert.equal(getVimMode(belowEditor.vimSnapshot), "insert");

  const aboveEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "O", "X"])
    aboveEditor.handleInput(key);
  assert.equal(aboveEditor.getText(), "X\nabc");
  assert.deepEqual(aboveEditor.getCursor(), { line: 0, col: 1 });
  assert.equal(getVimMode(aboveEditor.vimSnapshot), "insert");
});

test("VimPiEditor applies Normal-mode R replace entry", () => {
  const editor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "0", "R", "X", "Y"])
    editor.handleInput(key);

  assert.equal(editor.getText(), "XYc");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 2 });
  assert.equal(getVimMode(editor.vimSnapshot), "replace");
  assert.match(editor.render(40).at(-1) ?? "", /-- REPLACE --$/);

  editor.handleInput("\x1b");
  assert.equal(getVimMode(editor.vimSnapshot), "normal");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
});

test("VimPiEditor applies Normal-mode r one-shot replace", () => {
  const editor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "0", "l", "r", "X"])
    editor.handleInput(key);

  assert.equal(editor.getText(), "aXc");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
  assert.equal(getVimMode(editor.vimSnapshot), "normal");
});

test("VimPiEditor delegates insert input and ignores unmapped normal printable keys", () => {
  const editor = createEditor();

  for (const key of ["a", "b", "c", "\x1b", "q", "y", "z", "i", "X"])
    editor.handleInput(key);

  assert.equal(editor.getText(), "abXc");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 3 });
  assert.equal(getVimMode(editor.vimSnapshot), "insert");
  assert.match(editor.render(40).at(-1) ?? "", /-- INSERT --$/);
});

test("VimPiEditor applies Normal-mode x X character deletion", () => {
  const deleteUnderEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "h", "x"])
    deleteUnderEditor.handleInput(key);
  assert.equal(deleteUnderEditor.getText(), "ac");
  assert.deepEqual(deleteUnderEditor.getCursor(), { line: 0, col: 1 });

  const deleteLastEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "x"])
    deleteLastEditor.handleInput(key);
  assert.equal(deleteLastEditor.getText(), "ab");
  assert.deepEqual(deleteLastEditor.getCursor(), { line: 0, col: 1 });

  const deleteBeforeEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "X"])
    deleteBeforeEditor.handleInput(key);
  assert.equal(deleteBeforeEditor.getText(), "ac");
  assert.deepEqual(deleteBeforeEditor.getCursor(), { line: 0, col: 1 });

  const lineStartEditor = createEditor();
  for (const key of ["a", "b", "c", "\x1b", "0", "X"])
    lineStartEditor.handleInput(key);
  assert.equal(lineStartEditor.getText(), "abc");
  assert.deepEqual(lineStartEditor.getCursor(), { line: 0, col: 0 });

  const emptyLineEditor = createEditor();
  emptyLineEditor.setText("");
  emptyLineEditor.handleInput("\x1b");
  emptyLineEditor.handleInput("x");
  emptyLineEditor.handleInput("X");
  assert.equal(emptyLineEditor.getText(), "");
  assert.deepEqual(emptyLineEditor.getCursor(), { line: 0, col: 0 });
});

test("VimPiEditor uses hardware bar cursor in insert and fake block cursor in normal", () => {
  const writes: string[] = [];
  const editor = createEditor(writes);

  assert.deepEqual(writes, ["\x1b[6 q"]);

  for (const key of ["a", "b", "c"]) editor.handleInput(key);
  const insertRender = editor.render(40).join("\n");
  assert.doesNotMatch(insertRender, /│/);
  assert.doesNotMatch(insertRender, /\x1b\[7m/);

  editor.handleInput("\x1b");
  assert.deepEqual(writes, ["\x1b[6 q", "\x1b[2 q"]);
  assert.match(editor.render(40).join("\n"), /\x1b\[7mc\x1b\[0m/);
});

function createEditor(
  writes: string[] = [],
  matches: (data: string, action: string) => boolean = () => false,
): VimPiEditor {
  const fakeTui = {
    terminal: { rows: 24, write: (data: string) => writes.push(data) },
    requestRender: () => {},
    setShowHardwareCursor: () => {},
  };
  const fakeTheme = { borderColor: (value: string) => value, selectList: {} };
  const fakeKeybindings = { matches };
  return new VimPiEditor(
    fakeTui as never,
    fakeTheme as never,
    fakeKeybindings as never,
  );
}
